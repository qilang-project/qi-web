/**
 * 客户端 hook 生命周期（对标 phx-hook）。
 *
 * LiveView 管 DOM，但有些节点还需要 JS 接管：图表、地图、画布、播放器、
 * 「换页后读 naturalWidth 重设 CSS 变量」。没有这层之前，每个应用都得自己
 * 写 MutationObserver 盯整棵树（有声绘本就是这么土法补的）。
 *
 * 用法（页面脚本里，在运行时加载前定义；运行时在 body 末尾，正常都来得及）：
 *
 *   window.qiHooks = {
 *     Chart: {
 *       mounted(el, ctx)  { ... el 刚进 DOM ... },       // ctx.push 上行事件
 *       updated(el, ctx)  { ... 服务端这一帧改到了 el（含子树）... },
 *       destroyed(el)     { ... el 已被摘出 DOM，清理定时器/第三方实例 ... },
 *     },
 *   };
 *
 *   模板里：<div data-hook="Chart" data-key="c1">…</div>
 *
 * 三条回调都可选。ctx.push(事件名, 载荷) 与声明式绑定同路：身份字段自动并入、
 * 组件内自动路由到该组件、等待回帧期间元素带 qi-loading。
 *
 * 判定方式是**每帧收尾时对账**，不是 MutationObserver：
 *   destroyed —— 已挂载元素不再 isConnected（或 data-hook 被改名/摘掉）
 *   mounted   —— 扫描到 [data-hook] 且尚未挂载（morph 新插入的子树、流帧加的项）
 *   updated   —— morph 在打点里记下的「这一帧动过的 hook 元素」（属性/文本/增删子节点
 *                都算，取最近的 [data-hook] 祖先）；刚 mounted 的这一帧不再报 updated
 *
 * data-hook 元素配上 data-key 才能跨帧保住身份 —— 没 key 被 morph 换掉节点时
 * 会走一轮 destroyed + mounted，第三方实例就白建了。
 */
import type { Payload } from './types';

export interface HookCtx {
  /** 上行事件，与声明式绑定同路（身份并入 + 组件路由 + qi-loading） */
  push: (event: string, payload?: Payload) => void;
}

export interface Hook {
  mounted?: (el: Element, ctx: HookCtx) => void;
  updated?: (el: Element, ctx: HookCtx) => void;
  destroyed?: (el: Element) => void;
}

/** 已挂载：元素 → 挂载时的 hook 名（改名/摘属性要靠它发现） */
const mountedEls = new Map<Element, string>();
/** 本帧被 morph 动过的 hook 元素（morph.ts 打点进来） */
let changed = new Set<Element>();
/** 报过「hook 未定义」的名字，只警告一次 */
const warned = new Set<string>();

/** live.ts 注入的上行通道：(元素) → push 函数 */
let sender: ((el: Element) => HookCtx['push']) | null = null;

export function setHookSender(fn: (el: Element) => HookCtx['push']): void {
  sender = fn;
}

/**
 * morph 打点：node（或它所在的元素）向上找最近的 [data-hook]，记为本帧动过。
 * 文本节点传父元素进来。
 */
export function markHookChange(node: Node | null): void {
  const el = node && node.nodeType === 1 ? (node as Element) : node?.parentElement;
  if (!el || !el.closest) return;
  const host = el.closest('[data-hook]');
  if (host && mountedEls.has(host)) changed.add(host);
}

function ctxFor(el: Element): HookCtx {
  const push = sender ? sender(el) : () => { /* 无连接（不该发生） */ };
  return { push };
}

function hookOf(name: string): Hook | null {
  const h = window.qiHooks && window.qiHooks[name];
  if (!h && !warned.has(name)) {
    warned.add(name);
    console.warn('[qi-live] data-hook="' + name + '" 在 window.qiHooks 里没定义');
  }
  return h || null;
}

/**
 * 每帧收尾对账。顺序：destroyed → mounted → updated。
 * root 为空（页面没有 #qi-live）时只做 destroyed 清理。
 */
export function flushHooks(root: Element | null): void {
  const marks = changed;
  changed = new Set();

  // destroyed：不在文档里了，或 data-hook 被改掉（改名按「旧的销毁、新的挂载」处理）
  mountedEls.forEach((name, el) => {
    if (el.isConnected && el.getAttribute('data-hook') === name) return;
    mountedEls.delete(el);
    const h = window.qiHooks && window.qiHooks[name];
    if (h && h.destroyed) {
      try { h.destroyed(el); } catch (err) { console.error('[qi-live] hook destroyed 抛异常', err); }
    }
  });

  if (!root) return;

  // mounted：扫描现存的 [data-hook]。hook 还没注册的先跳过，下一帧再试
  //（运行时在 body 末尾，页面脚本正常都先跑；这里只是兜注册晚了的边角）。
  const fresh = new Set<Element>();
  const all = root.querySelectorAll('[data-hook]');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (mountedEls.has(el)) continue;
    const name = el.getAttribute('data-hook') || '';
    const h = hookOf(name);
    if (!h) continue;
    mountedEls.set(el, name);
    fresh.add(el);
    if (h.mounted) {
      try { h.mounted(el, ctxFor(el)); } catch (err) { console.error('[qi-live] hook mounted 抛异常', err); }
    }
  }

  // updated：morph 动过、仍挂着、且不是这一帧刚 mounted 的
  marks.forEach((el) => {
    if (fresh.has(el) || !el.isConnected) return;
    const name = mountedEls.get(el);
    if (!name) return;
    const h = window.qiHooks && window.qiHooks[name];
    if (h && h.updated) {
      try { h.updated(el, ctxFor(el)); } catch (err) { console.error('[qi-live] hook updated 抛异常', err); }
    }
  });
}
