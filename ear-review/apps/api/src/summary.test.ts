import {createApplicationServices} from './application-services.js';
import {it,expect} from 'vitest';
import {ApplicationStore as Store} from './application-bootstrap.js';
import {ApiController} from './controller.js';
import type {Auth} from './auth.js';
import type {Analysis} from '../../../packages/contracts/index.js';
it('总结依据当前成功版本与修订，混合和待复核不伪造为明确优缺点',()=>{
  const store=new Store(':memory:',false);
  try{
    store.run("INSERT INTO products VALUES('test','耳机','','测试')");
    store.run("INSERT INTO reviews(product_id,external_id,text,fingerprint,source,synthetic) VALUES('test','1','音质好，降噪差','1','测试',1)");
    const result:Analysis={text:'音质好，降噪差',modelVersion:'test-v1',durationMs:1,warnings:[],opinions:[{aspect:'sound',sentiment:'positive',status:'classified',method:'test',evidence:[{text:'音质好',start:0,end:3,sentiment:'positive'}]},{aspect:'noise',sentiment:'negative',status:'review',method:'test',evidence:[{text:'降噪差',start:4,end:7,sentiment:'negative'}]}]};
    store.savePrediction(1,result);
    store.run("INSERT INTO corrections(review_id,version,aspect,result,reason,actor,created_at) VALUES(1,'test-v1','sound',?,'测试','admin','now')",JSON.stringify({...result.opinions[0],sentiment:'mixed'}));
    const controller=new ApiController(store,{} as Auth,createApplicationServices(store));
    expect(controller.summary('test').strengths).toEqual([]);expect(controller.summary('test').weaknesses).toEqual([]);expect(controller.summary('test').mixed).toBe(1);expect(controller.summary('test').pending).toBe(1);
    expect(controller.summary('test','true').strengths[0]?.count).toBe(1);
  }finally{store.close();}
});
