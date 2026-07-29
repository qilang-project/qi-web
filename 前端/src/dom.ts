/** DOM 小工具。属性名一律英文 —— 中文属性已在 2026-07 全部迁走。 */

export function attr(el: Element | null, name: string): string | null {
  return el && el.getAttribute ? el.getAttribute(name) : null;
}

export function hasAttr(el: Element | null, name: string): boolean {
  return !!el && !!el.hasAttribute && el.hasAttribute(name);
}

export function closestFrom(t: EventTarget | null, name: string): Element | null {
  const el = t as Element | null;
  return el && el.closest ? el.closest('[' + name + ']') : null;
}

/**
 * 收集元素上的 data-value-* 作为事件参数。
 *
 * 键名走 dataset 那套 kebab → camel：HTML 属性名浏览器一律转小写，
 * data-value-cardId 到了 DOM 里是 data-value-cardid，直接切前缀会得到
 * 一个全小写的键，和服务端写的 "cardId" 对不上。所以模板里写
 * data-value-card-id，这里还原成 cardId。
 */
export function vals(el: Element | null): Record<string, string> {
  const p: Record<string, string> = {};
  if (!el || !el.attributes) return p;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name.indexOf('data-value-') === 0) p[camel(a.name.slice(11))] = a.value;
  }
  return p;
}

function camel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function live(): HTMLElement | null {
  return document.getElementById('qi-live');
}
