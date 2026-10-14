import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
if(existsSync('.env'))process.loadEnvFile('.env');
const model=process.env.OLLAMA_MODEL || 'qwen3:4b';
const match=/^([a-z0-9_-]+):([a-zA-Z0-9_.-]+)$/.exec(model);if(!match)throw Error('模型标签必须为name:tag，当前工具仅访问Ollama官方library');
const [,name,tag]=match;const root=resolve(process.env.OLLAMA_MODELS || '../模型权重');
const blobs=resolve(root,'blobs');const manifests=resolve(root,'manifests/registry.ollama.ai/library',name);
mkdirSync(blobs,{recursive:true});mkdirSync(manifests,{recursive:true});mkdirSync('data/runtime',{recursive:true});
const manifestFile=resolve('data/runtime',`${name}-${tag}-download-manifest.json`);
const registry=`https://registry.ollama.ai/v2/library/${name}`;
function download(url,file,resume=false){const args=['--fail','--location','--retry','3','--silent','--show-error'];if(process.env.HTTPS_PROXY)args.push('--proxy',process.env.HTTPS_PROXY);if(resume)args.push('--continue-at','-');args.push(url,'--output',file);const r=spawnSync('curl.exe',args,{stdio:'inherit',windowsHide:true});if(r.status!==0||r.error)throw Error(`官方下载失败：${r.error?.message || r.status}`);}
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
async function downloadLarge(url,file,size,digest){
  // Bounded ranges avoid long TLS streams interrupted by some local proxies. Final full digest is still verified.
  const chunkSize=32*1024**2;const count=Math.ceil(size/chunkSize);const dir=resolve('tools/downloads',`${digest}-chunks`);mkdirSync(dir,{recursive:true});let next=0;
  async function worker(){while(next<count){const i=next++;const start=i*chunkSize;const end=Math.min(size-1,start+chunkSize-1);const chunk=resolve(dir,`${i}.part`);if(existsSync(chunk)&&statSync(chunk).size===end-start+1)continue;
    const args=['--fail','--location','--retry','5','--retry-all-errors','--retry-delay','2','--connect-timeout','20','--max-time','120','--silent','--show-error','--range',`${start}-${end}`];if(process.env.HTTPS_PROXY)args.push('--proxy',process.env.HTTPS_PROXY);args.push(url,'--output',chunk+'.tmp');
    await new Promise((ok,bad)=>{const child=spawn('curl.exe',args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let error='';child.stderr.on('data',s=>{error+=String(s);});child.on('error',bad);child.on('exit',code=>code===0?ok():bad(Error(`分段${i}失败：${error.slice(-300)}`)));});
    if(statSync(chunk+'.tmp').size!==end-start+1)throw Error(`分段${i}长度错误，未合并`);renameSync(chunk+'.tmp',chunk);console.log(`权重分段 ${i+1}/${count} 完成`);
  }}
  const outcomes=await Promise.allSettled(Array.from({length:3},()=>worker()));const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  const out=createWriteStream(file);const finished=once(out,'finish');
  for(let i=0;i<count;i++)for await(const data of createReadStream(resolve(dir,`${i}.part`)))if(!out.write(data))await once(out,'drain');out.end();await finished;
}
download(`${registry}/manifests/${tag}`,manifestFile);
const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));const layers=[manifest.config,...manifest.layers];
for(const layer of layers){if(!/^sha256:[a-f0-9]{64}$/.test(layer.digest)||!Number.isSafeInteger(layer.size)||layer.size<0||layer.size>12*1024**3)throw Error('官方manifest字段无效');const digest=layer.digest.slice(7);const file=resolve(blobs,'sha256-'+digest);
  if(existsSync(file)&&statSync(file).size===layer.size&&await hash(file)===digest){console.log(`缓存已校验 ${digest.slice(0,12)} ${layer.size}字节`);continue;}
  if(existsSync(file))throw Error(`缓存文件校验错误，请先人工检查：${file}`);
  console.log(`下载 ${digest.slice(0,12)} ${layer.size}字节`);if(layer.size>256*1024**2)await downloadLarge(`${registry}/blobs/${layer.digest}`,file+'.download',layer.size,digest);else download(`${registry}/blobs/${layer.digest}`,file+'.download',true);
  if(statSync(file+'.download').size!==layer.size||await hash(file+'.download')!==digest)throw Error('下载文件大小或SHA256不匹配，未注册模型');renameSync(file+'.download',file);
}
writeFileSync(resolve(manifests,tag),readFileSync(manifestFile));
console.log(`模型${model}已从官方registry下载、逐层校验并注册到${root}`);
