import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { train, LABELS } from '../packages/nlp/model.js';
import { TRAINING_DATA, type TrainingExample } from '../packages/nlp/training-data.js';
import { ASPECTS } from '../packages/contracts/index.js';
const args = process.argv.slice(2); const arg = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const input = arg('--data'); const output = arg('--output') ?? 'data/model.json';
let samples = TRAINING_DATA;
if (input) {
  samples = parse(readFileSync(input, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as TrainingExample[];
  if (!samples.length || samples.some(r => !ASPECTS.some(a => a.id === r.aspect) || !LABELS.includes(r.label) || !r.text?.trim())) throw new Error('标注 CSV 必须包含合法 aspect、text、label；label 为 positive/negative/neutral');
  if (LABELS.some(label => samples.filter(r => r.label === label).length < 3)) throw new Error('每种情感至少需要三条训练样例');
  if (!arg('--kind')) throw new Error('外部训练数据必须通过 --kind 说明来源类型，如“授权真实训练集”或“教学合成训练集”');
}
const model = train(samples); if (input) model.dataKind = arg('--kind')!;
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(model, null, 2));
console.log(`已导出 ${model.version}，${model.trainingExamples} 条${model.dataKind}。训练仅使用所提供的训练划分。`);
