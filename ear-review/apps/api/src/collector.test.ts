import { describe,it,expect,vi,afterEach } from 'vitest';
import {collectionTarget,parseCollectionPage,collectionCsv,collectPublic} from './collector.js';
afterEach(()=>vi.unstubAllGlobals());
describe('公开评论采集',()=>{
  it('只接受平台商品链接，不访问用户指定的任意主机',()=>{
    expect(collectionTarget('jd','https://item.jd.com/100012345678.html').itemId).toBe('100012345678');
    expect(collectionTarget('tmall','https://detail.tmall.com/item.htm?id=123456789').itemId).toBe('123456789');
    for(const url of ['http://127.0.0.1/12345','https://item.jd.com.evil.com/12345.html','https://user@item.jd.com/12345.html'])expect(()=>collectionTarget('jd',url)).toThrow();
  });
  it('解析真实响应形状和JSONP，不执行脚本，不用昵称当编号',()=>{
    expect(parseCollectionPage('jd',JSON.stringify({comments:[{id:1,content:'音质好',nickname:'用户'}]}))).toEqual([{id:'1',text:'音质好',date:''}]);
    expect(parseCollectionPage('tmall','callback({"rateDetail":{"rateList":[{"rateId":2,"rateContent":"续航差"}]}});')[0]?.text).toBe('续航差');
    expect(()=>parseCollectionPage('jd','<html>登录</html>')).toThrow('公开评论');
  });
  it('保留CSV中的换行引号，并处理公式单元格',()=>{
    const csv=collectionCsv('earphone',collectionTarget('jd','123456'),[{id:'1',text:'=测试"\n好',date:''}]);
    expect(csv).toContain("' =".replace(' ',''));expect(csv).toContain('""');expect(csv).toContain('jd-123456-1');
  });
  it('采集受限时返回blocked，不生成示例评论',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('拒绝',{status:403})));
    const result=await collectPublic(collectionTarget('jd','123456'),10,()=>{});expect(result.status).toBe('blocked');expect(result.rows).toEqual([]);
  });
  it('后续页失败保留先前评论并标partial；正文去重',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({comments:[{id:1,content:'音质好'},{id:2,content:'音质好'}]}))).mockResolvedValueOnce(new Response('拒绝',{status:403})));
    const result=await collectPublic(collectionTarget('jd','123456'),20,()=>{});expect(result.status).toBe('partial');expect(result.rows).toHaveLength(1);
  });
});
