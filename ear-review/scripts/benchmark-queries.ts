import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { ApplicationStore } from '../apps/api/src/application-bootstrap.js';
import { analyze } from '../packages/nlp/index.js';
import type { PreviewRow } from '../packages/contracts/index.js';

// 合成夹具、内存数据库；测仓储与聚合，不测模型生成、HTTP 或 CSV 文件解析。
const measurements = [];
for (const count of [100, 1000, 5000]) {
  const store = new ApplicationStore(':memory:', false);
  try {
    store.productRepository.create('benchmark', '基准测试耳机', '', '合成性能夹具');
    const rows: PreviewRow[] = Array.from({ length: count }, (_, i) => ({
      row: i + 2, productId: 'benchmark', reviewId: String(i),
      text: `音质很好，但戴久了耳朵疼。样本${i}`, source: '合成性能夹具',
      isSynthetic: true, valid: true, duplicate: false, errors: [],
    }));
    const started = performance.now();
    store.importRows(rows, '性能夹具.csv', '合成性能夹具');
    const importMs = performance.now() - started;
    for (const review of store.reviews('benchmark')) store.savePrediction(review.id, analyze(review.text));
    store.stats('benchmark'); // 预热后计时，每次仍读取完整数据并聚合。
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const stats = store.stats('benchmark')!;
      if (stats.analyzed !== count) throw new Error('夹具统计数量不一致');
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    measurements.push({ count, importRowsMs: importMs, statsP50Ms: samples[9], statsP95Ms: samples[18], samples: 20 });
  } finally { store.close(); }
}
const report = { measuredAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model,
  scope: '内存 SQLite，合成文本；importRows 不含文件解析；stats 包含完整仓储读取及六方面聚合，不含 HTTP/NLP 推理；20 次预热后样本，nearest-rank P50/P95', measurements };
writeFileSync('docs/架构图/查询性能验证.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
