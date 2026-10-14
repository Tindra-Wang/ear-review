import { expect, test } from 'vitest';
import { comparisonMetrics } from './comparison-metrics.js';
test('失败与待复核计漏判，标签错误同时计FP和FN，不靠排除样本提高成绩',()=>{
  const m=comparisonMetrics([
    {expected:[['sound','positive']],error:'connection failed'},
    {expected:[['noise','negative']],analysis:{text:'吵',modelVersion:'test',durationMs:2,warnings:[],opinions:[{aspect:'noise',sentiment:'negative',status:'review',method:'test',evidence:[]}]}},
    {expected:[['battery','positive']],analysis:{text:'短',modelVersion:'test',durationMs:1,warnings:[],opinions:[{aspect:'battery',sentiment:'negative',status:'classified',method:'test',evidence:[]}]}}
  ]);expect(m.pair).toMatchObject({tp:0,fp:1,fn:3,f1:0});expect(m.failures).toBe(1);expect(m.aspect).toMatchObject({tp:2,fn:1});expect(m.pendingOpinions).toBe(1);expect(m.exactMatch).toBe(0);
});
