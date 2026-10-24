import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import griffel from '@griffel/vite-plugin'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '')
  const backend = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [
      react(),
      vanillaExtractPlugin(),
      // griffel AOT 提取仅在构建期启用（README 建议）；开发期由 griffel 运行时接管。
      // 注意：0.1.x 只转换自有源码中的 makeStyles，@fluentui 包内样式始终走运行时。
      command === 'build' && griffel(),
    ],
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
