/**
 * SSE 流式对话客户端 —— window.qiStream(opts)。
 *
 * 在收进运行时之前，这段逻辑在 qi-web 和应用里抄了五份（整页聊天、浮动聊天、
 * 富聊天控制器、聊天界面、睡前故事），每份都各自处理一遍：关掉上一条流、
 * 攒缓冲、认收尾哨兵、把工具调用行挑出来当状态显示、渲染、滚到底。抄五份的
 * 直接后果是修一个 bug 要改五个地方，实际情况是只改了其中两个。
 *
 * 协议（和 Web.事件流 / Harness.代理 对齐）：
 *   data: [DONE]                收尾，关流
 *   data: [TOOL 工具名 {…}]     模型在调工具，显示状态提示，不进正文
 *   data: 其它                  正文片段，累加
 */
import type { StreamOpts } from './types';

const DONE = '[DONE]';
const TOOL = '[TOOL';

function el(x: HTMLElement | string | undefined | null): HTMLElement | null {
  if (!x) return null;
  return typeof x === 'string' ? document.getElementById(x) : x;
}

/**
 * 从 "[TOOL 查成员积分 {…}]" 里取工具名。
 *
 * 不能限定 [A-Za-z0-9_-]：qi 的工具名基本都是中文（「查成员积分」这种），
 * 用 ASCII 类会匹配不到，提示就变成「🔧 正在用  …」中间空一块。
 * 取到空白 / { / ] 之前的所有字符即可。
 */
function toolName(d: string): string {
  const m = d.match(/\[TOOL\s+([^\s{\]]+)/);
  return m ? m[1] : '';
}

export function qiStream(opts: StreamOpts): EventSource | null {
  const box = el(opts.el);
  if (!box) return null;
  const scroller = el(opts.scroller);

  let buf = '';
  const draw = () => {
    // 有富渲染器就走它（markdown/表格/卡片 + 声明式动作按钮），否则纯文本
    if (opts.act && window.qiRich) window.qiRich(box, buf, opts.act);
    else box.textContent = buf;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  const es = new EventSource(opts.url);
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    es.close();
    if (opts.doneText !== undefined && !buf) box.textContent = opts.doneText;
    try {
      window.dispatchEvent(new CustomEvent('qi:stream-done', { detail: opts.url }));
    } catch { /* 旧浏览器 */ }
  };

  box.innerHTML = opts.waitingHtml || '';

  es.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as string;
    if (d === DONE) { finish(); return; }
    if (d.indexOf(TOOL) >= 0) {
      // 工具调用不是正文：正文还空着时把它显示成一个状态胶囊，来了正文就被盖掉
      if (!buf && opts.toolHint) {
        box.innerHTML = '<span class="rqc-tool">🔧 '
          + opts.toolHint.replace('{name}', toolName(d)) + '</span>';
      }
      return;
    }
    buf += d;
    draw();
  });

  // 有些流用独立的 done 事件收尾（睡前故事那种非对话流）
  es.addEventListener('done', finish);

  es.onerror = () => {
    if (!buf && opts.errorText) { buf = opts.errorText; draw(); }
    finish();
  };

  return es;
}
