import { parentPort, workerData } from 'node:worker_threads';
import { analysisEngine } from '../../../packages/nlp/engines.js';
const { rows, semantic, version } = workerData as { rows: { id: number; text: string }[]; semantic: boolean; version: string };
const engine = analysisEngine(semantic ? 'semantic' : 'hybrid');
if (semantic && engine.version !== version) throw new Error('模型配置发生变化，请重新创建任务');
let failures = 0;
for (const row of rows) {
  try {
    if (!semantic && Array.from(row.text).length > 1000) throw new Error('基线最多分析 1000 字，请选择本地语义模型，未截断原文');
    parentPort!.postMessage({ id: row.id, result: await engine.analyze(row.text) });
  } catch (error) { failures++; parentPort!.postMessage({ id: row.id, error: `评论 #${row.id}：${(error as Error).message}` }); }
}
parentPort!.postMessage({ done: true, failures });
