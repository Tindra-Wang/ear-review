import type { Analysis, Job } from '../../../../packages/contracts/index.js';
import type { SqliteDatabase } from '../sqlite-database.js';
import type { ReviewRepository } from './review-repository.js';
export class JobRepository {
    constructor(private db: SqliteDatabase, private reviews: Pick<ReviewRepository, 'savePrediction'>) { }
    list(): Job[] { return this.db.all<Job>('SELECT id,batch_id batchId,status,total,processed,error,version modelVersion,created_at createdAt FROM jobs ORDER BY id DESC LIMIT 30'); }
    errors(id: number) { return this.db.all<{
        reviewId: number;
        message: string;
    }>('SELECT review_id reviewId,message FROM job_errors WHERE job_id=?', id); }
    rows(batch: number) { return this.db.all<{
        id: number;
        text: string;
    }>('SELECT id,text FROM reviews WHERE batch_id=? ORDER BY id', batch); }
    previous(batch: number, version: string) { return this.db.one<Job>('SELECT id,status FROM jobs WHERE batch_id=? AND version=? ORDER BY id DESC LIMIT 1', batch, version); }
    create(batch: number, total: number, version: string) { return Number(this.db.run("INSERT INTO jobs(batch_id,status,total,processed,version,created_at) VALUES(?,'queued',?,0,?,?)", batch, total, version, new Date().toISOString()).lastInsertRowid); }
    next() { return this.db.one<{
        id: number;
        batch_id: number;
        version: string;
    }>("SELECT id,batch_id,version FROM jobs WHERE status='queued' ORDER BY id LIMIT 1"); }
    start(id: number) { this.db.run("UPDATE jobs SET status='running' WHERE id=?", id); }
    finish(id: number, failures: number) { this.db.run('UPDATE jobs SET status=?,error=? WHERE id=?', failures ? 'failed' : 'completed', failures ? `${failures} 条失败，可重试；已成功的结果保留` : null, id); }
    failure(id: number, message: string) { this.db.run("UPDATE jobs SET status='failed',error=? WHERE id=?", message, id); }
    interrupted(id: number) { this.db.run("UPDATE jobs SET status='failed',error=coalesce(error,'分析进程中断，请重试') WHERE id=?", id); }
    recordError(job: number, review: number, message: string) { this.db.transaction(() => { this.db.run('INSERT OR REPLACE INTO job_errors VALUES(?,?,?)', job, review, message); this.db.run('UPDATE jobs SET processed=processed+1,error=? WHERE id=?', message, job); }); }
    recordSuccess(job: number, review: number, result: Analysis) { this.db.transaction(() => { this.reviews.savePrediction(review, result); this.db.run('UPDATE jobs SET processed=processed+1 WHERE id=?', job); }); }
}
