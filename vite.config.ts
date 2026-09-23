import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // no `npm run dev` as rotas /api (Functions da Cloudflare) não existem: aponta pro site no ar,
  // que lê o mesmo banco. Só vale no servidor local; o build não usa isto.
  server: { proxy: { '/api': { target: 'https://audiovisual.alascasa.com.br', changeOrigin: true } } },
})
