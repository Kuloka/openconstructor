// The mode switch at the top: Build (the canvas editor) · Code (mini-apps, code.js) · Chat (plain chat, chat.js).
// The same switch sits in the editor's title bar, in the Code workspace and in the chat, so it's always one click.
import { openCode, closeCode, codeOpen } from './code.js';
import { openChat, closeChat, chatOpen } from './chat.js';
import { t } from './i18n.js';
import { pill } from './pill.js';

const svg = d => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MODES = [
  ['build', 'Build', '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/>', 'Build pages on the canvas'],
  ['code', 'Code', '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>', 'openconstructor code: build working mini-apps with a live preview'],
  ['chat', 'Chat', '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>', 'Plain chat with any AI model'],
];
const now = () => chatOpen() ? 'chat' : codeOpen() ? 'code' : 'build';

export function go(mode, { instant = false } = {}){
  if (mode === now()) return;
  const swap = () => {
    if (mode === 'chat') { closeCode(); openChat(); }
    else if (mode === 'code') { closeChat(); openCode(); }
    else { closeChat(); closeCode(); }
    sync();
  };
  // a short cross-fade between the modes where the browser can do it (chat.css ::view-transition)
  if (!instant && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap);
  else swap();
}
function sync(){
  const m = now();
  document.querySelectorAll('.oc-modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
}
function make(extra = ''){
  const el = document.createElement('div');
  el.className = 'oc-modes ' + extra; el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('Mode'));
  // .tb-code: the e2e tests open the Code workspace through this button
  el.innerHTML = MODES.map(([id, label, icon, tip]) => `<button type="button" data-mode="${id}" title="${t(tip)}"${id === 'code' ? ' class="tb-code"' : ''}>${svg(icon)}<span>${t(label)}</span></button>`).join('');
  el.onclick = e => { const b = e.target.closest('[data-mode]'); if (b) go(b.dataset.mode); };
  return el;
}

// between the left and right groups (both flex: 1), so it stays centred in the free space and never overlaps buttons
document.querySelector('.titlebar .tb-left')?.after(make('in-editor'));

// the editor's title bar keeps only what matters: the project name next to the logo, the old top menu
// (templates, custom code, gallery, history, projects…) folds into "More"
const tb = document.querySelector('.titlebar'), tbMenu = tb?.querySelector('.tb-menu');
if (tb && tbMenu) {
  const left = tb.querySelector('.tb-left'), name = tb.querySelector('.tb-center');
  if (name) left.querySelector('.tb-logo').after(name);
  const more = document.createElement('div'); more.className = 'tb-more';
  more.innerHTML = `<button type="button" class="tb-more-btn" aria-haspopup="menu" aria-expanded="false">${t('More')}<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
  left.append(more); more.append(tbMenu);
  const toggle = on => { more.classList.toggle('open', on); more.firstElementChild.setAttribute('aria-expanded', on); };
  more.firstElementChild.onclick = () => toggle(!more.classList.contains('open'));
  tbMenu.addEventListener('click', e => { if (e.target.closest('button, a')) toggle(false); });
  document.addEventListener('pointerdown', e => { if (!more.contains(e.target)) toggle(false); });
}
document.querySelector('#codeWorkspace .cw-brand')?.after(make('in-code'));
document.querySelector('#chatWorkspace [data-modes]')?.append(make('in-chat'));
addEventListener('oc:mode', sync);
// the logo in Chat or Code goes home: the start screen opens on top at once, the mode underneath closes once it's covered
// (closing first would flash the editor)
addEventListener('oc:welcome', () => setTimeout(() => { if (!document.querySelector('.wl:not(.wl-out)')) return; closeChat(); closeCode(); sync(); }, 450));
sync();
document.querySelectorAll('.oc-modes').forEach(el => pill(el));

if (location.hash === '#chat') { try { localStorage.setItem('oc-welcomed', '1'); } catch {} setTimeout(() => go('chat'), 300); }
