import { describe, it, expect } from 'vitest';
import { parseImport, mapImport } from './importer.js';
describe('外部 CSV 字段映射', () => {
  it('中文表头、BOM、多行正文与稳定编号', () => {
    const csv = '\uFEFF评论内容,评分\r\n"办公室不错, 地铁却不行\n会再试几天",3';
    const data = parseImport(csv);
    expect(data.mapping.text).toBe('评论内容');
    const [row] = mapImport(data.records, data.headers, data.mapping, 'unknown-headphone', '外部数据', false);
    expect(row?.text).toContain('\n'); expect(row?.productId).toBe('unknown-headphone'); expect(row?.isSynthetic).toBe(false);
    expect(mapImport(data.records, data.headers, data.mapping, 'unknown-headphone', '外部数据', false)[0]?.reviewId).toBe(row?.reviewId);
  });
  it('不编造产品归属，不用评分替代情感', () => {
    const data = parseImport('text,label\n不满意,5');
    expect(mapImport(data.records, data.headers, data.mapping, '', '来源', false)[0]?.valid).toBe(false);
    expect(data.mapping).toEqual({ text: 'text' });
  });
  it('正文列冲突必须显式选择，拒绝重复表头和超长文本', () => {
    const data = parseImport('text,review\na,b'); expect(data.mapping.text).toBeUndefined();
    expect(() => mapImport(data.records, data.headers, {}, 'p', 's', false)).toThrow('正文列');
    expect(() => parseImport('text,text\na,b')).toThrow('重复');
    const long = parseImport(`text\n${'长'.repeat(5001)}`);
    const [row] = mapImport(long.records, long.headers, long.mapping, 'p', 's', false);
    expect(row?.valid).toBe(false); expect(row?.text.length).toBe(5001);
  });
});
