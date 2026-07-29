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
    expect(all).toContain('__QI_HTML_C__');   // 嵌套子模板信封
    expect(all).toContain('__QI_HTML_L__');   // 循环信封
    expect(all).toContain('"q"');             // 条件节点
    expect(all).toContain('"n":"br"');        // 空元素
  });
});

/**
 * 嵌套：子模板与循环。
 *
 * 这是 #2 LiveComponent / #3 Streams 的地基 —— 子块和列表项各自带着计划和槽位
 * 进到父模板的槽位里，所以「20 项列表改第 7 项」只发那一项的那个槽位。
 * 以前子块进父模板就被拍成一坨 HTML，改一个字要整坨重发。
 */
const C = (plan: PlanNode, slots: string[]) =>
  '__QI_HTML_C__' + JSON.stringify({ p: plan, s: slots, h: '' });
const L = (plan: PlanNode, items: string[][]) =>
  '__QI_HTML_L__' + JSON.stringify({ p: plan, s: items, h: '' });

// HTML { <span><b>{名}</b>{分}</span> }
const BADGE: PlanNode = {
  k: 'e', n: 'span',
  c: [{ k: 'e', n: 'b', c: [{ k: 'd', i: 0 }] }, { k: 'd', i: 1 }],
};
// 循环每一项：<li data-key={名}>{名}</li>
const ITEM: PlanNode = {
  k: 'e', n: 'li', a: [{ k: 'd', n: 'data-key', i: 0 }], c: [{ k: 'd', i: 1 }],
};
// 外层：<div><h1>{标题}</h1>{徽章}{列表}</div>
const PAGE: PlanNode = {
  k: 'e', n: 'div',
  c: [{ k: 'e', n: 'h1', c: [{ k: 'd', i: 0 }] }, { k: 'd', i: 1 }, { k: 'd', i: 2 }],
};
const 三项 = [
  [S('甲'), T('甲')],
  [S('乙'), T('乙')],
  [S('丙'), T('丙')],
];
const 首帧 = () => [
  T('看板'),
  C(BADGE, [T('三宝'), T('50')]),
  L(ITEM, 三项.map((x) => x.slice())),
];

describe('嵌套子模板', () => {
  it('信封里的 plan + slots 自己重渲（h 字段客户端不用）', () => {
    expect(renderPlan(PAGE, 首帧()))
      .toBe('<div><h1>看板</h1><span><b>三宝</b>50</span>'
        + '<li data-key="甲">甲</li><li data-key="乙">乙</li><li data-key="丙">丙</li></div>');
  });

  it('钻进子模板只改一个槽位', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    const html = st.patch({ '1': { c: { '1': T('65') } } });
    expect(html).toContain('<b>三宝</b>65');
    expect(html).toContain('看板');          // 外层没动
  });

  it('子模板整体换掉（换了模板时服务端发整值）', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    const html = st.patch({ '1': C({ k: 'e', n: 'em', c: [{ k: 'd', i: 0 }] }, [T('换了')]) });
    expect(html).toContain('<em>换了</em>');
    expect(html).not.toContain('<b>三宝</b>');
  });
});

describe('循环', () => {
  it('改一项里的一个槽位，其他项原样不动', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    const html = st.patch({ '2': { l: { n: 3, i: { '1': { '1': T('乙改了') } } } } });
    expect(html).toContain('<li data-key="乙">乙改了</li>');
    expect(html).toContain('<li data-key="甲">甲</li>');
    expect(html).toContain('<li data-key="丙">丙</li>');
  });

  it('末尾新增一项：只发那一项的完整槽位', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    const html = st.patch({ '2': { l: { n: 4, i: { '3': [S('丁'), T('丁')] } } } });
    expect(html).toContain('<li data-key="丁">丁</li>');
    expect((html!.match(/<li /g) || []).length).toBe(4);
  });

  it('删项：n 变小就截断，哪怕 i 是空的', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    const html = st.patch({ '2': { l: { n: 1, i: {} } } });
    expect((html!.match(/<li /g) || []).length).toBe(1);
    expect(html).toContain('data-key="甲"');
  });

  it('空列表渲染成空串，不是崩', () => {
    expect(renderPlan(PAGE, [T('空'), C(BADGE, [T('x'), T('0')]), L(ITEM, [])]))
      .toBe('<div><h1>空</h1><span><b>x</b>0</span></div>');
  });

  it('补丁连着打，状态是累积的', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    st.patch({ '2': { l: { n: 3, i: { '0': { '1': T('甲改') } } } } });
    const html = st.patch({ '0': T('新标题') });
    expect(html).toContain('新标题');
    expect(html).toContain('>甲改<');     // 上一轮的改动还在
  });
});

describe('补丁形状对不上就退回全量', () => {
  it('说要钻进子模板、手上却是普通字符串 → 返回 null', () => {
    const st = new TemplateState();
    st.reset(CARD, [T('三宝'), T('50')]);
    expect(st.patch({ '0': { c: { '0': T('x') } } })).toBeNull();
  });

  it('说是循环、手上是子模板 → 返回 null', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    expect(st.patch({ '1': { l: { n: 1, i: {} } } })).toBeNull();
  });

  it('退回之后不再半吊子打补丁（等服务端发全量）', () => {
    const st = new TemplateState();
    st.reset(PAGE, 首帧());
    st.patch({ '1': { l: { n: 1, i: {} } } });
    expect(st.ready).toBe(false);
    expect(st.patch({ '0': T('随便') })).toBeNull();
  });
});

/**
 * 补丁回放（黄金样本）—— 服务端真实产物端到端。
 *
 * fixtures-patch.json 是一串**连续帧**：首帧带 plan+slots，之后每帧只有服务端
 * 算出来的 parts，每帧都记着服务端那一刻渲染出的 html（生成脚本见 README）。
 * 这里按帧顺序打补丁，每一步都要和服务端的 html 逐字节相同。
 *
 * 前面那组黄金样本只验「同一份 plan+slots 两边渲染一致」；这组验的是
 * **补丁语义**：钻进子模板、钻进循环、改项、加项、删项、整体挪位。
 * 服务端 模板槽位差异 和客户端 applyParts/applyLoop 是一对，一边改了另一边没跟上，
 * 线上表现是「点几下之后页面莫名其妙对不上」，不会报错 —— 只有这组能拦住。
 */
import patchFixtures from './fixtures-patch.json';

describe('补丁回放：服务端算的 parts，客户端要还原出同样的 HTML', () => {
  type Step = { 说明: string; plan?: PlanNode; slots?: string[]; parts?: Record<string, any>; html: string };
  const steps = patchFixtures as Step[];

  it('样本不是空的，且覆盖到嵌套与循环', () => {
    expect(steps.length).toBeGreaterThan(3);
    const all = JSON.stringify(steps);
    expect(all).toContain('"c":');   // 钻进子模板的补丁
    expect(all).toContain('"l":');   // 钻进循环的补丁
  });

  it('按帧顺序打补丁，每一步都和服务端逐字节相同', () => {
    const st = new TemplateState();
    steps.forEach((step, i) => {
      let html: string | null;
      if (step.plan && step.slots) {
        st.reset(step.plan, step.slots);
        html = renderPlan(step.plan, step.slots);
      } else {
        html = st.patch(step.parts!);
      }
      expect(html, `第 ${i + 1} 步「${step.说明}」`).toBe(step.html);
    });
  });

  it('补丁确实比整帧小得多（不然这套机制就白做了）', () => {
    const 首帧 = steps[0].html.length;
    for (const step of steps.slice(1)) {
      const 补丁 = JSON.stringify(step.parts).length;
      expect(补丁, `「${step.说明}」的补丁不该接近整帧`).toBeLessThan(首帧 / 2);
    }
  });
});
