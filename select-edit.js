// Select & edit (like Lovable's Visual Edits): the "select" button or V turns the canvas into a picker.
//  • hover: any part of any block gets an outline and a tag label,
//  • click: the part is pinned and a small prompt opens right next to it — "what to change?",
//    the AI rewrites only that part (studio.editPart); "styles" opens the full inspector (inline-edit.js),
//  • ↑ selects the parent, Esc unpins, Esc again (or V) leaves the mode.
// Apps (sandboxed without same-origin) can't be looked into: they are picked as a whole and edited via the chat.
import { studio } from './studio.js';
import { editInline } from './inline-edit.js';
import './select-edit.css';

const $ = id => document.getElementById(id);
const board = $('board'), canvas = $('canvas'), btn = $('selectToggle');
let on = false, hover = null, pin = null, raf = 0; // hover/pin = { id, frame, doc, el }

const hoverBox = Object.assign(document.createElement('div'), { className: 'sel-box hover hidden' });
const pinBox = Object.assign(document.createElement('div'), { className: 'sel-box pin hidden' });
const label = Object.assign(document.createElement('div'), { className: 'sel-label hidden' });
const pop = document.createElement('form');
pop.className = 'sel-pop hidden';
pop.innerHTML = `
  <div class="sel-pop-head"><span class="sel-pop-tag" id="selTag"></span>
    <button type="button" class="sel-pop-icon" data-s="parent" title="Select the parent">↑</button>
    <button type="button" class="sel-pop-icon" data-s="styles" title="Edit text and styles by hand">styles</button>
    <button type="button" class="sel-pop-icon" data-s="close" title="Unpin (Esc)">✕</button></div>
  <div class="sel-pop-row"><input id="selAsk" maxlength="400" spellcheck="false" autocomplete="off" placeholder="What to change here?" aria-label="What to change in the selected part">
    <button type="submit" class="sel-pop-send" title="Change only this part (Enter)">↵</button></div>
  <p class="sel-pop-note hidden" id="selNote">Apps are edited through the chat — describe the change there.</p>`;
document.body.append(hoverBox, pinBox, label, pop);

const tagOf = el => !el ? 'block' : el.tagName.toLowerCase() + (el.classList?.[0] && !el.classList[0].startsWith('ocx-') ? '.' + el.classList[0] : '');

// what is under the pointer: the node, its iframe and (when we can look inside) the element
function hit(x, y){
  const node = document.elementFromPoint(x, y)?.closest?.('.node');
  if (!node || !board.contains(node)) return null;
  const id = node.dataset.id, frame = node.querySelector('iframe');
  let doc = null; try { doc = frame?.contentDocument; } catch {}
  const root = doc?.getElementById('__root');
  if (!root) return { id, frame, doc: null, el: null, node };
  const r = frame.getBoundingClientRect(), k = r.width / frame.offsetWidth || 1;
  let el = doc.elementFromPoint((x - r.left) / k, (y - r.top) / k);
  if (el && el.nodeType !== 1) el = el.parentElement;
  if (!el || !root.contains(el) || el === root) el = root.firstElementChild || null;
  return { id, frame, doc, el, node };
}
// screen rectangle of a picked part (the board is scaled and the iframe may scroll)
function rectOf(t){
  if (!t?.frame?.isConnected) return null;
  const fr = t.frame.getBoundingClientRect();
  if (!t.el || !t.el.isConnected) return t.node?.isConnected ? t.node.getBoundingClientRect() : fr;
  const k = fr.width / t.frame.offsetWidth || 1, r = t.el.getBoundingClientRect();
  return { left: fr.left + r.left * k, top: fr.top + r.top * k, width: r.width * k, height: r.height * k };
}
const put = (box, r) => {
  if (!r) return box.classList.add('hidden');
  box.classList.remove('hidden');
  Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
};
function paint(){
  const hr = hover && !(pin && hover.el === pin.el && hover.id === pin.id) ? rectOf(hover) : null;
  put(hoverBox, hr);
  if (hr) {
    label.textContent = tagOf(hover.el); label.classList.remove('hidden');
    label.style.left = hr.left + 'px'; label.style.top = Math.max(4, hr.top - 22) + 'px';
  } else label.classList.add('hidden');
  const pr = pin ? rectOf(pin) : null;
  put(pinBox, pr);
  if (pr) placePop(pr);
  raf = on ? requestAnimationFrame(paint) : 0;
}
function placePop(r){
  const w = pop.offsetWidth || 340, h = pop.offsetHeight || 84, wrap = canvas.getBoundingClientRect();
  let left = Math.min(Math.max(wrap.left + 8, r.left), wrap.right - w - 8);
  let top = r.top + r.height + 8;
  if (top + h > wrap.bottom - 8) top = r.top - h - 8;          // no room below → above
  if (top < wrap.top + 8) top = Math.min(wrap.bottom - h - 8, Math.max(wrap.top + 8, r.top + 8)); // tall part → inside
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}

function setPin(t){
  pin = t;
  if (!t) { pop.classList.add('hidden'); pinBox.classList.add('hidden'); return; }
  const isApp = !t.doc;
  $('selTag').textContent = isApp ? 'app' : tagOf(t.el);
  $('selNote').classList.toggle('hidden', !isApp);
  pop.querySelector('.sel-pop-row').classList.toggle('hidden', isApp);
  pop.querySelector('[data-s="parent"]').disabled = isApp || !t.el?.parentElement || t.el.parentElement.id === '__root';
  pop.querySelector('[data-s="styles"]').disabled = isApp;
  pop.classList.remove('hidden');
  if (!isApp) requestAnimationFrame(() => $('selAsk').focus());
}

export function setSelecting(v){
  if (v === on) return;
  on = v;
  canvas.classList.toggle('selecting', on);
  btn?.setAttribute('aria-pressed', String(on));
  if (on) {
    window.dispatchEvent(new CustomEvent('oc:select-mode', { detail: true }));
    studio.status('select: click any part, then say what to change · Esc to leave', 'busy');
    raf ||= requestAnimationFrame(paint);
  } else {
    hover = null; setPin(null);
    hoverBox.classList.add('hidden'); label.classList.add('hidden');
    cancelAnimationFrame(raf); raf = 0;
    studio.status('ready');
  }
}

btn?.addEventListener('click', () => setSelecting(!on));
board.addEventListener('pointermove', e => { if (on) hover = hit(e.clientX, e.clientY); });
board.addEventListener('pointerleave', () => { hover = null; });
// in select mode a click picks — it must not start a drag, a marquee or the inline editor
addEventListener('pointerdown', e => {
  if (!on || !canvas.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  const t = hit(e.clientX, e.clientY);
  setPin(t);
}, true);
addEventListener('dblclick', e => { if (on && board.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

pop.addEventListener('click', e => {
  const a = e.target.closest('[data-s]')?.dataset.s; if (!a || !pin) return;
  if (a === 'close') return setPin(null);
  if (a === 'parent' && pin.el?.parentElement && pin.el.parentElement.id !== '__root') return setPin({ ...pin, el: pin.el.parentElement });
  if (a === 'styles') {
    const r = rectOf(pin), id = pin.id;
    setSelecting(false);
    editInline(id, r ? { x: r.left + Math.min(r.width / 2, 12), y: r.top + Math.min(r.height / 2, 12) } : null);
  }
});
pop.addEventListener('submit', e => {
  e.preventDefault();
  const ask = $('selAsk').value.trim(); if (!ask || !pin?.doc || !pin.el?.isConnected) return;
  const root = pin.doc.getElementById('__root');
  pin.el.setAttribute('data-oc-target', '');
  const html = root.innerHTML;
  pin.el.removeAttribute('data-oc-target');
  $('selAsk').value = '';
  const id = pin.id;
  setPin(null);
  studio.editPart(id, html, ask);
});
pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPin(null); } });

addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal:not(.hidden)')) return;
  if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setSelecting(!on); }
  else if (e.key === 'Escape' && on) { e.preventDefault(); if (pin) setPin(null); else setSelecting(false); }
});
// play mode and select mode exclude each other
window.addEventListener('oc:play', e => { if (e.detail) setSelecting(false); });
