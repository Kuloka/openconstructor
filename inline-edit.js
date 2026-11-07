// Edit without code: double-click an element on the canvas →
//  • its text becomes editable right on the page,
//  • clicking any part of it picks that part and opens the style inspector (colors, size, weight, radius, spacing),
//  • Esc / "done" / clicking outside writes the result back into the element's code (one undo step).
import { studio } from './studio.js';
import { pickIcon } from './icons.js';
import { aiImage, askPicture } from './ai-image.js';
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
  <form class="ins-ai" id="insAi"><input id="insAsk" placeholder="✦ tell the AI what to change in this part…" maxlength="400" spellcheck="false" aria-label="AI request for the picked part"><button class="btn primary" type="submit" title="Change only this part with AI">✦</button></form>
  <div class="ins-grid">
    <label>text<input type="color" data-p="color"></label>
    <label>fill<input type="color" data-p="backgroundColor"></label>
    <label>border<input type="color" data-p="borderColor"></label>
  </div>
  <label class="ins-link">link <span>where this button or text leads</span><input type="text" id="insLink" placeholder="https://… or #pricing" spellcheck="false"></label>
  <label class="ins-row">size <b data-v="fontSize"></b><input type="range" min="8" max="96" data-p="fontSize" data-unit="px"></label>
  <label class="ins-row">weight <b data-v="fontWeight"></b><input type="range" min="100" max="900" step="100" data-p="fontWeight"></label>
  <label class="ins-row">radius <b data-v="borderRadius"></b><input type="range" min="0" max="48" data-p="borderRadius" data-unit="px"></label>
  <label class="ins-row">padding <b data-v="padding"></b><input type="range" min="0" max="64" data-p="padding" data-unit="px"></label>
  <label class="ins-row">opacity <b data-v="opacity"></b><input type="range" min="0" max="1" step="0.05" data-p="opacity"></label>
  <div class="ins-sec">image</div>
  <div class="ins-media">
    <button class="btn" data-ins="image" title="Put your own picture here: replaces an icon/image, or fills a block">🖼 use my image…</button>
    <button class="btn" data-ins="aiimage" title="Let the free AI draw a picture for this place">✦ AI image…</button>
    <button class="btn" data-ins="noimage" title="Remove the picture you added">remove</button>
    <button class="btn" data-ins="icon" title="Replace the icon here with another one, or put an icon before the text">★ icon…</button>
  </div>
  <div class="ins-sec">motion <span id="insMotionCount"></span></div>
  <div class="ins-motion" id="insMotion"></div>
  <div class="ins-actions">
    <button class="btn" data-ins="parent" title="Select the parent element">↑ parent</button>
    <button class="btn" data-ins="clear" title="Remove the styles you set on this part">reset</button>
    <button class="btn danger" data-ins="remove" title="Delete this part">delete part</button>
  </div>`;
document.body.append(panel);

// Links: an <a> gets its href; a <button> is turned into an <a> with the same classes and content
// (exported and published pages have no scripts, so a link is the only way a button can "work").
const linkOf = el => el?.closest('a');
$('insLink').addEventListener('change', e => {
  const el = session?.picked; if (!el) return;
  let url = e.target.value.trim();
  if (url && !/^(https?:|mailto:|tel:|#|\/)/i.test(url)) url = 'https://' + url;
  if (/^\s*javascript:/i.test(url)) url = '';
  let a = linkOf(el);
  if (!a && url) {
    const btn = el.closest('button') || el;
    a = session.doc.createElement('a');
    for (const { name, value } of [...btn.attributes]) if (name !== 'type' && name !== 'disabled') a.setAttribute(name, value);
    a.innerHTML = btn.innerHTML;
    if (btn.tagName === 'BUTTON') a.style.cssText += ';text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center';
    btn.replaceWith(a); session.picked = a;
  }
  if (a) { if (url) { a.setAttribute('href', url); if (/^https?:/i.test(url)) a.setAttribute('target', '_blank'), a.setAttribute('rel', 'noopener'); else a.removeAttribute('target'); } else a.removeAttribute('href'); }
  e.target.value = url; session.dirty = true; outline(); fill();
});

/* ── image: your own picture in place of an icon / avatar / block ── */
const imgInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true, id: 'insImageInput' });
document.body.append(imgInput);
function toDataURL(file, max = 640){
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/webp', .86)); // keeps transparency, small enough to live inside the page code
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('not an image')); };
    img.src = url;
  });
}
imgInput.onchange = () => { const file = imgInput.files[0]; imgInput.value = ''; applyImage(file); };
// A picture (file or blob) into the picked part: replaces an image/icon, or fills the block
async function applyImage(file){
  let el = session?.picked; if (!file || !el) return;
  if (file.size > 20e6) { studio.status('image is too large (max 20 MB)', 'warn'); return; }
  const data = await toDataURL(file).catch(() => null); if (!data || !session) return;
  const doc = session.doc;
  // a block holding a single icon (e.g. a spinning logo): replace that icon, so its animation survives
  const svg = el.closest('svg') || (el.querySelectorAll('svg').length === 1 && el.querySelectorAll('img').length === 0 ? el.querySelector('svg') : null);
  if (svg) el = svg;
  if (el.tagName === 'IMG') el.src = data;
  else if (el.tagName.toLowerCase() === 'svg') {
    // swap the icon for an <img> of the same size; class/style move over so its animation keeps running
    const r = el.getBoundingClientRect(), img = doc.createElement('img'), cs = doc.defaultView.getComputedStyle(el);
    img.src = data; img.alt = '';
    if (el.getAttribute('class')) img.setAttribute('class', el.getAttribute('class'));
    img.style.cssText = (el.getAttribute('style') || '') + `;width:${Math.round(r.width)}px;height:${Math.round(r.height)}px;object-fit:cover;border-radius:inherit;display:block`;
    // CSS often animates the icon by tag (".logo svg { animation: spin … }") — carry the running animation over explicitly
    if (cs.animationName && cs.animationName !== 'none') {
      for (const p of ['animationName', 'animationDuration', 'animationTimingFunction', 'animationDelay', 'animationIterationCount', 'animationDirection', 'animationFillMode', 'animationPlayState']) img.style[p] = cs[p];
      img.style.transformOrigin = cs.transformOrigin === '0px 0px' ? 'center' : cs.transformOrigin;
    }
    el.replaceWith(img); el = img;
  } else {
    // fill the block; drop a lone icon or 1–3 letter placeholder (avatar initials) that would cover the picture
    el.style.backgroundImage = `url("${data}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
    [...el.children].forEach(c => { if (c.tagName.toLowerCase() === 'svg') c.remove(); });
    if (!el.children.length && el.textContent.trim().length <= 3) el.textContent = '';
  }
  session.dirty = true; pick(el);
  // the browser starts the swapped element's animation on the next frames — refresh the motion list then
  setTimeout(() => session && fill(), 120);
  if (data.length > 250000) studio.status('image added — it is large, publishing may hit the 1 MB page limit', 'warn');
  else studio.status('image added', 'ok');
};

// An icon from the picker: replaces the icon (or picture) in the picked part, keeping its size and
// classes so the design and animations stay; otherwise goes in front of the text, sized to it
function placeIcon(markup){
  const doc = session.doc, el = session.picked;
  const tpl = doc.createElement('template'); tpl.innerHTML = markup.trim();
  const icon = tpl.content.firstElementChild; if (!icon) return;
  const old = el.closest('svg') || (el.tagName === 'IMG' ? el : null) || (el.querySelectorAll('svg').length === 1 && !el.querySelector('img') ? el.querySelector('svg') : null);
  if (old) {
    const r = old.getBoundingClientRect();
    icon.setAttribute('width', Math.round(r.width) || 24); icon.setAttribute('height', Math.round(r.height) || 24);
    for (const at of ['class', 'style']) if (old.getAttribute(at)) icon.setAttribute(at, old.getAttribute(at));
    old.replaceWith(icon);
  } else {
    icon.setAttribute('width', '1.15em'); icon.setAttribute('height', '1.15em');
    icon.setAttribute('style', 'vertical-align:-0.2em;flex-shrink:0' + (el.textContent.trim() ? ';margin-right:.4em' : ''));
    el.prepend(icon);
  }
  session.dirty = true; pick(icon);
  studio.status('icon added', 'ok');
}

/* ── motion: speed, direction, delay, repeats and pause for every animation in/around the picked part ── */
const baseDur = new WeakMap(); // element → original durations (so "speed" stays relative to the design)
const splitList = v => String(v).split(',').map(s => s.trim());
function animTargets(){
  const { doc, root, picked } = session; if (!picked) return [];
  const seen = new Set(), out = [];
  for (const a of doc.getAnimations()) {
    const t = a.effect?.target; if (!t || seen.has(t) || !root.contains(t)) continue;
    if (!(picked.contains(t) || t.contains(picked))) continue;
    seen.add(t); out.push(t);
  }
  return out.slice(0, 6);
}
function renderMotion(){
  const box = $('insMotion'); const targets = session ? animTargets() : [];
  $('insMotionCount').textContent = targets.length ? '' : '· none here';
  box.innerHTML = targets.map((t, ti) => {
    const cs = session.doc.defaultView.getComputedStyle(t);
    const names = splitList(cs.animationName), durs = splitList(cs.animationDuration).map(parseFloat);
    if (!baseDur.has(t)) baseDur.set(t, durs.slice());
    const base = baseDur.get(t), dirs = splitList(cs.animationDirection), its = splitList(cs.animationIterationCount), dels = splitList(cs.animationDelay).map(parseFloat), plays = splitList(cs.animationPlayState);
    return names.map((n, i) => {
      if (n === 'none') return '';
      const speed = Math.round((base[i] || durs[i] || 1) / (durs[i] || 1) * 100) / 100;
      const it = its[i % its.length], d = dirs[i % dirs.length];
      return `<div class="ins-anim" data-t="${ti}" data-i="${i}">
        <div class="ins-anim-head"><b>${n.replace(/[<&]/g, '')}</b><span>${'<' + t.tagName.toLowerCase() + '>'}</span><label class="ins-pause"><input type="checkbox" data-m="pause" ${plays[i % plays.length] === 'paused' ? 'checked' : ''}> pause</label></div>
        <label class="ins-row">speed <b>${speed}×</b><input type="range" min="0.1" max="5" step="0.05" value="${speed}" data-m="speed"></label>
        <div class="ins-anim-grid">
          <select data-m="direction" title="direction — reverse turns a clockwise spin counter-clockwise">${['normal', 'reverse', 'alternate', 'alternate-reverse'].map(o => `<option ${o === d ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <select data-m="iterations" title="how many times it plays">${['infinite', '1', '2', '3', '5'].map(o => `<option ${o === it ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <label title="delay before it starts">delay <input type="number" min="0" max="10" step="0.1" value="${dels[i % dels.length] || 0}" data-m="delay">s</label>
        </div></div>`;
    }).join('');
  }).join('');
  box._targets = targets;
  if (!box.children.length) { $('insMotionCount').textContent = '· none here'; box.innerHTML = '<p class="ins-hint">No animation on this part. Try ↑ parent — the motion is often on the wrapper.</p>'; }
}
function setAnimProp(t, prop, i, value){
  const cs = session.doc.defaultView.getComputedStyle(t);
  const n = splitList(cs.animationName).length;
  const list = splitList(cs[prop]); while (list.length < n) list.push(list[list.length % Math.max(1, list.length)] || list[0]);
  list[i] = value; t.style[prop] = list.slice(0, n).join(', ');
}
$('insMotion').addEventListener('input', e => {
  const row = e.target.closest('.ins-anim'), m = e.target.dataset.m; if (!row || !m || !session) return;
  const t = $('insMotion')._targets[+row.dataset.t], i = +row.dataset.i; if (!t) return;
  if (m === 'speed') {
    const sp = Math.max(.1, +e.target.value), base = baseDur.get(t)?.[i] || 1;
    setAnimProp(t, 'animationDuration', i, (base / sp).toFixed(3) + 's');
    e.target.closest('.ins-row').querySelector('b').textContent = sp + '×';
  }
  if (m === 'direction') setAnimProp(t, 'animationDirection', i, e.target.value);
  if (m === 'iterations') setAnimProp(t, 'animationIterationCount', i, e.target.value);
  if (m === 'delay') setAnimProp(t, 'animationDelay', i, (Math.max(0, +e.target.value || 0)) + 's');
  if (m === 'pause') setAnimProp(t, 'animationPlayState', i, e.target.checked ? 'paused' : 'running');
  session.dirty = true;
});

function fill(){
  const el = session?.picked; if (!el) return;
  renderMotion();
  $('insLink').value = linkOf(el)?.getAttribute('href') || '';
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
// ✦ AI on the picked part: mark it, close the editor (keeping manual edits), let the studio rewrite just that part
panel.querySelector('#insAi').addEventListener('submit', e => {
  e.preventDefault();
  const ask = $('insAsk').value.trim(); if (!ask || !session) return;
  const { id, root } = session, el = session.picked || root.firstElementChild;
  if (!el) return;
  el.setAttribute('data-oc-target', '');
  const outline = session.doc.getElementById('__oc_pick'); outline?.remove();
  const html = root.innerHTML;
  el.removeAttribute('data-oc-target');
  session.dirty = true; finish();
  $('insAsk').value = '';
  studio.editPart(id, html, ask);
});
panel.addEventListener('click', e => {
  const a = e.target.closest('[data-ins]')?.dataset.ins; if (!a || !session) return;
  if (a === 'done') return finish();
  const el = session.picked; if (!el) return;
  if (a === 'image') return imgInput.click();
  if (a === 'aiimage') {
    const hint = el.getAttribute('alt') || el.closest('section,article,div')?.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 80) || '';
    const what = askPicture(hint); if (!what) return;
    const keep = session; studio.status('the AI is drawing the picture…', 'busy');
    e.target.closest('button').disabled = true;
    aiImage(what).then(blob => { if (session !== keep) return studio.status('editing ended before the picture was ready', 'warn'); applyImage(blob); studio.status('picture added · Ctrl+Z after closing the editor to undo', 'ok'); })
      .catch(err => studio.status(err.message, 'error'))
      .finally(() => { const b = panel.querySelector('[data-ins="aiimage"]'); if (b) b.disabled = false; });
    return;
  }
  if (a === 'icon') { pickIcon().then(svg => { if (svg && session?.picked) placeIcon(svg); }); return; }
  if (a === 'noimage') {
    if (el.tagName === 'IMG' && el.src.startsWith('data:')) { el.remove(); session.dirty = true; return pick(null); }
    el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = ''; session.dirty = true; return fill();
  }
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
