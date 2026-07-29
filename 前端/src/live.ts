/**
 * qi-web LiveView 客户端运行时。
 *
 * 职责：WS 连接与重连、上行事件（声明式绑定 + qiSend）、下行帧（整区/增量/
 * 指令/拒绝）、morph 落地。状态全在服务端 —— 这里只是薄传输层，不做虚拟
 * DOM、不做客户端路由、不做响应式。
 */
import type { Command, Frame, LiveConfig, Payload } from './types';
import { attr, closestFrom, live, vals } from './dom';
import { buildKeyIndex, morphKids } from './morph';
import { injectStyle, qiConfirm } from './confirm';
import { bindDropdowns } from './dropdown';
import { qiStream } from './stream';
import { qiRich } from './rich';
import { TemplateState } from './template';
import { applyStreams } from './stream-ops';
import { parseOps, runOps } from './js-ops';
import { pushTo, urlPayload } from './patch-nav';

let cfg: LiveConfig = { ws: '', sub: null, hb: 0 };
let ws: WebSocket | null = null;
let hbTimer: number | null = null;
let delay = 500;
let pending: Element[] = [];
let denied = false;
let lastHtml = '';
// 结构化 diff 的客户端一半：存住模板计划，之后只收变化的槽位
const tpl = new TemplateState();

/** 身份字段自动并进每个事件载荷 —— 服务端据此认人，不信客户端另报的 id */
function ident(p?: Payload): Payload {
  const out: Payload = p ?? {};
  const sub = cfg.sub;
  if (sub) {
    for (const k of ['token', 'nick', 'memberId']) {
      if (sub[k] !== undefined) out[k] = sub[k];
    }
  }
  return out;
}

function mark(el: Element | null): void {
  if (el && el.classList) { el.classList.add('qi-loading'); pending.push(el); }
}

function clearLoad(): void {
  for (const el of pending) { try { el.classList.remove('qi-loading'); } catch { /* 已移除 */ } }
  pending = [];
}

/**
 * 组件路由：往上找最近的 [data-target]，把组件 id 放进保留键 __target__。
 *
 * 实时组件 渲染时给子树套了一层 `<div data-target="组件id">`，所以组件内部的
 * 任何事件都自动归它管 —— 页面和组件用同名事件也不会串。
 * qiSend 这种没有元素的手动上行不带 target，归页面本身。
 */
function withTarget(payload: Payload, el: Element | null): Payload {
  const host = closestFrom(el, 'data-target');
  if (host) payload.__target__ = attr(host, 'data-target') || '';
  return payload;
}

function send(ev: string | null, payload: Payload, el: Element | null): void {
  if (ev && ws && ws.readyState === 1) {
    mark(el);
    ws.send(JSON.stringify({ event: ev, payload: withTarget(ident(payload), el) }));
  }
}

function sendRaw(ev: string, payload: Payload): void {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ event: ev, payload: payload || {} }));
}

// ── 下行帧 ──
function runCmd(c: Command): void {
  if (!c || !c.type) return;
  if (c.type === 'navigate') { location.href = c.target!; }
  else if (c.type === 'title') { document.title = c.text!; }
  else if (c.type === 'scroll') {
    const el = document.querySelector(c.target!);
    if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch { el.scrollIntoView(); } }
  } else if (c.type === 'patch') {
    // 服务端主动改 URL（push_patch）：不重新加载，照常上报参数
    sendRaw('__参数__', pushTo(c.target!));
  } else if (c.type === 'js') {
    runOps(c.ops || [], null);
  } else if (c.type === 'event') {
    let d: unknown = null;
    try { d = JSON.parse(c.payloadText || 'null'); } catch { /* 载荷不是 JSON 就当 null */ }
    try { window.dispatchEvent(new CustomEvent('qi:' + c.name, { detail: d })); } catch { /* 旧浏览器 */ }
  }
}

function apply(m: Frame): void {
  // 准入被拒：显示原因并**停止重连** —— 会话失效重连也没用，一直退避看起来像卡死
  if (m.denied !== undefined) {
    denied = true;
    const root = live();
    if (root) root.innerHTML = '<p class="qi-denied">' + m.denied + '</p>';
    try { window.dispatchEvent(new CustomEvent('qi:denied', { detail: m.denied })); } catch { /* 旧浏览器 */ }
    if (ws) { try { ws.close(); } catch { /* 已关 */ } }
    return;
  }
  // 流帧：按 data-key 往容器里加/删项，不经过 morph（容器有 data-ignore）。
  // 可能和内容帧同帧到达，所以不 return，继续往下走。
  if (m.streams !== undefined) applyStreams(m.streams);
  // 结构化槽位帧：合并变化的下标，用模板计划重渲 —— 走同一套 morph。
  // 拿不到计划（首帧还没到 / 服务端退回了字节 diff）时忽略，等下一帧全量。
  if (m.parts !== undefined) {
    const html = tpl.patch(m.parts);
    if (html === null) return;
    m = { html };
  }
  // 全量帧带计划：重置模板状态，之后的槽位帧才有的放矢
  if (m.plan !== undefined && m.slots !== undefined) {
    tpl.reset(m.plan, m.slots);
  }
  // 增量帧：用上一帧 + 前缀/后缀/中段拼回完整 HTML，再走同一套 morph
  if (m.patch !== undefined && lastHtml) {
    const pt = m.patch;
    const b = new TextEncoder().encode(lastHtml);
    const dec = new TextDecoder();
    m = { html: dec.decode(b.slice(0, pt.p)) + pt.r + (pt.s ? dec.decode(b.slice(b.length - pt.s)) : '') };
  }
  if (m.html !== undefined) {
    const root = live();
    lastHtml = m.html;
    buildKeyIndex();
    if (root) {
      const box = document.createElement('div');
      box.innerHTML = m.html;
      morphKids(root, box);
    }
    clearLoad();
  }
  if (m.commands !== undefined && m.commands.forEach) m.commands.forEach(runCmd);
  // 收到**任何**一帧都算服务端答复过了 —— 触发事件的元素该退出 qi-loading。
  // 以前只有内容帧和指令帧清；流帧、空帧不清，按钮就一直灰着。
  clearLoad();
}

// ── 连接与重连（指数退避 0.5s → 8s 封顶）──
function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host + cfg.ws);
  ws.onopen = () => {
    delay = 500;
    document.body.classList.remove('qi-offline');
    try { window.dispatchEvent(new CustomEvent('qi:online')); } catch { /* 旧浏览器 */ }
    if (cfg.sub) sendRaw('__订阅__', cfg.sub);
    // 首屏是按真实 URL 直出的，但 WS 建的是一份全新状态 —— 报一次当前 URL。
    // 只有开了轻路由的页面才报：这一趟在服务端要走 事件处理 + 渲染（常含查库）
    if (cfg.nav) sendRaw('__参数__', urlPayload());
    if (hbTimer) clearInterval(hbTimer);
    if (cfg.sub && cfg.hb > 0) hbTimer = setInterval(() => sendRaw('__心跳__', {}), cfg.hb) as unknown as number;
  };
  ws.onmessage = (e) => {
    let m: Frame;
    try { m = JSON.parse(e.data); } catch { return; }
    apply(m);
  };
  ws.onclose = () => {
    if (hbTimer) clearInterval(hbTimer);
    if (denied) return;
    document.body.classList.add('qi-offline');
    try { window.dispatchEvent(new CustomEvent('qi:offline')); } catch { /* 旧浏览器 */ }
    setTimeout(connect, delay);
    delay = Math.min(delay * 2, 8000);
  };
}

// ── 声明式绑定（事件委托：morph 换掉节点后无需重绑）──
function bind(): void {
  // 轻路由：改地址栏 + 上报新 URL，不重建连接。
  // 元素上通常还写着 href（右键新开标签页 / 禁用 JS 时能用），所以要 preventDefault。
  document.addEventListener('click', (e) => {
    if (!cfg.nav) return;
    const el = closestFrom(e.target, 'data-patch');
    if (!el) return;
    const ev = e as MouseEvent;
    // 新标签页/新窗口这些浏览器原生手势不拦
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    e.preventDefault();
    sendRaw('__参数__', pushTo(attr(el, 'data-patch') || ''));
  });

  // 前进 / 后退：地址栏已经由浏览器改好了，只补一次上报（不能再 pushState）
  window.addEventListener('popstate', () => {
    if (cfg.nav) sendRaw('__参数__', urlPayload());
  });

  // 客户端动作：不经服务端，点了当场跑（展开折叠、闪一下、聚焦）。
  // 与 data-click 互不干扰 —— 同一个元素两个都写就两件事都做。
  document.addEventListener('click', (e) => {
    const el = closestFrom(e.target, 'data-js-click');
    if (el) runOps(parseOps(attr(el, 'data-js-click')), el);
  });

  document.addEventListener('click', (e) => {
    const el = closestFrom(e.target, 'data-click');
    if (!el) return;
    const ev = attr(el, 'data-click');
    const cf = attr(el, 'data-confirm');
    if (cf) { qiConfirm(cf, () => send(ev, vals(el), el)); return; }
    send(ev, vals(el), el);
  });

  document.addEventListener('input', (e) => {
    const el = closestFrom(e.target, 'data-input') as HTMLInputElement | null;
    if (!el) return;
    const ev = attr(el, 'data-input');
    const p: Payload = vals(el);
    p.value = el.value;
    const ms = parseInt(attr(el, 'data-debounce') || '0', 10);
    if (ms > 0) {
      const holder = el as HTMLInputElement & { __qiT?: number };
      if (holder.__qiT) clearTimeout(holder.__qiT);
      holder.__qiT = setTimeout(() => send(ev, p, el), ms) as unknown as number;
    } else {
      send(ev, p, el);
    }
  });

  document.addEventListener('keyup', (e) => {
    const el = closestFrom(e.target, 'data-keyup') as HTMLInputElement | null;
    if (!el) return;
    const filter = attr(el, 'data-key-filter');
    if (filter && filter !== e.key) return;
    const p: Payload = vals(el);
    p.key = e.key;
    if (el.value !== undefined) p.value = el.value;
    send(attr(el, 'data-keyup'), p, el);
    if (el.hasAttribute('data-clear-on-key')) el.value = '';
  });

  document.addEventListener('submit', (e) => {
    const f = closestFrom(e.target, 'data-submit') as HTMLFormElement | null;
    if (!f) return;
    e.preventDefault();
    const doSubmit = () => {
      const d: Payload = vals(f);
      new FormData(f).forEach((v, k) => { d[k] = v; });
      send(attr(f, 'data-submit'), d, f);
      if (cfg.sub) f.reset();
    };
    const cf = attr(f, 'data-confirm');
    if (cf) { qiConfirm(cf, doSubmit); return; }
    doSubmit();
  });
}

// ── 启动 ──
//
// 两种页面共用这一份 bundle：
//   实时页  —— 有 window.QI_LIVE（或后来有人调 qiLiveStart），连 WS、绑声明式事件
//   普通页  —— 登录页、设置页这种，只挂确认框和 .qdd 下拉，不连 WS
//
// 布局层可能已经发过一份运行时，实时页又通过 实时运行时构建() 再发一份，所以
// 两处都要防重：第二份脚本撞上 __qiuiLoaded 直接退出，qiLiveStart 也只认第一次。
// 配置脚本会先试着调 qiLiveStart（运行时先到的情况），没有就留给下面的自启。
let started = false;

function start(c: LiveConfig): void {
  if (started || !c || !c.ws) return;
  started = true;
  cfg = c;
  bind();
  connect();
}

function boot(): void {
  if (window.__qiuiLoaded) return;
  window.__qiuiLoaded = true;

  // 应用侧出口：拖拽/画布/快捷键这类自定义交互自己上行
  window.qiSend = (event: string, payload?: Payload) => send(event, payload || {}, null);
  window.qiConfirm = qiConfirm;
  window.qiStream = qiStream;
  window.qiRich = qiRich;
  window.qiLiveStart = start;

  injectStyle();
  bindDropdowns();
  if (window.QI_LIVE) start(window.QI_LIVE);
}

boot();
