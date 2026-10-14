import { describe, expect, test } from 'vitest';
import { ApplicationStore as Store } from './application-bootstrap.js';
import { analyze, MODEL } from '../../../packages/nlp/index.js';
import type { PreviewRow } from '../../../packages/contracts/index.js';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
describe('持久化与统计口径', () => {
  test('批次包含真实关联产品及各产品评论数量，不混入其他批次', () => {
    const store = new Store(':memory:', false);
    for (const id of ['a','b']) store.run('INSERT INTO products VALUES(?,?,?,?)',id,`耳机 ${id}`,'','用户创建');
    const row = (productId:string, reviewId:string, text:string):PreviewRow => ({row:2,productId,reviewId,text,source:'测试来源',isSynthetic:false,valid:true,duplicate:false,errors:[]});
    const first=store.importRows([row('a','1','音质很好'),row('b','2','续航不错')],'两款耳机.csv','测试来源');
    store.importRows([row('a','3','声音清晰')],'另一批.csv','其他来源');
    const batch=store.batches().find(b=>b.id===first.batchId)!;
    expect(batch.count).toBe(2);expect(batch.products).toEqual([{id:'a',name:'耳机 a',count:1},{id:'b',name:'耳机 b',count:1}]);expect(batch.source).toBe('测试来源');store.close();
  });
  test('重复导入不重复计数，同评论同方面只计一次', () => {
    const store = new Store(':memory:', false); store.run('INSERT INTO products VALUES(?,?,?,?)','test','测试产品','','教学');
    const row: PreviewRow = { row: 2, productId: 'test', reviewId: '1', text: '音质很好，声音刺耳。', source: '教学', isSynthetic: true, valid: true, duplicate: false, errors: [] };
    expect(store.importRows([row],'test','教学').inserted).toBe(1); expect(store.importRows([row],'test','教学').inserted).toBe(0);
    const review = store.reviews('test')[0]!; store.savePrediction(review.id,analyze(review.text));
    const stat = store.stats('test')!.aspects.find(a => a.aspect === 'sound')!; expect(stat.total).toBe(1); expect(stat.mixed).toBe(1); expect(stat.positiveRatio).toBe(0); store.close();
  });
  test('人工复核更新有效视图但保留纯模型结果', () => {
    const store = new Store(':memory:', true); const review = store.reviews()[0]!; const opinion = review.opinions[0]!;
    store.run('INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)',review.id,MODEL.version,opinion.aspect,JSON.stringify({...opinion,sentiment:'neutral',status:'classified'}),'测试','admin',new Date().toISOString());
    expect(store.review(review.id)!.opinions.find(o => o.aspect === opinion.aspect)?.sentiment).toBe('neutral'); expect(store.review(review.id,true)!.opinions.find(o => o.aspect === opinion.aspect)?.sentiment).toBe(opinion.sentiment); store.close();
  });
  test('没有评论时占比为 null', () => { const store = new Store(':memory:', false); store.run('INSERT INTO products VALUES(?,?,?,?)','empty','空','',''); expect(store.stats('empty')!.aspects.every(a => a.total === 0 && a.positiveRatio === null)).toBe(true); store.close(); });
  test('语义版本与基线版本分别保存，复核不跨版本污染', () => {
    const store = new Store(':memory:', true); const review = store.reviews()[0]!; const baseline = analyze(review.text); const original = baseline.opinions[0]!;
    store.run('INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)', review.id, MODEL.version, original.aspect, JSON.stringify({ ...original, sentiment: 'neutral' }), '基线复核', 'admin', new Date().toISOString());
    store.savePrediction(review.id, { ...baseline, modelVersion: 'ollama-test-absa-v1' });
    expect(store.review(review.id)?.modelVersion).toBe('ollama-test-absa-v1');
    expect(store.review(review.id)?.opinions.find(o => o.aspect === original.aspect)?.corrected).toBeUndefined();
    expect(store.all('SELECT version FROM predictions WHERE review_id=?', review.id)).toHaveLength(2); store.close();
  });
  test('重新打开数据库保留结果，中断任务可重试', () => {
    mkdirSync('output/unit', { recursive: true }); const path = resolve(`output/unit/restart-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    const before = new Store(path, true); const review = before.reviews()[0]!; const batch = before.batches()[0]!;
    before.run("INSERT INTO jobs(batch_id,status,total,processed,version,created_at) VALUES(?,'running',12,0,?,?)",batch.id,MODEL.version,new Date().toISOString()); before.close();
    const after = new Store(path,true); expect(after.review(review.id)?.opinions).toEqual(review.opinions); expect(after.jobs()[0]?.status).toBe('failed'); expect(after.jobs()[0]?.error).toContain('重启'); after.close();
  });
});
