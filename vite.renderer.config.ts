// 画面（renderer）だけをブラウザで開く開発用の設定。`npm run dev:browser`
// preload が無いので、src/renderer/src/api.ts の localStorage の代わりの実装で動く
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@shared': resolve(import.meta.dirname, 'src/shared')
    }
  },
  plugins: [react()],
  server: { port: 5180, strictPort: true, host: '127.0.0.1' }
})
