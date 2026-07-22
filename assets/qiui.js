/*!
 * qiui.js — qi-web framework client widgets (no build step, no dependencies)
 *
 * Two framework-agnostic browser widgets, extracted from a production app:
 *
 *   1. Custom dropdown (.qdd) — replaces native <select>. The native popup
 *      detaches to the bottom of the screen on mobile; this one stays glued to
 *      the box. A hidden <input> carries the value so normal form submits /
 *      FormData collection keep working. All interaction is event-delegated on
 *      document, so it survives DOM morph / re-render without re-binding.
 *
 *   2. Markdown renderer — qiui.markdown(text) -> HTML string. Safe (escapes
 *      first, blocks javascript:/data: links), good for streaming token-by-token
 *      chat rendering.
 *
 * Usage:
 *   <link rel="stylesheet" href="/static/qiui.css">
 *   <script src="/static/qiui.js"></script>
 *
 * API:
 *   qiui.markdown(text)        -> HTML string
 *   qiui.initDropdowns(root)   -> (re)sync .qdd widgets inside root (optional)
 *   window.qiMarkdown(text)    -> alias of qiui.markdown (drop-in compatibility)
 */
(function (global) {
  "use strict";

  // ── Markdown renderer ────────────────────────────────────────────────
  // Escape-first, then apply block/inline rules. Links strip javascript:/data:.

  function qiEsc(x) {
    return String(x)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qiInline(x) {
    // Backtick delimiter for inline code, built via charCode so this file can
    // itself be embedded inside a backtick raw string without clashing.
    var BT = String.fromCharCode(96);
    x = x.replace(new RegExp(BT + "([^" + BT + "]+)" + BT, "g"), "<code>$1</code>");
    x = x.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    x = x.replace(/\*([^*]+)\*/g, "<i>$1</i>");
    x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, u) {
      if (/^\s*(javascript|data):/i.test(u)) return t;
      return '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>";
    });
    return x;
  }

  function qiSpan(x) {
    return qiInline(qiEsc(x));
  }

  function qiMarkdown(md) {
    var L = String(md).split("\n");
    var out = "";
    var i = 0;
    while (i < L.length) {
      var t = L[i].trim();
      if (t === "") {
        i++;
        continue;
      }
      if (t.indexOf("[调用工具") === 0) {
        var nm = t.replace(/^\[调用工具\s*/, "").replace(/[\s\]{].*$/, "");
        out += '<div class="qi-tool">🔧 正在调用 <b>' + qiEsc(nm || "工具") + "</b></div>";
        i++;
        continue;
      }
      var hm = /^(#{1,3})\s+(.*)$/.exec(t);
      if (hm) {
        var lv = hm[1].length;
        out += "<h" + lv + ">" + qiSpan(hm[2]) + "</h" + lv + ">";
        i++;
        continue;
      }
      if (t.charAt(0) === ">") {
        out += '<p class="muted">' + qiSpan(t.slice(1).trim()) + "</p>";
        i++;
        continue;
      }
      if (t.charAt(0) === "|") {
        var tb = "<table>";
        var first = true;
        while (i < L.length && L[i].trim().charAt(0) === "|") {
          var r = L[i].trim();
          if (r.replace(/[-:|\s]/g, "") === "") {
            i++;
            continue;
          }
          var cs = r.replace(/^\|/, "").replace(/\|$/, "").split("|");
          var tag = first ? "th" : "td";
          var tr = "<tr>";
          for (var k = 0; k < cs.length; k++) {
            tr += "<" + tag + ">" + qiSpan(cs[k].trim()) + "</" + tag + ">";
          }
          tb += tr + "</tr>";
          first = false;
          i++;
        }
        out += tb + "</table>";
        continue;
      }
      if (/^[-*]\s+/.test(t)) {
        var ul = "<ul>";
        while (i < L.length && /^[-*]\s+/.test(L[i].trim())) {
          ul += "<li>" + qiSpan(L[i].trim().replace(/^[-*]\s+/, "")) + "</li>";
          i++;
        }
        out += ul + "</ul>";
        continue;
      }
      if (/^\d+\.\s+/.test(t)) {
        var ol = "<ol>";
        while (i < L.length && /^\d+\.\s+/.test(L[i].trim())) {
          ol += "<li>" + qiSpan(L[i].trim().replace(/^\d+\.\s+/, "")) + "</li>";
          i++;
        }
        out += ol + "</ol>";
        continue;
      }
      out += "<p>" + qiSpan(t) + "</p>";
      i++;
    }
    return out;
  }

  // ── Custom dropdown (.qdd) ───────────────────────────────────────────
  // Bind once on document; works through DOM re-renders (event delegation).

  function closeAllOpen(root) {
    (root || document).querySelectorAll(".qdd.open").forEach(function (x) {
      x.classList.remove("open");
    });
  }

  function onDocClick(e) {
    var head = e.target.closest ? e.target.closest(".qdd-head") : null;
    var opt = e.target.closest ? e.target.closest(".qdd-opt") : null;
    if (head) {
      var dd = head.parentElement;
      var open = dd.classList.contains("open");
      closeAllOpen();
      if (!open) dd.classList.add("open");
      e.stopPropagation();
      return;
    }
    if (opt) {
      var d2 = opt.closest(".qdd");
      var hidden = d2.querySelector('input[type=hidden]');
      if (hidden) hidden.value = opt.getAttribute("data-v");
      var txt = d2.querySelector(".qdd-txt");
      if (txt) txt.textContent = opt.textContent;
      d2.querySelectorAll(".qdd-opt").forEach(function (o) {
        o.classList.remove("sel");
      });
      opt.classList.add("sel");
      d2.classList.remove("open");
      // Fire a change event on the hidden input for any listeners.
      if (hidden && typeof Event === "function") {
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
      e.stopPropagation();
      return;
    }
    closeAllOpen();
  }

  var bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", onDocClick);
  }

  // (Re)initialize .qdd widgets in a subtree: mark the option that matches the
  // hidden input value as selected, and sync the head label. Idempotent — safe
  // to call after injecting new markup. Interaction itself needs no per-node
  // binding (it is delegated), so this is a convenience sync only.
  function initDropdowns(root) {
    bindOnce();
    var scope = root || document;
    scope.querySelectorAll(".qdd").forEach(function (dd) {
      var hidden = dd.querySelector('input[type=hidden]');
      var val = hidden ? hidden.value : null;
      var opts = dd.querySelectorAll(".qdd-opt");
      opts.forEach(function (o) {
        var match = val != null && o.getAttribute("data-v") === val;
        o.classList.toggle("sel", match);
        if (match) {
          var txt = dd.querySelector(".qdd-txt");
          if (txt && txt.textContent.trim() === "") txt.textContent = o.textContent;
        }
      });
    });
  }

  function autoInit() {
    initDropdowns(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
  // Bind delegation immediately too, so clicks work even before DOMContentLoaded.
  bindOnce();

  // ── Public surface ───────────────────────────────────────────────────
  var qiui = {
    markdown: qiMarkdown,
    initDropdowns: initDropdowns
  };

  global.qiui = qiui;
  // Drop-in compatibility alias for existing global qiMarkdown() callers.
  if (typeof global.qiMarkdown === "undefined") {
    global.qiMarkdown = qiMarkdown;
  }
})(typeof window !== "undefined" ? window : this);
