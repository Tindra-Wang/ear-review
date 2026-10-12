export const ASPECTS = [
  { id: 'sound', name: '音质', description: '声音、低音与清晰度' },
  { id: 'noise', name: '降噪', description: '环境噪声的隔绝效果' },
  { id: 'comfort', name: '佩戴舒适度', description: '贴合、重量与长时间佩戴' },
  { id: 'battery', name: '续航', description: '电量、使用时长与充电' },
  { id: 'call', name: '通话', description: '麦克风与通话清晰度' },
  { id: 'latency', name: '游戏延迟', description: '音画同步与响应速度' }
] as const;
export type AspectId = typeof ASPECTS[number]['id'];
export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed';
export type Status = 'classified' | 'review';
export const SENTIMENT_NAMES: Record<Sentiment, string> = { positive: '正面', negative: '负面', neutral: '中性', mixed: '混合' };
export interface Evidence { start: number; end: number; text: string; sentiment: Exclude<Sentiment, 'mixed'> }
export interface Opinion { aspect: AspectId; sentiment: Sentiment; status: Status; evidence: Evidence[]; method: string; corrected?: boolean; original?: Opinion }
export interface Analysis { text: string; opinions: Opinion[]; modelVersion: string; durationMs: number; warnings: string[] }
export interface Product { id: string; name: string; subtitle: string; source: string; count: number }
export interface Review { id: number; externalId: string; productId: string; text: string; source: string; isSynthetic: boolean; opinions: Opinion[]; analyzed: boolean }
export interface AspectStat { aspect: AspectId; total: number; positive: number; negative: number; neutral: number; mixed: number; pending: number; corrected: number; positiveRatio: number | null; examples: Review[] }
export interface ProductStats { product: Product; reviews: number; analyzed: number; synthetic: number; version: string; aspects: AspectStat[] }
export interface PreviewRow { row: number; productId: string; reviewId: string; text: string; source: string; isSynthetic: boolean; valid: boolean; duplicate: boolean; errors: string[] }
export interface ImportPreview { rows: PreviewRow[]; valid: number; invalid: number; duplicates: number; token: string }
export interface Job { id: number; batchId: number; status: 'queued' | 'running' | 'completed' | 'failed'; total: number; processed: number; error: string | null; modelVersion: string; createdAt: string }
