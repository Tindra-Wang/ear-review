import type { Page } from 'playwright';
import type { CollectionTarget } from './collector.js';

/** 驱动可见评价区；滚轮事件兼容虚拟列表，不能一次跳过尚未渲染的评论。 */
export async function advanceReviewPage(page: Page, target: CollectionTarget, selectors: readonly string[]) {
  const allowed = target.platform === 'jd' ? ['item.jd.com', 'club.jd.com'] : ['detail.tmall.com', 'detail.tmall.hk', 'rate.tmall.com'];
  for (const frame of page.frames()) {
    let host = ''; try { host = new URL(frame.url()).hostname; } catch { continue; }
    if (!allowed.includes(host)) continue;
    const next = frame.locator('.comment-page .ui-pager-next,.ui-page .ui-page-next,.rate-page .rate-page-next,a[rel="next"]')
      .or(frame.getByRole('button', { name: /^下一页$/ })).or(frame.getByRole('link', { name: /^下一页$/ }));
    for (let i = 0; i < await next.count(); i++) {
      const button = next.nth(i);
      if (!await button.isVisible() || await button.isDisabled() || /disabled|disable/.test(await button.getAttribute('class') ?? '')) continue;
      await button.click({ timeout: 3000 });
      return { available: true, moved: true };
    }
    const position = await frame.evaluate(selectors => {
      document.querySelectorAll('[data-ear-review-scroll]').forEach(n => n.removeAttribute('data-ear-review-scroll'));
      const card = Array.from(document.querySelectorAll<HTMLElement>('.jdc-pc-rate-card-main')).find(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
        ?? Array.from(document.querySelectorAll<HTMLElement>(selectors.join(','))).find(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
      let node = card?.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (node.scrollHeight > node.clientHeight + 20 && /auto|scroll/.test(style.overflowY)) {
          node.setAttribute('data-ear-review-scroll', 'active');
          return { top: node.scrollTop, height: node.scrollHeight, step: Math.max(200, Math.floor(node.clientHeight * .8)) };
        }
        node = node.parentElement;
      }
      return null;
    }, [...selectors]);
    if (!position) continue;
    const area = frame.locator('[data-ear-review-scroll="active"]');
    await area.hover({ timeout: 3000 });
    await page.mouse.wheel(0, position.step);
    await page.waitForTimeout(150);
    const after = await area.evaluate(n => ({ top: n.scrollTop, height: n.scrollHeight }));
    return { available: true, moved: after.top > position.top + 1 || after.height > position.height + 1 };
  }
  return { available: false, moved: false };
}
