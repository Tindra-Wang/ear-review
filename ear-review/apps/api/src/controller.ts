import { Body, Controller, Get, Post, Patch, Query, Param, Req, Res, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Store } from './store.js';
import { Auth } from './auth.js';
import { object, string } from './request-validation.js';
import type { ProductSummary } from '../../../packages/contracts/index.js';
import type { ApplicationServices } from './application-services.js';
export { csvCell } from './request-validation.js';
@Controller('api')
export class ApiController {
    readonly collectionService: ApplicationServices['collectionService'];
    readonly importService: ApplicationServices['importService'];
    readonly productService: ApplicationServices['productService'];
    readonly analysisJobService: ApplicationServices['analysisJobService'];
    readonly modelService: ApplicationServices['modelService'];
    constructor(
    @Inject('STORE')
    private store: Store,
    @Inject('AUTH')
    private auth: Auth,
    @Inject('SERVICES')
    services: ApplicationServices) { this.collectionService = services.collectionService; this.importService = services.importService; this.productService = services.productService; this.analysisJobService = services.analysisJobService; this.modelService = services.modelService; }
    set browserCollector(value: import('./browser-collector.js').BrowserCollector) { this.collectionService.browserCollector = value; }
    @Get('health')
    health() { return this.modelService.health(); }
    @Get('model')
    async model() { return this.modelService.model(); }
    @Post('auth/login')
    login(
    @Body()
    body: unknown,
    @Req()
    req: Request) { const data = object(body); return { token: this.auth.login(string(data.username, '账号', 60), string(data.password, '密码', 200), req.ip ?? 'local'), username: 'admin' }; }
    @Get('auth/me')
    me(
    @Req()
    req: Request) { return { username: this.auth.require(req) }; }
    @Post('auth/logout')
    logout(
    @Req()
    req: Request) { this.auth.logout(req); return { ok: true }; }
    @Get('products')
    products() { return this.productService.products(); }
    @Get('products/:id/summary')
    summary(
    @Param('id')
    productId: string,
    @Query('pure')
    pure?: string): ProductSummary { return this.productService.summary(productId, pure); }
    @Get('collections')
    collections(
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.collections(); }
    @Get('collections/:id/csv')
    collectionDownload(
    @Param('id')
    value: string,
    @Req()
    req: Request,
    @Res()
    res: Response) { this.auth.require(req); const csv = this.collectionService.collectionDownload(value); res.setHeader('Content-Disposition', `attachment; filename="collection-${Number(value)}.csv"`); res.type('text/csv; charset=utf-8').send(csv); }
    @Get('collections/:id/data')
    collectionData(
    @Param('id')
    value: string,
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.collectionData(value); }
    @Post('collections')
    createCollection(
    @Body()
    body: unknown,
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.createCollection(body); }
    @Post('collections/:id/read')
    async readBrowser(
    @Param('id')
    value: string,
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.readBrowser(value); }
    @Post('collections/:id/finish')
    async finishBrowser(
    @Param('id')
    value: string,
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.finishBrowser(value); }
    @Post('collections/:id/auto')
    autoBrowser(
    @Param('id')
    value: string,
    @Req()
    req: Request) { this.auth.require(req); return this.collectionService.autoBrowser(value); }
    @Post('products')
    addProduct(
    @Body()
    body: unknown,
    @Req()
    req: Request) { this.auth.require(req); return this.productService.addProduct(body); }
    @Patch('products/:id')
    updateProduct(
    @Param('id')
    productId: string,
    @Body()
    body: unknown,
    @Req()
    req: Request) { this.auth.require(req); return this.productService.updateProduct(productId, body); }
    @Post('analyze')
    async analyzeText(
    @Body()
    body: unknown,
    @Req()
    req: Request) { return this.modelService.analyzeText(body, req.ip ?? 'local'); }
    @Get('reviews')
    reviews(
    @Query()
    query: Record<string, string>) { return this.productService.reviews(query); }
    @Get('products/:id/stats')
    stats(
    @Param('id')
    productId: string,
    @Query('pure')
    pure: string) { return this.productService.stats(productId, pure); }
    @Get('compare')
    compare(
    @Query('ids')
    ids: string) { return this.productService.compare(ids); }
    @Patch('reviews/:id/correction')
    correct(
    @Param('id')
    reviewId: string,
    @Body()
    body: unknown,
    @Req()
    req: Request) { const actor = this.auth.require(req); return this.productService.correct(reviewId, body, actor); }
    @Get('reviews/:id/history')
    history(
    @Param('id')
    reviewId: string,
    @Req()
    req: Request) { this.auth.require(req); return this.productService.history(reviewId); }
    @Post('imports/columns')
    columns(
    @Body()
    body: unknown,
    @Req()
    req: Request) { this.auth.require(req); return this.importService.columns(body); }
    @Post('imports/preview')
    preview(
    @Body()
    body: unknown,
    @Req()
    req: Request) { const actor = this.auth.require(req); return this.importService.preview(body, actor); }
    @Post('imports/commit')
    commit(
    @Body()
    body: unknown,
    @Req()
    req: Request) { const actor = this.auth.require(req); return this.importService.commit(body, actor); }
    @Get('batches')
    batches(
    @Req()
    req: Request) { this.auth.require(req); return this.importService.batches(); }
    @Get('jobs')
    jobs(
    @Req()
    req: Request) { this.auth.require(req); return this.analysisJobService.jobs(); }
    @Get('jobs/:id/errors')
    jobErrors(
    @Param('id')
    jobId: string,
    @Req()
    req: Request) { this.auth.require(req); return this.analysisJobService.jobErrors(jobId); }
    @Post('jobs')
    async createJob(
    @Body()
    body: unknown,
    @Req()
    req: Request) { this.auth.require(req); return this.analysisJobService.createJob(body); }
    @Get('export')
    export(
    @Query()
    query: Record<string, string>,
    @Req()
    req: Request,
    @Res()
    res: Response) { this.auth.require(req); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="ear-review-results.csv"'); res.send(this.productService.export(query)); }
    async onModuleDestroy() { await this.collectionService.stop(); await this.analysisJobService.stop(); this.store.close(); }
}
