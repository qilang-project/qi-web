# qi-web 前端

TS/CSS 源码 → esbuild → `../assets/`（**产物签入仓库**）。

为什么产物要签入：用 qi-web 的人不该被迫装 node。只有要改前端的人才跑构建。

    npm i && npm run build     # 改完跑这个
    npm run typecheck          # 只做类型检查

## 源码

| 文件 | 产物 | 说明 |
| --- | --- | --- |
| `src/live.ts` 等 | `../assets/qiui-core.js` | LiveView 运行时：WS 连接与重连、声明式绑定、DOM morph、确认框 |
| `src/runtime.css` | 打包进上面那个 JS | 运行时自己造的 DOM 的样式（确认框、断线提示），由 `injectStyle()` 注入 |
| `src/qiui.css` | `../assets/qiui.css` | 应用样式表：设计令牌 + 基础元素 + 组件类 |

构建同时生成 `../前端资产.qi`，把 JS 和 CSS 各作为一个原始字符串常量嵌进
qi（`运行时脚本源()` / `样式源()`）—— 应用仍然是**单个二进制**部署
（家有小奇就是 scp 一个文件上线的），不用额外分发 .js/.css。

## 两条约束

- **产物里不能有反引号**：它要塞进 qi 的反引号原始字符串。esbuild 关掉了
  模板字面量（`supported: {'template-literal': false}`），构建脚本还会再查一遍。
- **不写中文**：HTML 属性名、JS 标识符、CSS 类名、上行协议键一律英文。
  中文只出现在 qi 源码和面向用户的文案里（确认框上的「确定/取消」这种）。

运行时配置从 `window.QI_LIVE` 读，由 qi 侧在页面里先发一小段 `<script>` 注入。
