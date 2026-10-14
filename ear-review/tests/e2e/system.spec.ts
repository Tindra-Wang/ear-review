import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('output/playwright', { recursive: true });
test('桌面分析、原文定位与移动布局', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/try'); await expect(page.getByRole('heading', { name: '方面情感分析', exact: true })).toBeVisible();
  await expect(page.locator('.aspect-row').filter({ hasText: '音质' })).toContainText('正面');
  await expect(page.locator('.aspect-row').filter({ hasText: '佩戴舒适度' })).toContainText('负面');
  await page.screenshot({ path: 'output/playwright/analysis-desktop.png', fullPage: true });
  await page.getByLabel('耳机评论', { exact: true }).fill('🎧 音质很好但续航太短。'); await page.getByRole('button', { name: '分析评论', exact: true }).click();
  await expect(page.locator('.aspect-row').filter({ hasText: '续航' })).toContainText('负面');
  await page.locator('.aspect-row').filter({ hasText: '续航' }).click(); await expect(page.locator('.original-text mark')).toHaveText('续航太短');
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByRole('button', { name: '分析评论', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/analysis-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});
test('产品画像与按需求对比', async ({ page }) => {
  await page.goto('/products'); await expect(page.locator('.distribution-row')).toHaveCount(6); await expect(page.getByText('轻行 Air', { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: 'output/playwright/products-desktop.png', fullPage: true });
  await page.locator('.distribution-row').filter({ hasText: '降噪' }).click(); await expect(page.locator('.review-entry').first()).toBeVisible();
  await page.getByRole('link', { name: '产品对比', exact: true }).click(); await expect(page.locator('.comparison-cell')).toHaveCount(12);
  await page.getByRole('button', { name: '通勤', exact: true }).click(); await expect(page.locator('.comparison-cell')).toHaveCount(4);
  await page.locator('.compare-evidence').first().getByText('查看原文依据').click();
  await page.screenshot({ path: 'output/playwright/compare-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/compare-mobile.png', fullPage: true });
});
test('API 鉴权、校验、任务幂等、复核、导出', async ({ request }) => {
  expect((await request.post('/api/products', { data: { id: 'blocked', name: '未授权' } })).status()).toBe(401); expect((await request.post('/api/collections',{data:{}})).status()).toBe(401);
  expect((await request.post('/api/analyze', { data: { text: '音'.repeat(1001) } })).status()).toBe(400);
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'EarReview-Test-Only!' } }); expect(login.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await login.json()).token}` };
  const productId = `test-${Date.now()}`;
  expect((await request.post('/api/products', { headers, data: { id: productId, name: '集成测试产品' } })).ok()).toBe(true); expect((await request.post('/api/collections',{headers,data:{productId,platform:'jd',url:'https://127.0.0.1/123456.html'}})).status()).toBe(400);
  const csv = `productId,reviewId,text,source\n${productId},=formula,"音质很好，但戴久了耳朵疼。",教学\n${productId},=formula,"音质很好，但戴久了耳朵疼。",教学\nmissing,bad,"音质不错",教学`;
  const preview = await (await request.post('/api/imports/preview', { headers, data: { csv, source: '自动化测试教学样例', isSynthetic: true } })).json();
  expect(preview.valid).toBe(1); expect(preview.invalid).toBe(1); expect(preview.duplicates).toBe(1);
  const importedResponse = await request.post('/api/imports/commit', { headers, data: { token: preview.token } }); expect(importedResponse.ok()).toBe(true);
  const imported = await importedResponse.json(); expect(imported.inserted).toBe(1);
  expect((await request.post('/api/imports/commit', { headers, data: { token: preview.token } })).status()).toBe(400);
  const jobResponse = await request.post('/api/jobs', { headers, data: { batchId: imported.batchId } }); expect(jobResponse.ok()).toBe(true); const job = await jobResponse.json();
  await expect.poll(async () => (await (await request.get('/api/jobs', { headers })).json()).find((j: { id: number }) => j.id === job.id)?.status, { timeout: 15_000 }).toBe('completed');
  const repeated = await (await request.post('/api/jobs', { headers, data: { batchId: imported.batchId } })).json(); expect(repeated.id).toBe(job.id);
  const review = (await (await request.get(`/api/reviews?productId=${productId}`)).json()).rows[0];
  expect(review.opinions.find((o: { aspect: string }) => o.aspect === 'sound').sentiment).toBe('positive');
  const correction = await request.patch(`/api/reviews/${review.id}/correction`, { headers, data: { aspect: 'sound', sentiment: 'negative', evidence: '音质很好', reason: '验证人工复核与原模型分离' } }); expect(correction.ok()).toBe(true);
  const stats = await (await request.get(`/api/products/${productId}/stats`)).json(); expect(stats.aspects.find((a: { aspect: string }) => a.aspect === 'sound').negative).toBe(1);
  const pure = await (await request.get(`/api/products/${productId}/stats?pure=true`)).json(); expect(pure.aspects.find((a: { aspect: string }) => a.aspect === 'sound').positive).toBe(1);
  expect((await request.patch(`/api/reviews/${review.id}/correction`, { headers, data: { aspect: 'sound', sentiment: 'negative', evidence: '伪造证据', reason: '不应成功' } })).status()).toBe(400);
  const exportResponse = await request.get(`/api/export?productId=${productId}`, { headers }); expect(exportResponse.ok()).toBe(true); expect(await exportResponse.text()).toContain("'=formula");
  const repeatedPreview = await (await request.post('/api/imports/preview', { headers, data: { csv, source: '教学', isSynthetic: true } })).json(); expect(repeatedPreview.valid).toBe(0);
  await request.post('/api/auth/logout', { headers, data: {} }); expect((await request.get('/api/auth/me', { headers })).status()).toBe(401);
});
test('管理员页面完成导入与批次分析', async ({ page }) => {
  await page.goto('/data'); await page.getByLabel('密码', { exact: true }).fill('EarReview-Test-Only!'); await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入评论', exact: true })).toBeVisible();
  await page.getByLabel('或粘贴 CSV 内容', { exact: true }).fill('productId,reviewId,text,source\nqingxing,new-001,"音质不错，但续航时间太短。",教学\nqingxing,new-002,"佩戴很舒服，通话很清晰。",教学');
  await page.getByLabel('数据来源与使用说明', {exact:true}).fill('自动测试合成语料');
  await page.getByLabel('批次分析方法',{exact:true}).selectOption('hybrid');
  await page.getByRole('button', { name: '校验并预览', exact: true }).click(); await expect(page.getByText('2 条可导入', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '导入并开始分析', exact: true }).click(); await expect(page.locator('.job-row').filter({ hasText: '2/2' })).toContainText('已完成');
  await page.screenshot({ path: 'output/playwright/data-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '产品画像', exact: true }).click(); await page.getByRole('button', { name: '人工复核', exact: true }).first().click();
  await page.getByLabel('复核理由', { exact: true }).fill('人工核对原文，保存复核记录'); await page.getByRole('button', { name: '保存复核', exact: true }).click();
  await expect(page.getByText('复核已保存，画像与对比已同步更新。')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出筛选结果', exact: true }).click()]); expect(download.suggestedFilename()).toContain('评论分析');
});
test('上传自己的 CSV，映射中文列，自动编号并批量解析', async ({ page }) => {
  await page.goto('/data'); await page.getByLabel('密码', { exact: true }).fill('EarReview-Test-Only!'); await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  const name = `未知型号集合-${Date.now()}`;
  await page.getByRole('button', { name: '添加产品', exact: true }).click();
  await page.getByLabel('产品 ID', { exact: true }).fill(`collection-${Date.now()}`); await page.getByLabel('产品名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: '保存产品', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: '外部评论.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF评价内容,评分\n"安静办公室里降噪不错，到了地铁却很吵。",3\n"音质不错，但戴久了耳朵疼。",4') });
  await expect(page.getByText('识别到 2 条记录。', { exact: false })).toBeVisible();
  await expect(page.getByLabel('评论正文（必选）', { exact: true })).toHaveValue('评价内容');
  await page.getByLabel('统一导入产品 / 集合', { exact: true }).selectOption({ label: name });
  await page.getByLabel('数据来源与使用说明', { exact: true }).fill('测试构造数据，非真实消费者评论'); await page.getByLabel('批次分析方法',{exact:true}).selectOption('hybrid');
  await page.getByRole('button', { name: '校验并预览', exact: true }).click(); await expect(page.getByText('2 条可导入', { exact: false })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/imports/commit') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '导入并开始分析', exact: true }).click(); const batch = await (await saved).json();
  await expect(page.locator('.job-row').filter({ hasText: `批次 #${batch.batchId}` })).toContainText('已完成');
  await page.screenshot({ path: 'output/playwright/upload-mapping-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/upload-mapping-mobile.png', fullPage: true });
  await page.getByRole('link', { name: '产品画像', exact: true }).click(); await page.getByLabel('查看产品', { exact: true }).selectOption({ label: name });
  await expect(page.locator('.review-entry')).toHaveCount(2); await expect(page.locator('.review-meta').first()).toContainText('auto-');
});
test('模型未连接不降级，长评论不截断，批次逐条保留成功与失败', async ({ request }) => {
  const semantic = await request.post('/api/analyze', { data: { text: '降噪真厉害，地铁广播听得一清二楚。', mode: 'semantic' } });
  expect(semantic.status()).toBe(503); expect(await semantic.text()).toContain('未降级');
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'EarReview-Test-Only!' } });
  const headers = { Authorization: `Bearer ${(await login.json()).token}` }; const productId = `long-${Date.now()}`;
  await request.post('/api/products', { headers, data: { id: productId, name: '长文本验证' } });
  const csv = `评论内容\n音质很好\n${'戴久耳朵疼'.repeat(250)}`;
  const preview = await (await request.post('/api/imports/preview', { headers, data: { csv, productId, source: '测试构造长文本', isSynthetic: true } })).json();
  expect(preview.valid).toBe(2); expect(preview.rows[1].text.length).toBe(1250);
  const imported = await (await request.post('/api/imports/commit', { headers, data: { token: preview.token } })).json();
  const job = await (await request.post('/api/jobs', { headers, data: { batchId: imported.batchId } })).json();
  await expect.poll(async () => (await (await request.get('/api/jobs', { headers })).json()).find((j: { id: number }) => j.id === job.id)?.status).toBe('failed');
  const errors = await (await request.get(`/api/jobs/${job.id}/errors`, { headers })).json(); expect(errors).toHaveLength(1); expect(errors[0].message).toContain('未截断');
  const reviews = (await (await request.get(`/api/reviews?productId=${productId}`)).json()).rows; expect(reviews.filter((r: { analyzed: boolean }) => r.analyzed)).toHaveLength(1);
});

test('分析任务默认显示最新结果，历史失败不冒充当前失败，进度明确是已尝试',async({page})=>{
 await page.route('**/api/jobs',route=>route.fulfill({json:[{id:701,batchId:999,status:'completed',total:40,processed:40,modelVersion:'test-v4',createdAt:'test'},{id:700,batchId:999,status:'failed',total:40,processed:40,error:'17条历史失败',modelVersion:'test-v2',createdAt:'test'}]}));
 await page.goto('/data');await page.getByLabel('密码',{exact:true}).fill('EarReview-Test-Only!');await page.getByRole('button',{name:'登录工作台',exact:true}).click();
 await expect(page.getByText('批次 #999 · 任务 #701（最新）',{exact:true})).toBeVisible();await expect(page.getByText('17条历史失败',{exact:true})).toHaveCount(0);await expect(page.getByText('已完成 · 已尝试 40/40',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'查看历史任务',exact:true}).click();await expect(page.getByText('批次 #999 · 任务 #700（历史记录）',{exact:true})).toBeVisible();await expect(page.getByText('17条历史失败',{exact:true})).toBeVisible();
});
 test('用户首页汇总整批评价，单条分析只在辅助入口',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'这款耳机，大家怎么说？'})).toBeVisible();await page.getByLabel('查看耳机',{exact:true}).selectOption('qingxing');await expect(page.locator('.overview-findings')).toBeVisible();await expect(page.locator('.distribution-row')).toHaveCount(6);await expect(page.locator('#review-input')).toHaveCount(0);await page.screenshot({path:'output/playwright/overview-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'output/playwright/overview-mobile.png',fullPage:true});await page.getByRole('link',{name:'平台采集',exact:true}).click();await expect(page.getByRole('heading',{name:'获取平台评论'})).toBeVisible();});

 test('公开采集受限时显示真实状态，不提供虚假CSV',async({page})=>{
   await page.goto('/data');await page.getByLabel('密码',{exact:true}).fill('EarReview-Test-Only!');await page.getByRole('button',{name:'登录工作台',exact:true}).click();await expect(page.getByRole('heading',{name:'导入评论',exact:true})).toBeVisible();
   let requested=false;
   const fixture={id:99,productId:'qingxing',platform:'jd',itemId:'123456',url:'https://item.jd.com/123456.html',status:'blocked',requested:10,total:0,error:'平台响应 HTTP 444，本次公开采集不可用',createdAt:'test',updatedAt:'test'};
   await page.route('**/api/collections',async route=>{if(route.request().method()==='POST')requested=true;await route.fulfill({json:route.request().method()==='POST'?fixture:(requested?[fixture]:[])});});
   await page.getByRole('link',{name:'平台采集',exact:true}).click();await page.getByLabel('目标耳机',{exact:true}).selectOption('qingxing');await page.getByLabel('商品详情页链接或商品编号',{exact:true}).fill('https://item.jd.com/123456.html');await page.getByRole('button',{name:'开始公开采集',exact:true}).click();await expect(page.getByText('平台访问受限',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'下载 CSV',exact:true})).toHaveCount(0);await page.screenshot({path:'output/playwright/collection-blocked-desktop.png',fullPage:true});
 });

 test('搜索新耳机后直接贴商品链接，无需事先创建目标耳机',async({page})=>{
  await page.goto('/data');await page.getByLabel('密码',{exact:true}).fill('EarReview-Test-Only!');await page.getByRole('button',{name:'登录工作台',exact:true}).click();await expect(page.getByRole('heading',{name:'导入评论',exact:true})).toBeVisible();await page.getByRole('link',{name:'平台采集',exact:true}).click();
  await expect(page.getByLabel('目标耳机',{exact:true})).toHaveValue('');await page.getByPlaceholder('例如：品牌 + 型号').fill('华为 FreeClip');await page.getByLabel('商品详情页链接或商品编号',{exact:true}).fill('https://item.jd.com/100239311413.html?pcdk=tracking&spm=abc');await page.getByLabel('最多采集条数',{exact:true}).fill('1');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/collections')&&r.request().method()==='POST');await page.getByRole('button',{name:'开始公开采集',exact:true}).click();const saved=await response;expect(saved.ok()).toBe(true);const job=await saved.json();expect(job.productId).toBe('jd-100239311413');await expect(page.getByLabel('目标耳机',{exact:true})).toHaveValue(job.productId);await expect(page.getByRole('status')).toContainText('华为 FreeClip');
  await page.screenshot({path:'output/playwright/collection-auto-product-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'output/playwright/collection-auto-product-mobile.png',fullPage:true});
  await page.getByLabel('商品详情页链接或商品编号',{exact:true}).fill('https://item.jd.com/100239311414.html');await expect(page.getByLabel('目标耳机',{exact:true})).toHaveValue('');
 });

 test('浏览器辅助采集操作、结束CSV及导入预览（接口响应为测试夹具）',async({page})=>{
   await page.goto('/data');await page.getByLabel('密码',{exact:true}).fill('EarReview-Test-Only!');await page.getByRole('button',{name:'登录工作台',exact:true}).click();await expect(page.getByRole('heading',{name:'导入评论',exact:true})).toBeVisible();
   let started=false;let current={id:199,productId:'qingxing',platform:'jd',itemId:'123456',url:'https://item.jd.com/123456.html',method:'browser',status:'waiting',requested:10,total:0,error:null,createdAt:'test',updatedAt:'test'};
   await page.route('**/api/collections',async route=>{if(route.request().method()==='POST'){expect(route.request().postDataJSON().method).toBe('browser');started=true;}await route.fulfill({json:route.request().method()==='POST'?current:(started?[current]:[])});});
   await page.route('**/api/collections/199/read',async route=>{current={...current,total:2};await route.fulfill({json:{added:2,total:2,limitReached:false}});});
   await page.route('**/api/collections/199/finish',async route=>{current={...current,status:'completed'};await route.fulfill({json:current});});
   await page.route('**/api/collections/199/data',route=>route.fulfill({json:{csv:'productId,reviewId,text,source\nqingxing,browser-1,音质清晰,测试浏览器夹具\nqingxing,browser-2,佩戴不舒服,测试浏览器夹具',productId:'qingxing',url:current.url,platform:'jd'}}));
   await page.getByRole('link',{name:'平台采集',exact:true}).click();await page.getByLabel('目标耳机',{exact:true}).selectOption('qingxing');await page.getByLabel('商品详情页链接或商品编号',{exact:true}).fill(current.url);await page.getByRole('button',{name:'打开 Chrome 辅助采集',exact:true}).click();await expect(page.getByRole('button',{name:'读取当前评论页',exact:true})).toBeVisible();await page.getByRole('button',{name:'读取当前评论页',exact:true}).click();await expect(page.getByRole('status')).toContainText('累计2条');await page.getByRole('button',{name:'结束并生成 CSV',exact:true}).click();await page.getByRole('button',{name:'预览并导入',exact:true}).click();await expect(page.getByLabel('或粘贴 CSV 内容',{exact:true})).toHaveValue(/音质清晰/);await expect(page.getByLabel('统一导入产品 / 集合',{exact:true})).toHaveValue('qingxing');await page.getByRole('button',{name:'校验并预览',exact:true}).click();await expect(page.getByText('2 条可导入',{exact:false})).toBeVisible();
 });
