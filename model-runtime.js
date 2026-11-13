// oc3d.js — the runtime of live 3D objects on published and exported pages (built by vite.oc3d.config.js into
// public/oc3d.js). It turns every <canvas data-oc-model="letter D chrome"> into a real-time WebGL object that
// follows the cursor. No network: three.js and the font are inside this one file.
import { mountAll } from './model-kit.js';
const go = () => mountAll(document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
