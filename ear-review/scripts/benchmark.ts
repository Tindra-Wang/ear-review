import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem, platform } from 'node:os';
import { analyze, MODEL } from '../packages/nlp/index.js';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const productResponse = await fetch(`${base}/api/products`); if (!productResponse.ok) throw new Error('请先启动本地系统');
const products = await productResponse.json() as { id: string; count: number }[];
if (!products.length) throw new Error('没有可查询的产品');
const url = `${base}/api/products/${products[0]!.id}/stats`; await fetch(url);
const durations: number[] = []; let failures = 0;
for (let round = 0; round < 10; round++) await Promise.all(Array.from({ length: 10 }, async () => {
  const start = performance.now(); const response = await fetch(url); await response.arrayBuffer(); durations.push(performance.now()-start); if (!response.ok) failures++;
}));
durations.sort((a,b) => a-b);
const start = performance.now();
for (let i=0;i<1000;i++) analyze(`样例${i}：音质很清晰，降噪不错。但戴久了耳朵疼，游戏声音慢半拍。`);
const result = { createdAt: new Date().toISOString(), version: MODEL.version, environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model, memoryGB: Math.round(totalmem()/1024**3) }, query: { endpoint: '/api/products/:id/stats', dataReviews: products[0]!.count, totalDatabaseReviews: products.reduce((n,p) => n+p.count,0), requests: 100, concurrency: 10, p95Ms: durations[Math.ceil(durations.length*.95)-1], failures, warmup: true }, nlpDirect: { syntheticTexts: 1000, totalMs: performance.now()-start, description: '进程内连续 NLP 调用，不含 HTTP、数据库和 Worker 调度；不是完整批次性能。' }, limitations: '小规模教学数据库冒烟测试；未验证 5000 条规模下的性能。' };
writeFileSync('data/benchmark.json',JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
