import { performance } from 'node:perf_hooks';
import { ASPECTS, type Analysis, type AspectId, type Evidence, type Opinion } from '../contracts/index.js';
import { MODEL, predict, type Label, type Model } from './model.js';
export { MODEL, train, predict } from './model.js';
export const ASPECT_PATTERNS: Record<AspectId, RegExp> = {
  sound: /音质|声音|低音|高音|听歌|音效|失真|动圈|杂音/,
  noise: /降噪|隔音|噪音|噪声|环境声|地铁.*安静/,
  comfort: /佩戴|戴着|戴久|戴一|耳朵|耳塞|夹耳|掉落|贴合|入耳|重量|跑步.*掉/,
  battery: /续航|电量|电池|充电|没电|充一次|充电盒/,
  call: /通话|电话|麦克风|语音|收音|对方.*听/,
  latency: /延迟|游戏|音画|慢半拍|滞后|跟不上|同步/
};
const positive = /不错|很好|很棒|出色|满意|清晰|清楚|通透|有力|好听|细腻|自然|舒服|舒适|轻巧|稳固|贴合|耐用|持久|很长|很快|流畅|安静|干净|听得清|低延迟|延迟很低|延迟低|音画同步|声音同步|没有延迟|无延迟|不滞后|没有杂音|无杂音|不疼|没有不适|不差|不吵|不掉|不会掉|没什么延迟|好几天|同步正常/;
const negative = /很差|太差|糟糕|失望|刺耳|浑浊|发闷|失真|难听|不舒服|不舒适|胀痛|耳朵疼|夹耳|太重|掉落|难受|不耐用|太短|掉得太快|很慢|没电|听不清|模糊|断断续续|很小|慢半拍|不同步|跟不上|卡顿|延迟很高|延迟高|延迟明显|明显.*延迟|严重滞后|没什么用|无效|很吵|噪音很大|噪声很大|不好|不满意|不清晰|杂音|不算好|不太舒服|容易掉|只有.*小时|只能.*小时/;
const neutral = /一般|普通|中规中矩|支持|配有|采用|可以|有.*模式|重量.*克|参数|容量/;
function rulePolarity(text: string): Label | 'mixed' | undefined {
  // 先屏蔽固定正向否定表达，防止“不差”“无杂音”被单字否定误判。
  const protectedText = text.replace(/没有延迟|无延迟|没什么延迟|不滞后|没有杂音|无杂音|不疼|没有不适|不差|不吵|不会掉|不掉|音画同步|声音同步/g, '正向表达');
  const pos = positive.test(text) && !/不满意|不清晰|不算好|不太舒服|不舒服|不舒适|不好听|不好/.test(text);
  const neg = negative.test(protectedText);
  if (pos && neg) return 'mixed'; if (neg) return 'negative'; if (pos) return 'positive'; if (neutral.test(text)) return 'neutral'; return undefined;
}
export function splitClauses(text: string): { text: string; start: number; end: number }[] {
  const clauses: { text: string; start: number; end: number }[] = [];
  const matcher = /[^，。！？；\n,.!?;]+/g;
  for (const match of text.matchAll(matcher)) {
    const raw = match[0]; const leading = raw.length - raw.trimStart().length;
    const clean = raw.trim(); if (!clean) continue;
    // 转折词即使没有标点也切开，偏移仍指向原文。
    const separators = /但是|不过|可是|但/g; let offset = 0;
    for (const sep of clean.matchAll(separators)) {
      const part = clean.slice(offset, sep.index).trim(); const left = clean.slice(offset, sep.index).indexOf(part);
      if (part) clauses.push({ text: part, start: match.index! + leading + offset + left, end: match.index! + leading + offset + left + part.length });
      offset = sep.index! + sep[0].length;
    }
    const tail = clean.slice(offset).trim(); const left = clean.slice(offset).indexOf(tail);
    if (tail) clauses.push({ text: tail, start: match.index! + leading + offset + left, end: match.index! + leading + offset + left + tail.length });
  }
  return clauses;
}
export function analyze(text: string, mode: 'hybrid' | 'rules' | 'mnb' = 'hybrid', model: Model = MODEL): Analysis {
  const start = performance.now(); const opinions: Opinion[] = []; const warnings: string[] = [];
  const grouped = new Map<AspectId, { evidence: Evidence[]; pending: boolean; methods: Set<string> }>();
  for (const clause of splitClauses(text)) {
    let aspects = ASPECTS.filter(a => ASPECT_PATTERNS[a.id].test(clause.text)).map(a => a.id);
    // “打电话声音很小”中的声音归属通话，游戏同步中的声音归属延迟。
    if ((aspects.includes('call') || aspects.includes('latency')) && !/音质|低音|高音|听歌|音效/.test(clause.text)) aspects = aspects.filter(a => a !== 'sound');
    if (aspects.length === 0) continue;
    const polarity = mode === 'mnb' ? undefined : rulePolarity(clause.text);
    for (const aspect of aspects) {
      const group = grouped.get(aspect) ?? { evidence: [], pending: false, methods: new Set<string>() };
      const predicted = predict(model, clause.text, aspect);
      const ambiguous = mode !== 'mnb' && (polarity === 'mixed' || (aspects.length > 1 && /好|差|疼|吵|短|慢|清晰|舒服/.test(clause.text)));
      const fallbackReview = mode !== 'mnb' && polarity === undefined && (mode === 'rules' || predicted.margin < 3);
      const label = polarity && polarity !== 'mixed' ? polarity : predicted.label;
      group.pending ||= ambiguous || fallbackReview;
      group.evidence.push({ ...clause, sentiment: label });
      group.methods.add(mode === 'rules' ? '方面词典与情感规则' : polarity ? '领域规则校验（优先于 MNB 候选）' : '字符 n-gram + MNB 分类');
      grouped.set(aspect, group);
    }
  }
  for (const [aspect, group] of grouped) {
    const sentiments = new Set(group.evidence.map(e => e.sentiment));
    const sentiment = sentiments.has('positive') && sentiments.has('negative') ? 'mixed' : sentiments.has('negative') ? 'negative' : sentiments.has('positive') ? 'positive' : 'neutral';
    opinions.push({ aspect, sentiment, status: group.pending ? 'review' : 'classified', evidence: group.evidence, method: [...group.methods].join('；') });
  }
  if (!opinions.length) warnings.push('没有识别到六项评价方面，请输入更具体的耳机评价。');
  if (opinions.some(o => o.status === 'review')) warnings.push('部分表达较含糊或多个方面共享意见，建议人工复核。');
  return { text, opinions, modelVersion: mode === 'rules' ? 'rules-v1' : mode === 'mnb' ? `${model.version}-pure` : model.version, durationMs: Number((performance.now() - start).toFixed(2)), warnings };
}
