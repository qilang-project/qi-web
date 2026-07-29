/**
 * 实时流的客户端一半（对标 Phoenix Streams）。
 *
 * 服务端不留列表，只发「加了这一条 / 删了那一条」；这里把它落到 DOM 上。
 * 一条消息就发那一条的 HTML，跟列表里已经有多少条完全无关。
 *
 * 容器要用 `data-ignore` 挡在整页 morph 之外 —— 流进去的项在页面模板里根本
 * 不存在，下一次整页重渲会把它们全抹掉。这一条写在 实时流.qi 的文档里，
 * 这里再放一道兜底：容器上没有 data-ignore 就在控制台喊一声。
 */

/** 一条操作：["a", 键, HTML] / ["p", 键, HTML] / ["d", 键] / ["r"] */
export type StreamOp = [string, string?, string?];
export interface StreamPatch { c: string; ops: StreamOp[] }

/** 把一段 HTML 变成单个元素（流的每一项必须是一个元素，不是一堆节点） */
function toElement(html: string): Element | null {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.firstElementChild;
}

function findByKey(container: Element, key: string): Element | null {
  // 只在直接子节点里找 —— 嵌套列表里同名的 key 不该被误伤
  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i];
    if (child.getAttribute('data-key') === key) return child;
  }
  return null;
}

function applyOp(container: Element, op: StreamOp): void {
  const kind = op[0];
  if (kind === 'r') { container.innerHTML = ''; return; }

  const key = op[1] || '';
  const old = findByKey(container, key);

  if (kind === 'd') {
    if (old) container.removeChild(old);
    return;
  }

  const fresh = toElement(op[2] || '');
  if (!fresh) return;
  // 服务端可能忘了给项写 data-key —— 补上，否则下次按键找不到它
  if (!fresh.getAttribute('data-key')) fresh.setAttribute('data-key', key);

  if (kind === 'a') {
    // 追加：已存在就原地换掉（所以「更新某一条」也走追加）
    if (old) container.replaceChild(fresh, old);
    else container.appendChild(fresh);
    return;
  }
  if (kind === 'p') {
    // 前插：已存在就移到最前面并换掉
    if (old) container.removeChild(old);
    container.insertBefore(fresh, container.firstChild);
  }
}

/** 应用一帧 {"streams":[{c, ops}]} */
export function applyStreams(patches: StreamPatch[]): void {
  for (const patch of patches) {
    if (!patch || !patch.c) continue;
    const container = document.getElementById(patch.c);
    if (!container) continue;   // 容器还没渲染出来：这一批丢掉，等下一帧
    if (!container.hasAttribute('data-ignore')) {
      // 不拦，只警告：不加 data-ignore 的话下次整页重渲会把流进去的项全冲掉，
      // 表现是「消息刷一下就没了」，不说一声几乎没法查
      try {
        console.warn('[qi] 流容器 #' + patch.c + ' 没有 data-ignore，整页重渲会冲掉流进去的项');
      } catch { /* 没有 console 就算了 */ }
    }
    for (const op of patch.ops || []) applyOp(container, op);
  }
}
