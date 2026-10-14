import {advanceReviewPage} from './browser-review-navigation.js';
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
 async automate(id:number,onPage:(rows:CollectedReview[])=>void,onWaiting?:(message:string|null)=>void){const s=this.sessions.get(id);if(!s)throw Error('采集Chrome已关闭');if(s.auto)throw Error('正在自动采集');s.auto=true;let pages=0;let reason='';let idleSince=0;
 try{let page:Page;const readyDeadline=Date.now()+300000;let notified=false;
 while(true){if(!this.sessions.has(id))throw Error('采集窗口已关闭');try{page=this.page(s);await page.waitForLoadState('domcontentloaded',{timeout:8000}).catch(()=>{});await new Promise(ok=>setTimeout(ok,300));page=this.page(s);if(notified)onWaiting?.(null);break;}catch(error){if(Date.now()>=readyDeadline)throw Error('等待商品页超过5分钟，请正常登录后重试自动采集');if(!notified){notified=true;onWaiting?.('等待在采集Chrome中正常登录或完成页面验证；回到对应商品页后会自动继续，无需再次点击');}await new Promise(ok=>setTimeout(ok,1500));}}
 await page.locator(COMMENT_SELECTORS[s.target.platform].join(',')).first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
 const fullReviews=page.locator('.jdc-pc-rate-card-main').filter({visible:true}).first();
 const allReviews=page.getByText(/^(查看)?全部评价\s*[>›»]?$/).filter({visible:true}).first();
 if(s.target.platform==='jd'&&!await fullReviews.isVisible().catch(()=>false)&&(await page.locator('.comment-root .list .item > .info').count()||await allReviews.count())){
   for(let attempt=0;attempt<3&&!await fullReviews.isVisible().catch(()=>false);attempt++){
    await allReviews.waitFor({state:'visible',timeout:5000}).catch(()=>{});
    if(await fullReviews.isVisible().catch(()=>false))break;
    await allReviews.click({timeout:2500}).catch(async()=>{
     if(!await fullReviews.isVisible().catch(()=>false))await allReviews.evaluate(node=>(node as HTMLElement).click()).catch(()=>{});
    });
    await fullReviews.waitFor({state:'visible',timeout:5000}).catch(()=>{});
   }
   if(!await fullReviews.isVisible().catch(()=>false))throw Error('未能自动打开完整评价区，未将商品页预览冒充全部评论，请稍后重试采集');

 }else if(!await fullReviews.isVisible().catch(()=>false)){const reviewTab=page.getByText(/^(商品评价|评价|累计评价|大家评)(\s*[（(]?\d+.*)?$/).filter({visible:true}).first();if(await reviewTab.isVisible().catch(()=>false))await reviewTab.click({timeout:3000}).catch(()=>{});}
 const maxLoads=Math.min(1000,Math.max(100,s.limit*12));
 for(;pages<maxLoads;pages++){
  page=this.page(s);
  const result=await this.read(id);onPage(result.rows);
  if(result.limitReached){reason='已达到设定条数';break;}
  const navigation=await advanceReviewPage(page,s.target,COMMENT_SELECTORS[s.target.platform]);
  if(!navigation.available){reason='当前页未找到下一页或可加载评论的滚动区';break;}
  if(result.added||navigation.moved)idleSince=0;
  else {idleSince ||= Date.now();if(Date.now()-idleSince>=20000){reason='评价区持续20秒未加载新评论，已停止并保留已得数据';break;}}
  await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});
  await page.waitForTimeout(800);
 }
 return {rows:[...s.rows],reason:reason||`已达到最多${maxLoads}次加载，保留已采集评论`};
 }finally{s.auto=false;}}
 async close(id:number){const s=this.sessions.get(id);if(!s)return;this.sessions.delete(id);clearTimeout(s.timer);await closeOwnedBrowser(s.browser);}
 async closeAll(){await Promise.all([...this.sessions.keys()].map(id=>this.close(id)));}
}
