/**
 * 实时流的客户端一半。
 *
 * 这套操作直接改真实 DOM，绕过 morph（容器有 data-ignore）。错了不会报错，
 * 只是消息乱序、重复、或者莫名消失，所以每种操作都得盯住。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStreams, type StreamOp } from '../src/stream-ops';

const 项 = (k: string, 文本: string) => `<li data-key="${k}">${文本}</li>`;

function 容器(带忽略 = true): HTMLElement {
  document.body.innerHTML =
    `<ul id="msgs"${带忽略 ? ' data-ignore' : ''}></ul>`;
  return document.getElementById('msgs')!;
}

function 打(ops: StreamOp[], id = 'msgs'): void {
  applyStreams([{ c: id, ops }]);
}

function 键序(): string[] {
  return Array.from(document.querySelectorAll('#msgs > li'))
    .map((el) => el.getAttribute('data-key') || '');
}

describe('追加', () => {
  beforeEach(() => 容器());

  it('按顺序追到末尾', () => {
    打([['a', 'm1', 项('m1', '一')], ['a', 'm2', 项('m2', '二')]]);
    expect(键序()).toEqual(['m1', 'm2']);
    expect(document.querySelector('#msgs')!.textContent).toBe('一二');
  });

  it('键已存在就原地替换 —— 这也是「更新某一条」的做法', () => {
    打([['a', 'm1', 项('m1', '一')], ['a', 'm2', 项('m2', '二')]]);
    打([['a', 'm1', 项('m1', '改过的一')]]);
    expect(键序()).toEqual(['m1', 'm2']);      // 位置不动
    expect(document.querySelector('[data-key="m1"]')!.textContent).toBe('改过的一');
  });

  it('服务端漏写 data-key 时自动补上，否则下次就找不到它了', () => {
    打([['a', 'm9', '<li>没写键</li>']]);
    expect(键序()).toEqual(['m9']);
    打([['a', 'm9', '<li>换一条</li>']]);
    expect(键序()).toEqual(['m9']);            // 是替换，不是又加一条
  });
});

describe('前插', () => {
  beforeEach(() => 容器());

  it('插到最前面（新消息在最上面的时间线）', () => {
    打([['a', 'm1', 项('m1', '一')], ['p', 'm0', 项('m0', '零')]]);
    expect(键序()).toEqual(['m0', 'm1']);
  });

  it('已存在的键前插 = 移到最前并替换', () => {
    打([['a', 'm1', 项('m1', '一')], ['a', 'm2', 项('m2', '二')]]);
    打([['p', 'm2', 项('m2', '二改了')]]);
    expect(键序()).toEqual(['m2', 'm1']);
    expect(document.querySelector('[data-key="m2"]')!.textContent).toBe('二改了');
  });
});

describe('删除与清空', () => {
  beforeEach(() => 容器());

  it('按键删一项，其他不动', () => {
    打([['a', 'm1', 项('m1', '一')], ['a', 'm2', 项('m2', '二')], ['a', 'm3', 项('m3', '三')]]);
    打([['d', 'm2']]);
    expect(键序()).toEqual(['m1', 'm3']);
  });

  it('删不存在的键是 no-op，不炸', () => {
    打([['a', 'm1', 项('m1', '一')]]);
    打([['d', '压根没有']]);
    expect(键序()).toEqual(['m1']);
  });

  it('清空整个容器', () => {
    打([['a', 'm1', 项('m1', '一')], ['a', 'm2', 项('m2', '二')]]);
    打([['r']]);
    expect(键序()).toEqual([]);
  });
});

describe('稳健性', () => {
  it('容器还没渲染出来时整批丢掉，不抛', () => {
    document.body.innerHTML = '';
    expect(() => 打([['a', 'm1', 项('m1', '一')]], '还不存在')).not.toThrow();
  });

  it('只找直接子节点：嵌套列表里同名的键不该被误伤', () => {
    document.body.innerHTML =
      '<ul id="msgs" data-ignore><li data-key="x"><ul><li data-key="m1">里面的</li></ul></li></ul>';
    打([['a', 'm1', 项('m1', '外面的')]]);
    expect(键序()).toEqual(['x', 'm1']);       // 新增一条，没有动嵌套里那条
    expect(document.querySelector('#msgs > li > ul > li')!.textContent).toBe('里面的');
  });

  it('容器忘了写 data-ignore 就在控制台喊一声（整页重渲会冲掉流进去的项）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    容器(false);
    打([['a', 'm1', 项('m1', '一')]]);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('data-ignore');
    warn.mockRestore();
  });

  it('多个容器一帧里各干各的', () => {
    document.body.innerHTML =
      '<ul id="msgs" data-ignore></ul><ul id="logs" data-ignore></ul>';
    applyStreams([
      { c: 'msgs', ops: [['a', 'm1', 项('m1', '消息')]] },
      { c: 'logs', ops: [['a', 'l1', 项('l1', '日志')]] },
    ]);
    expect(document.querySelector('#msgs')!.textContent).toBe('消息');
    expect(document.querySelector('#logs')!.textContent).toBe('日志');
  });
});
