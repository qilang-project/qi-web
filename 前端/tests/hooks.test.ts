/**
 * hook 生命周期的回归测试。
 *
 * 测的重点是**触发时机的准确性**：mounted 只在进 DOM 时、updated 只在这一帧
 * 真动过该元素（含子树）时、destroyed 只在摘出时 —— 多报少报都会让页面侧的
 * 第三方实例（图表/播放器）重建或泄漏。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildKeyIndex, morphKids } from '../src/morph';
import { flushHooks, setHookSender } from '../src/hooks';

function mount(html: string): HTMLElement {
  document.body.innerHTML = '<div id="qi-live">' + html + '</div>';
  return document.getElementById('qi-live')!;
}

function fragment(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

/** 跟运行时 apply() 同顺序：建索引 → morph → 帧尾对账 */
function apply(root: HTMLElement, html: string): void {
  buildKeyIndex();
  morphKids(root, fragment(html));
  flushHooks(root);
}

interface Calls { mounted: Element[]; updated: Element[]; destroyed: Element[]; }

function register(name: string): Calls {
  const calls: Calls = { mounted: [], updated: [], destroyed: [] };
  window.qiHooks = window.qiHooks || {};
  window.qiHooks[name] = {
    mounted: (el) => calls.mounted.push(el),
    updated: (el) => calls.updated.push(el),
    destroyed: (el) => calls.destroyed.push(el),
  };
  return calls;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.qiHooks = {};
  // 把上一个用例还挂着的 hook 全清掉（都不在文档里了，走 destroyed 分支）
  flushHooks(null);
});

describe('mounted', () => {
  it('首屏扫描即挂载，且同一帧不再报 updated', () => {
    const calls = register('A');
    const root = mount('<div data-hook="A">x</div>');
    flushHooks(root);
    expect(calls.mounted.length).toBe(1);
    expect(calls.updated.length).toBe(0);
  });

  it('morph 新插入的子树里的 hook 会挂载', () => {
    const calls = register('A');
    const root = mount('<p>头</p>');
    flushHooks(root);
    apply(root, '<p>头</p><div data-hook="A">新来的</div>');
    expect(calls.mounted.length).toBe(1);
    expect(calls.mounted[0]).toBe(root.querySelector('[data-hook]'));
  });

  it('hook 没注册：不崩，注册后下一帧补挂', () => {
    const root = mount('<div data-hook="晚到">x</div>');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ });
    flushHooks(root);
    const calls = register('晚到');
    flushHooks(root);
    expect(calls.mounted.length).toBe(1);
    warn.mockRestore();
  });
});

describe('updated', () => {
  it('子树文本变了 → 最近的 hook 祖先收到 updated', () => {
    const calls = register('A');
    const root = mount('<div data-hook="A"><b>旧</b></div>');
    flushHooks(root);
    apply(root, '<div data-hook="A"><b>新</b></div>');
    expect(calls.updated.length).toBe(1);
    expect(calls.mounted.length).toBe(1);   // 还是首屏那一次
  });

  it('hook 元素自己的属性变了也算', () => {
    const calls = register('A');
    const root = mount('<div data-hook="A" class="a">x</div>');
    flushHooks(root);
    apply(root, '<div data-hook="A" class="b">x</div>');
    expect(calls.updated.length).toBe(1);
  });

  it('这一帧只动了别处 → 不报', () => {
    const calls = register('A');
    const root = mount('<div data-hook="A">稳</div><p>旧</p>');
    flushHooks(root);
    apply(root, '<div data-hook="A">稳</div><p>新</p>');
    expect(calls.updated.length).toBe(0);
  });

  it('hook 容器里增删子节点算 updated', () => {
    const calls = register('A');
    const root = mount('<ul data-hook="A"><li data-key="1">一</li></ul>');
    flushHooks(root);
    apply(root, '<ul data-hook="A"><li data-key="1">一</li><li data-key="2">二</li></ul>');
    expect(calls.updated.length).toBe(1);
  });
});

describe('destroyed', () => {
  it('元素被摘掉 → destroyed，且节点身份是原来那个', () => {
    const calls = register('A');
    const root = mount('<div data-hook="A">x</div>');
    flushHooks(root);
    const el = root.querySelector('[data-hook]')!;
    apply(root, '<p>没了</p>');
    expect(calls.destroyed.length).toBe(1);
    expect(calls.destroyed[0]).toBe(el);
  });

  it('data-hook 改名 → 旧的销毁、新的挂载', () => {
    const a = register('A');
    const b = register('B');
    const root = mount('<div data-hook="A">x</div>');
    flushHooks(root);
    apply(root, '<div data-hook="B">x</div>');
    expect(a.destroyed.length).toBe(1);
    expect(b.mounted.length).toBe(1);
  });

  it('带 key 的 hook 跨容器搬家：身份保住，不走销毁重建', () => {
    const calls = register('A');
    const root = mount('<div id="l"><div data-key="c" data-hook="A">卡</div></div><div id="r"></div>');
    flushHooks(root);
    const el = root.querySelector('[data-hook]')!;
    apply(root, '<div id="l"></div><div id="r"><div data-key="c" data-hook="A">卡</div></div>');
    expect(calls.destroyed.length).toBe(0);
    expect(calls.mounted.length).toBe(1);   // 还是首屏那一次
    expect(root.querySelector('[data-hook]')).toBe(el);
  });
});

describe('ctx.push', () => {
  it('走 setHookSender 注入的通道，并带上元素', () => {
    const sent: Array<{ el: Element; event: string }> = [];
    setHookSender((el) => (event) => sent.push({ el, event }));
    window.qiHooks = {
      A: { mounted: (el, ctx) => ctx.push('就绪') },
    };
    const root = mount('<div data-hook="A">x</div>');
    flushHooks(root);
    expect(sent.length).toBe(1);
    expect(sent[0].event).toBe('就绪');
    expect(sent[0].el).toBe(root.querySelector('[data-hook]'));
  });
});
