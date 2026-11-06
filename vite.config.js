import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// In dev, /api (free AI, photos, sync) goes to the live worker so everything works locally
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: 'https://openconstructor.pw', changeOrigin: true } } },
});
