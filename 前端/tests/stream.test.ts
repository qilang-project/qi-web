/**
 * qiStream 的回归测试。
 *
 * 这段逻辑以前在 qi-web 和应用里抄了五份，五份各自处理哨兵和收尾，
 * 结果就是修 bug 只修了其中两份。收成一份之后必须有测试兜着。
 *
 * jsdom 没有 EventSource，这里自己造一个假的，好处是能精确控制事件时序。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qiStream } from '../src/stream';

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  url: string;
  closed: boolean = false;
  onerror: (() => void) | null = null;
  private listeners: Record<string, Array<(e: MessageEvent) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.latest = this;
  }
  addEventListener(t: string, f: (e: MessageEvent) => void): void {
    (this.listeners[t] ||= []).push(f);
  }
  close(): void { this.closed = true; }

  /** 模拟服务端推一条 data */
  push(data: string, type = 'message'): void {
    (this.listeners[type] || []).forEach((f) => f({ data } as MessageEvent));
  }
  fail(): void { if (this.onerror) this.onerror(); }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="out"></div><div id="box"></div>';
  FakeEventSource.latest = null;
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  delete (window as { qiRich?: unknown }).qiRich;
});

const out = () => document.getElementById('out')!;

describe('纯文本流', () => {
  it('逐片累加', () => {
    qiStream({ url: '/s', el: 'out' });
    const es = FakeEventSource.latest!;
    es.push('从前');
    es.push('有座山');
    expect(out().textContent).toBe('从前有座山');
  });

  it('[DONE] 收尾并关流', () => {
    qiStream({ url: '/s', el: 'out' });
    const es = FakeEventSource.latest!;
    es.push('讲完了');
    es.push('[DONE]');
    expect(es.closed).toBe(true);
    expect(out().textContent).toBe('讲完了');
  });

  it('独立的 done type也收尾（故事流那种非对话流）', () => {
    qiStream({ url: '/s', el: 'out' });
    const es = FakeEventSource.latest!;
    es.push('text');
    es.push('[DONE]', 'done');
    expect(es.closed).toBe(true);
  });

  it('收尾派 qi:stream-done，apply据此改状态文案', () => {
    const seen: unknown[] = [];
    window.addEventListener('qi:stream-done', (e) => seen.push((e as CustomEvent).detail));
    qiStream({ url: '/s?a=1', el: 'out' });
    FakeEventSource.latest!.push('[DONE]');
    expect(seen).toEqual(['/s?a=1']);
  });

  it('重复收尾只派一次type', () => {
    let count = 0;
    window.addEventListener('qi:stream-done', () => { count++; });
    qiStream({ url: '/s', el: 'out' });
    const es = FakeEventSource.latest!;
    es.push('[DONE]');
    es.push('[DONE]', 'done');
    es.fail();
    expect(count).toBe(1);
  });
});

describe('工具调用标记', () => {
  it('[TOOL …] 不进正文，显示成状态胶囊', () => {
    qiStream({ url: '/s', el: 'out', toolHint: '正在用 {name} …' });
    const es = FakeEventSource.latest!;
    es.push('[TOOL 查积分 {"name":"三宝"}]');
    expect(out().querySelector('.rqc-tool')!.textContent).toContain('正在用 查积分 …');
    // 正文来了就把胶囊盖掉
    es.push('三宝有 65 分');
    expect(out().textContent).toBe('三宝有 65 分');
  });

  it('正文已经开始后，再来工具标记不覆盖正文', () => {
    qiStream({ url: '/s', el: 'out', toolHint: '用 {name}' });
    const es = FakeEventSource.latest!;
    es.push('先说一句');
    es.push('[TOOL 查询 {}]');
    expect(out().textContent).toBe('先说一句');
  });
});

describe('等待与出错', () => {
  it('开流先放占位', () => {
    qiStream({ url: '/s', el: 'out', waitingHtml: '<span class="rqc-cur"></span>' });
    expect(out().querySelector('.rqc-cur')).not.toBeNull();
  });

  it('一个字都没seen就fail → 显示兜底文案', () => {
    qiStream({ url: '/s', el: 'out', errorText: '（连接中断）' });
    FakeEventSource.latest!.fail();
    expect(out().textContent).toBe('（连接中断）');
  });

  it('已经有正文再fail → 保住已seen的text', () => {
    qiStream({ url: '/s', el: 'out', errorText: '（连接中断）' });
    const es = FakeEventSource.latest!;
    es.push('已经seen的半句');
    es.fail();
    expect(out().textContent).toBe('已经seen的半句');
    expect(es.closed).toBe(true);
  });

  it('目标元素不存在就直接返回 null，不抛', () => {
    expect(qiStream({ url: '/s', el: '不存在的id' })).toBeNull();
  });
});

describe('富渲染与滚动', () => {
  it('给了 act 且有 qiRich 就走富渲染', () => {
    const richSpy = vi.fn();
    (window as { qiRich?: unknown }).qiRich = richSpy;
    qiStream({ url: '/s', el: 'out', act: '/act' });
    FakeEventSource.latest!.push('text');
    expect(richSpy).toHaveBeenCalledWith(out(), 'text', '/act');
  });

  it('没给 act 就纯文本，不碰 qiRich', () => {
    const richSpy = vi.fn();
    (window as { qiRich?: unknown }).qiRich = richSpy;
    qiStream({ url: '/s', el: 'out' });
    FakeEventSource.latest!.push('text');
    expect(richSpy).not.toHaveBeenCalled();
    expect(out().textContent).toBe('text');
  });

  it('每片都把 scroller 滚到底', () => {
    const box = document.getElementById('box')!;
    Object.defineProperty(box, 'scrollHeight', { value: 500, configurable: true });
    qiStream({ url: '/s', el: 'out', scroller: box });
    FakeEventSource.latest!.push('x');
    expect(box.scrollTop).toBe(500);
  });
});
