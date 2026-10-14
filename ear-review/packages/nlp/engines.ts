import type { Analysis } from '../contracts/index.js';
import { analyze, MODEL } from './index.js';
import { analyzeSemantic, semanticStatus, semanticVersion } from './semantic.js';
export type EngineMode = 'hybrid' | 'rules' | 'semantic';
/** HTTP 请求与批次任务使用同一推理入口，不改变各模型的算法或证据校验。 */
export interface AnalysisEngine {
    readonly version: string;
    readonly maxChars: number;
    analyze(text: string): Analysis | Promise<Analysis>;
    readiness(): Promise<{
        ready: boolean;
        message: string;
    }>;
}
export function analysisEngine(mode: EngineMode): AnalysisEngine {
    if (mode === 'semantic') {
        return {
            version: semanticVersion(),
            maxChars: 5000,
            analyze: analyzeSemantic,
            readiness: semanticStatus,
        };
    }
    return {
        version: MODEL.version,
        maxChars: 1000,
        analyze: text => analyze(text, mode),
        readiness: async () => ({ ready: true, message: '' }),
    };
}
// 保存的历史版本仍采用原有命名；只有此边界负责解析任务的模型类型。
export function engineModeForVersion(version: string): EngineMode {
    return version.startsWith('ollama-') ? 'semantic' : 'hybrid';
}
