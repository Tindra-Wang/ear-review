import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRAINING_DATA, type TrainingExample } from './training-data.js';
export const LABELS = ['positive', 'negative', 'neutral'] as const;
export type Label = typeof LABELS[number];
export interface Model { version: string; vocabulary: string[]; classes: Record<Label, { documents: number; total: number; counts: Record<string, number> }>; dataKind: string; trainingExamples: number }
export function features(text: string): Map<string, number> {
  const chars = Array.from(text.toLowerCase().replace(/[\s，。！？、；：,.!?;:]/g, ''));
  const result = new Map<string, number>();
  for (const n of [1, 2, 3]) for (let i = 0; i <= chars.length - n; i++) {
    const key = chars.slice(i, i + n).join(''); result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}
export function train(data: TrainingExample[]): Model {
  const classes = Object.fromEntries(LABELS.map(label => [label, { documents: 0, total: 0, counts: {} as Record<string, number> }])) as Model['classes'];
  const vocabulary = new Set<string>();
  for (const row of data) {
    const group = classes[row.label]; group.documents++;
    for (const [key, count] of features(`${row.aspect} ${row.text}`)) { vocabulary.add(key); group.counts[key] = (group.counts[key] ?? 0) + count; group.total += count; }
  }
  return { version: `mnb-${createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 8)}`, vocabulary: [...vocabulary].sort(), classes, dataKind: '人工编写的教学合成语料', trainingExamples: data.length };
}
export function loadModel(path: string): Model {
  const model = JSON.parse(readFileSync(path, 'utf8')) as Model;
  if (!model || typeof model.version !== 'string' || !/^mnb-[a-f0-9]{8}$/.test(model.version) || !Array.isArray(model.vocabulary) || !model.vocabulary.length || model.vocabulary.some(v => typeof v !== 'string') || typeof model.dataKind !== 'string') throw new Error('模型文件格式无效，请重新运行 npm run train');
  for (const label of LABELS) {
    const group = model.classes?.[label];
    if (!group || !Number.isFinite(group.documents) || group.documents <= 0 || !Number.isFinite(group.total) || group.total <= 0 || !group.counts || Object.values(group.counts).some(n => !Number.isFinite(n) || n < 0)) throw new Error('模型类别计数无效，请重新训练');
  }
  return model;
}
const modelPath = resolve(process.env.MODEL_PATH ?? 'data/model.json');
export const MODEL = existsSync(modelPath) ? loadModel(modelPath) : train(TRAINING_DATA);
export function predict(model: Model, text: string, aspect: string): { label: Label; margin: number } {
  const inputs = features(`${aspect} ${text}`); const vocab = new Set(model.vocabulary);
  const size = model.vocabulary.length; const docs = LABELS.reduce((n, label) => n + model.classes[label].documents, 0);
  const scores = LABELS.map(label => {
    const group = model.classes[label]; let score = Math.log((group.documents + 1) / (docs + 3));
    for (const [key, count] of inputs) if (vocab.has(key)) score += count * Math.log(((group.counts[key] ?? 0) + 1) / (group.total + size));
    return { label, score };
  }).sort((a, b) => b.score - a.score);
  return { label: scores[0]!.label, margin: scores[0]!.score - scores[1]!.score };
}
