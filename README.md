# Qi Web

Qi Web 是一个用 **奇语（Qi）**编写的 Web 框架。性能上实测 **~122k RPS**（比 Express 快 5.5×，比 Node.js 快 ~25%），热路径用 Rust 加速。方向很明确：

- **核心像 Axum / Gin**
- **使用体验尽量像 FastAPI / Express**
- **控制器只是上层扩展，不是内核**

> 📘 AI 辅助：本项目带 [`SKILL.md`](SKILL.md)，可作为 agent skill 安装，让 AI 助手准确生成 qi-web 代码。

现在公开的重心就是这几个词：

- `路由`
- `handler`
- `request / response`
- `middleware`
- `session`
- `auth`

## 当前核心

现在稳定的核心接口集中在 `Web` 根包，实际实现已经拆到：

- `请求.qi`
- `上下文.qi`
- `配置.qi`
- `响应.qi`
- `路由.qi`
- `匹配器.qi`
- `服务器.qi`
- `中间件.qi`
- `静态文件.qi`
- `会话.qi`
- `认证.qi`
- `控制器.qi`
- `事件流.qi`（SSE 服务器推送）
- `实时页面.qi`（LiveView 式实时 UI）
- `RPC.qi`（Connect 协议 JSON 一元调用）

公开 API 主要是：

- `创建应用()`
- `配置(应用值, 主机, 端口)`
- `使用中间件(应用值, 中间件函数)`
- `使用日志(应用值)`
- `使用跨域(应用值)`
- `获取 / 提交 / 整体更新 / 部分更新 / 删除`
- `头 / 请求选项`
- `创建路由组(prefix)`
- `组获取 / 组提交 / 组整体更新 / 组部分更新 / 组删除`
- `组头 / 组请求选项`
- `解析请求(raw)`
- `创建请求带头部(...)`
- `匹配上下文(应用值, 请求值)`
- `处理请求(应用值, 请求值)`
- `处理原始请求(应用值, 原始数据)`
- `运行应用(应用值)`
- `路径参数(上下文值, 名称)`
- `查询参数(上下文值, 名称)`
- `请求头(上下文值, 名称)`
- `路径参数整数(上下文值, 名称, 默认值)`
- `查询参数整数(上下文值, 名称, 默认值)`
- `参数 / 参数存在 / 参数整数`
- `查询值 / 查询存在 / 查询整数`
- `头值 / 头存在`
- `原始查询 / 原始头部 / 原始主体`
- `是JSON请求 / 是表单请求`
- `请求对象(上下文值)`
- `请求标识 / 已耗时毫秒 / 剩余超时毫秒`
- `设置本地值 / 本地值 / 设置本地整数 / 本地整数`
- `表单字段(上下文值, 名称)`
- `表单整数(上下文值, 名称, 默认值)`
- `解析JSON主体(上下文值)`
- `JSON字符串字段 / JSON整数字段 / JSON布尔字段`
- `请求主体(上下文值)`
- `返回文本 / 返回HTML / 返回JSON / 返回重定向 / 返回未找到`
- `执行处理器(处理器, 上下文值)`
- `文本 / HTML / JSON / 重定向 / 未找到`
- `设置响应头(响应值, 名称, 值)`
- `输出响应(应用值, 响应值)`

核心类型：

- `应用`
- `请求`
- `响应`
- `上下文`

## 示例

示例通过 `examples/qi_packages/Web -> ../..` 符号链接就地解析 `导入 Web`
（编译器会向上找 `qi_packages`）。该链接不入 git（Windows 检出会坏），克隆后跑示例前先建：

```bash
mkdir -p examples/qi_packages && ln -s ../.. examples/qi_packages/Web
```

IDE 里看到 qi_packages/Web 下"套娃"出整个仓库，是符号链接的正常渲染，不是文件重复。

建议按这个顺序看：

- `examples/核心API.qi`
  - 最短路径认识新核心
- `examples/自定义中间件.qi`
  - 看 `middleware(next, ctx)` 的写法
- `examples/配置与中间件.qi`
  - 看 `Ctx + config + middleware + static`
- `examples/恢复中间件.qi`
  - 看显式 `抛出` 如何被 recover 转成 500
- `examples/路由分组.qi`
  - 看分组和显式路由注册
  - 看参数提取
- `examples/一等处理器.qi`
  - 看 handler 作为函数值使用
- `examples/完整服务器.qi`
  - 直接运行完整服务器
- `examples/会话与认证.qi`
  - 看 cookie / session / bearer / auth middleware
- `examples/控制器扩展.qi`
  - 控制器只作为上层扩展

## 快速开始

运行核心 API 示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/核心API.qi
```

运行路由分组示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/路由分组.qi
```

运行一等处理器示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/一等处理器.qi
```

运行自定义中间件示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/自定义中间件.qi
```

运行配置 / 中间件示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/配置与中间件.qi
```

运行 recover 示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/恢复中间件.qi
```

运行完整服务器示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/完整服务器.qi
```

运行会话 / 认证示例：

```bash
cd /path/to/qilang
cargo run -p qi-compiler -- run qi-web/examples/会话与认证.qi
```

默认监听：

```text
http://127.0.0.1:3076
```

## 推荐写法

```qi
包 主程序;

导入 Web::{应用, 请求, 响应, 上下文};
导入 Web::{创建应用, 获取, 提交, 创建请求, 处理请求};
导入 Web::{路径参数, 文本, JSON, 输出响应};

函数 首页处理(上下文值: 上下文) : 响应 {
    返回 文本("你好，Qi Web");
}

函数 用户详情处理(上下文值: 上下文) : 响应 {
    变量 用户标识: 字符串 = 路径参数(上下文值, "id");
    返回 JSON("{\"id\":\"" + 用户标识 + "\"}");
}

函数 入口() {
    变量 应用值: 应用 = 创建应用();
    应用值 = 获取(应用值, "/", 首页处理);
    应用值 = 获取(应用值, "/users/{id}", 用户详情处理);

    变量 请求值: 请求 = 创建请求("GET", "/users/7", "", "");
    变量 响应值: 响应 = 处理请求(应用值, 请求值);
    打印行(输出响应(应用值, 响应值));
}
```

## 中间件

现在推荐把中间件写成这一种形状：

```qi
函数 请求标记中间件(下一步: 函数(上下文): 响应, 上下文值: 上下文) : 响应 {
    变量 响应值: 响应 = 下一步(上下文值);
    返回 设置响应头(响应值, "X-Request-Id", "qi-45");
}
```

注册方式：

```qi
变量 应用值: 应用 = 创建应用();
应用值 = 使用中间件(应用值, 请求标记中间件);
```

这里的 `下一步` 就是“继续往后走”的处理器。  
你可以在它前后做日志、鉴权、限流、补响应头，也可以直接提前返回响应。

现在已经内置了一组更接近 Fiber 习惯的中间件入口：

- `使用恢复(应用值)`
- `使用请求标识(应用值)`
- `使用响应时间(应用值)`
- `使用安全头(应用值)`
- `使用超时(应用值, 毫秒数)`
- `使用限流(应用值, 最大次数, 窗口毫秒)`
- `使用密钥认证(应用值, 头名, 密钥值)`
- `使用基础认证(应用值, 凭证文本)`
- `使用静态资源(应用值, 前缀, 目录)`
- `使用开发中间件(应用值)`
- `使用生产中间件(应用值)`

### 跨域 / 缓存 / 压缩

完整的 CORS / Cache-Control / gzip 三件套：

- `使用跨域开放(应用值)` — `*` 通配，常用 method/header 默认 600s 预检缓存
- `使用跨域配置(应用值, 允许来源, 允许方法, 允许头, 允许凭证, 最大缓存秒)`
  - 允许来源支持 `"*"`、单一来源、`","` 分隔的白名单
  - 自动处理 OPTIONS preflight，响应附 `Access-Control-Allow-*` + `Vary: Origin`
- `使用跨域暴露头(应用值, 暴露头)` — 设置 `Access-Control-Expose-Headers`
- `使用缓存(应用值, 指令文本)` — 例如 `"public, max-age=60"`，默认只对 GET/HEAD 生效
- `使用静态缓存(应用值, 秒数)` — `public, max-age=N` 的简写
- `使用不缓存(应用值)` — `no-store, no-cache, must-revalidate`，覆盖所有方法
- `使用压缩(应用值)` — gzip body，默认阈值 1024 字节
- `使用压缩配置(应用值, 最小字节)` — 自定义压缩阈值

注意：

- 压缩中间件应该 **最先注册**（最外层），让它能拿到经过其他中间件后的最终响应再 gzip
- 压缩只对 `text/*`、`application/json`、`application/xml`、`application/javascript`、`image/svg+xml` 等可压缩类型生效
- 压缩绕过常规序列化，直接把 headers + 压缩字节写到 socket，业务侧的 `响应.主体` 是 UTF-8 字符串这个限制不影响它

完整示例：`examples/CORS_压缩_缓存.qi`

`使用开发中间件` 现在默认会串上：

- `恢复`
- `请求标识`
- `响应时间`
- `跨域`

如果你要日志，单独追加 `使用日志(应用值)` 更稳。

`恢复中间件` 现在已经能拦住 **显式 `抛出`**，并把它转成 `500 Internal Server Error`。  
这条链是：

- `抛出 "boom"`
- 运行时安全调用边界
- `恢复中间件`
- `500` JSON 响应

当前还没有做到“拦住所有底层崩溃或非法内存访问”，但 Qi Web 这条应用层 recover 已经不是空壳了。

静态资源现在已经可以和开发中间件稳定叠加，前后顺序都能工作。

## Ctx

现在 `Ctx` 不只是参数提取器，也可以直接作为 handler 里的主工作台：

```qi
函数 状态处理(上下文值: 上下文) : 响应 {
    变量 请求标识文本: 字符串 = 请求标识(上下文值);
    变量 剩余超时: 整数 = 剩余超时毫秒(上下文值);
    变量 本地请求标识: 字符串 = 本地值(上下文值, "request_id");
    返回 返回JSON(
        上下文值,
        "{\"requestId\":\"" + 请求标识文本 + "\",\"local\":\"" + 本地请求标识 +
        "\",\"remaining\":" + 整数转字符串(剩余超时) + "}"
    );
}
```

常用入口：

- 请求读取：`参数 / 查询值 / 头值 / 原始主体 / 请求对象`
- 类型化提取：`参数整数 / 查询整数 / 表单整数`
- 状态信息：`请求标识 / 已耗时毫秒 / 剩余超时毫秒`
- 本地存储：`设置本地值 / 本地值 / 设置本地整数 / 本地整数`
- 直接返回：`返回文本 / 返回HTML / 返回JSON / 返回重定向 / 返回未找到`

## Session / Auth

这两块现在已经是独立模块：

- `Web.会话`
  - `Cookie(ctx, 名称)`
  - `会话标识(ctx)`
  - `设置Cookie(resp, 名称, 值)`
  - `设置会话(resp, 会话ID)`
  - `清除会话(resp)`
- `Web.认证`
  - `Bearer令牌(ctx)`
  - `API密钥(ctx)`
  - `认证标识(ctx)`
  - `未授权(消息)`
  - `禁止访问(消息)`
  - `需要认证(next, ctx)`

## 事件流（SSE）

`事件流.qi` 在 chunked 流式机制之上提供 Server-Sent Events。适合 LLM token
渐显、进度推送、日志尾随等单向推送场景（浏览器端用原生 `EventSource`）。

```qi
函数 推送处理(上下文值: 上下文) : 响应 {
    SSE开始(上下文值);                        // 写 text/event-stream 响应头
    SSE发送(上下文值, "message", "第一条");    // event: message\ndata: 第一条\n\n
    SSE发送数据(上下文值, "无事件名，走默认 message");
    SSE发送(上下文值, "done", "[完成]");       // 结束事件，前端收到后 es.close()
    SSE结束(上下文值);                        // chunked 终止块
    返回 SSE完成响应();                       // 状态码 0 = 已自行写完
}
```

- 数据里的换行自动按规范拆成多条 `data:` 行，接收端会拼回。
- 依赖 `ctx.客户端句柄`，**必须用同步 `运行应用`**（`运行应用_异步` 不支持流式）。
- 连接在 `SSE结束` 后关闭；`EventSource` 默认会自动重连重放，一次性流务必发
  结束事件让前端主动 `close()`。
- LLM 流式聊天完整示例见 `examples/llm_聊天_SSE.qi`（有 QI_LLM_KEY 走
  qi-harness `流式问` 真 token 流，无 key 降级为固定回复逐字推送）。

## 实时页面（LiveView 式）

`实时页面.qi` 提供 Phoenix LiveView 式的服务端驱动 UI：状态在服务端，事件经
WebSocket 上行，服务端重渲染后 **DOM morph 局部 patch** 下行——客户端把新旧
DOM 树逐节点对齐，只改有差异的属性/文本/节点，焦点、光标、滚动、CSS 过渡天然
保住。页面上不用写一行业务 JS。

```qi
函数 初始状态() : 整数 {                       // 每连接一份状态（J 对象句柄）
    变量 状态: 整数 = J.创建对象();
    J.设置整数(状态, "计数", 0);
    返回 状态;
}
函数 渲染(状态: 整数) : 字符串 {               // 状态 → HTML 片段
    返回 "<h2>计数: " + 整数转字符串(J.获取整数(状态, "计数")) + "</h2>"
        + "<button data-点击=\"加一\">+1</button>"
        + "<button data-点击=\"加步\" data-值-步长=\"5\">+5</button>";
}
函数 处理事件(状态: 整数, 事件名: 字符串, 载荷JSON: 字符串) : 整数 {
    如果 (字符串::等于(事件名, "加一") == 1) {
        J.设置整数(状态, "计数", J.获取整数(状态, "计数") + 1);
        // 服务端指令：渲染帧之后自动下发（对标 push_event / push_navigate）
        实时指令(状态, 指令_标题("计数变了"));
    }
    返回 状态;
}

应用值 = 实时路由(应用值, "/", 初始状态, 渲染, 处理事件);
运行应用(应用值);   // 依赖 WS 升级，必须用同步 运行应用
```

声明式绑定（对标 Phoenix 绑定，事件委托，morph 后无需重绑）：

| 属性 | 触发 | 载荷 | 对标 |
| --- | --- | --- | --- |
| `data-点击="事件"` | click | `data-值-*` | `phx-click` |
| `data-输入="事件"` + `data-防抖="300"` | input（可防抖） | `{value}` + `data-值-*` | `phx-change` + `phx-debounce` |
| `data-按键="事件"` + `data-按键筛选="Enter"` + `data-按键清空` | keyup（可过滤键 / 触发后清空输入框） | `{key,value}` + `data-值-*` | `phx-keyup` |
| `data-提交="事件"` | 表单 submit | 字段名值对 + `data-值-*` | `phx-submit` |
| `data-值-xxx="v"` | —— 事件参数并入载荷 | | `phx-value-*` |
| `data-键="k"` | —— morph 列表对齐键 | | keyed comprehension |
| `data-静止` | —— morph 跳过该子树 | | `phx-update="ignore"` |

服务端指令（事件处理里 `实时指令(状态, 指令_*)`，渲染帧后自动下发）：
`指令_跳转(url)`、`指令_标题(文本)`、`指令_滚动(选择器)`、
`指令_事件(名称, 载荷JSON)`（window 上派发 `CustomEvent "qi:名称"`，页面 JS 可监听）。

- 内嵌 JS 运行时自动连 `路径 + "/ws"`；断线指数退避重连（0.5s 起 8s 封顶），
  重连后自动恢复服务端状态；断线期间 `<body>` 带 class `qi-断线`（并派发
  `qi:断线`/`qi:连接` 事件）；触发事件的元素等待回帧期间带 class `qi-加载中`。
- 渲染用户输入前先过 `转义HTML(文本)` 防注入。
- 完整示例见 `examples/实时_计数器.qi`（计数 + 防抖回显 + keyed 待办 + 标题指令）。

### 实时广播（PubSub / 跨连接共享）

`实时广播.qi` 让同一 topic 的所有连接共享状态并互相广播（`共享WS路由`）。
v2 新增**广播频道句柄**（对标 `Phoenix.PubSub.broadcast`）——服务端任意位置
（定时任务、LLM 回调、HTTP handler）都能主动推：

```qi
变量 频道: 整数 = 创建广播频道();
应用值 = 共享WS路由带频道(应用值, "/board/ws", 频道, 准入, 渲染, 处理);
// 任意 goroutine 里：
频道广播(频道, topic, 渲染(topic));           // 主动推重渲染
频道指令(频道, topic, 指令_标题("有新消息"));  // 主动推浏览器指令
变量 在线: 整数 = 频道在线数(频道, topic);     // 简易 Presence
```

老 `共享WS路由` 签名不变（内部自建频道）；客户端运行时与实时页面完全同一份，
心跳已降级为可选保活（`共享实时脚本` 第三参传 30000 或 0 关闭）。

## RPC（Connect 协议）

`RPC.qi` 实现 [Connect 协议](https://connectrpc.com) 的**一元调用 + JSON 编码**
——connect-go / connect-es / buf curl 等 gRPC 生态客户端可直连，普通 curl 也能打。
**不是 protobuf 线格式**；protobuf 编码与流式 RPC 属后续。

```qi
函数 说你好(上下文值: 上下文, 请求JSON: 字符串) : 字符串 {
    变量 请求对象: 整数 = J.解码(请求JSON);
    变量 名字: 字符串 = J.获取字符串(请求对象, "name");
    J.删除(请求对象);
    如果 (字符串::字节长度(名字) == 0) {
        返回 RPC错误("invalid_argument", "name 字段不能为空");   // → 400 + Connect 错误 JSON
    }
    返回 "{\"greeting\":\"你好, " + 名字 + "!\"}";
}

应用值 = 注册RPC(应用值, "greet.GreeterService", "SayHello", 说你好);
// 挂载 POST /greet.GreeterService/SayHello（服务名/方法名用 ASCII）
```

```bash
curl -X POST http://127.0.0.1:7429/greet.GreeterService/SayHello \
     -H "Content-Type: application/json" -d '{"name":"世界"}'
# {"greeting":"你好, 世界!"}
```

- 错误按 Connect 规范返回 `{"code":"...","message":"..."}` + 对应 HTTP 状态
  （invalid_argument→400、unauthenticated→401、permission_denied→403、
  not_found→404、already_exists→409、resource_exhausted→429、
  unimplemented→501、unavailable→503、internal→500 等）。
- 处理函数用 `RPC错误(错误码, 消息)` 生成错误返回值，正常路径直接返回响应 JSON。
- `connect-protocol-version: 1` 请求头按规范忽略；`application/proto` 请求回 415。
- 完整示例（含错误路径）见 `examples/rpc_问候.qi`。

## 现在的取舍

当前版本优先把下面这条链路做稳：

`应用(持有 handler 值 + 路由树) -> 路由注册 -> 请求解析 -> 匹配 -> middleware -> handler -> 响应输出`

当前路由树已经具备这些行为：

- 注册时建树，不是线性追加
- 匹配时沿树下降，不是全表扫描
- 静态段优先于参数段
- 节点 / handler / middleware 存储已经改成动态列表
- 单节点静态子边已经改成动态列表，不再固定 8 槽
- 支持 `HEAD`
- 支持 `OPTIONS`
- 没有显式 `OPTIONS` 处理器时，自动返回 `Allow`
- 重复注册同一路径同方法会报冲突

也就是说，先把内核做实，再往上叠：

- 控制器
- 分组路由
- 更自动的参数提取
- 更完整的一等函数处理器（当前已支持第一版）

## 请求提取

现在除了 `路径参数 / 查询参数 / 请求主体`，也已经有这些入口：

```qi
变量 内容类型文本: 字符串 = 请求头(上下文值, "Content-Type");
变量 表单页码: 整数 = 表单整数(上下文值, "page", 1);
变量 JSON对象: 整数 = 解析JSON主体(上下文值);
变量 用户名: 字符串 = JSON字符串字段(上下文值, "name");
```

如果你自己拿 `解析JSON主体(上下文值)` 的结果继续往下用，记得在用完后调用 `JSON.删除(...)`。

## 运行应用

完整服务器入口现在可以直接写成：

```qi
变量 应用值: 应用 = 创建应用();
应用值 = 配置(应用值, "127.0.0.1", 3076);
应用值 = 获取(应用值, "/", 首页处理);
运行应用(应用值);
```

## 目录

```text
qi-web/
├── qi.toml
├── Web.qi
├── 请求.qi
├── 响应.qi
├── 路由.qi
├── 匹配器.qi
├── 服务器.qi
├── 会话.qi
├── 认证.qi
├── 控制器.qi
├── 事件流.qi
├── 实时页面.qi
├── RPC.qi
└── examples/
    ├── 一等处理器.qi
    ├── 完整服务器.qi
    ├── 控制器扩展.qi
    ├── 核心API.qi
    ├── 会话与认证.qi
    ├── 自定义中间件.qi
    ├── 路由分组.qi
    ├── llm_聊天_SSE.qi
    ├── 实时_计数器.qi
    └── rpc_问候.qi
```
