import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ASPECTS, type Analysis, type AspectStat, type Opinion, type Product, type ProductStats, type Review, type PreviewRow, type Job } from '../../../packages/contracts/index.js';
import { analyze, MODEL } from '../../../packages/nlp/index.js';
import { DEMO_PRODUCTS, DEMO_REVIEWS } from '../../../data/demo.js';
export const RUNTIME_DIR = resolve(process.env.DATA_DIR ?? 'data/runtime');
export const fingerprint = (text: string) => createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).digest('hex');
export class Store {
  db: DatabaseSync;
  constructor(path = resolve(RUNTIME_DIR, 'ear-review.sqlite'), seed = true) {
    mkdirSync(RUNTIME_DIR, { recursive: true }); this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL, source TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS batches(id INTEGER PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), external_id TEXT NOT NULL, text TEXT NOT NULL, fingerprint TEXT NOT NULL, source TEXT NOT NULL, synthetic INTEGER NOT NULL, batch_id INTEGER REFERENCES batches(id), UNIQUE(product_id,external_id), UNIQUE(product_id,fingerprint));
      CREATE TABLE IF NOT EXISTS predictions(review_id INTEGER NOT NULL REFERENCES reviews(id), version TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(review_id,version));
      CREATE TABLE IF NOT EXISTS corrections(id INTEGER PRIMARY KEY, review_id INTEGER NOT NULL REFERENCES reviews(id), version TEXT NOT NULL, aspect TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id), status TEXT NOT NULL, total INTEGER NOT NULL, processed INTEGER NOT NULL DEFAULT 0, error TEXT, version TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS reviews_batch ON reviews(batch_id);
      CREATE INDEX IF NOT EXISTS correction_lookup ON corrections(review_id,version,id);
    `);
    if (!this.all<{ name: string }>('PRAGMA table_info(batches)').some(column => column.name === 'summary')) this.db.exec("ALTER TABLE batches ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'");
    this.db.prepare("UPDATE jobs SET status='failed',error='服务重启导致任务中断，请重试' WHERE status IN ('queued','running')").run();
    if (seed && !this.one<{ n: number }>('SELECT count(*) n FROM products')!.n) this.seed();
  }
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as T[]; }
  run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  transaction<T>(action: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = action(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  seed() {
    this.transaction(() => {
      const batch = this.run('INSERT INTO batches(name,source,created_at) VALUES(?,?,?)', '预置教学样例', '人工编写，非真实测评', new Date().toISOString());
      for (const product of DEMO_PRODUCTS) {
        this.run('INSERT INTO products VALUES(?,?,?,?)', product.id, product.name, product.subtitle, product.source);
        for (const [i, text] of DEMO_REVIEWS[product.id]!.entries()) {
          const row = this.run('INSERT INTO reviews(product_id,external_id,text,fingerprint,source,synthetic,batch_id) VALUES(?,?,?,?,?,?,?)', product.id, `demo-${i + 1}`, text, fingerprint(text), '教学合成样例', 1, Number(batch.lastInsertRowid));
          this.savePrediction(Number(row.lastInsertRowid), analyze(text));
        }
      }
    });
  }
  products(): Product[] { return this.all<Product>('SELECT p.*, count(r.id) count FROM products p LEFT JOIN reviews r ON r.product_id=p.id GROUP BY p.id ORDER BY p.rowid'); }
  savePrediction(id: number, result: Analysis) { this.run('INSERT INTO predictions VALUES(?,?,?) ON CONFLICT(review_id,version) DO UPDATE SET result=excluded.result', id, result.modelVersion, JSON.stringify(result)); }
  review(id: number, pure = false): Review | undefined {
    const row = this.one<{ id: number; external_id: string; product_id: string; text: string; source: string; synthetic: number; result?: string }>('SELECT r.*,p.result FROM reviews r LEFT JOIN predictions p ON p.review_id=r.id AND p.version=? WHERE r.id=?', MODEL.version, id);
    if (!row) return undefined;
    let opinions: Opinion[] = row.result ? (JSON.parse(row.result) as Analysis).opinions : [];
    if (!pure) {
      const corrections = this.all<{ result: string }>('SELECT result FROM corrections WHERE review_id=? AND version=? ORDER BY id', id, MODEL.version);
      for (const correction of corrections) {
        const corrected = JSON.parse(correction.result) as Opinion;
        const original = opinions.find(o => o.aspect === corrected.aspect);
        opinions = [...opinions.filter(o => o.aspect !== corrected.aspect), { ...corrected, corrected: true, original: original?.original ?? original }];
      }
    }
    return { id: row.id, externalId: row.external_id, productId: row.product_id, text: row.text, source: row.source, isSynthetic: !!row.synthetic, opinions, analyzed: !!row.result };
  }
  reviews(productId?: string, pure = false): Review[] {
    const rows = productId ? this.all<{ id: number }>('SELECT id FROM reviews WHERE product_id=? ORDER BY id DESC', productId) : this.all<{ id: number }>('SELECT id FROM reviews ORDER BY id DESC');
    return rows.map(r => this.review(r.id, pure)!);
  }
  stats(productId: string, pure = false): ProductStats | undefined {
    const product = this.products().find(p => p.id === productId); if (!product) return undefined;
    const reviews = this.reviews(productId, pure);
    const aspects: AspectStat[] = ASPECTS.map(a => {
      const stat: AspectStat = { aspect: a.id, total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, pending: 0, corrected: 0, positiveRatio: null, examples: [] };
      for (const review of reviews) {
        const opinion = review.opinions.find(o => o.aspect === a.id); if (!opinion) continue;
        if (opinion.status === 'review') stat.pending++; else { stat.total++; stat[opinion.sentiment]++; }
        if (opinion.corrected) stat.corrected++;
        if (stat.examples.length < 3) stat.examples.push(review);
      }
      stat.positiveRatio = stat.total ? Math.round(stat.positive / stat.total * 100) : null; return stat;
    });
    return { product, reviews: reviews.length, analyzed: reviews.filter(r => r.analyzed).length, synthetic: reviews.filter(r => r.isSynthetic).length, version: MODEL.version, aspects };
  }
  importRows(rows: PreviewRow[], name: string, source: string): { batchId: number; inserted: number; duplicates: number } {
    return this.transaction(() => {
      const batch = this.run('INSERT INTO batches(name,source,created_at) VALUES(?,?,?)', name, source, new Date().toISOString()); let inserted = 0; let duplicates = 0;
      for (const row of rows.filter(r => r.valid && !r.duplicate)) {
        const result = this.run('INSERT OR IGNORE INTO reviews(product_id,external_id,text,fingerprint,source,synthetic,batch_id) VALUES(?,?,?,?,?,?,?)', row.productId, row.reviewId, row.text, fingerprint(row.text), row.source || source, row.isSynthetic ? 1 : 0, Number(batch.lastInsertRowid));
        if (result.changes) inserted++; else duplicates++;
      }
      const summary = { submitted: rows.length, inserted, invalid: rows.filter(r => !r.valid).length, duplicates: duplicates + rows.filter(r => r.valid && r.duplicate).length, rejected: rows.filter(r => !r.valid || r.duplicate).map(r => ({ row: r.row, errors: r.errors, duplicate: r.duplicate })) };
      this.run('UPDATE batches SET summary=? WHERE id=?',JSON.stringify(summary),Number(batch.lastInsertRowid));
      return { batchId: Number(batch.lastInsertRowid), inserted, duplicates };
    });
  }
  jobs(): Job[] { return this.all<Job>('SELECT id,batch_id batchId,status,total,processed,error,version modelVersion,created_at createdAt FROM jobs ORDER BY id DESC LIMIT 30'); }
  batches() { return this.all<{ id: number; name: string; source: string; count: number; createdAt: string; summary: string }>('SELECT b.id,b.name,b.source,b.summary,b.created_at createdAt,count(r.id) count FROM batches b LEFT JOIN reviews r ON r.batch_id=b.id GROUP BY b.id ORDER BY b.id DESC').map(batch => ({ ...batch, summary: JSON.parse(batch.summary) as { submitted?: number; inserted?: number; invalid?: number; duplicates?: number; rejected?: unknown[] } })); }
  close() { this.db.close(); }
}
