/**
 * 轻路由（对标 Phoenix live_patch）。
 *
 * 标签页、筛选、翻页、点开详情 —— 这些都该改 URL（能收藏、能分享、后退键要管用），
 * 但不该重建连接。这里只做两件事：改地址栏，然后把新 URL 报给服务端。
 * 服务端在同一个状态上跑一遍 参数处理函数、重渲、回一帧 —— 连接不断，状态不丢。
 */
import type { Payload } from './types';

/** 当前 URL → 上报载荷。查询值一律是字符串（URL 里本来就没有类型） */
export function urlPayload(url?: string): Payload {
  const u = url ? new URL(url, location.href) : new URL(location.href);
  const query: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { query[k] = v; });
  return { path: u.pathname, query };
}

/**
 * 走一次轻路由：改地址栏（进历史），返回要上报的载荷。
 * 目标可以是相对的（"?tab=b"、"./7"）也可以是绝对路径。
 */
export function pushTo(target: string): Payload {
  const u = new URL(target, location.href);
  // 跨站/跨源就别拦了，交给浏览器正常跳走
  if (u.origin !== location.origin) {
    location.href = u.href;
    return {};
  }
  try {
    history.pushState({ qi: 1 }, '', u.pathname + u.search + u.hash);
  } catch { /* 某些环境禁了 pushState，地址栏不变但功能照常 */ }
  return urlPayload(u.href);
}
