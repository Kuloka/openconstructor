// The 200-component catalog is a separate chunk: the editor paints first, the catalog fills in right after
let presets = [];
const presetsReady = import('./presets.js').then(m => { presets = m.presets; stats.presets = presets.length; renderLibrary(); return presets; });
import { t, lang, AI_LANG } from './i18n.js';
import { track, failReason } from './track.js';
import * as vault from './keyvault.js';
import { pickIcon } from './icons.js';
import {CATEGORIES} from './categories.js';
import { TARGETS } from './export-targets.js'; // the converters themselves (exporters.js) load on first export
import { PRESETS as BG_PRESETS, DEFAULT_SPEC as BG_DEFAULT, toCSS as bgCSS, luminance as bgLum, mountBackgroundEditor } from './background.js';
import logoSvg from './src/logo.svg?raw';
import { parseScene, parseAnswer, firstJSON, looseJSON } from './ai-parse.js';
import { MD_RE, md } from './markdown.js';
import { initChatUI, toBottom, typeText, retype, message, thinking } from './chat-ui.js';
import { fixContrast as fixContrastIn } from './contrast.js';
const fixContrast = (code, full) => fixContrastIn(code, full, { light: isLightPage(), w: page.w, h: page.h, nodeDoc });
import { PROVIDERS, byId, listModels, chat, freeQuota, aiTurn, tokensTurn } from './providers.js';
import { signOut, user as authUser, openAuth } from './auth.js';
import './donate.js';
import { appDoc, withAppHead, APP_RULES, APP_EXAMPLES, appReference } from './apps.js';
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
let selected = null, editing = null, history = [], future = [];
// Undo keeps up to 50 states; a new change clears the redo list
function pushHistory(snap){ history.push(snap); if (history.length > 50) history.shift(); future = []; syncUndo(); }
function checkpoint(){ pushHistory(JSON.stringify(items)); }
function syncUndo(){ const u = document.getElementById('undo'), r = document.getElementById('redo'); if (u) u.disabled = !history.length; if (r) r.disabled = !future.length; }
function persist(){ store.set('form-canvas-v3', items); try { store.set('oc-last-ai', lastAiId); } catch {} window.dispatchEvent(new CustomEvent('oc:changed')); }

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
  if (item.app) return appDoc(item.code, { full: item.full, w: page.w, pad: PAD, color: isLightPage() ? '#18181b' : '#eee', theme: page.themeCss || '' });
  const root = item.full ? `width:${page.w}px;padding:0` : `width:max-content;max-width:${page.w - 2 * PAD}px;padding:${PAD}px`;
  // <base target=_blank> + no allow-popups in the sandbox = links never navigate the canvas frame away
  // scroll-driven effects (animation-timeline:view()) never scroll inside a canvas frame as tall as the page:
  // they would freeze half-way (faded, shifted headings), so on the canvas they show their final state
  return `<!doctype html><html><head>${CSP}<base target="_blank"><meta name="color-scheme" content="dark"><style>*{animation-timeline:auto!important}:where(canvas[data-oc-model]){display:inline-block;width:640px;vertical-align:middle}:root{color-scheme:dark}html,body{margin:0;background:transparent;color:${isLightPage() ? '#18181b' : '#eee'};font-family:system-ui;overflow:hidden}button{white-space:nowrap}#__root{display:inline-block;box-sizing:border-box;${root}}</style>${page.themeCss ? `<style id="__theme">${page.themeCss}</style>` : ''}</head><body><div id="__root">${item.code}</div></body></html>`;
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
  frame.addEventListener('load', () => { frame._max = null; frame._loaded = true; measure(frame); setTimeout(() => measure(frame), 300); });
  el.classList.add('entering'); el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
  board.append(el); nodes.set(item.id, el); return el;
}
function render(){
  persist();
  $('itemCount').textContent = items.length + (items.length === 1 ? ' element' : ' elements');
  // removed elements fade out instead of vanishing
  for (const [id, el] of nodes) if (!items.some(x => x.id === id)) {
    nodes.delete(id); el.style.pointerEvents = 'none'; el._live?.dispose(); el._live = null;
    const a = el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: reduceMotion() ? 0 : 160, easing: 'ease-in' });
    a.onfinish = () => el.remove();
  }
  items.forEach((item, i) => {
    const el = nodes.get(item.id) || createNode(item);
    const frame = el.querySelector('iframe');
    const key = item.code + '|' + (item.full ? page.w : 0) + '|' + isLightPage() + '|' + !!item.app;
    if (el._key !== key) { el._key = key; frame.title = item.name; frame._loaded = false; el.classList.remove('is-app-error'); frame.setAttribute('sandbox', item.app ? 'allow-scripts' : 'allow-same-origin'); frame.srcdoc = nodeDoc(item); }
    el.querySelector('.node-tag').textContent = item.name;
    if (item.scene) mount3D(el, item); else if (el._live) { el._live.dispose(); el._live = el._sceneKey = null; el.classList.remove('has-live'); }
    el.style.left = item.x + 'px'; el.style.top = item.y + 'px'; el.style.zIndex = i + 1;
    el.classList.toggle('selected', picked.has(item.id) || selected === item.id);
    el.classList.toggle('locked', !!item.locked);
    el.classList.toggle('full', !!item.full);
    el.classList.toggle('is-app', !!item.app);
  });
  $('canvasEmpty').classList.toggle('hidden', items.length > 0);
  renderLayers();
  layout();
}
// App frames can't be measured from outside (opaque origin): they post their size and script errors
addEventListener('message', e => {
  const d = e.data; if (!d || d.ocApp !== 1 || !e.source) return;
  for (const [id, el] of nodes) {
    const frame = el.querySelector('iframe'); if (frame.contentWindow !== e.source) continue;
    if (d.error) { el.classList.add('is-app-error'); el.querySelector('.node-tag').title = 'script error: ' + d.error; if (codeFocus !== undefined) return; // code mode is open: code.js shows the error and fixes it
      setState(`${t('app')} “${items.find(x => x.id === id)?.name || 'app'}”: ${d.error} — ${t('ask the AI to fix it')}`, 'warn'); offerFix(id, d.error); return; }
    frame._loaded = true;
    const w = Math.min(Math.max(+d.w || 0, 48), 5000), h = Math.min(Math.max(+d.h || 0, 32), 5000);
    if (!items.find(x => x.id === id)?.full) frame.style.width = w + 'px';
    frame.style.height = h + 'px'; layout(); return;
  }
});
// A script error in an app: the chat shows it with a one-click fix (once per version of the app)
const fixOffered = new Set();
function offerFix(id, error){
  const it = items.find(x => x.id === id); if (!it || fixOffered.has(it.code)) return;
  fixOffered.add(it.code);
  message(`${t('The app has a script error:')} ${error}`, 'assistant');
  const row = document.createElement('div'); row.className = 'msg-cta';
  row.innerHTML = `<button class="btn primary" type="button">${escapeHTML(t('fix it'))}</button>`;
  row.querySelector('button').onclick = () => { row.remove(); runAI(t('Fix the script error'), { targetId: id, ask: `Use action "update". Fix this script error in the app and return the complete corrected app: "${error}". Check that every element the script looks up exists in the markup and that every button still works.` }); };
  $('messages').append(row); toBottom();
}
// 3D elements: the iframe shows the rendered picture (what exports and published pages get); on the
// canvas a live, animated Three.js view sits on top of it. Three.js loads only when a 3D element exists.
let scene3d = null;
const load3d = () => (scene3d ||= import('./scene3d.js'));
function mount3D(el, item){
  const key = JSON.stringify(item.scene);
  if (el._sceneKey === key) return;
  el._sceneKey = key;
  load3d().then(m => {
    if (el._sceneKey !== key || !el.isConnected) return;
    el._live?.dispose(); el._live = m.mountLive(el, item.scene); el._live.setInteractive(playing); el.classList.add('has-live');
  }).catch(() => {});
}
async function downloadGLB(id){
  const x = items.find(i => i.id === id); if (!x?.scene) return;
  const m = await load3d(); const blob = await m.toGLB(x.scene);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (x.name || 'model').replace(/[\\/:*?"<>|\s]+/g, '-') + '.glb'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setState('saved: ' + a.download + ' — opens in Blender, Unity, Godot, Roblox Studio (3D Importer)…', 'ok');
}
const siteMode = () => items.length > 0 && items.every(i => i.full && !i.scene);
function pageHeightNow(){ const b = Math.max(contentBottom(), draftBottom); if (siteMode() && b > 0) return b; return b > page.h ? b + 48 : page.h; }
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
  // full-width sections start at the very top (a gap there would show a strip of page background)
  let dragging = false; try { dragging = !!drag; } catch {} // layout() also runs at startup, before `drag` exists
  if (siteMode() && !dragging) {
    const top = Math.min(...items.map(i => i.y));
    if (top > 0) { for (const it of items) { it.y -= top; const el = nodes.get(it.id); if (el) el.style.top = it.y + 'px'; } store.set('form-canvas-v3', items); }
  }
  // the page only grows (with a 48px margin) when content really goes past its height — exact sizes stay exact
  const h = pageHeightNow();
  board.style.width = page.w + 'px'; board.style.height = h + 'px';
  board.style.background = page.bg;
  board.style.transform = `scale(${zoom})`;
  board.style.setProperty('--inv', String(1 / zoom));
  board.classList.toggle('light', isLightPage());
  $('canvasEmpty')?.classList.toggle('on-light', isLightPage()); // its title sits on the page itself
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
  label.innerHTML = `page · <input type="number" min="${PAGE_MIN.w}" max="${PAGE_MAX}" step="1" value="${+page.w || 0}" aria-label="Width"> × <input type="number" min="${PAGE_MIN.h}" max="${PAGE_MAX}" step="1" value="${+page.h || 0}" aria-label="Height"> <button class="btn mini" type="button">ok</button>`;
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
  pushHistory(resizing.before); resizing = null;
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
// Live build (build-stage.js): the draft of the element being built sits on the board itself — at the end of the
// page for a new page, at a free spot for a small component, over the element being edited for a change
let draftBottom = 0;
const rootCss = full => full ? `width:${page.w}px;padding:0` : `width:max-content;max-width:${page.w - 2 * PAD}px;padding:${PAD}px`;
function liveStage(target){
  if (codeFocus !== undefined) return null; // the Code screen covers the canvas
  const edit = target && !target.scene && !target.app ? target : null;
  return {
    board, width: page.w,
    doc: () => nodeDoc({ full: true, code: '' }),
    initial: edit ? edit.code : '', target: edit ? nodes.get(edit.id) : null,
    place: full => edit ? { x: edit.x, y: edit.y, rootCss: rootCss(!!edit.full) } : full ? { x: 0, y: snap(contentBottom()), rootCss: rootCss(true) } : { ...freeSpot(), rootCss: rootCss(false) },
    reveal: (y, h) => {
      const top = y * zoom + STAGE_PAD, bottom = top + Math.min(h, 360) * zoom;
      // keep the part being written in view: its top, or its bottom when it's taller than the view
      if (top < canvas.scrollTop + 40 || bottom > canvas.scrollTop + canvas.clientHeight - 40) canvas.scrollTo({ top: Math.max(0, top - 120, bottom - canvas.clientHeight + 120), behavior: 'smooth' });
    },
    grow: b => { if (b !== draftBottom) { draftBottom = b; layout(); } },
    // 3D objects appear on the stage as soon as their tag is written (a still picture; the live one comes with the result)
    model: q => load3d().then(m => m.renderModel(q, 420)),
  };
}
function add(name, code, opts = {}){
  checkpoint();
  const full = !!opts.full;
  const pos = opts.pos || (full ? { x: 0, y: snap(contentBottom()) } : freeSpot());
  const item = { id: crypto.randomUUID(), name, code, ...pos, ...(full ? { full: true } : {}), ...(opts.scene ? { scene: opts.scene } : {}), ...(opts.app ? { app: true } : {}) };
  items.push(item); selected = item.id; render();
  requestAnimationFrame(() => { const ty = item.y * zoom + STAGE_PAD; if (ty < canvas.scrollTop || ty > canvas.scrollTop + canvas.clientHeight - 80) canvas.scrollTo({ top: ty - 80, behavior: 'smooth' }); });
}
function remove(id){ const i = items.findIndex(x => x.id === id); if (i < 0) return; checkpoint(); items.splice(i, 1); if (selected === id) selected = null; render(); }
function duplicate(id){ const x = items.find(i => i.id === id); if (x) add(x.name, x.code, { full: x.full, scene: x.scene, app: x.app, pos: x.full ? undefined : { x: x.x + 24, y: x.y + 24 } }); }
function toFront(id){ const i = items.findIndex(x => x.id === id); if (i < 0 || i === items.length - 1) return; checkpoint(); items.push(items.splice(i, 1)[0]); render(); }
function toBack(id){ const i = items.findIndex(x => x.id === id); if (i <= 0) return; checkpoint(); items.unshift(items.splice(i, 1)[0]); render(); }
// ✦ Make it better: a senior designer reviews the element and returns it improved; the reply lists the fixes
const IMPROVE = `DESIGN REVIEW. Act as a senior product designer. Critically review the Current element: visual hierarchy, spacing rhythm and alignment, typography scale, contrast and readability, colour harmony, consistency, hover/focus states, awkward empty space, and how it would fit on a phone. Then return the COMPLETE improved element with action "update": the same purpose, content and language, noticeably better design. In "reply", list the 3-6 most important fixes you made as short lines starting with "• ".`;
const RECOLOR = mode => `RECOLOR to a ${mode} theme. Return the COMPLETE Current element with action "update": identical layout, structure, text, images, icons and sizes — change ONLY colors (backgrounds, text, borders, shadows, gradients, hover states) so it looks native on a ${mode === 'dark' ? 'dark page (background #0b0b0f)' : 'light page (background #ffffff)'}. Keep the accent hue and brand colours; text must have strong contrast. In "reply" write one short line about what changed.`;
// After a page is built: one-click chips for the usual sections it doesn't have yet
const NEXT = [
  [/testimonial|review|отзыв|yorum|testimonio|bewertung/i, 'Testimonials', 'a testimonials section with 3 customer quotes'],
  [/pric|тариф|цен|fiyat|precio|preis/i, 'Pricing', 'a pricing section with 3 plans'],
  [/faq|frequently|вопрос|soru|pregunta|fragen/i, 'FAQ', 'an FAQ section with 5 common questions'],
  [/feature|benefit|преимущ|возможност|özellik|ventaja|vorteil/i, 'Features', 'a features section with 6 benefits and icons'],
  [/<form/i, 'Contact form', 'a contact form section (name, email, message)'],
  [/<footer|footer/i, 'Footer', 'a footer with links and contacts'],
];
function suggestNext(){
  document.querySelectorAll('#messages .msg-next').forEach(n => n.remove());
  if (!items.some(i => i.full)) return; // only for pages, not single components
  const all = items.map(i => i.name + ' ' + i.code).join(' ');
  const miss = NEXT.filter(([re]) => !re.test(all)).slice(0, 3);
  if (!miss.length) return;
  const row = document.createElement('div'); row.className = 'msg-next';
  row.innerHTML = `<span>${escapeHTML(t('add next:'))}</span>` + miss.map(([, label], i) => `<button type="button" data-i="${i}">＋ ${escapeHTML(t(label))}</button>`).join('');
  row.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    row.remove();
    const [, label, what] = miss[+b.dataset.i];
    runAI(`＋ ${t(label)}`, { ask: `Add ${what} as a NEW block: use action "add" with full: true. Match the existing page exactly: the same colours, fonts, corner radius and spacing; write the texts in the language of the page.` });
  };
  $('messages').append(row); toBottom();
}
async function recolorAll(mode){
  const list = items.filter(x => !x.scene);
  if (!list.length) { setState('nothing to recolor: the page is empty', 'warn'); return; }
  const spec = { ...BG_DEFAULT, ...(BG_PRESETS.find(b => (bgLum(b.spec) > .5) === (mode === 'light'))?.spec || {}) };
  setBackground(spec, mode === 'dark' ? '#0b0b0f' : '#ffffff');
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  for (const x of list) {
    if (!items.some(i => i.id === x.id)) continue;
    await runAI(`${mode === 'dark' ? '🌙' : '☀'} ${t(mode === 'dark' ? 'Dark version' : 'Light version')}: ${x.name}`, { targetId: x.id, ask: RECOLOR(mode) });
  }
}
function improve(id){
  const x = items.find(i => i.id === id); if (!x || x.scene) return;
  select(id); window.dispatchEvent(new CustomEvent('oc:open-chat'));
  runAI(`✦ ${t('Make it better')}: ${x.name}`, { targetId: id, ask: IMPROVE });
}
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
  if (item.locked) { select(item.id); return; }
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
  if (!drag.moved && Math.hypot(dx, dy) * zoom < (drag.item.full ? 14 : 3)) return;
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
  if (drag.moved) { pushHistory(drag.snapshot); layout(); persist(); }
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
  // keep it on screen; again on the next frame, once the labels are translated (they can get wider)
  const place = () => { const r = ctx.getBoundingClientRect(); ctx.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; ctx.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px'; };
  place(); requestAnimationFrame(place);
}
function closeCtx(){ ctx.classList.add('hidden'); }
ctx.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeCtx(); ctxEntries[+b.dataset.i].run(); });
addEventListener('pointerdown', e => { if (!ctx.contains(e.target)) closeCtx(); }, true);
addEventListener('blur', closeCtx);
canvas.addEventListener('scroll', closeCtx);
// A standalone icon on the canvas (recolour it with ✎ edit text & style)
// ✦ a picture drawn by the free AI, as its own block on the canvas
async function addAIPicture(){
  const { aiImage, askPicture } = await import('./ai-image.js');
  const what = askPicture(); if (!what) return;
  setState('the AI is drawing the picture…', 'busy');
  try {
    const data = await toDataURL(await aiImage(what), 1200, .8);
    add('AI picture', `<style>.oc-aipic{display:block;width:480px;max-width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}</style><img class="oc-aipic" src="${data}" alt="${escapeHTML(what.slice(0, 120))}">`);
    setState('picture added', 'ok');
  } catch (err) { setState(err.message, 'error'); }
}
async function addIcon(){
  const svg = await pickIcon(); if (!svg) return;
  add('Icon', `<style>.oc-icon{display:grid;place-items:center;width:64px;height:64px;color:${isLightPage() ? '#18181b' : '#f2ece9'}}.oc-icon svg{width:48px;height:48px}</style><div class="oc-icon">${svg}</div>`);
}
function nodeMenu(id){
  return [
    { label: '✦ edit with ai', run: () => editWithAI(id) },
    ...(items.find(i => i.id === id)?.scene ? [] : [{ label: '✦ make it better', run: () => improve(id) }]),
    { label: '⚗ fuse with…', run: () => startFusion(id) },
    { label: '✎ edit text & style', key: 'dbl-click', run: () => window.dispatchEvent(new CustomEvent('oc:edit-inline', { detail: id })) },
    { label: '‹/› code', run: () => edit(id) },
    ...(items.find(i => i.id === id)?.scene ? [{ label: '⬇ 3D model (.glb)', key: 'Blender, Unity…', run: () => downloadGLB(id) }] : []),
    { label: '★ save to my components', run: () => saveMine(id) },
    { label: 'rename', run: () => startRename(id) },
    items.find(i => i.id === id)?.locked
      ? { label: '🔓 unlock position', run: () => { checkpoint(); items = items.map(i => i.id === id ? { ...i, locked: false } : i); render(); setState('unlocked: the block can be moved again'); } }
      : { label: '🔒 lock position', run: () => { checkpoint(); items = items.map(i => i.id === id ? { ...i, locked: true } : i); render(); setState('locked: the block stays put (right-click → unlock)', 'ok'); } },
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
    { label: '★ add icon…', run: addIcon },
    { label: 'add custom code', run: () => edit(null) },
    { label: 'open templates', run: () => openWelcome('wl-templates') },
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
  $('layers').innerHTML = list.length ? list.map(x => `<div class="layer${x.id === selected ? ' active' : ''}" data-layer="${escapeHTML(x.id)}" title="${escapeHTML(x.name)}"><span class="layer-ic">${x.full ? '▤' : '▢'}</span>${renaming === x.id ? `<input class="layer-input" value="${escapeHTML(x.name)}" maxlength="80">` : `<span class="layer-name">${escapeHTML(x.name)}</span>`}<button data-layer-del title="Delete">×</button></div>`).join('') : '<div class="layers-empty">Nothing on the page yet</div>';
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
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); $(e.shiftKey ? 'redo' : 'undo').click(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); $('redo').click(); return; }
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

/* ── My components: elements saved from any project to reuse anywhere (kept in this browser) ── */
const MINE = 'My components', MINE_KEY = 'oc-mine', MINE_MAX = 400_000;
const MINE_ICON = '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>';
let mine = store.get(MINE_KEY, []); if (!Array.isArray(mine)) mine = [];
function saveMine(id){
  const it = items.find(x => x.id === id); if (!it) return;
  const entry = { id: crypto.randomUUID(), name: it.name, code: it.code, full: !!it.full, ...(it.scene ? { scene: it.scene } : {}), ...(it.app ? { app: true } : {}), at: Date.now() };
  if (JSON.stringify(entry).length > MINE_MAX) { setState('this element is too large to save — big pictures inside', 'warn'); return; }
  const next = [entry, ...mine];
  try { localStorage.setItem(MINE_KEY, JSON.stringify(next)); } catch { setState('no room left in this browser for more saved components', 'error'); return; }
  mine = next; openCats.add(MINE); store.set('oc-cats-open', [...openCats]);
  window.dispatchEvent(new CustomEvent('oc:show-view', { detail: 'library' }));
  renderLibrary(); $('library').scrollTo({ top: 0, behavior: 'smooth' });
  setState(`saved to my components: ${it.name}`, 'ok');
}
function removeMine(mid){
  const m = mine.find(x => x.id === mid); if (!m || !confirm(`Remove "${m.name}" from my components?`)) return;
  mine = mine.filter(x => x.id !== mid); store.set(MINE_KEY, mine); renderLibrary();
}
const mineCard = (m, k) => `<button class="component${m.full ? ' wide' : ''}" style="--i:${k}" data-add-mine="${m.id}" title="Add: ${escapeHTML(m.name)}"><span class="component-preview"><iframe title="${escapeHTML(m.name)}" sandbox="allow-same-origin" tabindex="-1" data-mine="${m.id}"></iframe></span><span class="component-info"><span>${escapeHTML(m.name)}</span><span class="component-del" data-del-mine="${m.id}" title="Remove from my components">×</span></span></button>`;
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
  if (!presets.length) { $('library').innerHTML = '<div class="catalog-empty">loading components…</div>'; return; }
  const query = $('catalogSearch').value.trim().toLocaleLowerCase();
  const indexed = presets.map((p, i) => ({ ...p, index: i })).filter(p => !p.hidden);
  const known = new Set(CATEGORIES.map(c => c.id));
  const cats = [...CATEGORIES, ...[...new Set(indexed.map(p => p.category))].filter(c => !known.has(c)).map(id => ({ id }))];
  const html = cats.map(c => {
    const list = indexed.filter(p => p.category === c.id && (p.name + ' ' + p.category).toLocaleLowerCase().includes(query));
    if (!list.length) return '';
    const open = query ? true : openCats.has(c.id);
    return `<section class="cat${open ? ' open' : ''}"><button class="cat-head" data-cat="${escapeHTML(c.id)}" aria-expanded="${open}">${catChevron}${catIcon(c)}<span class="cat-name">${escapeHTML(c.id)}</span><span class="cat-count">${list.length}</span></button>${open ? `<div class="cat-body">${list.map(card).join('')}</div>` : ''}</section>`;
  }).join('');
  const mineList = mine.filter(m => m.name.toLocaleLowerCase().includes(query));
  const mineOpen = query ? true : openCats.has(MINE);
  const mineHtml = mineList.length ? `<section class="cat cat-mine${mineOpen ? ' open' : ''}"><button class="cat-head" data-cat="${MINE}" aria-expanded="${mineOpen}">${catChevron}${catIcon({ icon: MINE_ICON })}<span class="cat-name">${MINE}</span><span class="cat-count">${mineList.length}</span></button>${mineOpen ? `<div class="cat-body">${mineList.map(mineCard).join('')}</div>` : ''}</section>` : '';
  $('library').innerHTML = (mineHtml + html) || '<div class="catalog-empty">nothing found</div>';
  document.querySelectorAll('[data-preset]').forEach(f => { const p = presets[+f.dataset.preset]; f.onload = () => requestAnimationFrame(() => { holdPreview(f); fitPreview(f); }); f.srcdoc = previewDoc(p.code, p.full); });
  document.querySelectorAll('[data-mine]').forEach(f => { const m = mine.find(x => x.id === f.dataset.mine); if (!m) return; f.onload = () => requestAnimationFrame(() => { holdPreview(f); fitPreview(f); }); f.srcdoc = previewDoc(m.code, m.full); });
  scaleWidePreviews();
}
// Sections render at 1280px wide and scale down to the card size
function scaleWidePreviews(){ document.querySelectorAll('.component.wide .component-preview').forEach(pv => { const f = pv.querySelector('iframe'); f.style.transform = `scale(${pv.clientWidth / 1280})`; }); }
// Components render at their real size in a large frame, then shrink to fit the card whole and centered
function fitPreview(f){
  const pv = f.closest('.component-preview'); if (!pv || f.closest('.component.wide')) return;
  try {
    const doc = f.contentDocument; if (!doc?.body) return;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of doc.body.children) {
      if (el.tagName === 'STYLE') continue;
      const box = el.getBoundingClientRect(); if (!box.width && !box.height) continue;
      l = Math.min(l, box.left); t = Math.min(t, box.top); r = Math.max(r, box.right); b = Math.max(b, box.bottom);
    }
    if (!Number.isFinite(l)) return;
    const W = pv.clientWidth, H = pv.clientHeight, pad = 10;
    const s = Math.min((W - pad * 2) / (r - l), (H - pad * 2) / (b - t), 0.85);
    f.style.transform = `translate(${W / 2 - (l + (r - l) / 2) * s}px, ${H / 2 - (t + (b - t) / 2) * s}px) scale(${s})`;
  } catch {}
}
addEventListener('resize', () => { scaleWidePreviews(); document.querySelectorAll('.component:not(.wide) .component-preview iframe').forEach(fitPreview); });
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
  const d = e.target.closest('[data-del-mine]'); if (d) { e.stopPropagation(); removeMine(d.dataset.delMine); return; }
  const mb = e.target.closest('[data-add-mine]'); if (mb) { const m = mine.find(x => x.id === mb.dataset.addMine); if (m) add(m.name, m.code, { full: m.full, ...(m.scene ? { scene: m.scene } : {}) }); return; }
  const b = e.target.closest('[data-add]'); if (b) { const p = presets[+b.dataset.add]; add(p.name, p.code, { full: p.full }); } };

/* ── Modals and code ─────────────────────────────────────── */
function showModal(id){ $(id).classList.remove('hidden'); }
document.querySelectorAll('[data-close]:not([data-close="authModal"])').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
document.querySelectorAll('.modal:not(#authModal)').forEach(m => m.onclick = e => { if (e.target === m) m.classList.add('hidden'); });
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
function stepHistory(from, to){
  if (!from.length) return;
  to.push(JSON.stringify(items)); if (to.length > 50) to.shift();
  items = JSON.parse(from.pop()); if (!items.some(x => x.id === selected)) selected = null;
  picked.clear(); render(); syncUndo();
}
$('undo').onclick = () => stepHistory(history, future);
$('redo').onclick = () => stepHistory(future, history);
syncUndo();

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
// The rendered element frames of the current screen, for snapshot()
const liveFrames = () => items.map(it => ({ doc: nodes.get(it.id)?.querySelector('iframe')?.contentDocument, x: it.x, y: it.y, name: it.name })).filter(f => f.doc);
// Visual nodes of every screen ([{ name, slug, page, nodes }]), or null for a single-screen project
async function snapshotScreens(ex){
  if (!(studio.screens?.count() > 1)) return null;
  return studio.screens.collect(() => ex.snapshot(liveFrames()));
}
async function exportTo(t){
  const multi = studio.screens?.count() > 1;
  if (!items.length && !multi) { setState('nothing to export: the page is empty', 'warn'); return; }
  const title = nameEl.textContent.trim() || 'My interface';
  const withH = items.map(it => ({ ...it, h: nodes.get(it.id)?.offsetHeight || 0 }));
  try {
    setState('exporting…', 'busy');
    const ex = await import('./exporters.js');
    if (['luau', 'luau-scale', 'rbxmx', 'love'].includes(t.id)) {
      const screens = t.id === 'love' ? null : await snapshotScreens(ex);
      const snap = screens ? null : ex.snapshot(liveFrames());
      if (t.id === 'love') download(ex.toLoveLua(snap, page, title), 'main.lua');
      else if (t.id === 'rbxmx') download(ex.toRobloxModel(snap, page, title, { screens }), fileBase() + t.ext, 'application/xml');
      else download(ex.toRobloxLuau(snap, page, title, { scale: t.id === 'luau-scale', screens }), fileBase() + (t.id === 'luau-scale' ? '.scale' : '') + t.ext);
      if (screens) message(`Exported ${screens.length} screens (${screens.map(s => s.name).join(', ')}). Only the first is visible at start; buttons linked to a screen switch to it.`, 'assistant');
    }
    else if (t.id === 'react') download(ex.toReact(withH, page, title), fileBase() + t.ext);
    else if (t.id === 'vue') download(ex.toVue(withH, page, title), fileBase() + t.ext);
    else if (t.id === 'svelte') download(ex.toSvelte(withH, page, title), fileBase() + t.ext);
  } catch (e) { setState('export failed: ' + e.message, 'error'); }
}
// Roblox Studio sync: the instance tree of all screens as JSON (see roblox/ and worker.js /api/sync)
export async function robloxSpec(){
  const ex = await import('./exporters.js');
  const screens = await snapshotScreens(ex);
  const title = nameEl.textContent.trim() || 'My interface';
  return ex.toRobloxSpec(screens ? null : ex.snapshot(liveFrames()), page, title, { screens });
}
// ✦ AI on one part of an element (picked in the inline editor): only that fragment is rewritten.
// `html` is the element's code with the part marked data-oc-target.
async function editPart(id, html, ask){
  const x = items.find(i => i.id === id); if (!x || !ask) return;
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!usable(m.pid)) { openSettings(); return; }
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const target = tpl.content.querySelector('[data-oc-target]'); if (!target) return;
  target.removeAttribute('data-oc-target');
  const css = [...tpl.content.querySelectorAll('style')].map(st => st.textContent).join('\n').slice(0, 12000);
  const tag = target.tagName.toLowerCase() + (target.classList[0] ? '.' + target.classList[0] : '');
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  message(`✦ <${tag}>: ${ask}`, 'user'); logChat('user', `✦ <${tag}>: ${ask}`);
  const stop = thinking({ ghost: false });
  try {
    const system = `Today is ${new Date().toISOString().slice(0, 10)} (the current year is ${new Date().getFullYear()}). You edit ONE fragment of an HTML component. Reply with ONLY one \`\`\`html block that contains the new version of the fragment and nothing else. Change only what the request asks; keep its text language, classes and everything else. If new CSS is needed, put ONE <style> block first inside the html block, with new class names starting with "ocx-". No JavaScript, no external URLs. Text must stay readable (explicit colors on changed backgrounds).`;
    const user = `Component CSS (for reference):\n${css}\n\nFragment:\n${target.outerHTML.slice(0, 20000)}\n\nRequest: ${ask}`;
    const content = await chat(p, key, m.id, system, user, [], (piece, why) => stop.live(piece, why));
    const raw = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
    const fence = raw.match(/```(?:html|HTML)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n```|$)/);
    const out = document.createElement('template'); out.innerHTML = (fence ? fence[1] : raw).trim();
    const styles = [...out.content.querySelectorAll('style')]; styles.forEach(st => st.remove());
    if (!out.content.textContent.trim() && !out.content.querySelector('*')) throw Error('The model returned an empty fragment');
    target.replaceWith(out.content);
    if (styles.length) {
      const extra = styles.map(st => st.textContent).join('\n');
      const first = tpl.content.querySelector('style');
      if (first) first.textContent += '\n' + extra; else { const st = document.createElement('style'); st.textContent = extra; tpl.content.prepend(st); }
    }
    const code = await fixContrast(fixYear(tpl.innerHTML), x.full);
    await stop.finish('updated the part'); setState('part updated', 'ok');
    checkpoint(); items = items.map(i => i.id === id ? { ...i, code } : i); render();
    message('Done — only that part changed. Ctrl+Z to undo.', 'assistant'); logChat('assistant', 'part updated');
  } catch (err) {
    stop(); setState(String(err.message || err), 'err'); message(`Couldn't change that part: ${err.message || err}`, 'assistant');
  }
}
async function exportWithAI(t){
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!usable(m.pid)) { openSettings(); $('chatStatus').textContent = 'AI export needs a connected AI provider.'; return; }
  window.dispatchEvent(new CustomEvent('oc:open-chat'));
  message(`Export the page to ${t.label}`, 'user');
  const stop = thinking();
  try {
    const system = `You convert web layouts into native UI code. Output ONLY the source code of ${t.lang} — no markdown fences, no explanations. Reproduce the layout, colors, typography, spacing, corner radii and text as faithfully as the target allows. Keep it compilable and self-contained.`;
    const html = buildHTML();
    const code = String(await chat(p, key, m.id, system, `Page "${nameEl.textContent.trim()}" (${page.w}×${page.h}). Source HTML:\n${html}`) || '').replace(/^\s*```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    if (!code.trim()) throw Error('empty response');
    await stop.compose(t.label, code); await stop.finish('downloaded'); download(code, fileBase() + t.ext); message(`Done — downloaded ${fileBase() + t.ext}. AI ports are a starting point: review before shipping.`, 'assistant');
  } catch (e) { stop(); setState('ai export failed', 'error'); message('AI export failed: ' + e.message, 'assistant'); }
}
$('export').onclick = () => {
  track('export');
  const r = $('export').getBoundingClientRect();
  openCtx(r.right - 260, r.bottom + 6, [
    { label: 'HTML page', key: '.html', run: exportHTML },
    { label: 'Static site', key: '.zip', run: () => exportZip('static') },
    { label: 'Vite + React project', key: '.zip', run: () => exportZip('react') },
    { label: 'Roblox Studio live sync', key: 'plugin', run: () => window.dispatchEvent(new CustomEvent('oc:roblox-sync')) },
    '-',
    ...TARGETS.map(t => ({ label: t.label, key: t.ext, run: () => exportTo(t) })),
    '-',
    ...AI_TARGETS.map(t => ({ label: '✦ ' + t.label, key: 'ai', run: () => exportWithAI(t) })),
  ]);
};
// Several screens → one page: each screen is a <section id="slug">, links to "#slug" switch screens with
// CSS :target alone (published pages have no scripts). The first screen shows when nothing is targeted.
// Blocks fade/slide in as they scroll into view (page.reveal). Pure CSS; browsers without
// scroll-driven animations simply show the blocks.
const revealCss = () => page.reveal ? `<style>@supports (animation-timeline: view()){@media (prefers-reduced-motion: no-preference){.oc-page>div,.oc-stack>section,.oc-stack>div{animation:oc-reveal linear both;animation-timeline:view();animation-range:entry 0% cover 20%}@keyframes oc-reveal{from{opacity:0;transform:translateY(36px) scale(.985)}}}}</style>` : '';
// Every AI-built page moves on scroll like the cinematic references: sections and cards rise in, pictures
// zoom in. Zero-specificity selectors (:where) so any animation the model wrote itself still wins;
// skipped when the page already has its own scroll animations.
const MOTION_CSS = '<style>@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){'
  + ':where([data-oc-motion]>:not(:first-child,header,nav,style,header+*)){animation:oc-rise linear both;animation-timeline:view();animation-range:entry 0% cover 30%}'
  + ':where([data-oc-motion] :is(article,li,figure,[class*="card"]):not(header *,nav *)){animation:oc-rise2 linear both;animation-timeline:view();animation-range:entry 0% cover 25%}'
  + ':where([data-oc-motion] :is(img,video):not(header *,nav *)){animation:oc-zoom linear both;animation-timeline:view();animation-range:entry 0% cover 40%}'
  + '@keyframes oc-rise{from{opacity:0;transform:translateY(64px)}}@keyframes oc-rise2{from{opacity:0;transform:translateY(32px) scale(.97)}}@keyframes oc-zoom{from{opacity:.3;transform:scale(.88)}}}}</style>';
function withMotion(code){
  if (/animation-timeline|data-oc-motion/.test(code)) return code;
  let done = false;
  const out = code.replace(/^((?:\s*<style[\s\S]*?<\/style>)*\s*)<([a-z][\w-]*)/i, (_, pre, tag) => (done = true, pre + '<' + tag + ' data-oc-motion'));
  return done ? MOTION_CSS + out : code;
}
function buildScreensHTML(list){
  const title = escapeHTML(nameEl.textContent.trim() || 'My interface');
  const css = [], html = [];
  for (const sc of list) {
    const pg = sc.page, id = sc.slug, its = sc.items;
    if (pg.themeCss) css.push(pg.themeCss.replace(/#__root/g, `#${id} .oc-page`));
    css.push(`#${id}{background:${pg.bg};background-attachment:fixed}`);
    let body;
    if (pg.layout === 'stack') {
      body = `<main class="oc-page oc-stack">\n${[...its].sort((a, b) => a.y - b.y).map(it => it.full ? `<section class="oc-full">\n${it.code}\n</section>` : `<div class="oc-block">\n${it.code}\n</div>`).join('\n')}\n</main>`;
    } else {
      const H = Math.max(pg.h, sc.height || 0);
      body = `<div class="oc-page" style="position:relative;width:${pg.w}px;height:${H}px;margin:0 auto">\n${its.map(it => it.full
        ? `<div style="position:absolute;left:0;top:${it.y}px;width:${pg.w}px">\n${it.code}\n</div>`
        : `<div style="position:absolute;left:${it.x}px;top:${it.y}px;padding:${PAD}px">\n${it.code}\n</div>`).join('\n')}\n</div>`;
    }
    html.push(`<section class="oc-screen" id="${id}" aria-label="${escapeHTML(sc.name)}">\n${body}\n</section>`);
  }
  const anyStack = list.some(s => s.page.layout === 'stack');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="${anyStack ? 'width=device-width,initial-scale=1' : `width=${list[0].page.w}`}"><title>${title}</title><style>
html,body{margin:0}body{min-height:100vh;background:${list[0].page.bg};color:${isLightPage() ? '#18181b' : '#eee'};font-family:system-ui}
.oc-screen{display:none;min-height:100vh}.oc-screen:first-of-type{display:block}
.oc-screen:target{display:block;animation:oc-in .28s cubic-bezier(.2,.7,.2,1)}
body:has(.oc-screen:target) .oc-screen:not(:target){display:none}
@keyframes oc-in{from{opacity:0;transform:translateY(10px)}}
@media(prefers-reduced-motion:reduce){.oc-screen:target{animation:none}}
.oc-stack{display:flex;flex-direction:column;gap:${STACK_GAP}px;min-height:100vh;overflow-x:hidden}
.oc-full{width:100%}.oc-full>*{max-width:100%;box-sizing:border-box}
.oc-block{display:flex;justify-content:center;padding:0 16px}.oc-block>*{max-width:100%;box-sizing:border-box}
${css.join('\n')}
</style>${revealCss()}</head><body>\n${html.join('\n')}\n</body></html>`;
}
// A free-layout page on smaller screens: tablets get the whole page scaled down to fit, phones get the
// blocks in one column (top-to-bottom order), full-width sections spanning the screen.
function freeResponsiveCss(){
  const W = page.w, PHONE = 760;
  if (W <= PHONE) return '';
  const steps = [];
  for (let hi = W - 1; hi > PHONE; hi = Math.floor(hi * .88)) steps.push(hi);
  const zooms = steps.map((hi, i) => { const lo = Math.max(PHONE + 1, steps[i + 1] ? steps[i + 1] + 1 : PHONE + 1); return `@media (max-width:${hi}px) and (min-width:${lo}px){.oc-page{zoom:${(lo / W).toFixed(4)}}}`; }).join('');
  return zooms + `@media (max-width:${PHONE}px){.oc-page{width:auto!important;height:auto!important;display:flex;flex-direction:column;gap:16px;padding:16px 0;box-sizing:border-box}.oc-b{position:static!important;order:var(--o);display:flex;justify-content:center;padding:0 12px!important;max-width:100%;box-sizing:border-box}.oc-b.oc-f{display:block;width:100%!important;padding:0!important}.oc-b>*{max-width:100%;box-sizing:border-box}.oc-b img{max-width:100%;height:auto}}`;
}
function hasApps(){
  const screens = studio.screens?.count() > 1 ? studio.screens.forHTML() : null;
  return screens ? screens.some(sc => sc.items.some(it => it.app)) : items.some(it => it.app);
}
const OC3D = 'https://openconstructor.pw/oc3d.js';
function buildHTML(){
  let html = buildPageHTML();
  if (hasApps()) html = withAppHead(html);
  // live 3D objects: the runtime (three.js inside, no network) — without it they stay still pictures
  if (/<canvas[^>]+data-oc-model=/.test(html)) html = html.replace(/<\/head>/i, '<style>:where(canvas[data-oc-model]){display:inline-block;width:640px;vertical-align:middle}</style></head>').replace(/<\/body>/i, `<script src="${OC3D}" defer></script></body>`);
  return html;
}
function buildPageHTML(){
  const screens = studio.screens?.count() > 1 ? studio.screens.forHTML() : null;
  if (screens) return buildScreensHTML(screens);
  if (isStack()) return buildStackHTML();
  const H = pageHeightNow();
  // --o = order from top to bottom, used when the page turns into one column on phones
  const rank = new Map([...items].sort((a, b) => a.y - b.y || a.x - b.x).map((it, i) => [it.id, i]));
  const body = items.map(it => it.full
    ? `<div class="oc-b oc-f" style="position:absolute;left:0;top:${it.y}px;width:${page.w}px;--o:${rank.get(it.id)}">\n${it.code}\n</div>`
    : `<div class="oc-b" style="position:absolute;left:${it.x}px;top:${it.y}px;padding:${PAD}px;--o:${rank.get(it.id)}">\n${it.code}\n</div>`).join('\n');
  const title = escapeHTML(nameEl.textContent.trim() || 'My interface');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0}body{min-height:100vh;background:${page.bg};background-attachment:fixed;color:${isLightPage() ? '#18181b' : '#eee'};font-family:system-ui}.oc-page{position:relative;width:${page.w}px;height:${H}px;margin:0 auto}${freeResponsiveCss()}</style>${page.themeCss ? `<style>${page.themeCss.replace(/#__root/g, '.oc-page')}</style>` : ''}${revealCss()}</head><body><div class="oc-page">\n${body}\n</div></body></html>`;
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
html,body{margin:0}body{min-height:100vh;background:${page.bg};background-attachment:fixed;color:${isLightPage() ? '#18181b' : '#eee'};font-family:system-ui}
.oc-page{display:flex;flex-direction:column;gap:${STACK_GAP}px;min-height:100vh;overflow-x:hidden}
.oc-full{width:100%}.oc-full>*{max-width:100%;box-sizing:border-box}
.oc-block{display:flex;justify-content:center;padding:0 16px}.oc-block>*{max-width:100%;box-sizing:border-box}
.oc-page img,.oc-page svg,.oc-page video,.oc-page canvas{max-width:100%;height:auto}
@media(max-width:640px){.oc-full [style*="grid-template-columns"],.oc-full [class*="grid"]{grid-template-columns:1fr!important}.oc-page h1{font-size:clamp(28px,8vw,48px)!important}}
</style>${theme}${revealCss()}</head><body><main class="oc-page">\n${body}\n</main></body></html>`;
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
    <div class="devices">${devices.map(d => `<figure class="device"><div class="device-screen"><iframe sandbox="allow-popups allow-popups-to-escape-sandbox${hasApps() ? ' allow-scripts' : ''}" title="${d.name}"></iframe></div><figcaption>${d.name} · ${d.w}px</figcaption></figure>`).join('')}</div></div>`;
  m.classList.remove('hidden');
  m.querySelector('[data-make-stack]')?.addEventListener('click', () => { setLayoutMode('stack'); requestAnimationFrame(() => requestAnimationFrame(openDevicePreview)); });
  // dark scrollbars, links open in a new tab, scripts stay off
  const apps = hasApps();
  const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';${apps ? " script-src 'unsafe-inline' 'unsafe-eval';" : ''} img-src data: blob:; font-src data:"><base target="_blank"><style>:root{color-scheme:dark}html{scrollbar-width:thin;scrollbar-color:#3a302d transparent}</style>`;
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
  playing = on; canvas.classList.toggle('playing', on); for (const el of nodes.values()) el._live?.setInteractive(on); $('playToggle').setAttribute('aria-pressed', on);
  $('playToggle').innerHTML = on ? '■<span class="lbl"> stop</span>' : '▶<span class="lbl"> play</span>';
  if (on) { select(null); setState('play mode: try hover, toggles, tabs · press P or ■ stop to edit again', 'busy'); } else setState('ready');
}
$('playToggle').onclick = () => setPlaying(!playing);
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('.modal:not(.hidden)')) setPlaying(!playing); });
// 📦 a whole project as .zip: static site or Vite + React app (export-zip.js)
async function exportZip(kind){
  if (!items.length && !(studio.screens?.count() > 1)) { setState('nothing to export: the page is empty', 'warn'); return; }
  const title = nameEl.textContent.trim() || 'My interface';
  try {
    setState('packing the project…', 'busy');
    const z = await import('./export-zip.js');
    const out = kind === 'react'
      ? z.reactApp({ items, page, title, reactSource: (await import('./exporters.js')).toReact })
      : z.staticSite({ html: buildHTML(), title });
    const a = document.createElement('a'); a.href = URL.createObjectURL(out.blob); a.download = out.file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setState('saved: ' + out.file, 'ok');
  } catch (e) { setState('export failed: ' + e.message, 'error'); }
}
function exportHTML(){
  if (!items.length) { setState('nothing to export: the page is empty', 'warn'); return; }
  download(buildHTML(), fileBase() + '.html', 'text/html');
}

// Status bar
let stateTimer;
// Results (done, saved, errors) also pop up as a short toast, so they aren't missed in the status bar
const toastBox = Object.assign(document.createElement('div'), { className: 'toasts' });
toastBox.setAttribute('aria-live', 'polite'); document.body.append(toastBox);
let lastToast = '', lastToastAt = 0;
function toast(text, kind = 'ok'){
  if (text === lastToast && Date.now() - lastToastAt < 2500) return;
  lastToast = text; lastToastAt = Date.now();
  const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = `<i aria-hidden="true"></i><span>${escapeHTML(text)}</span><button type="button" aria-label="Close">×</button>`;
  const hide = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  el.querySelector('button').onclick = hide;
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  setTimeout(hide, kind === 'error' ? 7000 : 3600);
}
function setState(text, kind = ''){
  if (kind === 'ok' || kind === 'error' || kind === 'warn') toast(text, kind);
  const el = $('sbState'); el.className = 'sb-item sb-state ' + kind; el.innerHTML = `<i></i>${escapeHTML(text)}`;
  clearTimeout(stateTimer);
  if (kind !== 'busy') stateTimer = setTimeout(() => { el.className = 'sb-item sb-state'; el.innerHTML = '<i></i>ready'; }, 4000);
}

/* ── AI providers, keys and model selection ──────────────── */
const logoFiles = import.meta.glob('./src/logos/*.svg', { query: '?raw', import: 'default', eager: true });
const logo = name => logoFiles[`./src/logos/${name}.svg`] || '';
// Pick the model logo from its name (Llama → Meta, Qwen → Qwen…), otherwise use the provider logo
const VENDOR_LOGOS = [[/llama|meta-/i, 'meta-color'], [/gemma/i, 'gemma-color'], [/gemini|google/i, 'gemini-color'], [/qwen|qwq/i, 'qwen-color'], [/mistral|mixtral|codestral|devstral|magistral|ministral|pixtral/i, 'mistral-color'], [/deepseek/i, 'deepseek-color'], [/claude/i, 'claude-color'], [/gpt|^o\d|openai|chatgpt/i, 'openai'], [/grok|x-ai/i, 'xai'], [/kimi|moonshot/i, 'kimi-color'], [/nemotron|nvidia/i, 'nvidia-color'], [/glm|z-ai|zhipu/i, 'zai'], [/minimax/i, 'minimax-color'], [/phi-|microsoft/i, 'microsoft-color'], [/cohere|command|north/i, 'cohere-color'], [/hermes|nous/i, 'nousresearch'], [/liquid|lfm/i, 'liquid'], [/arcee/i, 'arcee-color'], [/dots/i, 'dotsstudio'], [/ernie|baidu|wenxin/i, 'baidu-color'], [/bytedance|seed-|doubao/i, 'bytedance-color'], [/stepfun|step-/i, 'stepfun-color'], [/perplexity|sonar/i, 'perplexity-color'], [/amazon|nova-/i, 'nova-color'], [/ibm|granite/i, 'ibm'], [/inflection/i, 'inflection'], [/reka/i, 'reka'], [/upstage|solar/i, 'upstage-color'], [/aion/i, 'aionlabs-color'], [/kwaipilot|kat-/i, 'kwaipilot-color'], [/longcat|meituan/i, 'longcat-color'], [/morph/i, 'morph-color'], [/allenai|olmo|molmo/i, 'ai2-color'], [/tencent|hunyuan/i, 'tencent-color'], [/alibaba|tongyi/i, 'alibaba-color'], [/inception|mercury/i, 'inception'], [/ai21|jamba/i, 'ai21'], [/hugging/i, 'huggingface-color'], [/moonshot/i, 'moonshot']];
function modelLogo(m){
  if (m.pid === 'oc') return `<span class="model-logo">${logoSvg}</span>`;
  const hit = VENDOR_LOGOS.find(([re]) => re.test(`${m.id} ${m.name} ${m.vendor || ''}`));
  const svg = logo(hit ? hit[1] : byId(m.pid)?.logo);
  return svg ? `<span class="model-logo">${svg}</span>` : `<span class="model-logo letter">${escapeHTML((m.vendor || m.name || '?')[0].toUpperCase())}</span>`;
}
const providerLogo = p => `<span class="model-logo">${p.kind === 'proxy' ? logoSvg : logo(p.logo)}</span>`;
const fmtUsd = v => '$' + (v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(2) : +v.toFixed(3));
const fmtPrice = pr => `${fmtUsd(pr[0])} · ${fmtUsd(pr[1])}`;
// "free" means $0 to use: OpenRouter's :free models (price 0), the free AI, and the models of no-cost tiers
const isFree = (m, p) => p.kind === 'proxy' || (p.id === 'openrouter' ? !m.paid && (/:free$/.test(m.id) || m.id === 'openrouter/free') : !m.paid && !!p.free && !m.price);
const fmtCtx = n => !n ? '' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1e3) + 'K';

// Keys are remembered on this device by default, encrypted (keyvault.js), and shared by every tab.
// With "remember" off they live only in this tab (sessionStorage) and the vault is emptied.
let remember = store.get('oc-keys-remember', true);
let keys = {};
const SESSION_KEYS = 'oc-keys-session';
// switched off in the "AI keys" dialog: the key stays saved, the service's models leave the list until it's switched on
const keysOff = new Set(store.get('oc-keys-off', []));
const saveOff = () => store.set('oc-keys-off', [...keysOff]);
const active = pid => !!keys[pid] && !keysOff.has(pid);
function saveKeys(){
  store.set('oc-keys-remember', remember);
  if (remember) {
    try { sessionStorage.removeItem(SESSION_KEYS); } catch {}
    vault.saveKeys(keys).catch(() => setState('could not save keys on this device', 'error'));
  } else {
    try { sessionStorage.setItem(SESSION_KEYS, JSON.stringify(keys)); } catch {}
    vault.clearKeys().catch(() => {});
  }
}
async function readKeys(){
  if (remember) return vault.loadKeys();
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEYS) || '{}') || {}; } catch { return {}; }
}
// Another tab added, changed or removed a key: pick it up here too
vault.onKeysChanged(async () => {
  if (!remember) return;
  const next = await vault.loadKeys().catch(() => null); if (!next) return;
  const changed = PROVIDERS.filter(p => (next[p.id] || '') !== (keys[p.id] || ''));
  keys = next; changed.forEach(loadProvider);
  if (!changed.length) { renderProviders(); renderPicker(); }
});

const AUTO = { id: 'openrouter/free', name: 'Auto', vendor: 'OpenRouter', note: 'best available model' };
const modelsBy = {}, modelErr = {}, loading = {};
// new visitors start on the free openconstructor AI (no key, sign-in required)
let currentModel = store.get('form-model', 'oc::auto');
if (/^oc::(?!auto$)/.test(currentModel)) currentModel = 'oc::auto'; // older free-AI model ids
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
const usable = pid => byId(pid)?.kind === 'proxy' || active(pid);
export const canSend = () => usable(current().pid);
let quota = null; // { used, limit } for the free AI
const quotaText = () => !authUser ? ' · 3 free tries a day' : quota ? ` · ${quota.used}/${quota.limit} today` : ' · 20 free a day';
window.addEventListener('oc-quota', e => { quota = e.detail; renderPicker(); });
window.addEventListener('oc:auth', () => { quota = null; if (authUser) { freeQuota().catch(() => {}); track('signin', { once: true }); } renderPicker(); renderProviders(); });
// daily visitors; returning visitors skip the welcome screen and land in the editor straight away
track('visit', { once: true });
try { if (localStorage.getItem('oc-welcomed') && location.hash !== '#welcome') track('editor', { once: true }); } catch {}

const picker = document.createElement('div');
picker.className = 'model-picker';
picker.innerHTML = `<button type="button" class="model-trigger" aria-haspopup="listbox" aria-expanded="false"></button><div class="model-menu hidden" role="listbox"><div class="model-search"><span>/</span><input placeholder="find a model" aria-label="Find a model"></div><div class="model-list"></div><button type="button" class="model-add">+ connect providers</button></div>`;
$('model').classList.add('hidden');
$('model').after(picker);
// ×3: the AI makes three different versions and you pick one (uses three generations)
let variantsOn = store.get('oc-variants', false);
const variantsBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'variants-toggle', id: 'variantsToggle', textContent: '⧉ ×3', title: 'Three different versions to choose from (uses 3 generations)' });
variantsBtn.setAttribute('aria-pressed', String(variantsOn));
variantsBtn.onclick = () => { variantsOn = !variantsOn; store.set('oc-variants', variantsOn); variantsBtn.setAttribute('aria-pressed', String(variantsOn)); setState(variantsOn ? 'next request: 3 variants to choose from' : 'one answer per request', 'ok'); };
picker.after(variantsBtn);
// app: the AI builds a working mini-app (with JavaScript) instead of a static block
let appOn = store.get('oc-app-mode', false);
const appBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'app-toggle', id: 'appToggle', innerHTML: '<span aria-hidden="true">&lt;/&gt;</span> app', title: t('Working mini-apps: calculators, quizzes, trackers, timers, small games') });
const promptHint = () => { const pr = document.querySelector('#react-composer textarea'); if (!pr) return setTimeout(promptHint, 400); pr.dataset.hint ??= pr.placeholder || ''; pr.placeholder = appOn ? t('Describe an app: a calculator, quiz, tracker, timer, small game…') : pr.dataset.hint; };
function setAppMode(on, quiet){ appOn = !!on; store.set('oc-app-mode', appOn); appBtn.setAttribute('aria-pressed', String(appOn)); document.body.classList.toggle('app-mode', appOn); promptHint(); if (!quiet) setState(appOn ? 'app mode: the AI builds working mini-apps' : 'page mode: the AI builds pages and blocks', 'ok'); }
appBtn.onclick = () => setAppMode(!appOn);
variantsBtn.after(appBtn);
requestAnimationFrame(() => setAppMode(appOn, true));
// Both buttons stay hidden in the DOM (tests and the Code screen click them); the message box drives them with / commands
const modesChanged = () => window.dispatchEvent(new CustomEvent('oc:modes'));
variantsBtn.addEventListener('click', modesChanged); appBtn.addEventListener('click', modesChanged);

// ── Agent team: how many agents build a new page at once, plus the user's own agents (each with its own role and model)
const AGENTS_MIN = 3, AGENTS_MAX = 20, FREE_AGENTS = 9; // the free AI allows 10 calls per request: a planner + 9 agents
let agentsN = Math.max(AGENTS_MIN, Math.min(AGENTS_MAX, +store.get('oc-agents-n', 7) || 7));
let myAgents = (Array.isArray(store.get('oc-my-agents', [])) ? store.get('oc-my-agents', []) : []).slice(0, 8);
const saveAgents = () => { store.set('oc-agents-n', agentsN); store.set('oc-my-agents', myAgents); modesChanged(); };
const agentLimit = () => byId(current().pid)?.kind === 'proxy' ? Math.min(agentsN, FREE_AGENTS) : agentsN;
const AGENT_IDEAS = [
  { name: 'Pricing', role: 'Builds a pricing section: 3 clear plans with real prices, the middle one highlighted, a short FAQ line under it.' },
  { name: 'Reviews', role: 'Builds a testimonials section: 6 short, specific customer reviews with names, roles and avatars.' },
  { name: '3D showcase', role: 'Builds a showcase section around one big real 3D object (model: picture) with three short facts next to it.' },
  { name: 'FAQ', role: 'Builds an FAQ section: 6 sharp questions a real customer would ask, with honest short answers, as an accordion.' },
];
const agentSlug = s => String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 20) || 'agent';
function agentsModal(){
  let m = $('agentsModal');
  if (!m) {
    m = document.createElement('div'); m.className = 'modal hidden'; m.id = 'agentsModal'; document.body.append(m);
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-close]')) return m.classList.add('hidden');
      const row = e.target.closest('[data-agent]'), i = row ? +row.dataset.agent : -1;
      if (e.target.closest('[data-agent-del]')) { myAgents.splice(i, 1); saveAgents(); return paintAgents(); }
      if (e.target.closest('[data-agent-on]')) { myAgents[i].on = !myAgents[i].on; saveAgents(); return paintAgents(); }
      const idea = e.target.closest('[data-idea]');
      if (idea || e.target.closest('[data-agent-add]')) {
        if (myAgents.length >= 8) return;
        const base = idea ? AGENT_IDEAS[+idea.dataset.idea] : { name: 'My agent', role: '' };
        myAgents.push({ id: Math.random().toString(36).slice(2, 9), name: t(base.name), role: base.role, model: '', on: true }); saveAgents(); paintAgents();
        requestAnimationFrame(() => m.querySelector(`[data-agent="${myAgents.length - 1}"] ${idea ? 'select' : 'input'}`)?.focus());
      }
    });
    m.addEventListener('input', e => {
      if (e.target.id === 'agentsN') { agentsN = +e.target.value; e.target.style.setProperty('--p', (agentsN - AGENTS_MIN) / (AGENTS_MAX - AGENTS_MIN) * 100 + '%'); const nb = m.querySelector('.ag-n'); nb.textContent = agentsN; nb.classList.remove('tick'); void nb.offsetWidth; nb.classList.add('tick'); saveAgents(); paintCount(); return; }
      const row = e.target.closest('[data-agent]'); if (!row) return;
      const a = myAgents[+row.dataset.agent], f = e.target.dataset.f;
      if (a && f) { a[f] = e.target.value.slice(0, f === 'role' ? 400 : 40); saveAgents(); }
    });
  }
  return m;
}
const usableModels = () => allModels().filter(x => x.id !== 'openrouter/free' && usable(x.pid));
function paintCount(){
  const m = $('agentsModal'), note = m?.querySelector('.ag-free'); if (!note) return;
  note.hidden = !(byId(current().pid)?.kind === 'proxy' && agentsN > FREE_AGENTS);
}
function paintAgents(){
  const m = agentsModal(), models = usableModels();
  const opt = a => `<option value="">${escapeHTML(t('same model as the chat'))}</option>` + models.map(x => `<option value="${escapeHTML(x.key)}"${x.key === a.model ? ' selected' : ''}>${escapeHTML((byId(x.pid)?.name || x.pid) + ' · ' + (x.name || x.id))}</option>`).join('');
  m.innerHTML = `<div class="modal-card wide agents-card"><div class="modal-head"><h2>${escapeHTML(t('Agent team'))}</h2><button type="button" class="ag-close" data-close aria-label="${escapeHTML(t('close'))}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
<p class="muted">${escapeHTML(t('On a new page the lead agent plans the sections, then every agent builds its part at the same time — each one is a cursor on the canvas.'))}</p>
<label class="ag-count"><span>${escapeHTML(t('Agents per page'))}</span><input type="range" id="agentsN" min="${AGENTS_MIN}" max="${AGENTS_MAX}" value="${agentsN}" style="--p:${(agentsN - AGENTS_MIN) / (AGENTS_MAX - AGENTS_MIN) * 100}%"><b class="ag-n">${agentsN}</b></label>
<p class="ag-free muted" hidden>${escapeHTML(t('The free AI runs up to 9 at once — connect your own key for 20.'))}</p>
<div class="ag-head"><h3>${escapeHTML(t('Your agents'))}</h3><span class="muted">${escapeHTML(t('each one adds its own section to every new page, with its own model'))}</span></div>
<div class="ag-list">${myAgents.map((a, i) => `<div class="ag-row${a.on ? '' : ' off'}" data-agent="${i}"><span class="ag-dot" style="--c:${['#7dd3fc', '#f9a8d4', '#a7f3d0', '#fde68a', '#c4b5fd', '#fdba74', '#93c5fd', '#fca5a5'][i % 8]}"></span><input data-f="name" value="${escapeHTML(a.name)}" maxlength="40" aria-label="${escapeHTML(t('Agent name'))}"><select data-f="model" aria-label="${escapeHTML(t('Model'))}">${opt(a)}</select><button type="button" class="switch" role="switch" aria-checked="${!!a.on}" data-agent-on aria-label="on"><i></i></button><button type="button" class="ag-close ag-del" data-agent-del title="${escapeHTML(t('remove'))}" aria-label="${escapeHTML(t('remove'))}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><textarea data-f="role" rows="2" maxlength="400" placeholder="${escapeHTML(t('What it builds, e.g. a pricing section with 3 plans'))}">${escapeHTML(a.role)}</textarea></div>`).join('') || `<div class="ag-empty muted">${escapeHTML(t('No agents of your own yet — start from an idea:'))}</div>`}</div>
<div class="ag-ideas">${myAgents.length < 8 ? AGENT_IDEAS.map((x, i) => `<button type="button" class="chip" data-idea="${i}">+ ${escapeHTML(t(x.name))}</button>`).join('') + `<button type="button" class="chip" data-agent-add>+ ${escapeHTML(t('blank agent'))}</button>` : ''}</div>
<div class="modal-actions"><button class="btn primary" data-close>${escapeHTML(t('done'))}</button></div></div>`;
  paintCount();
}
function openAgents(){ paintAgents(); showModal('agentsModal'); }

// ── / commands in the message box. Toggles act at once; prompt commands are sent with an expert instruction attached
const SLASH_PROMPTS = {
  new: 'Build a NEW complete page from scratch with the whole agent team (it is not an edit of the current page).',
  polish: 'Design pass on the current element, like a senior product designer: fix the type scale and rhythm, spacing on an 8px grid, alignment, contrast (WCAG AA), consistent radii and shadows, hover and focus states, one accent colour. Keep the content and structure; answer with action "update".',
  mobile: 'Make the current element work perfectly on phones (360–430px) and tablets: a @media (max-width:760px) block, stacked grids, readable sizes, ≥44px tap targets, no horizontal scroll, images that scale. Desktop must stay as it is; answer with action "update".',
  copy: 'Rewrite every text of the current element like a senior copywriter: a concrete headline with the real benefit, short scannable lines, real-sounding names, numbers and prices, clear calls to action, no lorem ipsum or filler. Same language and layout; answer with action "update".',
  fix: 'Find and fix what is broken in the current element: overlapping or cut-off text, overflowing boxes, broken images, wrong z-order, low contrast, misaligned grids, empty areas. Answer with action "update" and the complete fixed element.',
  '3d': 'Add a real 3D object to the current element where it helps most (a hero visual or a showcase): <img src="model:SHAPE MATERIAL COLOR"> with a fitting shape and material, sized and placed so it never covers text. Answer with action "update".',
};
export function slashCommands(){
  const lim = agentLimit(), mine = myAgents.filter(a => a.on).length;
  return [
    { cmd: 'agents', icon: '◎', label: t('Agent team'), hint: t('how many agents build a page, add your own') + ` · ${lim}${mine ? ' + ' + mine : ''}`, kind: 'panel' },
    { cmd: 'new', icon: '✦', label: t('New page'), hint: t('build from scratch with the whole team'), kind: 'prompt' },
    { cmd: 'app', icon: '</>', label: t('App mode'), hint: t('working mini-apps: calculators, quizzes, games'), kind: 'toggle', on: appOn },
    { cmd: 'x3', icon: '⧉', label: t('3 variants'), hint: t('three versions to pick from (3 generations)'), kind: 'toggle', on: variantsOn },
    { cmd: 'polish', icon: '◇', label: t('Polish design'), hint: t('type, spacing, contrast, states'), kind: 'prompt' },
    { cmd: 'mobile', icon: '▯', label: t('Mobile'), hint: t('make it work on phones'), kind: 'prompt' },
    { cmd: 'copy', icon: '¶', label: t('Rewrite texts'), hint: t('like a senior copywriter'), kind: 'prompt' },
    { cmd: 'fix', icon: '⚑', label: t('Fix layout'), hint: t('overlaps, overflow, contrast'), kind: 'prompt' },
    { cmd: '3d', icon: '◆', label: t('Add 3D'), hint: t('a real 3D object where it fits'), kind: 'prompt' },
  ];
}
// what is switched on right now — small chips in the message box, a click turns them off
export function slashModes(){
  const out = [];
  if (appOn) out.push({ cmd: 'app', label: 'app' });
  if (variantsOn) out.push({ cmd: 'x3', label: '×3' });
  const mine = myAgents.filter(a => a.on).length;
  if (agentsN !== 7 || mine) out.push({ cmd: 'agents', label: `${agentLimit()}${mine ? '+' + mine : ''} ${t('agents')}` });
  return out;
}
// runs a toggle or panel command; returns false for prompt commands (the box keeps "/cmd " for the user to finish)
export function runSlash(cmd){
  if (cmd === 'app') { appBtn.click(); return true; }
  if (cmd === 'x3') { variantsBtn.click(); return true; }
  if (cmd === 'agents') { openAgents(); return true; }
  return false;
}
const trigger = picker.querySelector('.model-trigger'), menu = picker.querySelector('.model-menu'), mSearch = picker.querySelector('input');
const chevron = '<svg class="model-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
function renderPicker(){
  const m = current(), p = byId(m.pid);
  trigger.innerHTML = `${modelLogo(m)}<span class="model-trigger-name">${escapeHTML(m.name)}</span>${chevron}`;
  $('sbModel').textContent = `${p?.name || m.pid} · ${m.name}`;
  const q = mSearch.value.trim().toLocaleLowerCase();
  const groups = PROVIDERS.filter(pr => pr.kind === 'proxy' || active(pr.id)).map(pr => {
    const list = providerModels(pr).filter(x => `${x.name} ${x.vendor || ''} ${x.id} ${pr.name}`.toLocaleLowerCase().includes(q));
    if (!list.length && q) return '';
    const status = pr.kind === 'proxy' ? quotaText() : !keys[pr.id] ? ' · key required' : loading[pr.id] ? ' · loading…' : modelErr[pr.id] ? ' · error' : '';
    const firstPaid = list.find(x => x.paid);
    // each provider in its own section, so its sticky header pushes the previous one away instead of overlapping it
    return `<div class="model-sec"><div class="model-group">${providerLogo(pr)}${escapeHTML(pr.name)}<span>${status}</span></div>` + list.map(x => (x === firstPaid ? '<div class="model-sub">pay per use · $ per 1M tokens in · out</div>' : '') + `<button type="button" role="option" class="model-option${x.key === currentModel ? ' active' : ''}" data-model="${escapeHTML(x.key)}" aria-selected="${x.key === currentModel}">${modelLogo(x)}<span class="model-text"><span class="model-title">${escapeHTML(x.name)}</span><span class="model-meta">${escapeHTML(x.vendor || pr.name)}${x.ctx ? ' · ' + fmtCtx(x.ctx) + ' context' : ''}${x.note ? ' · ' + escapeHTML(x.note) : ''}</span></span>${x.price ? `<span class="model-price" title="price per 1M tokens: input · output">${fmtPrice(x.price)}</span>` : isFree(x, pr) ? `<span class="model-free" title="${escapeHTML(t('costs nothing'))}">$0</span>` : ''}${x.key === currentModel ? '<span class="model-check">✓</span>' : ''}</button>`).join('') + '</div>';
  }).join('');
  picker.querySelector('.model-list').innerHTML = groups || '<div class="model-empty">nothing found</div>';
  const connected = PROVIDERS.filter(pr => active(pr.id)).length, total = PROVIDERS.filter(pr => pr.kind !== 'proxy').length;
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
  if (p.kind !== 'proxy' && !active(p.id)) { delete modelsBy[p.id]; delete modelErr[p.id]; autoPick(); renderPicker(); renderProviders(); return; }
  loading[p.id] = true; delete modelErr[p.id]; renderProviders(); renderPicker();
  try { modelsBy[p.id] = await listModels(p, keys[p.id]); }
  catch (e) { modelErr[p.id] = e.message; delete modelsBy[p.id]; }
  finally { loading[p.id] = false; autoPick(); renderProviders(); renderPicker(); }
}
// If the selected model has no key, fall back to the first model of a connected provider
function autoPick(){
  if (active(current().pid)) return;
  // someone who connected their own key probably wants to use it instead of the free quota
  const pr = PROVIDERS.find(x => active(x.id) && providerModels(x).length);
  if (!pr && usable(current().pid)) return;
  // pick the provider's recommended model when it's available, otherwise the first one
  if (!pr && !usable(current().pid)) { currentModel = 'oc::auto'; store.set('form-model', currentModel); return; }
  if (pr) { const list = providerModels(pr); const best = (pr.prefer || []).map(id => list.find(x => x.id === id)).find(Boolean); currentModel = (best || list[0]).key; store.set('form-model', currentModel); }
}
function loadModels(){ PROVIDERS.forEach(loadProvider); }

// "AI keys" dialog: every service is a row with a round switch — on opens the key field, off forgets the key
const provOpen = new Set();
const provLogo = p => p.kind === 'proxy' || logo(p.logo) ? providerLogo(p) : `<span class="model-logo letter">${escapeHTML(p.name[0])}</span>`;
function renderProviders(){
  const box = $('providers'); if (!box) return;
  const focused = document.activeElement?.dataset?.key;
  box.innerHTML = PROVIDERS.map(p => {
    if (p.kind === 'proxy') return `<div class="prov on prov-free">${provLogo(p)}<div class="prov-info"><div class="prov-name">${escapeHTML(p.name)}<span class="model-free">$0</span></div><div class="prov-note">${escapeHTML(p.note)}</div></div>${authUser ? `<span class="prov-st ok">✓ signed in${quota ? ` · ${quota.used}/${quota.limit} used today` : ''}</span>` : '<button class="btn primary" type="button" data-free-signin>sign in for 20 a day</button>'}</div>`;
    const k = keys[p.id] || '', on = active(p.id) || provOpen.has(p.id);
    const st = !k ? '' : keysOff.has(p.id) ? '' : loading[p.id] ? '<span class="prov-st">checking…</span>' : modelErr[p.id] ? `<span class="prov-st err" title="${escapeHTML(modelErr[p.id])}">✗ ${escapeHTML(String(modelErr[p.id]).slice(0, 60))}</span>` : `<span class="prov-st ok">✓ ${(modelsBy[p.id] || []).length} models</span>`;
    return `<div class="prov${on ? ' on' : ''}" data-prov="${p.id}">${provLogo(p)}<div class="prov-info"><div class="prov-name">${escapeHTML(p.name)}${p.free ? '<span class="model-free">free tier</span>' : ''}</div><div class="prov-note">${escapeHTML(p.note)}</div></div><button type="button" class="switch" role="switch" aria-checked="${on}" data-switch="${p.id}" aria-label="${escapeHTML(p.name)}"><i></i></button>`
      + (on ? `<div class="prov-key"><input type="password" data-key="${p.id}" value="${escapeHTML(k)}" placeholder="${escapeHTML(t('Paste your key') + (p.hint ? ' · ' + p.hint : ''))}" autocomplete="off" spellcheck="false"><a class="btn" href="${p.keyUrl}" target="_blank" rel="noreferrer">${escapeHTML(t('get a key'))} ↗</a>${k ? `<button type="button" class="btn" data-forget="${p.id}">${escapeHTML(t('remove key'))}</button>` : ''}${st}</div>` : k ? `<div class="prov-key prov-saved">${escapeHTML(t('key saved · switched off'))}</div>` : '') + '</div>';
  }).join('');
  if (focused) { const el = box.querySelector(`[data-key="${focused}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}
// openSettings('openrouter') opens the dialog with that service switched on and its key field focused
function openSettings(pid){
  $('rememberKeys').checked = remember; if (pid && byId(pid) && byId(pid).kind !== 'proxy') provOpen.add(pid);
  renderProviders(); showModal('settings');
  if (pid) requestAnimationFrame(() => { const row = $('providers').querySelector(`[data-prov="${pid}"]`); row?.scrollIntoView({ block: 'center' }); row?.querySelector('input')?.focus(); });
}
$('providers').addEventListener('click', e => {
  const fg = e.target.closest('[data-forget]');
  if (fg) { const pid = fg.dataset.forget; delete keys[pid]; keysOff.delete(pid); saveOff(); saveKeys(); loadProvider(byId(pid)); renderStart(); return; }
  const sw = e.target.closest('[data-switch]'); if (!sw) return;
  const pid = sw.dataset.switch, on = sw.getAttribute('aria-checked') === 'true';
  // off keeps the key (only its models leave the list); on brings them back without typing it again
  if (on) { provOpen.delete(pid); if (keys[pid]) { keysOff.add(pid); saveOff(); loadProvider(byId(pid)); renderStart(); } renderProviders(); }
  else { provOpen.add(pid); if (keysOff.delete(pid)) { saveOff(); if (keys[pid]) { loadProvider(byId(pid)); renderStart(); } } renderProviders(); if (!keys[pid]) $('providers').querySelector(`[data-key="${pid}"]`)?.focus(); }
});
// Get started (empty canvas): the free AI works at once; the logos open the key dialog on that service
function renderStart(){
  const box = $('esLogos'); if (!box) return;
  box.innerHTML = PROVIDERS.filter(p => p.kind !== 'proxy').slice(0, 8).map(p => `<button type="button" class="es-logo${active(p.id) ? ' on' : ''}" data-start-key="${p.id}" title="${escapeHTML(p.name + ' — ' + p.note)}">${provLogo(p)}<span>${escapeHTML(p.name.replace(/ \(.*\)$/, ''))}</span>${p.free ? '<em>$0</em>' : ''}</button>`).join('');
}
$('emptyStart')?.addEventListener('click', e => { const b = e.target.closest('[data-start-key]'); if (b) openSettings(b.dataset.startKey); else if (e.target.closest('[data-start-keys]')) openSettings('openrouter'); });
$('providers').addEventListener('click', e => { if (e.target.closest('[data-free-signin]')) { $('settings').classList.add('hidden'); openAuth('signup'); } });
$('providers').addEventListener('change', e => {
  const pid = e.target.dataset.key; if (!pid) return;
  const v = e.target.value.trim();
  if (v) keys[pid] = v; else delete keys[pid];
  saveKeys(); loadProvider(byId(pid)); renderStart();
});
$('rememberKeys').onchange = e => { remember = e.target.checked; saveKeys(); };
$('forgetKeys').onclick = () => { keys = {}; keysOff.clear(); saveOff(); saveKeys(); PROVIDERS.forEach(p => { if (!p.publicModels) delete modelsBy[p.id]; }); renderProviders(); renderPicker(); };
renderPicker(); renderStart();

/* ── AI chat ─────────────────────────────────────────────── */
initChatUI({ setState: (...a) => setState(...a) });
/* ── Chat history: one conversation per project, kept in this browser ──
   The last few turns also go to the model, so "make it brighter" works without repeating yourself. */
const chatKey = (name = nameEl.textContent.trim() || 'my-interface') => 'oc-chat:' + name;
let chatLog = store.get(chatKey(), []);
if (!Array.isArray(chatLog)) chatLog = [];
function logChat(role, text){
  chatLog.push({ role, text: String(text ?? '').slice(0, 8000), t: Date.now() });
  if (chatLog.length > 80) chatLog = chatLog.slice(-80);
  store.set(chatKey(), chatLog);
}
// Recent turns for the model (short, text only)
const chatContext = () => chatLog.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.text.slice(0, 400)}`).join('\n');
function renderChat(){
  const box = $('messages');
  [...box.children].forEach(n => { if (!n.classList.contains('welcome')) n.remove(); });
  let lastDay = '';
  for (const m of chatLog) {
    const day = new Date(m.t).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      const d = document.createElement('div'); d.className = 'chat-day';
      d.textContent = day === new Date().toDateString() ? 'today' : new Date(m.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      box.append(d);
    }
    const n = document.createElement('div'); n.className = 'message ' + m.role; n.style.animation = 'none';
    if (m.role === 'assistant') { n.setAttribute('data-no-i18n', ''); if (MD_RE.test(m.text)) { n.classList.add('md'); n.innerHTML = md(m.text, t('copy')); } else n.textContent = t(m.text); } else n.textContent = m.text;
    box.append(n);
  }
  toBottom();
}
function switchChat(){ chatLog = store.get(chatKey(), []); if (!Array.isArray(chatLog)) chatLog = []; renderChat(); }
$('newChat').onclick = () => {
  if (!chatLog.length) return;
  chatLog = []; store.set(chatKey(), chatLog);
  const box = $('messages');
  box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion() ? 0 : 140 }).onfinish = () => { renderChat(); box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduceMotion() ? 0 : 180 }); };
  setState('new chat');
};
// renaming the project carries its conversation along
let nameBefore = nameEl.textContent.trim();
nameEl.addEventListener('focus', () => { nameBefore = nameEl.textContent.trim(); });
nameEl.addEventListener('blur', () => {
  const now = nameEl.textContent.trim();
  if (now && now !== nameBefore) { const old = store.get(chatKey(nameBefore), []); if (old.length && !store.get(chatKey(now), []).length) store.set(chatKey(now), old); switchChat(); }
});




/* ── Photos and attachments in AI answers ──
   The model writes src="photo:latte art" / url('photo:cozy cafe?portrait') for stock photos and
   src="attachment:1" for the user's attached images; here they become data: URLs (frames and exports
   can't load anything from the network). Photos come from /api/photo (worker.js).
   src="art:neon cube over dark terrain, 3d render" is a picture DRAWN by the free FLUX model (/api/image) —
   cinematic / 3D heroes. At most 2 per answer; signed out or out of quota → a dark neon-glow picture. */
// only inside attribute values / url(): visible text like "photo: by Anna" stays untouched
const MEDIA_RE = /(?<=["'(]\s*)(photo|attachment|kept|art|model):([^"'()<>\n]{1,240})/g;
// model: = a real 3D object rendered in the browser (scene3d.js renderModel): free, ~0.2 s and ~10 KB each
const MODEL_MAX = 8, MODEL_EMPTY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const ART_MAX = 2;
// in the page's accent hue (cinematic sites set artHue while their media is resolved)
let artHue = 220;
const artPlaceholder = (h = 220) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="a" cx=".62" cy=".42" r=".5"><stop stop-color="hsl(${h},100%,62%)" stop-opacity=".75"/><stop offset="1" stop-color="hsl(${h},100%,62%)" stop-opacity="0"/></radialGradient><radialGradient id="b" cx=".25" cy=".8" r=".45"><stop stop-color="hsl(${(h + 45) % 360},100%,60%)" stop-opacity=".5"/><stop offset="1" stop-color="hsl(${(h + 45) % 360},100%,60%)" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="#04060d"/><rect width="160" height="90" fill="url(#b)"/><rect width="160" height="90" fill="url(#a)"/></svg>`).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#3a2a24"/><stop offset="1" stop-color="#15110f"/></linearGradient></defs><rect width="16" height="10" fill="url(#g)"/></svg>').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
async function toDataURL(blob, max = 900, quality = .72){
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const webp = c.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', quality);
}
const photoCache = new Map(); // "query|orientation|index" → data URL (same request twice → same photo)
async function fetchPhoto(q, o, i){
  const key = `${q}|${o}|${i}`;
  if (!photoCache.has(key)) photoCache.set(key, (async () => {
    const r = await fetch(`/api/photo?q=${encodeURIComponent(q)}&o=${o}&i=${i}`);
    if (!r.ok) throw Error('no photo');
    return toDataURL(await r.blob());
  })().catch(e => { photoCache.delete(key); throw e; }));
  return photoCache.get(key);
}
// art: a picture drawn by the free AI (needs an account; never opens the sign-in window by itself)
const artCache = new Map();
async function drawArt(q){
  if (!artCache.has(q)) artCache.set(q, (async () => {
    const { supabase } = await import('./auth.js');
    const { data } = (await supabase?.auth.getSession()) || {};
    if (!data?.session) throw Error('signed out');
    const { aiImage } = await import('./ai-image.js');
    return toDataURL(await aiImage(q), 1600, .8);
  })().catch(e => { artCache.delete(q); throw e; }));
  return artCache.get(q);
}
// Replace every photo:/attachment:/art: token. Repeats of one query get different photos (i = 0, 1, 2…).
// kept:N = an image the element already had (sent to the model as a short token).
// <canvas data-oc-model> (what resolveMedia makes) → <img src="model:…"> with the AI's own class and styles
function unModel(code){
  return code.replace(/<canvas\b([^>]*?)\bdata-oc-model="([^"]*)"([^>]*)><\/canvas>/gi, (all, a, q, b) => {
    const attrs = a + ' ' + b, attr = n => attrs.match(new RegExp(`\\b${n}="([^"]*)"`, 'i'))?.[1] || '';
    const style = attr('style').replace(/background(-image)?:\s*(url\([^)]*\)|none)[^;]*;?/g, '').replace(/max-width:\s*100%;?|height:\s*auto;?|aspect-ratio:[^;]*;?/g, '').replace(/;\s*$/, '').trim();
    const dec = q2 => q2.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    return `<img src="model:${dec(q)}"${attr('id') ? ` id="${attr('id')}"` : ''}${attr('class') ? ` class="${attr('class')}"` : ''}${style ? ` style="${style}"` : ''} alt="${attr('aria-label')}">`;
  });
}
async function resolveMedia(code, attachments = [], onPhotos, kept = [], onArt, onModels){
  // <img src="model:…"> becomes a LIVE 3D object: <canvas data-oc-model="…"> rendered in real time (model-kit.js,
  // oc3d.js on published pages); its still picture is the canvas background until WebGL starts or where scripts are off
  let lives = 0;
  code = code.replace(/<img\b([^>]*?)\bsrc=(["'])model:([^"'<>]{1,120})\2([^>]*?)\/?>/gi, (all, a, _q, q, b) => {
    if (++lives > MODEL_MAX) return all;
    const attrs = (a + ' ' + b), attr = n => attrs.match(new RegExp(`\\b${n}=(["'])([^"']*)\\1`, 'i'))?.[2] || '';
    const query = q.trim().replace(/\b(interactive|live|cursor|hover|tilt|mouse|follow)\b/gi, '').replace(/\s+/g, ' ').trim();
    // width="200" / height="…" on the picture become CSS sizes (the canvas itself is 640×640 pixels)
    const px = n => /^\d{1,4}$/.test(attr(n)) ? `${n}:${attr(n)}px;` : '';
    const style = (px('width') + px('height') + attr('style')).replace(/;?\s*$/, '');
    const cls = attr('class'), id = attr('id');
    const word = query.match(/\b(?:text|word|logo|текст|слово)\s+(?:["“«']([^"”»']{1,24})["”»']|([^\s#"]{1,24}))/i), n = word ? (word[1] || word[2]).length : 1;
    const cw = 640, ch = n > 1 ? Math.max(120, Math.round(640 / Math.min(8, 0.62 * n + 0.5))) : 640;
    return `<canvas data-oc-model="${escapeHTML(query)}" width="${cw}" height="${ch}"${id ? ` id="${id}"` : ''}${cls ? ` class="${cls}"` : ''} role="img" aria-label="${escapeHTML(attr('alt') || query)}" style="${style ? style + ';' : ''}background:url('model:${query}') center/contain no-repeat;height:auto;aspect-ratio:${cw}/${ch}"></canvas>`;
  });
  const found = [...code.matchAll(MEDIA_RE)];
  if (!found.length) return code;
  const seen = new Map(), jobs = [], arts = [], models = [];
  for (const m of found) {
    if (m[1] === 'art') {
      const q = m[2].trim().slice(0, 240);
      if (arts.includes(q) || arts.length < ART_MAX) { if (!arts.includes(q)) arts.push(q); m.art = q; }
      continue; // over the limit: the neon placeholder
    }
    if (m[1] === 'model') { const q = m[2].trim().slice(0, 120); if (models.includes(q) || models.length < MODEL_MAX) { if (!models.includes(q)) models.push(q); m.model = q; } continue; }
    if (m[1] !== 'photo') continue;
    let [q, o = 'landscape'] = m[2].trim().split('?');
    q = q.trim().toLowerCase(); if (!['landscape', 'portrait', 'square'].includes(o)) o = 'landscape';
    const n = seen.get(q + '|' + o) || 0; seen.set(q + '|' + o, n + 1);
    m.job = { q, o, i: n % 8 };
    if (jobs.length < 12 && !jobs.some(j => j.q === q && j.o === o && j.i === m.job.i)) jobs.push(m.job);
  }
  if (jobs.length) onPhotos?.([...new Set(jobs.map(j => j.q))]);
  if (arts.length) (onArt || onPhotos)?.(arts);
  if (models.length) onModels?.(models);
  const got = new Map(), drawn = new Map(), rendered = new Map();
  // 3D objects one after another (each takes the GPU for a moment), while photos and art download
  const modelJob = models.length ? load3d().then(async m => { for (const q of models) { try { rendered.set(q, await m.renderModel(q)); } catch {} } }).catch(() => {}) : null;
  await Promise.all([
    ...jobs.map(j => fetchPhoto(j.q, j.o, j.i).then(url => got.set(`${j.q}|${j.o}|${j.i}`, url), () => {})),
    ...arts.map(q => drawArt(q).then(url => drawn.set(q, url), () => {})),
    modelJob,
  ]);
  let k = 0;
  return code.replace(MEDIA_RE, (all, kind, ref) => {
    const m = found[k++];
    if (kind === 'attachment') { const a = attachments.filter(x => x.url)[(parseInt(ref) || 1) - 1]; return a?.url || PLACEHOLDER; }
    if (kind === 'kept') return kept[(parseInt(ref) || 1) - 1] || PLACEHOLDER;
    if (kind === 'art') return (m?.art && drawn.get(m.art)) || artPlaceholder(artHue);
    if (kind === 'model') return (m?.model && rendered.get(m.model)) || MODEL_EMPTY;
    const j = m?.job; return (j && got.get(`${j.q}|${j.o}|${j.i}`)) || PLACEHOLDER;
  });
}


// Live 3D objects on the canvas. Element frames run no scripts, and a document without scripts doesn't even paint
// its <canvas> (it shows the fallback), so the editor lays its own canvas over each <canvas data-oc-model>, inside
// the element (it moves and zooms with it), renders the object there and forwards the cursor
let modelKit = null;
const loadKit = () => (modelKit ||= import('./model-kit.js'));
const liveModels = new Set();
function placeLive(m){
  const f = m.frame, doc = f.contentDocument, src = m.src;
  if (!doc || !src.isConnected || !f.isConnected) { m.dispose(); m.canvas.remove(); liveModels.delete(m); return false; }
  const k = f.offsetWidth / (doc.documentElement.clientWidth || f.offsetWidth), r = src.getBoundingClientRect();
  const st = m.canvas.style, x = f.offsetLeft + r.left * k, y = f.offsetTop + r.top * k;
  st.left = x + 'px'; st.top = y + 'px'; st.width = r.width * k + 'px'; st.height = r.height * k + 'px';
  st.display = r.width && r.height && getComputedStyle(src).visibility !== 'hidden' ? 'block' : 'none';
  return true;
}
function mountModelsIn(frame){
  for (const m of [...liveModels]) if (m.frame === frame) placeLive(m); // drops the ones of a replaced document
  const doc = frame.contentDocument, list = doc?.querySelectorAll('canvas[data-oc-model]');
  if (!list?.length) return;
  // the still picture under the live object goes away by a rule in <head> — never by touching the element:
  // inline editing saves the element's DOM, and the picture must stay in the code for exports and thumbnails
  if (!doc.getElementById('oc-live3d')) { const st = doc.createElement('style'); st.id = 'oc-live3d'; st.textContent = 'canvas[data-oc-model]{background-image:none!important}'; doc.head.append(st); }
  loadKit().then(k => list.forEach(src => {
    if (src._oc || !src.isConnected || liveModels.size >= 8) return; // WebGL contexts are limited (~16 a tab)
    const c = document.createElement('canvas'); c.className = 'oc-live3d'; c.setAttribute('aria-hidden', 'true');
    frame.parentElement.append(c);
    placeLive({ frame, src, canvas: c, dispose(){} }); // sized before WebGL starts
    try {
      const m = k.mountModel(c, src.dataset.ocModel); Object.assign(m, { frame, src });
      src._oc = m; liveModels.add(m); placeLive(m);
    } catch { c.remove(); }
  })).catch(() => {});
}
document.addEventListener('load', e => { if (e.target?.tagName === 'IFRAME' && e.target.closest?.('.node')) mountModelsIn(e.target); }, true);
setTimeout(() => document.querySelectorAll('.node iframe').forEach(mountModelsIn), 1200);
// keep each object on its spot every frame: the element may be edited, resized or animated (a float, a hover lift)
(function follow(){ for (const m of [...liveModels]) placeLive(m); requestAnimationFrame(follow); })();
let modelRaf = 0, modelXY = null;
addEventListener('pointermove', e => {
  modelXY = [e.clientX, e.clientY];
  if (modelRaf || !liveModels.size) return;
  modelRaf = requestAnimationFrame(() => {
    modelRaf = 0;
    loadKit().then(k => { for (const m of liveModels) m.setPointer(...k.pointerFor(m.canvas.getBoundingClientRect(), modelXY[0], modelXY[1])); });
  });
}, { passive: true });

/* ── Attachments from the chat box (+): images and text files go along with the next request ── */
let pendingAttachments = [];
export const setAttachments = list => { pendingAttachments = Array.isArray(list) ? list : []; };
// An attached image as a page-ready data URL plus its size
export async function readAttachment(file){
  if (file.type.startsWith('image/')) {
    if (file.size > 15e6) throw Error('image is too large (max 15 MB)');
    const url = await toDataURL(file, 1200, .8);
    const bmp = await createImageBitmap(file); const out = { id: crypto.randomUUID(), name: file.name || 'image', url, w: bmp.width, h: bmp.height }; bmp.close?.();
    return out;
  }
  if (file.size > 300e3) throw Error(`${file.name} is too large (text files up to 300 KB)`);
  return { id: crypto.randomUUID(), name: file.name, text: await file.text(), size: file.size };
}
$('send').onclick = () => {
  let request = $('prompt').value.trim(), att = pendingAttachments;
  if (!request && !att.length) return;
  // "/polish make it calmer" → the request plus the command's expert instruction; "/app" alone just switches the mode
  const sl = request.match(/^\/([a-z0-9]+)\b\s*([\s\S]*)$/i), slash = {};
  if (sl) {
    const cmd = sl[1].toLowerCase(), rest = sl[2].trim(), info = slashCommands().find(c => c.cmd === cmd);
    if (info && info.kind !== 'prompt') { runSlash(cmd); $('prompt').value = ''; if (!rest && !att.length) return; request = rest; }
    else if (info) {
      slash.extra = '\n\nCommand /' + cmd + ': ' + SLASH_PROMPTS[cmd];
      if (cmd === 'new') slash.swarm = true;
      request = rest || (cmd === 'new' ? t('a new page') : info.label);
    }
  }
  if (!att.length) return runAI(request, slash);
  pendingAttachments = []; window.dispatchEvent(new CustomEvent('oc:attachments-sent'));
  const imgs = att.filter(a => a.url), files = att.filter(a => a.text != null);
  const vision = byId(current().pid)?.kind !== 'proxy';
  const custom = { attachments: att, shown: att };
  if (imgs.length) {
    custom.attachNote = `\n- The user attached ${imgs.length} image(s): ${imgs.map((a, i) => `attachment:${i + 1} = "${a.name}" (${a.w}×${a.h})`).join(', ')}. ${vision ? 'They are included so you can see them.' : 'You cannot see them — go by their names.'} When the user wants them on the page (their logo, product or team photo…), use src="attachment:N" or url('attachment:N') exactly, and prefer them over stock photos.`;
    if (vision) custom.images = imgs.map(a => a.url);
  }
  if (files.length) custom.extra = files.map(f => `\n\nAttached file "${f.name}":\n${f.text.slice(0, 20000)}`).join('');
  if (slash.extra) custom.extra = (custom.extra || '') + slash.extra;
  if (slash.swarm) custom.swarm = true;
  runAI(request || (imgs.length ? 'Use the attached image' + (imgs.length > 1 ? 's' : '') : 'Use the attached file'), custom);
};

// One AI round-trip. `custom.user` replaces the default context (used by Fusion); `custom.place` positions a new element.
// Is `next` a rewritten version of `prev` (most of its words are still there) rather than a new block?
function isRewriteOf(prev, next){
  const words = s => new Set(String(s).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const a = words(prev), b = words(next);
  if (a.size < 8) return false;
  let same = 0; for (const w of a) if (b.has(w)) same++;
  return same / a.size >= .6;
}
// Code mode (code.js): the app being worked on; requests change only it (null = make a new one). undefined = canvas mode
let codeFocus;
let lastAiId = store.get('oc-last-ai', null); // the element the AI built or changed last (kept across reloads)
// Three variants side by side; resolves to the chosen index, 'all', or null (cancel)
const variantModal = Object.assign(document.createElement('div'), { className: 'modal hidden', id: 'variantsModal' });
variantModal.innerHTML = `<div class="modal-card var-card" role="dialog" aria-labelledby="varTitle"><div class="modal-head"><h2 id="varTitle">pick a variant</h2><button class="btn icon" type="button" data-var="cancel" aria-label="Close">×</button></div><div class="var-grid" id="varGrid"></div><div class="modal-actions"><button class="btn" type="button" data-var="cancel">cancel</button><button class="btn" type="button" data-var="all">keep all three</button></div></div>`;
document.body.append(variantModal);
function chooseVariant(list){
  return new Promise(resolve => {
    const grid = variantModal.querySelector('#varGrid');
    grid.innerHTML = list.map((r, i) => `<div class="var-col"><button type="button" class="var-preview" data-var="${i}" title="Use this variant"><iframe sandbox="allow-same-origin" tabindex="-1" title="Variant ${i + 1}"></iframe></button><div class="var-info"><b>${i + 1}</b><span>${escapeHTML(String(r.name || 'Variant'))}</span><button type="button" class="btn primary" data-var="${i}">use this</button></div></div>`).join('');
    grid.querySelectorAll('iframe').forEach((f, i) => {
      const r = list[i];
      f.onload = () => requestAnimationFrame(() => {
        try {
          const box = f.parentElement, doc = f.contentDocument, root = doc.getElementById('__root');
          const w = r.full ? page.w : Math.max(1, root.scrollWidth), h = Math.max(1, r.full ? root.scrollHeight : root.scrollHeight);
          const sc = Math.min(box.clientWidth / w, box.clientHeight / h, 1);
          f.style.width = w + 'px'; f.style.height = Math.max(h, box.clientHeight / sc) + 'px';
          f.style.transform = `translate(${Math.max(0, (box.clientWidth - w * sc) / 2)}px, 0) scale(${sc})`;
        } catch {}
      });
      f.style.width = (r.full ? page.w : 760) + 'px'; f.style.height = '900px';
      f.srcdoc = nodeDoc({ code: r.code, full: r.full });
    });
    const done = v => { variantModal.classList.add('hidden'); variantModal.onclick = null; document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } else if (/^[1-3]$/.test(e.key) && list[+e.key - 1]) done(+e.key - 1); };
    document.addEventListener('keydown', onKey, true);
    variantModal.onclick = e => {
      if (e.target === variantModal) return done(null);
      const v = e.target.closest('[data-var]')?.dataset.var; if (v == null) return;
      done(v === 'cancel' ? null : v === 'all' ? 'all' : +v);
    };
    variantModal.classList.remove('hidden');
  });
}

// The project's brand kit (brand.js) as rules for the AI; the logo travels as a short brand:logo token
function brandRules(){
  const b = page.brand; if (!b || b.on === false) return '';
  const parts = [
    b.name && `name "${b.name}"`,
    b.primary && `main colour ${b.primary} (buttons, links, key accents)`,
    b.accent && `second accent ${b.accent}`,
    b.background && `page background ${b.background}`,
    b.text && `text colour ${b.text}`,
    b.font && `font family "${b.font}" (CSS: font-family: '${b.font}', system-ui, sans-serif)`,
    Number.isFinite(b.radius) && `corner radius about ${b.radius}px`,
    b.tone && `tone of voice: ${b.tone}`,
    b.logo && 'logo available: use <img src="brand:logo" alt="logo"> wherever a logo belongs (header, footer, sign-in)',
  ].filter(Boolean).join('; ');
  return `- BRAND KIT — follow it exactly in every block: ${parts}. Build the palette only from these colours (plus neutrals and tints of them); no other accent colours, no generic purple-blue gradients unless they are the brand colours.\n`;
}
const YEAR = new Date().getFullYear();
const fixYear = code => String(code).replace(/(©|&copy;|\(c\)|copyright)(\s*)(20\d\d)(?![\d–-])/gi, (m, sign, sp, y) => +y < YEAR ? sign + sp + YEAR : m);
const withBrand = code => { code = fixYear(code); return page.brand?.logo ? code.replace(/brand:logo/g, page.brand.logo) : code; };

// Signed-out visitors on the free AI: after the first good result (once a session) and when the free
// tries run out, offer a free account — 20 generations a day, cloud projects, publishing.
let nudged = false;
function signupNudge(why){
  if (why === 'first' && nudged) return;
  nudged = true;
  track('signup_prompt');
  message(why === 'limit'
    ? 'The free tries for today are used up. Create a free account — it takes 10 seconds — and get 20 generations a day, projects saved in the cloud and publishing by link.'
    : 'Like it? Create a free account to get 20 AI generations a day, keep your projects in the cloud and publish your page by link.', 'assistant');
  const row = document.createElement('div'); row.className = 'msg-cta';
  row.innerHTML = `<button class="btn primary" type="button">${escapeHTML(t('create a free account'))}</button><button class="btn" type="button" data-signin>${escapeHTML(t('I have an account'))}</button>`;
  row.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; track('signup_click'); openAuth(b.hasAttribute('data-signin') ? 'signin' : 'signup'); });
  $('messages').append(row); toBottom();
}

/* ── Swarm: a new page is planned first, then every section is written by its own AI agent at the same time.
   The agents stream into their own slots of the live build on the canvas (build-stage.js swarm/part), each
   with its own cursor. The planner writes the shared design system, so the sections look like one page. ── */
const SWARM_RE = /сайт|site|page|страниц|лендинг|landing|портфолио|portfolio|магазин|shop|store|блог|blog|homepage|главн/i;
// with a page already on the canvas only an explicit "new page" request starts a swarm (anything else is an edit)
const SWARM_NEW = /нов(ый|ую|ая|ое)|new|ещ[её] од|another|с нуля|from scratch|другой сайт|second site/i;
const sectionCode = text => {
  let s = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const f = s.match(/```(?:html)?\s*\n([\s\S]*?)(```|$)/i);
  s = f ? f[1] : s.slice(Math.max(0, s.search(/<(style|section|header|footer|div|nav|main)\b/i)));
  return s.replace(/```[\s\S]*$/, '').trim();
};
// Every agent starts from a component of our catalog: the closest full-width section for its kind
const REF_KINDS = [
  [/header|nav/, /navbar|header|navigation|top bar/i], [/hero|intro|banner/, /hero/i], [/feature|benefit|service|why/, /feature|bento|benefit|service/i],
  [/pricing|plan|tariff/, /pricing|plan/i], [/testimonial|review|quote/, /testimonial|review|quote/i], [/faq|question/, /faq|accordion|question/i],
  [/cta|newsletter|signup|subscribe/, /call to action|cta|newsletter|subscribe/i], [/footer/, /footer/i], [/team|people|about/, /team|about|founder/i],
  [/gallery|work|portfolio|case|showcase|project/, /gallery|portfolio|case|showcase|work|project/i], [/stat|number|metric/, /stat|metric|number|kpi/i],
  [/contact|form|booking|book/, /contact|booking|form/i], [/logo|partner|client/, /logo|partner|client/i], [/blog|news|article/, /blog|article|news|post/i],
  [/step|process|how/, /step|process|how it works|timeline/i], [/menu|product|shop|catalog/, /menu|product|shop|catalog|card/i],
];
function pickRef(kind, used){
  const hit = REF_KINDS.find(([k]) => k.test(kind)); if (!hit || !presets.length) return null;
  const pool = presets.filter(x => hit[1].test(x.name) && String(x.code).length < 7000 && !used.has(x.name) && (x.full || /Landing|Cinematic|Navigation|Pricing/.test(x.category || '')));
  const pick = pool.length ? pool[Math.floor(Math.random() * Math.min(pool.length, 12))] : null;
  if (pick) used.add(pick.name);
  return pick;
}
async function buildSwarm({ p, key, m, request, recent, system, stop }){
  const mine = myAgents.filter(a => a.on && (a.role || a.name)).map(a => ({ ...a, kind: agentSlug(a.name), model: a.model && allModels().find(x => x.key === a.model && usable(x.pid)) || null }));
  const free = p.kind === 'proxy';
  // the free AI allows a planner + 9 calls per request; the user's agents on their own keys don't count
  const SWARM_MAX = Math.max(2, Math.min(20 - mine.length, agentLimit()) - (free ? mine.filter(a => !a.model || byId(a.model.pid)?.kind === 'proxy').length : 0));
  const SWARM_MIN = Math.min(5, SWARM_MAX);
  stop.step('planning the page');
  const plan = `You are the lead designer of a team that builds ONE web page in parallel: you plan it, then each designer writes one section at the same time. Reply with ONLY one JSON object, no markdown fences:
{"name":"short page name","reply":"one short friendly line to the user, in the language of the request","css":"…","sections":[{"kind":"header","brief":"…"}]}
- sections: ${SWARM_MIN}–${SWARM_MAX} in page order, a header first and a footer last; pick what this kind of business really needs (a café: menu with real prices, hours, address, booking; a SaaS: value, how it works, product, pricing, FAQ; a portfolio: work first). "kind" is one lowercase word (header, hero, features, menu, pricing, gallery, testimonials, faq, cta, contact, footer…). "brief" (English, 1–3 sentences) says exactly what the section shows: layout idea, real-sounding texts, names, numbers and prices in the language of the request, which photo: or model: pictures to use — specific enough that a designer can build it without seeing the others.${mine.length ? `
- The user's own agents build these sections at the same time — do NOT plan them, leave room for them: ${mine.map(a => `"${a.kind}" (${a.role || a.name})`).join('; ')}.` : ''}
- css: the shared design system as compact CSS (under 2000 characters), every selector starting with .pg: CSS variables on .pg (--bg, --surface, --text, --muted, --line, --accent, --accent-text, --radius, --font), .pg{background:var(--bg);color:var(--text);font-family:var(--font)}, .pg .wrap{max-width:1160px;margin:0 auto;padding:0 28px}, type scale for .pg h1/.pg h2/.pg h3/.pg p, .pg .btn and .pg .btn-ghost (≥44px tall, hover and focus-visible), .pg .eyebrow, a @media (max-width:760px) block. One accent colour, refined neutrals, a ${isLightPage() ? 'light' : 'dark'} page unless the request asks otherwise. No section-specific styles.
${brandRules()}- Today is ${new Date().toISOString().slice(0, 10)}.`;
  let data = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const content = await chat(p, key, m.id, plan, (recent ? 'Conversation so far (for context):\n' + recent + '\n\n' : '') + 'Request: ' + request + (attempt ? '\n\nIMPORTANT: reply with ONLY the JSON object.' : ''), [], null);
    try { const j = firstJSON(String(content).replace(/<think>[\s\S]*?<\/think>/gi, '')); data = j && looseJSON(j.json); } catch { data = null; }
    if (!data || !Array.isArray(data.sections) || data.sections.length < 2) data = null;
  }
  if (!data) { stop.step('the plan came out garbled — building it in one go'); return null; }
  // the stage belongs to the swarm only once there is a plan (otherwise the single answer plays it as usual)
  const stage = stop.stage();
  let secs = data.sections.slice(0, SWARM_MAX).map(s => ({ kind: String(s?.kind || 'section').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'section', brief: String(s?.brief || '').slice(0, 900) }));
  // the user's agents go in before the closing CTA / contact / footer
  if (mine.length) {
    let at = secs.length; while (at > 1 && /footer|contact|cta|newsletter/.test(secs[at - 1].kind)) at--;
    secs.splice(at, 0, ...mine.map(a => ({ kind: a.kind, brief: (a.role || a.name).slice(0, 400), own: a })));
  }
  secs = secs.map((s, i) => ({ ...s, i }));
  const css = String(data.css || '').replace(/<\/?style[^>]*>/gi, '').slice(0, 6000);
  stage?.swarm(css, secs.map(s => s.kind));
  stop.step(`${secs.length} agents are building the sections at once: ${secs.map(s => s.kind).join(', ')}`);
  const outline = secs.map(s => `${s.i + 1}. ${s.kind} — ${s.brief}`).join('\n');
  await presetsReady.catch(() => {});
  const used = new Set(); secs.forEach(s => { s.ref = pickRef(s.own ? s.kind + ' ' + s.brief : s.kind, used); });
  if (mine.length) stop.step('your agents: ' + mine.map(a => a.name + (a.model ? ' (' + (a.model.name || a.model.id) + ')' : '')).join(', '));
  const refs = secs.filter(s => s.ref).map(s => `${s.kind} ← «${s.ref.name}»`);
  if (refs.length) stop.step('starting from library components: ' + refs.join(', '));
  const one = async s => {
    const n = s.i + 1, tag = s.kind === 'header' ? 'header' : s.kind === 'footer' ? 'footer' : 'section';
    const base = s.ref ? `\n\nLIBRARY COMPONENT to build from — «${s.ref.name}» from the openconstructor catalog. Use it as the base: keep its layout idea, structure and craft details (spacing, hover states, icons, motion), but restyle it with the shared design system variables, rename every class to the .s${n} prefix and replace all texts and pictures with this page's content:\n\`\`\`html\n${s.ref.code}\n\`\`\`` : '';
    const ask = `Page request: ${request}\n\nThe page plan (other designers build the other sections at the same time):\n${outline}\n\nShared design system — already on the page inside the wrapper .pg; use its variables and classes (.wrap, .btn, .btn-ghost, .eyebrow), do NOT redefine them:\n\`\`\`css\n${css}\n\`\`\`\n\nYOUR PART: section ${n} of ${secs.length} — ${s.kind}: ${s.brief}\n\nSECTION MODE (this overrides the answer format above — no JSON header line): reply with ONLY one \`\`\`html block: first ONE <style> where every selector starts with .s${n} (e.g. .s${n} .grid{…}), then ONE <${tag} class="s${n}">…</${tag}> element, full width, its content inside <div class="wrap">. Give it an explicit background from the shared variables (alternate var(--bg) and var(--surface) with the neighbours for rhythm) and an explicit text colour. Texts in the language of the request.${base}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      let acc = '';
      try {
        const own = s.own?.model, ap = own ? byId(own.pid) : p;
        const content = await chat(ap, own ? keys[own.pid] : key, own ? own.id : m.id, system, ask, [], piece => { acc += piece || ''; stage?.part(s.i, acc); });
        const code = sectionCode(typeof content === 'string' && content.trim() ? content : acc);
        if (/<(section|header|footer|div)\b/i.test(code)) { stage?.part(s.i, '```html\n' + code, true); return code; }
      } catch (err) { if (err.code === 'signin' || err.status === 401 || attempt) throw err; }
    }
    return '';
  };
  const done = await Promise.allSettled(secs.map(one));
  const signin = done.find(x => x.status === 'rejected' && x.reason?.code === 'signin');
  if (signin) throw signin.reason;
  const codes = done.map(x => x.status === 'fulfilled' ? x.value : '').filter(Boolean);
  if (codes.length < 2) throw done.find(x => x.status === 'rejected')?.reason || Error('The agents could not build the sections');
  return { action: 'add', full: true, name: String(data.name || 'New page').slice(0, 60), reply: String(data.reply || `Done — ${codes.length} agents built the page section by section.`), code: `<style>${css}</style><div class="pg">${codes.join('\n')}</div>` };
}

async function runAI(request, custom = {}){
  const m = current(), p = byId(m.pid), key = keys[m.pid];
  if (!p) { $('chatStatus').textContent = 'Pick a model from the list below the input.'; return; }
  // the free AI works signed out too (a few tries a day); the server says when it's time to sign in
  if (p.kind !== 'proxy' && !key) { $('chatStatus').textContent = `Add a ${p.name} key to use this model.`; openSettings(); return; }
  track('ai_send'); tokensTurn();
  // What a change request applies to: the selection, else the page being worked on (the last element the AI
  // built or the only full-width section), so 'make the photos bigger' edits it instead of adding a new page
  const fulls = items.filter(x => x.full);
  const target = custom.targetId ? items.find(x => x.id === custom.targetId) : custom.user ? null : codeFocus !== undefined ? items.find(x => x.id === codeFocus) || null : items.find(x => x.id === selected) || items.find(x => x.id === lastAiId) || (fulls.length ? fulls[fulls.length - 1] : null);
  const implicit = target && target.id !== selected;
  const recent = custom.user ? '' : chatContext(); // turns before this one
  logChat('user', request);
  const asked = message(request, 'user'); $('send').disabled = true; $('chatStatus').textContent = '';
  if (custom.shown?.length) {
    const strip = document.createElement('div'); strip.className = 'msg-attachments';
    strip.innerHTML = custom.shown.map(a => a.url ? `<img src="${a.url}" alt="${escapeHTML(a.name)}" title="${escapeHTML(a.name)}">` : `<span class="msg-file">📄 ${escapeHTML(a.name)}</span>`).join('');
    asked.append(strip); toBottom();
  }
  const stop = thinking({ ghost: true, stage: custom.user ? null : liveStage(target) });
  // cinematic / 3D site requests get one finished section as a quality reference (the rules alone are too abstract for small models)
  const cineRef = text => {
    if (!/\b3d\b|3д|cinemat|кинемат|immersive|иммерсив|neon|неон|futur|футур|premium|премиум|luxury|люкс|award|awwwards/i.test(text) || /\b(model|object|asset|scene)\b|модел|объект|ассет|сцен/i.test(text)) return '';
    const ref = presets.find(p => p.name === 'Neon square hero');
    return ref ? '\n\nStyle reference — one finished section in the expected cinematic quality. Do NOT copy its texts or layout one-to-one — write every text in the language of the request, keep the 3D object clear of the headline; match its polish (glow, CSS 3D object, huge tight type, spacing) across the WHOLE page, and use an art: hero image:\n```html\n' + ref.code + '\n```' : '';
  };
  const appMode = !custom.user && (appOn || !!target?.app);
  const system = `You are openconstructor AI, you build interfaces. Answer in EXACTLY this format and nothing else:
line 1 — a one-line JSON header WITHOUT the code: {"action":"add|update|reply","full":true|false,"name":"short element name","reply":"short reply to the user"}
then, unless action is "reply", the HTML and CSS in ONE fenced block:
\`\`\`html
<style>…</style>
<markup>…</markup>
\`\`\`
Rules:
- Questions and conversation: you are also a knowledgeable general assistant, not only a website builder. If the message is a question or conversation on ANY topic (code, writing, business, marketing, studies, advice, how-to, a greeting) and does not ask to build or change something on the canvas, use action "reply": line 1 is just {"action":"reply"} and then, on the following lines, your full answer as plain Markdown (short paragraphs, lists, **bold**, code in fenced blocks). Answer the actual question thoroughly and to the point, do not steer the talk back to the website, and NEVER create an element for a question — code examples in an answer are fine.
- "Current element" is what the user is working on (selected, or the page built last). If the request changes anything about it (colors, text, layout, photos, adding or removing a section inside it), use action "update" and return the COMPLETE updated element, keeping everything the user did not ask to change. An update is an edit, not a redesign: copy the Current element's code and change only the lines the request is about — same class names, colors, fonts, sizes, spacing, layout, texts and photos everywhere else (asked to change one price, return the same page with only that price different). Use "add" only when the user clearly wants a separate new block, component or page, or when there is no current element.
- Page: ${page.w}×${page.h}px, ${isLightPage() ? 'light' : 'dark'} background. If the user asks for a website, landing page, page or section, set "full": true and build a complete full-width layout (header, hero, content blocks, footer) with a root element of width:100%. For a standalone component (button, card, form), set "full": false, width up to 360px.
- Language: write "reply" in the language of the user's message; if unclear, in ${AI_LANG[lang]}. Texts on the page you build go in the language the user writes in (or the language they ask for).
- Colors: text must always be clearly readable. Give the root element (and every section that changes the background) an explicit background AND an explicit text color — never rely on inherited color. Dark text on light backgrounds, light text on dark ones; never white or near-white text on a white or light background, or dark text on a dark one.
- Forms (contact, sign-up, newsletter, order): use a real <form> with a submit button and give every field a short name attribute (name="email", name="message") — on a published page the messages reach the page's author.
${appMode ? APP_RULES + '\n- No external links or fonts. Icons as inline SVG.' : '- Self-contained HTML and CSS only: one <style> plus markup. No JavaScript, external links or fonts. Icons as inline SVG.'}
- Real photos make pages feel finished: for websites, landing pages, heroes, product/menu cards, galleries, team and testimonials use photos — <img src="photo:2-4 English words" alt="…"> sized by CSS with object-fit:cover, or background-image:url('photo:2-4 English words'). Append ?portrait or ?square for tall or square slots (photo:barista portrait?portrait). Describe what should be in the picture (photo:latte art cup, photo:cozy cafe interior). Never write http image URLs. Small UI components (buttons, inputs, toggles) need no photos.${custom.attachNote || ''}
- Cinematic / 3D websites: when the user asks for a 3D, immersive, cinematic, futuristic, neon, luxury or "premium/award-winning" website, page or landing, build HTML (NOT scene3d) in this style:
  · near-black background (#03050a–#0a0a0f), light text; ONE neon accent (electric blue #4d8dff, violet, cyan or magenta) used for glow: box-shadow 0 0 20px/60px/140px in the accent, text-shadow, radial-gradient light pools behind objects;
  · huge tight headlines: font-size clamp(44px,8vw,112px), line-height .95, letter-spacing -0.045em, weight 600, a second half of the sentence in a muted grey (Immersive experiences. <span>Lasting impressions.</span>); tiny uppercase labels above with letter-spacing .3em;
  · 3D objects are model: pictures (see "3D objects on pages"), with a radial-gradient light pool behind them in the accent and a slow float; CSS 3D (perspective + rotateX/Y) only for FLAT things — a tilted card, a glowing neon frame, a perspective grid floor (rotateX(60deg) on a line grid);
  · the hero background is a generated 3D render: <img src="art:…"> or background-image:url('art:…') with an English description ending in "cinematic 3d render, dark background, volumetric light" (art:glowing blue neon square floating above dark rocky terrain, cinematic 3d render, dark background, volumetric light). Use art: at most twice, only for big hero / showcase visuals; darken with a gradient overlay so the text stays readable;
  · motion on scroll without JS: @supports (animation-timeline:view()){.x{animation:rise linear both;animation-timeline:view();animation-range:entry 0% cover 35%}} @keyframes rise{from{opacity:0;transform:translateY(60px)}} — also for media that scales from .8 to 1 and words that light up from #2a3040 to white; marquee logo walls with mask fades; thin 1px #ffffff1c dividers, numbered services 01–04, wide case-study cards;
  · the hero MUST show a glowing 3D object next to (not over) the headline — a model: picture (chrome knot, glass gem, iridescent blob…) on a light pool, or the neon frame from the reference;
  · a COMPLETE site of 7+ sections, not just a hero: header, hero with the 3D object, a big statement, products or a 3D showcase (model: objects), numbered services 01–04, case studies, logo wall, call to action, footer;
  · in this style do NOT use photo: (stock photos break the mood) — case-study and product cards get dark cards with coloured radial-gradient light pools, model: objects or the art: picture instead;
  · lots of space (section padding 110px+), few words per block, everything respects prefers-reduced-motion.
- Motion (EVERY website, landing or full page, any style): it must feel alive like an award-winning site — sections and cards rise in on scroll, pictures zoom from .88 to 1 as they enter, one big statement whose words light up one after another while scrolling, a logo wall as an endless marquee with mask fades, hover lift + soft glow on cards and buttons, a slow float on the hero visual. Pure CSS: scroll effects inside @supports (animation-timeline:view()){…} with animation-timeline:view() and animation-range:entry 0% cover 30%; everything wrapped so prefers-reduced-motion turns it off. The header and the hero are visible at once (no scroll reveal on them).
- 3D objects on pages: NEVER build spheres, tori, pyramids, gems, blobs or cubes out of divs and CSS transforms — they come out flat and broken. Put a real rendered object instead: <img src="model:SHAPE MATERIAL COLOR" alt="…"> (transparent PNG, square; size it with CSS, e.g. width:min(420px,40vw)). SHAPE: cube, sphere, torus, ring, knot, pyramid, cone, cylinder, capsule, diamond, icosahedron, dodecahedron, blob, star, heart, helix, coin, shapes (a little composition), or "letter X" for one 3D letter (model:letter R chrome) or "text WORD" for a 3D word or logo of up to 24 characters, written EXACTLY as the user wrote it, in ONE model (model:text OPENCONSTRUCTOR glass; with spaces in quotes: model:text "Open Studio" chrome) — never split a word into several models and never fake 3D type with CSS gradients or text-shadow. The 3D font has Latin letters, digits and basic punctuation only: for Cyrillic or other scripts say so in the reply and offer the Latin spelling. MATERIAL: chrome, gold, metal, glass, iridescent, pearl, plastic, matte, clay, velvet, neon. COLOR: a #hex or a colour word (model:knot plastic #ff5a36, model:diamond glass #8b5cf6, model:torus chrome, model:blob iridescent). Every model: object is a LIVE real-time 3D model on the page (WebGL): it already turns smoothly toward the cursor and floats by itself — so when the user asks for a 3D model, a 3D letter or logo, or a 3D object that reacts to the cursor, THIS is how to do it: never fake it with a flat picture, CSS 3D or your own tilt/rotate/perspective/hover transforms on it (they fight its own motion; a plain size, position and a light pool behind are right). Letters keep their case: write the letter exactly as the user wrote it (model:letter D chrome). When you edit an element that has a model: object, KEEP the <img src="model:…"> (change its material or size if asked) — removing the background, a glow or a caption never removes the object itself; give it an explicit width (e.g. width:min(420px,80vw)). "Mirror" = chrome. Use them for heroes, feature cards (one per card, same material across a set), product showcases and decorative accents; give them a slow float (@keyframes up/down 6–8s), a soft drop-shadow or a radial-gradient light pool behind. Up to 8 per page.
- A single 3D object — a 3D letter, number, word or logo, or one shape in a material (chrome D, glass knot, gold coin), especially one that should react to the cursor — is NOT a scene: answer with a small html element holding <img src="model:letter D chrome"> (see "3D objects on pages"): it is a live model that turns toward the cursor, with real mirror (chrome) and glass materials. "Just the letter" means just that element, no page around it.
- 3D letters, numbers, words and logos are NEVER assembled from boxes, cylinders or tori — they come out as broken pieces. On a page: model:letter X; inside a scene3d: shape "text" with "text":"D".
- 3D: when the user asks for a composed 3D model, asset or scene AS THE ELEMENT ITSELF — a chair, a character, a room, a car (or the Current element is a 3D scene) — you CAN do it: use action "scene3d" and, instead of the html block, ONE \`\`\`json block with the scene. Shape:
{"size":[520,400],"background":null,"environment":"studio|sunset|night","autoRotate":20,"floor":{"shadow":true},"camera":{"position":[3,2,4],"target":[0,0.6,0],"fov":40},"objects":[{"name":"seat","shape":"box","size":[1,0.12,1],"rounded":0.04,"position":[0,0.5,0],"rotation":[0,0,0],"color":"#c2410c","metalness":0,"roughness":0.6,"children":[]}]}
shapes: text (text "D", height = letter size in meters, depth, bevel — real 3D type for letters, numbers, words, logos), box (size [w,h,d], rounded), sphere (radius), cylinder (radius or radiusTop/radiusBottom, height, sides), cone (radius, height), torus (radius, tube, arc°), capsule (radius, length), plane (size [w,h]), icosahedron/dodecahedron/octahedron/tetrahedron (radius, detail), ring (inner, outer), lathe (points [[r,y],…] profile — vases, cups, bottles), extrude (points [[x,y],…] outline + depth, bevel — swords, stars, logos), group (children only).
Each object: name, position [x,y,z] in meters (y up, ground at y=0, a chair is ~0.9 m tall), rotation [x,y,z] in degrees, scale, color "#hex", metalness 0-1, roughness 0-1, emissive "#hex" + emissiveIntensity for glow, opacity, flat:true for a low-poly look, animate {"spin":[0,45,0] deg/s, "bob":0.05, "pulse":0.05}, children (positions relative to the parent).
Build recognizable things from MANY well-placed parts (a chair = seat + backrest + 4 legs; a character = body, head, eyes, arms, legs), with a coherent palette. Omit "camera" to auto-frame. Leave background null to sit on the page. For a change to a 3D Current element, return the WHOLE updated scene.
- Internet: you can look things up on the web. When the request needs facts you may not know or that change (news, current events, prices, a real company, product, person, place or website, library docs, "find", "search", "latest", "today"), and the message has no "Web results" for it yet, reply with ONLY line 1: {"action":"search","query":"short web search query"} and nothing else — the results come back to you. Never search for things you can make up (design ideas, sample texts, generic content). When "Web results" are given, base your answer on them.
- Do not style html or body; use unique class names with a shared prefix.
- Understand the job first (silently, do not write the plan): who visits this page and the ONE thing it must make them do. Then pick the sections a real business of this kind needs — a café: menu with real prices, hours, address, booking; a SaaS: value in one line, how it works, product shots, pricing, FAQ, sign-up; a portfolio: selected work first, then about and contact; a tool or calculator: the tool itself above the fold, a short explanation, examples. Never pad with generic blocks.
- Copy like a senior copywriter: specific, concrete and short — real-sounding names, numbers, prices, places, dates and outcomes ("Ships in 48 hours", "4.9 from 2,300 reviews"); no lorem ipsum, no "Feature 1", no empty buzzwords ("innovative solutions", "next level"). Headlines say the benefit; buttons say the action ("Book a table", not "Submit").
- Craft like a senior product designer (Linear, Stripe, Vercel, Apple level):
  · a small design system — define colours as CSS variables on your root wrapper class (not :root, html or body) (--bg, --surface, --text, --muted, --line, --accent) and reuse them; ONE accent colour, neutrals for everything else; no rainbow, no purple-to-blue gradient clichés unless asked;
  · type: font-family system-ui/-apple-system/"Segoe UI"/Inter-like stacks; a clear scale (display clamp(40px,6vw,76px) / h2 clamp(28px,3.4vw,44px) / body 16–18px / small 13–14px), line-height 1.05–1.15 for headings and 1.55–1.7 for text, letter-spacing -0.02em to -0.04em on big headings, max 60–70 characters per line;
  · layout: content in a centred container (max-width 1120–1200px, side padding 24–32px), an 8px spacing rhythm, generous section padding (88–128px), CSS grid with auto-fit/minmax for card sets, align everything to the same left edges; vary the rhythm — not every section is three equal cards;
  · details: consistent radii (one small, one large), 1px hairline borders in --line, layered soft shadows only on raised things, inline SVG icons with one stroke width (1.5–2) and size, buttons ≥44px tall with clear :hover and :focus-visible, real <a>/<button>/<form>, semantic tags (header, nav, main, section, footer), alt texts;
  · responsive: it is exported to phones — add @media (max-width:760px) rules: grids to one column, smaller display type, reduced padding, nav collapses to the essentials; no fixed widths over 100%, no 100vh heights, no position:fixed.
- Self-check before answering: every class used is styled, every section has an explicit background and text colour, nothing overflows, the page reads well at 1440px and at 390px.
${brandRules()}- Today is ${new Date().toISOString().slice(0, 10)}: the current year is ${new Date().getFullYear()}. Use it for copyright lines, dates and \"since\"/\"years\" texts; never write an older year as the current one.\n- Clean, modern design: spacing, heading hierarchy, rounded corners, shadows, hover states. Respect prefers-reduced-motion for animations.
- Write all UI text in the components in the same language as the user's request.
- Keep the code compact (no comments, no repeated boilerplate) so the answer fits in one response.`;
  // photos already in the selected element travel as short kept:N tokens, not megabytes of base64
  const kept = [];
  // live 3D objects go back to the form the model writes (<img src="model:…">), so an edit keeps them
  const slim = code => unModel(String(code)).replace(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g, d => 'kept:' + kept.push(d));
  const user = custom.user || ((recent ? 'Conversation so far (for context):\n' + recent + '\n\n' : '') + 'Current element' + (implicit ? ' (not selected — the page built last)' : ' (selected)') + ': ' + JSON.stringify(target ? (target.scene ? { name: target.name, type: '3D scene', scene: target.scene } : { name: target.name, code: slim(target.code) }) : null) + '\nOther elements: ' + JSON.stringify(items.map(x => ({ name: x.name }))) + (target && !custom.ask ? '\nIf the request changes, fixes or restyles anything in the Current element, answer with action "update" and the COMPLETE updated element. Use "add" only for a clearly separate new block.' : '') + '\nRequest: ' + (custom.ask || request) + cineRef(custom.ask || request) + (appMode && !target?.app ? appReference(custom.ask || request) : '') + (custom.extra || ''));
  // web: pages linked in the request are read up front; the model can ask for a search (action "search")
  let webNote = '', searches = 0;
  const webGet = async qs => { const r = await fetch('/api/web?' + qs); if (!r.ok) throw Error((await r.json().catch(() => ({})))?.error?.message || 'HTTP ' + r.status); return r.json(); };
  const pageNote = pg => `Page ${pg.url}${pg.title ? ' — ' + pg.title : ''}:\n${pg.text}`;
  const searchQuery = content => { const m = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').match(/^\s*\{[^{}]*"action"\s*:\s*"search"[^{}]*\}/); if (!m) return ''; try { return String(JSON.parse(m[0]).query || '').trim().slice(0, 200); } catch { return ''; } };
  // an automatic fix of the answer just given belongs to the same turn (the server counts up to 4 calls of one turn once)
  if (!(custom.sameTurn && aiTurn.id)) aiTurn.id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  try {
    const links = custom.user ? [] : [...new Set((request.match(/\bhttps?:\/\/[^\s<>"')]+/gi) || []).map(u => u.replace(/[.,;:!?]+$/, '')))].slice(0, 2);
    for (const link of links) {
      try { const d = await stop.web(`reading ${link.replace(/^https?:\/\//, '').slice(0, 50)}`, () => webGet('url=' + encodeURIComponent(link))); webNote += '\n\n' + d.pages.map(pageNote).join('\n\n'); }
      catch (err) { webNote += `\n\n(${link} could not be opened: ${err.message})`; }
    }
    if (webNote) webNote = '\n\nWeb pages from the request (fetched today):' + webNote;
    // One automatic retry when the answer can't be parsed (free models sometimes break the format);
    // a model that rejects images gets the request again without them.
    const getResult = async (extra = '', quiet = false) => {
      let images = custom.images || [];
      for (let attempt = 0; ; attempt++) {
        let content;
        const ask = (extra ? user + '\n\n' + extra : user) + webNote + (searches >= 2 ? '\n\nDo not search again — answer with what you have.' : '') + (attempt ? '\n\nIMPORTANT: your previous answer could not be read. Reply EXACTLY in the required format: the one-line JSON header, then ONE ```html block.' : '') + (attempt && appMode ? ' Your previous answer came back empty or cut off. Do NOT write the code in your reasoning: think in two sentences at most, then write the answer straight away, compact enough to finish (close </script> and the ``` block).' : '');
        if (!quiet) stop.liveReset();
        try { content = await chat(p, key, m.id, system, ask, images, quiet ? null : (piece, why) => stop.live(piece, why)); }
        catch (err) {
          if (images.length && attempt < 2 && ![401, 429].includes(err.status)) { images = []; if (!quiet) stop.step('this model can’t see images — continuing without them'); continue; }
          throw err;
        }
        const q = !quiet && searches < 2 && searchQuery(content);
        if (q) {
          searches++; attempt--;
          try {
            const d = await stop.web(`searching the web: “${q.slice(0, 60)}”`, () => webGet('q=' + encodeURIComponent(q)));
            const list = (d.results || []).slice(0, 6).map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.snippet}`).join('\n');
            webNote += `\n\nWeb results for "${q}" (searched ${new Date().toISOString().slice(0, 10)}):\n${list || 'nothing found'}` + (d.pages || []).map(pg => '\n\n' + pageNote(pg)).join('');
          } catch (err) { webNote += `\n\nWeb search for "${q}" failed (${err.message}) — answer from what you know and say the facts may be out of date.`; }
          continue;
        }
        try {
          if (typeof content !== 'string' || !content.trim()) throw Error('Empty model response');
          const r = parseScene(content) || parseAnswer(content);
          if (!r.scene && !(r.action === 'reply' || (!r.code && r.reply)) && (typeof r.code !== 'string' || !r.code.trim())) throw Error('Invalid code');
          // an app whose script never closes was cut off by the answer limit: it would sit there doing nothing
          if (appMode && /<script\b/i.test(r.code || '') && !/<\/script\s*>/i.test(r.code)) throw Error('The app was cut off before it was finished — ask for a simpler version or pick another model');
          return r;
        } catch (err) { if (attempt >= (appMode ? 2 : 1)) throw err; if (!quiet) stop.step('the answer came out garbled — asking again'); }
      }
    };
    let result, prepared = false;
    // A new cinematic / 3D SITE: the page is assembled from the hand-made cinematic sections (cine-template.js);
    // the model only writes the content as JSON — small free models can't reach that polish on their own.
    const cineMode = !appMode && !custom.user && !custom.ask && !custom.images?.length && (!target || implicit) && !!cineRef(request)
      && /сайт|site|page|страниц|лендинг|landing|портфолио|portfolio|главн/i.test(request);
    if (cineMode) {
      stop.step('writing the content for a cinematic 3D site');
      const { cinePage, cinePrompt } = await import('./cine-template.js');
      let data = null;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        stop.liveReset();
        const content = await chat(p, key, m.id, cinePrompt(), (recent ? 'Conversation so far (for context):\n' + recent + '\n\n' : '') + 'Request: ' + request + (attempt ? '\n\nIMPORTANT: reply with ONLY the JSON object.' : ''), [], (piece, why) => stop.live(piece, why));
        try { const j = firstJSON(String(content).replace(/<think>[\s\S]*?<\/think>/gi, '')); data = j && looseJSON(j.json); } catch { data = null; }
        if (data && typeof data !== 'object') data = null;
      }
      if (!data) throw Error('The model answered in an unexpected format');
      artHue = Number.isFinite(+data.hue) ? +data.hue : 220;
      result = { action: 'add', full: true, name: String(data.brand || 'Cinematic site').slice(0, 60) + ' · 3D site', code: cinePage(data), reply: String(data.reply || '') };
    } else if (!appMode && !custom.user && !custom.ask && !custom.images?.length && !variantsOn && (!target || custom.swarm || (implicit && SWARM_NEW.test(request))) && (custom.swarm || SWARM_RE.test(request)) && (result = await buildSwarm({ p, key, m, request, recent, system, stop }))) {
      // a new page built by parallel agents (planner + one agent per section, see buildSwarm)
    } else if (variantsOn && !appMode && !custom.user && !custom.ask && !custom.images?.length) {
      stop.step('making 3 different variants');
      const hints = [
        'VARIANT 1 of 3 — a clean, minimal take: generous whitespace, restrained palette.',
        'VARIANT 2 of 3 — bold: strong colour, large type, high contrast, confident shapes.',
        'VARIANT 3 of 3 — a different layout idea: rearrange the structure in an unexpected but tasteful way.',
      ].map(h => h + ' Make it clearly different from the other two variants; same content and language.');
      const settled = await Promise.allSettled(hints.map(h => getResult(h, true)));
      const done = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
      const builds = done.filter(r => !r.scene && r.action !== 'reply' && typeof r.code === 'string' && r.code.trim() && r.code.length <= 200000);
      if (builds.length >= 2) {
        stop.step('finding photos for the variants');
        await Promise.all(builds.map(async r => { r.full = r.full === true || r.full === 'true'; r.code = await fixContrast(withBrand(await resolveMedia(r.code, custom.attachments || [], () => {}, kept)), r.full); }));
        stop.step('your turn: pick a variant'); stop.stageOff();
        const pick = await chooseVariant(builds);
        if (pick === null) { await stop.finish('no variant picked'); setState('kept the page as it was'); message('No variant picked — the page stays as it was.', 'assistant'); return; }
        if (pick === 'all') {
          for (const r of builds) add(String(r.name || 'New element').slice(0, 80), r.code, { full: r.full, ...(custom.place || {}) });
          lastAiId = selected;
          await stop.finish('placed 3 variants on the canvas'); setState('variants placed', 'ok');
          message(`All ${builds.length} variants are on the page — delete the ones you don't need.`, 'assistant'); logChat('assistant', 'placed all variants'); $('prompt').value = '';
          window.dispatchEvent(new CustomEvent('oc:generated')); return;
        }
        result = builds[pick]; prepared = true;
      } else if (done.length) result = builds[0] || done[0];
      else throw settled[0].reason;
    } else result = await getResult();
    if (cineMode && !result.reply) result.reply = 'Done — a cinematic 3D site is on the canvas. Select any part and ask the AI to change it.';
    if (!result.scene && (result.action === 'reply' || (!result.code && result.reply))) {
      await stop.answer(); await stop.finish('answered');
      setState('ready'); message(String(result.reply || '…'), 'assistant'); logChat('assistant', result.reply || '…'); $('prompt').value = ''; return;
    }
    if (result.scene) {
      // 3D: render the scene, keep its description on the element (live view + .glb come from it)
      await stop.compose(result.name || '3D model', JSON.stringify(result.scene, null, 1));
      stop.step('rendering in 3D');
      const m = await load3d();
      const spec = m.normalize(result.scene);
      const code = m.imgCode(spec, await m.snapshot(spec), result.name);
      const name = String(result.name || '3D model').slice(0, 80);
      if (target?.scene) {
        const item = items.find(x => x.id === target.id); if (!item) throw Error('The element was deleted during the request');
        checkpoint(); Object.assign(item, { name, code, scene: spec }); selected = item.id; lastAiId = item.id; render();
      } else { add(name, code, { scene: spec, ...(custom.place || {}) }); lastAiId = selected; }
      await stop.finish('placed on the canvas · right-click → 3D model (.glb)'); setState('3D model ready', 'ok');
      message(String(result.reply || 'Done — the 3D model is on the canvas. Press ▶ play to orbit it with the mouse; right-click → “3D model (.glb)” to download it.'), 'assistant'); logChat('assistant', result.reply || '3D model ready');
      $('prompt').value = ''; window.dispatchEvent(new CustomEvent('oc:generated'));
      return;
    }
    if (typeof result.code !== 'string' || !result.code.trim() || result.code.length > 200000) throw Error('Invalid code');
    await stop.compose(result.name, result.code);
    const full = result.full === true || result.full === 'true';
    if (!prepared) {
      // cinematic pages: stock photos break the mood whatever the model was told → drawn art / neon light instead
      if (cineRef(custom.ask || request)) result.code = result.code.replace(/(["'(]\s*)photo:([^"'()<>\n?]{1,80})(\?\w+)?/g, (_, q, what) => `${q}art:${what.trim()}, cinematic 3d render, dark background, volumetric neon light`);
      result.code = await resolveMedia(result.code, custom.attachments || [], qs => stop.step('finding photos: ' + qs.slice(0, 4).join(', ') + (qs.length > 4 ? '…' : '')), kept, qs => stop.step('drawing 3D art: ' + qs.map(q => q.slice(0, 40)).join(' · ')), qs => stop.step('rendering 3D objects: ' + qs.slice(0, 4).join(' · ')));
      artHue = 220;
      result.code = appMode ? withBrand(result.code) : await fixContrast(withBrand(result.code), full);
      if (full && !appMode) result.code = withMotion(result.code);
    }
    if (result.action !== 'update' && target && !target.scene && !custom.place && isRewriteOf(target.code, result.code)) result.action = 'update';
    if (result.action === 'update' && target) {
      const item = items.find(x => x.id === target.id); if (!item) throw Error('The element was deleted during the request');
      checkpoint(); item.name = String(result.name || item.name).slice(0, 80); item.code = result.code;
      if (appMode && /<script\b/i.test(result.code)) item.app = true;
      if (full) { item.full = true; item.x = 0; }
      selected = item.id; lastAiId = item.id; render();
    } else { add(String(result.name || 'New element').slice(0, 80), result.code, { full, ...(appMode && /<script\b/i.test(result.code) ? { app: true } : {}), ...(custom.place || {}) }); lastAiId = selected; }
    await stop.finish(result.action === 'update' && target ? 'updated on the canvas' : 'placed on the canvas'); setState('element ready', 'ok');
    message(String(result.reply || 'Done. The element is on the page.'), 'assistant'); logChat('assistant', result.reply || 'Done. The element is on the page.'); $('prompt').value = ''; window.dispatchEvent(new CustomEvent('oc:generated'));
    track('ai_ok');
    if (p.kind === 'proxy' && !authUser && !nudged) signupNudge('first');
    else if (!custom.targetId) suggestNext();
  } catch (e) {
    stop();
    if (e.code === 'signin') { setState('sign in for more', 'error'); track('ai_limit'); signupNudge('limit'); return; }
    track('ai_fail'); track(failReason(e));
    setState('ai error', 'error'); $('chatStatus').textContent = 'Error: ' + e.message; message('Could not apply the response. Try again or pick another model.', 'assistant');
  }
  finally { $('send').disabled = false; window.dispatchEvent(new CustomEvent('oc:ai-idle')); }
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
  if (e.target.closest?.('#react-composer')) return; // pasted into the chat box: it becomes an attachment
  const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault(); fromScreenshot(file);
});
// Drop an image file onto the canvas
canvas.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) { e.preventDefault(); canvas.classList.add('drop-shot'); } });
canvas.addEventListener('dragleave', () => canvas.classList.remove('drop-shot'));
canvas.addEventListener('drop', e => { canvas.classList.remove('drop-shot'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); fromScreenshot(f); } });

/* ── API for the welcome screen, menus and feature modules (publish, projects, theme…) ── */
export const stats = { presets: 200, ready: presetsReady };
// Data from files, the cloud or remix links is untrusted: ids end up in markup, sizes in inputs
const SAFE_ID = /^[\w-]{1,64}$/;
function cleanItems(list){
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object').map(x => {
    let id = typeof x.id === 'string' && SAFE_ID.test(x.id) && !seen.has(x.id) ? x.id : crypto.randomUUID(); seen.add(id);
    return { ...x, id, name: String(x.name ?? 'element').slice(0, 80), code: String(x.code ?? '') };
  });
}
function cleanPage(pg){
  const num = (v, d) => Number.isFinite(+v) ? +v : d;
  return { ...pg, w: clampSize(num(pg.w, 1440), PAGE_MIN.w), h: clampSize(num(pg.h, 900), PAGE_MIN.h) };
}
export const studio = {
  // for the Ctrl+K palette: every catalog component (mine first) with a way to add it
  catalog: () => [
    ...mine.map(m => ({ name: m.name, category: MINE, add: () => add(m.name, m.code, { full: m.full, ...(m.scene ? { scene: m.scene } : {}), ...(m.app ? { app: true } : {}) }) })),
    ...presets.map(p => ({ name: p.name, category: p.category, add: () => add(p.name, p.code, { full: p.full }) })),
  ],
  addIcon: () => addIcon(),
  addAIPicture: () => addAIPicture(),
  editPart: (id, html, ask) => editPart(id, html, ask),
  improve: id => improve(id ?? selected),
  recolorAll: mode => recolorAll(mode),
  selectedId: () => selected,
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
    checkpoint(); items = cleanItems(list);
    // a loaded project brings its own screens (or none) — never keep the previous project's
    if (pg) { page = cleanPage({ ...page, screens: undefined, screen: undefined, ...pg }); store.set('oc-page', page); syncPageSize(); syncSwatches(); }
    window.dispatchEvent(new CustomEvent('oc:screens'));
    if (name) { nameEl.textContent = name; store.set('oc-name', name); switchChat(); }
    selected = null; for (const el of nodes.values()) el._key = null; render(); requestAnimationFrame(fitZoom);
  },
  // Switch the canvas to another screen's content: no undo step (undo history is per screen)
  swap({ items: list = [], page: pg = {} }){
    items = cleanItems(list); history = []; future = []; syncUndo();
    page = cleanPage({ ...pg }); store.set('oc-page', page); syncPageSize(); syncSwatches(); drawZones();
    selected = null; picked.clear(); for (const el of nodes.values()) el._key = null; render(); requestAnimationFrame(fitZoom);
  },
  // Resolves once every element frame has loaded and been measured (for exports that read the DOM)
  async rendered(timeout = 4000){
    const t0 = performance.now();
    while (performance.now() - t0 < timeout && [...nodes.values()].some(el => !el.querySelector('iframe')._loaded)) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 380));
  },
  layoutNow: () => layout(),
  contentHeight: () => pageHeightNow(),
  // set by screens.js: { count(), collect(snap), forHTML() }
  screens: null,
  isPlaying: () => playing,
  // feedback
  status: (text, kind) => setState(text, kind),
  say: (text, role = 'assistant') => message(text, role),
  menu: (x, y, entries) => openCtx(x, y, entries),
  ai: (request, custom) => runAI(request, custom),
  busy: () => $('send').disabled,
  setAppMode: (on, quiet) => setAppMode(on, quiet),
  appMode: () => appOn,
  setCodeFocus: id => { codeFocus = id; },
  // a ready-made app from apps.js, placed on the canvas
  addApp(id){
    const ex = APP_EXAMPLES.find(x => x.id === id); if (!ex) return;
    add(t(ex.name), ex.code, { app: true }); lastAiId = selected; setAppMode(true, true);
    message(t('This app works: press ▶ play to use it. Select it and describe a change — the AI edits the app, logic included.'), 'assistant');
  },
};
// dev builds only: tests and debugging reach the live editor (a dynamic import would load a second copy)
if (import.meta.env?.DEV) window.__oc = { studio };
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
function openWelcome(section){ window.dispatchEvent(new CustomEvent('oc:welcome', { detail: typeof section === 'string' ? section : '' })); }
$('homeBtn').addEventListener('click', openWelcome);
document.querySelector('.tb-menu').addEventListener('click', e => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (cmd === 'home') openWelcome();
  if (cmd === 'addCode') edit(null);
  if (cmd === 'clear') clearPage();
});
// ideas under the chat greeting fill the input
$('messages').addEventListener('click', e => { const b = e.target.closest('.welcome-ideas [data-idea]'); if (b) prefillPrompt(b.textContent.trim()); });
$('canvasEmpty').addEventListener('click', e => { const b = e.target.closest('[data-empty]'); if (!b) return; if (b.dataset.empty === 'welcome') openWelcome('wl-templates');
  else if (b.dataset.empty === 'screenshot') pickScreenshot();
  else if (b.dataset.empty === 'library') { window.dispatchEvent(new CustomEvent('oc:show-view', { detail: 'library' })); const s = $('catalogSearch'); s.focus(); $('sidePanel').animate([{ boxShadow: 'inset 0 0 0 1px var(--accent)' }, { boxShadow: 'inset 0 0 0 1px transparent' }], { duration: 1200 }); }
  else { window.dispatchEvent(new CustomEvent('oc:open-chat')); prefillPrompt(t(b.dataset.empty)); } });

render();
renderChat();
requestAnimationFrame(fitZoom);
// Keys are decrypted first, then each provider's model list loads
readKeys().then(k => { keys = k || {}; }).catch(() => {}).finally(loadModels);
