import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Analysis } from '../packages/contracts/index.js';
import { COMPARISON_CASES } from '../data/comparison-cases.js';
import { TRAINING_DATA } from '../packages/nlp/training-data.js';
import { comparisonMetrics } from '../packages/nlp/comparison-metrics.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const { train } = await import('../packages/nlp/model.js');
const { analyze } = await import('../packages/nlp/index.js');
const { analyzeSemantic, semanticStatus, PROMPT_VERSION } = await import('../packages/nlp/semantic.js');
const root=resolve(process.env.OLLAMA_MODELS ?? '../模型权重');
const resultDir=resolve('docs/实验结果'); mkdirSync(resultDir,{recursive:true}); mkdirSync(resolve(root,'classifiers'),{recursive:true});
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const cell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
const datasetHash=sha(JSON.stringify(COMPARISON_CASES)); const trainingHash=sha(JSON.stringify(TRAINING_DATA));
const base=(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/,'');
const state=await semanticStatus(); if(!state.ready)throw Error(state.message);
async function fetchJson(path:string) {const r=await fetch(base+path,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(`Ollama ${path} ${r.status}`);return r.json();}
const tags=await fetchJson('/api/tags') as {models:{name:string;digest:string;size:number;details:unknown}[]};
const modelInfo=tags.models.find(m=>m.name===state.model)!;const runtimeInfo=await fetchJson('/api/version');
const trainingStarted=performance.now();const model=train(TRAINING_DATA);const trainingMs=performance.now()-trainingStarted;
const modelPath=resolve(root,'classifiers',`${model.version}.json`);writeFileSync(modelPath,JSON.stringify(model,null,2));
writeFileSync(resolve(resultDir,'MNB训练数据.csv'),'\uFEFF'+[['aspect','text','label'],...TRAINING_DATA.map(r=>[r.aspect,r.text,r.label])].map(r=>r.map(cell).join(',')).join('\r\n'));
writeFileSync(resolve(resultDir,'固定对照测试集.json'),JSON.stringify({provenance:'开发助手编写的教学与挑战样例，非真实消费者数据，未双人独立标注；在本地语义结果出现之前确定参考标签',datasetHash,trainingHash,cases:COMPARISON_CASES},null,2));
type Method='mnb'|'hybrid'|'rules'|'semantic';
const methods:Method[]=['mnb','hybrid','rules','semantic'];
interface Outcome {analysis?:Analysis;error?:string;attemptMs:number}
interface Row {id:string;group:string;kind:string;text:string;expected:typeof COMPARISON_CASES[number]['expected'];outputs:Record<Method,Outcome>}
const rows:Row[]=[]; const jsonPath=resolve(resultDir,'模型对照结果.json');
const resume=process.argv.includes('--resume');
const checkpoint=resume?JSON.parse(readFileSync(jsonPath,'utf8')):null;
if(checkpoint?.complete)throw Error('实验已经完成；不重复覆盖结果');
let gpuHeader='';let gpuSamples:string[]=[];
try {gpuHeader=execFileSync('nvidia-smi',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],{encoding:'utf8',windowsHide:true}).trim();}catch{}
async function deviceState(){try{return await fetchJson('/api/ps');}catch{return null;}}
const gpuTimer=setInterval(()=>{try{gpuSamples.push(execFileSync('nvidia-smi',['--query-gpu=memory.used,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',windowsHide:true,timeout:3000}).trim());}catch{}},2000);
gpuTimer.unref();
const startedAt=new Date().toISOString();let warmup:Outcome;
const t0=performance.now();try{warmup={analysis:await analyzeSemantic('说明书写着支持降噪，我还没有试听。'),attemptMs:performance.now()-t0};}catch(error){clearInterval(gpuTimer);throw Error(`模型预热失败：${String(error)}`);}
const device=await deviceState();
let processorOutput='';try{processorOutput=execFileSync(resolve(process.env.OLLAMA_EXE || 'tools/ollama/ollama.exe'),['ps'],{encoding:'utf8',windowsHide:true,env:{...process.env,NO_PROXY:'localhost,127.0.0.1,::1'}}).trim();}catch{}
const sourceHash=sha(['packages/nlp/index.ts','packages/nlp/model.ts','packages/nlp/semantic.ts','packages/nlp/comparison-metrics.ts','data/comparison-cases.ts'].map(p=>readFileSync(p,'utf8')).join('\n'));
let metadata={startedAt,modelInfo,runtimeInfo,device,processorOutput,gpuHardware:gpuHeader,cpu:cpus()[0]?.model,memoryBytes:totalmem(),node:process.version,weightsDirectory:root,datasetHash,trainingHash,sourceHash,modelSource:'https://ollama.com/library/qwen3:4b',runtimeSource:'https://github.com/ollama/ollama/releases/tag/v0.40.3',runtimeArchiveSha256:'e5ecff02dfc7cae8ddf6d6b7a7ac5f727ffeedf4491f44ae75ff5b0820dbbbd5',promptVersion:PROMPT_VERSION,decoding:{think:false,temperature:0,num_ctx:16384,num_predict:4096},training:{method:'TypeScript CPU 多项式朴素贝叶斯字符1/2/3gram，add-one smoothing',examples:model.trainingExamples,vocabulary:model.vocabulary.length,trainingMs,modelPath,bytes:statSync(modelPath).size,sha256:sha(readFileSync(modelPath)),classDocuments:Object.fromEntries(Object.entries(model.classes).map(([k,v])=>[k,v.documents]))},warmup,limitations:'合成探针、单次运行、未经独立人工标注；非真实领域泛化成绩；Qwen3未微调。',resumptions:[] as unknown[]};
if(checkpoint){
  const previous=checkpoint.metadata;
  for(const key of ['datasetHash','trainingHash','sourceHash','promptVersion'] as const)if(previous[key]!==metadata[key])throw Error(`暂停前后${key}不一致，拒绝拼接结果`);
  if(previous.modelInfo.digest!==modelInfo.digest||previous.runtimeInfo.version!==(runtimeInfo as {version:string}).version||previous.training.sha256!==metadata.training.sha256||JSON.stringify(previous.decoding)!==JSON.stringify(metadata.decoding))throw Error('模型、运行时、分类器或解码参数已变化，拒绝恢复');
  for(const [i,row] of checkpoint.rows.entries()){
    const sample=COMPARISON_CASES[i];
    if(!sample||['id','group','kind','text'].some(k=>row[k]!==sample[k as keyof typeof sample])||JSON.stringify(row.expected)!==JSON.stringify(sample.expected))throw Error('检查点不是固定测试集的连续前缀');
  }
  rows.push(...checkpoint.rows);
  metadata={...previous,resumptions:[...(previous.resumptions??[]),{resumedAt:startedAt,completedBeforeResume:rows.length,device,processorOutput,warmup,trainingMs,gpuSamplingScope:'此次恢复阶段；暂停前显存采样未保存'}]};
}
console.log(`MNB训练完成：${model.version}，${trainingMs.toFixed(3)} ms；Qwen3已预热，开始同一${COMPARISON_CASES.length}条测试。`);
try{
  for(const sample of COMPARISON_CASES.slice(rows.length)){
    const outputs={} as Record<Method,Outcome>;
    for(const method of methods){const start=performance.now();try{const analysis=method==='semantic'?await analyzeSemantic(sample.text):analyze(sample.text,method,model);outputs[method]={analysis,attemptMs:performance.now()-start};}catch(error){outputs[method]={error:(error as Error).message,attemptMs:performance.now()-start};}}
    rows.push({...sample,outputs});writeFileSync(jsonPath,JSON.stringify({complete:false,metadata,rows},null,2));
    const s=outputs.semantic;console.log(`${rows.length}/${COMPARISON_CASES.length} ${sample.id} ${s.error?'失败：'+s.error:`${s.analysis!.durationMs}ms ${s.analysis!.opinions.map(o=>`${o.aspect}:${o.sentiment}/${o.status}`).join(' ')||'无固定方面'}`}`);
  }
}finally{clearInterval(gpuTimer);}
const finalTags=await fetchJson('/api/tags') as typeof tags;
if(finalTags.models.find(m=>m.name===state.model)?.digest!==modelInfo.digest)throw Error('运行期间模型digest发生变化，不生成有效比较报告');
const scoreRows=(selected:Row[],method:Method)=>selected.map(r=>({expected:r.expected,...r.outputs[method]}));
const metrics=Object.fromEntries(methods.map(method=>[method,{overall:comparisonMetrics(scoreRows(rows,method)),teaching:comparisonMetrics(scoreRows(rows.filter(r=>r.group==='teaching'),method)),challenge:comparisonMetrics(scoreRows(rows.filter(r=>r.group==='challenge'),method))}]));
const completedAt=new Date().toISOString();
const gpuMemory=gpuSamples.flatMap(line=>line.split('\n').map(v=>Number(v.split(',')[0]?.trim()))).filter(Number.isFinite);
const gpu={samples:gpuSamples.length,maxDeviceUsedMiB:gpuMemory.length?Math.max(...gpuMemory):null,scope:`${resume?'仅恢复阶段，暂停前采样未保存；':''}nvidia-smi整卡已用显存2秒间隔采样，包含其他程序；不能当作隔离模型内存或严格瞬时峰值`,rawSamples:gpuSamples};
writeFileSync(jsonPath,JSON.stringify({complete:true,metadata:{...metadata,completedAt,gpu},metrics,rows},null,2));
const csv:unknown[][]=[['caseId','group','kind','text','reference','method','predicted','pending','error','attemptMs','modelVersion','evidence','rationale']];
for(const r of rows)for(const method of methods){const o=r.outputs[method];csv.push([r.id,r.group,r.kind,r.text,r.expected.map(([a,s])=>`${a}:${s}`).join(';'),method,o.analysis?.opinions.filter(p=>p.status==='classified').map(p=>`${p.aspect}:${p.sentiment}`).join(';'),o.analysis?.opinions.filter(p=>p.status==='review').map(p=>p.aspect).join(';'),o.error,o.attemptMs,o.analysis?.modelVersion,o.analysis?.opinions.flatMap(p=>p.evidence.map(e=>e.text)).join(';'),o.analysis?.opinions.map(p=>p.rationale??'').filter(Boolean).join(';')]);}
writeFileSync(resolve(resultDir,'逐条模型对照.csv'),'\uFEFF'+csv.map(r=>r.map(cell).join(',')).join('\r\n'));
const names:Record<Method,string>={mnb:'自行训练MNB（不加情感规则）',hybrid:'MNB＋领域规则（当前基线）',rules:'规则决策对照',semantic:'本地Qwen3-4B（预训练推理）'};
const pct=(n:number)=>(n*100).toFixed(2)+'%';
const lines=['# 本地文本模型与自行训练分类器对照实验报告','',`实验完成日期：${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'full',timeStyle:'long'}).format(new Date(completedAt))}。本报告由实际运行结果生成；命令教程另在交付回复提供。`,'','## 1. 实验目标与边界','','比较本地预训练文本模型与项目自行训练分类器，验证CSV业务所用分析模块的质量、证据和耗时。Qwen3只推理，没有微调；MNB由126条教学合成样例训练。参考标签和测试评论由开发助手编写，不是真实消费者数据，未经过双人独立标注；该结果只能作为实现检查和复杂表达探针，不能宣称领域准确率或模型最优性。','',`同一测试集共${rows.length}条：24条原有教学检查，18条新增复杂表达。测试在本地语义结果出现前固定，未据此调提示或模型。数据SHA256：${datasetHash}。没有训练/测试相同的完整评论，不代表语料来源独立或不存在风格泄漏。`,'','## 2. 实现与运行条件','',`CSV经编码解码、字段映射、校验、去重和事务入库；批次Worker调用同一分析模块，持久化版本化意见；证据必须逐字存在于原文，不满足则请求失败，失败不会改用基线。此次质量评价直接调用分析模块，另以实际Web导入检查验证业务闭环。`,'',`Qwen3标签${state.model}；digest ${modelInfo.digest}；下载文件大小${modelInfo.size}字节；运行时${JSON.stringify(runtimeInfo)}；提示版本${PROMPT_VERSION}。权重目录为${root}。`,'',`设备：${metadata.cpu}，内存${(metadata.memoryBytes/1024**3).toFixed(2)}GiB；${gpuHeader}。加载设备信息保存于原始JSON的device字段。2秒采样整卡已用显存最大值${gpu.maxDeviceUsedMiB??'不可用'}MiB，包含其他进程，不是隔离模型显存。`,'',`解码：非思考模式，temperature=0，上下文16384，输出上限4096。预热请求约${warmup.analysis!.durationMs}ms，加载约${warmup.analysis!.inference?.loadMs.toFixed(2)}ms；该预热样例不参与质量评分。`,'','## 3. 分类器训练','',`字符1/2/3gram和方面标记形成1172项词表，三类各42条，使用多项式朴素贝叶斯与加一平滑。当前训练函数耗时${trainingMs.toFixed(3)}ms，只含内存计数，不含启动/文件IO；没有epoch、优化器或梯度loss。训练模型保存在${modelPath}，${statSync(modelPath).size}字节，版本${model.version}，模型SHA256为${metadata.training.sha256}。`,'','纯MNB与hybrid共享词典方面识别和分句；纯MNB关闭情感规则及分差拒判，对检测到的片段直接分类；hybrid保留规则与拒判。两者都无法通过方面词典检测到未命中表达，需与Qwen3完整上下文抽取区分。','','## 4. 同一测试集的结果',''];
for(const method of methods){const m=metrics[method]!;lines.push(`### ${names[method]}`,'',`全体：方面micro-F1 ${pct(m.overall.aspect.f1)}；方面—情感micro-F1 ${pct(m.overall.pair.f1)}；支持类别macro-F1 ${pct(m.overall.pairMacroF1)}；整评论标签集合完全匹配 ${pct(m.overall.exactMatch)}。`,`教学24条：方面—情感F1 ${pct(m.teaching.pair.f1)}；复杂18条：方面—情感F1 ${pct(m.challenge.pair.f1)}。`,`全体TP/FP/FN=${m.overall.pair.tp}/${m.overall.pair.fp}/${m.overall.pair.fn}，失败${m.overall.failures}条，待复核${m.overall.pendingOpinions}条方面意见。成功分析p50/p95=${m.overall.latencyP50Ms}/${m.overall.latencyP95Ms}ms。`,'');}
lines.push('## 5. 评分口径','','方面F1比较固定类别集合；方面—情感F1同时要求类别与情感正确。待复核不进入已判定预测，但真值仍计漏判；失败请求保留在质量评分中；错误标签产生FP及FN。macro-F1按该子集中存在真值的情感类别平均；逐类支持数在原始JSON。p50/p95仅来自成功函数调用，基线为进程内计时，Qwen3包含HTTP和生成，不包括Web入库/画像，因此不能当成相同服务端端到端时延。','','原文子串有效率只说明位置与内容一致，不能证明情感和理由语义正确。强度不是置信度。一次低温运行不证明生成确定性；不同权重、运行时、提示或设备应重新测试。','','## 6. 逐条差异与错误','','完整逐条预测、证据、理由、拒判和请求失败见 [逐条模型对照.csv](实验结果/逐条模型对照.csv)，原始结果见 [模型对照结果.json](实验结果/模型对照结果.json)。下面列出复杂样例差异，不只选成功案例：','');
for(const r of rows.filter(r=>r.group==='challenge')){const format=(o:Outcome)=>o.error?`失败：${o.error}`:o.analysis!.opinions.map(p=>`${p.aspect}:${p.sentiment}${p.status==='review'?'（待复核）':''}`).join('；')||'无固定方面';lines.push(`- ${r.id}（${r.kind}）：“${r.text}” 参考=${r.expected.map(([a,s])=>`${a}:${s}`).join('；')||'无固定方面'}；纯MNB=${format(r.outputs.mnb)}；Qwen3=${format(r.outputs.semantic)}。`);}
const mnbF1=metrics.mnb!.overall.pair.f1;const qF1=metrics.semantic!.overall.pair.f1;
lines.push('','## 7. 结论与局限','',`该固定合成检查集上，Qwen3相对纯MNB的方面—情感F1差值为${((qF1-mnbF1)*100).toFixed(2)}个百分点。该差值是本次实测，不外推其他数据或将报告写成预设优胜结论。是否适合真实耳机评论，还需授权数据、独立人工标注、验证/测试划分及多次测量。`,'','模型适配已经完成本地实际运行和同一输入对照；统计界面、人工复核和CSV导入提供业务闭环。真实训练语料扩充、神经网络微调、跨型号泛化和全规模5000条性能验收仍未完成。','',`结果文件的complete=true表示${rows.length}条全部尝试并完成结果汇总，不表示每条模型请求都成功。失败数量按上文和原始JSON如实报告。`,'');
if(String(PROMPT_VERSION)==='absa-v2'){
  lines[lines.findIndex(s=>s.startsWith('同一测试集共'))]=`同一测试集共${rows.length}条：24条教学检查与18条复杂表达。原始集合在首轮absa-v1推理前固定。首轮所有已抽取意见均为review；根据该运行缺陷补充status=classified的明确语义后，使用absa-v2同集工程复测。测试标签未改，但该集合已参与开发诊断，因此不是未见独立测试，不据此宣称泛化提升。数据SHA256：${datasetHash}。`;
  lines.push('','## 8. 首轮失败与工程复测','',`[首轮absa-v1报告](模型对照实验报告-absa-v1.md)和[原始结果](实验结果/absa-v1/模型对照结果.json)完整保留。首轮Qwen3的49条抽取意见全部待复核、4条请求失败，方面—情感F1为0。补充明确评价应使用classified、原文不足才review的状态说明；没有更改参考标签、强制自动确认或取消证据验证。此轮为同集开发复测，不能当作独立验证提示有效性的实验。`,'');
}
if(resume)lines.push('','## 暂停与恢复记录','',`实验按用户要求暂停后恢复，保留原有${checkpoint.rows.length}条预测与耗时，继续剩余测试。恢复前核对固定测试集、训练集、分析源码、提示、解码配置、模型权重digest、分类器SHA256及Ollama版本一致。预热不计入评分，恢复记录见原始JSON的resumptions。显存最大值仅覆盖恢复阶段，不是整场实验峰值。`,'');
writeFileSync(resolve('docs/模型对照实验报告.md'),lines.join('\n'));
console.log(JSON.stringify({completedAt,report:'docs/模型对照实验报告.md',metrics},null,2));
