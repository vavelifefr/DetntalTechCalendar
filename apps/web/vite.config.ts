import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const apiPort = Number(process.env.VITE_API_PORT ?? 3000)
const webPort = Number(process.env.VITE_PORT ?? 5173)
const webRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
})
