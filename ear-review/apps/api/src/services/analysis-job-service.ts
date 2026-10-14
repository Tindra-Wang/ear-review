import { BadRequestException, HttpException } from '@nestjs/common';
import type { Store } from '../store.js';
import { object, string, id } from '../request-validation.js';
import { Worker } from 'node:worker_threads';
import type { Analysis } from '../../../../packages/contracts/index.js';
import { analysisEngine, engineModeForVersion } from '../../../../packages/nlp/engines.js';
export class AnalysisJobService {
    private activeWorker: Worker | null = null;
    private activeJob: number | null = null;
    private stopping = false;
    constructor(private store: Pick<Store, 'jobRepository' | 'jobs'>) { }
    jobs() { return this.store.jobs(); }
    jobErrors(jobId: string) { return this.store.jobRepository.errors(id(jobId)); }
    async createJob(body: unknown) {
        const data = object(body);
        const batchId = id(data.batchId);
        const semantic = data.mode === 'semantic';
        const engine = analysisEngine(semantic ? 'semantic' : 'hybrid');
        const version = engine.version;
        if (semantic) {
            const state = await engine.readiness();
            if (!state.ready)
                throw new HttpException(state.message, 503);
        }
        const rows = this.store.jobRepository.rows(batchId);
        if (!rows.length)
            throw new BadRequestException('批次没有可分析的评论');
        const previous = this.store.jobRepository.previous(batchId, version);
        if (previous && previous.status !== 'failed')
            return this.store.jobs().find(j => j.id === previous.id);
        const job = this.store.jobRepository.create(batchId, rows.length, version);
        this.pump();
        return this.store.jobs().find(j => j.id === job);
    }
    private pump() {
        if (this.activeWorker || this.stopping)
            return;
        const job = this.store.jobRepository.next();
        if (!job)
            return;
        const rows = this.store.jobRepository.rows(job.batch_id);
        this.store.jobRepository.start(job.id);
        this.activeJob = job.id;
        const isTs = import.meta.url.endsWith('.ts');
        const worker = new Worker(new URL(isTs ? '../analysis-worker.ts' : '../analysis-worker.js', import.meta.url), { workerData: { rows, version: job.version, semantic: engineModeForVersion(job.version) === 'semantic' }, ...(isTs ? { execArgv: ['--import', 'tsx'] } : {}) });
        this.activeWorker = worker;
        let completed = false;
        worker.on('message', (message: {
            id?: number;
            result?: Analysis;
            done?: boolean;
            error?: string;
            failures?: number;
        }) => {
            try {
                if (message.done) {
                    completed = true;
                    this.store.jobRepository.finish(job.id, message.failures ?? 0);
                }
                else if (message.error && message.id)
                    this.store.jobRepository.recordError(job.id, message.id!, message.error!);
                else if (message.id && message.result)
                    this.store.jobRepository.recordSuccess(job.id, message.id!, message.result!);
            }
            catch (error) {
                this.store.jobRepository.failure(job.id, String(error));
                void worker.terminate();
            }
        });
        worker.on('error', error => this.store.jobRepository.failure(job.id, error.message));
        worker.on('exit', () => { if (!completed)
            this.store.jobRepository.interrupted(job.id); this.activeWorker = null; this.activeJob = null; this.pump(); });
    }
    async stop() { this.stopping = true; if (this.activeWorker) {
        const worker = this.activeWorker;
        this.activeWorker = null;
        await worker.terminate();
    } }
}
