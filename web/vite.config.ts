import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // 开发时代理后端 API，生产由 go:embed 同源提供
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
