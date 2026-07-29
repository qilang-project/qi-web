/**
 * morph 的回归测试。
 *
 * morph 存在的唯一理由是「保住节点身份」：焦点、光标位置、CSS 过渡、拖拽状态、
 * 滚动位置全挂在节点上，innerHTML 整区替换会全丢。所以测的重点不是「渲染结果
 * 对不对」（那 innerHTML 也对），而是「该复用的节点有没有被复用」。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildKeyIndex, morphKids } from '../src/morph';

function mount(html: string): HTMLElement {
  document.body.innerHTML = '<div id="qi-live">' + html + '</div>';
  return document.getElementById('qi-live')!;
}

function fragment(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

/** 走一遍完整流程：建索引 → morph（跟运行时 apply() 里一样的顺序）*/
function apply(root: HTMLElement, html: string): void {
  buildKeyIndex();
  morphKids(root, fragment(html));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('文本与属性', () => {
  it('只改文本，元素还是同一个', () => {
    const root = mount('<p class="x">旧</p>');
    const p = root.firstElementChild!;
    apply(root, '<p class="x">新</p>');
    expect(root.firstElementChild).toBe(p);
    expect(p.textContent).toBe('新');
  });

  it('加属性、改属性、删属性', () => {
    const root = mount('<b id="t" class="a" data-old="1">x</b>');
    const b = root.firstElementChild!;
    apply(root, '<b id="t" class="c" data-new="2">x</b>');
    expect(root.firstElementChild).toBe(b);
    expect(b.getAttribute('class')).toBe('c');
    expect(b.getAttribute('data-new')).toBe('2');
    expect(b.hasAttribute('data-old')).toBe(false);
  });

  it('标签变了就整个换掉', () => {
    const root = mount('<p>x</p>');
    const p = root.firstElementChild!;
    apply(root, '<div>x</div>');
    expect(root.firstElementChild).not.toBe(p);
    expect(root.firstElementChild!.tagName).toBe('DIV');
  });

  it('data-ignore 的子树不动 —— 留给apply自己管的区域', () => {
    const root = mount('<div data-ignore><span id="own">别动我</span></div>');
    const own = root.querySelector('#own')!;
    apply(root, '<div data-ignore><span id="own">被服务端改了</span></div>');
    expect(root.querySelector('#own')).toBe(own);
    expect(own.textContent).toBe('别动我');
  });
});

describe('keyed 对齐', () => {
  it('中间删一条，其余节点身份全保住', () => {
    const root = mount(
      '<li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li>');
    const [a, , c] = [...root.children];
    apply(root, '<li data-key="a">A</li><li data-key="c">C</li>');
    expect([...root.children]).toEqual([a, c]);
    expect(root.textContent).toBe('AC');
  });

  it('重排不重建 —— 拖动排序时过渡才不会闪', () => {
    const root = mount(
      '<li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li>');
    const [a, b, c] = [...root.children];
    apply(root, '<li data-key="c">C</li><li data-key="a">A</li><li data-key="b">B</li>');
    expect([...root.children]).toEqual([c, a, b]);
  });

  it('头部插入不会把后面的顶掉重建', () => {
    const root = mount('<li data-key="b">B</li>');
    const b = root.firstElementChild!;
    apply(root, '<li data-key="a">A</li><li data-key="b">B</li>');
    expect(root.children[1]).toBe(b);
    expect(root.children[0].textContent).toBe('A');
  });
});

describe('跨容器搬运', () => {
  it('卡片从一栏拖到另一栏，还是原来那个节点', () => {
    // 索引必须在 morph 开始前建好：源栏会先删节点，之后就 query 不到了
    const root = mount(
      '<div class="col" data-key="c1"><span data-key="k1">卡</span></div>' +
      '<div class="col" data-key="c2"></div>');
    const card = root.querySelector('[data-key=k1]')!;
    apply(root,
      '<div class="col" data-key="c1"></div>' +
      '<div class="col" data-key="c2"><span data-key="k1">卡</span></div>');
    const target = root.querySelectorAll('.col')[1];
    expect(target.firstElementChild).toBe(card);
  });
});

describe('表单控件', () => {
  it('没聚焦的输入框跟随服务端值', () => {
    const root = mount('<input data-key="i" value="旧">');
    const i = root.firstElementChild as HTMLInputElement;
    i.value = '旧';
    apply(root, '<input data-key="i" value="新">');
    expect(root.firstElementChild).toBe(i);
    expect(i.value).toBe('新');
  });

  it('聚焦中的输入框不被覆盖 —— 正在打的字不能被服务端刷掉', () => {
    const root = mount('<input data-key="i" value="">');
    const i = root.firstElementChild as HTMLInputElement;
    i.focus();
    i.value = '我正在输入';
    apply(root, '<input data-key="i" value="服务端的值">');
    expect(document.activeElement).toBe(i);
    expect(i.value).toBe('我正在输入');
  });

  it('复选框按 checked 属性同步', () => {
    const root = mount('<input type="checkbox" data-key="c">');
    const c = root.firstElementChild as HTMLInputElement;
    expect(c.checked).toBe(false);
    apply(root, '<input type="checkbox" data-key="c" checked>');
    expect(c.checked).toBe(true);
    apply(root, '<input type="checkbox" data-key="c">');
    expect(c.checked).toBe(false);
  });
});

describe('无 key 的普通节点', () => {
  it('按位置对齐复用', () => {
    const root = mount('<p>1</p><p>2</p>');
    const [p1, p2] = [...root.children];
    apply(root, '<p>一</p><p>二</p>');
    expect([...root.children]).toEqual([p1, p2]);
    expect(root.textContent).toBe('一二');
  });

  it('尾部多余的删掉', () => {
    const root = mount('<p>1</p><p>2</p><p>3</p>');
    apply(root, '<p>1</p>');
    expect(root.children.length).toBe(1);
  });
});

/**
 * data-js-keep —— 客户端动作改的 class/style 不被服务端冲掉。
 *
 * 没有这个开关的话，用 data-js-click 展开的菜单会在**下一帧**莫名其妙合上，
 * 哪怕那一帧跟菜单毫无关系（一个定时器滴答就够了）。这是纯客户端交互和
 * 服务端驱动 UI 的天然冲突点，只能显式划线。
 */
describe('data-js-keep', () => {
  it('服务端不覆盖它的 class 和 style', () => {
    const root = mount('<div data-key="m" data-js-keep class="panel"></div>');
    const el = root.firstElementChild as HTMLElement;
    // 客户端动作把它展开了
    el.classList.add('open');
    el.style.display = 'block';
    // 下一帧服务端照旧渲染成没展开的样子
    apply(root, '<div data-key="m" data-js-keep class="panel"></div>');
    expect(el.classList.contains('open')).toBe(true);
    expect(el.style.display).toBe('block');
    expect(el.classList.contains('panel')).toBe(true);
  });

  it('其他属性照旧同步（只让出 class 和 style）', () => {
    const root = mount('<div data-key="m" data-js-keep title="旧"></div>');
    const el = root.firstElementChild as HTMLElement;
    el.classList.add('open');
    apply(root, '<div data-key="m" data-js-keep title="新" data-x="1"></div>');
    expect(el.getAttribute('title')).toBe('新');
    expect(el.getAttribute('data-x')).toBe('1');
    expect(el.classList.contains('open')).toBe(true);
  });

  it('没写这个属性的元素照旧被服务端覆盖（默认行为不变）', () => {
    const root = mount('<div data-key="m" class="panel"></div>');
    const el = root.firstElementChild as HTMLElement;
    el.classList.add('open');
    el.style.display = 'block';
    apply(root, '<div data-key="m" class="panel"></div>');
    expect(el.classList.contains('open')).toBe(false);
    expect(el.style.display).toBe('');
  });
});
