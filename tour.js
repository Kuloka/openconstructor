// Guided tour: highlights each area of the editor and explains what it's for.
// Starts once after the welcome screen closes; replay with the "?" button or Shift+?.

const STEPS = [
  { target: '#sidePanel', before: () => window.dispatchEvent(new CustomEvent('oc:show-view', { detail: 'library' })), place: 'right',
    title: '1 · Components', text: 'Your building blocks. Open a section — AI & Chat, Forms, Dashboard, Landing and more — and click any card to drop it on the page. Search finds anything across all sections.' },
  { target: '.canvas-wrap', place: 'center',
    title: '2 · The page', text: 'Everything you add lives here. Drag an element to move it. Drag empty space (or hold Space) to pan, Ctrl + scroll to zoom. Right-click an element for its code, AI edits, duplicate and delete.' },
  { target: '.canvas-toolbar', place: 'bottom',
    title: '3 · Page settings', text: 'Switch between desktop, laptop, tablet and phone sizes, and pick the page background.' },
  { target: '#chatPanel', before: () => window.dispatchEvent(new CustomEvent('oc:open-chat')), place: 'left',
    title: '4 · AI assistant', text: 'Describe what you want — “a pricing section with three plans” — and the AI builds it on the page. Select an element first to change only that one.' },
  { target: '#settingsButton', place: 'right',
    title: '5 · Connect an AI', text: 'The assistant needs a key from an AI provider. Google Gemini and Groq take about a minute to set up. Keys stay in your browser.' },
  { target: '#export', place: 'bottom',
    title: '6 · Export', text: 'Done? Download the page as a single HTML file you can host anywhere. Undo is Ctrl+Z.' },
];

let i = 0, root = null, hole = null, card = null;

function build(){
  root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"><div class="tour-title"></div><p class="tour-text"></p><div class="tour-foot"><span class="tour-dots"></span><span class="sb-spacer"></span><button class="btn" data-tour="skip">skip</button><button class="btn" data-tour="back">back</button><button class="btn primary" data-tour="next">next</button></div></div>`;
  document.body.append(root);
  hole = root.querySelector('.tour-hole'); card = root.querySelector('.tour-card');
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-tour]')?.dataset.tour;
    if (a === 'next') go(i + 1); else if (a === 'back') go(i - 1); else if (a === 'skip') end();
  });
}

function position(){
  const s = STEPS[i], el = document.querySelector(s.target);
  if (!el || !root) return;
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16, vw = innerWidth, vh = innerHeight;
  let x, y;
  if (s.place === 'right') { x = r.right + gap; y = r.top + 40; }
  else if (s.place === 'left') { x = r.left - cw - gap; y = r.top + 40; }
  else if (s.place === 'bottom') { x = r.right - cw; y = r.bottom + gap; }
  else { x = r.left + (r.width - cw) / 2; y = r.top + (r.height - ch) / 2; }
  card.style.left = Math.max(12, Math.min(vw - cw - 12, x)) + 'px';
  card.style.top = Math.max(12, Math.min(vh - ch - 12, y)) + 'px';
}

function go(n){
  if (n >= STEPS.length) return end();
  i = Math.max(0, n);
  const s = STEPS[i];
  s.before?.();
  card.querySelector('.tour-title').textContent = s.title;
  card.querySelector('.tour-text').textContent = s.text;
  card.querySelector('.tour-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  card.querySelector('[data-tour="back"]').disabled = i === 0;
  card.querySelector('[data-tour="next"]').textContent = i === STEPS.length - 1 ? 'got it' : 'next';
  // wait a frame so panels opened by `before` have their final size
  requestAnimationFrame(() => requestAnimationFrame(position));
  card.querySelector('[data-tour="next"]').focus();
}

function onKey(e){
  if (e.key === 'Escape') end();
  else if (e.key === 'ArrowRight') go(i + 1);
  else if (e.key === 'ArrowLeft') go(i - 1);
}

export function startTour(){
  if (root) return;
  build(); addEventListener('resize', position); addEventListener('keydown', onKey, true);
  go(0);
}

function end(){
  try { localStorage.setItem('oc-toured', '1'); } catch {}
  removeEventListener('resize', position); removeEventListener('keydown', onKey, true);
  root?.remove(); root = null;
}

window.addEventListener('oc:welcome-closed', () => {
  let seen = false; try { seen = !!localStorage.getItem('oc-toured'); } catch {}
  if (!seen) setTimeout(startTour, 350);
});
window.addEventListener('oc:tour', startTour);
document.addEventListener('keydown', e => {
  if (e.key === '?' && !e.target.closest('input, textarea, [contenteditable]')) startTour();
});
document.getElementById('helpButton')?.addEventListener('click', startTour);
