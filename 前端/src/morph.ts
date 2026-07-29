/**
 * DOM morph —— 把服务端新片段逐节点对齐进现有 DOM，只改差异。
 *
 * 为什么不是 innerHTML 整区替换：焦点、光标位置、滚动位置、CSS 过渡、
 * 拖拽状态、第三方挂件全都挂在节点身份上，整区替换会全部丢掉。
 */
import { attr, hasAttr, live } from './dom';

function nkey(n: Node): string | null {
  return n.nodeType === 1 ? attr(n as Element, 'data-key') : null;
}

function same(a: Node, b: Node): boolean {
  return a.nodeType === b.nodeType &&
    (a.nodeType !== 1 || (a as Element).tagName === (b as Element).tagName);
}

/**
 * 每帧开始先把 #qi-live 里所有带 key 的节点存进索引。
 *
 * 必须**先存**：morph 是按容器顺序走的，源容器（比如卡片被拖出的那一栏）
 * 会先把节点删掉，等轮到目标容器再 querySelector 就找不到了。存了引用之后，
 * 即使节点已从文档摘下也能认领回来重新插入 —— 跨容器拖动才保得住节点身份。
 */
let keyIndex: Record<string, Element> | null = null;

export function buildKeyIndex(): void {
  keyIndex = {};
  const root = live();
  if (!root) return;
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const k = nkey(all[i]);
    if (k && !keyIndex[k]) keyIndex[k] = all[i];
  }
}

function claimByKey(k: string | null): Element | null {
  if (!k || !keyIndex) return null;
  const n = keyIndex[k];
  if (!n) return null;
  delete keyIndex[k];
  return n;
}

function syncAttrs(f: Element, t: Element): void {
  // data-js-keep：这个元素的 class / style 归客户端动作管，服务端不覆盖。
  //
  // 客户端动作（data-js-*）改的是 DOM，而 morph 默认会把 class/style 同步回
  // 服务端渲染的版本 —— 展开的菜单会在下一帧莫名其妙合上（哪怕那一帧跟菜单
  // 毫无关系，比如一个定时器滴答）。写了这个属性就把这两项让给客户端。
  const keep = t.hasAttribute('data-js-keep');
  const clientOwned = (name: string) => keep && (name === 'class' || name === 'style');

  for (let i = f.attributes.length - 1; i >= 0; i--) {
    const a = f.attributes[i].name;
    if (!t.hasAttribute(a) && !clientOwned(a)) f.removeAttribute(a);
  }
  for (let i = 0; i < t.attributes.length; i++) {
    const a = t.attributes[i];
    if (clientOwned(a.name)) continue;
    if (f.getAttribute(a.name) !== a.value) f.setAttribute(a.name, a.value);
  }
  // 表单控件的「活值」：非焦点元素跟随服务端；焦点元素不动（保住正在输入的内容）
  const g = f.tagName;
  if ((g === 'INPUT' || g === 'TEXTAREA' || g === 'SELECT') && f !== document.activeElement) {
    const fi = f as HTMLInputElement, ti = t as HTMLInputElement;
    if (g === 'INPUT' && (fi.type === 'checkbox' || fi.type === 'radio')) {
      fi.checked = t.hasAttribute('checked');
    } else if (ti.value !== undefined && fi.value !== ti.value) {
      fi.value = ti.value;
    }
  }
}

export function morph(f: Node, t: Node): void {
  if (!same(f, t)) {
    f.parentNode?.replaceChild(t.cloneNode(true), f);
    return;
  }
  if (f.nodeType === 3 || f.nodeType === 8) {
    if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue;
    return;
  }
  if (f.nodeType !== 1) return;
  syncAttrs(f as Element, t as Element);
  if (hasAttr(f as Element, 'data-ignore')) return;
  morphKids(f as Element, t as Element);
}

export function morphKids(f: Element, t: Element): void {
  const byKey: Record<string, Node> = {};
  for (let n = f.firstChild; n; n = n.nextSibling) {
    const k = nkey(n);
    if (k) byKey[k] = n;
  }
  let cur: Node | null = f.firstChild;
  let tn: Node | null = t.firstChild;
  while (tn) {
    const nxt: Node | null = tn.nextSibling;
    const tk = nkey(tn);
    let m: Node | null = tk ? byKey[tk] ?? null : null;
    // 本容器里没有 → 去全局索引认领（可能刚从别的容器搬过来）
    if (!m && tk) {
      const g = claimByKey(tk);
      if (g && g !== f && !f.contains(g) && !g.contains(f)) m = g;
    }
    if (m) {
      if (m === cur) cur = cur.nextSibling;
      else f.insertBefore(m, cur);
      morph(m, tn);
    } else if (cur && same(cur, tn) && !nkey(cur)) {
      const c = cur;
      cur = cur.nextSibling;
      morph(c, tn);
    } else {
      f.insertBefore(tn.cloneNode(true), cur);
    }
    tn = nxt;
  }
  while (cur) {
    const d = cur;
    cur = cur.nextSibling;
    f.removeChild(d);
  }
}
