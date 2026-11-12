// VS Code-style layout: a rail of icons and ONE panel next to it. The panel shows the AI chat,
// the components or the layers — one at a time — so the canvas keeps the rest of the screen.
// Drag the splitter to resize (each view keeps its own width), hide the panel, move it to the
// other side, maximize the chat. Everything is remembered.
const $ = id => document.getElementById(id);
const KEY = 'oc-layout2';
const DEFAULTS = { sideW: 280, chatW: 380, open: true, swapped: false, chatMax: false, view: 'chat' };
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

function apply(){
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

export function showView(view){ if (!VIEWS.includes(view)) return; L.view = view; L.open = true; if (view !== 'chat') L.chatMax = false; apply(); }
export function openChat(){ showView('chat'); }
// a rail button or shortcut: open that view, or hide the panel when it is already showing it
function toggleView(view){ if (L.open && L.view === view) { L.open = false; L.chatMax = false; apply(); } else showView(view); }

document.querySelectorAll('.activitybar [data-view]').forEach(b => b.onclick = () => toggleView(b.dataset.view));

document.querySelectorAll('[data-panel-action]').forEach(b => b.onclick = () => {
  const a = b.dataset.panelAction;
  if (a === 'close') { L.open = false; L.chatMax = false; }
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
window.addEventListener('oc:show-view', e => showView(e.detail));

apply();
