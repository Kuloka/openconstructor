// Edit without code: double-click an element on the canvas →
//  • its text becomes editable right on the page,
//  • clicking any part of it picks that part and opens the style inspector (colors, size, weight, radius, spacing),
//  • Esc / "done" / clicking outside writes the result back into the element's code (one undo step).
import { studio } from './studio.js';
import './inline-edit.css';

const $ = id => document.getElementById(id);
const board = $('board'), canvas = $('canvas');
let session = null; // { id, frame, doc, root, picked, dirty }

const toHex = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return '#000000'; const [r, g, b] = m[1].split(/[ ,/]+/).map(Number); return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''); };
const alphaOf = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : []; return parts.length > 3 ? +parts[3] : (String(c) === 'transparent' ? 0 : 1); };

/* ── inspector panel ───────────────────────────────────────── */
const panel = document.createElement('div');
panel.className = 'ins-panel hidden';
panel.innerHTML = `
  <div class="ins-head"><span class="ins-title">edit</span><span class="ins-tag" id="insTag"></span><button class="btn icon" data-ins="done" title="Done (Esc)">✓</button></div>
  <p class="ins-hint">Type to change text · click any part to style it</p>
  <div class="ins-grid">
    <label>text<input type="color" data-p="color"></label>
    <label>fill<input type="color" data-p="backgroundColor"></label>
    <label>border<input type="color" data-p="borderColor"></label>
  </div>
  <label class="ins-row">size <b data-v="fontSize"></b><input type="range" min="8" max="96" data-p="fontSize" data-unit="px"></label>
  <label class="ins-row">weight <b data-v="fontWeight"></b><input type="range" min="100" max="900" step="100" data-p="fontWeight"></label>
  <label class="ins-row">radius <b data-v="borderRadius"></b><input type="range" min="0" max="48" data-p="borderRadius" data-unit="px"></label>
  <label class="ins-row">padding <b data-v="padding"></b><input type="range" min="0" max="64" data-p="padding" data-unit="px"></label>
  <label class="ins-row">opacity <b data-v="opacity"></b><input type="range" min="0" max="1" step="0.05" data-p="opacity"></label>
  <div class="ins-actions">
    <button class="btn" data-ins="parent" title="Select the parent element">↑ parent</button>
    <button class="btn" data-ins="clear" title="Remove the styles you set on this part">reset</button>
    <button class="btn danger" data-ins="remove" title="Delete this part">delete part</button>
  </div>`;
document.body.append(panel);

function fill(){
  const el = session?.picked; if (!el) return;
  const cs = session.doc.defaultView.getComputedStyle(el);
  $('insTag').textContent = '<' + el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '') + '>';
  panel.querySelectorAll('[data-p]').forEach(inp => {
    const p = inp.dataset.p, v = cs[p];
    if (inp.type === 'color') { inp.value = toHex(v); inp.classList.toggle('none', alphaOf(v) === 0); }
    else inp.value = parseFloat(p === 'padding' ? cs.paddingTop : p === 'borderRadius' ? cs.borderTopLeftRadius : v) || 0;
    const out = panel.querySelector(`[data-v="${p}"]`); if (out) out.textContent = inp.value + (inp.dataset.unit || '');
  });
}
panel.addEventListener('input', e => {
  const inp = e.target, p = inp.dataset.p, el = session?.picked; if (!p || !el) return;
  const v = inp.value + (inp.dataset.unit || '');
  el.style[p] = v;
  if (p === 'borderColor' && !parseFloat(session.doc.defaultView.getComputedStyle(el).borderTopWidth)) { el.style.borderWidth = '1px'; el.style.borderStyle = 'solid'; }
  const out = panel.querySelector(`[data-v="${p}"]`); if (out) out.textContent = v;
  session.dirty = true; outline();
});
panel.addEventListener('click', e => {
  const a = e.target.closest('[data-ins]')?.dataset.ins; if (!a || !session) return;
  if (a === 'done') return finish();
  const el = session.picked; if (!el) return;
  if (a === 'parent' && el.parentElement && el.parentElement !== session.root) pick(el.parentElement);
  if (a === 'clear') { el.removeAttribute('style'); session.dirty = true; fill(); outline(); }
  if (a === 'remove' && el !== session.root) { const up = el.parentElement; el.remove(); session.dirty = true; pick(up === session.root ? null : up); }
});

/* ── picking inside the element ────────────────────────────── */
function outline(){
  const box = session?.doc.getElementById('__oc_pick'); if (!box) return;
  const el = session.picked;
  if (!el) { box.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
}
function pick(el){ session.picked = el; outline(); if (el) fill(); }

function start(id, at){
  if (session) finish();
  const frame = studio.frame(id), doc = frame?.contentDocument, root = doc?.getElementById('__root');
  if (!root) return;
  const node = frame.closest('.node');
  node.classList.add('editing'); canvas.classList.add('inline-editing');
  // helper outline lives outside #__root so it never gets saved
  const box = doc.createElement('div'); box.id = '__oc_pick';
  box.style.cssText = 'position:fixed;display:none;pointer-events:none;outline:2px solid #e4572e;outline-offset:1px;border-radius:2px;z-index:2147483647;background:#e4572e10';
  doc.body.append(box);
  root.contentEditable = 'true'; root.spellcheck = false; root.style.outline = 'none';
  session = { id, frame, doc, root, picked: null, dirty: false, before: root.innerHTML };
  doc.addEventListener('pointerdown', e => { const t = e.target.closest ? e.target : e.target.parentElement; if (t && root.contains(t) && t !== root) pick(t); else if (t === root) pick(null); });
  doc.addEventListener('input', () => { session && (session.dirty = true); outline(); });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(); } });
  doc.addEventListener('scroll', outline, true);
  panel.classList.remove('hidden'); place();
  studio.status('editing: type to change text, click a part to style it · Esc to finish', 'busy');
  root.focus();
  // pick exactly what was double-clicked (the board is scaled, so convert screen → iframe coordinates)
  let hit = null;
  if (at) { const r = frame.getBoundingClientRect(), k = r.width / frame.offsetWidth || 1; hit = doc.elementFromPoint((at.x - r.left) / k, (at.y - r.top) / k); }
  pick(hit && root.contains(hit) && hit !== root ? hit : root.querySelector('button, a, h1, h2, h3, p, span, input, label') || null);
}
function place(){
  const wrap = canvas.getBoundingClientRect();
  panel.style.left = Math.max(8, wrap.right - panel.offsetWidth - 16) + 'px';
  panel.style.top = wrap.top + 56 + 'px';
}
function finish(){
  if (!session) return;
  const { id, doc, root, frame, dirty, before } = session;
  session = null;
  panel.classList.add('hidden'); canvas.classList.remove('inline-editing'); frame.closest('.node')?.classList.remove('editing');
  doc.getElementById('__oc_pick')?.remove();
  root.removeAttribute('contenteditable'); root.removeAttribute('spellcheck'); root.style.outline = '';
  if (!root.getAttribute('style')) root.removeAttribute('style');
  // give keyboard focus back to the editor so Ctrl+Z / shortcuts work right away
  try { doc.activeElement?.blur(); } catch {}
  frame.blur(); window.focus();
  const html = root.innerHTML;
  if (dirty && html !== before) {
    studio.update(list => list.map(x => x.id === id ? { ...x, code: html } : x));
    studio.status('changes saved · Ctrl+Z to undo', 'ok');
  } else studio.status('ready');
}

board.addEventListener('dblclick', e => {
  const node = e.target.closest('.node'); if (!node || node.classList.contains('editing')) return;
  e.preventDefault(); start(node.dataset.id, { x: e.clientX, y: e.clientY });
});
// clicking anywhere outside the element being edited finishes editing
addEventListener('pointerdown', e => {
  if (!session || panel.contains(e.target)) return;
  if (e.target.closest?.('.node.editing')) return;
  finish();
}, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && session) finish(); });
addEventListener('resize', () => session && place());
window.addEventListener('oc:edit-inline', e => start(e.detail));

export const editInline = id => start(id);
