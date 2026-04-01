import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000'

  return {
    plugins: [vue()],
    build: {
      // 宝塔有时会在站点目录里写入 .user.ini，关闭自动清空可避免构建时因受保护文件报 EPERM。
      emptyOutDir: false,
    },
    server: {
      port: 3104,
      host: '0.0.0.0',
      proxy: {
        // 只代理 /api/...，避免和 /api-keys 这类前端页面路由冲突。
        '^/api(?:/|$)': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
        },
      },
    },
  }
})
