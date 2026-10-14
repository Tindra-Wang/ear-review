import { HttpException } from '@nestjs/common';
import { object, string } from '../request-validation.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL } from '../../../../packages/nlp/index.js';
import { semanticStatus } from '../../../../packages/nlp/semantic.js';
import { analysisEngine } from '../../../../packages/nlp/engines.js';
export class ModelService {
    private requests = new Map<string, {
        count: number;
        until: number;
    }>();
    health() { return { app: 'ear-review', status: 'ok', modelVersion: MODEL.version, dataMode: '教学样例 + 用户导入' }; }
    async model() {
        const path = resolve('data/evaluation.json');
        const evaluation = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
        return { semantic: await semanticStatus(), version: MODEL.version, algorithm: '字符 n-gram 多项式朴素贝叶斯 + 领域规则（基线对照）', trainingExamples: MODEL.trainingExamples, dataKind: MODEL.dataKind, evaluation: evaluation?.version === MODEL.version ? evaluation : null, limitations: ['文本模型可能误判反讽和隐含评价，须结合原文复核', '大模型使用预训练权重推理，没有在本项目微调', '教学评估仅属于基线，不能作为大模型或真实评论的成绩'] };
    }
    async analyzeText(body: unknown, ip: string) {
        const key = ip;
        const current = this.requests.get(key);
        const entry = current && current.until > Date.now() ? current : { count: 0, until: Date.now() + 60000 };
        if (++entry.count > 60)
            throw new HttpException('分析请求过于频繁，请稍后重试', 429);
        this.requests.set(key, entry);
        const data = object(body);
        const text = string(data.text, '评论', data.mode === 'semantic' ? 5000 : 1000);
        if (data.mode === 'semantic') {
            try {
                return await analysisEngine('semantic').analyze(text);
            }
            catch (error) {
                throw new HttpException((error as Error).message, 503);
            }
        }
        const mode = data.mode === 'rules' ? 'rules' : 'hybrid';
        return analysisEngine(mode).analyze(text);
    }
}
