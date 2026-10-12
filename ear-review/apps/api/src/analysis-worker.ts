import { parentPort, workerData } from 'node:worker_threads';
import { analyze } from '../../../packages/nlp/index.js';
const rows = workerData as { id: number; text: string }[];
for (const row of rows) parentPort!.postMessage({ id: row.id, result: analyze(row.text) });
parentPort!.postMessage({ done: true });
