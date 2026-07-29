/**
 * vals() 的回归测试。
 *
 * 起因是个真事故：模板里写 data-value-cardId，浏览器把属性名全转小写存成
 * data-value-cardid，切前缀拿到 "cardid"，服务端读的是 "cardId" —— 删卡片
 * 点了完全没反应，还不报错。改成 dataset 的 kebab→camel 约定后修好。
 */
import { describe, expect, it } from 'vitest';
import { attr, closestFrom, hasAttr, live, vals } from '../src/dom';

function makeEl(html: string): Element {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.firstElementChild!;
}

describe('vals', () => {
  it('把 data-value-* 收成载荷', () => {
    const el = makeEl('<button data-value-id="7" data-value-name="七宝">×</button>');
    expect(vals(el)).toEqual({ id: '7', name: '七宝' });
  });

  it('kebab 还原成 camel —— 属性名被浏览器转小写也对得上服务端', () => {
    const el = makeEl('<button data-value-card-id="3" data-value-to-column="done"></button>');
    // 浏览器存的就是全小写
    expect(el.attributes[0].name).toBe('data-value-card-id');
    expect(vals(el)).toEqual({ cardId: '3', toColumn: 'done' });
  });

  it('多段 kebab 也还原', () => {
    const el = makeEl('<i data-value-a-b-c-d="1"></i>');
    expect(vals(el)).toEqual({ aBCD: '1' });
  });

  it('数字开头的段落跟着大写规则走', () => {
    const el = makeEl('<i data-value-col-2="x"></i>');
    expect(vals(el)).toEqual({ col2: 'x' });
  });

  it('不碰非 data-value-* 的属性', () => {
    const el = makeEl('<button class="icon" data-click="删" data-confirm="确定？" data-value-id="1"></button>');
    expect(vals(el)).toEqual({ id: '1' });
  });

  it('没有属性 / 传 null 都给空对象', () => {
    expect(vals(makeEl('<b></b>'))).toEqual({});
    expect(vals(null)).toEqual({});
  });
});

describe('attr / hasAttr / closestFrom', () => {
  it('attr 读不到给 null，不抛', () => {
    const el = makeEl('<b data-x="1"></b>');
    expect(attr(el, 'data-x')).toBe('1');
    expect(attr(el, 'data-y')).toBeNull();
    expect(attr(null, 'data-x')).toBeNull();
  });

  it('hasAttr 认空值属性', () => {
    const el = makeEl('<b data-ignore></b>');
    expect(hasAttr(el, 'data-ignore')).toBe(true);
    expect(hasAttr(el, 'data-other')).toBe(false);
  });

  it('closestFrom 从type目标往上找带该属性的元素', () => {
    const root = makeEl('<form data-submit="加卡片"><span><b id="inner">x</b></span></form>');
    document.body.appendChild(root);
    const inner = root.querySelector('#inner')!;
    expect(closestFrom(inner, 'data-submit')).toBe(root);
    expect(closestFrom(inner, 'data-click')).toBeNull();
    document.body.innerHTML = '';
  });
});

describe('live', () => {
  it('找 #qi-live', () => {
    expect(live()).toBeNull();
    document.body.innerHTML = '<div id="qi-live"></div>';
    expect(live()!.id).toBe('qi-live');
    document.body.innerHTML = '';
  });
});
