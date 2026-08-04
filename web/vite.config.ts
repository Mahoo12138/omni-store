import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const backend = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [react(), vanillaExtractPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      // 开发时代理同源入口，生产由 go:embed 统一提供。
      proxy: {
        '/api': backend,
        '/raw': backend,
        '/i': backend,
        '/dav': backend,
      },
    },
  }
})
