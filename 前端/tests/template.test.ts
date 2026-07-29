/**
 * 模板计划渲染器测试。
 *
 * 这里的 plan 和 slots 不是手编的 —— 是从服务端 `HTML{…}` 真实编译产物里抄出来的
 * （见 qi-test/用例/模板计划_测.qi，那边断言服务端渲染结果，这边断言客户端渲染
 * 结果，两边字符串必须一模一样）。任何一边改了转义或标签处理，另一边就会红。
 */
import { describe, expect, it } from 'vitest';
import { renderPlan, TemplateState, type PlanNode } from '../src/template';

const T = (s: string) => '__QI_HTML_T__' + s;   // 文本，要转义
const H = (s: string) => '__QI_HTML_H__' + s;   // 受控原文
const S = (s: string) => '__QI_HTML_S__' + s;   // 属性值
const TRUE = '__QI_HTML_B1__';
const FALSE = '__QI_HTML_B0__';

// HTML { <div class="card"><b>{名}</b> <span>{分} 分</span></div> }
const CARD: PlanNode = {
  k: 'e', n: 'div', a: [{ k: 's', n: 'class', v: 'card' }],
  c: [
    { k: 'e', n: 'b', c: [{ k: 'd', i: 0 }] },
    { k: 't', v: ' ' },
    { k: 'e', n: 'span', c: [{ k: 'd', i: 1 }, { k: 't', v: ' 分' }] },
  ],
};

describe('renderPlan', () => {
  it('静态结构 + 动态槽位', () => {
    expect(renderPlan(CARD, [T('三宝'), T('50')]))
      .toBe('<div class="card"><b>三宝</b> <span>50 分</span></div>');
  });

  it('只换槽位，结构不变', () => {
    expect(renderPlan(CARD, [T('三宝'), T('65')]))
      .toBe('<div class="card"><b>三宝</b> <span>65 分</span></div>');
  });

  it('文本槽位要转义 —— 这是唯一挡在用户输入和页面之间的东西', () => {
    expect(renderPlan(CARD, [T('<script>alert(1)</script>'), T('0')]))
      .toContain('&lt;script&gt;');
  });

  it('受控原文不转义（框架自己生成的可信 HTML）', () => {
    const plan: PlanNode = { k: 'f', c: [{ k: 'd', i: 0 }] };
    expect(renderPlan(plan, [H('<em>粗体</em>')])).toBe('<em>粗体</em>');
  });

  it('静态文本同样转义', () => {
    const plan: PlanNode = { k: 'f', c: [{ k: 't', v: 'a < b & c' }] };
    expect(renderPlan(plan, [])).toBe('a &lt; b &amp; c');
  });
});

describe('属性', () => {
  it('动态属性值转义，引号逃逸不了', () => {
    const plan: PlanNode = { k: 'e', n: 'img', a: [{ k: 'd', n: 'alt', i: 0 }] };
    const html = renderPlan(plan, [S('x" onerror="alert(1)')]);
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&quot;');
  });

  it('布尔属性：真只输出名字，假整个不输出', () => {
    const plan: PlanNode = { k: 'e', n: 'input', a: [{ k: 'd', n: 'checked', i: 0 }] };
    expect(renderPlan(plan, [TRUE])).toBe('<input checked>');
    expect(renderPlan(plan, [FALSE])).toBe('<input>');
  });

  it('把非布尔属性当布尔用要报错', () => {
    const plan: PlanNode = { k: 'e', n: 'div', a: [{ k: 'd', n: 'title', i: 0 }] };
    expect(() => renderPlan(plan, [TRUE])).toThrow('不是布尔属性');
  });

  it('静态布尔属性', () => {
    const plan: PlanNode = { k: 'e', n: 'input', a: [{ k: 'b', n: 'required' }] };
    expect(renderPlan(plan, [])).toBe('<input required>');
  });
});

describe('标签', () => {
  it('空元素不出结束标签', () => {
    expect(renderPlan({ k: 'e', n: 'br' }, [])).toBe('<br>');
  });

  it('空元素带内容要报错（服务端也报）', () => {
    const plan: PlanNode = { k: 'e', n: 'img', c: [{ k: 't', v: 'x' }] };
    expect(() => renderPlan(plan, [])).toThrow('空元素不能包含内容');
  });

  it('片段没有外层标签', () => {
    const plan: PlanNode = {
      k: 'f', c: [{ k: 'e', n: 'li', c: [{ k: 't', v: '一' }] },
                  { k: 'e', n: 'li', c: [{ k: 't', v: '二' }] }],
    };
    expect(renderPlan(plan, [])).toBe('<li>一</li><li>二</li>');
  });
});

describe('条件节点', () => {
  const plan: PlanNode = {
    k: 'f', c: [{ k: 'e', n: 'p', q: 0, c: [{ k: 't', v: '出现' }] }],
  };
  it('真才渲染', () => {
    expect(renderPlan(plan, [TRUE])).toBe('<p>出现</p>');
    expect(renderPlan(plan, [FALSE])).toBe('');
  });
  it('非布尔值要报错', () => {
    expect(() => renderPlan(plan, [T('随便')])).toThrow('条件节点只接受布尔值');
  });
});

describe('越界与坏数据', () => {
  it('槽位下标越界要报错，不能静默渲成空', () => {
    expect(() => renderPlan({ k: 'd', i: 5 }, [T('a')])).toThrow('越界');
  });
  it('动态值缺类型标记要报错', () => {
    expect(() => renderPlan({ k: 'd', i: 0 }, ['裸值'])).toThrow('类型标记');
  });
});

describe('TemplateState', () => {
  it('没有计划时槽位帧返回 null（调用方退回全量）', () => {
    expect(new TemplateState().patch({ '0': T('x') })).toBeNull();
  });

  it('稀疏槽位帧只改指定下标', () => {
    const st = new TemplateState();
    st.reset(CARD, [T('三宝'), T('50')]);
    expect(st.patch({ '1': T('65') }))
      .toBe('<div class="card"><b>三宝</b> <span>65 分</span></div>');
    // 再来一帧只动第 0 位，第 1 位保持上次的值
    expect(st.patch({ '0': T('七宝') }))
      .toBe('<div class="card"><b>七宝</b> <span>65 分</span></div>');
  });

  it('换计划后按新计划渲染', () => {
    const st = new TemplateState();
    st.reset(CARD, [T('三宝'), T('50')]);
    st.reset({ k: 'e', n: 'p', c: [{ k: 'd', i: 0 }] }, [T('换了个模板')]);
    expect(st.patch({})).toBe('<p>换了个模板</p>');
  });

  it('越界下标忽略掉，不炸', () => {
    const st = new TemplateState();
    st.reset(CARD, [T('三宝'), T('50')]);
    expect(st.patch({ '9': T('野值') })).toContain('三宝');
  });
});

/**
 * 服务端/客户端渲染一致性（黄金样本）。
 *
 * fixtures-template.json 是**服务端真实编译产物**：用 qi 跑一段 HTML{…}，
 * 把 块计划()/块槽位()/渲染块() 三样原样导出来（生成脚本见
 * qi-web/前端/tests/生成样本.md）。这里断言客户端用同样的 plan+slots 渲染出
 * 逐字节相同的 HTML。
 *
 * 两边任何一方改了转义规则、空元素名单、布尔属性名单、属性顺序，这组就会红 ——
 * 不然线上表现是「morph 之后页面莫名其妙对不上」，极难查。
 */
import fixtures from './fixtures-template.json';

describe('服务端 / 客户端渲染一致', () => {
  const cases = fixtures as Array<{ plan: PlanNode; slots: string[]; html: string }>;

  it('样本不是空的（生成脚本挂了要立刻知道）', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  cases.forEach((c, idx) => {
    it(`样本 ${idx + 1}：客户端渲染结果与服务端逐字节相同`, () => {
      expect(renderPlan(c.plan, c.slots)).toBe(c.html);
    });
  });

  it('覆盖到了各种节点类型（样本别退化成只有纯文本）', () => {
    const all = JSON.stringify(cases);
    expect(all).toContain('__QI_HTML_H__');   // 受控原文
    expect(all).toContain('__QI_HTML_B1__');  // 布尔真
    expect(all).toContain('__QI_HTML_B0__');  // 布尔假
    expect(all).toContain('"q"');             // 条件节点
    expect(all).toContain('"n":"br"');        // 空元素
  });
});
