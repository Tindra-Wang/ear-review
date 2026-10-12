import { Body, Controller, Get, Post, Patch, Query, Param, Req, Res, Inject, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ASPECTS, type ImportPreview, type PreviewRow, type Analysis, type Opinion, type Job, type Sentiment } from '../../../packages/contracts/index.js';
import { analyze, MODEL } from '../../../packages/nlp/index.js';
import { Store, fingerprint } from './store.js';
import { Auth } from './auth.js';
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('请求应为 JSON 对象'); return value as Record<string, unknown>; }
function string(value: unknown, field: string, max = 1000): string { if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max) throw new BadRequestException(`${field}不能为空且最多 ${max} 字`); return value.trim(); }
function id(value: string | unknown): number { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new BadRequestException('ID 无效'); return n; }
export function csvCell(value: unknown) { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
@Controller('api')
export class ApiController {
  private previews = new Map<string, { data: ImportPreview; expiry: number; owner: string; name: string; source: string }>();
  private activeWorker: Worker | null = null;
  private activeJob: number | null = null;
  private stopping = false;
  private requests = new Map<string, { count: number; until: number }>();
  constructor(@Inject('STORE') private store: Store, @Inject('AUTH') private auth: Auth) {}
  @Get('health') health() { return { app: 'ear-review', status: 'ok', modelVersion: MODEL.version, dataMode: '教学样例 + 用户导入' }; }
  @Get('model') model() {
    const path = resolve('data/evaluation.json');
    const evaluation = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    return { version: MODEL.version, algorithm: '字符 n-gram 多项式朴素贝叶斯 + 领域规则', trainingExamples: MODEL.trainingExamples, dataKind: MODEL.dataKind, evaluation: evaluation?.version === MODEL.version ? evaluation : null, limitations: ['反讽、隐含方面和跨句指代可能识别错误', '教学语料结果不能代表真实消费者评论效果', '分数未进行概率校准，不展示为正确概率'] };
  }
  @Post('auth/login') login(@Body() body: unknown, @Req() req: Request) { const data = object(body); return { token: this.auth.login(string(data.username, '账号', 60), string(data.password, '密码', 200), req.ip ?? 'local'), username: 'admin' }; }
  @Get('auth/me') me(@Req() req: Request) { return { username: this.auth.require(req) }; }
  @Post('auth/logout') logout(@Req() req: Request) { this.auth.logout(req); return { ok: true }; }
  @Get('products') products() { return this.store.products(); }
  @Post('products') addProduct(@Body() body: unknown, @Req() req: Request) {
    this.auth.require(req); const data = object(body); const productId = string(data.id, '产品 ID', 40);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(productId)) throw new BadRequestException('产品 ID 使用小写字母、数字、下划线或短横线');
    if (this.store.products().some(p => p.id === productId)) throw new BadRequestException('产品 ID 已存在');
    this.store.run('INSERT INTO products VALUES(?,?,?,?)', productId, string(data.name, '产品名称', 80), typeof data.subtitle === 'string' ? data.subtitle.slice(0, 120) : '', '用户创建'); return this.store.products();
  }
  @Patch('products/:id') updateProduct(@Param('id') productId: string, @Body() body: unknown, @Req() req: Request) {
    this.auth.require(req); if (!this.store.products().some(p => p.id === productId)) throw new NotFoundException('产品不存在');
    const data = object(body); this.store.run('UPDATE products SET name=?,subtitle=? WHERE id=?', string(data.name,'产品名称',80), typeof data.subtitle === 'string' ? data.subtitle.slice(0,120) : '', productId); return this.store.products();
  }
  @Post('analyze') analyzeText(@Body() body: unknown, @Req() req: Request) {
    const key = req.ip ?? 'local'; const current = this.requests.get(key); const entry = current && current.until > Date.now() ? current : { count: 0, until: Date.now() + 60_000 };
    if (++entry.count > 60) throw new HttpException('分析请求过于频繁，请稍后重试', 429); this.requests.set(key, entry);
    const data = object(body); const text = string(data.text, '评论', 1000); const mode = data.mode === 'rules' ? 'rules' : 'hybrid'; return analyze(text, mode);
  }
  @Get('reviews') reviews(@Query() query: Record<string, string>) {
    const productId = query.productId; const aspect = query.aspect; const sentiment = query.sentiment;
    const page = Math.max(1, Number(query.page) || 1); const size = Math.min(50, Math.max(1, Number(query.size) || 10));
    let rows = this.store.reviews(productId, query.pure === 'true');
    if (query.search) rows = rows.filter(r => r.text.includes(query.search!));
    if (aspect || sentiment || query.pending === 'true' || query.corrected === 'true') rows = rows.filter(r => r.opinions.some(o => (!aspect || o.aspect === aspect) && (!sentiment || (o.status === 'classified' && o.sentiment === sentiment)) && (query.pending !== 'true' || o.status === 'review') && (query.corrected !== 'true' || o.corrected)));
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, size };
  }
  @Get('products/:id/stats') stats(@Param('id') productId: string, @Query('pure') pure: string) { const stats = this.store.stats(productId, pure === 'true'); if (!stats) throw new NotFoundException('产品不存在'); return stats; }
  @Get('compare') compare(@Query('ids') ids: string) { const selected = [...new Set((ids ?? '').split(',').filter(Boolean))]; if (selected.length < 2 || selected.length > 3) throw new BadRequestException('请选择 2～3 款产品'); return selected.map(productId => { const stats = this.store.stats(productId); if (!stats) throw new NotFoundException('产品不存在'); return stats; }); }
  @Patch('reviews/:id/correction') correct(@Param('id') reviewId: string, @Body() body: unknown, @Req() req: Request) {
    const actor = this.auth.require(req); const review = this.store.review(id(reviewId)); if (!review) throw new NotFoundException('评论不存在');
    if (!review.analyzed) throw new BadRequestException('请先分析评论');
    const data = object(body); const aspect = ASPECTS.find(a => a.id === data.aspect)?.id; if (!aspect) throw new BadRequestException('评价方面无效');
    if (!['positive','negative','neutral','mixed'].includes(String(data.sentiment))) throw new BadRequestException('情感标签无效');
    const evidenceText = string(data.evidence, '原文证据', 1000); const start = review.text.indexOf(evidenceText); if (start < 0) throw new BadRequestException('证据必须是原文中的真实片段');
    const sentiment = data.sentiment as Sentiment;
    const correction: Opinion = { aspect, sentiment, status: 'classified', method: '人工复核', evidence: [{ start, end: start + evidenceText.length, text: evidenceText, sentiment: sentiment === 'mixed' ? 'neutral' : sentiment }] };
    this.store.run('INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)', review.id, MODEL.version, aspect, JSON.stringify(correction), string(data.reason, '复核理由', 300), actor, new Date().toISOString());
    return this.store.review(review.id);
  }
  @Get('reviews/:id/history') history(@Param('id') reviewId: string, @Req() req: Request) { this.auth.require(req); return this.store.all('SELECT aspect,result,reason,actor,created_at createdAt FROM corrections WHERE review_id=? ORDER BY id DESC', id(reviewId)); }
  @Post('imports/preview') preview(@Body() body: unknown, @Req() req: Request) {
    const owner = this.auth.require(req); const data = object(body); const csv = string(data.csv, 'CSV 内容', 5_300_000);
    if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new BadRequestException('文件不能超过 5 MB');
    let records: Record<string, string>[];
    try { records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, max_record_size: 10_000, relax_column_count: false }) as Record<string, string>[]; } catch { throw new BadRequestException('CSV 格式错误，请使用模板并检查引号和列数'); }
    if (!records.length || records.length > 5000) throw new BadRequestException('请导入 1～5000 行评论');
    if (!['productId','reviewId','text'].every(key => key in records[0]!)) throw new BadRequestException('缺少 productId、reviewId 或 text 列');
    const products = new Set(this.store.products().map(p => p.id)); const seenId = new Set<string>(); const seenText = new Set<string>();
    const rows: PreviewRow[] = records.map((record, i) => {
      const errors: string[] = []; const productId = record.productId?.trim() ?? ''; const reviewId = record.reviewId?.trim() ?? ''; const text = record.text?.trim() ?? '';
      if (!products.has(productId)) errors.push('产品 ID 不存在'); if (!reviewId || reviewId.length > 100) errors.push('评论 ID 为空或超长'); if (!text) errors.push('评论为空'); if (Array.from(text).length > 1000) errors.push('评论超过 1000 字');
      const idKey = `${productId}\0${reviewId}`; const hash = fingerprint(text); const textKey = `${productId}\0${hash}`;
      const duplicate = seenId.has(idKey) || seenText.has(textKey) || !!this.store.one('SELECT id FROM reviews WHERE product_id=? AND (external_id=? OR fingerprint=?)', productId, reviewId, hash);
      if (!errors.length) { seenId.add(idKey); seenText.add(textKey); }
      return { row: i + 2, productId, reviewId, text, source: record.source?.trim().slice(0, 200) ?? '', isSynthetic: data.isSynthetic === true, valid: !errors.length, duplicate, errors };
    });
    for (const [key, preview] of this.previews) if (preview.expiry < Date.now()) this.previews.delete(key);
    if (this.previews.size >= 30) throw new BadRequestException('待提交预览过多，请稍后重试');
    const token = randomBytes(24).toString('hex'); const result = { rows, valid: rows.filter(r => r.valid && !r.duplicate).length, invalid: rows.filter(r => !r.valid).length, duplicates: rows.filter(r => r.valid && r.duplicate).length, token };
    this.previews.set(token, { data: result, expiry: Date.now() + 15 * 60_000, owner, name: typeof data.name === 'string' ? data.name.slice(0, 120) : 'CSV 导入', source: string(data.source, '数据来源说明', 200) }); return result;
  }
  @Post('imports/commit') commit(@Body() body: unknown, @Req() req: Request) {
    const owner = this.auth.require(req); const data = object(body); const token = string(data.token, '预览标识', 100); const preview = this.previews.get(token);
    if (!preview || preview.expiry < Date.now() || preview.owner !== owner) throw new BadRequestException('预览已过期或已提交，请重新预览');
    if (!preview.data.valid) throw new BadRequestException('没有可导入的有效评论');
    const imported = this.store.importRows(preview.data.rows, preview.name, preview.source); this.previews.delete(token); return imported;
  }
  @Get('batches') batches(@Req() req: Request) { this.auth.require(req); return this.store.batches(); }
  @Get('jobs') jobs(@Req() req: Request) { this.auth.require(req); return this.store.jobs(); }
  @Post('jobs') createJob(@Body() body: unknown, @Req() req: Request) {
    this.auth.require(req); const data = object(body); const batchId = id(data.batchId);
    const rows = this.store.all<{ id: number }>('SELECT id FROM reviews WHERE batch_id=?', batchId); if (!rows.length) throw new BadRequestException('批次没有可分析的评论');
    const previous = this.store.one<Job>('SELECT id,status FROM jobs WHERE batch_id=? AND version=? ORDER BY id DESC LIMIT 1', batchId, MODEL.version);
    if (previous && previous.status !== 'failed') return this.store.jobs().find(j => j.id === previous.id);
    const job = this.store.run("INSERT INTO jobs(batch_id,status,total,processed,version,created_at) VALUES(?,'queued',?,0,?,?)", batchId, rows.length, MODEL.version, new Date().toISOString()); this.pump(); return this.store.jobs().find(j => j.id === Number(job.lastInsertRowid));
  }
  private pump() {
    if (this.activeWorker || this.stopping) return;
    const job = this.store.one<{ id: number; batch_id: number }>("SELECT id,batch_id FROM jobs WHERE status='queued' ORDER BY id LIMIT 1"); if (!job) return;
    const rows = this.store.all<{ id: number; text: string }>('SELECT id,text FROM reviews WHERE batch_id=? ORDER BY id', job.batch_id);
    this.store.run("UPDATE jobs SET status='running' WHERE id=?", job.id); this.activeJob = job.id;
    const isTs = import.meta.url.endsWith('.ts');
    const worker = new Worker(new URL(isTs ? './analysis-worker.ts' : './analysis-worker.js', import.meta.url), { workerData: rows, ...(isTs ? { execArgv: ['--import', 'tsx'] } : {}) });
    this.activeWorker = worker; let completed = false;
    worker.on('message', (message: { id?: number; result?: Analysis; done?: boolean }) => {
      try {
        if (message.done) { completed = true; this.store.run("UPDATE jobs SET status='completed',error=NULL WHERE id=?", job.id); }
        else if (message.id && message.result) this.store.transaction(() => { this.store.savePrediction(message.id!, message.result!); this.store.run('UPDATE jobs SET processed=processed+1 WHERE id=?', job.id); });
      } catch (error) { this.store.run("UPDATE jobs SET status='failed',error=? WHERE id=?", String(error), job.id); void worker.terminate(); }
    });
    worker.on('error', error => this.store.run("UPDATE jobs SET status='failed',error=? WHERE id=?", error.message, job.id));
    worker.on('exit', () => { if (!completed) this.store.run("UPDATE jobs SET status='failed',error=coalesce(error,'分析进程中断，请重试') WHERE id=?", job.id); this.activeWorker = null; this.activeJob = null; this.pump(); });
  }
  async onModuleDestroy() { this.stopping = true; if (this.activeWorker) { const worker = this.activeWorker; this.activeWorker = null; await worker.terminate(); } this.store.close(); }
  @Get('export') export(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    this.auth.require(req); const headers = ['reviewId','productId','text','source','isSynthetic','aspect','sentiment','status','evidence','modelVersion','corrected']; const rows: unknown[][] = [headers];
    for (const review of this.store.reviews(query.productId, query.pure === 'true')) {
      if (query.search && !review.text.includes(query.search)) continue;
      if (!review.opinions.length && !query.aspect && !query.sentiment && query.pending !== 'true' && query.corrected !== 'true') rows.push([review.externalId,review.productId,review.text,review.source,review.isSynthetic,'','',review.analyzed ? 'not-mentioned' : 'unanalyzed','',MODEL.version,false]);
      for (const opinion of review.opinions) {
        if (query.aspect && query.aspect !== opinion.aspect) continue;
        if (query.sentiment && (opinion.status !== 'classified' || query.sentiment !== opinion.sentiment)) continue;
        if (query.pending === 'true' && opinion.status !== 'review') continue;
        if (query.corrected === 'true' && !opinion.corrected) continue;
        rows.push([review.externalId,review.productId,review.text,review.source,review.isSynthetic,opinion.aspect,opinion.sentiment,opinion.status,opinion.evidence.map(e => e.text).join('；'),MODEL.version,!!opinion.corrected]);
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="ear-review-results.csv"'); res.send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  }
}
