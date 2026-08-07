/**
 * 轻路由（对标 Phoenix live_patch）。
 *
 * 这一层只做两件事：改地址栏、把新 URL 拆成载荷。错了的后果分两种 ——
 * 载荷拆错服务端就读不到参数（页面停在默认标签页），地址栏没改则后退键失灵。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pushTo, urlPayload } from '../src/patch-nav';

function goTo(url: string): void {
  history.replaceState({}, '', url);
}

beforeEach(() => goTo('/board?tab=待办'));

describe('urlPayload', () => {
  it('拆出路径和查询', () => {
    expect(urlPayload()).toEqual({ path: '/board', query: { tab: '待办' } });
  });

  it('多个查询值都在，值一律是字符串', () => {
    goTo('/board?tab=已完成&page=2');
    expect(urlPayload()).toEqual({ path: '/board', query: { tab: '已完成', page: '2' } });
  });

  it('没有查询串时 query 是空对象，不是 undefined', () => {
    goTo('/board');
    expect(urlPayload()).toEqual({ path: '/board', query: {} });
  });

  it('百分号编码的中文要解出来（服务端拿到的是原文）', () => {
    goTo('/board?tab=' + encodeURIComponent('进行中'));
    expect(urlPayload().query).toEqual({ tab: '进行中' });
  });

  it('给了 url 就按那个算（服务端 push_patch 用这条）', () => {
    expect(urlPayload('/other?x=1')).toEqual({ path: '/other', query: { x: '1' } });
  });
});

describe('pushTo', () => {
  it('相对查询串：路径不变，只换查询', () => {
    const p = pushTo('?tab=已完成');
    expect(location.pathname).toBe('/board');
    expect(decodeURIComponent(location.search)).toBe('?tab=已完成');
    expect(p).toEqual({ path: '/board', query: { tab: '已完成' } });
  });

  it('绝对路径：路径也换掉（路由写成 /board/:id 时的详情页）', () => {
    const p = pushTo('/board/7?x=1');
    expect(location.pathname).toBe('/board/7');
    expect(p).toEqual({ path: '/board/7', query: { x: '1' } });
  });

  it('进历史 —— 后退键要管用', () => {
    const spy = vi.spyOn(history, 'pushState');
    pushTo('?tab=已完成');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('hash 一起带上，不吞掉', () => {
    pushTo('?tab=a#锚点');
    expect(decodeURIComponent(location.hash)).toBe('#锚点');
  });

  it('跨源目标不拦，交给浏览器正常跳走', () => {
    const before = location.href;
    const p = pushTo('https://example.com/x');
    // jsdom 里改 location.href 不会真跳，但至少不该当成本站 patch
    expect(p).toEqual({});
    expect(location.pathname).toBe(new URL(before).pathname);
  });

  it('pushState 被禁时不抛，载荷照样给出来', () => {
    const spy = vi.spyOn(history, 'pushState').mockImplementation(() => {
      throw new Error('禁用了');
    });
    expect(() => pushTo('?tab=x')).not.toThrow();
    expect(pushTo('?tab=x').query).toEqual({ tab: 'x' });
    spy.mockRestore();
  });
});

/**
 * replace —— 给搜索框那种「每敲几个字就同步一次 URL」用。
 * 走 push 的话打完一句话会在历史里留下四五条，后退键像坏了一样。
 */
describe('pushTo(target, replace)', () => {
  it('replace 时用 replaceState，不进历史', () => {
    const push = vi.spyOn(history, 'pushState');
    const rep = vi.spyOn(history, 'replaceState');
    pushTo('?q=去公园', true);
    expect(rep).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
    rep.mockRestore();
  });

  it('地址栏照样变 —— 不进历史不等于不改 URL（还要能收藏、能分享）', () => {
    pushTo('?q=去公园', true);
    expect(decodeURIComponent(location.search)).toBe('?q=去公园');
  });

  it('载荷跟 push 那条一模一样，服务端读不出区别', () => {
    expect(pushTo('?q=x', true)).toEqual(pushTo('?q=x', false));
  });

  it('不传第二个参数时还是 push（老调用点行为不变）', () => {
    const push = vi.spyOn(history, 'pushState');
    pushTo('?tab=已完成');
    expect(push).toHaveBeenCalled();
    push.mockRestore();
  });

  it('replaceState 被禁时不抛', () => {
    const spy = vi.spyOn(history, 'replaceState').mockImplementation(() => {
      throw new Error('禁用了');
    });
    expect(() => pushTo('?q=x', true)).not.toThrow();
    expect(pushTo('?q=x', true).query).toEqual({ q: 'x' });
    spy.mockRestore();
  });
});
