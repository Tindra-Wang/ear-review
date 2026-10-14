import type { Product } from '../../../../packages/contracts/index.js';
import type { SqliteDatabase } from '../sqlite-database.js';
export class ProductRepository {
    constructor(private db: SqliteDatabase) { }
    all(): Product[] { return this.db.all<Product>('SELECT p.*, count(r.id) count FROM products p LEFT JOIN reviews r ON r.product_id=p.id GROUP BY p.id ORDER BY p.rowid'); }
    create(id: string, name: string, subtitle: string, source: string, ignore = false) { return this.db.run(`INSERT ${ignore ? 'OR IGNORE ' : ''}INTO products VALUES(?,?,?,?)`, id, name, subtitle, source); }
    update(id: string, name: string, subtitle: string) { return this.db.run('UPDATE products SET name=?,subtitle=? WHERE id=?', name, subtitle, id); }
}
