import type { CollectionJob } from '../../../../packages/contracts/index.js';
import type { SqliteDatabase } from '../sqlite-database.js';
import type { ProductRepository } from './product-repository.js';
export class CollectionRepository {
    constructor(private db: SqliteDatabase, private products: Pick<ProductRepository, 'create'>) { }
    list() { return this.db.all<CollectionJob>('SELECT id,product_id productId,platform,item_id itemId,url,method,status,requested,total,error,created_at createdAt,updated_at updatedAt FROM collections ORDER BY id DESC LIMIT 30'); }
    get(id: number) { return this.db.one<CollectionJob>('SELECT id,product_id productId,platform,item_id itemId,url,method,status,requested,total,error,created_at createdAt,updated_at updatedAt FROM collections WHERE id=?', id); }
    download(id: number) { return this.db.one<{
        csv: string;
        status: string;
    }>('SELECT csv,status FROM collections WHERE id=?', id); }
    data(id: number) { return this.db.one<{
        csv: string;
        productId: string;
        url: string;
        platform: string;
    }>('SELECT csv,product_id productId,url,platform FROM collections WHERE id=?', id); }
    create(productId: string, name: string, target: {
        platform: string;
        itemId: string;
        url: string;
    }, limit: number, method: string, createProduct: boolean) { return this.db.transaction(() => { if (createProduct)
        this.products.create(productId, name, `商品编号 ${target.itemId}`, target.url, true); const now = new Date().toISOString(); return Number(this.db.run("INSERT INTO collections(product_id,platform,item_id,url,status,requested,created_at,updated_at,method) VALUES(?,?,?,?,'running',?,?,?,?)", productId, target.platform, target.itemId, target.url, limit, now, now, method).lastInsertRowid); }); }
    progress(id: number, total: number, csv?: string, clearError = false) { if (csv === undefined)
        this.db.run('UPDATE collections SET total=?,updated_at=? WHERE id=?', total, new Date().toISOString(), id);
    else
        this.db.run(`UPDATE collections SET total=?,csv=?,updated_at=?${clearError ? ',error=NULL' : ''} WHERE id=?`, total, csv, new Date().toISOString(), id); }
    mark(id: number, status: CollectionJob['status'], error: string | null, activeOnly = false) { this.db.run(`UPDATE collections SET status=?,error=?,updated_at=? WHERE id=?${activeOnly ? " AND status IN ('running','waiting')" : ''}`, status, error, new Date().toISOString(), id); }
    error(id: number, error: string) { this.db.run('UPDATE collections SET error=? WHERE id=?', error, new Date().toISOString(), id); }
    closed(id: number) { this.db.run("UPDATE collections SET status=CASE WHEN total>0 THEN 'partial' ELSE 'blocked' END,error='采集Chrome已关闭或会话到期；已读取内容保留',updated_at=? WHERE id=? AND status IN ('running','waiting')", new Date().toISOString(), id); }
    publicResult(id: number, status: string, total: number, error: string | null, csv: string) { this.db.run('UPDATE collections SET status=?,total=?,error=?,csv=?,updated_at=? WHERE id=?', status, total, error, csv, new Date().toISOString(), id); }
}
