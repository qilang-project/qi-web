# 前端测试

`npm test`（vitest + jsdom）。

## 两组黄金样本都是**服务端真实产物**

客户端渲染器必须和 `qi-web/HTML块.qi` 逐字节一致 —— 手编样本会把两边一起编歪，
而线上表现只是「morph 之后页面莫名其妙对不上」，不报错、极难查。所以样本一律
从 qi 侧导出。

| 文件 | 验什么 | 生成脚本 |
| --- | --- | --- |
| `fixtures-template.json` | 同一份 plan+slots，两边渲染逐字节相同 | `生成样本.qi` |
| `fixtures-patch.json` | 服务端算的 parts，客户端能还原出同样的 HTML | `生成补丁样本.qi` |

第二组盯的是**补丁语义**：钻进子模板（`{c:…}`）、钻进循环（`{l:…}`）、改项、
加项、删项、整体挪位。服务端 `模板槽位差异` 和客户端 `applyParts`/`applyLoop`
是一对，一边改了另一边没跟上，只有这组能拦住。

## 重新生成（改了模板编译或渲染规则时）

```bash
cd qi-web/前端/tests
QI_PACKAGES_PATH=<qilang>/qi-test/qi_packages qi run 生成样本.qi     > /tmp/xcheck.out
QI_PACKAGES_PATH=<qilang>/qi-test/qi_packages qi run 生成补丁样本.qi > /tmp/xpatch.out
```

两份输出都是「每步几行带标记的行 + `~~~…结束~~~` 哨兵」，用哨兵切开、按
`PLAN/SLOT/PART/HTML` 取字段写成 JSON 数组即可（HTML 里有真换行，所以只能靠
哨兵分段，不能按行数切）。

样本**要覆盖**：文本槽位、属性槽位、受控原文、布尔属性真与假、条件节点、
空元素、嵌套子模板、循环 —— 测试里有专门断言样本没退化。
