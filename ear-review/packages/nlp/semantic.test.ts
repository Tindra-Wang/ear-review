import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeSemantic, validateSemantic, evidenceSpans, restoreEvidence } from './semantic.js';
const opinion = { aspect: 'noise', sentiment: 'negative', status: 'classified', expression: 'irony', intensity: 'medium', rationale: '称赞与仍然听清噪声矛盾，可能反讽', evidence: [{ text: '地铁广播听得一清二楚', sentiment: 'negative' }] };
const text = '降噪真厉害，地铁广播听得一清二楚，谢谢你。';
const wireOpinion={...opinion,evidence:[{spanId:'S2',sentiment:'negative'}]};
const wire={opinions:{noise:wireOpinion}};
afterEach(() => vi.unstubAllGlobals());
describe('语义输出验证（模拟协议，不评价真实模型能力）', () => {
  it('仅接受原文证据，并保持 UTF16 偏移', () => {
    const result = validateSemantic('🎧' + text, { opinions: [opinion] });
    const e = result.opinions[0]!.evidence[0]!;
    expect(('🎧' + text).slice(e.start, e.end)).toBe(e.text);
    expect(result.opinions[0]?.expression).toBe('irony');
    expect(() => validateSemantic(text, { opinions: [{ ...opinion, evidence: [{ text: '虚构证据', sentiment: 'negative' }] }] })).toThrow('不存在');
  });
  it('同方面混合必须有正负证据，不确定不能计入已判定', () => {
    expect(validateSemantic(text, { opinions: [{ ...opinion, sentiment: 'mixed' }] }).opinions[0]?.status).toBe('review');
    expect(validateSemantic(text, { opinions: [{ ...opinion, expression: 'uncertain' }] }).opinions[0]?.status).toBe('review');
    expect(() => validateSemantic(text, { opinions: [opinion, opinion] })).toThrow('重复');
  });
  it('真正调用本地 JSON schema 接口，失败不伪装为基线结果', async () => {
    const mock = vi.fn().mockImplementation(async()=>new Response(JSON.stringify({ message: { content: JSON.stringify(wire) } })));
    vi.stubGlobal('fetch', mock);
    const result = await analyzeSemantic(text); expect(result.modelVersion).toContain('ollama-');
    const body = JSON.parse(mock.mock.calls[0]![1].body); expect(body.format.properties.opinions.type).toBe('object'); expect(body.stream).toBe(false); expect(JSON.parse(body.messages[1].content).review).toBe(text);expect(JSON.parse(body.messages[1].content).spans[1].id).toBe('S2');
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ done_reason: 'length', message: { content: JSON.stringify({ opinions: [opinion] }) } })));
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ done_reason: 'length', message: { content: JSON.stringify({ opinions: [opinion] }) } })));
    await expect(analyzeSemantic(text)).rejects.toThrow('长度上限');
    mock.mockRejectedValue(new Error('offline'));
    await expect(analyzeSemantic(text)).rejects.toThrow('未降级');
  });
});

it('不合格输出只重试一次，修复后记录调用次数，不放宽原文证据校验',async()=>{
 const bad={opinions:{noise:{...wireOpinion,evidence:[{spanId:'S999',sentiment:'negative'}]}}};
 const mock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({message:{content:JSON.stringify(bad)},prompt_eval_count:5}))).mockResolvedValueOnce(new Response(JSON.stringify({message:{content:JSON.stringify(wire)},prompt_eval_count:6})));vi.stubGlobal('fetch',mock);const result=await analyzeSemantic(text);expect(mock).toHaveBeenCalledTimes(2);expect(result.inference?.attempts).toBe(2);expect(result.inference?.promptTokens).toBe(11);expect(result.warnings.join('')).toContain('首次模型输出');
 mock.mockReset().mockImplementation(async()=>new Response(JSON.stringify({message:{content:JSON.stringify(bad)}})));await expect(analyzeSemantic(text)).rejects.toThrow('不存在的原文片段');expect(mock).toHaveBeenCalledTimes(2);
});
it('原文片段完整保留emoji、标点及重复内容，拒绝非法片段和方面',()=>{
 const original='🎧很好，很好。'+'长'.repeat(245);const spans=evidenceSpans(original);expect(spans.map(s=>s.text).join('')).toBe(original);for(const s of spans)expect(original.slice(s.start,s.end)).toBe(s.text);
 expect(restoreEvidence(text,wire).opinions[0]?.evidence[0]?.text).toBe('地铁广播听得一清二楚，');
 expect(()=>restoreEvidence(text,{opinions:{logistics:wireOpinion}})).toThrow('未知方面');
 expect(validateSemantic(text,restoreEvidence(text,{opinions:{}})).opinions).toEqual([]);
 const repeated='很好，很好，';const restored=validateSemantic(repeated,restoreEvidence(repeated,{opinions:{noise:{...wireOpinion,evidence:[{spanId:'S2',sentiment:'negative'}]}}}));expect(restored.opinions[0]?.evidence[0]?.start).toBe(3);
});
