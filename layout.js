// VS Code-style panel layout: drag a splitter to resize, hide panels,
// swap them to the other side, maximize the chat. Everything is remembered.
const $ = id => document.getElementById(id);
const KEY = 'oc-layout';
const DEFAULTS = { sideW: 280, chatW: 380, sideOpen: true, chatOpen: true, swapped: false, chatMax: false, view: 'library' };
let L = { ...DEFAULTS };
try { L = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} };

const main = $('main'), side = $('sidePanel'), chat = $('chatPanel');
const LIMITS = { side: [200, 560], chat: [280, 900] };
const TITLES = { library: 'components', layers: 'layers' };

function apply(){
  side.style.width = L.sideW + 'px';
  chat.style.width = L.chatW + 'px';
  main.classList.toggle('swapped', L.swapped);
  main.classList.toggle('side-closed', !L.sideOpen);
  main.classList.toggle('chat-closed', !L.chatOpen);
  main.classList.toggle('chat-max', L.chatMax && L.chatOpen);
  document.querySelectorAll('[data-view-body]').forEach(v => v.classList.toggle('hidden', v.dataset.viewBody !== L.view));
  $('sideTitle').textContent = TITLES[L.view] || '';
  document.querySelectorAll('.activitybar [data-view]').forEach(b => b.classList.toggle('active', L.sideOpen && b.dataset.view === L.view));
  document.querySelector('.activitybar [data-toggle="chat"]').classList.toggle('active', L.chatOpen);
  document.querySelector('[data-panel-action="max"]').textContent = L.chatMax ? '⤡' : '⤢';
  document.querySelector('[data-panel-action="max"]').title = L.chatMax ? 'Restore size' : 'Maximize';
  save();
  // The canvas recalculates its size on the resize event
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

export function showView(view){ L.view = view; L.sideOpen = true; apply(); }
export function openChat(){ L.chatOpen = true; apply(); }
function toggleSide(){ L.sideOpen = !L.sideOpen; apply(); }
function toggleChat(){ L.chatOpen = !L.chatOpen; if (!L.chatOpen) L.chatMax = false; apply(); }

document.querySelectorAll('.activitybar [data-view]').forEach(b => b.onclick = () => {
  if (L.sideOpen && L.view === b.dataset.view) L.sideOpen = false; else { L.view = b.dataset.view; L.sideOpen = true; }
  apply();
});
document.querySelector('.activitybar [data-toggle="chat"]').onclick = toggleChat;

document.querySelectorAll('[data-panel-action]').forEach(b => b.onclick = () => {
  const p = b.dataset.panel, a = b.dataset.panelAction;
  if (a === 'close') { if (p === 'side') L.sideOpen = false; else { L.chatOpen = false; L.chatMax = false; } }
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

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
  e.preventDefault();
  if (e.shiftKey) toggleChat(); else toggleSide();
});
window.addEventListener('oc:open-chat', openChat);
window.addEventListener('oc:show-view', e => showView(e.detail));

apply();
