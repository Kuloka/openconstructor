import {presets} from './presets.js';
import {CATEGORIES} from './categories.js';
import logoSvg from './src/logo.svg?raw';
import { PROVIDERS, byId, listModels, chat } from './providers.js';
import { signOut, user as authUser } from './auth.js';
import './donate.js';
import './tour.js';

const $ = id => document.getElementById(id);
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GRID = 8, PAD = 16, STAGE_PAD = 480;
const snap = v => Math.max(0, Math.round(v / GRID) * GRID);
const store = { get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

document.querySelectorAll('.oc-logo').forEach(el => el.innerHTML = logoSvg);

/* ── State ───────────────────────────────────────────────── */
let items = store.get('form-canvas-v3', []);
if (!Array.isArray(items)) items = [];
items.forEach((it, i) => { if (typeof it.x !== 'number' || typeof it.y !== 'number') { it.x = 48 + (i % 3) * 320; it.y = 48 + Math.floor(i / 3) * 200; } });
let selected = null, editing = null, history = [];
function checkpoint(){ history.push(JSON.stringify(items)); if (history.length > 50) history.shift(); }
function persist(){ store.set('form-canvas-v3', items); }

// Project name in the header
const nameEl = $('projectName');
nameEl.textContent = store.get('oc-name', 'my-interface');
nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });
nameEl.addEventListener('blur', () => { const v = nameEl.textContent.trim().slice(0, 60) || 'my-interface'; nameEl.textContent = v; store.set('oc-name', v); });

/* ── Page (artboard) ─────────────────────────────────────── */
const BACKGROUNDS = [
  { name: 'Night', value: '#09090b' },
  { name: 'Graphite', value: '#18181b' },
  { name: 'Light', value: '#fafafa' },
  { name: 'Amethyst', value: 'linear-gradient(160deg,#1e1338 0%,#0b0a12 55%)' },
  { name: 'Ocean', value: 'linear-gradient(160deg,#0b2235 0%,#08090c 55%)' },
  { name: 'Sunset', value: 'radial-gradient(120% 80% at 50% 0%,#3a1530 0%,#0c090c 60%)' },
];
let page = { w: 1440, h: 900, bg: BACKGROUNDS[0].value, ...store.get('oc-page', {}) };
let zoom = 1;
const board = $('board'), stage = $('stage'), canvas = $('canvas'), nodes = new Map();
board.style.left = board.style.top = STAGE_PAD + 'px';
$('boardLabel').style.left = STAGE_PAD + 'px';
$('boardLabel').style.top = STAGE_PAD - 26 + 'px';

/* ── iframe documents (scripts blocked by sandbox + CSP) ──── */
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;
function previewDoc(code, wide){
  // overflow:hidden + dark scheme, otherwise large components get white system scrollbars
  const body = wide ? ':root{color-scheme:dark}html,body{margin:0;background:#0d0b0a;color:#eee;font-family:system-ui;overflow:hidden}' : ':root{color-scheme:dark}html,body{margin:0;height:100%;overflow:hidden;background:#111113}body{display:grid;place-items:center;box-sizing:border-box;padding:20px;color:#eee;font-family:system-ui}';
  return `<!doctype html><html><head>${CSP}<meta name="viewport" content="width=device-width,initial-scale=1"><style>${body}button{white-space:nowrap}</style></head><body>${code}</body></html>`;
}
function nodeDoc(item){
  const root = item.full ? `width:${page.w}px;padding:0` : `width:max-content;max-width:${page.w - 2 * PAD}px;padding:${PAD}px`;
  return `<!doctype html><html><head>${CSP}<meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;background:transparent;color:#eee;font-family:system-ui;overflow:hidden}button{white-space:nowrap}#__root{display:inline-block;box-sizing:border-box;${root}}</style></head><body><div id="__root">${item.code}</div></body></html>`;
}

function measure(frame){
  try {
    const root = frame.contentDocument?.getElementById('__root'); if (!root) return;
    const r = root.getBoundingClientRect();
    frame.style.width = Math.ceil(Math.max(r.width, 48)) + 'px';
    frame.style.height = Math.ceil(Math.max(r.height, 32)) + 'px';
    layout();
  } catch {}
}
function createNode(item){
  const el = document.createElement('div');
  el.className = 'node'; el.dataset.id = item.id;
  el.innerHTML = `<span class="node-tag"></span><iframe sandbox="allow-same-origin" tabindex="-1" referrerpolicy="no-referrer"></iframe>`;
  const frame = el.querySelector('iframe');
  frame.style.width = page.w + 'px';
  frame.addEventListener('load', () => { measure(frame); setTimeout(() => measure(frame), 300); });
  board.append(el); nodes.set(item.id, el); return el;
}
function render(){
  persist();
  $('itemCount').textContent = items.length + (items.length === 1 ? ' element' : ' elements');
  for (const [id, el] of nodes) if (!items.some(x => x.id === id)) { el.remove(); nodes.delete(id); }
  items.forEach((item, i) => {
    const el = nodes.get(item.id) || createNode(item);
    const frame = el.querySelector('iframe');
    const key = item.code + '|' + (item.full ? page.w : 0);
    if (el._key !== key) { el._key = key; frame.title = item.name; frame.srcdoc = nodeDoc(item); }
    el.querySelector('.node-tag').textContent = item.name;
    el.style.left = item.x + 'px'; el.style.top = item.y + 'px'; el.style.zIndex = i + 1;
    el.classList.toggle('selected', selected === item.id);
    el.classList.toggle('full', !!item.full);
  });
  $('canvasEmpty').classList.toggle('hidden', items.length > 0);
  renderLayers();
  layout();
}
function contentBottom(){ let h = 0; for (const el of nodes.values()) h = Math.max(h, el.offsetTop + el.offsetHeight); return h; }
// The page grows downward when elements extend past its height, like a real web page
function layout(){
  const h = Math.max(page.h, contentBottom() + 48);
  board.style.width = page.w + 'px'; board.style.height = h + 'px';
  board.style.background = page.bg;
  board.style.transform = `scale(${zoom})`;
  board.style.setProperty('--inv', String(1 / zoom));
  board.classList.toggle('light', page.bg === '#fafafa');
  stage.style.width = page.w * zoom + STAGE_PAD * 2 + 'px';
  stage.style.height = h * zoom + STAGE_PAD * 2 + 'px';
  $('boardLabel').textContent = `page · ${page.w} × ${Math.round(h)}`;
  $('zoomFit').textContent = Math.round(zoom * 100) + '%';
  $('sbZoom').textContent = Math.round(zoom * 100) + '%';
  $('sbPage').textContent = `${page.w} × ${Math.round(h)}`;
}
function setZoom(z, keepCenter = true){
  const old = zoom;
  const cx = (canvas.scrollLeft + canvas.clientWidth / 2 - STAGE_PAD) / old, cy = (canvas.scrollTop + canvas.clientHeight / 2 - STAGE_PAD) / old;
  zoom = Math.min(2, Math.max(.1, Math.round(z * 100) / 100));
  layout();
  if (keepCenter) { canvas.scrollLeft = cx * zoom + STAGE_PAD - canvas.clientWidth / 2; canvas.scrollTop = cy * zoom + STAGE_PAD - canvas.clientHeight / 2; }
}
// Fit the page to the screen and center it
function fitZoom(){
  setZoom(Math.min(1, (canvas.clientWidth - 64) / page.w), false);
  canvas.scrollLeft = STAGE_PAD - Math.max(32, (canvas.clientWidth - page.w * zoom) / 2);
  canvas.scrollTop = STAGE_PAD - 48;
}
$('zoomIn').onclick = () => setZoom(zoom + .1);
$('zoomOut').onclick = () => setZoom(zoom - .1);
$('zoomFit').onclick = fitZoom;
canvas.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });

// Page size and background
$('pageSize').value = `${page.w}x${page.h}`;
if (!$('pageSize').value) $('pageSize').value = '1440x900';
$('pageSize').onchange = () => { const [w, h] = $('pageSize').value.split('x').map(Number); page = { ...page, w, h }; store.set('oc-page', page); items.forEach(it => { if (it.full) it.x = 0; }); render(); fitZoom(); };
$('swatches').innerHTML = BACKGROUNDS.map((b, i) => `<button role="radio" data-bg="${i}" title="${b.name}" aria-label="Background: ${b.name}" style="background:${b.value}"></button>`).join('');
function syncSwatches(){ document.querySelectorAll('[data-bg]').forEach(b => b.setAttribute('aria-checked', BACKGROUNDS[+b.dataset.bg].value === page.bg)); }
$('swatches').onclick = e => { const b = e.target.closest('[data-bg]'); if (!b) return; page = { ...page, bg: BACKGROUNDS[+b.dataset.bg].value }; store.set('oc-page', page); syncSwatches(); layout(); };
syncSwatches();
addEventListener('resize', layout);

/* ── Element operations ──────────────────────────────────── */
function select(id){ selected = id; for (const [nid, el] of nodes) el.classList.toggle('selected', nid === id); renderLayers(); }
function freeSpot(w = 280, h = 140){
  const GAP = 24;
  const rects = [...nodes.values()].map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth || 240, h: el.offsetHeight || 100 }));
  const hit = (x, y) => rects.some(r => x < r.x + r.w + GAP && x + w + GAP > r.x && y < r.y + r.h + GAP && y + h + GAP > r.y);
  const maxX = Math.max(48, page.w - w - 48);
  for (let y = 48; y < 6000; y += 32) for (let x = 48; x <= maxX; x += 32) if (!hit(x, y)) return { x: snap(x), y: snap(y) };
  return { x: 48, y: 48 };
}
function add(name, code, opts = {}){
  checkpoint();
  const full = !!opts.full;
  const pos = opts.pos || (full ? { x: 0, y: snap(contentBottom()) } : freeSpot());
  const item = { id: crypto.randomUUID(), name, code, ...pos, ...(full ? { full: true } : {}) };
  items.push(item); selected = item.id; render();
  requestAnimationFrame(() => { const ty = item.y * zoom + STAGE_PAD; if (ty < canvas.scrollTop || ty > canvas.scrollTop + canvas.clientHeight - 80) canvas.scrollTo({ top: ty - 80, behavior: 'smooth' }); });
}
function remove(id){ const i = items.findIndex(x => x.id === id); if (i < 0) return; checkpoint(); items.splice(i, 1); if (selected === id) selected = null; render(); }
function duplicate(id){ const x = items.find(i => i.id === id); if (x) add(x.name, x.code, { full: x.full, pos: x.full ? undefined : { x: x.x + 24, y: x.y + 24 } }); }
function toFront(id){ const i = items.findIndex(x => x.id === id); if (i < 0 || i === items.length - 1) return; checkpoint(); items.push(items.splice(i, 1)[0]); render(); }
function toBack(id){ const i = items.findIndex(x => x.id === id); if (i <= 0) return; checkpoint(); items.unshift(items.splice(i, 1)[0]); render(); }
function editWithAI(id){ const x = items.find(i => i.id === id); if (!x) return; select(id); window.dispatchEvent(new CustomEvent('oc:open-chat')); prefillPrompt(`Change "${x.name}": `); }
function scrollToItem(id){ const el = nodes.get(id); if (!el) return; canvas.scrollTo({ left: STAGE_PAD + el.offsetLeft * zoom - 80, top: STAGE_PAD + el.offsetTop * zoom - 80, behavior: 'smooth' }); }

/* ── Mouse: selection, dragging elements, panning the page ── */
let drag = null, pan = null, spaceDown = false;
addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input, textarea, [contenteditable]')) { if (!spaceDown) { spaceDown = true; canvas.classList.add('can-pan'); } e.preventDefault(); } });
addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; canvas.classList.remove('can-pan'); } });

board.addEventListener('pointerdown', e => {
  const el = e.target.closest('.node');
  if (e.button !== 0 || !el || spaceDown) return;
  const item = items.find(x => x.id === el.dataset.id); if (!item) return;
  e.stopPropagation(); closeCtx();
  select(item.id);
  drag = { el, item, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, moved: false, snapshot: JSON.stringify(items) };
  el.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true; drag.el.classList.add('dragging');
  const maxX = Math.max(0, page.w - drag.el.offsetWidth);
  drag.item.x = drag.item.full ? 0 : Math.min(maxX, snap(drag.ox + dx));
  drag.item.y = snap(drag.oy + dy);
  drag.el.style.left = drag.item.x + 'px'; drag.el.style.top = drag.item.y + 'px';
});
const endDrag = () => {
  if (!drag) return;
  drag.el.classList.remove('dragging');
  if (drag.moved) { history.push(drag.snapshot); persist(); layout(); }
  drag = null;
};
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);

// Panning: drag empty space, use the middle button, or hold Space
canvas.addEventListener('pointerdown', e => {
  if (drag || e.button === 2) return;
  if (e.button !== 0 && e.button !== 1) return;
  if (e.button === 1) e.preventDefault();
  closeCtx();
  pan = { sx: e.clientX, sy: e.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!pan) return;
  const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
  if (!pan.moved && Math.hypot(dx, dy) < 3) return;
  pan.moved = true; canvas.classList.add('panning');
  canvas.scrollLeft = pan.sl - dx; canvas.scrollTop = pan.st - dy;
});
const endPan = () => { if (!pan) return; if (!pan.moved) select(null); canvas.classList.remove('panning'); pan = null; };
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);
canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

/* ── Context menu (right click) ──────────────────────────── */
const ctx = $('ctxMenu');
let ctxEntries = [];
function openCtx(x, y, entries){
  ctxEntries = entries;
  ctx.innerHTML = entries.map((en, i) => en === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}"${en.danger ? ' class="danger"' : ''}><span>${en.label}</span>${en.key ? `<kbd>${en.key}</kbd>` : ''}</button>`).join('');
  ctx.classList.remove('hidden');
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  ctx.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeCtx(){ ctx.classList.add('hidden'); }
ctx.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeCtx(); ctxEntries[+b.dataset.i].run(); });
addEventListener('pointerdown', e => { if (!ctx.contains(e.target)) closeCtx(); }, true);
addEventListener('blur', closeCtx);
canvas.addEventListener('scroll', closeCtx);
function nodeMenu(id){
  return [
    { label: '✦ edit with ai', run: () => editWithAI(id) },
    { label: '‹/› code', run: () => edit(id) },
    { label: 'rename', run: () => startRename(id) },
    '-',
    { label: 'duplicate', key: 'Ctrl+D', run: () => duplicate(id) },
    { label: 'bring to front', run: () => toFront(id) },
    { label: 'send to back', run: () => toBack(id) },
    '-',
    { label: 'delete', key: 'Del', danger: true, run: () => remove(id) },
  ];
}
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const el = e.target.closest('.node');
  if (el) { select(el.dataset.id); openCtx(e.clientX, e.clientY, nodeMenu(el.dataset.id)); return; }
  openCtx(e.clientX, e.clientY, [
    { label: 'fit to screen', key: 'Ctrl+0', run: fitZoom },
    { label: 'add custom code', run: () => edit(null) },
    { label: 'open templates', run: openWelcome },
    '-',
    { label: 'clear page', danger: true, run: clearPage },
  ]);
});

// Account menu (click on the avatar in the header)
window.addEventListener('oc:account-menu', e => openCtx(e.detail.x, e.detail.y, [
  { label: escapeHTML(authUser?.email || 'account'), run: () => {} },
  '-',
  { label: 'sign out', danger: true, run: () => signOut() },
]));

/* ── Layers ──────────────────────────────────────────────── */
let renaming = null;
function renderLayers(){
  const list = [...items].reverse();
  $('layers').innerHTML = list.length ? list.map(x => `<div class="layer${x.id === selected ? ' active' : ''}" data-layer="${x.id}" title="${escapeHTML(x.name)}"><span class="layer-ic">${x.full ? '▤' : '▢'}</span>${renaming === x.id ? `<input class="layer-input" value="${escapeHTML(x.name)}" maxlength="80">` : `<span class="layer-name">${escapeHTML(x.name)}</span>`}<button data-layer-del title="Delete">×</button></div>`).join('') : '<div class="layers-empty">Nothing on the page yet</div>';
  const input = $('layers').querySelector('.layer-input');
  if (input) { input.focus(); input.select(); }
}
function startRename(id){ window.dispatchEvent(new CustomEvent('oc:show-view', { detail: 'layers' })); renaming = id; renderLayers(); }
function commitRename(value){ const x = items.find(i => i.id === renaming); renaming = null; if (x && value.trim() && value.trim() !== x.name) { checkpoint(); x.name = value.trim().slice(0, 80); } render(); }
$('layers').addEventListener('click', e => {
  const row = e.target.closest('[data-layer]'); if (!row || e.target.closest('.layer-input')) return;
  if (e.target.closest('[data-layer-del]')) { remove(row.dataset.layer); return; }
  select(row.dataset.layer); scrollToItem(row.dataset.layer);
});
$('layers').addEventListener('dblclick', e => { const row = e.target.closest('[data-layer]'); if (row) startRename(row.dataset.layer); });
$('layers').addEventListener('keydown', e => { if (!e.target.classList.contains('layer-input')) return; if (e.key === 'Enter') commitRename(e.target.value); if (e.key === 'Escape') { renaming = null; renderLayers(); } });
$('layers').addEventListener('focusout', e => { if (e.target.classList.contains('layer-input') && renaming) commitRename(e.target.value); });
$('layers').addEventListener('contextmenu', e => { const row = e.target.closest('[data-layer]'); if (!row) return; e.preventDefault(); select(row.dataset.layer); openCtx(e.clientX, e.clientY, nodeMenu(row.dataset.layer)); });

/* ── Keyboard shortcuts ──────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCtx();
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal:not(.hidden)') || document.querySelector('.wl')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); $('undo').click(); return; }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom + .1); return; }
  if (mod && e.key === '-') { e.preventDefault(); setZoom(zoom - .1); return; }
  if (mod && e.key === '0') { e.preventDefault(); fitZoom(); return; }
  if (!selected) return;
  const item = items.find(x => x.id === selected); if (!item) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(item.id); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(item.id); }
  else if (e.key === 'F2') { e.preventDefault(); startRename(item.id); }
  else if (e.key === 'Escape') select(null);
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault(); checkpoint();
    const step = e.shiftKey ? GRID * 4 : GRID;
    if (e.key === 'ArrowLeft' && !item.full) item.x = Math.max(0, item.x - step);
    if (e.key === 'ArrowRight' && !item.full) item.x += step;
    if (e.key === 'ArrowUp') item.y = Math.max(0, item.y - step);
    if (e.key === 'ArrowDown') item.y += step;
    render();
  }
});

/* ── Catalog ─────────────────────────────────────────────── */
// Sections are a collapsible list; only open sections render their previews.
// While searching, every section with a match is shown expanded.
const openCats = new Set(store.get('oc-cats-open', [CATEGORIES[0].id]));
const catChevron = '<svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const catIcon = c => `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${c.icon || ''}</svg>`;
const card = p => `<button class="component${p.full ? ' wide' : ''}" data-add="${p.index}" title="Add: ${escapeHTML(p.name)}"><span class="component-preview"><iframe title="${escapeHTML(p.name)}" sandbox tabindex="-1" data-preset="${p.index}"></iframe></span><span class="component-info"><span>${escapeHTML(p.name)}</span><span class="component-plus">+</span></span></button>`;
function renderLibrary(){
  const query = $('catalogSearch').value.trim().toLocaleLowerCase();
  const indexed = presets.map((p, i) => ({ ...p, index: i }));
  const known = new Set(CATEGORIES.map(c => c.id));
  const cats = [...CATEGORIES, ...[...new Set(indexed.map(p => p.category))].filter(c => !known.has(c)).map(id => ({ id }))];
  const html = cats.map(c => {
    const list = indexed.filter(p => p.category === c.id && (p.name + ' ' + p.category).toLocaleLowerCase().includes(query));
    if (!list.length) return '';
    const open = query ? true : openCats.has(c.id);
    return `<section class="cat${open ? ' open' : ''}"><button class="cat-head" data-cat="${escapeHTML(c.id)}" aria-expanded="${open}">${catChevron}${catIcon(c)}<span class="cat-name">${escapeHTML(c.id)}</span><span class="cat-count">${list.length}</span></button>${open ? `<div class="cat-body">${list.map(card).join('')}</div>` : ''}</section>`;
  }).join('');
  $('library').innerHTML = html || '<div class="catalog-empty">nothing found</div>';
  document.querySelectorAll('[data-preset]').forEach(f => { const p = presets[+f.dataset.preset]; f.srcdoc = previewDoc(p.code, p.full); });
  scaleWidePreviews();
}
// Sections render at 1280px wide and scale down to the card size
function scaleWidePreviews(){ document.querySelectorAll('.component.wide .component-preview').forEach(pv => { const f = pv.querySelector('iframe'); f.style.transform = `scale(${pv.clientWidth / 1280})`; }); }
addEventListener('resize', scaleWidePreviews);
$('catalogSearch').oninput = renderLibrary;
renderLibrary();
$('library').onclick = e => {
  const h = e.target.closest('[data-cat]');
  if (h) {
    if ($('catalogSearch').value.trim()) return;
    const id = h.dataset.cat; openCats.has(id) ? openCats.delete(id) : openCats.add(id);
    store.set('oc-cats-open', [...openCats]); renderLibrary();
    if (openCats.has(id)) $('library').querySelector(`[data-cat="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  const b = e.target.closest('[data-add]'); if (b) { const p = presets[+b.dataset.add]; add(p.name, p.code, { full: p.full }); } };

/* ── Modals and code ─────────────────────────────────────── */
function showModal(id){ $(id).classList.remove('hidden'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
document.querySelectorAll('.modal').forEach(m => m.onclick = e => { if (e.target === m) m.classList.add('hidden'); });
$('settingsButton').onclick = () => openSettings();
function edit(id){ editing = id; const x = items.find(i => i.id === id); $('codeTitle').textContent = x ? 'element code' : 'add component'; $('codeName').value = x?.name || ''; $('codeInput').value = x?.code || ''; showModal('codeModal'); }
$('addCode').onclick = () => edit(null);
$('saveCode').onclick = () => {
  const name = $('codeName').value.trim(), code = $('codeInput').value.trim(); if (!name || !code) return;
  if (editing) { const x = items.find(i => i.id === editing); if (x) { checkpoint(); x.name = name; x.code = code; selected = x.id; render(); } }
  else add(name, code);
  $('codeModal').classList.add('hidden');
};
$('copyCode').onclick = async () => { try { await navigator.clipboard.writeText($('codeInput').value); $('copyCode').textContent = 'copied'; setTimeout(() => $('copyCode').textContent = 'copy', 1500); } catch { $('codeInput').select(); document.execCommand('copy'); } };
$('undo').onclick = () => { if (history.length) { items = JSON.parse(history.pop()); if (!items.some(x => x.id === selected)) selected = null; render(); } };

// Export: a page with the same size and background, elements in place
$('export').onclick = () => {
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  const H = Math.max(page.h, contentBottom() + 48);
  const body = items.map(it => it.full
    ? `<div style="position:absolute;left:0;top:${it.y}px;width:${page.w}px">\n${it.code}\n</div>`
    : `<div style="position:absolute;left:${it.x}px;top:${it.y}px;padding:${PAD}px">\n${it.code}\n</div>`).join('\n');
  const title = escapeHTML(nameEl.textContent.trim() || 'My interface');
  const output = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${page.w}"><title>${title}</title><style>html,body{margin:0}body{min-height:100vh;background:${page.bg};background-attachment:fixed;color:#eee;font-family:system-ui}.oc-page{position:relative;width:${page.w}px;height:${H}px;margin:0 auto}</style></head><body><div class="oc-page">\n${body}\n</div></body></html>`;
  const file = (nameEl.textContent.trim() || 'interface').replace(/[\\/:*?"<>|\s]+/g, '-') + '.html';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([output], { type: 'text/html' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setState('saved: ' + file, 'ok');
};

// Status bar
let stateTimer;
function setState(text, kind = ''){
  const el = $('sbState'); el.className = 'sb-item sb-state ' + kind; el.innerHTML = `<i></i>${escapeHTML(text)}`;
  clearTimeout(stateTimer);
  if (kind !== 'busy') stateTimer = setTimeout(() => { el.className = 'sb-item sb-state'; el.innerHTML = '<i></i>ready'; }, 4000);
}

/* ── AI providers, keys and model selection ──────────────── */
const logoFiles = import.meta.glob('./src/logos/*.svg', { query: '?raw', import: 'default', eager: true });
const logo = name => logoFiles[`./src/logos/${name}.svg`] || '';
// Pick the model logo from its name (Llama → Meta, Qwen → Qwen…), otherwise use the provider logo
const VENDOR_LOGOS = [[/llama|meta-/i, 'meta-color'], [/gemma/i, 'gemma-color'], [/gemini|google/i, 'gemini-color'], [/qwen|qwq/i, 'qwen-color'], [/mistral|mixtral|codestral|devstral|magistral|ministral|pixtral/i, 'mistral-color'], [/deepseek/i, 'deepseek-color'], [/claude/i, 'claude-color'], [/gpt|^o\d|openai|chatgpt/i, 'openai'], [/grok|x-ai/i, 'xai'], [/kimi|moonshot/i, 'kimi-color'], [/nemotron|nvidia/i, 'nvidia-color'], [/glm|z-ai|zhipu/i, 'zai'], [/minimax/i, 'minimax-color'], [/phi-|microsoft/i, 'microsoft-color'], [/cohere|command|north/i, 'cohere-color'], [/hermes|nous/i, 'nousresearch'], [/liquid|lfm/i, 'liquid'], [/arcee/i, 'arcee-color']];
function modelLogo(m){
  const hit = VENDOR_LOGOS.find(([re]) => re.test(`${m.id} ${m.name} ${m.vendor || ''}`));
  const svg = logo(hit ? hit[1] : byId(m.pid)?.logo);
  return svg ? `<span class="model-logo">${svg}</span>` : `<span class="model-logo letter">${escapeHTML((m.vendor || m.name || '?')[0].toUpperCase())}</span>`;
}
const providerLogo = p => `<span class="model-logo">${logo(p.logo)}</span>`;
const fmtUsd = v => '$' + (v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(2) : +v.toFixed(3));
const fmtPrice = pr => `${fmtUsd(pr[0])} · ${fmtUsd(pr[1])}`;
const fmtCtx = n => !n ? '' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1e3) + 'K';

// Keys live until the tab is closed by default; the "remember" checkbox stores them in localStorage
let remember = store.get('oc-remember-keys', false);
let keys = {};
try { keys = JSON.parse((remember ? localStorage : sessionStorage).getItem('oc-keys') || '{}') || {}; } catch {}
function saveKeys(){ try { const s = JSON.stringify(keys); (remember ? localStorage : sessionStorage).setItem('oc-keys', s); (remember ? sessionStorage : localStorage).removeItem('oc-keys'); store.set('oc-remember-keys', remember); } catch {} }

const AUTO = { id: 'openrouter/free', name: 'Auto', vendor: 'OpenRouter', note: 'best available model' };
const modelsBy = {}, modelErr = {}, loading = {};
let currentModel = store.get('form-model', 'openrouter::openrouter/free');
if (!currentModel.includes('::')) currentModel = 'openrouter::' + currentModel;
const providerModels = p => (p.id === 'openrouter' ? [AUTO, ...(modelsBy.openrouter || [])] : (modelsBy[p.id] || [])).map(m => ({ ...m, pid: p.id, key: `${p.id}::${m.id}` }));
const allModels = () => PROVIDERS.flatMap(providerModels);
function current(){
  const found = allModels().find(m => m.key === currentModel);
  if (found) return found;
  const [pid, ...rest] = currentModel.split('::');
  return { pid, id: rest.join('::'), name: rest.join('::'), key: currentModel };
}
export const canSend = () => !!keys[current().pid];

const picker = document.createElement('div');
picker.className = 'model-picker';
picker.innerHTML = `<button type="button" class="model-trigger" aria-haspopup="listbox" aria-expanded="false"></button><div class="model-menu hidden" role="listbox"><div class="model-search"><span>/</span><input placeholder="find a model" aria-label="Find a model"></div><div class="model-list"></div><button type="button" class="model-add">+ connect providers</button></div>`;
$('model').classList.add('hidden');
$('model').after(picker);
const trigger = picker.querySelector('.model-trigger'), menu = picker.querySelector('.model-menu'), mSearch = picker.querySelector('input');
const chevron = '<svg class="model-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
function renderPicker(){
  const m = current(), p = byId(m.pid);
  trigger.innerHTML = `${modelLogo(m)}<span class="model-trigger-name">${escapeHTML(m.name)}</span>${chevron}`;
  $('sbModel').textContent = `${p?.name || m.pid} · ${m.name}`;
  const q = mSearch.value.trim().toLocaleLowerCase();
  const groups = PROVIDERS.filter(pr => keys[pr.id] || pr.publicModels).map(pr => {
    const list = providerModels(pr).filter(x => `${x.name} ${x.vendor || ''} ${x.id} ${pr.name}`.toLocaleLowerCase().includes(q));
    if (!list.length && q) return '';
    const status = !keys[pr.id] ? ' · key required' : loading[pr.id] ? ' · loading…' : modelErr[pr.id] ? ' · error' : '';
    const firstPaid = list.find(x => x.paid);
    return `<div class="model-group">${providerLogo(pr)}${escapeHTML(pr.name)}<span>${status}</span></div>` + list.map(x => (x === firstPaid ? '<div class="model-sub">pay per use · $ per 1M tokens in · out</div>' : '') + `<button type="button" role="option" class="model-option${x.key === currentModel ? ' active' : ''}" data-model="${escapeHTML(x.key)}" aria-selected="${x.key === currentModel}">${modelLogo(x)}<span class="model-text"><span class="model-title">${escapeHTML(x.name)}</span><span class="model-meta">${escapeHTML(x.vendor || pr.name)}${x.ctx ? ' · ' + fmtCtx(x.ctx) + ' context' : ''}${x.note ? ' · ' + escapeHTML(x.note) : ''}</span></span>${x.price ? `<span class="model-price" title="price per 1M tokens: input · output">${fmtPrice(x.price)}</span>` : ''}${x.key === currentModel ? '<span class="model-check">✓</span>' : ''}</button>`).join('');
  }).join('');
  picker.querySelector('.model-list').innerHTML = groups || '<div class="model-empty">nothing found</div>';
  const connected = PROVIDERS.filter(pr => keys[pr.id]).length;
  picker.querySelector('.model-add').textContent = `+ connect providers (${connected} of ${PROVIDERS.length})`;
}
function toggleMenu(open = menu.classList.contains('hidden')){
  menu.classList.toggle('hidden', !open); trigger.setAttribute('aria-expanded', open);
  if (open) { mSearch.value = ''; renderPicker(); mSearch.focus(); picker.querySelector('.model-option.active')?.scrollIntoView({ block: 'nearest' }); }
}
trigger.onclick = () => toggleMenu();
mSearch.oninput = renderPicker;
mSearch.onkeydown = e => { if (e.key === 'Escape') { toggleMenu(false); trigger.focus(); } if (e.key === 'Enter') picker.querySelector('.model-option')?.click(); };
picker.querySelector('.model-list').onclick = e => {
  const o = e.target.closest('[data-model]'); if (!o) return;
  currentModel = o.dataset.model; store.set('form-model', currentModel);
  toggleMenu(false); renderPicker();
};
picker.querySelector('.model-add').onclick = () => { toggleMenu(false); openSettings(); };
document.addEventListener('pointerdown', e => { if (!picker.contains(e.target)) toggleMenu(false); });

async function loadProvider(p){
  if (!keys[p.id] && !p.publicModels) { delete modelsBy[p.id]; delete modelErr[p.id]; renderPicker(); renderProviders(); return; }
  loading[p.id] = true; delete modelErr[p.id]; renderProviders(); renderPicker();
  try { modelsBy[p.id] = await listModels(p, keys[p.id]); }
  catch (e) { modelErr[p.id] = e.message; delete modelsBy[p.id]; }
  finally { loading[p.id] = false; autoPick(); renderProviders(); renderPicker(); }
}
// If the selected model has no key, fall back to the first model of a connected provider
function autoPick(){
  if (keys[current().pid]) return;
  const pr = PROVIDERS.find(x => keys[x.id] && providerModels(x).length);
  if (pr) { currentModel = providerModels(pr)[0].key; store.set('form-model', currentModel); }
}
function loadModels(){ PROVIDERS.forEach(loadProvider); }

// "AI providers" dialog: a key for each service and its connection status
function renderProviders(){
  const box = $('providers'); if (!box) return;
  const focused = document.activeElement?.dataset?.key;
  box.innerHTML = PROVIDERS.map(p => {
    const k = keys[p.id] || '';
    const st = !k ? '' : loading[p.id] ? '<span class="prov-st">checking…</span>' : modelErr[p.id] ? `<span class="prov-st err" title="${escapeHTML(modelErr[p.id])}">✗ ${escapeHTML(String(modelErr[p.id]).slice(0, 60))}</span>` : `<span class="prov-st ok">✓ ${(modelsBy[p.id] || []).length} models</span>`;
    return `<div class="prov${k ? ' on' : ''}">${providerLogo(p)}<div class="prov-info"><div class="prov-name">${escapeHTML(p.name)}</div><div class="prov-note">${escapeHTML(p.note)} · <a href="${p.keyUrl}" target="_blank" rel="noreferrer">get a key ↗</a></div></div><input type="password" data-key="${p.id}" value="${escapeHTML(k)}" placeholder="${escapeHTML(p.hint || 'API key')}" autocomplete="off" spellcheck="false">${st}</div>`;
  }).join('');
  if (focused) { const el = box.querySelector(`[data-key="${focused}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}
function openSettings(){ $('rememberKeys').checked = remember; renderProviders(); showModal('settings'); }
$('providers').addEventListener('change', e => {
  const pid = e.target.dataset.key; if (!pid) return;
  const v = e.target.value.trim();
  if (v) keys[pid] = v; else delete keys[pid];
  saveKeys(); loadProvider(byId(pid));
});
$('rememberKeys').onchange = e => { remember = e.target.checked; saveKeys(); };
$('forgetKeys').onclick = () => { keys = {}; saveKeys(); PROVIDERS.forEach(p => { if (!p.publicModels) delete modelsBy[p.id]; }); renderProviders(); renderPicker(); };
renderPicker();

/* ── AI chat ─────────────────────────────────────────────── */
function message(text, role){ const node = document.createElement('div'); node.className = 'message ' + role; node.textContent = text; $('messages').append(node); $('messages').scrollTop = $('messages').scrollHeight; return node; }

// "Thinking" indicator: the pixel block of the logo blinks like a terminal cursor
function thinking(){
  const node = document.createElement('div');
  node.className = 'message assistant thinking';
  node.innerHTML = `<span class="oc-logo thinking-logo" aria-hidden="true">${logoSvg}</span><span class="thinking-text">thinking</span><span class="thinking-time">0s</span>`;
  $('messages').append(node); $('messages').scrollTop = $('messages').scrollHeight;
  const steps = ['thinking', 'planning layout', 'choosing styles', 'assembling'];
  const t0 = Date.now();
  setState('ai is thinking…', 'busy');
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    node.querySelector('.thinking-time').textContent = s + 's';
    node.querySelector('.thinking-text').textContent = steps[Math.min(steps.length - 1, Math.floor(s / 4))];
  }, 500);
  return () => { clearInterval(timer); node.remove(); };
}

// Models sometimes double-escape code (\\n instead of a newline) or wrap the JSON in text
function parseAnswer(content){
  let text = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a > 0 || (b >= 0 && b < text.length - 1)) text = text.slice(a, b + 1);
  const result = JSON.parse(text);
  if (typeof result.code === 'string') {
    let code = result.code;
    for (let i = 0; i < 2 && /\\[nt"]/.test(code) && !/\n/.test(code.replace(/\\n/g, '')); i++) {
      code = code.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    code = code.replace(/>\s*(\\n)+\s*</g, '>\n<').replace(/^(\s*\\n)+|(\\n\s*)+$/g, '');
    result.code = code;
  }
  return result;
}

$('send').onclick = async () => {
  const request = $('prompt').value.trim(); if (!request) return;
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!p) { $('chatStatus').textContent = 'Pick a model from the list below the input.'; return; }
  if (!key) { $('chatStatus').textContent = `Add a ${p.name} key to use this model.`; openSettings(); return; }
  const target = items.find(x => x.id === selected);
  message(request, 'user'); $('send').disabled = true; $('chatStatus').textContent = '';
  const stop = thinking();
  const system = `You are openconstructor AI, you build interfaces. Return ONLY JSON, no markdown and no explanations: {"action":"add|update","full":true|false,"name":"short element name","code":"HTML and CSS","reply":"short reply to the user"}.
Rules:
- If the user asks to change the selected element, use action "update", otherwise "add".
- Page: ${page.w}×${page.h}px, ${page.bg === '#fafafa' ? 'light' : 'dark'} background. If the user asks for a website, landing page, page or section, set "full": true and build a complete full-width layout (header, hero, content blocks, footer) with a root element of width:100%. For a standalone component (button, card, form), set "full": false, width up to 360px.
- Self-contained HTML and CSS only: one <style> plus markup. No JavaScript, external links, images or fonts. Icons as inline SVG.
- Do not style html or body; use unique class names with a shared prefix.
- Clean, modern design: spacing, heading hierarchy, rounded corners, shadows, hover states. Respect prefers-reduced-motion for animations.
- Write all UI text in the components in the same language as the user's request.
- In the code field, encode regular line breaks as \\n exactly once; do not double-escape.`;
  const user = 'Selected element: ' + JSON.stringify(target ? { name: target.name, code: target.code } : null) + '\nOther elements: ' + JSON.stringify(items.map(x => ({ name: x.name }))) + '\nRequest: ' + request;
  try {
    const content = await chat(p, key, m.id, system, user);
    if (typeof content !== 'string' || !content.trim()) throw Error('Empty model response');
    const result = parseAnswer(content);
    if (typeof result.code !== 'string' || !result.code.trim() || result.code.length > 200000) throw Error('Invalid code');
    const full = result.full === true || result.full === 'true';
    if (result.action === 'update' && target) {
      const item = items.find(x => x.id === target.id); if (!item) throw Error('The element was deleted during the request');
      checkpoint(); item.name = String(result.name || item.name).slice(0, 80); item.code = result.code;
      if (full) { item.full = true; item.x = 0; }
      selected = item.id; render();
    } else add(String(result.name || 'New element').slice(0, 80), result.code, { full });
    stop(); setState('element ready', 'ok');
    message(String(result.reply || 'Done. The element is on the page.'), 'assistant'); $('prompt').value = ''; window.dispatchEvent(new CustomEvent('oc:generated'));
  } catch (e) { stop(); setState('ai error', 'error'); $('chatStatus').textContent = 'Error: ' + e.message; message('Could not apply the response. Try again or pick another model.', 'assistant'); }
  finally { $('send').disabled = false; }
};
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('send').click(); } });

/* ── API for the welcome screen and menus ────────────────── */
export const stats = { presets: presets.length };
export function loadTemplate(tpl){
  checkpoint();
  page = { ...page, ...tpl.page }; store.set('oc-page', page);
  $('pageSize').value = `${page.w}x${page.h}`; syncSwatches();
  items = tpl.items.map(i => ({ id: crypto.randomUUID(), ...i }));
  selected = null; render(); requestAnimationFrame(fitZoom);
  message(`Opened the "${tpl.name}" template. Right-click any block → "Edit with AI", or select it and describe what to change.`, 'assistant');
}
export function clearPage(){ if (!items.length) return; checkpoint(); items = []; selected = null; render(); setState('page cleared · Ctrl+Z to undo'); }
export function prefillPrompt(text){ window.dispatchEvent(new CustomEvent('oc:prompt', { detail: text })); if (!canSend()) { $('chatStatus').textContent = 'Connect an AI provider to start: ⚙ in the bottom-left.'; } }
function openWelcome(){ window.dispatchEvent(new CustomEvent('oc:welcome')); }
$('homeBtn').addEventListener('click', openWelcome);
document.querySelector('.tb-menu').addEventListener('click', e => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (cmd === 'home') openWelcome();
  if (cmd === 'addCode') edit(null);
  if (cmd === 'clear') clearPage();
});
$('canvasEmpty').addEventListener('click', e => { const b = e.target.closest('[data-empty]'); if (!b) return; if (b.dataset.empty === 'welcome') openWelcome(); else { window.dispatchEvent(new CustomEvent('oc:open-chat')); prefillPrompt(b.dataset.empty); } });

render();
requestAnimationFrame(fitZoom);
loadModels();
