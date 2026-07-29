# qi-web static assets

Three files. All of them are **build products checked into the repo** — you don't
need node to use qi-web, only to change them.

| File | Source | What it is |
| --- | --- | --- |
| `qiui-core.js` | `qi-web/前端/src/*.ts` | LiveView client runtime: WS connect/reconnect, declarative bindings, DOM morph, confirm modal |
| `qiui.css` | `qi-web/前端/src/qiui.css` | App stylesheet: design tokens + base elements + component classes |
| `qiui.js` | hand-written, no build | Optional standalone widgets: `.qdd` dropdown + `qiui.markdown()` |

Rebuild the first two with:

```bash
cd qi-web/前端 && npm install && npm run build
```

That also regenerates `qi-web/前端资产.qi`, which embeds both as qi string
constants so an app still deploys as a single binary.

## Using them from qi

The usual way — inline, no extra requests, single-binary deploy stays intact:

```qi
导入 Web::{样式标签, 主题, 实时运行时构建};

h = h + 样式标签();                        // <style>…qiui.css…</style>
h = h + 主题("--qi-accent:#10b981");       // 只覆盖要改的令牌
…
页 = 页 + 实时运行时构建("/ws", 订阅载荷, 30000);   // 运行时 JS
```

The cacheable way — serve this directory and link the files (better for
multi-page apps, where the same 8 KB would otherwise be inlined on every page):

```qi
app = 静态目录(app, "/static", "qi-web/assets");
```

```html
<link rel="stylesheet" href="/static/qiui.css">
<script src="/static/qiui-core.js"></script>
```

## qiui.css

Three layers, take what you need:

1. **Design tokens** — the `--qi-*` custom properties on `:root`. Retheme by
   overriding these and nothing else.
2. **Base elements** — `body`, `h1`–`h3`, `input`, `textarea`, `button`, `a` are
   styled directly, so templates can use bare tags.
3. **Component classes** —

   | Class | Use |
   | --- | --- |
   | `.qi-bar` | top bar (identity left, actions right) |
   | `.qi-card` | page-width centered card |
   | `.qi-panel` | same look, no width/centering — for grid cells and sidebars |
   | `.qi-row` / `.qi-stack` / `.qi-between` | flex layouts; `.qi-row > input` grows |
   | `.qi-grid` (`.cols-3`, `.cols-4`) | responsive grid, collapses to one column under 760px |
   | `.qi-muted` / `.qi-faint` | secondary / tertiary text |
   | `.qi-badge` (`.plain`, `.solid`, `.ok`) | pill label |
   | `.qi-num` | tabular figures, so changing numbers don't shift layout |
   | `.qi-track` + `.qi-fill` | progress bar |
   | `.qi-empty` | empty-list placeholder |
   | `.qi-item` | one row inside a card |
   | `.qi-drag` / `.qi-drop` (`.over`) | drag-and-drop board pieces |
   | `.qi-pre` (`.box`) | preserved line breaks / debug output |

   Button variants: `.ghost` `.quiet` `.danger` `.icon` `.block`.

The runtime's own classes (`#qi-modal`, `.qi-denied`, `.qi-loading`,
`.qi-offline`) are styled from inside `qiui-core.js`, so the confirm modal and
the offline banner look right even if you never include `qiui.css`. They read the
same `--qi-*` tokens, so they follow your theme when you do.

### Theming

```qi
h = h + 主题("--qi-accent:#10b981;--qi-accent-hover:#059669;"
    + "--qi-accent-soft:#ecfdf5;--qi-accent-ink:#059669;--qi-width:720px");
```

Full token list is at the top of `qi-web/前端/src/qiui.css`.

### Using Tailwind instead

Nothing here blocks it — every custom property and class name is `qi-`-prefixed.
Tailwind isn't the framework default because it needs a per-app content-scanning
build, which would put a node toolchain in front of every qi-web app. If you want
it, add it in your own app and either drop `样式标签()` or keep it for the base
element styles.

## qiui.js (optional, standalone)

Not part of the LiveView runtime — include it only if you want these two:

### Custom dropdown (`.qdd`)

Replaces the native `<select>`, whose option popup detaches to the bottom of the
screen on mobile and can't be repositioned with CSS. This one opens glued below
the box. A hidden `<input>` carries the value, so normal form submission and
`FormData` keep working. Clicks are delegated on `document`, so it survives DOM
morph with no re-binding.

```html
<div class="qdd">
  <div class="qdd-head">
    <span class="qdd-txt">Current label</span>
    <span class="qdd-ar">▾</span>
  </div>
  <input type="hidden" name="FIELD_NAME" value="CURRENT_VALUE">
  <div class="qdd-menu">
    <div class="qdd-opt sel" data-v="VALUE_1">Label 1</div>
    <div class="qdd-opt" data-v="VALUE_2">Label 2</div>
  </div>
</div>
```

- `input[type=hidden]` is **required**; its `value` is updated on selection and a
  `change` event is dispatched on it.
- `data-v` on each `.qdd-opt` is the value written to the hidden input; the
  element's text is copied into `.qdd-txt`. The chosen one gets `.sel`.

### Markdown renderer

`qiui.markdown(text)` returns an HTML string — escapes first, then applies the
rules, and blocks `javascript:` / `data:` link protocols. Fast enough to re-render
on every streamed token. Wrap the output in `class="md"` for styling.

Supported: headings `#`–`###`; `**bold**`, `*italic*`, `` `code` ``; links
`[text](url)`; `- `/`* ` and `1. ` lists; `> ` blockquotes → `.qi-muted`; pipe tables;
tool-call lines `[调用工具 name {…}]` → a `.qi-tool` pill; blank lines separate
blocks, everything else becomes a `<p>`.

| Call | Returns |
| --- | --- |
| `qiui.markdown(text)` | HTML string |
| `qiui.initDropdowns(root)` | `undefined` — resync `.qdd` widgets after injecting markup (rarely needed; interaction is delegated) |
| `window.qiMarkdown(text)` | alias of `qiui.markdown` |
