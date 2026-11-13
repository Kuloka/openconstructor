// Builds the live-3D runtime for pages (model-runtime.js → public/oc3d.js), one self-contained classic script
import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public', emptyOutDir: false, copyPublicDir: false, minify: true, target: 'es2019',
    lib: { entry: 'model-runtime.js', formats: ['iife'], name: 'oc3d', fileName: () => 'oc3d.js' },
  },
});
