// Project exports as .zip: a static site (index.html + assets/) or a ready Vite + React app.
// Embedded pictures (data: URLs) become real files in assets/. The zip is written by hand (stored, no
// compression) so there is no dependency; loaded only when such an export is chosen.

const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// files: [{ name, data: string | Uint8Array }] → Blob (application/zip)
export function zip(files){
  const parts = [], central = [];
  let offset = 0;
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, s]) => s === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true));
    parts.push(head, name, data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, s]) => s === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    central.push(c, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, x) => s + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]].forEach(([o, v, s]) => s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// data:image/...;base64 → files under `dir`, same picture = same file
export function extractImages(text, dir, files, seen = new Map()){
  return String(text).replace(/data:image\/([\w.+-]+);base64,([A-Za-z0-9+/=]+)/g, (all, type, b64) => {
    if (seen.has(b64)) return seen.get(b64);
    const ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[type] || type.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png';
    const name = `${dir}/img-${seen.size + 1}.${ext}`;
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    files.push({ name, data: bytes });
    seen.set(b64, name);
    return name;
  });
}

const slug = s => String(s || 'my-site').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'my-site';

export function staticSite({ html, title }){
  const files = [];
  const page = extractImages(html, 'assets', files);
  files.unshift({ name: 'index.html', data: page });
  files.push({ name: 'README.md', data: `# ${title}\n\nMade with [openconstructor](https://openconstructor.pw).\n\nOpen \`index.html\` in a browser, or upload this folder to any static hosting (Cloudflare Pages, Netlify, GitHub Pages, Vercel).\n` });
  return { blob: zip(files), file: slug(title) + '-site.zip' };
}

// reactSource(items, page, title) is exporters.toReact; image URLs become /assets/… in public/
export function reactApp({ items, page, title, reactSource }){
  const files = [], seen = new Map();
  const clean = items.map(it => ({ ...it, code: extractImages(it.code, 'assets', files, seen).replace(/(["'(])assets\//g, '$1/assets/') }));
  files.forEach(f => { f.name = 'public/' + f.name; });
  const name = slug(title);
  files.unshift(
    { name: 'package.json', data: JSON.stringify({ name, private: true, version: '0.1.0', type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' } }, null, 2) + '\n' },
    { name: 'vite.config.js', data: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n` },
    { name: 'index.html', data: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <title>${String(title).replace(/[<&]/g, '')}</title>\n    <style>html,body{margin:0}body{background:${page.bg || '#fff'}}</style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n` },
    { name: 'src/main.jsx', data: `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\n\ncreateRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);\n` },
    { name: 'src/App.jsx', data: reactSource(clean, page, title) },
    { name: '.gitignore', data: 'node_modules\ndist\n' },
    { name: 'README.md', data: `# ${title}\n\nMade with [openconstructor](https://openconstructor.pw).\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n\n\`npm run build\` puts the site into \`dist/\`. The page lives in \`src/App.jsx\`; pictures are in \`public/assets/\`.\n` },
  );
  return { blob: zip(files), file: name + '-react.zip' };
}
