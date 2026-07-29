import type { PlanNode, SlotPatch, SlotValue } from './template';
import type { StreamPatch } from './stream-ops';

/** 页面里由 qi 侧注入的配置：<script>window.QI_LIVE={ws:"/x/ws",sub:{...},hb:30000}</script> */
export interface LiveConfig {
  /** WebSocket 路径 */
  ws: string;
  /** 首帧 __订阅__ 的载荷；null = 不发订阅帧（无鉴权页面） */
  sub: Record<string, unknown> | null;
  /** 心跳间隔毫秒，0 = 关闭 */
  hb: number;
}

/** 下行帧：整区 HTML / 字节增量 / 结构化槽位 / 浏览器指令 / 准入拒绝 */
export interface Frame {
  html?: string;
  /** 字节级增量：前缀长度 / 后缀长度 / 中段替换内容 */
  patch?: { p: number; s: number; r: string };
  /** 结构化 diff：模板静态计划（跟 html 一起来，只在模板变化时重发） */
  plan?: PlanNode;
  /** 结构化 diff：全量槽位（跟 plan 一起来） */
  slots?: SlotValue[];
  /**
   * 结构化 diff：稀疏槽位更新 —— 常态帧，通常只有几十到一百多字节。
   * 值是字符串就整槽替换；`{c:…}` 钻进嵌套的 HTML{}；`{l:…}` 钻进 对于={} 循环。
   */
  parts?: Record<string, SlotPatch>;
  /** 实时流：按 data-key 往容器里加/删项（对标 Phoenix Streams） */
  streams?: StreamPatch[];
  commands?: Command[];
  denied?: string;
}

export interface Command {
  type: string;
  target?: string;
  text?: string;
  name?: string;
  payloadText?: string;
}

export type Payload = Record<string, unknown>;

/** window.qiStream(opts)：SSE 流式对话，见 stream.ts */
export interface StreamOpts {
  /** SSE 地址 */
  url: string;
  /** 正文渲染目标（元素或 id） */
  el: HTMLElement | string;
  /** 需要自动滚到底的容器（元素或 id） */
  scroller?: HTMLElement | string;
  /** 富渲染的动作端点；给了就用 window.qiRich，不给就纯文本 */
  act?: string;
  /** 工具调用时的状态文案，{name} 会被替换成工具名 */
  toolHint?: string;
  /** 开流瞬间先放的占位 HTML（光标、骨架） */
  waitingHtml?: string;
  /** 流结束但一个字都没收到时显示的文案 */
  doneText?: string;
  /** 连接出错且正文为空时显示的文案 */
  errorText?: string;
}

declare global {
  interface Window {
    QI_LIVE?: LiveConfig;
    qiSend?: (event: string, payload?: Payload) => void;
    qiConfirm?: (msg: string, onOk: () => void) => void;
    /** 运行时晚于配置加载时由配置脚本调用；也是第二次注入的防重开关 */
    qiLiveStart?: (cfg: LiveConfig) => void;
    __qiuiLoaded?: boolean;
    /** SSE 流式对话 */
    qiStream?: (opts: StreamOpts) => EventSource | null;
    /** 富渲染：markdown + table/list/kv/card 块 + 声明式动作按钮 */
    qiRich?: (el: HTMLElement, buf: string, act?: string) => void;
  }
}
