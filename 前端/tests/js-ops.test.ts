/**
 * 客户端动作（对标 Phoenix JS commands）。
 *
 * 这些操作直接改 DOM，不经服务端。写错了不会报错，只是「点了没反应」或者
 * 「反应了一下又被下一帧冲掉」，所以每种操作和那个冲掉的边界都要盯住。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOps, runOps, type JsOp } from '../src/js-ops';

function 布置(html: string): void {
  document.body.innerHTML = html;
}

const 元素 = (sel: string) => document.querySelector(sel) as HTMLElement;

describe('显示 / 隐藏', () => {
  beforeEach(() => 布置('<div id="m">菜单</div>'));

  it('切换：显示 → 隐藏 → 显示', () => {
    runOps([['toggle', '#m']], null);
    expect(元素('#m').style.display).toBe('none');
    runOps([['toggle', '#m']], null);
    expect(元素('#m').style.display).toBe('');
  });

  it('显示 / 隐藏是幂等的', () => {
    runOps([['hide', '#m'], ['hide', '#m']], null);
    expect(元素('#m').style.display).toBe('none');
    runOps([['show', '#m'], ['show', '#m']], null);
    expect(元素('#m').style.display).toBe('');
  });
});

describe('class', () => {
  beforeEach(() => 布置('<div id="m" class="base"></div>'));

  it('加 / 去 / 切', () => {
    runOps([['addc', '#m', 'open']], null);
    expect(元素('#m').className).toBe('base open');
    runOps([['togc', '#m', 'open']], null);
    expect(元素('#m').className).toBe('base');
    runOps([['togc', '#m', 'open']], null);
    expect(元素('#m').classList.contains('open')).toBe(true);
    runOps([['rmc', '#m', 'open']], null);
    expect(元素('#m').classList.contains('open')).toBe(false);
  });

  it('一次写多个类名（空格分开）', () => {
    runOps([['addc', '#m', 'a  b   c']], null);
    expect(元素('#m').classList.contains('a')).toBe(true);
    expect(元素('#m').classList.contains('b')).toBe(true);
    expect(元素('#m').classList.contains('c')).toBe(true);
  });

  it('闪一下：先加上，到点自己去掉', () => {
    vi.useFakeTimers();
    runOps([['flash', '#m', 'hit', 300]], null);
    expect(元素('#m').classList.contains('hit')).toBe(true);
    vi.advanceTimersByTime(299);
    expect(元素('#m').classList.contains('hit')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(元素('#m').classList.contains('hit')).toBe(false);
    vi.useRealTimers();
  });
});

describe('属性 / 焦点 / 事件', () => {
  it('设属性与删属性', () => {
    布置('<input id="i" value="x">');
    runOps([['attr', '#i', 'disabled', 'true']], null);
    expect(元素('#i').getAttribute('disabled')).toBe('true');
    runOps([['rmattr', '#i', 'disabled']], null);
    expect(元素('#i').hasAttribute('disabled')).toBe(false);
  });

  it('聚焦', () => {
    布置('<input id="i">');
    runOps([['focus', '#i']], null);
    expect(document.activeElement).toBe(元素('#i'));
  });

  it('派发冒泡的 CustomEvent，detail 是解析后的载荷', () => {
    布置('<div id="outer"><button id="b"></button></div>');
    const 收到: unknown[] = [];
    元素('#outer').addEventListener('打开', (e) => 收到.push((e as CustomEvent).detail));
    runOps([['dispatch', '#b', '打开', '{"id":3}']], null);
    expect(收到).toEqual([{ id: 3 }]);
  });

  it('载荷不是 JSON 时 detail 为 null，不抛', () => {
    布置('<div id="b"></div>');
    const 收到: unknown[] = [];
    元素('#b').addEventListener('x', (e) => 收到.push((e as CustomEvent).detail));
    expect(() => runOps([['dispatch', '#b', 'x', '不是JSON']], null)).not.toThrow();
    expect(收到).toEqual([null]);
  });
});

describe('选择器', () => {
  it('留空 = 触发的那个元素', () => {
    布置('<button id="a"></button><button id="b"></button>');
    runOps([['addc', '', 'on']], 元素('#a'));
    expect(元素('#a').classList.contains('on')).toBe(true);
    expect(元素('#b').classList.contains('on')).toBe(false);
  });

  it('留空但没有触发元素（服务端下发的动作）→ 这一步跳过，不炸', () => {
    布置('<div id="m"></div>');
    expect(() => runOps([['addc', '', 'on']], null)).not.toThrow();
  });

  it('一个选择器命中多个元素就都改', () => {
    布置('<i class="x"></i><i class="x"></i><i class="y"></i>');
    runOps([['addc', '.x', 'on']], null);
    expect(document.querySelectorAll('.x.on').length).toBe(2);
    expect(document.querySelectorAll('.y.on').length).toBe(0);
  });

  it('选择器写错了不该把整条链带崩', () => {
    布置('<div id="m"></div>');
    runOps([['addc', '((((', 'bad'], ['addc', '#m', 'good']], null);
    expect(元素('#m').classList.contains('good')).toBe(true);
  });
});

describe('坏数据', () => {
  it('不认识的操作跳过，后面的照跑', () => {
    布置('<div id="m"></div>');
    runOps([['压根没这个操作', '#m'] as JsOp, ['addc', '#m', 'ok']], null);
    expect(元素('#m').classList.contains('ok')).toBe(true);
  });

  it('属性值不是合法 JSON 时当空串处理 —— 点击不该整个失灵', () => {
    expect(parseOps('这不是JSON')).toEqual([]);
    expect(parseOps(null)).toEqual([]);
    expect(parseOps('{"不是":"数组"}')).toEqual([]);
    expect(parseOps('[["addc","#m","a"]]')).toEqual([['addc', '#m', 'a']]);
  });
});
