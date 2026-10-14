import { existsSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { COMPARISON_CASES } from '../data/comparison-cases.js';
import { PROMPT_VERSION } from '../packages/nlp/semantic.js';
if(existsSync('.env'))process.loadEnvFile('.env');
async function verify(base:string,password:string,runtime:string){
async function request(path:string,body?:unknown,token?:string){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20_000)});const data=await response.json();if(!response.ok)throw Error(`${path}：${JSON.stringify(data)}`);return data;}
const login=await request('/auth/login',{username:'admin',password});const token=login.token as string;
const productId=`local-model-demo-${PROMPT_VERSION}`;
const selected=COMPARISON_CASES.filter(r=>['challenge-01','challenge-03','challenge-06'].includes(r.id));
const cell=(v:string)=>`"${v.replace(/"/g,'""')}"`;
const csv='\uFEFF'+[['productId','reviewId','text','source'],...selected.map(r=>[productId,r.id,r.text,'模型对照合成样例，非真实消费者评论'])].map(r=>r.map(cell).join(',')).join('\r\n');
mkdirSync('docs/实验结果',{recursive:true});writeFileSync('docs/实验结果/Web导入验证.csv',csv);
try{
  const products=await request('/products') as {id:string}[];
  if(!products.some(p=>p.id===productId))await request('/products',{id:productId,name:'本地语义模型验证',subtitle:'反讽、隐含通话和情境混合；实验合成数据'},token);
  const columns=await request('/imports/columns',{csv},token);
  const preview=await request('/imports/preview',{csv,mapping:columns.mapping,source:'本地模型实际Web导入验证，实验合成数据',isSynthetic:true,name:'本地语义模型CSV验证'},token);
  if(preview.valid!==3||preview.duplicates!==0)throw Error('独立测试库中应有3条新样例');
  const batch=await request('/imports/commit',{token:preview.token},token);
  const job=await request('/jobs',{batchId:batch.batchId,mode:'semantic'},token);
  if(!job)throw Error('未找到对应的实际模型分析任务');
  let current=job;const started=Date.now();
  while(!['completed','failed'].includes(current.status)&&Date.now()-started<10*60_000){await new Promise(ok=>setTimeout(ok,1000));const jobs=await request('/jobs',undefined,token);current=jobs.find((r:{id:number})=>r.id===job.id);}
  const reviews=await request(`/reviews?productId=${productId}`);const stats=await request(`/products/${productId}/stats`);
  const errors=current.status==='failed'?await request(`/jobs/${job.id}/errors`,undefined,token):[];
  const allAnalyzed=current.status==='completed'&&reviews.rows.length===3&&reviews.rows.every((r:{analyzed:boolean;modelVersion:string})=>r.analyzed&&r.modelVersion.endsWith(PROMPT_VERSION));
  const accounted=reviews.rows.length===3&&current.processed===3&&reviews.rows.every((r:{id:number;analyzed:boolean;modelVersion:string})=>r.analyzed?r.modelVersion.endsWith(PROMPT_VERSION):errors.some((e:{reviewId:number})=>e.reviewId===r.id));
  const result={completedAt:new Date().toISOString(),environment:{scope:'isolated-test-database',base,database:resolve(runtime,'ear-review.sqlite')},productId,columns:columns.mapping,preview:{valid:preview.valid,invalid:preview.invalid,duplicates:preview.duplicates},batch,job:current,errors,reviews:reviews.rows,stats,allAnalyzed,pipelineVerified:accounted&&['completed','failed'].includes(current.status),ok:allAnalyzed};
  writeFileSync('docs/实验结果/Web语义闭环验证.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({pipelineVerified:result.pipelineVerified,allAnalyzed:result.allAnalyzed,productId,batchId:batch.batchId,job:current.status,analyzed:stats.analyzed,failures:errors.length},null,2));
  if(!result.pipelineVerified)throw Error('Web流程有未记录或版本不符的结果，详情已保存');
}finally{await request('/auth/logout',{},token);}
}

// Never connect this fixture writer to the user's running demo server.
const entry=resolve('dist/server/apps/api/src/main.js');
if(!existsSync(entry))throw Error('请先执行 npm run build');
mkdirSync('output/semantic-web',{recursive:true});
const runtime=mkdtempSync(resolve('output/semantic-web/runtime-'));
const reservation=createServer();
await new Promise<void>((ok,fail)=>{reservation.once('error',fail);reservation.listen(0,'127.0.0.1',ok);});
const port=(reservation.address() as {port:number}).port;
await new Promise<void>((ok,fail)=>reservation.close(error=>error?fail(error):ok()));
const password=randomBytes(24).toString('hex');
const base=`http://127.0.0.1:${port}/api`;
const server=spawn(process.execPath,[entry],{windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),DATA_DIR:runtime,ADMIN_PASSWORD:password}});
let failed:Error|undefined;server.on('error',error=>{failed=error;});
try{
  let ready=false;
  for(let i=0;i<60;i++){
    if(failed)throw failed;if(server.exitCode!==null)throw Error('独立验证服务启动失败');
    try{const response=await fetch(base+'/health',{signal:AbortSignal.timeout(500)});if(response.ok&&(await response.json()).app==='ear-review'){ready=true;break;}}catch{}
    await new Promise(ok=>setTimeout(ok,250));
  }
  if(!ready)throw Error('独立验证服务启动超时');
  await verify(base,password,runtime);
}finally{server.kill();}
