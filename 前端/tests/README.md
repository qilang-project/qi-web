# 前端测试

`npm test`（vitest + jsdom）。

## fixtures-template.json 是怎么来的

`template.test.ts` 里的「服务端 / 客户端渲染一致」那组用的是**服务端真实编译
产物**，不是手编的 —— 客户端渲染器必须和 `qi-web/HTML块.qi` 的 `模板节点` /
`渲染块` 逐字节一致，手编样本会把两边一起编歪。

重新生成（改了模板编译或渲染规则时）：

```bash
cat > /tmp/xcheck.qi <<'QI'
包 主程序;
导入 标准库.字符串;
导入 Web::{HTML块, 渲染块, 块计划, 块槽位, 创建片段, 块加原文};

函数 样例(名: 字符串, 分: 整数, 高亮: 布尔, 原文: 字符串) : HTML块 {
    返回 HTML {
        <div class="card" data-key={名}>
            <b>{名}</b> <span>{整数转字符串(分)} 分</span>
            <input type="checkbox" checked={高亮}>
            <img src="/a.png" alt={名}>
            <br>
            <p 如果={高亮}>高亮了</p>
            {块加原文(创建片段(), 原文)}
        </div>
    };
}

函数 一行(名: 字符串, 分: 整数, 高亮: 布尔, 原文: 字符串) {
    变量 b: HTML块 = 样例(名, 分, 高亮, 原文);
    打印("PLAN\t" + 块计划(b));
    打印("SLOT\t" + 块槽位(b));
    打印("HTML\t" + 渲染块(b));
}

函数 入口() {
    一行("三宝", 50, 真, "<em>原文</em>");
    一行("<script>x</script>", 0, 假, "<i>i</i>");
    一行("引号\"注入", 999, 真, "");
}
QI

QI_PACKAGES_PATH=<qilang>/qi_packages qi run /tmp/xcheck.qi > /tmp/xcheck.out
```

再把输出按 `PLAN/SLOT/HTML` 三段切成 JSON 数组写进 `fixtures-template.json`
（字段名 `plan` / `slots` / `html`）。

样例**要覆盖**：文本槽位、属性槽位、受控原文、布尔属性真与假、条件节点、
空元素 —— 测试里有一条专门断言样本没退化成纯文本。
