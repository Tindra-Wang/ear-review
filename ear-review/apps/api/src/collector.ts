import { createHash } from 'node:crypto';
export type Platform = 'jd' | 'tmall';
export interface CollectionTarget { platform: Platform; itemId: string; url: string }
export interface CollectedReview { id: string; text: string; date: string }
export function collectionTarget(platform: unknown, input: unknown): CollectionTarget {
  if(platform!=='jd'&&platform!=='tmall')throw Error('请选择京东或天猫');
  if(typeof input!=='string'||input.length>1000)throw Error('请输入商品链接或商品编号');
  let itemId=input.trim();
  if(!/^\d{5,20}$/.test(itemId)){
    let url:URL;try{url=new URL(itemId);}catch{throw Error('商品链接格式不正确');}
    if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('只支持平台 HTTPS 商品链接');
    if(platform==='jd'&&url.hostname==='item.jd.com')itemId=url.pathname.match(/^\/(\d+)\.html$/)?.[1]??'';
    else if(platform==='tmall'&&['detail.tmall.com','detail.tmall.hk'].includes(url.hostname)&&url.pathname==='/item.htm')itemId=url.searchParams.get('id')??'';
    else throw Error('链接与所选平台不匹配，请复制商品详情页链接');
  }
  if(!/^\d{5,20}$/.test(itemId))throw Error('无法识别商品编号');
  return {platform,itemId,url:platform==='jd'?`https://item.jd.com/${itemId}.html`:`https://detail.tmall.com/item.htm?id=${itemId}`};
}
export function parseCollectionPage(platform:Platform, body:string):CollectedReview[]{
  let raw:unknown;
  try{raw=JSON.parse(body);}catch{
    const jsonp=body.trim().match(/^[\w.$]+\s*\(([\s\S]*)\)\s*;?$/);
    if(!jsonp)throw Error('平台未返回公开评论数据，可能需要登录或限制了自动访问');
    try{raw=JSON.parse(jsonp[1]!);}catch{throw Error('平台评论响应无法解析');}
  }
  const data=raw as {comments?:unknown;rateDetail?:{rateList?:unknown};rateList?:unknown};
  const list=platform==='jd'?data?.comments:data?.rateDetail?.rateList??data?.rateList;
  if(!Array.isArray(list))throw Error('平台未开放本次匿名评论访问；请使用平台导出的 CSV');
  return list.flatMap((row:Record<string,unknown>)=>{
    if(!row||typeof row!=='object')return [];
    const text=platform==='jd'?row.content:row.rateContent;
    if(typeof text!=='string'||!text.trim()||Array.from(text).length>5000)return [];
    const hash=createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g,'')).digest('hex').slice(0,20);
    return [{id:String(row.id??row.rateId??hash),text:text.trim(),date:String(row.creationTime??row.rateDate??'')}];
  });
}
const csvCell=(value:string)=>`"${(/^[\s]*[=+@-]/.test(value)?"'":'')+value.replace(/"/g,'""')}"`;
export function collectionCsv(productId:string,target:CollectionTarget,rows:CollectedReview[],method:'public'|'browser'='public'){
  return '\uFEFF'+[['productId','reviewId','text','source','date','platformItemId'],...rows.map(r=>[productId,`${target.platform}-${target.itemId}-${r.id}`,r.text,`${target.platform==='jd'?'京东':'天猫'}${method==='browser'?'浏览器页面评论':'公开评论'} ${target.url}`,r.date,target.itemId])].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export async function collectPublic(target:CollectionTarget,limit:number,onProgress:(count:number)=>void){
  const rows:CollectedReview[]=[];const seen=new Set<string>();let error='';let pages=0;
  for(let page=0;page<Math.min(10,Math.ceil(limit/10));page++){
    const url=new URL(target.platform==='jd'?'https://club.jd.com/comment/productPageComments.action':'https://rate.tmall.com/list_detail_rate.htm');
    url.search=target.platform==='jd'?new URLSearchParams({productId:target.itemId,score:'0',sortType:'5',page:String(page),pageSize:'10'}).toString():new URLSearchParams({itemId:target.itemId,currentPage:String(page+1),pageSize:'10',order:'3'}).toString();
    try{
      const response=await fetch(url,{redirect:'error',headers:{Accept:'application/json',Referer:target.url},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error(`平台响应 HTTP ${response.status}，本次公开采集不可用`);
      if(Number(response.headers.get('content-length'))>2*1024*1024)throw Error('平台响应过大，已停止采集');
      const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('平台响应过大，已停止采集');
      const charset=/charset\s*=\s*(gbk|gb2312|gb18030)/i.test(response.headers.get('content-type')??'')?'gb18030':'utf-8';
      const result=parseCollectionPage(target.platform,new TextDecoder(charset).decode(bytes));pages++;
      if(!result.length)break;
      for(const row of result){const key=row.text.normalize('NFKC').replace(/\s+/g,'');if(!seen.has(key)){seen.add(key);rows.push(row);}if(rows.length>=limit)break;}
      onProgress(rows.length);if(rows.length>=limit)break;
      await new Promise(ok=>setTimeout(ok,1000));
    }catch(e){error=(e as Error).name==='TimeoutError'?'平台12秒内未响应，请稍后重试或上传 CSV':(e as Error).message;break;}
  }
  return {rows,pages,error,status:error?(rows.length?'partial':'blocked'):'completed'} as const;
}
