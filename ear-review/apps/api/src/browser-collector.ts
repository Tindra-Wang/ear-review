import {createHash} from 'node:crypto';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,type Browser,type Page} from 'playwright';
import {collectionTarget,type CollectionTarget,type CollectedReview} from './collector.js';
export const COMMENT_SELECTORS={jd:['.jdc-pc-rate-card-main','.comment-root .list .item > .info','.comment-item .comment-con','.comment-item .comment-content','[class*="commentItem"] [class*="commentContent"]','.evaluate-comment-item .comment-item-content'],tmall:['.tm-rate-fulltxt','.rate-grid .tm-rate-content','[class*="rate-item"] [class*="rate-content"]']};
export function browserRows(candidates:{text:string;id?:string;date?:string}[]):CollectedReview[]{const seen=new Set<string>();return candidates.flatMap(c=>{const text=c.text.trim();const key=text.normalize('NFKC').replace(/\s+/g,'');if(!key||Array.from(text).length>5000||/^(此用户未填写评价|此用户没有填写评价|系统默认好评)[。！!\s]*$/.test(text)||seen.has(key))return [];seen.add(key);return [{id:c.id?.trim().slice(0,100)||createHash('sha256').update(key).digest('hex').slice(0,24),text,date:(c.date??'').slice(0,100)}];});}
export function browserRestriction(url:string){try{const u=new URL(url);if(u.hostname==='pc-frequent-pro.pf.jd.com'||(u.hostname.endsWith('.jd.com')&&u.searchParams.get('reason')==='403'))return '当前Chrome页面被平台限制，请在此窗口正常访问平台首页、登录并返回对应商品评价区后重试。';}catch{}return '';}
export async function closeOwnedBrowser(browser:Browser){try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch{}await browser.close().catch(()=>{});}
// Persistent dedicated profile. Never copy or open the user's daily Chrome profile.
export async function launchChromeBrowser(url:string,profile=resolve('data/runtime/chrome-collector-profile'),headless=false):Promise<Browser>{
 const exe=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter((p):p is string=>!!p).map(root=>join(root,'Google','Chrome','Application','chrome.exe')).find(existsSync);if(!exe)throw Error('未找到Google Chrome，请安装后重试');mkdirSync(profile,{recursive:true});
 const port=await new Promise<number>((ok,fail)=>{const server=createServer();server.once('error',fail);server.listen(0,'127.0.0.1',()=>{const address=server.address();const value=typeof address==='object'&&address?address.port:0;server.close(()=>ok(value));});});
 const args=[`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,'--no-first-run','--no-default-browser-check',...(headless?['--headless=new']:[]),url];
 const child=spawn(exe,args,{stdio:'ignore',windowsHide:headless,detached:true});let exited=false;let spawnError=false;child.on('error',()=>spawnError=true);child.on('exit',()=>exited=true);child.unref();
 const endpoint=`http://127.0.0.1:${port}`;for(let attempt=0;attempt<60;attempt++){if(spawnError||exited)throw Error('Chrome启动失败或专用配置正在使用，请关闭采集专用窗口后重试');try{const r=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(300)});if(r.ok)return await chromium.connectOverCDP(endpoint,{timeout:5000,noDefaults:true});}catch{}await new Promise(ok=>setTimeout(ok,250));}
 if(child.pid)child.kill();throw Error('无法连接采集Chrome，请检查Chrome是否允许本机调试连接');
}
interface Session{browser:Browser;target:CollectionTarget;limit:number;rows:CollectedReview[];timer:ReturnType<typeof setTimeout>;reading:boolean;auto:boolean}
export class BrowserCollector{
 private sessions=new Map<number,Session>();
 constructor(private launcher:(url:string)=>Promise<Browser>=launchChromeBrowser){}
 async open(id:number,target:CollectionTarget,limit:number,onClose:()=>void){const browser=await this.launcher(target.url);const timer=setTimeout(()=>void this.close(id).then(onClose),20*60_000);timer.unref();this.sessions.set(id,{browser,target,limit,rows:[],timer,reading:false,auto:false});browser.on('disconnected',()=>{const s=this.sessions.get(id);if(s){clearTimeout(s.timer);this.sessions.delete(id);onClose();}});return browserRestriction(browser.contexts()[0]?.pages()[0]?.url()??'');}
 private page(s:Session):Page{const pages=s.browser.contexts().flatMap(c=>c.pages());const page=pages.find(p=>{try{return collectionTarget(s.target.platform,p.url()).itemId===s.target.itemId;}catch{return false;}});if(!page)throw Error(pages.map(p=>browserRestriction(p.url())).find(Boolean)||'请在采集Chrome中正常登录并打开对应商品评价区');return page;}
 async read(id:number){const s=this.sessions.get(id);if(!s)throw Error('采集Chrome已关闭或会话已结束');if(s.reading)throw Error('正在读取，请稍候');s.reading=true;
 try{const page=this.page(s);const candidates:{text:string;id:string;date:string}[]=[];for(const frame of page.frames()){let host='';try{host=new URL(frame.url()).hostname;}catch{continue;}const allowed=s.target.platform==='jd'?['item.jd.com','club.jd.com']:['detail.tmall.com','detail.tmall.hk','rate.tmall.com'];if(!allowed.includes(host))continue;
 candidates.push(...await frame.evaluate(selectors=>{const modal=document.querySelector<HTMLElement>('.jdc-pc-rate-card-main');if(modal?.getClientRects().length)selectors=['.jdc-pc-rate-card-main'];const rows:{text:string;id:string;date:string}[]=[];for(const selector of selectors)for(const node of document.querySelectorAll<HTMLElement>(selector)){if(!node.getClientRects().length||getComputedStyle(node).visibility==='hidden'||getComputedStyle(node).display==='none')continue;const root=node.closest('[data-comment-id],[data-rate-id],.comment-item,.rate-item,.jdc-pc-rate-card')??node;rows.push({text:node.innerText,id:root.getAttribute('data-comment-id')??root.getAttribute('data-rate-id')??'',date:root.querySelector<HTMLElement>('.tm-rate-date,.comment-time')?.innerText??''});}return rows;},COMMENT_SELECTORS[s.target.platform]));}
 const found=browserRows(candidates);if(!found.length)throw Error('评价区尚未加载或评论页面结构不匹配，请在采集Chrome打开评价区后重试');const existing=new Set(s.rows.map(r=>r.text.normalize('NFKC').replace(/\s+/g,'')));let added=0;for(const row of found){const key=row.text.normalize('NFKC').replace(/\s+/g,'');if(!existing.has(key)&&s.rows.length<s.limit){s.rows.push(row);existing.add(key);added++;}}return {rows:[...s.rows],added,limitReached:s.rows.length>=s.limit};
 }finally{s.reading=false;}}
 async automate(id:number,onPage:(rows:CollectedReview[])=>void){const s=this.sessions.get(id);if(!s)throw Error('采集Chrome已关闭');if(s.auto)throw Error('正在自动采集');s.auto=true;let pages=0;let reason='';
 try{const page=this.page(s);
 await page.locator(COMMENT_SELECTORS[s.target.platform].join(',')).first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
 const allReviews=page.getByText('全部评价',{exact:true}).first();if(await allReviews.isVisible().catch(()=>false)){await allReviews.click({timeout:5000}).catch(()=>{});await page.locator('.jdc-pc-rate-card-main').first().waitFor({state:'visible',timeout:5000}).catch(()=>{});}else{const reviewTab=page.getByText(/^(商品评价|评价|累计评价|大家评)(\s*[（(]?\d+.*)?$/).first();if(await reviewTab.isVisible().catch(()=>false))await reviewTab.click({timeout:3000}).catch(()=>{});}
 for(;pages<10;pages++){const result=await this.read(id);onPage(result.rows);if(result.limitReached){reason='已达到设定条数';break;}if(!result.added&&pages>0){reason='翻页后没有新评论，已停止';break;}
 const next=page.locator('.comment-page .ui-pager-next,.ui-page .ui-page-next,.rate-page .rate-page-next,a[rel="next"]').or(page.getByRole('button',{name:/^下一页$/})).or(page.getByRole('link',{name:/^下一页$/}));let clicked=false;
 for(let n=0;n<await next.count();n++){const button=next.nth(n);if(!await button.isVisible()||await button.isDisabled())continue;const className=await button.getAttribute('class')??'';if(/disabled|disable/.test(className))continue;await button.click({timeout:3000});clicked=true;break;}
 if(!clicked){clicked=await page.evaluate(()=>{let node=document.querySelector<HTMLElement>('.jdc-pc-rate-card-main')?.parentElement;while(node&&node!==document.body){const style=getComputedStyle(node);if(node.scrollHeight>node.clientHeight+20&&/auto|scroll/.test(style.overflowY)){node.scrollTop=node.scrollHeight;return true;}node=node.parentElement;}return false;});if(!clicked){reason='当前页未找到下一页或可加载评论的滚动区';break;}}await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});await new Promise(ok=>setTimeout(ok,1500));}
 return {rows:[...s.rows],reason:reason||'已达到最多10页，停止采集'};
 }finally{s.auto=false;}}
 async close(id:number){const s=this.sessions.get(id);if(!s)return;this.sessions.delete(id);clearTimeout(s.timer);await closeOwnedBrowser(s.browser);}
 async closeAll(){await Promise.all([...this.sessions.keys()].map(id=>this.close(id)));}
}
