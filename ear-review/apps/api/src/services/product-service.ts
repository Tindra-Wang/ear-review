import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Store } from '../store.js';
import { object, string, id, csvCell } from '../request-validation.js';
import { ASPECTS, type Opinion, type Sentiment, type ProductSummary } from '../../../../packages/contracts/index.js';
import { aggregateProductStats } from './product-statistics.js';
export class ProductService {
    constructor(private store: Pick<Store, 'products' | 'reviews' | 'review' | 'stats' | 'productRepository' | 'reviewRepository'>, private baselineVersion: string) { }
    products() { return this.store.products(); }
    summary(productId: string, pure?: string): ProductSummary {
        const product = this.store.products().find(p => p.id === productId);
        if (!product)
            throw new NotFoundException('产品不存在');
        const reviews = this.store.reviews(productId, pure === 'true');
        const stats = aggregateProductStats(product, reviews, this.baselineVersion);
        const points = (sentiment: 'positive' | 'negative') => stats.aspects.filter(a => a[sentiment] > 0).map(a => ({ aspect: a.aspect, count: a[sentiment], total: a.total, evidence: reviews.flatMap(r => {
                const opinion = r.opinions.find(o => o.aspect === a.aspect && o.status === 'classified' && o.sentiment === sentiment);
                return opinion ? [{ reviewId: r.id, text: opinion.evidence.map(e => e.text).join('；'), source: r.source }] : [];
            }).slice(0, 2) })).sort((a, b) => b.count - a.count);
        return { productId, analyzed: stats.analyzed, pending: stats.aspects.reduce((n, a) => n + a.pending, 0), unclassified: reviews.filter(r => !r.analyzed).length, strengths: points('positive'), weaknesses: points('negative'), mixed: stats.aspects.reduce((n, a) => n + a.mixed, 0) };
    }
    addProduct(body: unknown) {
        const data = object(body);
        const productId = string(data.id, '产品 ID', 40);
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(productId))
            throw new BadRequestException('产品 ID 使用小写字母、数字、下划线或短横线');
        if (this.store.products().some(p => p.id === productId))
            throw new BadRequestException('产品 ID 已存在');
        this.store.productRepository.create(productId, string(data.name, '产品名称', 80), typeof data.subtitle === 'string' ? data.subtitle.slice(0, 120) : '', '用户创建');
        return this.store.products();
    }
    updateProduct(productId: string, body: unknown) {
        if (!this.store.products().some(p => p.id === productId))
            throw new NotFoundException('产品不存在');
        const data = object(body);
        this.store.productRepository.update(productId, string(data.name, '产品名称', 80), typeof data.subtitle === 'string' ? data.subtitle.slice(0, 120) : '');
        return this.store.products();
    }
    reviews(query: Record<string, string>) {
        const productId = query.productId;
        const aspect = query.aspect;
        const sentiment = query.sentiment;
        const page = Math.max(1, Number(query.page) || 1);
        const size = Math.min(50, Math.max(1, Number(query.size) || 10));
        let rows = this.store.reviews(productId, query.pure === 'true');
        if (query.search)
            rows = rows.filter(r => r.text.includes(query.search!));
        if (aspect || sentiment || query.pending === 'true' || query.corrected === 'true')
            rows = rows.filter(r => r.opinions.some(o => (!aspect || o.aspect === aspect) && (!sentiment || (o.status === 'classified' && o.sentiment === sentiment)) && (query.pending !== 'true' || o.status === 'review') && (query.corrected !== 'true' || o.corrected)));
        return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, size };
    }
    stats(productId: string, pure: string) { const stats = this.store.stats(productId, pure === 'true'); if (!stats)
        throw new NotFoundException('产品不存在'); return stats; }
    compare(ids: string) { const selected = [...new Set((ids ?? '').split(',').filter(Boolean))]; if (selected.length < 2 || selected.length > 3)
        throw new BadRequestException('请选择 2～3 款产品'); return selected.map(productId => { const stats = this.store.stats(productId); if (!stats)
        throw new NotFoundException('产品不存在'); return stats; }); }
    correct(reviewId: string, body: unknown, actor: string) {
        const review = this.store.review(id(reviewId));
        if (!review)
            throw new NotFoundException('评论不存在');
        if (!review.analyzed)
            throw new BadRequestException('请先分析评论');
        const data = object(body);
        const aspect = ASPECTS.find(a => a.id === data.aspect)?.id;
        if (!aspect)
            throw new BadRequestException('评价方面无效');
        if (!['positive', 'negative', 'neutral', 'mixed'].includes(String(data.sentiment)))
            throw new BadRequestException('情感标签无效');
        const evidenceText = string(data.evidence, '原文证据', 1000);
        const start = review.text.indexOf(evidenceText);
        if (start < 0)
            throw new BadRequestException('证据必须是原文中的真实片段');
        const sentiment = data.sentiment as Sentiment;
        const correction: Opinion = { aspect, sentiment, status: 'classified', method: '人工复核', evidence: [{ start, end: start + evidenceText.length, text: evidenceText, sentiment: sentiment === 'mixed' ? 'neutral' : sentiment }] };
        this.store.reviewRepository.correct(review.id, review.modelVersion!, aspect, correction, string(data.reason, '复核理由', 300), actor);
        return this.store.review(review.id);
    }
    history(reviewId: string) { return this.store.reviewRepository.history(id(reviewId)); }
    export(query: Record<string, string>) {
        const headers = ['reviewId', 'productId', 'text', 'source', 'isSynthetic', 'aspect', 'sentiment', 'status', 'evidence', 'modelVersion', 'corrected'];
        const rows: unknown[][] = [headers];
        for (const review of this.store.reviews(query.productId, query.pure === 'true')) {
            if (query.search && !review.text.includes(query.search))
                continue;
            if (!review.opinions.length && !query.aspect && !query.sentiment && query.pending !== 'true' && query.corrected !== 'true')
                rows.push([review.externalId, review.productId, review.text, review.source, review.isSynthetic, '', '', review.analyzed ? 'not-mentioned' : 'unanalyzed', '', review.modelVersion ?? '', false]);
            for (const opinion of review.opinions) {
                if (query.aspect && query.aspect !== opinion.aspect)
                    continue;
                if (query.sentiment && (opinion.status !== 'classified' || query.sentiment !== opinion.sentiment))
                    continue;
                if (query.pending === 'true' && opinion.status !== 'review')
                    continue;
                if (query.corrected === 'true' && !opinion.corrected)
                    continue;
                rows.push([review.externalId, review.productId, review.text, review.source, review.isSynthetic, opinion.aspect, opinion.sentiment, opinion.status, opinion.evidence.map(e => e.text).join('；'), review.modelVersion ?? '', !!opinion.corrected]);
            }
        }
        return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    }
}
