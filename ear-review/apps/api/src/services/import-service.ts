import { BadRequestException } from '@nestjs/common';
import type { Store } from '../store.js';
import { object, string, id } from '../request-validation.js';
import { randomBytes } from 'node:crypto';
import type { ImportPreview, ColumnMapping } from '../../../../packages/contracts/index.js';
import { parseImport, mapImport } from '../importer.js';
import { fingerprint } from '../fingerprint.js';
export class ImportService {
    private previews = new Map<string, {
        data: ImportPreview;
        expiry: number;
        owner: string;
        name: string;
        source: string;
    }>();
    constructor(private store: Pick<Store, 'products' | 'reviewRepository' | 'importRows' | 'batches'>) { }
    columns(body: unknown) {
        const data = object(body);
        try {
            const { records: _records, ...info } = parseImport(string(data.csv, 'CSV 内容', 5300000));
            return info;
        }
        catch (error) {
            throw new BadRequestException((error as Error).message);
        }
    }
    preview(body: unknown, owner: string) {
        const data = object(body);
        const csv = string(data.csv, 'CSV 内容', 5300000);
        if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024)
            throw new BadRequestException('文件不能超过 5 MB');
        const source = string(data.source, '数据来源说明', 200);
        let mapped;
        try {
            const parsed = parseImport(csv);
            const mapping = data.mapping ? object(data.mapping) as ColumnMapping : parsed.mapping;
            if (Object.values(mapping).some(v => typeof v !== 'string'))
                throw new Error('字段映射应为列名');
            mapped = mapImport(parsed.records, parsed.headers, mapping, typeof data.productId === 'string' ? data.productId : '', source, data.isSynthetic === true);
        }
        catch (error) {
            throw new BadRequestException((error as Error).message);
        }
        const products = new Set(this.store.products().map(p => p.id));
        const seenId = new Set<string>();
        const seenText = new Set<string>();
        const rows = mapped.map(record => {
            const { productId, reviewId, text, errors } = record;
            if (!products.has(productId))
                errors.push('产品 ID 不存在，请先在产品管理中创建');
            const idKey = `${productId}\0${reviewId}`;
            const hash = fingerprint(text);
            const textKey = `${productId}\0${hash}`;
            const duplicate = seenId.has(idKey) || seenText.has(textKey) || this.store.reviewRepository.duplicate(productId, reviewId, hash);
            if (!errors.length) {
                seenId.add(idKey);
                seenText.add(textKey);
            }
            return { ...record, valid: !errors.length, duplicate, errors };
        });
        for (const [key, preview] of this.previews)
            if (preview.expiry < Date.now())
                this.previews.delete(key);
        if (this.previews.size >= 30)
            throw new BadRequestException('待提交预览过多，请稍后重试');
        const token = randomBytes(24).toString('hex');
        const result = { rows, valid: rows.filter(r => r.valid && !r.duplicate).length, invalid: rows.filter(r => !r.valid).length, duplicates: rows.filter(r => r.valid && r.duplicate).length, token };
        this.previews.set(token, { data: result, expiry: Date.now() + 15 * 60000, owner, name: typeof data.name === 'string' ? data.name.slice(0, 120) : 'CSV 导入', source });
        return result;
    }
    commit(body: unknown, owner: string) {
        const data = object(body);
        const token = string(data.token, '预览标识', 100);
        const preview = this.previews.get(token);
        if (!preview || preview.expiry < Date.now() || preview.owner !== owner)
            throw new BadRequestException('预览已过期或已提交，请重新预览');
        if (!preview.data.valid)
            throw new BadRequestException('没有可导入的有效评论');
        const imported = this.store.importRows(preview.data.rows, preview.name, preview.source);
        this.previews.delete(token);
        return imported;
    }
    batches() { return this.store.batches(); }
}
