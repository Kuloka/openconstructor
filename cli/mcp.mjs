// openconstructor as an MCP server: `npx openconstructor mcp [folder]`.
// AI agents (Claude Code, Claude Desktop, Cursor, any MCP client) get openconstructor as a tool over stdio:
// the catalog of ready sections and components, a page they assemble from them, live 3D objects and photos by a few
// words, a local preview with live reload, screenshots to check their work, and export to HTML / React / Vue / Svelte.
// The agent is the language model here, so nothing in this file calls an AI. No dependencies: Node 18+ only.
//
// The page lives in the folder: openconstructor.json (the sections) and index.html (rebuilt after every change).
// stdout carries only JSON-RPC messages (one per line); everything human-readable goes to stderr.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '0.2.0';
const SITE = process.env.OC_SITE || 'https://openconstructor.pw';
const OC3D = `${SITE}/oc3d.js`;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MODEL_MAX = 8;
const here = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => process.stderr.write(`[openconstructor] ${a.join(' ')}\n`);

/* ── Catalog: built from the editor's presets by scripts/build-catalog.mjs into catalog.json.gz ── */
let catalog = null;
function loadCatalog(){
  if (catalog) return catalog;
  const file = path.join(here, 'catalog.json.gz');
  if (!fs.existsSync(file)) throw Error('catalog.json.gz is missing next to mcp.mjs — run `node scripts/build-catalog.mjs` in the repo');
  catalog = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  // what search looks at: the name, the section, and the words people would see on the component
  for (const c of catalog.items) c._text = `${c.name} ${c.category} ${c.kind} ${c.words}`.toLowerCase();
  return catalog;
}
const words = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
function search({ query = '', category = '', kind = 'any', limit = 12, include_samples = false }){
  const { items } = loadCatalog();
  const q = words(query), cat = String(category).toLowerCase();
  const scored = [];
  for (const c of items) {
    if (kind !== 'any' && c.kind !== kind) continue;
    if (cat && !c.category.toLowerCase().includes(cat)) continue;
    if (c.sample && !include_samples && !q.length) continue;
    let s = q.length ? 0 : 1;
    const name = c.name.toLowerCase();
    for (const w of q) {
      if (name.split(/[^\p{L}\p{N}]+/u).includes(w)) s += 6; else if (name.includes(w)) s += 4;
      if (c.category.toLowerCase().includes(w)) s += 3;
      if (c._text.includes(w)) s += 1;
    }
    if (s > 0) scored.push([s - (c.sample && !include_samples ? 0.5 : 0), c]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, Math.min(40, Math.max(1, +limit || 12))).map(([, c]) => ({ id: c.id, name: c.name, category: c.category, kind: c.kind, ...(c.sample ? { sample: true } : {}), size_kb: +(c.code.length / 1024).toFixed(1) }));
}
const findComponent = id => loadCatalog().items.find(c => c.id === id);

/* ── The page: a stack of sections (full-width) and components (centered), like the editor's "stack" layout ── */
let dir = process.cwd();
const projectFile = () => path.join(dir, 'openconstructor.json');
let page = null;
function loadPage(){
  if (page) return page;
  try { page = JSON.parse(fs.readFileSync(projectFile(), 'utf8')); } catch { page = null; }
  if (!page || !Array.isArray(page.sections)) page = { name: 'My page', background: '#09090b', sections: [], next: 1 };
  page.next ||= page.sections.length + 1;
  return page;
}
function savePage(){
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(projectFile(), JSON.stringify(page, null, 2));
  fs.writeFileSync(path.join(dir, 'index.html'), buildHTML());
  for (const r of clients) r.write('data: reload\n\n');
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const isLight = bg => { const m = String(bg).match(/^#([0-9a-f]{6})$/i); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };

// media tokens, as in the editor: <img src="model:knot chrome #7b6cf6"> = a live 3D object (oc3d.js),
// src="photo:coffee shop interior" = a free stock photo found by those words
function resolveMedia(code, counter){
  code = code.replace(/<img\b([^>]*?)\bsrc=(["'])model:([^"'<>]{1,120})\2([^>]*?)\/?>/gi, (all, a, _q, q, b) => {
    if (++counter.models > MODEL_MAX) return all;
    const attrs = a + ' ' + b, attr = n => attrs.match(new RegExp(`\\b${n}=(["'])([^"']*)\\1`, 'i'))?.[2] || '';
    const query = q.replace(/\b(interactive|live|cursor|hover|tilt|mouse|follow)\b/gi, '').replace(/\s+/g, ' ').trim();
    const px = n => /^\d{1,4}$/.test(attr(n)) ? `${n}:${attr(n)}px;` : '';
    const style = (px('width') + px('height') + attr('style')).replace(/;?\s*$/, '');
    const word = query.match(/\b(?:text|word|logo)\s+(?:["“«']([^"”»']{1,24})["”»']|([^\s#"]{1,24}))/i), n = word ? (word[1] || word[2]).length : 1;
    const cw = 640, ch = n > 1 ? Math.max(120, Math.round(640 / Math.min(8, 0.62 * n + 0.5))) : 640;
    const cls = attr('class'), id = attr('id');
    return `<canvas data-oc-model="${esc(query)}" width="${cw}" height="${ch}"${id ? ` id="${esc(id)}"` : ''}${cls ? ` class="${esc(cls)}"` : ''} role="img" aria-label="${esc(attr('alt') || query)}" style="${style ? style + ';' : ''}height:auto;aspect-ratio:${cw}/${ch}"></canvas>`;
  });
  return code.replace(/(?<=["'(]\s*)photo:([^"'()<>\n]{1,120})/g, (all, q) => `${SITE}/api/photo?q=${encodeURIComponent(q.trim())}`);
}
function buildHTML(){
  const p = loadPage(), counter = { models: 0 };
  const body = p.sections.map(s => {
    const code = resolveMedia(s.html, counter);
    return s.full ? `<section class="oc-full" data-oc-id="${s.id}">\n${code}\n</section>` : `<div class="oc-block" data-oc-id="${s.id}">\n${code}\n</div>`;
  }).join('\n');
  const live3d = /<canvas[^>]+data-oc-model=/.test(body);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)}</title><style>
html,body{margin:0}body{min-height:100vh;background:${String(p.background).replace(/[;{}<>]/g, '')};color:${isLight(p.background) ? '#18181b' : '#eee'};font-family:system-ui}
.oc-page{display:flex;flex-direction:column;gap:24px;min-height:100vh;overflow-x:hidden}
.oc-full{width:100%}.oc-full>*{max-width:100%;box-sizing:border-box}
.oc-block{display:flex;justify-content:center;padding:0 16px}.oc-block>*{max-width:100%;box-sizing:border-box}
.oc-page img,.oc-page svg,.oc-page video,.oc-page canvas{max-width:100%;height:auto}
${live3d ? ':where(canvas[data-oc-model]){display:inline-block;width:640px;vertical-align:middle}\n' : ''}@media(max-width:640px){.oc-full [style*="grid-template-columns"],.oc-full [class*="grid"]{grid-template-columns:1fr!important}.oc-page h1{font-size:clamp(28px,8vw,48px)!important}}
</style></head><body><main class="oc-page">
${body}
</main>${live3d ? `<script src="${OC3D}" defer></script>` : ''}</body></html>`;
}
const outline = () => { const p = loadPage(); return { name: p.name, background: p.background, folder: dir, file: path.join(dir, 'index.html'), preview: previewURL || null, sections: p.sections.map((s, i) => ({ position: i, id: s.id, name: s.name, kind: s.full ? 'section' : 'component', ...(s.from ? { from: s.from } : {}), size_kb: +(s.html.length / 1024).toFixed(1) })) }; };
const indexOf = id => { const i = loadPage().sections.findIndex(s => s.id === id); if (i < 0) throw Error(`no section with id "${id}" — call page_get to see the ids`); return i; };
const clampPos = (pos, len) => pos == null || pos === '' ? len : Math.max(0, Math.min(len, Math.round(+pos)));

/* ── Export to component files (the page stays a stack: each section keeps its HTML) ── */
function exportCode(format){
  const p = loadPage(), counter = { models: 0 };
  const list = p.sections.map(s => ({ name: s.name, full: !!s.full, html: resolveMedia(s.html, counter) }));
  const name = (p.name.replace(/[^A-Za-z0-9]+(.)?/g, (m, ch) => ch ? ch.toUpperCase() : '').replace(/^[^A-Za-z]+/, '') || 'Page').replace(/^./, ch => ch.toUpperCase());
  const tpl = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const css = `.oc-page{display:flex;flex-direction:column;gap:24px;min-height:100vh;overflow-x:hidden;background:${p.background};color:${isLight(p.background) ? '#18181b' : '#eee'};font-family:system-ui}.oc-full{width:100%}.oc-block{display:flex;justify-content:center;padding:0 16px}`;
  const head = `Generated by openconstructor (${SITE}) from "${p.name.replace(/\*\/|-->|[\r\n]/g, ' ')}".`;
  const items = list.map(it => `  { name: ${JSON.stringify(it.name)}, full: ${it.full}, html: \`${tpl(it.html)}\` },`).join('\n');
  const needs3d = list.some(it => it.html.includes('data-oc-model'));
  const note3d = needs3d ? `\n// Live 3D objects need ${OC3D} on the page: add <script src="${OC3D}" defer></script> to your HTML.` : '';
  if (format === 'react') return { ext: 'jsx', code: `/* ${head} One React component; each section keeps its original HTML. */${note3d}\n\nconst css = \`${tpl(css)}\`;\n\nconst sections = [\n${items}\n];\n\nexport default function ${name}() {\n  return (\n    <main className="oc-page">\n      <style>{css}</style>\n      {sections.map((s, i) => (\n        <div key={i} data-name={s.name} className={s.full ? 'oc-full' : 'oc-block'} dangerouslySetInnerHTML={{ __html: s.html }} />\n      ))}\n    </main>\n  );\n}\n` };
  if (format === 'vue') return { ext: 'vue', code: `<!-- ${head} Vue 3 single-file component. -->\n<template>\n  <main class="oc-page">\n    <div v-for="(s, i) in sections" :key="i" :data-name="s.name" :class="s.full ? 'oc-full' : 'oc-block'" v-html="s.html"></div>\n  </main>\n</template>\n\n<script>${note3d}\nconst sections = [\n${items}\n];\nexport default { name: ${JSON.stringify(name)}, data: () => ({ sections }) };\n</script>\n\n<style>\n${css}\n</style>\n` };
  if (format === 'svelte') return { ext: 'svelte', code: `<!-- ${head} Svelte component; the styles go to <svelte:head> so the original class names keep working. -->
<script>${note3d}
  const css = \`${tpl(css)}\`;
  const sections = [
${items}
  ];
</script>

<svelte:head>{@html '<style>' + css + '</style>'}</svelte:head>

<main class="oc-page">
  {#each sections as s}
    <div data-name={s.name} class={s.full ? 'oc-full' : 'oc-block'}>{@html s.html}</div>
  {/each}
</main>
` };
  return { ext: 'html', code: buildHTML() };
}

/* ── Preview: a local server for the folder; the page reloads itself after every change (SSE) ── */
let server = null, previewURL = '';
const clients = new Set();
const RELOAD = `<script>new EventSource('/__oc/live').onmessage=()=>location.reload()</script>`;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function startPreview(port = +process.env.OC_PORT || 4330){
  if (server) return Promise.resolve(previewURL);
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/__oc/live') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write(': hi\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
      if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(buildHTML().replace('</body>', RELOAD + '</body>')); return; }
      const file = path.resolve(dir, '.' + decodeURIComponent(u.pathname));
      if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    s.on('error', e => { if (e.code === 'EADDRINUSE' && port < 4400) startPreview(port + 1).then(resolve, reject); else reject(e); });
    s.listen(port, '127.0.0.1', () => { server = s; previewURL = `http://127.0.0.1:${port}/`; log('preview at', previewURL); resolve(previewURL); });
  });
}
function openBrowser(url){
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}

/* ── Screenshot: headless Chrome or Edge, so the agent can look at what it built ── */
const BROWSERS = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].filter(Boolean);
function screenshot({ width = 1280, height = 900, wait_ms = 2500 } = {}){
  const bin = BROWSERS.find(p => fs.existsSync(p));
  if (!bin) throw Error('Chrome or Edge not found — set CHROME=/path/to/chrome to take screenshots');
  const w = Math.max(320, Math.min(2560, Math.round(+width) || 1280)), h = Math.max(240, Math.min(8000, Math.round(+height) || 900));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-shot-')), html = path.join(tmp, 'page.html'), png = path.join(tmp, 'shot.png');
  fs.writeFileSync(html, buildHTML());
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(tmp, 'profile')}`, `--virtual-time-budget=${Math.max(0, Math.min(10000, +wait_ms || 0))}`, `--window-size=${w},${h}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
    const kill = setTimeout(() => p.kill(), 30000);
    p.on('error', reject);
    p.on('exit', () => {
      clearTimeout(kill);
      try { const data = fs.readFileSync(png).toString('base64'); resolve({ data, w, h }); } catch { reject(Error('the browser did not write a screenshot')); }
      finally { setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 1000); }
    });
  });
}

/* ── Tools ── */
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const TOOLS = [
  { name: 'search_components', title: 'Search the component catalog',
    description: 'Search openconstructor\'s catalog of ready, hand-made UI: full-width page sections (hero, pricing, features, testimonials, FAQ, footer, navbar, dashboards, game UI, cinematic 3D…) and small components (buttons, inputs, cards, toasts, chat UI…). Each one is self-contained HTML+CSS with unique class names, so they can be stacked on one page without clashes. Use this first, then get_component or page_add_section with the id. English search words work best.',
    inputSchema: { type: 'object', properties: { query: str('What you need, e.g. "pricing three tiers", "hero dark gradient", "login form", "faq accordion"'), category: str('Optional catalog section to search in (see list_categories), e.g. "Landing sections"'), kind: { type: 'string', enum: ['any', 'section', 'component'], description: 'section = full-width page block, component = small centered element. Default any.' }, limit: { type: 'integer', minimum: 1, maximum: 40, description: 'Default 12' }, include_samples: { type: 'boolean', description: 'Also list the 200 extra style samples (8 visual styles of 25 section types). Default false; they still show up when the words match well.' } } },
    annotations: { readOnlyHint: true } },
  { name: 'list_categories', title: 'List catalog sections', description: 'The sections of the component catalog with how many sections/components each has.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'get_component', title: 'Get a component\'s code', description: 'The full HTML+CSS of one catalog item, to read, adapt (texts, colors, images) and then pass as `html` to page_add_section — or to use in your own project.',
    inputSchema: { type: 'object', properties: { id: str('id from search_components') }, required: ['id'] }, annotations: { readOnlyHint: true } },
  { name: 'page_get', title: 'Show the page', description: 'The page being built in the folder: its name, background, and the ordered list of sections with their ids. With include_html, also each section\'s HTML.',
    inputSchema: { type: 'object', properties: { include_html: { type: 'boolean', description: 'Default false' } } }, annotations: { readOnlyHint: true } },
  { name: 'page_new', title: 'Start a new page', description: 'Clear the page and start over with a name and a background colour. The folder\'s openconstructor.json and index.html are overwritten.',
    inputSchema: { type: 'object', properties: { name: str('Page title, e.g. "Coffee shop"'), background: str('CSS background of the page, e.g. "#09090b" or "#ffffff". Most catalog sections are designed for dark pages.') } },
    annotations: { destructiveHint: true } },
  { name: 'page_add_section', title: 'Add a section',
    description: 'Add a block to the page: either a catalog item by component_id (used as is), or your own html (e.g. a catalog item you adapted). Media tokens work inside html: <img src="model:knot chrome #7b6cf6" width="320"> becomes a live real-time 3D object (shapes: cube sphere torus ring knot pyramid cone cylinder capsule diamond star heart helix coin, "letter R", "text WORD", "openconstructor"; materials: chrome gold metal glass iridescent pearl plastic matte clay velvet neon; a hex colour), up to 8 per page; src="photo:coffee shop interior" becomes a free stock photo for those words. Returns the new section id.',
    inputSchema: { type: 'object', properties: { component_id: str('Catalog id from search_components'), html: str('Your own HTML+CSS (put CSS in a <style> tag; use unique class names). Ignored when component_id is given.'), name: str('Label for the section, e.g. "Hero"'), full_width: { type: 'boolean', description: 'For your own html: true = full-width section, false = centered component. Default true.' }, position: { type: 'integer', minimum: 0, description: 'Where to insert (0 = top). Default: at the end.' } } } },
  { name: 'page_update_section', title: 'Change a section', description: 'Replace a section\'s HTML and/or rename it. Read it first with page_get include_html.',
    inputSchema: { type: 'object', properties: { id: str('Section id'), html: str('The new HTML+CSS'), name: str('New label') }, required: ['id'] } },
  { name: 'page_move_section', title: 'Move a section', description: 'Move a section to another position (0 = top).',
    inputSchema: { type: 'object', properties: { id: str('Section id'), position: { type: 'integer', minimum: 0 } }, required: ['id', 'position'] } },
  { name: 'page_remove_section', title: 'Remove a section', description: 'Delete a section from the page.',
    inputSchema: { type: 'object', properties: { id: str('Section id') }, required: ['id'] }, annotations: { destructiveHint: true } },
  { name: 'page_set', title: 'Page settings', description: 'Rename the page or change its background colour.',
    inputSchema: { type: 'object', properties: { name: str('Page title'), background: str('CSS background, e.g. "#09090b"') } } },
  { name: 'preview', title: 'Open the live preview', description: 'Start a local preview server for the page (it reloads by itself after every change) and return its URL. open: true also opens it in the user\'s browser.',
    inputSchema: { type: 'object', properties: { open: { type: 'boolean', description: 'Open in the browser. Default false.' } } } },
  { name: 'screenshot', title: 'Screenshot the page', description: 'Render the page in headless Chrome/Edge and return a PNG, to check the layout, spacing and contrast yourself. Use width 390 to check phones. 3D objects need a moment: wait_ms.',
    inputSchema: { type: 'object', properties: { width: { type: 'integer', description: 'Viewport width, default 1280' }, height: { type: 'integer', description: 'Viewport height (the shot is this tall), default 900, up to 8000' }, wait_ms: { type: 'integer', description: 'Time for fonts, photos and 3D to load, default 2500' } } }, annotations: { readOnlyHint: true } },
  { name: 'export', title: 'Export the page', description: 'Write the page to a file in the folder as plain HTML (one self-contained file), a React component (.jsx), a Vue SFC or a Svelte component. Returns the path; with return_code also the code.',
    inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['html', 'react', 'vue', 'svelte'], description: 'Default html' }, file: str('File name inside the folder; default page.<ext> (html: index.html is always kept up to date already)'), return_code: { type: 'boolean', description: 'Also return the code. Default false.' } } } },
];

const text = (t, structured) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t) }], ...(structured ? { structuredContent: structured } : {}) });
async function callTool(name, a = {}){
  switch (name) {
    case 'search_components': { const results = search(a); return text(results.length ? results : 'Nothing matched. Try other words or list_categories.', { results }); }
    case 'list_categories': { const { items } = loadCatalog(); const m = {}; for (const c of items) { const e = m[c.category] ||= { category: c.category, sections: 0, components: 0 }; e[c.kind === 'section' ? 'sections' : 'components']++; } const categories = Object.values(m); return text(categories, { categories }); }
    case 'get_component': { const c = findComponent(a.id); if (!c) throw Error(`no component "${a.id}" — use search_components`); return text(`${c.name} · ${c.category} · ${c.kind}\n\n${c.code}`); }
    case 'page_get': { const o = outline(); if (a.include_html) o.sections.forEach((s, i) => s.html = loadPage().sections[i].html); return text(o, o); }
    case 'page_new': { page = { name: String(a.name || 'My page').slice(0, 120), background: String(a.background || '#09090b').slice(0, 200), sections: [], next: 1 }; savePage(); return text(outline(), outline()); }
    case 'page_set': { const p = loadPage(); if (a.name) p.name = String(a.name).slice(0, 120); if (a.background) p.background = String(a.background).slice(0, 200); savePage(); return text(outline(), outline()); }
    case 'page_add_section': {
      const p = loadPage();
      let html, full, label, from;
      if (a.component_id) { const c = findComponent(a.component_id); if (!c) throw Error(`no component "${a.component_id}" — use search_components`); html = c.code; full = c.kind === 'section'; label = a.name || c.name; from = c.id; }
      else if (a.html && String(a.html).trim()) { html = String(a.html); full = a.full_width !== false; label = a.name || 'Section'; }
      else throw Error('give component_id or html');
      const id = 's' + p.next++;
      p.sections.splice(clampPos(a.position, p.sections.length), 0, { id, name: String(label).slice(0, 80), full, html, ...(from ? { from } : {}) });
      savePage();
      return text({ added: id, page: outline() });
    }
    case 'page_update_section': { const p = loadPage(), s = p.sections[indexOf(a.id)]; if (a.html != null) s.html = String(a.html); if (a.name) s.name = String(a.name).slice(0, 80); savePage(); return text({ updated: s.id, page: outline() }); }
    case 'page_move_section': { const p = loadPage(), [s] = p.sections.splice(indexOf(a.id), 1); p.sections.splice(clampPos(a.position, p.sections.length), 0, s); savePage(); return text(outline()); }
    case 'page_remove_section': { const p = loadPage(); p.sections.splice(indexOf(a.id), 1); savePage(); return text(outline()); }
    case 'preview': { if (!fs.existsSync(path.join(dir, 'index.html'))) savePage(); const url = await startPreview(); if (a.open) openBrowser(url); return text(`Preview: ${url} (reloads after every change)`, { url }); }
    case 'screenshot': { if (!loadPage().sections.length) throw Error('the page is empty — add a section first'); const s = await screenshot(a); return { content: [{ type: 'image', data: s.data, mimeType: 'image/png' }, { type: 'text', text: `${s.w}×${s.h}` }] }; }
    case 'export': {
      const format = ['html', 'react', 'vue', 'svelte'].includes(a.format) ? a.format : 'html';
      const { ext, code } = exportCode(format);
      const name = path.basename(String(a.file || `page.${ext}`));
      const file = path.join(dir, name); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, code);
      return text(a.return_code ? `${file}\n\n${code}` : `Written: ${file} (${(code.length / 1024).toFixed(1)} KB)`, { file, format });
    }
  }
  throw Error(`unknown tool "${name}"`);
}

const INSTRUCTIONS = `openconstructor builds web pages from a catalog of ready, hand-made sections and components.
Typical flow: search_components → (get_component to adapt texts/colours) → page_add_section for each block, top to bottom → screenshot to check (also at width 390) → page_update_section to fix → export.
The page lives in the working folder as index.html (always current) + openconstructor.json. Catalog items are self-contained HTML+CSS with unique class names; keep class names unique when you write your own.
In any html: <img src="model:torus glass #7b6cf6" width="360"> is a live 3D object; src="photo:words" is a stock photo.`;

/* ── JSON-RPC over stdio ── */
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(msg){
  const { id, method, params = {} } = msg;
  const reply = result => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const error = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      const v = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[1];
      return reply({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'openconstructor', title: 'openconstructor', version: VERSION, websiteUrl: SITE }, instructions: INSTRUCTIONS });
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS });
    if (method === 'tools/call') {
      try { return reply(await callTool(params.name, params.arguments || {})); }
      catch (e) { return reply({ content: [{ type: 'text', text: String(e.message || e) }], isError: true }); }
    }
    if (method === 'resources/list') return reply({ resources: [] });
    if (method === 'prompts/list') return reply({ prompts: [] });
    if (method?.startsWith('notifications/')) return;
    return error(-32601, `Method not found: ${method}`);
  } catch (e) { return error(-32603, String(e.message || e)); }
}

export function serve({ folder } = {}){
  dir = path.resolve(folder || process.env.OC_DIR || process.cwd());
  log(`MCP server v${VERSION} · folder ${dir}`);
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      if (Array.isArray(msg)) msg.forEach(handle); else handle(msg);
    }
  });
  process.stdin.on('end', () => { server?.close(); process.exit(0); });
}

export const _test = { search, buildHTML, resolveMedia, exportCode, handle, setDir: d => { dir = d; page = null; } };
