import type { SqliteDatabase } from './sqlite-database.js';
export function initializeDatabase(db: SqliteDatabase) {
    db.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
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
    if (!db.all<{
        name: string;
    }>('PRAGMA table_info(batches)').some(column => column.name === 'summary'))
        db.db.exec("ALTER TABLE batches ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'");
    if (!db.all<{
        name: string;
    }>('PRAGMA table_info(predictions)').some(column => column.name === 'updated_at'))
        db.db.exec("ALTER TABLE predictions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    db.db.exec('CREATE TABLE IF NOT EXISTS job_errors(job_id INTEGER NOT NULL REFERENCES jobs(id),review_id INTEGER NOT NULL REFERENCES reviews(id),message TEXT NOT NULL,PRIMARY KEY(job_id,review_id))');
    db.db.exec(`CREATE TABLE IF NOT EXISTS collections(id INTEGER PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),platform TEXT NOT NULL,item_id TEXT NOT NULL,url TEXT NOT NULL,status TEXT NOT NULL,requested INTEGER NOT NULL,total INTEGER NOT NULL DEFAULT 0,error TEXT,csv TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
    if (!db.all<{
        name: string;
    }>('PRAGMA table_info(collections)').some(c => c.name === 'method'))
        db.db.exec("ALTER TABLE collections ADD COLUMN method TEXT NOT NULL DEFAULT 'public'");
    db.db.prepare("UPDATE collections SET status='failed',error='服务重启导致采集中断，请重试' WHERE status IN ('queued','running','waiting')").run();
    db.db.prepare("UPDATE jobs SET status='failed',error='服务重启导致任务中断，请重试' WHERE status IN ('queued','running')").run();
}
