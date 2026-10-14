import { Body, Controller, Get, Post, Patch, Query, Param, Req, Res, Inject, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ASPECTS, type ImportPreview, type ColumnMapping, type Analysis, type Opinion, type Job, type Sentiment, type CollectionJob, type ProductSummary } from '../../../packages/contracts/index.js';
import { collectionTarget, collectPublic, collectionCsv } from './collector.js';
import {BrowserCollector} from './browser-collector.js';
import { analyze, MODEL } from '../../../packages/nlp/index.js';
import { analyzeSemantic, semanticStatus, semanticVersion } from '../../../packages/nlp/semantic.js';
import { parseImport, mapImport } from './importer.js';
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
  private collecting = false;
  private browserRuns=new Set<number>();
  private browserCollector=new BrowserCollector();
  private requests = new Map<string, { count: number; until: number }>();
  constructor(@Inject('STORE') private store: Store, @Inject('AUTH') private auth: Auth) {}
  @Get('health') health() { return { app: 'ear-review', status: 'ok', modelVersion: MODEL.version, dataMode: '教学样例 + 用户导入' }; }
  @Get('model') async model() {
    const path = resolve('data/evaluation.json');
    const evaluation = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    return { semantic: await semanticStatus(), version: MODEL.version, algorithm: '字符 n-gram 多项式朴素贝叶斯 + 领域规则（基线对照）', trainingExamples: MODEL.trainingExamples, dataKind: MODEL.dataKind, evaluation: evaluation?.version === MODEL.version ? evaluation : null, limitations: ['文本模型可能误判反讽和隐含评价，须结合原文复核', '大模型使用预训练权重推理，没有在本项目微调', '教学评估仅属于基线，不能作为大模型或真实评论的成绩'] };
  }
  @Post('auth/login') login(@Body() body: unknown, @Req() req: Request) { const data = object(body); return { token: this.auth.login(string(data.username, '账号', 60), string(data.password, '密码', 200), req.ip ?? 'local'), username: 'admin' }; }
  @Get('auth/me') me(@Req() req: Request) { return { username: this.auth.require(req) }; }
  @Post('auth/logout') logout(@Req() req: Request) { this.auth.logout(req); return { ok: true }; }
  @Get('products') products() { return this.store.products(); }
  @Get('products/:id/summary') summary(@Param('id') productId:string,@Query('pure') pure?:string):ProductSummary {
    const stats=this.store.stats(productId,pure==='true');if(!stats)throw new NotFoundException('产品不存在');
    const reviews=this.store.reviews(productId,pure==='true');
    const points=(sentiment:'positive'|'negative')=>stats.aspects.filter(a=>a[sentiment]>0).map(a=>({aspect:a.aspect,count:a[sentiment],total:a.total,evidence:reviews.flatMap(r=>{
      const opinion=r.opinions.find(o=>o.aspect===a.aspect&&o.status==='classified'&&o.sentiment===sentiment);
      return opinion?[{reviewId:r.id,text:opinion.evidence.map(e=>e.text).join('；'),source:r.source}]:[];
    }).slice(0,2)})).sort((a,b)=>b.count-a.count);
    return {productId,analyzed:stats.analyzed,pending:stats.aspects.reduce((n,a)=>n+a.pending,0),unclassified:reviews.filter(r=>!r.analyzed).length,strengths:points('positive'),weaknesses:points('negative'),mixed:stats.aspects.reduce((n,a)=>n+a.mixed,0)};
  }
  @Get('collections') collections(@Req() req:Request){this.auth.require(req);return this.store.all<CollectionJob>('SELECT id,product_id productId,platform,item_id itemId,url,method,status,requested,total,error,created_at createdAt,updated_at updatedAt FROM collections ORDER BY id DESC LIMIT 30').map(job=>({...job,autoRunning:this.browserRuns.has(job.id)}));}

  @Get('collections/:id/csv') collectionDownload(@Param('id') value:string,@Req() req:Request,@Res() res:Response){
    this.auth.require(req);const row=this.store.one<{csv:string;status:string}>('SELECT csv,status FROM collections WHERE id=?',id(value));
    if(!row)throw new NotFoundException('采集任务不存在');if(!row.csv)throw new BadRequestException('没有可下载评论，请查看采集状态');
    res.setHeader('Content-Disposition',`attachment; filename="collection-${id(value)}.csv"`);res.type('text/csv; charset=utf-8').send(row.csv);
  }
  @Get('collections/:id/data') collectionData(@Param('id') value:string,@Req() req:Request){
    this.auth.require(req);const row=this.store.one<{csv:string;productId:string;url:string;platform:string}>('SELECT csv,product_id productId,url,platform FROM collections WHERE id=?',id(value));
    if(!row)throw new NotFoundException('采集任务不存在');if(!row.csv)throw new BadRequestException('没有可导入的评论');return row;
  }
  @Post('collections') createCollection(@Body() body:unknown,@Req() req:Request){
    this.auth.require(req);if(this.collecting)throw new HttpException('已有采集进行中，请等待完成',409);
    const data=object(body);
    const method=data.method??'public';if(method!=='public'&&method!=='browser')throw new BadRequestException('采集方式无效');
    const limit=Number(data.limit??50);if(!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('公开采集每次限制1～100条');
    let target;try{target=collectionTarget(data.platform,data.url);}catch(e){throw new BadRequestException((e as Error).message);}
    const suppliedProduct=typeof data.productId==='string'&&data.productId.trim()?string(data.productId,'目标耳机',40):undefined;
    if(data.productId!=null&&typeof data.productId!=='string')throw new BadRequestException('目标耳机编号格式不正确');
    const productId=suppliedProduct??`${target.platform}-${target.itemId}`;
    const name=data.productName==null||data.productName===''?`${target.platform==='jd'?'京东':'天猫'}商品 ${target.itemId}`:string(data.productName,'耳机名称',80);
    if(suppliedProduct&&!this.store.products().some(p=>p.id===productId))throw new BadRequestException('目标耳机已不存在，请刷新列表或按商品链接创建');
    const now=new Date().toISOString();const jobId=this.store.transaction(()=>{
      if(!suppliedProduct)this.store.run('INSERT OR IGNORE INTO products VALUES(?,?,?,?)',productId,name,`商品编号 ${target.itemId}`,target.url);
      const inserted=this.store.run("INSERT INTO collections(product_id,platform,item_id,url,status,requested,created_at,updated_at,method) VALUES(?,?,?,?,'running',?,?,?,?)",productId,target.platform,target.itemId,target.url,limit,now,now,method);
      return Number(inserted.lastInsertRowid);
    });this.collecting=true;
    if(method==='browser'){
      const onClose=()=>{if(!this.stopping)this.store.run("UPDATE collections SET status=CASE WHEN total>0 THEN 'partial' ELSE 'blocked' END,error='采集Chrome已关闭或会话到期；已读取内容保留',updated_at=? WHERE id=? AND status IN ('running','waiting')",new Date().toISOString(),jobId);this.collecting=false;};
      void this.browserCollector.open(jobId,target,limit,onClose).then(()=>{if(!this.stopping)this.startBrowserRun(jobId);}).catch(error=>{if(!this.stopping)this.store.run("UPDATE collections SET status='failed',error=?,updated_at=? WHERE id=?",(error as Error).message,new Date().toISOString(),jobId);this.collecting=false;});
      return this.collections(req).find(j=>j.id===jobId);
    }
    void collectPublic(target,limit,total=>this.store.run('UPDATE collections SET total=?,updated_at=? WHERE id=?',total,new Date().toISOString(),jobId)).then(result=>{
      const csv=result.rows.length?collectionCsv(productId,target,result.rows):'';
      this.store.run('UPDATE collections SET status=?,total=?,error=?,csv=?,updated_at=? WHERE id=?',result.status,result.rows.length,result.error||null,csv,new Date().toISOString(),jobId);
    }).catch(error=>this.store.run("UPDATE collections SET status='failed',error=?,updated_at=? WHERE id=?",String(error),new Date().toISOString(),jobId)).finally(()=>{this.collecting=false;});
    return this.collections(req).find(j=>j.id===jobId);
  }
  @Post('collections/:id/read') async readBrowser(@Param('id') value:string,@Req() req:Request){
    this.auth.require(req);const job=this.store.one<{productId:string;platform:'jd'|'tmall';url:string;status:string;method:string}>('SELECT product_id productId,platform,url,status,method FROM collections WHERE id=?',id(value));
    if(!job)throw new NotFoundException('采集任务不存在');if(job.method!=='browser'||job.status!=='waiting')throw new BadRequestException('浏览器任务尚未就绪或已结束');
    try{const result=await this.browserCollector.read(id(value));const csv=collectionCsv(job.productId,collectionTarget(job.platform,job.url),result.rows,'browser');this.store.run('UPDATE collections SET total=?,csv=?,error=NULL,updated_at=? WHERE id=?',result.rows.length,csv,new Date().toISOString(),id(value));return {added:result.added,total:result.rows.length,limitReached:result.limitReached};}
    catch(error){this.store.run('UPDATE collections SET error=? WHERE id=?',(error as Error).message,id(value));throw new BadRequestException((error as Error).message);}
  }
  @Post('collections/:id/finish') async finishBrowser(@Param('id') value:string,@Req() req:Request){
    this.auth.require(req);const job=this.collections(req).find(j=>j.id===id(value));if(!job)throw new NotFoundException('采集任务不存在');if(job.method!=='browser'||job.status!=='waiting')throw new BadRequestException('浏览器任务尚未就绪或已结束');
    await this.browserCollector.close(job.id);this.store.run('UPDATE collections SET status=?,error=?,updated_at=? WHERE id=?',job.total?'completed':'blocked',job.total?null:'未读取到评论；请登录并打开评价区后重新尝试',new Date().toISOString(),job.id);this.collecting=false;return this.collections(req).find(j=>j.id===job.id);
  }
  @Post('collections/:id/auto') autoBrowser(@Param('id') value:string,@Req() req:Request){
    this.auth.require(req);const job=this.collections(req).find(j=>j.id===id(value));if(!job||job.method!=='browser'||job.status!=='waiting')throw new BadRequestException('采集窗口未就绪或正在采集');
    if(this.browserRuns.has(job.id))throw new BadRequestException('任务已自动运行，完成登录后会自动继续');
    this.startBrowserRun(job.id);return this.collections(req).find(j=>j.id===job.id);
  }
  private startBrowserRun(jobId:number){
    const job=this.store.one<CollectionJob>('SELECT id,product_id productId,platform,url,requested FROM collections WHERE id=?',jobId);if(!job||this.browserRuns.has(jobId))return;this.browserRuns.add(jobId);
    this.store.run("UPDATE collections SET status='running',error=NULL,updated_at=? WHERE id=?",new Date().toISOString(),job.id);
    const save=(rows:import('./collector.js').CollectedReview[])=>{if(!this.stopping)this.store.run('UPDATE collections SET total=?,csv=?,updated_at=? WHERE id=?',rows.length,collectionCsv(job.productId,collectionTarget(job.platform,job.url),rows,'browser'),new Date().toISOString(),job.id);};
    const waiting=(message:string|null)=>{if(!this.stopping)this.store.run("UPDATE collections SET status=?,error=?,updated_at=? WHERE id=? AND status IN ('running','waiting')",message?'waiting':'running',message,new Date().toISOString(),job.id);};
    void this.browserCollector.automate(job.id,save,waiting).then(async result=>{await this.browserCollector.close(job.id);if(!this.stopping)this.store.run("UPDATE collections SET status=?,error=?,updated_at=? WHERE id=? AND status IN ('running','waiting')",result.rows.length>=job.requested?'completed':'partial',result.rows.length<job.requested?result.reason:null,new Date().toISOString(),job.id);this.collecting=false;}).catch(error=>{if(!this.stopping)this.store.run("UPDATE collections SET status='waiting',error=?,updated_at=? WHERE id=? AND status IN ('running','waiting')",(error as Error).message,new Date().toISOString(),job.id);}).finally(()=>this.browserRuns.delete(job.id));
  }
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
  @Post('analyze') async analyzeText(@Body() body: unknown, @Req() req: Request) {
    const key = req.ip ?? 'local'; const current = this.requests.get(key); const entry = current && current.until > Date.now() ? current : { count: 0, until: Date.now() + 60_000 };
    if (++entry.count > 60) throw new HttpException('分析请求过于频繁，请稍后重试', 429); this.requests.set(key, entry);
    const data = object(body); const text = string(data.text, '评论', data.mode === 'semantic' ? 5000 : 1000);
    if (data.mode === 'semantic') { try { return await analyzeSemantic(text); } catch (error) { throw new HttpException((error as Error).message, 503); } }
    const mode = data.mode === 'rules' ? 'rules' : 'hybrid'; return analyze(text, mode);
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
    this.store.run('INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)', review.id, review.modelVersion!, aspect, JSON.stringify(correction), string(data.reason, '复核理由', 300), actor, new Date().toISOString());
    return this.store.review(review.id);
  }
  @Get('reviews/:id/history') history(@Param('id') reviewId: string, @Req() req: Request) { this.auth.require(req); return this.store.all('SELECT aspect,result,reason,actor,created_at createdAt FROM corrections WHERE review_id=? ORDER BY id DESC', id(reviewId)); }
  @Post('imports/columns') columns(@Body() body: unknown, @Req() req: Request) {
    this.auth.require(req); const data = object(body);
    try { const { records: _records, ...info } = parseImport(string(data.csv, 'CSV 内容', 5_300_000)); return info; }
    catch (error) { throw new BadRequestException((error as Error).message); }
  }
  @Post('imports/preview') preview(@Body() body: unknown, @Req() req: Request) {
    const owner = this.auth.require(req); const data = object(body); const csv = string(data.csv, 'CSV 内容', 5_300_000);
    if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new BadRequestException('文件不能超过 5 MB');
    const source = string(data.source, '数据来源说明', 200);
    let mapped;
    try {
      const parsed = parseImport(csv);
      const mapping = data.mapping ? object(data.mapping) as ColumnMapping : parsed.mapping;
      if (Object.values(mapping).some(v => typeof v !== 'string')) throw new Error('字段映射应为列名');
      mapped = mapImport(parsed.records, parsed.headers, mapping, typeof data.productId === 'string' ? data.productId : '', source, data.isSynthetic === true);
    } catch (error) { throw new BadRequestException((error as Error).message); }
    const products = new Set(this.store.products().map(p => p.id)); const seenId = new Set<string>(); const seenText = new Set<string>();
    const rows = mapped.map(record => {
      const { productId, reviewId, text, errors } = record;
      if (!products.has(productId)) errors.push('产品 ID 不存在，请先在产品管理中创建');
      const idKey = `${productId}\0${reviewId}`; const hash = fingerprint(text); const textKey = `${productId}\0${hash}`;
      const duplicate = seenId.has(idKey) || seenText.has(textKey) || !!this.store.one('SELECT id FROM reviews WHERE product_id=? AND (external_id=? OR fingerprint=?)', productId, reviewId, hash);
      if (!errors.length) { seenId.add(idKey); seenText.add(textKey); }
      return { ...record, valid: !errors.length, duplicate, errors };
    });
    for (const [key, preview] of this.previews) if (preview.expiry < Date.now()) this.previews.delete(key);
    if (this.previews.size >= 30) throw new BadRequestException('待提交预览过多，请稍后重试');
    const token = randomBytes(24).toString('hex'); const result = { rows, valid: rows.filter(r => r.valid && !r.duplicate).length, invalid: rows.filter(r => !r.valid).length, duplicates: rows.filter(r => r.valid && r.duplicate).length, token };
    this.previews.set(token, { data: result, expiry: Date.now() + 15 * 60_000, owner, name: typeof data.name === 'string' ? data.name.slice(0, 120) : 'CSV 导入', source }); return result;
  }
  @Post('imports/commit') commit(@Body() body: unknown, @Req() req: Request) {
    const owner = this.auth.require(req); const data = object(body); const token = string(data.token, '预览标识', 100); const preview = this.previews.get(token);
    if (!preview || preview.expiry < Date.now() || preview.owner !== owner) throw new BadRequestException('预览已过期或已提交，请重新预览');
    if (!preview.data.valid) throw new BadRequestException('没有可导入的有效评论');
    const imported = this.store.importRows(preview.data.rows, preview.name, preview.source); this.previews.delete(token); return imported;
  }
  @Get('batches') batches(@Req() req: Request) { this.auth.require(req); return this.store.batches(); }
  @Get('jobs') jobs(@Req() req: Request) { this.auth.require(req); return this.store.jobs(); }
  @Get('jobs/:id/errors') jobErrors(@Param('id') jobId: string, @Req() req: Request) { this.auth.require(req); return this.store.all('SELECT review_id reviewId,message FROM job_errors WHERE job_id=?', id(jobId)); }
  @Post('jobs') async createJob(@Body() body: unknown, @Req() req: Request) {
    this.auth.require(req); const data = object(body); const batchId = id(data.batchId);
    const semantic = data.mode === 'semantic'; const version = semantic ? semanticVersion() : MODEL.version;
    if (semantic) { const state = await semanticStatus(); if (!state.ready) throw new HttpException(state.message, 503); }
    const rows = this.store.all<{ id: number }>('SELECT id FROM reviews WHERE batch_id=?', batchId); if (!rows.length) throw new BadRequestException('批次没有可分析的评论');
    const previous = this.store.one<Job>('SELECT id,status FROM jobs WHERE batch_id=? AND version=? ORDER BY id DESC LIMIT 1', batchId, version);
    if (previous && previous.status !== 'failed') return this.store.jobs().find(j => j.id === previous.id);
    const job = this.store.run("INSERT INTO jobs(batch_id,status,total,processed,version,created_at) VALUES(?,'queued',?,0,?,?)", batchId, rows.length, version, new Date().toISOString()); this.pump(); return this.store.jobs().find(j => j.id === Number(job.lastInsertRowid));
  }
  private pump() {
    if (this.activeWorker || this.stopping) return;
    const job = this.store.one<{ id: number; batch_id: number; version: string }>("SELECT id,batch_id,version FROM jobs WHERE status='queued' ORDER BY id LIMIT 1"); if (!job) return;
    const rows = this.store.all<{ id: number; text: string }>('SELECT id,text FROM reviews WHERE batch_id=? ORDER BY id', job.batch_id);
    this.store.run("UPDATE jobs SET status='running' WHERE id=?", job.id); this.activeJob = job.id;
    const isTs = import.meta.url.endsWith('.ts');
    const worker = new Worker(new URL(isTs ? './analysis-worker.ts' : './analysis-worker.js', import.meta.url), { workerData: { rows, version: job.version, semantic: job.version.startsWith('ollama-') }, ...(isTs ? { execArgv: ['--import', 'tsx'] } : {}) });
    this.activeWorker = worker; let completed = false;
    worker.on('message', (message: { id?: number; result?: Analysis; done?: boolean; error?: string; failures?: number }) => {
      try {
        if (message.done) { completed = true; this.store.run('UPDATE jobs SET status=?,error=? WHERE id=?', message.failures ? 'failed' : 'completed', message.failures ? `${message.failures} 条失败，可重试；已成功的结果保留` : null, job.id); }
        else if (message.error && message.id) this.store.transaction(() => { this.store.run('INSERT OR REPLACE INTO job_errors VALUES(?,?,?)', job.id, message.id!, message.error!); this.store.run('UPDATE jobs SET processed=processed+1,error=? WHERE id=?', message.error!, job.id); });
        else if (message.id && message.result) this.store.transaction(() => { this.store.savePrediction(message.id!, message.result!); this.store.run('UPDATE jobs SET processed=processed+1 WHERE id=?', job.id); });
      } catch (error) { this.store.run("UPDATE jobs SET status='failed',error=? WHERE id=?", String(error), job.id); void worker.terminate(); }
    });
    worker.on('error', error => this.store.run("UPDATE jobs SET status='failed',error=? WHERE id=?", error.message, job.id));
    worker.on('exit', () => { if (!completed) this.store.run("UPDATE jobs SET status='failed',error=coalesce(error,'分析进程中断，请重试') WHERE id=?", job.id); this.activeWorker = null; this.activeJob = null; this.pump(); });
  }
  async onModuleDestroy() { this.stopping = true; await this.browserCollector.closeAll(); if (this.activeWorker) { const worker = this.activeWorker; this.activeWorker = null; await worker.terminate(); } this.store.close(); }
  @Get('export') export(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    this.auth.require(req); const headers = ['reviewId','productId','text','source','isSynthetic','aspect','sentiment','status','evidence','modelVersion','corrected']; const rows: unknown[][] = [headers];
    for (const review of this.store.reviews(query.productId, query.pure === 'true')) {
      if (query.search && !review.text.includes(query.search)) continue;
      if (!review.opinions.length && !query.aspect && !query.sentiment && query.pending !== 'true' && query.corrected !== 'true') rows.push([review.externalId,review.productId,review.text,review.source,review.isSynthetic,'','',review.analyzed ? 'not-mentioned' : 'unanalyzed','',review.modelVersion ?? '',false]);
      for (const opinion of review.opinions) {
        if (query.aspect && query.aspect !== opinion.aspect) continue;
        if (query.sentiment && (opinion.status !== 'classified' || query.sentiment !== opinion.sentiment)) continue;
        if (query.pending === 'true' && opinion.status !== 'review') continue;
        if (query.corrected === 'true' && !opinion.corrected) continue;
        rows.push([review.externalId,review.productId,review.text,review.source,review.isSynthetic,opinion.aspect,opinion.sentiment,opinion.status,opinion.evidence.map(e => e.text).join('；'),review.modelVersion ?? '',!!opinion.corrected]);
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="ear-review-results.csv"'); res.send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  }
}
