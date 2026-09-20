import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '3d-force-graph-vr': new URL('src/stubs/empty.js', import.meta.url).pathname,
      '3d-force-graph-ar': new URL('src/stubs/empty.js', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
