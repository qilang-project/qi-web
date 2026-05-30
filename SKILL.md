---
name: qi-web
description: Build HTTP servers and web applications in the Qi (奇语) programming language using the qi-web framework — an Express/Fiber-style router with middleware, route groups, request/response helpers, sessions, static files, and a Rust-accelerated hot path (~122k RPS). Use when the user writes Qi web servers, REST APIs, or asks about routing, middleware, handlers, request parsing, or responses in Qi. Requires the qi-lang skill for base language syntax.
metadata:
  author: qilang
  version: "0.1"
---

# qi-web — Qi 语言 Web 框架

用 Qi（奇语）写的 HTTP 框架，风格参考 Express / Go Fiber。热路径用 Rust 加速，实测 ~122k RPS（比 Express 快 5.5×）。

> **先读 `qi-lang` 技能** 掌握基础语法（保留字地雷、FFI 约定等）。本技能只讲 qi-web 的 API。

## 何时使用

- 用户用 Qi 写 HTTP 服务器 / REST API / Web 应用
- 用户问 qi-web 的路由、中间件、请求解析、响应、会话、静态文件
- 用户提到 `导入 Web`、`创建应用`、`运行应用`

## 最小服务器

```qi
包 主程序;

导入 Web::{应用, 上下文, 响应, 创建应用, 配置, 获取, 文本, 运行应用};

函数 处理(上下文值: 上下文) : 响应 {
    返回 文本("ok");
}

函数 入口() {
    变量 应用值: 应用 = 创建应用();
    应用值 = 配置(应用值, "127.0.0.1", 6790);   // 主机, 端口（用随机高位端口！）
    应用值 = 获取(应用值, "/", 处理);
    运行应用(应用值);
}
```

**handler 签名固定**：`函数(上下文): 响应`。每个路由注册函数返回新的 `应用`，要回写：`应用值 = 获取(应用值, ...)`。

## 路由

| 函数 | HTTP 方法 |
|---|---|
| `获取(应用, 路径, 处理器)` | GET |
| `提交(应用, 路径, 处理器)` | POST |
| `整体更新(...)` | PUT |
| `部分更新(...)` | PATCH |
| `删除(...)` | DELETE |
| `头(...)` | HEAD |
| `请求选项(...)` | OPTIONS |
| `首页(应用, 处理器)` | GET `/` 快捷方式 |

路径参数用 `:名称`，如 `/用户/:id`。

### 路由组

```qi
变量 组 = 创建路由组("/api");
应用值 = 组获取(应用值, 组, "/用户", 列出用户);     // → GET /api/用户
应用值 = 组提交(应用值, 组, "/用户", 创建用户);     // → POST /api/用户
```

## 请求访问器（在 handler 里用）

```qi
变量 id: 字符串 = 路径参数(上下文值, "id");           // /用户/:id
变量 页: 整数 = 查询参数整数(上下文值, "page", 1);    // ?page=2
变量 q: 字符串 = 查询参数(上下文值, "q");
变量 头: 字符串 = 请求头(上下文值, "Authorization");
变量 主体: 字符串 = 请求主体(上下文值);
变量 方法: 字符串 = 请求方法(上下文值);
变量 路径: 字符串 = 请求路径(上下文值);
变量 字段: 字符串 = 表单字段(上下文值, "用户名");      // 表单解析
// 内容协商 / 代理
变量 是JSON: 整数 = 内容是(上下文值, "json");
变量 接受类型: 字符串 = 优先接受(上下文值, "json,html");
变量 真IP: 字符串 = 真实IP(上下文值);                  // 走 X-Forwarded-For
```

存在性检查：`存在路径参数` / `存在查询参数` / `存在请求头` / `存在表单字段`（返回 0/1）。

## 响应助手

```qi
返回 文本("纯文本");
返回 HTML("<h1>你好</h1>");
返回 JSON("{\"ok\":true}");
返回 重定向("/登录");
返回 发送文件("./public/index.html");           // 自动推断 MIME
返回 下载文件("./report.pdf", "报告.pdf");        // Content-Disposition: attachment
变量 响应值 = 设置响应头(文本("ok"), "X-Custom", "值");
```

## 中间件

```qi
应用值 = 使用日志(应用值);                  // 请求日志
应用值 = 使用跨域(应用值);                  // CORS
应用值 = 限制请求大小(应用值, 1048576);      // 最大请求体字节数
// 自定义中间件签名：函数(下一个: 函数(上下文): 响应, 上下文): 响应
应用值 = 使用中间件(应用值, 我的中间件);
```

## 会话 / Cookie（含签名）

`会话` 模块提供 Cookie 读写与 HMAC-SHA256 签名 Cookie：`设置签名Cookie` / `读签名Cookie`（防篡改）。

## 端口约定

⚠️ **示例和实际部署都用随机高位端口**（`3076` / `6759` / `43510`），不要用 8080 / 3000 / 8000。把主机/端口提取成变量，不要在多行重复硬编码。

## 运行

```bash
qi run 服务器.qi          # 编译并启动
# 压测
wrk -t4 -c100 -d10s http://127.0.0.1:6790/
```

## 已知边界

- handler 必须返回 `响应`，不能返回裸字符串
- 跨包导入用 destructure：`导入 Web::{创建应用, 获取, 文本, ...}`，逐个列出要用的符号
- 复杂泛型/多文件 struct 跨包访问有限制（见 qi-lang 技能）
