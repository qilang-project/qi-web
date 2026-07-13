---
name: qi-web
description: Build HTTP servers and web applications in the Qi (奇语) programming language using the qi-web framework — an Express/Fiber-style router with middleware, route groups, path params ({名} syntax), request/response helpers, redirects, file sending, static directories, chunked streaming, sessions/signed cookies, Bearer auth helpers, and a Rust-accelerated hot path (~122k RPS). Use when the user writes Qi web servers, REST APIs, or asks about routing, middleware, handlers, request parsing, responses, 发送文件, 静态目录, 会话, 认证, or 重定向 in Qi. Requires the qi-lang skill for base language syntax.
metadata:
  author: qilang
  version: "0.2"
---

# qi-web — Qi 语言 Web 框架

用 Qi（奇语）写的 HTTP 框架，风格参考 Express / Go Fiber。热路径用 Rust 加速，实测 ~122k RPS（比 Express 快 5.5×）。

> **先读 `qi-lang` 技能** 掌握基础语法（保留字地雷、`新建` 结构体字面量、FFI 约定等）。本技能只讲 qi-web 的 API。

## 何时使用

- 用户用 Qi 写 HTTP 服务器 / REST API / Web 应用
- 用户问 qi-web 的路由、中间件、请求解析、响应、会话、认证、静态文件
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

对外服务把主机配成 `0.0.0.0`：`运行应用` / `运行应用_异步` / `运行应用_TLS` 都尊重 `配置` 里的主机（同步版曾硬编码 127.0.0.1，已修）。⚠️ 例外：`运行应用_HTTP2` 仍硬编码 127.0.0.1，暂不能对外绑定。

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

**路径参数用花括号 `{名}`**（不是 `:名`！）：`/api/users/{id}`，handler 里 `路径参数(上下文值, "id")` 读取。

### 路由组

```qi
变量 组 = 创建路由组("/api");
应用值 = 组获取(应用值, 组, "/用户", 列出用户);      // → GET /api/用户
应用值 = 组获取(应用值, 组, "/{id}", 用户详情);      // → GET /api/{id}
应用值 = 组提交(应用值, 组, "/用户", 创建用户);      // → POST /api/用户
```

## 请求访问器（在 handler 里用）

```qi
变量 id: 字符串 = 路径参数(上下文值, "id");           // /users/{id}
变量 编号: 整数 = 路径参数整数(上下文值, "id", 0);     // 带默认值
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
返回 重定向("/登录");                            // 302 + Location
返回 发送文件("./public/index.html");           // 按扩展名自动 MIME（28 种）
返回 下载文件("./report.pdf", "报告.pdf");        // Content-Disposition: attachment
变量 响应值 = 设置响应头(文本("ok"), "X-Custom", "值");
```

⚠️ **二进制文件发不出**：`发送文件`/`下载文件`/静态中间件都把文件读进 UTF-8 `字符串` 再经字符串管道拼响应——图片/字体/PDF/zip 会被破坏。只用它们发**文本资产**（html/css/js/json/svg）。二进制的出路：① base64 内联进 HTML/JSON（data URI）；② 交给外部静态服务/CDN；③ 用字节精确的流式接口 `流发送块`（见下）。

## 静态目录

```qi
应用值 = 静态目录(应用值, "/static", "./public");   // (应用, URL前缀, 目录)
```

注册静态文件中间件；同样受上述 UTF-8 限制，只适合文本资产。

## chunked 流式（双向支持）

- **请求侧**：自动识别 `Transfer-Encoding: chunked` 并去分块（如 Caddy h2→h1 转发场景），业务无感。
- **响应侧**（字节精确，可发二进制）：`流开始(客户端句柄, 状态码, 状态文本, 内容类型)` → 多次 `流发送块(句柄, 字节句柄)` / `流发送文本块(句柄, 文本)` → 发 0 块结束。见 `examples/流式响应.qi`。

## 中间件

```qi
应用值 = 使用日志(应用值);                  // 请求日志
应用值 = 使用跨域(应用值);                  // CORS
应用值 = 限制请求大小(应用值, 1048576);      // 最大请求体字节数
// 自定义中间件签名：函数(下一个: 函数(上下文): 响应, 上下文): 响应
应用值 = 使用中间件(应用值, 我的中间件);
```

## 会话 / Cookie / 认证

`会话` 模块：
- Cookie：`Cookie(上下文, 名)` 读、`设置Cookie(响应, 名, 值)`、`设置Cookie完整(...)`（path/max_age/secure/http_only/same_site）、`删除Cookie`
- **签名 Cookie**（HMAC-SHA256 防篡改）：`设置签名Cookie(响应, 名, 值, 密钥)` / `读签名Cookie(上下文, 名, 密钥)`（校验失败返回 ""）
- 服务端会话存储：`新会话ID()`（UUID）、`设置会话`/`会话标识`/`会话取值`/`会话设值`/`销毁会话`——**内存哈希表实现**，重启即失、多进程不共享

`认证` 模块（只做解析与守卫，不含存储）：
- `Bearer令牌(上下文)` 取 Authorization Bearer；`API密钥(上下文)` 取 X-API-Key；`认证标识(上下文)` 依次试 Bearer→API key→会话 Cookie
- `需要认证(下一步, 上下文)` 守卫中间件；`未授权(消息)` 401 / `禁止访问(消息)` 403

**生产级会话先例**（Bearer + SQLite，参考 aione 用户系统 `aione-spike/用户系统.qi`）：token 用 `Bearer令牌` 解析，会话存 `标准库.数据库`（SQLite）表（token/用户id/角色/过期），按过期时间清理、禁用用户即时失效，密码 `加密.SHA256哈希(盐 + 密码)`。别依赖内置内存会话存储做生产。

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
- **路由 path 不要含中文**（会 panic），用 ASCII 路径
- 跨包导入用 destructure：`导入 Web::{创建应用, 获取, 文本, ...}`，逐个列出要用的符号
- 结构体字面量一律 `新建 类型{...}`（括号包裹写法已从语言删除，见 qi-lang 技能）
- 二进制静态资产发不出（UTF-8 字符串管道），见上文「响应助手」
