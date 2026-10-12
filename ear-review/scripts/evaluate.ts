import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem, platform } from 'node:os';
import { analyze, MODEL } from '../packages/nlp/index.js';
import { EVALUATION_CASES } from '../data/evaluation-cases.js';
function metric(mode: 'hybrid' | 'rules') {
  let aspectTP = 0, aspectFP = 0, aspectFN = 0, pairTP = 0, pairFP = 0, pairFN = 0; const errors: unknown[] = []; const times: number[] = [];
  const counts: Record<string, { tp: number; fp: number; fn: number; support: number }> = Object.fromEntries(['positive','negative','neutral','mixed'].map(label => [label, { tp: 0, fp: 0, fn: 0, support: 0 }]));
  for (const row of EVALUATION_CASES) {
    const start = performance.now(); const result = analyze(row.text, mode); times.push(performance.now() - start);
    const goldAspects = new Set(row.expected.map(([aspect]) => aspect)); const predictedAspects = new Set(result.opinions.map(o => o.aspect));
    for (const aspect of predictedAspects) goldAspects.has(aspect) ? aspectTP++ : aspectFP++;
    for (const aspect of goldAspects) if (!predictedAspects.has(aspect)) aspectFN++;
    const gold = new Set(row.expected.map(([a,s]) => `${a}:${s}`)); const predicted = new Set(result.opinions.filter(o => o.status === 'classified').map(o => `${o.aspect}:${o.sentiment}`));
    for (const key of predicted) { const label = key.split(':')[1]!; if (gold.has(key)) { pairTP++; counts[label]!.tp++; } else { pairFP++; counts[label]!.fp++; } }
    for (const key of gold) { const label = key.split(':')[1]!; counts[label]!.support++; if (!predicted.has(key)) { pairFN++; counts[label]!.fn++; } }
    if ([...gold].some(k => !predicted.has(k)) || [...predicted].some(k => !gold.has(k))) errors.push({ text: row.text, expected: row.expected, actual: result.opinions.map(o => [o.aspect,o.sentiment,o.status]) });
  }
  const f1 = (tp: number, fp: number, fn: number) => 2 * tp / (2 * tp + fp + fn || 1);
  times.sort((a,b) => a-b);
  return { aspectMicroF1: f1(aspectTP,aspectFP,aspectFN), pairMicroF1: f1(pairTP,pairFP,pairFN), pairCounts: { tp: pairTP, fp: pairFP, fn: pairFN }, perLabel: Object.fromEntries(Object.entries(counts).map(([label, c]) => [label, { ...c, f1: f1(c.tp,c.fp,c.fn) }])), latencyP95Ms: times[Math.ceil(times.length * .95)-1], errors };
}
const output = { dataset: '独立人工编写教学检查集，非真实消费者数据', count: EVALUATION_CASES.length, version: MODEL.version, createdAt: new Date().toISOString(), environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model, memoryGB: Math.round(totalmem()/1024**3) }, hybrid: metric('hybrid'), rules: metric('rules'), limitations: '未获得真实耳机领域独立标注集；不得把教学检查集指标视作商业或领域泛化成绩。' };
mkdirSync('data', { recursive: true }); writeFileSync('data/evaluation.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify({ dataset: output.dataset, count: output.count, hybrid: output.hybrid.pairMicroF1, rules: output.rules.pairMicroF1, errors: output.hybrid.errors.length }, null, 2));
