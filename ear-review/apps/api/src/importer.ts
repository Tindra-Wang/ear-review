import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import type { ColumnMapping, ImportColumns, PreviewRow } from '../../../packages/contracts/index.js';
const aliases = {
  text: ['text', 'review', 'review_text', 'review_body', 'content', '评论', '评论内容', '评价内容', '正文'],
  reviewId: ['reviewId', 'review_id', 'id', '评论id', '评论编号'],
  productId: ['productId', 'product_id', '产品id', '产品编号'],
  source: ['source', '来源', '数据来源']
};
const normalized = (s: string) => s.trim().toLowerCase().replace(/[ _-]/g, '');
export function parseImport(csv: string): ImportColumns & { records: Record<string, string>[] } {
  if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
  let lines: string[][];
  try { lines = parse(csv, { bom: true, skip_empty_lines: true, max_record_size: 100_000, relax_column_count: false }) as string[][]; }
  catch { throw new Error('CSV 格式错误，请检查分隔逗号、引号和每行列数'); }
  const headers = (lines.shift() ?? []).map(h => h.trim());
  if (!headers.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('表头不能为空或重复');
  if (!lines.length || lines.length > 5000) throw new Error('请导入 1～5000 行评论');
  const records = lines.map(cells => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  const mapping: ColumnMapping = {};
  for (const [field, names] of Object.entries(aliases)) {
    const matches = headers.filter(h => names.some(n => normalized(n) === normalized(h)));
    if (matches.length === 1) mapping[field as keyof ColumnMapping] = matches[0];
  }
  return { headers, mapping, sample: records.slice(0, 3), total: records.length, records };
}
export function mapImport(records: Record<string, string>[], headers: string[], mapping: ColumnMapping, fallbackProductId: string, source: string, synthetic: boolean): PreviewRow[] {
  if (!mapping.text || !headers.includes(mapping.text)) throw new Error('请选择评论正文列');
  for (const column of Object.values(mapping)) if (column && !headers.includes(column)) throw new Error('映射的列不存在，请重新识别文件');
  const columns = Object.values(mapping).filter(Boolean);
  if (new Set(columns).size !== columns.length) throw new Error('同一列不能同时映射到多个字段');
  const get = (record: Record<string, string>, key: keyof ColumnMapping) => mapping[key] ? record[mapping[key]!]!.trim() : '';
  return records.map((record, i) => {
    const text = get(record, 'text');
    const reviewId = get(record, 'reviewId') || `auto-${createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).digest('hex').slice(0, 24)}`;
    const productId = get(record, 'productId') || fallbackProductId;
    const errors: string[] = [];
    if (!text) errors.push('评论为空');
    if (Array.from(text).length > 5000) errors.push('评论超过 5000 字，未截断');
    if (reviewId.length > 100) errors.push('评论 ID 超过 100 字');
    if (!productId) errors.push('缺少产品归属，请选择导入产品或集合');
    return { row: i + 2, text, reviewId, productId, source: (get(record, 'source') || source).slice(0, 200), isSynthetic: synthetic, valid: !errors.length, duplicate: false, errors };
  });
}
