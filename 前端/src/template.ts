/**
 * 模板计划渲染器 —— 客户端这一半的结构化 diff。
 *
 * `HTML{…}` 在**编译期**就被切成两半：静态结构（计划）和动态槽位（值数组）。
 * 同一个模板连续两帧，计划一模一样，差异全部落在槽位里。于是服务端首帧发
 * 「计划 + 全部槽位」，之后只发变化的那几个槽位，客户端拿计划自己重渲再 morph。
 *
 * 对比原先的按字节前后缀 diff：改一个数字从 ~3.5KB 降到几十字节，而且列表中间
 * 插一行也不会退化成全量（字节 diff 会）。
 *
 * 这份实现必须和服务端 qi-web/HTML块.qi 的 模板节点 / 渲染块 逐条对齐 ——
 * 两边渲染结果不一致会表现成「morph 之后页面对不上」，极难查。
 * 两份名单（空元素 / 布尔属性）是从服务端实现里抽出来同步的，改一边要改两边。
 */

/** 动态值的类型前缀，和 HTML块.qi 里的标记一一对应（都是 13 个字符） */
const MARK_LEN = 13;
const MARK_RAW = '__QI_HTML_H__';   // 受控原文，不转义
const MARK_TEXT = '__QI_HTML_T__';  // 文本，要转义
const MARK_ATTR = '__QI_HTML_S__';  // 属性值
const MARK_TRUE = '__QI_HTML_B1__';
const MARK_FALSE = '__QI_HTML_B0__';

/** 自闭合标签：不输出结束标签（与服务端 是空元素 同一份名单） */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** 布尔属性：动态值为真时只输出属性名（与服务端 是布尔属性 同一份名单） */
const BOOL_ATTRS = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'defer',
  'disabled', 'formnovalidate', 'hidden', 'inert', 'ismap', 'itemscope', 'loop', 'multiple',
  'muted', 'nomodule', 'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed',
  'selected',
]);

interface PlanAttr {
  k: string;      // b=布尔 s=静态 d=动态
  n: string;      // 属性名
  v?: string;     // k==="s" 的静态值
  i?: number;     // k==="d" 的槽位下标
}

export interface PlanNode {
  k?: string;       // t=静态文本 d=动态正文 e=元素 f=片段
  q?: number;       // 条件槽位下标；值为假时整个节点不渲染
  v?: string;       // k==="t" 的静态文本
  i?: number;       // k==="d" 的槽位下标
  n?: string;       // k==="e" 的标签名
  a?: PlanAttr[];
  c?: PlanNode[];
}

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slotAt(slots: string[], i: number | undefined): string {
  if (i === undefined || i < 0 || i >= slots.length) {
    throw new Error('模板槽位下标越界: ' + i);
  }
  return slots[i];
}

/** 拆掉 13 字符类型前缀，返回 [标记, 实际值] */
function splitMark(value: string): [string, string] {
  if (value.length < MARK_LEN) throw new Error('模板动态值缺少类型标记');
  return [value.slice(0, MARK_LEN), value.slice(MARK_LEN)];
}

function renderAttrs(attrs: PlanAttr[] | undefined, slots: string[]): string {
  if (!attrs) return '';
  let out = '';
  for (const attr of attrs) {
    if (attr.k === 'b') {
      out += ' ' + attr.n;
    } else if (attr.k === 's') {
      out += ' ' + attr.n + '="' + esc(attr.v ?? '') + '"';
    } else if (attr.k === 'd') {
      const raw = slotAt(slots, attr.i);
      if (raw === MARK_TRUE) {
        if (!BOOL_ATTRS.has(attr.n.toLowerCase())) throw new Error('不是布尔属性: ' + attr.n);
        out += ' ' + attr.n;
      } else if (raw === MARK_FALSE) {
        // 假布尔属性不输出
      } else {
        const [mark, value] = splitMark(raw);
        if (mark !== MARK_ATTR) throw new Error('动态属性值类型无效: ' + attr.n);
        out += ' ' + attr.n + '="' + esc(value) + '"';
      }
    } else {
      throw new Error('模板属性节点类型无效: ' + attr.k);
    }
  }
  return out;
}

function renderNode(node: PlanNode, slots: string[]): string {
  // 条件节点：值为假时整段不出现
  if (node.q !== undefined) {
    const cond = slotAt(slots, node.q);
    if (cond === MARK_FALSE) return '';
    if (cond !== MARK_TRUE) throw new Error('条件节点只接受布尔值');
  }

  if (node.k === 't') return esc(node.v ?? '');

  if (node.k === 'd') {
    const [mark, value] = splitMark(slotAt(slots, node.i));
    if (mark === MARK_RAW) return value;
    if (mark === MARK_TEXT) return esc(value);
    throw new Error('正文动态值类型无效');
  }

  let inner = '';
  for (const child of node.c ?? []) inner += renderNode(child, slots);

  if (node.k === 'f') return inner;   // 片段：没有外层标签
  if (node.k !== 'e') throw new Error('模板节点类型无效: ' + node.k);

  const tag = node.n ?? '';
  const attrs = renderAttrs(node.a, slots);
  if (VOID_TAGS.has(tag.toLowerCase())) {
    if (inner.length > 0) throw new Error('空元素不能包含内容: ' + tag);
    return '<' + tag + attrs + '>';
  }
  return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
}

/** 计划 + 槽位 → HTML 片段 */
export function renderPlan(plan: PlanNode, slots: string[]): string {
  return renderNode(plan, slots);
}

/**
 * 一个实时区域的模板状态：计划固定，槽位随帧更新。
 *
 * 服务端只在「模板换了」时重发计划；槽位帧是稀疏的（只带变化的下标）。
 */
export class TemplateState {
  private plan: PlanNode | null = null;
  private slots: string[] = [];

  /** 完整帧：换计划 + 全量槽位 */
  reset(plan: PlanNode, slots: string[]): void {
    this.plan = plan;
    this.slots = slots.slice();
  }

  /** 槽位帧：合并变化的下标后重渲；还没有计划时返回 null（调用方退回全量） */
  patch(changed: Record<string, string>): string | null {
    if (!this.plan) return null;
    for (const key of Object.keys(changed)) {
      const i = parseInt(key, 10);
      if (i >= 0 && i < this.slots.length) this.slots[i] = changed[key];
    }
    return renderPlan(this.plan, this.slots);
  }

  get ready(): boolean {
    return this.plan !== null;
  }
}
