// 构建 qi-web 前端资产：TS → 单文件 JS、CSS → 压缩样式表，同时生成 qi 侧常量。
//
// 产出（同一份源码两种取用方式）：
//   ../assets/qiui-core.js  ../assets/qiui.css   给「挂载资产」路由用（可缓存）
//   ../前端资产.qi           两份都作为原始字符串常量编译进二进制（单文件部署）
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const assetDir = join(here, '..', 'assets');
mkdirSync(assetDir, { recursive: true });

async function minifyCss(file) {
  const src = readFileSync(join(srcDir, file), 'utf8');
  // legalComments:'none' 一定要带：默认会保留 /*! */ 头注释，那段文档里出现
  // <style> 会被 esbuild 转义成 <\/style>，反斜杠进 qi 原始字符串就把它截断了
  // （表现是「未定义的函数: 样式源」，很难往这上面想）。顺带产物也小一截。
  const { code } = await transform(src, { loader: 'css', minify: true, legalComments: 'none' });
  return code.trim();
}

// 1. 运行时自带样式（确认框/断线提示）——打包进 JS，应用不引样式表也能看
const runtimeCss = await minifyCss('runtime.css');

// 2. 应用样式表：设计令牌 + 基础元素 + 组件类
const appCss = await minifyCss('qiui.css');

// 3. 客户端运行时
const built = await build({
  entryPoints: [join(srcDir, 'live.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2018'],
  minify: true,
  write: false,
  legalComments: 'none',
  define: { __QI_RUNTIME_CSS__: JSON.stringify(runtimeCss) },
  // 关掉模板字面量：产物要能直接塞进 qi 的反引号原始字符串，里面不能有反引号
  supported: { 'template-literal': false },
});
// qi 常量用反引号原始字符串，产物里出现反引号会把它截断。
//
// 光靠源码不写反引号不够：markdown 渲染要匹配 ` 和 ```，源码里绕着写成
// String.fromCharCode(96)，esbuild 压缩时又给常量折叠回字面反引号了。
// 所以在这里统一转义 —— 关掉了模板字面量，产物里的反引号必然落在字符串或
// 正则字面量内，换成 \x60 语义完全一样。
const escapeBackticks = (s) => s.replace(/`/g, '\\x60');
const js = escapeBackticks(built.outputFiles[0].text.trim());

writeFileSync(join(assetDir, 'qiui-core.js'), js + '\n');
writeFileSync(join(assetDir, 'qiui.css'), appCss + '\n');

for (const [label, text] of [
  ['JS', js],
  ['CSS', appCss],
]) {
  if (text.includes('`')) {
    throw new Error(`${label} 产物里还有反引号，没法进 qi 原始字符串`);
  }
}

const qi = `// 本文件由 前端/build.mjs 生成，**不要手改**。
// 源码在 qi-web/前端/src/（live.ts 等 + qiui.css），改完跑 npm run build 重新生成。
//
// 为什么把资产塞进 qi 常量：应用要能单个二进制部署（家有小奇就是 scp 一个文件
// 上线的）。想走可缓存的外链资产，用 挂载资产() + assets/ 下的同名文件。
包 Web;

// 客户端运行时：WS 连接、DOM morph、声明式绑定、确认框
公开 函数 运行时脚本源() : 字符串 {
    返回 \`${js}\`;
}

// 应用样式表：设计令牌 + 基础元素 + 组件类。换主题只要覆盖 :root 里的 --qi-*
公开 函数 样式源() : 字符串 {
    返回 \`${appCss}\`;
}
`;
writeFileSync(join(here, '..', '前端资产.qi'), qi);

const kb = (s) => (s.length / 1024).toFixed(1) + ' KB';
console.log(`qiui-core.js  ${kb(js)}  (内含运行时样式 ${kb(runtimeCss)})`);
console.log(`qiui.css      ${kb(appCss)}`);
console.log(`前端资产.qi   已生成`);
