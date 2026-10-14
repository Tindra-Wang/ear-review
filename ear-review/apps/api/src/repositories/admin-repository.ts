import type { SqliteDatabase } from '../sqlite-database.js';
export class AdminRepository {
    constructor(private db: SqliteDatabase) { }
    get(username: string) { return this.db.one<{
        password_hash: string;
    }>('SELECT password_hash FROM admins WHERE username=?', username); }
    create(username: string, hash: string) { return this.db.run('INSERT INTO admins VALUES(?,?)', username, hash); }
}
