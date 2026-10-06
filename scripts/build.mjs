import { build } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

await build({ configFile: resolve('vite.config.ts') })
await build({
  configFile: false,
  plugins: [vue()],
  resolve: { alias: { '@': resolve('src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve('src/content/index.ts'),
      name: 'MyFormAutofillContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    minify: false,
  },
})
