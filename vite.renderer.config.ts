// 画面（renderer）だけをブラウザで開く設定。開発は `npm run dev:browser`、
// ブラウザのお試し版（AI なし、DECISIONS/0006）のビルドは `npm run build:web`（out/web）。
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
  // どこに置いても動くように相対パスで出す（GitHub Pages のサブパスなど）
  base: './',
  build: { outDir: resolve(import.meta.dirname, 'out/web'), emptyOutDir: true },
  server: { port: 5180, strictPort: true, host: '127.0.0.1' }
})
