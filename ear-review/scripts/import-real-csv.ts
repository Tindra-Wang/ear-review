import {existsSync,readFileSync,writeFileSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const base=`http://127.0.0.1:${process.env.PORT??3001}/api`;
async function request(path:string,body?:unknown,token?:string){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(`${path}: ${JSON.stringify(result)}`);return result;}
const password=process.env.ADMIN_PASSWORD??readFileSync(`${process.env.DATA_DIR??'data/runtime'}/admin-password.txt`,'utf8').trim();
const {token}=await request('/auth/login',{username:'admin',password});
const productId='real-bluetooth-corpus';const name='真实蓝牙耳机公开数据40条-v1';
try{
  const model=await request('/model');if(!model.semantic.ready)throw Error('本地语义模型未就绪，请先运行 npm run model:start');
  const products=await request('/products');if(!products.some((p:{id:string})=>p.id===productId))await request('/products',{id:productId,name:'公开蓝牙耳机评论集合（型号未知）',subtitle:'不同型号的40条原始公开评论；筛选样本，不作具体型号推荐'},token);
  const csv=readFileSync('data/raw/bluetooth-reviews-real-40.csv','utf8');const preview=await request('/imports/preview',{csv,name,source:'SetFit/amazon_reviews_multi_zh；关键词及人工筛选；非随机样本',isSynthetic:false},token);
  let batch;
  if(preview.valid)batch=await request('/imports/commit',{token:preview.token},token);
  else{const batches=await request('/batches',undefined,token);const existing=batches.find((b:{name:string;count:number})=>b.name===name&&b.count===40);if(!existing)throw Error('样例已存在但未找到对应批次，需核对记录');batch={batchId:existing.id,inserted:0};}
  const job=await request('/jobs',{batchId:batch.batchId,mode:'semantic'},token);console.log(JSON.stringify({productId,batch,jobId:job.id}));
  let current=job;const started=Date.now();let lastProgress=-1;
  while(!['completed','failed'].includes(current.status)&&Date.now()-started<20*60_000){await new Promise(ok=>setTimeout(ok,2000));const jobs=await request('/jobs',undefined,token);current=jobs.find((j:{id:number})=>j.id===job.id);if(current.processed!==lastProgress){lastProgress=current.processed;console.log(`${current.status} ${current.processed}/${current.total}`);}}
  const stats=await request(`/products/${productId}/stats`);const summary=await request(`/products/${productId}/summary`);const reviews=await request(`/reviews?productId=${productId}&size=100`);const errors=current.status==='failed'?await request(`/jobs/${current.id}/errors`,undefined,token):[];
  const currentVersionAnalyzed=reviews.rows.filter((r:{modelVersion?:string})=>r.modelVersion===model.semantic.version).length;
  const result={currentVersionAnalyzed,completedAt:new Date().toISOString(),productId,sourceCsv:'data/raw/bluetooth-reviews-real-40.csv',preview:{valid:preview.valid,invalid:preview.invalid,duplicates:preview.duplicates},batch,job:current,model:model.semantic,stats,summary,errors,reviews:reviews.rows,note:'实际本地模型推理和数据库汇总；没有方面级人工金标准，不报告准确率/F1'};
  writeFileSync('docs/实验结果/真实CSV闭环验证.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:current.status,analyzed:stats.analyzed,total:stats.reviews,synthetic:stats.synthetic,failures:errors.length}));
  if(!['completed','failed'].includes(current.status))throw Error('任务未在限定时间内结束');
}finally{await request('/auth/logout',{},token);}
