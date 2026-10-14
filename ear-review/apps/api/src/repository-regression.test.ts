import { describe, expect, test, vi } from 'vitest';
import { ApplicationStore } from './application-bootstrap.js';
import { analyze } from '../../../packages/nlp/index.js';
import { aggregateProductStats } from './services/product-statistics.js';
import type { PreviewRow } from '../../../packages/contracts/index.js';

describe('批量有效视图与分层回归', () => {
  test('1000 条评论只用两次批量 SELECT，纯模型视图一次；汇总不查询数据库', () => {
    const store = new ApplicationStore(':memory:', false);
    try {
      store.productRepository.create('bulk', '批量耳机', '', '测试');
      const rows: PreviewRow[] = Array.from({ length: 1000 }, (_, i) => ({
        row: i + 2, productId: 'bulk', reviewId: String(i), text: `音质很好，样本 ${i}`,
        source: '测试', isSynthetic: true, valid: true, duplicate: false, errors: [],
      }));
      store.importRows(rows, '批量.csv', '测试');
      const reviews = store.reviews('bulk');
      for (const r of reviews) store.savePrediction(r.id, analyze(r.text));
      const product = store.products()[0]!;
      const reads = vi.spyOn(store, 'all');
      const effective = store.reviews('bulk');
      expect(reads).toHaveBeenCalledTimes(2);
      expect(effective).toHaveLength(1000);
      expect(effective[0]?.id).toBeGreaterThan(effective[999]!.id);
      reads.mockClear();
      const stats = aggregateProductStats(product, effective, 'test');
      expect(stats.analyzed).toBe(1000);
      expect(stats.aspects.find(a => a.aspect === 'sound')?.positive).toBe(1000);
      expect(reads).not.toHaveBeenCalled();
      expect(store.reviews('bulk', true)).toEqual(effective);
      expect(reads).toHaveBeenCalledTimes(1);
    } finally { store.close(); }
  });

  test('同时间的最新预测按 rowid 选取，连续复核保留原模型证据且不跨版本', () => {
    const store = new ApplicationStore(':memory:', true);
    try {
      const review = store.reviews()[0]!;
      const baseline = analyze(review.text);
      const original = baseline.opinions[0]!;
      store.savePrediction(review.id, { ...baseline, modelVersion: 'new-engine' });
      store.run('UPDATE predictions SET updated_at=? WHERE review_id=?', '2026-01-01', review.id);
      for (const sentiment of ['negative', 'neutral'] as const) {
        store.reviewRepository.correct(review.id, 'new-engine', original.aspect,
          { ...original, sentiment }, '测试复核', 'admin');
      }
      store.reviewRepository.correct(review.id, baseline.modelVersion, original.aspect,
        { ...original, sentiment: 'mixed' }, '旧版本复核', 'admin');
      const current = store.review(review.id)!;
      expect(current.modelVersion).toBe('new-engine');
      const opinion = current.opinions.find(o => o.aspect === original.aspect)!;
      expect(opinion.sentiment).toBe('neutral');
      expect(opinion.original).toEqual(original);
      expect(store.review(review.id, true)?.opinions).toEqual(baseline.opinions);
      expect(store.reviewRepository.history(review.id)).toHaveLength(3);
    } finally { store.close(); }
  });
});
