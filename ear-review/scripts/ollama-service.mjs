import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
export async function ensureLocalModelService() {
  const endpoint=process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const url=new URL(endpoint);
  if(!['127.0.0.1','localhost'].includes(url.hostname))return; // remote service is explicitly configured; do not spawn locally.
  const ready=async()=>{try{return(await fetch(`${endpoint.replace(/\/$/,'')}/api/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
  if(await ready())return;
  const executable=resolve(process.env.OLLAMA_EXE || 'tools/ollama/ollama.exe');
  if(!existsSync(executable))return; // baseline works; UI explains unavailable semantic engine.
  const modelDir=resolve(process.env.OLLAMA_MODELS || '../模型权重');mkdirSync(modelDir,{recursive:true});mkdirSync('data/runtime',{recursive:true});
  const fd=openSync('data/runtime/ollama-server.log','a');
  const env={...process.env,OLLAMA_MODELS:modelDir,OLLAMA_HOST:url.host,OLLAMA_NO_CLOUD:'1',NO_PROXY:'localhost,127.0.0.1,::1'};
  delete env.HTTP_PROXY;delete env.ALL_PROXY;
  const child=spawn(executable,['serve'],{detached:true,windowsHide:true,stdio:['ignore',fd,fd],env});
  let failed=null;child.on('error',error=>{failed=error;});child.unref();closeSync(fd);
  for(let i=0;i<30;i++){if(failed)throw failed;if(await ready())return;await delay(300);}
  throw Error('本地Ollama启动超时，请检查data/runtime/ollama-server.log');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(existsSync('.env'))process.loadEnvFile('.env');
  await ensureLocalModelService();console.log('本地模型服务检查完成。');
}
