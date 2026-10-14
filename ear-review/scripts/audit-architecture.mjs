import ts from 'typescript';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd();
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);
const paths=['apps','packages','scripts'].flatMap(p=>walk(resolve(root,p))).filter(p=>/\.(ts|vue)$/.test(p)&&!p.endsWith('.test.ts'));
const name=p=>relative(root,p).replaceAll('\\','/');
const resolveImport=(p,s)=>{if(!s.startsWith('.'))return null;const base=resolve(dirname(p),s);return [base,base.replace(/\.js$/,'.ts'),base+'.ts',resolve(base,'index.ts')].find(p=>paths.includes(p))??null;};
const files=paths.map(path=>{
 const raw=readFileSync(path,'utf8');const code=path.endsWith('.vue')?(raw.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]??''):raw;
 const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const imports=[];let functions=0,methods=0,sqlCalls=0,refs=0;
 function visit(node){
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){if(node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){const s=node.moduleSpecifier.text;const target=resolveImport(path,s);const clause=ts.isImportDeclaration(node)?node.importClause:null;const typeOnly=!!node.isTypeOnly||!!clause?.isTypeOnly||!!(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&!clause.name&&clause.namedBindings.elements.every(e=>e.isTypeOnly));imports.push({specifier:s,target:target?name(target):null,typeOnly});}}
  if(ts.isCallExpression(node)){if(node.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(node.arguments[0])){const s=node.arguments[0].text,target=resolveImport(path,s);imports.push({specifier:s,target:target?name(target):null,typeOnly:false,dynamic:true});}const expr=node.expression.getText(ast);if(/^(this\.store|this\.db|store)\.(one|all|run|prepare|exec)$/.test(expr)||/^this\.(one|all|run)$/.test(expr))sqlCalls++;if(expr==='ref')refs++;}
  if(ts.isFunctionDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node))functions++;
  if(ts.isMethodDeclaration(node))methods++;
  ts.forEachChild(node,visit);
 }visit(ast);
 return {file:name(path),physicalLines:raw.split(/\r?\n/).length,bytes:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex'),functions,methods,sqlCalls,refs,imports};
});
const graph=new Map(files.map(f=>[f.file,new Set(f.imports.filter(i=>i.target&&!i.typeOnly).map(i=>i.target))]));
// Worker URL is a runtime dependency absent from the import syntax.
graph.get('apps/api/src/services/analysis-job-service.ts')?.add('apps/api/src/analysis-worker.ts');
for(const f of files){f.fanOut=graph.get(f.file).size;f.fanIn=files.filter(other=>graph.get(other.file).has(f.file)).length;}
let index=0;const indices=new Map(),low=new Map(),stack=[],onStack=new Set(),cycles=[];
function connect(v){indices.set(v,index);low.set(v,index++);stack.push(v);onStack.add(v);for(const w of graph.get(v)??[]){if(!indices.has(w)){connect(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(onStack.has(w))low.set(v,Math.min(low.get(v),indices.get(w)));}if(low.get(v)===indices.get(v)){let w;const group=[];do{w=stack.pop();onStack.delete(w);group.push(w);}while(w!==v);if(group.length>1)cycles.push(group);}}
for(const v of graph.keys())if(!indices.has(v))connect(v);
const api=readFileSync('apps/api/src/controller.ts','utf8');
const boundaryViolations=[];
for(const f of files){
 if((f.file==='apps/api/src/controller.ts'||f.file.startsWith('apps/api/src/services/'))&&f.sqlCalls>0)boundaryViolations.push(`${f.file} 直接执行 SQL`);
 for(const dep of graph.get(f.file)){
  if(f.file.startsWith('packages/nlp/')&&dep.startsWith('apps/'))boundaryViolations.push(`${f.file} -> ${dep}: NLP 反向依赖应用层`);
  if(f.file.startsWith('apps/api/src/repositories/')&&(dep.startsWith('packages/nlp/')||dep.startsWith('apps/web/')||dep.startsWith('apps/api/src/services/')))boundaryViolations.push(`${f.file} -> ${dep}: 仓储反向依赖业务/模型/前端`);
  if(f.file.startsWith('apps/web/src/composables/')&&dep.startsWith('apps/web/src/components/'))boundaryViolations.push(`${f.file} -> ${dep}: 业务状态依赖展示组件`);
 }
}
const report={generatedAt:new Date().toISOString(),scope:'生产 apps/packages/scripts 的 TypeScript/Vue script；排除测试、构建输出与 data 语料文件',limitations:'fan-in/fan-out 为本地源文件直接运行时依赖数量；不计外部包，type-only 单列；补入 Worker URL。不是完整调用图、圈复杂度或 LCOM。行数仅为物理行数，压缩模板不能由行数衡量复杂度。',fileCount:files.length,runtimeEdgeCount:[...graph.values()].reduce((sum,set)=>sum+set.size,0),runtimeCycles:cycles,controllerEndpoints:[...api.matchAll(/@(Get|Post|Patch|Delete)\('/g)].length,controllerSqlCalls:files.find(f=>f.file==='apps/api/src/controller.ts').sqlCalls,files};
report.boundaryViolations=boundaryViolations;
mkdirSync('docs/架构图',{recursive:true});writeFileSync('docs/架构图/架构检查指标.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,files:files.filter(f=>['apps/web/src/App.vue','apps/api/src/controller.ts','apps/api/src/store.ts','packages/nlp/index.ts','packages/nlp/semantic.ts','packages/nlp/model.ts'].includes(f.file)).map(({imports,...f})=>f)},null,2));
if(cycles.length||boundaryViolations.length)process.exitCode=1;
