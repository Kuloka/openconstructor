// Phones (≤700px): one screen at a time with a tab bar at the bottom —
//   AI (the chat, default) · Page (the page as visitors will see it on a phone) · Canvas (the editor canvas).
// When the AI finishes building, the Page tab opens so the result is seen right away.
import { studio } from './studio.js';
import { t } from './i18n.js';

const mq = matchMedia('(max-width: 700px)');
const app = document.getElementById('app'), main = document.getElementById('main');

const ICONS = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  preview: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  canvas: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M17.5 14v7M14 17.5h7"/>',
};
const LABELS = { chat: 'AI', preview: 'page', canvas: 'canvas' };

const bar = document.createElement('nav');
bar.className = 'm-tabs'; bar.setAttribute('aria-label', 'Screens');
bar.innerHTML = Object.keys(ICONS).map(k => `<button type="button" data-m="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICONS[k]}</svg><span>${t(LABELS[k])}</span></button>`).join('');
app.append(bar);

const pv = document.createElement('section');
pv.className = 'm-preview';
pv.innerHTML = `<div class="m-pv-head"><span>${t('how it looks on a phone')}</span><button class="btn primary" type="button" data-m-publish>${t('publish')}</button></div>
  <iframe title="Page preview" sandbox="allow-same-origin"></iframe>
  <div class="m-empty hidden"><p>${t('Nothing here yet.')}</p><button class="btn primary" type="button" data-m-go="chat">${t('describe a page to the AI')}</button></div>`;
main.append(pv);
const frame = pv.querySelector('iframe'), empty = pv.querySelector('.m-empty');

function refresh(){
  let html = '';
  try { if (studio.items().length) html = studio.html(); } catch {}
  empty.classList.toggle('hidden', !!html);
  frame.classList.toggle('hidden', !html);
  if (html && frame.srcdoc !== html) frame.srcdoc = html;
}

function show(m){
  document.body.dataset.m = m;
  bar.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  if (m === 'preview') refresh();
  if (m === 'canvas') requestAnimationFrame(() => dispatchEvent(new Event('resize'))); // re-fit the canvas zoom
}

function apply(){
  document.body.classList.toggle('mobile', mq.matches);
  if (mq.matches) show(document.body.dataset.m || 'chat');
}

bar.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) show(b.dataset.m); });
pv.addEventListener('click', e => {
  if (e.target.closest('[data-m-publish]')) document.getElementById('publish')?.click();
  const go = e.target.closest('[data-m-go]'); if (go) show(go.dataset.mGo);
});
addEventListener('oc:generated', () => { if (mq.matches) show('preview'); });
// a template or project opened from the welcome screen: show it
addEventListener('oc:welcome-closed', () => { if (mq.matches && studio.items().length) show('preview'); });
mq.addEventListener('change', apply);
apply();
