# qiui — client widgets for qi-web

Two zero-dependency, no-build browser widgets that ship with the qi-web
framework as static assets. Drop them in a `<link>` / `<script>` tag and go.

- **`qiui.css`** — styles for both widgets (theme via CSS custom properties).
- **`qiui.js`** — plain browser JS (IIFE, exposes a global `qiui`).

## The widgets

### 1. Custom dropdown (`.qdd`)

A replacement for the native `<select>`. The native option popup detaches to the
bottom of the screen on mobile (and can't be repositioned with CSS); this one
opens glued right below the box. A hidden `<input>` carries the selected value,
so normal form submission / `FormData` collection keeps working. All clicks are
**event-delegated on `document`**, so the widget survives DOM morph / re-render
(e.g. live-reload) with no re-binding.

### 2. Markdown renderer (`qiui.markdown`)

`qiui.markdown(text)` returns an HTML string. It escapes first, then applies the
markdown rules, and blocks `javascript:` / `data:` link protocols. Fast enough to
re-render on every streamed token (chat bubbles).

Supported markdown:

- Headings `#`, `##`, `###`
- Bold `**x**`, italic `*x*`, inline code `` `x` ``
- Links `[text](url)` (opens in new tab; unsafe protocols rendered as plain text)
- Unordered lists (`- ` / `* `) and ordered lists (`1. `)
- Blockquotes (`> `) → `<p class="muted">`
- Pipe tables (`| a | b |`; the first row is the header, separator rows ignored)
- Tool-call lines `[调用工具 name {…}]` → a `.qi-tool` pill (JSON args hidden)
- Blank lines separate blocks; anything else becomes a `<p>`

## Including them

Serve this `assets/` directory as static files, then link the two files.

In your qi-web app:

```qi
app = 静态目录(app, "/static", "qi-web/assets");
```

In your HTML `<head>` / before `</body>`:

```html
<link rel="stylesheet" href="/static/qiui.css">
<script src="/static/qiui.js"></script>
```

## JS API

| Call | Returns | Notes |
| --- | --- | --- |
| `qiui.markdown(text)` | HTML string | Safe markdown → HTML. |
| `qiui.initDropdowns(root)` | `undefined` | (Re)sync `.qdd` widgets inside `root` (default `document`): marks the option matching the hidden input value as selected and fills the head label. Idempotent; safe to call after injecting new markup. Interaction itself is delegated, so you rarely need this. |
| `window.qiMarkdown(text)` | HTML string | Alias of `qiui.markdown` for drop-in compatibility. |

Dropdowns auto-initialize on `DOMContentLoaded`; the delegated click handler is
also bound immediately at script load.

## Dropdown HTML markup contract

Produce exactly this structure (the hidden `<input name="…">` is what carries the
submitted value):

```html
<div class="qdd">
  <div class="qdd-head">
    <span class="qdd-txt">Current label</span>
    <span class="qdd-ar">▾</span>
  </div>
  <input type="hidden" name="FIELD_NAME" value="CURRENT_VALUE">
  <div class="qdd-menu">
    <div class="qdd-opt" data-v="VALUE_1">Label 1</div>
    <div class="qdd-opt" data-v="VALUE_2">Label 2</div>
    <div class="qdd-opt" data-v="VALUE_3">Label 3</div>
  </div>
</div>
```

Contract details:

- Root `.qdd` — one dropdown.
- `.qdd-head` `>` `.qdd-txt` — the visible current label; `.qdd-ar` — the arrow.
- `input[type=hidden]` — **required**; its `name` is the form field, its `value`
  is updated on selection (a `change` event is dispatched on it).
- `.qdd-menu` `>` `.qdd-opt[data-v]` — one option each; `data-v` is the value that
  gets written to the hidden input, the element text is copied into `.qdd-txt`.
- The selected option gets a `.sel` class.

### Minimal copy-paste example

```html
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/static/qiui.css">

<form method="post" action="/save">
  <div class="qdd">
    <div class="qdd-head">
      <span class="qdd-txt">🍎 Apple</span>
      <span class="qdd-ar">▾</span>
    </div>
    <input type="hidden" name="fruit" value="apple">
    <div class="qdd-menu">
      <div class="qdd-opt sel" data-v="apple">🍎 Apple</div>
      <div class="qdd-opt" data-v="pear">🍐 Pear</div>
      <div class="qdd-opt" data-v="peach">🍑 Peach</div>
    </div>
  </div>
  <button type="submit">Save</button>
</form>

<script src="/static/qiui.js"></script>
```

Rendering markdown:

```html
<div class="md" id="out"></div>
<script>
  document.getElementById("out").innerHTML =
    qiui.markdown("# Hi\n\n- **bold** and `code`\n- [link](https://example.com)");
</script>
```

## Theming

Override the CSS custom properties (all have neutral fallbacks):

```css
:root {
  --qiui-accent: #ff6b4a;   /* highlight / active / links */
  --qiui-text:   #1e3a4c;   /* text + borders */
  --qiui-bg:     #ffffff;
  --qiui-hover:  #fff6e9;   /* option hover / selected bg */
  --qiui-divider:#f2ead9;   /* separators + table borders */
  --qiui-muted:  #6b7a86;
  --qiui-shadow: #1e3a4c;   /* hard menu drop-shadow */
  --qiui-radius: 10px;
}
```
