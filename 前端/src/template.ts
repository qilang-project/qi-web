/**
 * 模板计划渲染器 —— 客户端这一半的结构化 diff。
 *
 * `HTML{…}` 在**编译期**就被切成两半：静态结构（计划）和动态槽位（值数组）。
 * 同一个模板连续两帧，计划一模一样，差异全部落在槽位里。于是服务端首帧发
 * 「计划 + 全部槽位」，之后只发变化的那几个槽位，客户端拿计划自己重渲再 morph。
 *
 * 槽位不止是字符串 —— 嵌套的 `HTML{}` 和 `对于={}` 循环会带着**自己的**计划和
 * 槽位一起进来（见下面的信封说明）。所以一帧「20 项列表改第 7 项的标题」只有
 * 一百多字节，而不是整段列表 HTML。
 *
 * 对比原先的按字节前后缀 diff：改一个数字从 ~3.5KB 降到几十字节，而且列表中间
 * 插一行也不会退化成全量（字节 diff 会）。
 *
 * 这份实现必须和服务端 qi-web/HTML块.qi 的 模板节点 / 渲染块 / 模板槽位差异
 * 逐条对齐 —— 两边渲染结果不一致会表现成「morph 之后页面对不上」，极难查。
 * 两份名单（空元素 / 布尔属性）是从服务端实现里抽出来同步的，改一边要改两边。
 */

/** 动态值的类型前缀，和 HTML块.qi 里的标记一一对应（都是 13 个字符） */
const MARK_LEN = 13;
const MARK_RAW = '__QI_HTML_H__';   // 受控原文，不转义
const MARK_TEXT = '__QI_HTML_T__';  // 文本，要转义
const MARK_ATTR = '__QI_HTML_S__';  // 属性值
const MARK_TRUE = '__QI_HTML_B1__';
const MARK_FALSE = '__QI_HTML_B0__';
const MARK_CHILD = '__QI_HTML_C__'; // 子模板信封 {p,s,h}
const MARK_LOOP = '__QI_HTML_L__';  // 循环信封 {p,s:[[…],[…]],h}

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

/** 嵌套的 `HTML{}`：自带计划和槽位，能单独打补丁 */
interface ChildSlot { kind: 'c'; plan: PlanNode; slots: SlotValue[] }
/** `对于={}` 循环：一份每项计划 + 每项一组槽位 */
interface LoopSlot { kind: 'l'; plan: PlanNode; items: SlotValue[][] }

/** 一个槽位的值：普通带标记的字符串，或一个嵌套结构 */
export type SlotValue = string | ChildSlot | LoopSlot;

/** 服务端下发的稀疏补丁：字符串=整值替换，{c}=钻进子模板，{l}=钻进循环 */
export type SlotPatch =
  | string
  | { c: Record<string, SlotPatch> }
  | { l: { n: number; i: Record<string, SlotPatch[] | Record<string, SlotPatch>> } };

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 线上的槽位值 → 内部表示。嵌套信封在这里就拆开，之后打补丁才能直接钻进去改，
 * 不用每次重新 JSON.parse 一大坨。
 *
 * 信封里的 `h`（服务端已渲染好的 HTML）客户端**不用** —— 我们拿 p+s 自己重渲，
 * 两边渲染器逐字节一致（fixtures-template.json 那组黄金样本盯着这件事）。
 */
function parseSlot(raw: SlotValue): SlotValue {
  if (typeof raw !== 'string') return raw;
  const mark = raw.slice(0, MARK_LEN);
  if (mark !== MARK_CHILD && mark !== MARK_LOOP) return raw;
  let env: { p: PlanNode; s: unknown };
  try {
    env = JSON.parse(raw.slice(MARK_LEN));
  } catch {
    throw new Error('模板嵌套信封不是合法 JSON');
  }
  if (mark === MARK_CHILD) {
    return { kind: 'c', plan: env.p, slots: (env.s as SlotValue[]).map(parseSlot) };
  }
  return {
    kind: 'l',
    plan: env.p,
    items: (env.s as SlotValue[][]).map((one) => one.map(parseSlot)),
  };
}

function slotAt(slots: SlotValue[], i: number | undefined): SlotValue {
  if (i === undefined || i < 0 || i >= slots.length) {
    throw new Error('模板槽位下标越界: ' + i);
  }
  return slots[i];
}

/** 取一个必然是字符串的槽位（属性/条件位置不允许嵌套块） */
function strSlotAt(slots: SlotValue[], i: number | undefined, where: string): string {
  const v = slotAt(slots, i);
  if (typeof v !== 'string') throw new Error(where + '不能是嵌套模板');
  return v;
}

/** 拆掉 13 字符类型前缀，返回 [标记, 实际值] */
function splitMark(value: string): [string, string] {
  if (value.length < MARK_LEN) throw new Error('模板动态值缺少类型标记');
  return [value.slice(0, MARK_LEN), value.slice(MARK_LEN)];
}

function renderAttrs(attrs: PlanAttr[] | undefined, slots: SlotValue[]): string {
  if (!attrs) return '';
  let out = '';
  for (const attr of attrs) {
    if (attr.k === 'b') {
      out += ' ' + attr.n;
    } else if (attr.k === 's') {
      out += ' ' + attr.n + '="' + esc(attr.v ?? '') + '"';
    } else if (attr.k === 'd') {
      const raw = strSlotAt(slots, attr.i, '属性 ' + attr.n);
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

function renderNode(node: PlanNode, slots: SlotValue[]): string {
  // 条件节点：值为假时整段不出现
  if (node.q !== undefined) {
    const cond = strSlotAt(slots, node.q, '条件节点');
    if (cond === MARK_FALSE) return '';
    if (cond !== MARK_TRUE) throw new Error('条件节点只接受布尔值');
  }

  if (node.k === 't') return esc(node.v ?? '');

  if (node.k === 'd') {
    const raw = parseSlot(slotAt(slots, node.i));
    if (typeof raw !== 'string') {
      // 嵌套：子模板整块重渲；循环把每项按同一份计划渲一遍再接起来
      if (raw.kind === 'c') return renderNode(raw.plan, raw.slots);
      return raw.items.map((one) => renderNode(raw.plan, one)).join('');
    }
    const [mark, value] = splitMark(raw);
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
export function renderPlan(plan: PlanNode, slots: SlotValue[]): string {
  return renderNode(plan, slots);
}

/** 结构对不上（服务端说钻进去、客户端手上却是别的形状）—— 退回全量，不硬猜 */
class SlotShapeError extends Error {}

function applyParts(slots: SlotValue[], parts: Record<string, SlotPatch>): void {
  for (const key of Object.keys(parts)) {
    const i = parseInt(key, 10);
    if (!(i >= 0 && i < slots.length)) continue;   // 越界的补丁忽略掉，不炸
    const patch = parts[key];
    if (typeof patch === 'string') {
      slots[i] = parseSlot(patch);
      continue;
    }
    const cur = slots[i];
    if (typeof cur === 'string') throw new SlotShapeError('槽位不是嵌套块');
    if ('c' in patch) {
      if (cur.kind !== 'c') throw new SlotShapeError('槽位不是子模板');
      applyParts(cur.slots, patch.c);
    } else {
      if (cur.kind !== 'l') throw new SlotShapeError('槽位不是循环');
      applyLoop(cur, patch.l);
    }
  }
}

function applyLoop(loop: LoopSlot, l: { n: number; i: Record<string, SlotPatch[] | Record<string, SlotPatch>> }): void {
  for (const key of Object.keys(l.i)) {
    const idx = parseInt(key, 10);
    if (!(idx >= 0)) continue;
    const one = l.i[key];
    if (Array.isArray(one)) {
      // 整项换（新增的项，或槽位数变了）
      loop.items[idx] = one.map((v) => parseSlot(v as SlotValue));
    } else {
      // 就地改：只有这一项里的某几个槽位变了
      if (!loop.items[idx]) throw new SlotShapeError('循环项不存在: ' + idx);
      applyParts(loop.items[idx], one);
    }
  }
  // 项数以服务端为准：删到只剩 n 项（新增的项上面已经填好了）
  if (typeof l.n === 'number' && l.n >= 0) loop.items.length = l.n;
}

/**
 * 一个实时区域的模板状态：计划固定，槽位随帧更新。
 *
 * 服务端只在「模板换了」时重发计划；槽位帧是稀疏的，而且会往嵌套里钻
 * （子模板 / 循环项），所以这里存的是**拆开后的**槽位树，不是原始字符串。
 */
export class TemplateState {
  private plan: PlanNode | null = null;
  private slots: SlotValue[] = [];

  /** 完整帧：换计划 + 全量槽位 */
  reset(plan: PlanNode, slots: SlotValue[]): void {
    this.plan = plan;
    this.slots = slots.map(parseSlot);
  }

  /**
   * 槽位帧：合并变化后重渲。
   * 还没有计划、或补丁形状和手上的槽位对不上时返回 null（调用方退回全量）。
   */
  patch(parts: Record<string, SlotPatch>): string | null {
    if (!this.plan) return null;
    try {
      applyParts(this.slots, parts);
    } catch (e) {
      if (e instanceof SlotShapeError) { this.plan = null; return null; }
      throw e;
    }
    return renderPlan(this.plan, this.slots);
  }

  get ready(): boolean {
    return this.plan !== null;
  }
}
