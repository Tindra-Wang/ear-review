import {it,expect,vi} from 'vitest';
import {BrowserCollector} from './browser-collector.js';
import type {Request} from 'express';
import {Store} from './store.js';
import {ApiController} from './controller.js';
import type {Auth} from './auth.js';
vi.mock('./collector.js',async original=>({...await original<typeof import('./collector.js')>(),collectPublic:vi.fn().mockResolvedValue({rows:[],pages:0,error:'测试模拟访问受限',status:'blocked'})}));
const req={} as Request;
function setup(){const store=new Store(':memory:',false);return {store,controller:new ApiController(store,{require:()=> 'admin'} as unknown as Auth)};}
it('未预建耳机也能按链接创建任务，带追踪参数的同商品不会重复建产品',async()=>{
  const {store,controller}=setup();try{
    const first=controller.createCollection({platform:'jd',url:'https://item.jd.com/100239311413.html?pcdk=tracking&spm=abc',productName:'华为 FreeClip',limit:1},req)!;
    expect(first.productId).toBe('jd-100239311413');expect(first.url).toBe('https://item.jd.com/100239311413.html');
    expect(store.products()[0]?.name).toBe('华为 FreeClip');
    await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('blocked'));await Promise.resolve();
    controller.createCollection({platform:'jd',url:'100239311413',productName:'另一个搜索词',limit:1},req);
    await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('blocked'));
    expect(store.products()).toHaveLength(1);expect(store.products()[0]?.name).toBe('华为 FreeClip');
  }finally{store.close();}
});
it('只有链接时使用平台商品编号命名，不猜测真实品牌型号',async()=>{
  const {store,controller}=setup();try{controller.createCollection({platform:'tmall',url:'https://detail.tmall.com/item.htm?id=123456789',limit:1},req);await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('blocked'));expect(store.products()[0]?.name).toBe('天猫商品 123456789');}finally{store.close();}
});
it('无效链接与参数不留下自动创建的耳机',()=>{
  const {store,controller}=setup();try{expect(()=>controller.createCollection({platform:'jd',url:'https://127.0.0.1/a',productName:'华为',limit:1},req)).toThrow();expect(()=>controller.createCollection({platform:'jd',url:'123456',productName:'华为',limit:1001},req)).toThrow();expect(store.products()).toHaveLength(0);expect(controller.collections(req)).toHaveLength(0);}finally{store.close();}
});
it('已有耳机仍可选择归属，不额外创建平台编号记录',async()=>{
  const {store,controller}=setup();try{store.run("INSERT INTO products VALUES('huawei','华为 FreeClip','','用户创建')");const job=controller.createCollection({platform:'jd',url:'123456',productId:'huawei',limit:1},req);expect(job?.productId).toBe('huawei');await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('blocked'));expect(store.products()).toHaveLength(1);}finally{store.close();}
});
it('自动采集回写CSV并结束；所有写接口仍需登录',async()=>{
 const {store,controller}=setup();const service=new BrowserCollector();(controller as unknown as {browserCollector:BrowserCollector}).browserCollector=service;
 vi.spyOn(service,'open').mockResolvedValue('');vi.spyOn(service,'close').mockResolvedValue();vi.spyOn(service,'automate').mockImplementation(async(_id,save)=>{const rows=[{id:'real1',text:'音质好',date:''},{id:'real2',text:'续航不足',date:''}];save(rows);return {rows,reason:'已达到设定条数'};});
 try{const job=controller.createCollection({platform:'jd',url:'123456',method:'browser',limit:2},req)!;await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('completed'));expect(controller.collectionData(String(job.id),req).csv).toContain('续航不足');expect(()=>controller.autoBrowser(String(job.id),req)).toThrow('正在采集');}finally{await controller.onModuleDestroy();}
});
it('未达到设定条数且无法加载时标部分采集，保留CSV而非伪报完成',async()=>{
 const {store,controller}=setup();const service=new BrowserCollector();(controller as unknown as {browserCollector:BrowserCollector}).browserCollector=service;vi.spyOn(service,'open').mockResolvedValue('');vi.spyOn(service,'close').mockResolvedValue();vi.spyOn(service,'automate').mockImplementation(async(_id,save)=>{const rows=[{id:'preview-1',text:'音质清晰',date:''}];save(rows);return {rows,reason:'未找到下一页'};});
 try{const job=controller.createCollection({platform:'jd',url:'123456',method:'browser',limit:50},req)!;await vi.waitFor(()=>expect(controller.collections(req)[0]?.status).toBe('partial'));expect(controller.collections(req)[0]?.total).toBe(1);expect(controller.collectionData(String(job.id),req).csv).toContain('音质清晰');}finally{await controller.onModuleDestroy();}
});
