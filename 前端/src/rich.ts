/**
 * 富渲染 —— window.qiRich(元素, 缓冲, 动作端点)。
 *
 * AI 的流式输出边流边渲染成结构化 UI，而不是等全部到齐再显示：
 *   · 渐进 markdown：半截语法（未闭合 ** / ` / ```）先补齐再渲染，不闪
 *   · 图元块：闭合前显示骨架，闭合后整块渲染
 *       ```table {"head":[…],"rows":[[…]]}   ```list {"items":[…]}
 *       ```kv    {"pairs":{"k":"v"}}
 *   · 应用卡片：```card:<类型> {title, fields, actions:[{label, action, params}]}
 *       按钮是声明式的 —— 点了由前端 POST 到动作端点，真实操作在服务端做，
 *       模型只负责填数据，不能自称已经执行。
 *
 * 注意：本文件不能出现字面反引号 —— 打包产物要整个塞进 qi 的反引号原始字符串。
 * 需要反引号的地方（行内代码、围栏）用 BT 拼。
 */
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;

type Json = Record<string, unknown> | null;

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 流到一半的 markdown：把未闭合的成对标记补上，避免渲染抖动 */
function repair(b: string): string {
  let o = b;
  const fences = (o.match(new RegExp('^' + FENCE, 'gm')) || []).length;
  if (fences % 2 === 1) {
    if (!o.endsWith('\n')) o += '\n';
    return o + FENCE;
  }
  if ((o.match(new RegExp(BT, 'g')) || []).length % 2 === 1) o += BT;
  if ((o.match(/\*\*/g) || []).length % 2 === 1) o += '**';
  if ((o.match(/~~/g) || []).length % 2 === 1) o += '~~';
  return o;
}

function inl(t: string): string {
  let x = esc(t);
  x = x.replace(new RegExp(BT + '([^' + BT + ']+)' + BT, 'g'), '<code>$1</code>');
  x = x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  x = x.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  x = x.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // 只放行 http(s)，挡掉 javascript: / data:
  x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return x;
}

function md(src: string): string {
  let out = '';
  let inUl = false;
  let inOl = false;
  const close = () => {
    if (inUl) { out += '</ul>'; inUl = false; }
    if (inOl) { out += '</ol>'; inOl = false; }
  };
  const lines = src.split('\n');
  for (const ln of lines) {
    const hm = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hm) { close(); out += '<h' + hm[1].length + '>' + inl(hm[2]) + '</h' + hm[1].length + '>'; continue; }
    const um = ln.match(/^\s*[-*]\s+(.*)$/);
    if (um) { if (!inUl) { close(); out += '<ul>'; inUl = true; } out += '<li>' + inl(um[1]) + '</li>'; continue; }
    const om = ln.match(/^\s*\d+\.\s+(.*)$/);
    if (om) { if (!inOl) { close(); out += '<ol>'; inOl = true; } out += '<li>' + inl(om[1]) + '</li>'; continue; }
    const qm = ln.match(/^>\s?(.*)$/);
    if (qm) { close(); out += '<blockquote>' + inl(qm[1]) + '</blockquote>'; continue; }
    close();
    if (ln.trim() !== '') out += '<p>' + inl(ln) + '</p>';
  }
  close();
  return out;
}

interface Seg { md?: string; lang?: string; body?: string; closed?: boolean }

function segs(b: string): Seg[] {
  const res: Seg[] = [];
  const re = new RegExp(FENCE + '([^\\n' + BT + ']*)\\n([\\s\\S]*?)(' + FENCE + '|$)', 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) {
    if (m.index > last) res.push({ md: b.slice(last, m.index) });
    res.push({ lang: (m[1] || '').trim(), body: m[2], closed: m[3] === FENCE });
    last = re.lastIndex;
  }
  if (last < b.length) res.push({ md: b.slice(last) });
  return res;
}

function pj(s: string): Json {
  try { return JSON.parse(s); } catch { return null; }
}

function skel(t: string): string {
  return '<div class="rqc-skel">' + esc(t) + ' …</div>';
}

function rows(d: Json): string {
  const head = d && (d.head as unknown[] | undefined);
  const body = (d && (d.rows as unknown[][] | undefined)) || [];
  let h = '<table class="rqc-tbl">';
  if (head) {
    h += '<tr>';
    head.forEach((x) => { h += '<th>' + esc(x) + '</th>'; });
    h += '</tr>';
  }
  body.forEach((r) => {
    h += '<tr>';
    (r || []).forEach((c) => { h += '<td>' + esc(c) + '</td>'; });
    h += '</tr>';
  });
  return h + '</table>';
}

function pairs(obj: Record<string, unknown>): string {
  let h = '<div class="rqc-kv">';
  Object.keys(obj).forEach((k) => {
    h += '<div class="rqc-kvr"><span class="rqc-kvk">' + esc(k) + '</span><span>'
      + esc(obj[k]) + '</span></div>';
  });
  return h + '</div>';
}

function card(type: string, d: Json): string {
  if (!d) return skel('卡片');
  let h = '<div class="rqc-card">';
  if (d.title) h += '<div class="rqc-ct">' + esc(d.title) + '</div>';
  if (d.fields) h += pairs(d.fields as Record<string, unknown>);
  const acts = d.actions as Array<Record<string, unknown>> | undefined;
  if (acts) {
    h += '<div class="rqc-acts">';
    acts.forEach((a) => {
      h += '<button class="rqc-abtn" data-type="' + esc(type)
        + '" data-act="' + esc(a.action)
        + '" data-params="' + esc(JSON.stringify(a.params || {}))
        + '">' + esc(a.label) + '</button>';
    });
    h += '</div>';
  }
  return h + '</div>';
}

function renderBlock(lang: string, body: string, closed: boolean): string {
  if (lang.indexOf('card') === 0) {
    return closed ? card(lang.split(':')[1] || '', pj(body)) : skel('卡片');
  }
  if (lang === 'table') {
    const d = closed ? pj(body) : null;
    return d && d.rows ? rows(d) : skel('表格');
  }
  if (lang === 'list') {
    const d = closed ? pj(body) : null;
    const items = d && (d.items as unknown[] | undefined);
    if (!items) return skel('列表');
    let h = '<ul class="rqc-list">';
    items.forEach((x) => { h += '<li>' + inl(String(x)) + '</li>'; });
    return h + '</ul>';
  }
  if (lang === 'kv') {
    const d = closed ? pj(body) : null;
    return d && d.pairs ? pairs(d.pairs as Record<string, unknown>) : skel('键值');
  }
  return '<pre class="rqc-pre"><code>' + esc(body) + '</code></pre>';
}

/** 卡片按钮：点一下 POST 到动作端点，服务端回什么就显示什么 */
function bindActs(root: HTMLElement, act: string): void {
  if (!act) return;
  const btns = root.querySelectorAll('.rqc-abtn');
  for (let i = 0; i < btns.length; i++) {
    const btn = btns[i] as HTMLButtonElement & { __bound?: boolean };
    if (btn.__bound) continue;
    btn.__bound = true;
    btn.addEventListener('click', () => {
      const old = btn.textContent || '';
      btn.disabled = true;
      btn.textContent = '处理中…';
      fetch(act, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: btn.getAttribute('data-type'),
          action: btn.getAttribute('data-act'),
          params: pj(btn.getAttribute('data-params') || '{}') || {},
        }),
      })
        .then((r) => r.text())
        .then((txt) => {
          const res = document.createElement('div');
          res.className = 'rqc-actres';
          res.textContent = txt;
          if (btn.parentNode) btn.parentNode.appendChild(res);
          btn.textContent = '✓ 已处理';
        })
        .catch(() => { btn.disabled = false; btn.textContent = old; });
    });
  }
}

/**
 * 容错：模型经常忘了写围栏，直接吐「card:xx / table / list / kv」+ 一行 JSON。
 * 这里把裸块补成围栏块，渲染器照样认得出来。
 */
function normFence(t: string): string {
  const re = new RegExp('(^|\\n)(card:[^\\n' + BT + ']+|table|list|kv)[ \\t]*\\n(\\{[^\\n]*\\})', 'g');
  return t.replace(re, '$1' + FENCE + '$2\n$3\n' + FENCE);
}

export function qiRich(el: HTMLElement, buf: string, act?: string): void {
  let html = '';
  for (const seg of segs(repair(normFence(buf)))) {
    if (seg.md !== undefined) html += md(seg.md);
    else html += renderBlock(seg.lang || '', seg.body || '', !!seg.closed);
  }
  el.innerHTML = html;
  bindActs(el, act || '');
}
