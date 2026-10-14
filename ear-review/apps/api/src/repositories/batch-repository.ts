import type { SqliteDatabase } from '../sqlite-database.js';
import { fingerprint } from '../fingerprint.js';
export class BatchRepository {
    constructor(private db: SqliteDatabase) { }
    importRows(rows: PreviewRow[], name: string, source: string): {
        batchId: number;
        inserted: number;
        duplicates: number;
    } {
        return this.db.transaction(() => {
            const batch = this.db.run('INSERT INTO batches(name,source,created_at) VALUES(?,?,?)', name, source, new Date().toISOString());
            let inserted = 0;
            let duplicates = 0;
            for (const row of rows.filter(r => r.valid && !r.duplicate)) {
                const result = this.db.run('INSERT OR IGNORE INTO reviews(product_id,external_id,text,fingerprint,source,synthetic,batch_id) VALUES(?,?,?,?,?,?,?)', row.productId, row.reviewId, row.text, fingerprint(row.text), row.source || source, row.isSynthetic ? 1 : 0, Number(batch.lastInsertRowid));
                if (result.changes)
                    inserted++;
                else
                    duplicates++;
            }
            const summary = { submitted: rows.length, inserted, invalid: rows.filter(r => !r.valid).length, duplicates: duplicates + rows.filter(r => r.valid && r.duplicate).length, rejected: rows.filter(r => !r.valid || r.duplicate).map(r => ({ row: r.row, errors: r.errors, duplicate: r.duplicate })) };
            this.db.run('UPDATE batches SET summary=? WHERE id=?', JSON.stringify(summary), Number(batch.lastInsertRowid));
            return { batchId: Number(batch.lastInsertRowid), inserted, duplicates };
        });
    }
    batches() {
        const products = this.db.all<{
            batchId: number;
            id: string;
            name: string;
            count: number;
        }>('SELECT r.batch_id batchId,p.id,p.name,count(r.id) count FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.batch_id IS NOT NULL GROUP BY r.batch_id,p.id');
        return this.db.all<{
            id: number;
            name: string;
            source: string;
            count: number;
            createdAt: string;
            summary: string;
        }>('SELECT b.id,b.name,b.source,b.summary,b.created_at createdAt,count(r.id) count FROM batches b LEFT JOIN reviews r ON r.batch_id=b.id GROUP BY b.id ORDER BY b.id DESC').map(batch => ({ ...batch, products: products.filter(p => p.batchId === batch.id).map(({ id, name, count }) => ({ id, name, count })), summary: JSON.parse(batch.summary) as {
                submitted?: number;
                inserted?: number;
                invalid?: number;
                duplicates?: number;
                rejected?: unknown[];
            } }));
    }
}
import type { PreviewRow } from '../../../../packages/contracts/index.js';
