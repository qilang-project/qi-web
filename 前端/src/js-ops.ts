/**
 * 客户端动作（对标 Phoenix JS commands）。
 *
 * 展开折叠、高亮闪一下、聚焦输入框这类**纯视觉**交互，服务端根本不需要知道。
 * 以前只有两条路：往返服务端一次（白跑一趟，还有网络延迟），或者自己写 JS
 * （于是页面里又混进手写脚本）。这里给一组声明式操作，写在属性里，客户端直接跑。
 *
 * 属性形如 `data-js-click='[["togc","#menu","open"],["focus","#q"]]'`，
 * 由 qi 侧的 客户端动作.qi 生成，不用手写 JSON。
 *
 * ⚠ 这些操作改的是 DOM，**下一帧服务端重渲可能把它冲掉**（morph 会把 class /
 *   style 同步回服务端的版本）。要让改动跨帧存活，在那个元素上写 `data-js-keep`
 *   —— morph 就不再管它的 class 和 style 了。
 */

/** 一条操作：["动作", 选择器, ...参数]；选择器为空串 = 触发事件的那个元素 */
export type JsOp = [string, ...(string | number)[]];

function targets(sel: string, self: Element | null): Element[] {
  if (!sel) return self ? [self] : [];
  try {
    return Array.from(document.querySelectorAll(sel));
  } catch {
    return [];   // 选择器写错了不该把整条链带崩
  }
}

/** 元素当前是不是可见的（只看我们自己设的 display:none，不做完整可见性计算） */
function hidden(el: Element): boolean {
  return (el as HTMLElement).style.display === 'none';
}

function setShown(el: Element, show: boolean): void {
  (el as HTMLElement).style.display = show ? '' : 'none';
}

function classNames(v: string | number | undefined): string[] {
  return String(v ?? '').split(/\s+/).filter(Boolean);
}

function runOne(op: JsOp, self: Element | null): void {
  const kind = op[0];
  const sel = String(op[1] ?? '');
  const els = targets(sel, self);

  for (const el of els) {
    switch (kind) {
      case 'toggle': setShown(el, hidden(el)); break;
      case 'show': setShown(el, true); break;
      case 'hide': setShown(el, false); break;
      case 'addc': el.classList.add(...classNames(op[2])); break;
      case 'rmc': el.classList.remove(...classNames(op[2])); break;
      case 'togc': for (const c of classNames(op[2])) el.classList.toggle(c); break;
      case 'attr': el.setAttribute(String(op[2]), String(op[3] ?? '')); break;
      case 'rmattr': el.removeAttribute(String(op[2])); break;
      case 'focus': (el as HTMLElement).focus?.(); break;
      case 'scroll':
        try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        catch { el.scrollIntoView(); }
        break;
      case 'dispatch': {
        let detail: unknown = null;
        try { detail = JSON.parse(String(op[3] ?? 'null')); } catch { /* 不是 JSON 就当 null */ }
        try { el.dispatchEvent(new CustomEvent(String(op[2]), { detail, bubbles: true })); }
        catch { /* 旧浏览器 */ }
        break;
      }
      case 'flash': {
        // 加类 → 等一会儿 → 去类。用来「保存成功，那一行闪一下」
        const names = classNames(op[2]);
        const ms = Number(op[3]) || 600;
        el.classList.add(...names);
        setTimeout(() => { try { el.classList.remove(...names); } catch { /* 已移除 */ } }, ms);
        break;
      }
      default: break;   // 不认识的操作跳过，不炸
    }
  }
}

/** 跑一串操作。self 是触发事件的元素（空选择器指的就是它）；服务端下发的动作没有 self */
export function runOps(ops: JsOp[], self: Element | null): void {
  if (!ops || !ops.forEach) return;
  for (const op of ops) {
    if (op && op.length) runOne(op, self);
  }
}

/** 从属性值解析操作串；解析不了返回空数组（坏属性不该让点击整个失灵） */
export function parseOps(raw: string | null): JsOp[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v as JsOp[] : [];
  } catch {
    return [];
  }
}
