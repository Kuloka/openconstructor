import {presets} from './presets.js';
import {CATEGORIES} from './categories.js';
import { TARGETS, snapshot, toRobloxLuau, toRobloxModel, toLoveLua, toReact, toVue, toSvelte } from './exporters.js';
import { PRESETS as BG_PRESETS, DEFAULT_SPEC as BG_DEFAULT, toCSS as bgCSS, luminance as bgLum, mountBackgroundEditor } from './background.js';
import logoSvg from './src/logo.svg?raw';
import { PROVIDERS, byId, listModels, chat, freeQuota } from './providers.js';
import { signOut, user as authUser, openAuth } from './auth.js';
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
function persist(){ store.set('form-canvas-v3', items); window.dispatchEvent(new CustomEvent('oc:changed')); }

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
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function nodeDoc(item){
  const root = item.full ? `width:${page.w}px;padding:0` : `width:max-content;max-width:${page.w - 2 * PAD}px;padding:${PAD}px`;
  // <base target=_blank> + no allow-popups in the sandbox = links never navigate the canvas frame away
  return `<!doctype html><html><head>${CSP}<base target="_blank"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;background:transparent;color:#eee;font-family:system-ui;overflow:hidden}button{white-space:nowrap}#__root{display:inline-block;box-sizing:border-box;${root}}</style>${page.themeCss ? `<style id="__theme">${page.themeCss}</style>` : ''}</head><body><div id="__root">${item.code}</div></body></html>`;
}

// Animated components (typewriter, expanding bars…) change size while they play, so the frame
// is sized from the static layout (animations off) and then only ever grows as the animation runs.
function measure(frame){
  try {
    const doc = frame.contentDocument, root = doc?.getElementById('__root'); if (!root) return;
    const size = () => { const r = root.getBoundingClientRect(); return [Math.max(r.width, root.scrollWidth), Math.max(r.height, root.scrollHeight)]; };
    const freeze = doc.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    doc.head.append(freeze); const still = size(); freeze.remove();
    // Scrub every running animation through its cycle and keep the largest size seen
    let now = size();
    const anims = doc.getAnimations ? doc.getAnimations() : [];
    if (anims.length) {
      const saved = anims.map(a => a.currentTime);
      for (const f of [0, .25, .5, .75, .999]) {
        anims.forEach(a => { const t = a.effect?.getComputedTiming(); if (t && Number.isFinite(t.duration)) a.currentTime = (t.delay || 0) + t.duration * f; });
        const s = size(); now = [Math.max(now[0], s[0]), Math.max(now[1], s[1])];
      }
      anims.forEach((a, k) => { a.currentTime = saved[k]; });
    }
    frame._max = [Math.max(still[0], now[0], frame._max?.[0] || 0), Math.max(still[1], now[1], frame._max?.[1] || 0)];
    frame.style.width = Math.ceil(Math.max(frame._max[0], 48)) + 'px';
    // cap height: AI code using 100vh would otherwise grow with the frame forever
    frame._max[1] = Math.min(frame._max[1], 5000);
    frame.style.height = Math.ceil(Math.max(frame._max[1], 32)) + 'px';
    layout();
    if (!frame._ro || frame._ro.root !== root) {
      frame._ro?.disconnect();
      frame._ro = new ResizeObserver(() => measure(frame)); frame._ro.root = root; frame._ro.observe(root);
    }
  } catch {}
}
function createNode(item){
  const el = document.createElement('div');
  el.className = 'node'; el.dataset.id = item.id;
  el.innerHTML = `<span class="node-tag"></span><iframe sandbox="allow-same-origin" tabindex="-1" referrerpolicy="no-referrer"></iframe>`;
  const frame = el.querySelector('iframe');
  frame.style.width = page.w + 'px';
  frame.addEventListener('load', () => { frame._max = null; measure(frame); setTimeout(() => measure(frame), 300); });
  el.classList.add('entering'); el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
  board.append(el); nodes.set(item.id, el); return el;
}
function render(){
  persist();
  $('itemCount').textContent = items.length + (items.length === 1 ? ' element' : ' elements');
  // removed elements fade out instead of vanishing
  for (const [id, el] of nodes) if (!items.some(x => x.id === id)) {
    nodes.delete(id); el.style.pointerEvents = 'none';
    const a = el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: reduceMotion() ? 0 : 160, easing: 'ease-in' });
    a.onfinish = () => el.remove();
  }
  items.forEach((item, i) => {
    const el = nodes.get(item.id) || createNode(item);
    const frame = el.querySelector('iframe');
    const key = item.code + '|' + (item.full ? page.w : 0);
    if (el._key !== key) { el._key = key; frame.title = item.name; frame.srcdoc = nodeDoc(item); }
    el.querySelector('.node-tag').textContent = item.name;
    el.style.left = item.x + 'px'; el.style.top = item.y + 'px'; el.style.zIndex = i + 1;
    el.classList.toggle('selected', picked.has(item.id) || selected === item.id);
    el.classList.toggle('full', !!item.full);
  });
  $('canvasEmpty').classList.toggle('hidden', items.length > 0);
  renderLayers();
  layout();
}
function pageHeightNow(){ const b = contentBottom(); return b > page.h ? b + 48 : page.h; }
function contentBottom(){ let h = 0; for (const el of nodes.values()) h = Math.max(h, el.offsetTop + el.offsetHeight); return h; }
/* ── Stack layout: blocks flow top to bottom (order = vertical position), components are centered.
   The same order drives a responsive export, so the page adapts to phones and tablets. ── */
const STACK_GAP = 24;
const isStack = () => page.layout === 'stack';
function restack(){
  if (!isStack()) return;
  const order = [...items].sort((a, b) => a.y - b.y);
  let y = 0, prevFull = true;
  for (const it of order) {
    const el = nodes.get(it.id); const w = el?.offsetWidth || 0, h = el?.offsetHeight || 0;
    if (!it.full || !prevFull) y += y ? STACK_GAP : 0;
    it.x = it.full ? 0 : Math.max(0, Math.round((page.w - w) / 2));
    it.y = y;
    if (el && !el.classList.contains('dragging')) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    y += h; prevFull = !!it.full;
  }
}
function setLayoutMode(mode){
  page = { ...page, layout: mode }; store.set('oc-page', page);
  document.querySelectorAll('[data-layout]').forEach(b => b.setAttribute('aria-checked', b.dataset.layout === mode));
  if (mode === 'stack') { checkpoint(); restack(); persist(); setState('stack layout: drag blocks up or down to reorder · the export adapts to any screen', 'ok'); }
  layout();
}
document.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => setLayoutMode(b.dataset.layout));
document.querySelectorAll('[data-layout]').forEach(b => b.setAttribute('aria-checked', b.dataset.layout === (page.layout || 'free')));

// The page grows downward when elements extend past its height, like a real web page
function layout(){
  restack();
  // the page only grows (with a 48px margin) when content really goes past its height — exact sizes stay exact
  const h = pageHeightNow();
  board.style.width = page.w + 'px'; board.style.height = h + 'px';
  board.style.background = page.bg;
  board.style.transform = `scale(${zoom})`;
  board.style.setProperty('--inv', String(1 / zoom));
  board.classList.toggle('light', isLightPage());
  stage.style.width = page.w * zoom + STAGE_PAD * 2 + 'px';
  stage.style.height = h * zoom + STAGE_PAD * 2 + 'px';
  if (!$('boardLabel').classList.contains('editing')) $('boardLabel').textContent = `page · ${page.w} × ${Math.round(h)}`;
  try { placeHandles(h); drawZones(); } catch {} // handles/zones are created a bit later during startup
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
/* ── Page size: presets, typed size, and drag handles on the artboard edges ── */
const PAGE_MIN = { w: 240, h: 160 }, PAGE_MAX = 4096;
// Exact sizes (presets, typed values) stay exact; dragging an edge snaps that side to the 8px grid.
const clampSize = (v, min, step = 1) => Math.max(min, Math.min(PAGE_MAX, Math.round(v / step) * step));
// keep the select in sync: a preset if one matches, otherwise a "custom W×H" entry
function syncPageSize(){
  const sel = $('pageSize'), want = `${page.w}x${page.h}`;
  const hit = [...sel.options].find(o => o.value === want);
  const custom = $('pageCustom');
  custom.hidden = !!hit; custom.textContent = `custom ${page.w}×${page.h}`;
  sel.value = hit ? want : 'custom';
}
function setPageSize(w, h, { refit = false } = {}){
  page = { ...page, w: clampSize(w, PAGE_MIN.w), h: clampSize(h, PAGE_MIN.h) }; store.set('oc-page', page);
  items.forEach(it => { if (it.full) it.x = 0; else it.x = Math.min(it.x, Math.max(0, page.w - (nodes.get(it.id)?.offsetWidth || 0))); });
  syncPageSize(); render(); if (refit) fitZoom();
}
syncPageSize();
$('pageSize').onchange = () => { const v = $('pageSize').value; if (v === 'custom') return editPageSize(); const [w, h] = v.split('x').map(Number); setPageSize(w, h, { refit: true }); };

// Click the "page · W × H" label to type an exact size
function editPageSize(){
  const label = $('boardLabel'); if (label.querySelector('input')) return;
  label.classList.add('editing');
  label.innerHTML = `page · <input type="number" min="${PAGE_MIN.w}" max="${PAGE_MAX}" step="1" value="${page.w}" aria-label="Width"> × <input type="number" min="${PAGE_MIN.h}" max="${PAGE_MAX}" step="1" value="${page.h}" aria-label="Height"> <button class="btn mini" type="button">ok</button>`;
  const [wi, hi] = label.querySelectorAll('input');
  const done = apply => { if (!label.classList.contains('editing')) return; label.classList.remove('editing'); if (apply) { checkpoint(); setPageSize(+wi.value || page.w, +hi.value || page.h); } else layout(); };
  label.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); };
  label.querySelector('button').onclick = () => done(true);
  label.addEventListener('focusout', e => { if (!label.contains(e.relatedTarget)) done(true); });
  wi.focus(); wi.select();
}
// pointerdown must not reach the canvas, otherwise panning captures the pointer and the click never fires
$('boardLabel').addEventListener('pointerdown', e => e.stopPropagation());
$('boardLabel').addEventListener('click', e => { if (!e.target.closest('input, button')) editPageSize(); });
$('boardLabel').title = 'Click to type an exact page size · or drag the page edges';

// Drag handles on all four edges and corners. Dragging the left/top edge grows the page on that side:
// elements keep their place on screen (their coordinates shift) and the view scrolls to compensate.
// Shift on a corner keeps the aspect ratio.
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSORS = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' };
const handles = DIRS.map(dir => { const h = document.createElement('div'); h.className = 'page-handle ' + dir + (dir.length === 2 ? ' corner' : ''); h.dataset.dir = dir; h.style.cursor = CURSORS[dir] + '-resize'; h.title = 'Drag to resize the page (Shift keeps proportions)'; stage.append(h); return h; });
const sizeTip = Object.assign(document.createElement('div'), { className: 'page-size-tip hidden' }); stage.append(sizeTip);
let resizing = null;
handles.forEach(h => h.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  resizing = { dir: h.dataset.dir, sx: e.clientX, sy: e.clientY, w: page.w, h: page.h, before: JSON.stringify(items),
    pos: new Map(items.map(it => [it.id, { x: it.x, y: it.y }])), scrollX: canvas.scrollLeft, scrollY: canvas.scrollTop };
  h.setPointerCapture(e.pointerId); canvas.classList.add('resizing-page'); canvas.dataset.resizeCursor = CURSORS[h.dataset.dir];
}));
addEventListener('pointermove', e => {
  if (!resizing) return;
  const r = resizing, d = r.dir, dx = (e.clientX - r.sx) / zoom, dy = (e.clientY - r.sy) / zoom;
  let w = r.w + (d.includes('e') ? dx : d.includes('w') ? -dx : 0);
  let h = r.h + (d.includes('s') ? dy : d.includes('n') ? -dy : 0);
  if (e.shiftKey && d.length === 2) h = w * r.h / r.w;
  w = clampSize(w, PAGE_MIN.w, d.includes("e") || d.includes("w") ? GRID : 1); h = clampSize(h, PAGE_MIN.h, d.includes("n") || d.includes("s") ? GRID : 1);
  if (w === page.w && h === page.h) return;
  page = { ...page, w, h };
  // growing on the left/top: move every element by the same amount so it stays put relative to the content
  const ox = d.includes('w') ? w - r.w : 0, oy = d.includes('n') ? h - r.h : 0;
  for (const it of items) {
    const p0 = r.pos.get(it.id); if (!p0) continue;
    it.x = it.full ? 0 : Math.max(0, p0.x + ox); it.y = Math.max(0, p0.y + oy);
    const el = nodes.get(it.id); if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    if (it.full) { const f = el?.querySelector('iframe'); if (f) f.style.width = w + 'px'; }
  }
  layout();
  if (ox || oy) { canvas.scrollLeft = r.scrollX + ox * zoom; canvas.scrollTop = r.scrollY + oy * zoom; }
  sizeTip.textContent = `${w} × ${h}`; sizeTip.classList.remove('hidden');
});
addEventListener('pointerup', () => {
  if (!resizing) return;
  history.push(resizing.before); resizing = null;
  canvas.classList.remove('resizing-page'); sizeTip.classList.add('hidden');
  setPageSize(page.w, page.h);
});
function placeHandles(h){
  const L = STAGE_PAD, T = STAGE_PAD, W = page.w * zoom, H = h * zoom, E = 4, C = 7;
  const pos = {
    n: `left:${L}px;top:${T - E}px;width:${W}px`, s: `left:${L}px;top:${T + H - E}px;width:${W}px`,
    w: `left:${L - E}px;top:${T}px;height:${H}px`, e: `left:${L + W - E}px;top:${T}px;height:${H}px`,
    nw: `left:${L - C}px;top:${T - C}px`, ne: `left:${L + W - C}px;top:${T - C}px`,
    sw: `left:${L - C}px;top:${T + H - C}px`, se: `left:${L + W - C}px;top:${T + H - C}px`,
  };
  handles.forEach(el => { el.style.cssText = pos[el.dataset.dir] + `;cursor:${CURSORS[el.dataset.dir]}-resize`; });
  sizeTip.style.left = L + W + 12 + 'px'; sizeTip.style.top = T + H + 12 + 'px';
}
// Quick swatches = the first background presets; the ✎ button opens the full editor (background.js)
const QUICK = BG_PRESETS.slice(0, 7);
function setBackground(spec, css){ page = { ...page, bg: css, bgSpec: spec }; store.set('oc-page', page); syncSwatches(); layout(); }
$('swatches').innerHTML = QUICK.map((b, i) => `<button role="radio" data-bg="${i}" title="${b.name}" aria-label="Background: ${b.name}" style="background:${bgCSS(b.spec)}"></button>`).join('') + `<button class="bg-edit" id="bgEdit" title="Edit background" aria-label="Edit background"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`;
function syncSwatches(){ document.querySelectorAll('[data-bg]').forEach(b => b.setAttribute('aria-checked', bgCSS(QUICK[+b.dataset.bg].spec) === page.bg)); }
$('swatches').onclick = e => { const b = e.target.closest('[data-bg]'); if (!b) return; const spec = { ...BG_DEFAULT, ...QUICK[+b.dataset.bg].spec }; setBackground(spec, bgCSS(spec)); };
mountBackgroundEditor($('bgEdit'), { get: () => page.bgSpec || {}, set: setBackground });
syncSwatches();
// Light page = dark text cues for outlines and for the AI prompt
function isLightPage(){ return page.bgSpec?.c1 && !page.bgSpec.css ? bgLum(page.bgSpec.c1) > .5 : page.bg === '#fafafa'; }
addEventListener('resize', layout);

/* ── Element operations ──────────────────────────────────── */
// Selection: `selected` is the primary element (AI edits, layers); `picked` holds every selected element (multi-select).
const picked = new Set();
function paintSelection(){ for (const [nid, el] of nodes) el.classList.toggle('selected', picked.has(nid)); try { updateAlignBar(); } catch {} }
function select(id){ selected = id; picked.clear(); if (id) picked.add(id); paintSelection(); renderLayers(); }
function toggleSelect(id){
  if (picked.has(id)) { picked.delete(id); if (selected === id) selected = [...picked].pop() || null; }
  else { picked.add(id); selected = id; }
  paintSelection(); renderLayers();
}
function selectMany(ids){ picked.clear(); ids.forEach(id => picked.add(id)); selected = ids[ids.length - 1] || null; paintSelection(); renderLayers(); }
const pickedItems = () => items.filter(x => picked.has(x.id));

/* ── Align & distribute bar (2+ elements selected) ── */
const alignBar = document.createElement('div');
alignBar.className = 'align-bar hidden';
const AL = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${d}</svg>`;
alignBar.innerHTML = `<span class="ab-count"></span>
  <button data-al="left" title="Align left">${AL('<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>')}</button>
  <button data-al="hcenter" title="Align centers horizontally">${AL('<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>')}</button>
  <button data-al="right" title="Align right">${AL('<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>')}</button>
  <i></i>
  <button data-al="top" title="Align top">${AL('<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>')}</button>
  <button data-al="vcenter" title="Align middles">${AL('<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>')}</button>
  <button data-al="bottom" title="Align bottom">${AL('<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>')}</button>
  <i></i>
  <button data-al="hdist" title="Distribute horizontally (3+)">${AL('<path d="M3 4v16M21 4v16"/><rect x="9" y="8" width="6" height="8" rx="1"/>')}</button>
  <button data-al="vdist" title="Distribute vertically (3+)">${AL('<path d="M4 3h16M4 21h16"/><rect x="8" y="9" width="8" height="6" rx="1"/>')}</button>
  <i></i>
  <button data-al="dup" title="Duplicate (Ctrl+D)">${AL('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')}</button>
  <button data-al="del" class="danger" title="Delete (Del)">${AL('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>`;
document.querySelector('.canvas-wrap').append(alignBar);
function updateAlignBar(){
  const n = picked.size;
  alignBar.classList.toggle('hidden', n < 2);
  alignBar.querySelector('.ab-count').textContent = n + ' selected';
  alignBar.querySelectorAll('[data-al$="dist"]').forEach(b => b.disabled = n < 3);
}
function box(it){ const el = nodes.get(it.id); return { x: it.x, y: it.y, w: el?.offsetWidth || 0, h: el?.offsetHeight || 0 }; }
function alignPicked(kind){
  const list = pickedItems(); if (list.length < 2 && !['dup', 'del'].includes(kind)) return;
  if (kind === 'del') { checkpoint(); items = items.filter(x => !picked.has(x.id)); select(null); render(); return; }
  if (kind === 'dup') {
    checkpoint();
    const copies = list.map(x => ({ ...x, id: crypto.randomUUID(), x: x.full ? 0 : x.x + 24, y: x.y + 24 }));
    items.push(...copies); render(); selectMany(copies.map(c => c.id)); return;
  }
  checkpoint();
  const bs = list.map(it => ({ it, ...box(it) })), movable = bs.filter(b => !b.it.full);
  const L = Math.min(...bs.map(b => b.x)), R = Math.max(...bs.map(b => b.x + b.w)), T = Math.min(...bs.map(b => b.y)), B = Math.max(...bs.map(b => b.y + b.h));
  if (kind === 'left') movable.forEach(b => b.it.x = L);
  if (kind === 'right') movable.forEach(b => b.it.x = R - b.w);
  if (kind === 'hcenter') movable.forEach(b => b.it.x = Math.round((L + R) / 2 - b.w / 2));
  if (kind === 'top') bs.forEach(b => b.it.y = T);
  if (kind === 'bottom') bs.forEach(b => b.it.y = B - b.h);
  if (kind === 'vcenter') bs.forEach(b => b.it.y = Math.round((T + B) / 2 - b.h / 2));
  if (kind === 'hdist' && movable.length > 2) {
    const s = [...movable].sort((a, b) => a.x - b.x), total = s.reduce((t, b) => t + b.w, 0);
    const gap = (s[s.length - 1].x + s[s.length - 1].w - s[0].x - total) / (s.length - 1);
    let x = s[0].x; s.forEach(b => { b.it.x = Math.round(x); x += b.w + gap; });
  }
  if (kind === 'vdist' && bs.length > 2) {
    const s = [...bs].sort((a, b) => a.y - b.y), total = s.reduce((t, b) => t + b.h, 0);
    const gap = (s[s.length - 1].y + s[s.length - 1].h - s[0].y - total) / (s.length - 1);
    let y = s[0].y; s.forEach(b => { b.it.y = Math.round(y); y += b.h + gap; });
  }
  items.forEach(it => { if (!it.full) it.x = Math.max(0, it.x); it.y = Math.max(0, it.y); });
  render();
}
alignBar.addEventListener('click', e => { const k = e.target.closest('[data-al]')?.dataset.al; if (k) alignPicked(k); });

/* ── Marquee: Shift + drag on empty space selects everything it touches ── */
const marquee = document.createElement('div'); marquee.className = 'marquee hidden'; board.append(marquee);
let lasso = null;
function boardPoint(e){ const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; }
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

/* ── Fusion: element A keeps its job and content, element B lends its whole visual language ──
   Right-click A → "fuse with…" → click B. The AI breeds a new component that does A's job in B's style. */
let fusing = null;
function startFusion(id){
  const a = items.find(x => x.id === id); if (!a) return;
  if (items.length < 2) { setState('add one more element to fuse with', 'warn'); return; }
  fusing = id; canvas.classList.add('fusing'); nodes.get(id)?.classList.add('fuse-source');
  setState(`fusion: click the element whose style "${a.name}" should take · Esc to cancel`, 'busy');
}
function cancelFusion(msg){
  if (!fusing) return;
  nodes.get(fusing)?.classList.remove('fuse-source'); canvas.classList.remove('fusing'); fusing = null;
  setState(msg || 'fusion cancelled');
}
function completeFusion(styleId){
  const a = items.find(x => x.id === fusing), b = items.find(x => x.id === styleId);
  cancelFusion('fusing…'); if (!a || !b || a === b) return;
  const bEl = nodes.get(b.id);
  const place = a.full ? {} : { pos: { x: Math.max(0, Math.min(page.w - 380, snap(b.x + (bEl?.offsetWidth || 300) + 32))), y: snap(b.y) } };
  const user = `FUSION. Create ONE new component (action "add", full: ${!!a.full}).
Take the PURPOSE, structure and content of component A, and rebuild it entirely in the VISUAL LANGUAGE of component B: its palette, typography, corner radius, borders, shadows, textures, spacing rhythm and motion. The result must feel like it belongs to B's design system while doing A's job — not a copy of either. Name it "${a.name} × ${b.name}".
Component A (purpose and content): ${JSON.stringify({ name: a.name, code: a.code })}
Component B (style source): ${JSON.stringify({ name: b.name, code: b.code })}`;
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  runAI(`⚗ Fuse "${a.name}" with the style of "${b.name}"`, { user, place });
}
addEventListener('keydown', e => { if (e.key === 'Escape' && fusing) cancelFusion(); });

board.addEventListener('pointerdown', e => {
  const el = e.target.closest('.node');
  if (canvas.classList.contains('playing')) return;
  if (fusing && e.button === 0) {
    e.stopPropagation(); e.preventDefault();
    if (!el) return cancelFusion();
    if (el.dataset.id === fusing) return;
    return completeFusion(el.dataset.id);
  }
  if (e.button !== 0 || !el || spaceDown) return;
  const item = items.find(x => x.id === el.dataset.id); if (!item) return;
  e.stopPropagation(); closeCtx();
  // Shift/Ctrl+click adds or removes from the selection; clicking inside a group keeps the group for dragging
  if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(item.id); if (!picked.has(item.id)) return; }
  else if (!picked.has(item.id) || picked.size < 2) select(item.id);
  else { selected = item.id; renderLayers(); }
  const group = pickedItems().filter(x => x.id !== item.id).map(x => ({ item: x, el: nodes.get(x.id), ox: x.x, oy: x.y }));
  drag = { el, item, group, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, moved: false, snapshot: JSON.stringify(items) };
  el.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true; drag.el.classList.add('dragging');
  const maxX = Math.max(0, page.w - drag.el.offsetWidth);
  let x = drag.item.full ? 0 : Math.min(maxX, Math.max(0, drag.ox + dx)), y = Math.max(0, drag.oy + dy);
  // smart guides: snap edges/centers to the page and to other elements (Alt disables)
  const g = e.altKey ? null : smartSnap(drag.item, x, y, drag.el.offsetWidth, drag.el.offsetHeight);
  if (g) { x = g.x; y = g.y; } else { x = drag.item.full ? 0 : Math.min(maxX, snap(x)); y = snap(y); }
  showGuides(g?.lines || []);
  drag.item.x = x; drag.item.y = y;
  drag.el.style.left = drag.item.x + 'px'; drag.el.style.top = drag.item.y + 'px';
  // the rest of a multi-selection moves by the same amount
  const mx = x - drag.ox, my = y - drag.oy;
  for (const g2 of drag.group || []) {
    g2.item.x = g2.item.full ? 0 : Math.max(0, g2.ox + mx); g2.item.y = Math.max(0, g2.oy + my);
    if (g2.el) { g2.el.style.left = g2.item.x + 'px'; g2.el.style.top = g2.item.y + 'px'; }
  }
});
/* ── Roblox safe zones: areas the Roblox client draws on top of your UI ──
   Top bar (menu, chat, backpack…) along the top; on touch screens the thumbstick (bottom-left)
   and the jump button (bottom-right). Sizes are approximate and scale with the page height. */
const zoneLayer = document.createElement('div'); zoneLayer.className = 'rbx-zones'; board.append(zoneLayer);
function drawZones(){
  const on = !!page.robloxZones;
  $('zonesToggle').setAttribute('aria-pressed', on);
  zoneLayer.hidden = !on; if (!on) return;
  const touch = page.w <= 1100 || page.h <= 600;           // phone / small tablet sizes
  const k = Math.min(1, page.h / 720);                       // the client shrinks controls on short screens
  const bar = Math.round(58 * Math.max(.75, k));
  const stick = Math.round(220 * k), jump = Math.round(90 * k);
  zoneLayer.innerHTML = `<div class="rbx-zone top" style="height:${bar}px"><span>Roblox top bar · keep clear (${bar}px)</span></div>`
    + (touch ? `<div class="rbx-zone stick" style="width:${stick}px;height:${stick}px;left:${Math.round(40 * k)}px;bottom:${Math.round(30 * k)}px"><span>thumbstick</span></div>`
      + `<div class="rbx-zone jump" style="width:${jump}px;height:${jump}px;right:${Math.round(60 * k)}px;bottom:${Math.round(40 * k)}px"><span>jump</span></div>` : '');
}
$('zonesToggle').onclick = () => { page = { ...page, robloxZones: !page.robloxZones }; store.set('oc-page', page); drawZones(); setState(page.robloxZones ? 'Roblox zones on — keep buttons out of the shaded areas' : 'ready'); };

/* ── Smart guides ── */
const guideLayer = document.createElement('div'); guideLayer.className = 'guides'; board.append(guideLayer);
function smartSnap(item, x, y, w, h){
  const tol = 6 / zoom;
  const xs = [{ v: 0 }, { v: page.w / 2 }, { v: page.w }], ys = [{ v: 0 }, { v: page.h / 2 }];
  for (const it of items) {
    if (it.id === item.id || picked.has(it.id)) continue; // don't snap to elements that move along
    const el = nodes.get(it.id); if (!el) continue;
    const L = el.offsetLeft, T = el.offsetTop, W = el.offsetWidth, H = el.offsetHeight;
    xs.push({ v: L }, { v: L + W / 2 }, { v: L + W });
    ys.push({ v: T }, { v: T + H / 2 }, { v: T + H });
  }
  const best = (pos, size, targets) => {
    let hit = null;
    for (const [k, off] of [['start', 0], ['mid', size / 2], ['end', size]]) for (const t of targets) {
      const d = Math.abs(pos + off - t.v);
      if (d <= tol && (!hit || d < hit.d)) hit = { d, pos: t.v - off, line: t.v };
    }
    return hit;
  };
  const bx = item.full ? null : best(x, w, xs), by = best(y, h, ys);
  if (!bx && !by) return null;
  const lines = [];
  if (bx) lines.push({ x: bx.line });
  if (by) lines.push({ y: by.line });
  return { x: item.full ? 0 : bx ? Math.round(bx.pos) : snap(x), y: by ? Math.round(by.pos) : snap(y), lines };
}
function showGuides(lines){
  guideLayer.innerHTML = lines.map(l => l.x !== undefined ? `<i class="guide v" style="left:${l.x}px"></i>` : `<i class="guide h" style="top:${l.y}px"></i>`).join('');
}
const endDrag = () => {
  showGuides([]);
  if (!drag) return;
  drag.el.classList.remove('dragging');
  if (drag.moved) { history.push(drag.snapshot); layout(); persist(); }
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
  if (e.button === 0 && e.shiftKey && !e.target.closest('.node, .page-handle')) {
    const p0 = boardPoint(e);
    lasso = { x0: p0.x, y0: p0.y, base: new Set(picked), id: e.pointerId };
    canvas.setPointerCapture(e.pointerId); return;
  }
  pan ={ sx: e.clientX, sy: e.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (lasso) {
    const p1 = boardPoint(e), x = Math.min(lasso.x0, p1.x), y = Math.min(lasso.y0, p1.y), w = Math.abs(p1.x - lasso.x0), h = Math.abs(p1.y - lasso.y0);
    Object.assign(marquee.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); marquee.classList.remove('hidden');
    const hit = items.filter(it => { const b = box(it); return b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y; }).map(it => it.id);
    selectMany([...new Set([...lasso.base, ...hit])]);
    return;
  }
  if (!pan) return;
  const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
  if (!pan.moved && Math.hypot(dx, dy) < 3) return;
  pan.moved = true; canvas.classList.add('panning');
  canvas.scrollLeft = pan.sl - dx; canvas.scrollTop = pan.st - dy;
});
const endPan = () => {
  if (lasso) { lasso = null; marquee.classList.add('hidden'); if (picked.size > 1) setState(`${picked.size} selected · drag to move together · align with the bar below`, 'ok'); return; }
  if (!pan) return; if (!pan.moved) select(null); canvas.classList.remove('panning'); pan = null; };
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
    { label: '⚗ fuse with…', run: () => startFusion(id) },
    { label: '✎ edit text & style', key: 'dbl-click', run: () => window.dispatchEvent(new CustomEvent('oc:edit-inline', { detail: id })) },
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
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectMany(items.map(x => x.id)); setState(`${items.length} selected`, 'ok'); return; }
  if (picked.size > 1) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); alignPicked('del'); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); alignPicked('dup'); }
    else if (e.key === 'Escape') select(null);
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault(); checkpoint();
      const step = e.shiftKey ? GRID * 4 : GRID;
      for (const it of pickedItems()) {
        if (e.key === 'ArrowLeft' && !it.full) it.x = Math.max(0, it.x - step);
        if (e.key === 'ArrowRight' && !it.full) it.x += step;
        if (e.key === 'ArrowUp') it.y = Math.max(0, it.y - step);
        if (e.key === 'ArrowDown') it.y += step;
      }
      render();
    }
    return;
  }
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
const card = (p, k) => `<button class="component${p.full ? ' wide' : ''}" style="--i:${k}" data-add="${p.index}" title="Add: ${escapeHTML(p.name)}"><span class="component-preview"><iframe title="${escapeHTML(p.name)}" sandbox="allow-same-origin" tabindex="-1" data-preset="${p.index}"></iframe></span><span class="component-info"><span>${escapeHTML(p.name)}</span><span class="component-plus">+</span></span></button>`;

// Catalog previews hold still on a representative frame and come alive on hover.
// (Same-origin frames without scripts: the CSP inside blocks JS, we only drive the Web Animations API from here.)
function previewAnims(f){ try { return f.contentDocument?.getAnimations?.() || []; } catch { return []; } }
function holdPreview(f){
  const anims = previewAnims(f);
  for (const a of anims) {
    const t = a.effect?.getComputedTiming?.(); if (!t) continue;
    if (t.iterations === Infinity && Number.isFinite(t.duration)) { a.pause(); a.currentTime = (t.delay || 0) + t.duration * 0.6; }
    else { try { a.finish(); } catch { a.pause(); } }
  }
  f.closest('.component')?.classList.toggle('animated', anims.length > 0);
}
function playPreview(f){ for (const a of previewAnims(f)) if (a.playState !== 'finished') a.play(); }
$('library').addEventListener('pointerover', e => {
  const c = e.target.closest('.component'); if (!c || c.contains(e.relatedTarget)) return;
  const f = c.querySelector('iframe'); if (f) playPreview(f);
});
$('library').addEventListener('pointerout', e => {
  const c = e.target.closest('.component'); if (!c || c.contains(e.relatedTarget)) return;
  const f = c.querySelector('iframe'); if (f) holdPreview(f);
});
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
  document.querySelectorAll('[data-preset]').forEach(f => { const p = presets[+f.dataset.preset]; f.onload = () => requestAnimationFrame(() => holdPreview(f)); f.srcdoc = previewDoc(p.code, p.full); });
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

// Export menu: HTML, exact converters (Roblox Luau, LÖVE, React, Vue, Svelte) and AI-assisted ports
const fileBase = () => (nameEl.textContent.trim() || 'interface').replace(/[\\/:*?"<>|\s]+/g, '-');
function download(text, file, type = 'text/plain'){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setState('saved: ' + file, 'ok');
}
const AI_TARGETS = [
  { id: 'flutter', label: 'Flutter (Dart)', ext: '.dart', lang: 'a single Flutter widget file in Dart (Material 3, a StatelessWidget named after the page)' },
  { id: 'swiftui', label: 'SwiftUI', ext: '.swift', lang: 'a single SwiftUI View file in Swift' },
  { id: 'compose', label: 'Jetpack Compose', ext: '.kt', lang: 'a single Kotlin file with Jetpack Compose @Composable functions' },
  { id: 'tailwind', label: 'HTML + Tailwind', ext: '.html', lang: 'one HTML file that uses the Tailwind CSS v4 browser CDN and Tailwind utility classes instead of custom CSS' },
];
function exportTo(t){
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  const title = nameEl.textContent.trim() || 'My interface';
  const withH = items.map(it => ({ ...it, h: nodes.get(it.id)?.offsetHeight || 0 }));
  try {
    if (['luau', 'luau-scale', 'rbxmx', 'love'].includes(t.id)) {
      const frames = items.map(it => ({ doc: nodes.get(it.id)?.querySelector('iframe')?.contentDocument, x: it.x, y: it.y, name: it.name })).filter(f => f.doc);
      const snap = snapshot(frames);
      if (t.id === 'love') download(toLoveLua(snap, page, title), 'main.lua');
      else if (t.id === 'rbxmx') download(toRobloxModel(snap, page, title), fileBase() + t.ext, 'application/xml');
      else download(toRobloxLuau(snap, page, title, { scale: t.id === 'luau-scale' }), fileBase() + (t.id === 'luau-scale' ? '.scale' : '') + t.ext);
    }
    else if (t.id === 'react') download(toReact(withH, page, title), fileBase() + t.ext);
    else if (t.id === 'vue') download(toVue(withH, page, title), fileBase() + t.ext);
    else if (t.id === 'svelte') download(toSvelte(withH, page, title), fileBase() + t.ext);
  } catch (e) { setState('export failed: ' + e.message, 'error'); }
}
async function exportWithAI(t){
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!key) { openSettings(); $('chatStatus').textContent = 'AI export needs a connected AI provider.'; return; }
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  message(`Export the page to ${t.label}`, 'user');
  const stop = thinking();
  try {
    const system = `You convert web layouts into native UI code. Output ONLY the source code of ${t.lang} — no markdown fences, no explanations. Reproduce the layout, colors, typography, spacing, corner radii and text as faithfully as the target allows. Keep it compilable and self-contained.`;
    const html = buildHTML();
    const code = String(await chat(p, key, m.id, system, `Page "${nameEl.textContent.trim()}" (${page.w}×${page.h}). Source HTML:\n${html}`) || '').replace(/^\s*```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    if (!code.trim()) throw Error('empty response');
    stop(); download(code, fileBase() + t.ext); message(`Done — downloaded ${fileBase() + t.ext}. AI ports are a starting point: review before shipping.`, 'assistant');
  } catch (e) { stop(); setState('ai export failed', 'error'); message('AI export failed: ' + e.message, 'assistant'); }
}
$('export').onclick = () => {
  const r = $('export').getBoundingClientRect();
  openCtx(r.right - 260, r.bottom + 6, [
    { label: '⬇ HTML page', key: '.html', run: exportHTML },
    '-',
    ...TARGETS.map(t => ({ label: t.label, key: t.ext, run: () => exportTo(t) })),
    '-',
    ...AI_TARGETS.map(t => ({ label: '✦ ' + t.label, key: 'ai', run: () => exportWithAI(t) })),
  ]);
};
function buildHTML(){
  if (isStack()) return buildStackHTML();
  const H = pageHeightNow();
  const body = items.map(it => it.full
    ? `<div style="position:absolute;left:0;top:${it.y}px;width:${page.w}px">\n${it.code}\n</div>`
    : `<div style="position:absolute;left:${it.x}px;top:${it.y}px;padding:${PAD}px">\n${it.code}\n</div>`).join('\n');
  const title = escapeHTML(nameEl.textContent.trim() || 'My interface');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${page.w}"><title>${title}</title><style>html,body{margin:0}body{min-height:100vh;background:${page.bg};background-attachment:fixed;color:#eee;font-family:system-ui}.oc-page{position:relative;width:${page.w}px;height:${H}px;margin:0 auto}</style>${page.themeCss ? `<style>${page.themeCss.replace(/#__root/g, '.oc-page')}</style>` : ''}</head><body><div class="oc-page">\n${body}\n</div></body></html>`;
}
// Responsive page: normal document flow in stack order; sections span the width, components are centered
// and may shrink on small screens.
function buildStackHTML(){
  const order = [...items].sort((a, b) => a.y - b.y);
  const body = order.map(it => it.full
    ? `<section class="oc-full">\n${it.code}\n</section>`
    : `<div class="oc-block">\n${it.code}\n</div>`).join('\n');
  const title = escapeHTML(nameEl.textContent.trim() || 'My interface');
  const theme = page.themeCss ? `<style>${page.themeCss.replace(/#__root/g, '.oc-page')}</style>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
html,body{margin:0}body{min-height:100vh;background:${page.bg};background-attachment:fixed;color:#eee;font-family:system-ui}
.oc-page{display:flex;flex-direction:column;gap:${STACK_GAP}px;min-height:100vh;overflow-x:hidden}
.oc-full{width:100%}.oc-full>*{max-width:100%;box-sizing:border-box}
.oc-block{display:flex;justify-content:center;padding:0 16px}.oc-block>*{max-width:100%;box-sizing:border-box}
.oc-page img,.oc-page svg,.oc-page video{max-width:100%;height:auto}
@media(max-width:640px){.oc-full [style*="grid-template-columns"],.oc-full [class*="grid"]{grid-template-columns:1fr!important}.oc-page h1{font-size:clamp(28px,8vw,48px)!important}}
</style>${theme}</head><body><main class="oc-page">\n${body}\n</main></body></html>`;
}
// Device preview: the exported page rendered at phone, tablet and desktop widths side by side (scripts off)
function openDevicePreview(){
  if (!items.length) { setState('nothing to preview: the page is empty', 'warn'); return; }
  const html = buildHTML();
  const devices = [{ name: 'phone', w: 390, h: 844 }, { name: 'tablet', w: 834, h: 1112 }, { name: 'desktop', w: 1440, h: 900 }];
  let m = $('previewModal');
  if (!m) { m = document.createElement('div'); m.className = 'modal hidden'; m.id = 'previewModal'; document.body.append(m); m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.add('hidden'); }; }
  const stack = isStack();
  m.innerHTML = `<div class="modal-card preview-card"><div class="modal-head"><h2>preview · ${stack ? 'responsive' : 'fixed width'}</h2><button class="btn icon" data-close>×</button></div>
    ${stack ? '<p class="preview-note">Blocks reflow to fit each screen. Links open in a new tab; hover and toggles work.</p>'
      : `<div class="preview-banner"><span><b>This page has a fixed ${page.w}px layout</b>, so phones and tablets just shrink it — text gets tiny. Make it responsive: blocks will stack top to bottom and adapt to any screen.</span><button class="btn primary" data-make-stack>make responsive</button></div>`}
    <div class="devices">${devices.map(d => `<figure class="device"><div class="device-screen"><iframe sandbox="allow-popups allow-popups-to-escape-sandbox" title="${d.name}"></iframe></div><figcaption>${d.name} · ${d.w}px</figcaption></figure>`).join('')}</div></div>`;
  m.classList.remove('hidden');
  m.querySelector('[data-make-stack]')?.addEventListener('click', () => { setLayoutMode('stack'); requestAnimationFrame(() => requestAnimationFrame(openDevicePreview)); });
  // dark scrollbars, links open in a new tab, scripts stay off
  const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><base target="_blank"><style>:root{color-scheme:dark}html{scrollbar-width:thin;scrollbar-color:#3a302d transparent}</style>`;
  m.querySelectorAll('.device').forEach((fig, i) => {
    const d = devices[i], f = fig.querySelector('iframe'), screen = fig.querySelector('.device-screen');
    // a fixed-width page is laid out at its own width and scaled to the device, like a phone does with width=1440
    const vw = stack ? d.w : Math.max(d.w, page.w);
    const fit = () => { const k = screen.clientWidth / vw; f.style.width = vw + 'px'; f.style.height = d.h * (vw / d.w) + 'px'; f.style.transform = `scale(${k})`; screen.style.height = d.h * (screen.clientWidth / d.w) + 'px'; };
    f.srcdoc = html.replace('<head>', '<head>' + head); requestAnimationFrame(fit);
  });
}
$('devicePreview').onclick = openDevicePreview;
// ▶ play: let the mouse reach the elements so CSS interactions work; editing/dragging pauses meanwhile
let playing = false;
function setPlaying(on){
  playing = on; canvas.classList.toggle('playing', on); $('playToggle').setAttribute('aria-pressed', on);
  $('playToggle').textContent = on ? '■ stop' : '▶ play';
  if (on) { select(null); setState('play mode: try hover, toggles, tabs · press P or ■ stop to edit again', 'busy'); } else setState('ready');
}
$('playToggle').onclick = () => setPlaying(!playing);
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('.modal:not(.hidden)')) setPlaying(!playing); });
function exportHTML(){
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  download(buildHTML(), fileBase() + '.html', 'text/html');
}

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
  if (m.pid === 'oc') return `<span class="model-logo">${logoSvg}</span>`;
  const hit = VENDOR_LOGOS.find(([re]) => re.test(`${m.id} ${m.name} ${m.vendor || ''}`));
  const svg = logo(hit ? hit[1] : byId(m.pid)?.logo);
  return svg ? `<span class="model-logo">${svg}</span>` : `<span class="model-logo letter">${escapeHTML((m.vendor || m.name || '?')[0].toUpperCase())}</span>`;
}
const providerLogo = p => `<span class="model-logo">${p.kind === 'proxy' ? logoSvg : logo(p.logo)}</span>`;
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
// new visitors start on the free openconstructor AI (no key, sign-in required)
let currentModel = store.get('form-model', 'oc::openai/gpt-oss-120b');
if (!currentModel.includes('::')) currentModel = 'openrouter::' + currentModel;
const providerModels = p => (p.id === 'openrouter' ? [AUTO, ...(modelsBy.openrouter || [])] : (modelsBy[p.id] || [])).map(m => ({ ...m, pid: p.id, key: `${p.id}::${m.id}` }));
const allModels = () => PROVIDERS.flatMap(providerModels);
function current(){
  const found = allModels().find(m => m.key === currentModel);
  if (found) return found;
  const [pid, ...rest] = currentModel.split('::');
  return { pid, id: rest.join('::'), name: rest.join('::'), key: currentModel };
}
// the free proxy needs no key (it asks to sign in when used); others need their key
const usable = pid => byId(pid)?.kind === 'proxy' || !!keys[pid];
export const canSend = () => usable(current().pid);
let quota = null; // { used, limit } for the free AI
const quotaText = () => !authUser ? ' · sign in to use' : quota ? ` · ${quota.used}/${quota.limit} today` : ' · 20 free a day';
window.addEventListener('oc-quota', e => { quota = e.detail; renderPicker(); });
window.addEventListener('oc:auth', () => { quota = null; if (authUser) freeQuota().catch(() => {}); renderPicker(); renderProviders(); });

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
    const status = pr.kind === 'proxy' ? quotaText() : !keys[pr.id] ? ' · key required' : loading[pr.id] ? ' · loading…' : modelErr[pr.id] ? ' · error' : '';
    const firstPaid = list.find(x => x.paid);
    return `<div class="model-group">${providerLogo(pr)}${escapeHTML(pr.name)}<span>${status}</span></div>` + list.map(x => (x === firstPaid ? '<div class="model-sub">pay per use · $ per 1M tokens in · out</div>' : '') + `<button type="button" role="option" class="model-option${x.key === currentModel ? ' active' : ''}" data-model="${escapeHTML(x.key)}" aria-selected="${x.key === currentModel}">${modelLogo(x)}<span class="model-text"><span class="model-title">${escapeHTML(x.name)}</span><span class="model-meta">${escapeHTML(x.vendor || pr.name)}${x.ctx ? ' · ' + fmtCtx(x.ctx) + ' context' : ''}${x.note ? ' · ' + escapeHTML(x.note) : ''}</span></span>${x.price ? `<span class="model-price" title="price per 1M tokens: input · output">${fmtPrice(x.price)}</span>` : ''}${x.key === currentModel ? '<span class="model-check">✓</span>' : ''}</button>`).join('');
  }).join('');
  picker.querySelector('.model-list').innerHTML = groups || '<div class="model-empty">nothing found</div>';
  const connected = PROVIDERS.filter(pr => keys[pr.id]).length, total = PROVIDERS.filter(pr => pr.kind !== 'proxy').length;
  picker.querySelector('.model-add').textContent = `+ connect your own keys (${connected} of ${total})`;
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
  // someone who connected their own key probably wants to use it instead of the free quota
  const pr = PROVIDERS.find(x => keys[x.id] && providerModels(x).length);
  if (!pr && usable(current().pid)) return;
  // pick the provider's recommended model when it's available, otherwise the first one
  if (pr) { const list = providerModels(pr); const best = (pr.prefer || []).map(id => list.find(x => x.id === id)).find(Boolean); currentModel = (best || list[0]).key; store.set('form-model', currentModel); }
}
function loadModels(){ PROVIDERS.forEach(loadProvider); }

// "AI providers" dialog: a key for each service and its connection status
function renderProviders(){
  const box = $('providers'); if (!box) return;
  const focused = document.activeElement?.dataset?.key;
  box.innerHTML = PROVIDERS.map(p => {
    if (p.kind === 'proxy') return `<div class="prov on prov-free">${providerLogo(p)}<div class="prov-info"><div class="prov-name">${escapeHTML(p.name)}</div><div class="prov-note">${escapeHTML(p.note)}</div></div>${authUser ? `<span class="prov-st ok">✓ signed in${quota ? ` · ${quota.used}/${quota.limit} used today` : ''}</span>` : '<button class="btn primary" type="button" data-free-signin>sign in to use</button>'}</div>`;
    const k = keys[p.id] || '';
    const st = !k ? '' : loading[p.id] ? '<span class="prov-st">checking…</span>' : modelErr[p.id] ? `<span class="prov-st err" title="${escapeHTML(modelErr[p.id])}">✗ ${escapeHTML(String(modelErr[p.id]).slice(0, 60))}</span>` : `<span class="prov-st ok">✓ ${(modelsBy[p.id] || []).length} models</span>`;
    return `<div class="prov${k ? ' on' : ''}">${providerLogo(p)}<div class="prov-info"><div class="prov-name">${escapeHTML(p.name)}</div><div class="prov-note">${escapeHTML(p.note)} · <a href="${p.keyUrl}" target="_blank" rel="noreferrer">get a key ↗</a></div></div><input type="password" data-key="${p.id}" value="${escapeHTML(k)}" placeholder="${escapeHTML(p.hint || 'API key')}" autocomplete="off" spellcheck="false">${st}</div>`;
  }).join('');
  if (focused) { const el = box.querySelector(`[data-key="${focused}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}
function openSettings(){ $('rememberKeys').checked = remember; renderProviders(); showModal('settings'); }
$('providers').addEventListener('click', e => { if (e.target.closest('[data-free-signin]')) { $('settings').classList.add('hidden'); openAuth('signup'); } });
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

// Answer format: a one-line JSON header (no code) followed by the code in a ```html block.
// Code outside JSON can't break on escaping, and a missing closing fence (cut-off answer) is tolerated.
// Older JSON-with-"code" answers and bare HTML are still understood.
function firstJSON(text){
  const a = text.indexOf('{'); if (a < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return { json: text.slice(a, i + 1), end: i + 1 };
  }
  return null;
}
// Models often put raw line breaks / tabs inside JSON strings; escape control characters that sit inside strings.
function looseJSON(text){
  try { return JSON.parse(text); } catch {}
  let out = '', inStr = false, esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
      else if (ch === '\n') { out += '\\n'; continue; } else if (ch === '\r') continue; else if (ch === '\t') { out += '\\t'; continue; }
    } else if (ch === '"') inStr = true;
    out += ch;
  }
  return JSON.parse(out);
}
const HTML_START = /<(style|div|section|header|main|button|form|nav|article|aside|footer|ul|h1|a)\b/i;
function parseAnswer(content){
  const raw = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = raw.match(/```(?:html|HTML)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n```|$)/);
  if (fence && /<[a-z!]/i.test(fence[1])) {
    const before = raw.slice(0, fence.index);
    let head = {};
    try { const j = firstJSON(before); if (j) head = looseJSON(j.json); } catch {}
    return { action: 'add', ...head, code: fence[1].replace(/```\s*$/, '').trim() };
  }
  let text = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const bare = () => HTML_START.test(text) ? { action: 'add', name: 'New element', code: text.slice(text.search(HTML_START)) } : null;
  // JSON must start before any markup, otherwise the first "{" is CSS
  const j = text.search(HTML_START) >= 0 && text.indexOf('{') > text.search(HTML_START) ? null : firstJSON(text);
  if (!j) {
    // an old-style {"code":"…"} answer that was cut off: unescape what arrived
    const cut = text.match(/^\s*\{[\s\S]*?"code"\s*:\s*"([\s\S]*)$/);
    if (cut) { try { return { action: 'add', name: (text.match(/"name"\s*:\s*"([^"]*)"/) || [])[1] || 'New element', code: looseJSON('"' + cut[1].replace(/\\+$/, '').replace(/"\s*,\s*"(reply|name|full|action)"[\s\S]*$/, '') + '"') }; } catch {} }
    // no JSON at all: accept plain HTML/CSS, or plain text as a chat reply
    const b = bare(); if (b) return b;
    if (text && !/[{}<>]/.test(text)) return { action: 'reply', reply: text };
    throw Error('The model answered in an unexpected format');
  }
  text = j.json;
  let result;
  try { result = looseJSON(text); }
  catch (e) {
    // legacy format cut mid-string: salvage the "code" value as far as it goes
    const m = text.match(/"code"\s*:\s*"([\s\S]*)/);
    if (!m) throw e;
    result = { action: 'add', code: looseJSON('"' + m[1].replace(/"\s*[,}][\s\S]*$/, '').replace(/\\?$/, '') + '"') };
  }
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

$('send').onclick = () => { const request = $('prompt').value.trim(); if (request) runAI(request); };

// One AI round-trip. `custom.user` replaces the default context (used by Fusion); `custom.place` positions a new element.
async function runAI(request, custom = {}){
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!p) { $('chatStatus').textContent = 'Pick a model from the list below the input.'; return; }
  if (p.kind === 'proxy') { if (!authUser) { $('chatStatus').textContent = 'Sign in (free) to use openconstructor AI — or connect your own key in ⚙.'; openAuth('signup'); return; } }
  else if (!key) { $('chatStatus').textContent = `Add a ${p.name} key to use this model.`; openSettings(); return; }
  const target = custom.user ? null : items.find(x => x.id === selected);
  message(request, 'user'); $('send').disabled = true; $('chatStatus').textContent = '';
  const stop = thinking();
  const system = `You are openconstructor AI, you build interfaces. Answer in EXACTLY this format and nothing else:
line 1 — a one-line JSON header WITHOUT the code: {"action":"add|update|reply","full":true|false,"name":"short element name","reply":"short reply to the user"}
then, unless action is "reply", the HTML and CSS in ONE fenced block:
\`\`\`html
<style>…</style>
<markup>…</markup>
\`\`\`
Rules:
- If the message is just conversation or a question (a greeting, thanks, "what can you do", how-to) and does not ask to build or change something, use action "reply" with only the "reply" field — do NOT create an element.
- If the user asks to change the selected element, use action "update"; if they ask to build something, "add".
- Page: ${page.w}×${page.h}px, ${isLightPage() ? 'light' : 'dark'} background. If the user asks for a website, landing page, page or section, set "full": true and build a complete full-width layout (header, hero, content blocks, footer) with a root element of width:100%. For a standalone component (button, card, form), set "full": false, width up to 360px.
- Self-contained HTML and CSS only: one <style> plus markup. No JavaScript, external links, images or fonts. Icons as inline SVG.
- Do not style html or body; use unique class names with a shared prefix.
- Clean, modern design: spacing, heading hierarchy, rounded corners, shadows, hover states. Respect prefers-reduced-motion for animations.
- Write all UI text in the components in the same language as the user's request.
- Keep the code compact (no comments, no repeated boilerplate) so the answer fits in one response.`;
  const user = custom.user || ('Selected element: ' + JSON.stringify(target ? { name: target.name, code: target.code } : null) + '\nOther elements: ' + JSON.stringify(items.map(x => ({ name: x.name }))) + '\nRequest: ' + request);
  try {
    const content = await chat(p, key, m.id, system, user, custom.images || []);
    if (typeof content !== 'string' || !content.trim()) throw Error('Empty model response');
    const result = parseAnswer(content);
    if (result.action === 'reply' || (!result.code && result.reply)) {
      stop(); setState('ready'); message(String(result.reply || '…'), 'assistant'); $('prompt').value = ''; return;
    }
    if (typeof result.code !== 'string' || !result.code.trim() || result.code.length > 200000) throw Error('Invalid code');
    const full = result.full === true || result.full === 'true';
    if (result.action === 'update' && target) {
      const item = items.find(x => x.id === target.id); if (!item) throw Error('The element was deleted during the request');
      checkpoint(); item.name = String(result.name || item.name).slice(0, 80); item.code = result.code;
      if (full) { item.full = true; item.x = 0; }
      selected = item.id; render();
    } else add(String(result.name || 'New element').slice(0, 80), result.code, { full, ...(custom.place || {}) });
    stop(); setState('element ready', 'ok');
    message(String(result.reply || 'Done. The element is on the page.'), 'assistant'); $('prompt').value = ''; window.dispatchEvent(new CustomEvent('oc:generated'));
  } catch (e) { stop(); setState('ai error', 'error'); $('chatStatus').textContent = 'Error: ' + e.message; message('Could not apply the response. Try again or pick another model.', 'assistant'); }
  finally { $('send').disabled = false; }
}
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('send').click(); } });

/* ── Screenshot → blocks: a picture of any site or mockup becomes an editable page ── */
function shrinkImage(file, max = 1600){
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve({ data: c.toDataURL('image/jpeg', .85), w: img.width, h: img.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('not an image')); };
    img.src = url;
  });
}
async function fromScreenshot(file){
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 15e6) { setState('image is too large (max 15 MB)', 'warn'); return; }
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  if (byId(current().pid)?.kind === 'proxy') { message('Screenshots need a model that can see images. Pick Gemini, Claude or GPT in the model list (connect a key in ⚙) and try again.', 'assistant'); return; }
  try {
    const { data, w, h } = await shrinkImage(file);
    const note = $('prompt').value.trim();
    const wide = w >= 900;
    const thumb = message('', 'user'); thumb.innerHTML = `<img class="msg-shot" src="${data}" alt="screenshot">`;
    const user = `SCREENSHOT TO BLOCKS. Recreate the interface in the attached image as faithfully as possible: layout, proportions, colors, typography, spacing, corner radii, icons (as inline SVG) and all visible text (keep its language). Use action "add" and full: ${wide} (${wide ? 'it is a full page or wide section: root width 100%' : 'it is a single component'}). Replace photos with tasteful gradient or SVG placeholders.${note ? '\nExtra instructions from the user: ' + note : ''}`;
    await runAI(`📷 Build from screenshot (${w}×${h})`, { user, images: [data] });
  } catch (e) { setState('screenshot failed: ' + e.message, 'error'); }
}
const shotInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
shotInput.onchange = () => { fromScreenshot(shotInput.files[0]); shotInput.value = ''; };
document.body.append(shotInput);
export const pickScreenshot = () => shotInput.click();
$('shotButton')?.addEventListener('click', pickScreenshot);
// Paste an image anywhere outside text fields (or into the chat box) to rebuild it
addEventListener('paste', e => {
  const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault(); fromScreenshot(file);
});
// Drop an image file onto the canvas
canvas.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) { e.preventDefault(); canvas.classList.add('drop-shot'); } });
canvas.addEventListener('dragleave', () => canvas.classList.remove('drop-shot'));
canvas.addEventListener('drop', e => { canvas.classList.remove('drop-shot'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); fromScreenshot(f); } });

/* ── API for the welcome screen, menus and feature modules (publish, projects, theme…) ── */
export const stats = { presets: presets.length };
export const studio = {
  // read
  items: () => items.map(x => ({ ...x })),
  page: () => ({ ...page }),
  name: () => nameEl.textContent.trim() || 'my-interface',
  selected: () => selected,
  frame: id => nodes.get(id)?.querySelector('iframe') || null,
  html: () => buildHTML(),
  // write (each call is one undo step)
  update(mutate){ checkpoint(); const next = mutate(items.map(x => ({ ...x }))); if (Array.isArray(next)) items = next; render(); },
  setPage(patch, { refresh = false } = {}){ page = { ...page, ...patch }; store.set('oc-page', page); if (refresh) for (const el of nodes.values()) el._key = null; render(); },
  load({ items: list = [], page: pg, name } = {}){
    checkpoint(); items = list.map(x => ({ id: x.id || crypto.randomUUID(), ...x }));
    if (pg) { page = { ...page, ...pg }; store.set('oc-page', page); syncPageSize(); syncSwatches(); }
    if (name) { nameEl.textContent = name; store.set('oc-name', name); }
    selected = null; for (const el of nodes.values()) el._key = null; render(); requestAnimationFrame(fitZoom);
  },
  // feedback
  status: (text, kind) => setState(text, kind),
  say: (text, role = 'assistant') => message(text, role),
  menu: (x, y, entries) => openCtx(x, y, entries),
  ai: (request, custom) => runAI(request, custom),
};
export function loadTemplate(tpl){
  checkpoint();
  page = { ...page, ...tpl.page, ...(tpl.page?.bg ? { bgSpec: null } : {}) }; store.set('oc-page', page);
  syncPageSize(); syncSwatches();
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
$('canvasEmpty').addEventListener('click', e => { const b = e.target.closest('[data-empty]'); if (!b) return; if (b.dataset.empty === 'welcome') openWelcome();
  else if (b.dataset.empty === 'screenshot') pickScreenshot();
  else if (b.dataset.empty === 'library') { window.dispatchEvent(new CustomEvent('oc:show-view', { detail: 'library' })); const s = $('catalogSearch'); s.focus(); $('sidePanel').animate([{ boxShadow: 'inset 0 0 0 1px var(--accent)' }, { boxShadow: 'inset 0 0 0 1px transparent' }], { duration: 1200 }); }
  else { window.dispatchEvent(new CustomEvent('oc:open-chat')); prefillPrompt(b.dataset.empty); } });

render();
requestAnimationFrame(fitZoom);
loadModels();
