import { ASPECTS, type Analysis, type AspectId, type Sentiment } from '../contracts/index.js';
export interface ScoredCase { expected: [AspectId, Sentiment][]; analysis?: Analysis; error?: string }
const score = (tp: number, fp: number, fn: number) => ({ tp, fp, fn, precision: tp + fp ? tp / (tp+fp) : 0, recall: tp + fn ? tp / (tp+fn) : 0, f1: 2*tp+fp+fn ? 2*tp/(2*tp+fp+fn) : 0 });
export function comparisonMetrics(rows: ScoredCase[]) {
  let aTP=0,aFP=0,aFN=0,pTP=0,pFP=0,pFN=0,pending=0,opinions=0,evidenceCount=0,validEvidence=0;
  const perLabel = Object.fromEntries((['positive','negative','neutral','mixed'] as const).map(s => [s, {tp:0,fp:0,fn:0,support:0}]));
  const perAspect = Object.fromEntries(ASPECTS.map(a => [a.id,{tp:0,fp:0,fn:0,support:0}]));
  const times: number[]=[]; let exact=0;
  for (const row of rows) {
    const predictedOpinions=row.analysis?.opinions ?? [];
    const ga = new Set(row.expected.map(([a])=>a)); const pa = new Set(predictedOpinions.map(o=>o.aspect));
    for(const a of ga) { perAspect[a]!.support++; if(!pa.has(a)){aFN++;perAspect[a]!.fn++;} }
    for(const a of pa) { if(ga.has(a)){aTP++;perAspect[a]!.tp++;}else{aFP++;perAspect[a]!.fp++;} }
    const gold = new Set(row.expected.map(([a,s])=>`${a}:${s}`));
    const pred = new Set(predictedOpinions.filter(o=>o.status==='classified').map(o=>`${o.aspect}:${o.sentiment}`));
    for(const key of gold) { const label=key.split(':')[1] as Sentiment; perLabel[label]!.support++; if(!pred.has(key)){pFN++;perLabel[label]!.fn++;} }
    for(const key of pred) {const label=key.split(':')[1] as Sentiment;if(gold.has(key)){pTP++;perLabel[label]!.tp++;}else{pFP++;perLabel[label]!.fp++;} }
    if(!row.error && gold.size===pred.size && [...gold].every(k=>pred.has(k)))exact++;
    for(const o of predictedOpinions){opinions++;if(o.status==='review')pending++;for(const e of o.evidence){evidenceCount++;if(row.analysis?.text.slice(e.start,e.end)===e.text)validEvidence++;}}
    if(row.analysis)times.push(row.analysis.durationMs);
  }
  times.sort((a,b)=>a-b);const percentile=(p:number)=>times.length ? times[Math.max(0,Math.ceil(times.length*p)-1)]! : null;
  const labels=Object.fromEntries(Object.entries(perLabel).map(([k,c])=>[k,{...c,...score(c.tp,c.fp,c.fn)}]));
  const aspects=Object.fromEntries(Object.entries(perAspect).map(([k,c])=>[k,{...c,...score(c.tp,c.fp,c.fn)}]));
  const supported=Object.values(labels).filter(c=>c.support>0);
  return { cases:rows.length, failures:rows.filter(r=>r.error).length, aspect:score(aTP,aFP,aFN), pair:score(pTP,pFP,pFN), pairMacroF1:supported.length ? supported.reduce((s,c)=>s+c.f1,0)/supported.length : 0, perLabel:labels, perAspect:aspects, exactMatch:rows.length?exact/rows.length:0, pendingOpinions:pending, totalOpinions:opinions, pendingRate:opinions?pending/opinions:0, evidenceCount, evidenceSubstringValidRate:evidenceCount?validEvidence/evidenceCount:null, latencyP50Ms:percentile(.5),latencyP95Ms:percentile(.95), latencyScope:'成功请求的模型函数耗时；基线是进程内，语义包含HTTP和生成，不含Web统计/入库。失败不排除在质量评分之外。' };
}
