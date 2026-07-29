import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // runtime.css 靠 esbuild define 注入，测试里用不到，给个空串顶上
    // （不给的话 confirm.ts 引用 __QI_RUNTIME_CSS__ 会在 import 时炸）
  },
  define: {
    __QI_RUNTIME_CSS__: '""',
  },
});
