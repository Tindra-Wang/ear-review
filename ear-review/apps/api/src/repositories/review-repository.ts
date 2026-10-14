import type { Analysis, Opinion, Review } from '../../../../packages/contracts/index.js';
import type { SqliteDatabase } from '../sqlite-database.js';
interface ReviewRow {
    id: number;
    external_id: string;
    product_id: string;
    text: string;
    source: string;
    synthetic: number;
    result?: string;
    version?: string;
}
export class ReviewRepository {
    constructor(private db: SqliteDatabase, private baselineVersion: string) { }
    list(productId?: string, pure = false, reviewId?: number): Review[] {
        const conditions: string[] = [];
        const args: (string | number)[] = [];
        if (productId) {
            conditions.push('r.product_id=?');
            args.push(productId);
        }
        if (reviewId !== undefined) {
            conditions.push('r.id=?');
            args.push(reviewId);
        }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const rows = this.db.all<ReviewRow>(`SELECT r.*,p.result,p.version FROM reviews r LEFT JOIN predictions p ON p.rowid=(SELECT rowid FROM predictions WHERE review_id=r.id ORDER BY updated_at DESC,rowid DESC LIMIT 1)${where} ORDER BY r.id DESC`, ...args);
        const corrections = pure ? [] : this.db.all<{
            review_id: number;
            version: string;
            result: string;
        }>(`SELECT c.review_id,c.version,c.result FROM corrections c JOIN reviews r ON r.id=c.review_id${where} ORDER BY c.id`, ...args);
        const grouped = new Map<string, string[]>();
        for (const c of corrections) {
            const key = JSON.stringify([c.review_id, c.version]);
            const values = grouped.get(key) ?? [];
            values.push(c.result);
            grouped.set(key, values);
        }
        return rows.map(row => {
            let opinions: Opinion[] = row.result ? (JSON.parse(row.result) as Analysis).opinions : [];
            for (const value of grouped.get(JSON.stringify([row.id, row.version ?? this.baselineVersion])) ?? []) {
                const corrected = JSON.parse(value) as Opinion;
                const original = opinions.find(o => o.aspect === corrected.aspect);
                opinions = [...opinions.filter(o => o.aspect !== corrected.aspect), { ...corrected, corrected: true, original: original?.original ?? original }];
            }
            return { id: row.id, externalId: row.external_id, productId: row.product_id, text: row.text, source: row.source, isSynthetic: !!row.synthetic, opinions, analyzed: !!row.result, modelVersion: row.version };
        });
    }
    get(id: number, pure = false) { return this.list(undefined, pure, id)[0]; }
    savePrediction(id: number, result: Analysis) { this.db.run('INSERT INTO predictions(review_id,version,result,updated_at) VALUES(?,?,?,?) ON CONFLICT(review_id,version) DO UPDATE SET result=excluded.result,updated_at=excluded.updated_at', id, result.modelVersion, JSON.stringify(result), new Date().toISOString()); }
    duplicate(productId: string, externalId: string, hash: string) { return !!this.db.one('SELECT id FROM reviews WHERE product_id=? AND (external_id=? OR fingerprint=?)', productId, externalId, hash); }
    correct(reviewId: number, version: string, aspect: string, result: Opinion, reason: string, actor: string) { this.db.run('INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)', reviewId, version, aspect, JSON.stringify(result), reason, actor, new Date().toISOString()); }
    history(id: number) { return this.db.all('SELECT aspect,result,reason,actor,created_at createdAt FROM corrections WHERE review_id=? ORDER BY id DESC', id); }
}
