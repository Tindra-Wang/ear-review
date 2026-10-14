import { BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import type { Store } from '../store.js';
import { object, string, id } from '../request-validation.js';
import { collectionTarget, collectPublic, collectionCsv } from '../collector.js';
import { BrowserCollector } from '../browser-collector.js';
export class CollectionService {
    private collecting = false;
    private stopping = false;
    private browserRuns = new Set<number>();
    constructor(private store: Pick<Store, 'collectionRepository' | 'products'>, public browserCollector = new BrowserCollector()) { }
    collections() { return this.store.collectionRepository.list().map(job => ({ ...job, autoRunning: this.browserRuns.has(job.id) })); }
    collectionDownload(value: string) {
        const row = this.store.collectionRepository.download(id(value));
        if (!row)
            throw new NotFoundException('采集任务不存在');
        if (!row.csv)
            throw new BadRequestException('没有可下载评论，请查看采集状态');
        return row.csv;
    }
    collectionData(value: string) {
        const row = this.store.collectionRepository.data(id(value));
        if (!row)
            throw new NotFoundException('采集任务不存在');
        if (!row.csv)
            throw new BadRequestException('没有可导入的评论');
        return row;
    }
    createCollection(body: unknown) {
        if (this.collecting)
            throw new HttpException('已有采集进行中，请等待完成', 409);
        const data = object(body);
        const method = data.method ?? 'public';
        if (method !== 'public' && method !== 'browser')
            throw new BadRequestException('采集方式无效');
        const limit = Number(data.limit ?? 50);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new BadRequestException('公开采集每次限制1～100条');
        let target;
        try {
            target = collectionTarget(data.platform, data.url);
        }
        catch (e) {
            throw new BadRequestException((e as Error).message);
        }
        const suppliedProduct = typeof data.productId === 'string' && data.productId.trim() ? string(data.productId, '目标耳机', 40) : undefined;
        if (data.productId != null && typeof data.productId !== 'string')
            throw new BadRequestException('目标耳机编号格式不正确');
        const productId = suppliedProduct ?? `${target.platform}-${target.itemId}`;
        const name = data.productName == null || data.productName === '' ? `${target.platform === 'jd' ? '京东' : '天猫'}商品 ${target.itemId}` : string(data.productName, '耳机名称', 80);
        if (suppliedProduct && !this.store.products().some(p => p.id === productId))
            throw new BadRequestException('目标耳机已不存在，请刷新列表或按商品链接创建');
        const jobId = this.store.collectionRepository.create(productId, name, target, limit, method, !suppliedProduct);
        this.collecting = true;
        if (method === 'browser') {
            const onClose = () => { if (!this.stopping)
                this.store.collectionRepository.closed(jobId); this.collecting = false; };
            void this.browserCollector.open(jobId, target, limit, onClose).then(() => { if (!this.stopping)
                this.startBrowserRun(jobId); }).catch(error => { if (!this.stopping)
                this.store.collectionRepository.mark(jobId, 'failed', (error as Error).message); this.collecting = false; });
            return this.collections().find(j => j.id === jobId);
        }
        void collectPublic(target, limit, total => this.store.collectionRepository.progress(jobId, total)).then(result => {
            const csv = result.rows.length ? collectionCsv(productId, target, result.rows) : '';
            this.store.collectionRepository.publicResult(jobId, result.status, result.rows.length, result.error || null, csv);
        }).catch(error => this.store.collectionRepository.mark(jobId, 'failed', String(error))).finally(() => { this.collecting = false; });
        return this.collections().find(j => j.id === jobId);
    }
    async readBrowser(value: string) {
        const job = this.store.collectionRepository.get(id(value));
        if (!job)
            throw new NotFoundException('采集任务不存在');
        if (job.method !== 'browser' || job.status !== 'waiting')
            throw new BadRequestException('浏览器任务尚未就绪或已结束');
        try {
            const result = await this.browserCollector.read(id(value));
            const csv = collectionCsv(job.productId, collectionTarget(job.platform, job.url), result.rows, 'browser');
            this.store.collectionRepository.progress(id(value), result.rows.length, csv, true);
            return { added: result.added, total: result.rows.length, limitReached: result.limitReached };
        }
        catch (error) {
            this.store.collectionRepository.error(id(value), (error as Error).message);
            throw new BadRequestException((error as Error).message);
        }
    }
    async finishBrowser(value: string) {
        const job = this.collections().find(j => j.id === id(value));
        if (!job)
            throw new NotFoundException('采集任务不存在');
        if (job.method !== 'browser' || job.status !== 'waiting')
            throw new BadRequestException('浏览器任务尚未就绪或已结束');
        await this.browserCollector.close(job.id);
        this.store.collectionRepository.mark(job.id, job.total ? 'completed' : 'blocked', job.total ? null : '未读取到评论；请登录并打开评价区后重新尝试');
        this.collecting = false;
        return this.collections().find(j => j.id === job.id);
    }
    autoBrowser(value: string) {
        const job = this.collections().find(j => j.id === id(value));
        if (!job || job.method !== 'browser' || job.status !== 'waiting')
            throw new BadRequestException('采集窗口未就绪或正在采集');
        if (this.browserRuns.has(job.id))
            throw new BadRequestException('任务已自动运行，完成登录后会自动继续');
        this.startBrowserRun(job.id);
        return this.collections().find(j => j.id === job.id);
    }
    private startBrowserRun(jobId: number) {
        const job = this.store.collectionRepository.get(jobId);
        if (!job || this.browserRuns.has(jobId))
            return;
        this.browserRuns.add(jobId);
        this.store.collectionRepository.mark(job.id, 'running', null);
        const save = (rows: import('../collector.js').CollectedReview[]) => { if (!this.stopping)
            this.store.collectionRepository.progress(job.id, rows.length, collectionCsv(job.productId, collectionTarget(job.platform, job.url), rows, 'browser')); };
        const waiting = (message: string | null) => { if (!this.stopping)
            this.store.collectionRepository.mark(job.id, message ? 'waiting' : 'running', message, true); };
        void this.browserCollector.automate(job.id, save, waiting).then(async (result) => { await this.browserCollector.close(job.id); if (!this.stopping)
            this.store.collectionRepository.mark(job.id, result.rows.length >= job.requested ? 'completed' : 'partial', result.rows.length < job.requested ? result.reason : null, true); this.collecting = false; }).catch(error => { if (!this.stopping)
            this.store.collectionRepository.mark(job.id, 'waiting', (error as Error).message, true); }).finally(() => this.browserRuns.delete(job.id));
    }
    async stop() { this.stopping = true; await this.browserCollector.closeAll(); }
}
