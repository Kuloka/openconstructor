import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Clean URLs as on Cloudflare: /gallery serves public/gallery.html (otherwise dev falls back to the editor)
const cleanUrls = {
  name: 'clean-urls',
  configureServer(server){
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      if (/^\/[\w-]+(\/[\w-]+)*\/?$/.test(path) && path !== '/') {
        const name = path.replace(/\/$/, '');
        if (existsSync(resolve('public', name.slice(1) + '.html'))) req.url = name + '.html' + (query ? '?' + query : '');
        else if (existsSync(resolve('public', name.slice(1), 'index.html'))) req.url = name + '/index.html' + (query ? '?' + query : '');
      }
      next();
    });
  },
};

// In dev, /api (free AI, photos, sync, page shots) and /p/ (published pages) go to the live worker
// so everything works locally, the gallery included
export default defineConfig({
  plugins: [cleanUrls, react(), tailwindcss()],
  server: { proxy: { '/api': { target: 'https://openconstructor.pw', changeOrigin: true }, '/p/': { target: 'https://openconstructor.pw', changeOrigin: true } } },
});
