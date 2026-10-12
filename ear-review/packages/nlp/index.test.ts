import { describe, expect, test } from 'vitest';
import { analyze, MODEL } from './index.js';
import { predict } from './model.js';
describe('方面情感与真实原文', () => {
  test('多方面情感不复制整句标签', () => { const result = analyze('音质很好，但戴久了耳朵疼。'); expect(result.opinions.find(o => o.aspect === 'sound')?.sentiment).toBe('positive'); expect(result.opinions.find(o => o.aspect === 'comfort')?.sentiment).toBe('negative'); });
  test('无标点转折依然切分', () => { const result = analyze('音质很好但续航太短'); expect(result.opinions.map(o => o.sentiment)).toEqual(['positive','negative']); });
  test('否定惯用正面词', () => { const result = analyze('音质不错。游戏没有延迟。戴久了不疼。'); expect(result.opinions.every(o => o.sentiment === 'positive')).toBe(true); });
  test('否定负面词', () => { expect(analyze('佩戴不舒服').opinions[0]?.sentiment).toBe('negative'); });
  test('同方面冲突汇总为混合', () => { expect(analyze('音质很好，但声音刺耳').opinions[0]?.sentiment).toBe('mixed'); });
  test('未提及不补齐方面', () => { expect(analyze('物流很快包装不错').opinions).toHaveLength(0); });
  test('功能描述与未提及不同', () => { expect(analyze('有降噪模式').opinions[0]?.sentiment).toBe('neutral'); expect(analyze('有降噪模式').opinions).toHaveLength(1); });
  test('多方面共享难归属的意见转待复核', () => { expect(analyze('音质降噪很好').opinions.every(o => o.status === 'review')).toBe(true); });
  test('通话声音只归通话', () => { expect(analyze('通话声音很小').opinions.map(o => o.aspect)).toEqual(['call']); });
  test('emoji 与空格不损坏 UTF16 原文偏移', () => { const text = ' 🎧 音质很好，但戴久了耳朵疼。'; for (const opinion of analyze(text).opinions) for (const evidence of opinion.evidence) expect(text.slice(evidence.start,evidence.end)).toBe(evidence.text); });
  test('预测及模型 JSON 重载保持一致', () => { const loaded = JSON.parse(JSON.stringify(MODEL)) as typeof MODEL; expect(predict(loaded,'声音清晰自然','sound')).toEqual(predict(MODEL,'声音清晰自然','sound')); });
});
