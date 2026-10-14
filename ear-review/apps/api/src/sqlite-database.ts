import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeDatabase } from './database-bootstrap.js';
export const RUNTIME_DIR = resolve(process.env.DATA_DIR ?? 'data/runtime');
export class SqliteDatabase {
    db: DatabaseSync;
    constructor(path = resolve(RUNTIME_DIR, 'ear-review.sqlite')) { mkdirSync(RUNTIME_DIR, { recursive: true }); this.db = new DatabaseSync(path); initializeDatabase(this); }
    one<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
    all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as T[]; }
    run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
    transaction<T>(action: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try {
        const result = action();
        this.db.exec('COMMIT');
        return result;
    }
    catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
    } }
    close() { this.db.close(); }
}
