import { expect, test } from 'vitest';
import { analyze, train } from './index.js';
test('纯分类器对照确实关闭情感规则，而混合基线仍由明确规则校验',()=>{
  // Deliberately wrong label demonstrates the difference; this fixture is never used in the application model.
  const model=train([{aspect:'sound',text:'音质刺耳',label:'positive'},{aspect:'battery',text:'电量太短',label:'negative'},{aspect:'noise',text:'支持降噪',label:'neutral'}]);
  expect(analyze('音质刺耳','mnb',model).opinions[0]?.sentiment).toBe('positive');
  expect(analyze('音质刺耳','hybrid',model).opinions[0]?.sentiment).toBe('negative');
  expect(analyze('音质刺耳','mnb',model).modelVersion).toContain('-pure');
});
