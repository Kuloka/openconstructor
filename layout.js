// VS Code-style layout: a rail of icons and ONE panel next to it. The panel shows the AI chat,
// the components or the layers — one at a time — so the canvas keeps the rest of the screen.
// Drag the splitter to resize (each view keeps its own width), hide the panel, move it to the
// other side, maximize the chat. Everything is remembered.
import logoSvg from './src/logo.svg?raw';
const $ = id => document.getElementById(id);
const KEY = 'oc-layout2';
const DEFAULTS = { sideW: 280, chatW: 380, open: true, swapped: false, chatMax: false, view: 'chat', float: true, floatOpen: true, fx: null, fy: null, fw: 400, fh: 560, edge: null, fcHidden: false };
let L = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) L = { ...DEFAULTS, ...saved };
  else { // carry over widths and side from the old two-panel layout
    const old = JSON.parse(localStorage.getItem('oc-layout') || '{}');
    for (const k of ['sideW', 'chatW', 'swapped']) if (old[k] != null) L[k] = old[k];
  }
} catch {}
const VIEWS = ['chat', 'library', 'layers'];
if (!VIEWS.includes(L.view)) L.view = 'chat';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} };

const main = $('main'), side = $('sidePanel'), chat = $('chatPanel');
const LIMITS = { side: [200, 560], chat: [280, 900] };
const TITLES = { library: 'components', layers: 'layers' };
const isChat = () => L.view === 'chat';

// Floating chat (desktop): the answers live in a rounded window over the canvas that you drag by its head and
// resize from the corner; the message box is a pill at the bottom of the canvas. "dock" puts both back in the panel.
const workspace = document.querySelector('.workspace');
const composerBits = () => [$('chatStatus'), $('react-composer'), document.querySelector('.composer-legacy')].filter(Boolean);
const dock = document.createElement('div'); dock.className = 'float-composer'; dock.setAttribute('data-no-drag', '');
const grip = document.createElement('div'); grip.className = 'float-grip'; grip.title = 'Drag to resize';
chat.append(grip);
// iPhone-style grabber above the message box: tap or pull down to tuck it away; the small pill brings it back
const grab = Object.assign(document.createElement('button'), { type: 'button', className: 'fc-grab', title: 'Hide the message box' });
grab.setAttribute('aria-label', 'Hide the message box');
const mini = Object.assign(document.createElement('button'), { type: 'button', className: 'fc-mini', innerHTML: '<span class="fc-mini-dot"></span><span>Ask AI</span><kbd>/</kbd>' });
dock.prepend(grab);
const setTuck = on => { L.fcHidden = on; dock.classList.toggle('tucked', on); mini.classList.toggle('on', on); save(); if (!on) setTimeout(() => dock.querySelector('textarea')?.focus(), 380); };
grab.onclick = () => setTuck(true);
mini.onclick = () => setTuck(false);
grab.addEventListener('pointerdown', e => {
  const y0 = e.clientY; grab.setPointerCapture(e.pointerId);
  const mv = ev => { const dy = Math.max(0, ev.clientY - y0); dock.style.translate = `0 ${dy}px`; if (dy > 40) { up(); setTuck(true); } };
  const up = () => { dock.style.translate = ''; grab.removeEventListener('pointermove', mv); };
  grab.addEventListener('pointermove', mv); grab.addEventListener('pointerup', up, { once: true });
});
// "/" anywhere (also the same key on a Russian layout, where it types ".") brings the message box out, or focuses it
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !(e.key === '/' || e.code === 'Slash')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || !dock.isConnected) return;
  e.preventDefault(); e.stopPropagation();
  if (L.fcHidden) setTuck(false); else dock.querySelector('textarea')?.focus();
}, true);
// the chat window pushed past the canvas edge hides in that edge; its tab slides it back out
const tab = Object.assign(document.createElement('button'), { type: 'button', className: 'edge-tab', title: 'Show the chat' });
tab.innerHTML = `<span class="oc-logo tiny" aria-hidden="true">${logoSvg}</span>`;
tab.onclick = () => { unEdge(); };
chat.append(tab);
function unEdge(){ if (!L.edge) return; const r = workspace.getBoundingClientRect(); L.fx = L.edge === 'left' ? r.left + 16 : r.right - L.fw - 16; L.edge = null; apply(); }
const floating = () => L.float && innerWidth >= 900 && !document.body.classList.contains('mobile') && !document.body.classList.contains('chat-in-code');
function clampFloat(loose){
  const r = workspace.getBoundingClientRect();
  if (L.edge && !loose) {
    L.fh = Math.min(Math.max(260, L.fh), Math.max(260, r.height - 24)); L.fy = Math.min(Math.max(r.top + 8, L.fy ?? r.top + 20), r.bottom - 120);
    Object.assign(chat.style, { left: (L.edge === 'left' ? r.left - L.fw + 30 : r.right - 30) + 'px', top: L.fy + 'px', width: L.fw + 'px', height: L.fh + 'px' });
    return;
  }
  L.fw = Math.min(Math.max(300, L.fw), Math.max(300, r.width - 24)); L.fh = Math.min(Math.max(260, L.fh), Math.max(260, r.height - 24));
  if (L.fx == null) { L.fx = r.right - L.fw - 20; L.fy = r.top + 20; }
  if (!loose) { L.fx = Math.min(Math.max(r.left + 8, L.fx), r.right - L.fw - 8); }
  L.fy = Math.min(Math.max(r.top + 8, L.fy), r.bottom - 60);
  Object.assign(chat.style, { left: L.fx + 'px', top: L.fy + 'px', width: L.fw + 'px', height: L.fh + 'px' });
}
function placeComposer(on){
  if (on && dock.parentNode !== workspace) { workspace.append(dock, mini); composerBits().forEach(b => dock.append(b)); dock.classList.toggle('tucked', !!L.fcHidden); mini.classList.toggle('on', !!L.fcHidden); }
  if (!on && dock.parentNode) { composerBits().forEach(b => chat.append(b)); chat.append(grip, tab); dock.remove(); mini.remove(); }
}

function apply(){
  const fl = floating();
  document.body.classList.toggle('chat-float', fl);
  placeComposer(fl);
  if (fl) {
    main.classList.toggle('side-closed', !L.open || isChat());
    main.classList.toggle('chat-closed', !L.floatOpen);
    chat.classList.toggle('edged', !!L.edge); chat.dataset.edge = L.edge || '';
    main.classList.remove('chat-max');
    side.style.width = L.sideW + 'px';
    requestAnimationFrame(clampFloat);
    document.querySelectorAll('.activitybar [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === 'chat' ? L.floatOpen : L.open && b.dataset.view === L.view));
    document.querySelectorAll('[data-view-body]').forEach(v => v.classList.toggle('hidden', v.dataset.viewBody !== L.view));
    if (TITLES[L.view]) $('sideTitle').textContent = TITLES[L.view];
    save(); requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return;
  }
  chat.style.left = chat.style.top = chat.style.height = ''; chat.classList.remove('edged', 'closing'); chat.dataset.edge = '';
  side.style.width = L.sideW + 'px';
  chat.style.width = L.chatW + 'px';
  main.classList.toggle('swapped', L.swapped);
  main.classList.toggle('side-closed', !L.open || isChat());
  main.classList.toggle('chat-closed', !L.open || !isChat());
  main.classList.toggle('chat-max', L.chatMax && L.open && isChat());
  document.querySelectorAll('[data-view-body]').forEach(v => v.classList.toggle('hidden', v.dataset.viewBody !== L.view));
  if (TITLES[L.view]) $('sideTitle').textContent = TITLES[L.view];
  document.querySelectorAll('.activitybar [data-view]').forEach(b => b.classList.toggle('active', L.open && b.dataset.view === L.view));
  const max = document.querySelector('[data-panel-action="max"]');
  max.textContent = L.chatMax ? '⤡' : '⤢';
  max.title = L.chatMax ? 'Restore size' : 'Maximize';
  save();
  // The canvas recalculates its size on the resize event
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

export function showView(view){ if (!VIEWS.includes(view)) return; if (view === 'chat' && floating()) { L.floatOpen = true; if (L.edge) unEdge(); else apply(); return; } L.view = view; L.open = true; if (view !== 'chat') L.chatMax = false; apply(); }
export function openChat(){ showView('chat'); }
// a rail button or shortcut: open that view, or hide the panel when it is already showing it
function toggleView(view){ if (view === 'chat' && floating()) { L.floatOpen = !L.floatOpen; apply(); return; } if (L.open && L.view === view) { L.open = false; L.chatMax = false; apply(); } else showView(view); }

document.querySelectorAll('.activitybar [data-view]').forEach(b => b.onclick = () => toggleView(b.dataset.view));

document.querySelectorAll('[data-panel-action]').forEach(b => b.onclick = () => {
  const a = b.dataset.panelAction;
  if (a === 'close' && floating() && b.dataset.panel === 'chat') { chat.classList.add('closing'); setTimeout(() => { chat.classList.remove('closing'); L.floatOpen = false; apply(); }, 200); return; }
  if (a === 'close') { L.open = false; L.chatMax = false; }
  if (a === 'swap' && b.dataset.panel === 'chat') { L.float = !L.float; if (L.float) L.floatOpen = true; else { L.view = 'chat'; L.open = true; } apply(); return; }
  if (a === 'swap') L.swapped = !L.swapped;
  if (a === 'max') L.chatMax = !L.chatMax;
  apply();
});

// Splitters: drag to resize, double-click to reset to the default width
document.querySelectorAll('.splitter').forEach(sp => {
  const which = sp.dataset.split;
  sp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('active'); document.body.classList.add('resizing');
    const panel = which === 'side' ? side : chat;
    const startX = e.clientX, startW = panel.offsetWidth;
    const rect = panel.getBoundingClientRect();
    const onLeft = rect.left < sp.getBoundingClientRect().left;
    const move = ev => {
      const dx = ev.clientX - startX;
      const [min, max] = LIMITS[which];
      const w = Math.min(max, Math.max(min, onLeft ? startW + dx : startW - dx));
      if (which === 'side') L.sideW = w; else L.chatW = w;
      panel.style.width = w + 'px';
      window.dispatchEvent(new Event('resize'));
    };
    const up = () => { sp.removeEventListener('pointermove', move); sp.classList.remove('active'); document.body.classList.remove('resizing'); save(); };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up, { once: true });
    sp.addEventListener('pointercancel', up, { once: true });
  });
  sp.addEventListener('dblclick', () => { if (which === 'side') L.sideW = DEFAULTS.sideW; else L.chatW = DEFAULTS.chatW; apply(); });
});

// Ctrl+B: hide / show the panel · Ctrl+Shift+B: the AI chat
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
  e.preventDefault();
  if (e.shiftKey) toggleView('chat');
  else if (L.open) { L.open = false; L.chatMax = false; apply(); } else showView(L.view);
});
window.addEventListener('oc:open-chat', openChat);
window.addEventListener('oc:layout', () => apply());
// drag the floating chat by its head, resize it from the corner grip
const head = chat.querySelector('.panel-head');
const drag = (el, onMove) => el.addEventListener('pointerdown', e => {
  if (!floating() || e.button !== 0 || L.edge || e.target.closest('button, a, input, select')) return;
  e.preventDefault(); el.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); chat.classList.add('moving');
  const sx = e.clientX, sy = e.clientY, s = { ...L };
  const move = ev => { onMove(ev.clientX - sx, ev.clientY - sy, s); clampFloat(el === head); };
  const up = () => {
    el.removeEventListener('pointermove', move); document.body.classList.remove('resizing'); chat.classList.remove('moving');
    if (el === head) {
      const r = workspace.getBoundingClientRect();
      if (L.fx < r.left - L.fw * .25) L.edge = 'left'; else if (L.fx + L.fw > r.right + L.fw * .25) L.edge = 'right';
      apply();
    }
    save();
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up, { once: true }); el.addEventListener('pointercancel', up, { once: true });
});
drag(head, (dx, dy, s) => { L.fx = s.fx + dx; L.fy = s.fy + dy; });
drag(grip, (dx, dy, s) => { L.fw = s.fw + dx; L.fh = s.fh + dy; });
head.addEventListener('dblclick', e => { if (!floating() || e.target.closest('button')) return; L.fx = null; L.fw = DEFAULTS.fw; L.fh = DEFAULTS.fh; clampFloat(); save(); });
let rz = 0; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (floating() !== document.body.classList.contains('chat-float')) apply(); else if (floating()) clampFloat(); }); });
window.addEventListener('oc:show-view', e => showView(e.detail));

apply();
