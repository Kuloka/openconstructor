// Live build right on the canvas: while the AI streams its answer, a draft node sits on the board where the
// result will land (or over the element being edited) and the page appears in it exactly as it is written.
// Nothing is staged: no skeleton, no wandering. Every update is diffed against the page so far (morph);
// the element the stream just wrote is where the AI cursor goes, the selection box outlines it with its real
// tag and class, and new elements fade in. With a swarm every agent streams its own section: its cursor appears
// when it starts writing, follows its own newest element and leaves with a ✓ when the section is done.
// Agent names and labels are never translated (data-no-i18n).
//
// createStage({ board, doc, width, initial, place, target, reveal, grow, model }) → { swarm, part, feed, replay, close }
//   doc()          empty frame document with #__root        place(full) → { x, y, rootCss } on the board
//   initial        code of the element being edited          target      its node (hidden while the draft covers it)
//   reveal(y, h)   scroll the canvas to a board area          grow(bottom) the board must reach this y (0 = done)
//   model(query)   → Promise of a picture of a 3D object, so model: objects show up while they are written

const COLORS = ['#f2f2f2', '#4d8dff', '#2fbf71', '#f5b301', '#c254ff', '#00b8d9', '#ff3d8b', '#8bc34a', '#ff8a00', '#5c6bc0'];
const MAX_AGENTS = 20;
const ARROW = c => `<svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true"><path d="M2 1.5v15.2l4.1-3.9 2.7 6 3-1.3-2.7-5.9h5.6z" fill="${c}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// photos not downloaded yet shimmer instead of showing a broken-image icon; scroll-driven effects show their end state
const STAGE_CSS = `img[data-ph]{font-size:0;color:transparent;background:linear-gradient(100deg,#8881 20%,#ffffff33 50%,#8881 80%) 0 0/200% 100%;animation:oc-sh 1.2s linear infinite}img[data-ph]{min-height:40px}img[data-model]{aspect-ratio:1;object-fit:contain;border-radius:18px}img[data-model][src^="data:image/gif"]{min-width:120px}img[data-model]:not([src^="data:image/gif"]){background:none;animation:none}@keyframes oc-sh{to{background-position:-200% 0}}*{animation-timeline:auto!important}`;

// the code part of a streamed answer, cut so the browser never sees half a tag or a running script
export function partialCode(text){
  let s = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const at = s.indexOf('```');
  if (at >= 0) { s = s.slice(at); const nl = s.indexOf('\n'); s = nl >= 0 ? s.slice(nl + 1) : ''; }
  else { const lt = s.search(/<[a-z!]/i); if (lt < 0) return ''; s = s.slice(lt); }
  const close = s.indexOf('```'); if (close >= 0) s = s.slice(0, close);
  s = s.replace(/<[^<>]*$/, '');                                   // a tag still being written
  s = s.replace(/<script\b[\s\S]*?(<\/script\s*>|$)/gi, '');        // scripts never run on the stage
  s = s.replace(/<style\b[^>]*>(?![\s\S]*<\/style>)[\s\S]*$/i, '');   // half-written CSS would flash unstyled blocks
  // 3D objects keep their query (the stage draws them as soon as they are written); other media: a blank pixel + shimmer
  s = s.replace(/\ssrc=(["'])model:([^"']*)\1/gi, (m, q, v) => ` data-ph data-model="${v.replace(/"/g, '')}" src=${q}${GIF}${q}`);
  s = s.replace(/\ssrc=(["'])(?:photo|art|kept|model):/gi, ` data-ph src=$1${GIF}#`);
  return s;
}

// Keep equal nodes, patch the rest — the DOM only changes where the stream added something — and report
// where that was: log.last = the element written last (in document order), log.fresh = elements just added.
// Old and new children are paired by kind (tag + class), not by position: the saved page has extra blocks
// the editor added, and an edit may insert or drop a section.
const same = (o, n) => o.nodeType === n.nodeType && (o.nodeType !== 1 || (o.tagName === n.tagName && (o.getAttribute('class') || '') === (n.getAttribute('class') || '')));
const lastElement = el => { let e = el; while (e.lastElementChild && !/^(STYLE|SVG|svg)$/.test(e.lastElementChild.tagName)) e = e.lastElementChild; return e; };
function morph(dst, src, keep = false, log = {}){
  const a = [...dst.childNodes], b = [...src.childNodes];
  let j = 0;
  for (const n of b) {
    let k = -1;
    for (let q = j; q < Math.min(a.length, j + 6); q++) if (same(a[q], n)) { k = q; break; }
    if (k < 0) {
      const c = n.cloneNode(true); a[j] ? dst.insertBefore(c, a[j]) : dst.append(c);
      if (c.nodeType === 1 && c.tagName !== 'STYLE') { log.fresh?.push(c); log.last = lastElement(c); }
      else if (c.nodeType === 3 && c.nodeValue.trim()) log.last = dst;
      continue;
    }
    for (; j < k; j++) a[j].remove();
    const o = a[j++];
    if (o.isEqualNode(n)) continue;
    if (o.nodeType === 3) { o.nodeValue = n.nodeValue; if (n.nodeValue.trim()) log.last = dst; continue; }
    if (o.nodeType === 1 && o.tagName !== 'STYLE') {
      // a 3D object already drawn keeps its picture (the stream still says "blank pixel")
      const drawn = o.dataset?.model && o._drawn;
      for (const at of [...o.attributes]) if (!n.hasAttribute(at.name)) o.removeAttribute(at.name);
      for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value && !(drawn && at.name === 'src')) { o.setAttribute(at.name, at.value); log.last = o; }
      morph(o, n, keep, log); continue;
    }
    dst.replaceChild(n.cloneNode(true), o);
  }
  if (!keep) for (; j < a.length; j++) a[j].remove();
  return log;
}

// the page's top-level blocks (for the seams between them): children of the first wrapper with more than one block
function sections(root){
  let el = root;
  for (let d = 0; d < 4; d++) {
    const kids = [...el.children].filter(k => !/^(STYLE|SCRIPT|LINK|META)$/.test(k.tagName) && k.getBoundingClientRect().height > 4);
    if (kids.length > 1) return kids;
    if (kids.length !== 1) break;
    el = kids[0];
  }
  return el === root ? [] : [el];
}
// what to outline for the element just written: itself when it is a visible thing, else its nearest visible block
const BLOCK = 'h1,h2,h3,h4,h5,p,li,a,button,img,canvas,svg,input,textarea,select,label,blockquote,figure,span,td,th';
function subject(el, root){
  const seen = x => { const r = x.getBoundingClientRect(); return r.width > 6 && r.height > 6; };
  if (el && el !== root && !seen(el)) { let p = el.previousElementSibling; while (p && !seen(p)) p = p.previousElementSibling; if (p) el = lastVisible(p) || p; }
  for (let e = el; e && e !== root; e = e.parentElement) {
    const r = e.getBoundingClientRect();
    if (r.width > 6 && r.height > 6 && (e.matches(BLOCK) || r.height < 400)) return e;
  }
  return null;
}
function lastVisible(el){ const all = [...el.querySelectorAll('*')].reverse(); return all.find(x => { const r = x.getBoundingClientRect(); return r.width > 6 && r.height > 6 && x.matches(BLOCK); }) || null; }
const tagOf = el => el.tagName.toLowerCase() + (el.dataset?.model ? ' · 3D' : el.classList[0] ? '.' + el.classList[0] : '');

export function createStage({ board, doc, width = 1280, initial = '', place, target = null, reveal = () => {}, grow = () => {}, model = null } = {}){
  if (!board || !place) return null;
  const keep = !!initial;
  let spot = place(true);
  const draft = document.createElement('div'); draft.className = 'bs-draft'; draft.setAttribute('aria-hidden', 'true'); draft.dataset.noI18n = '';
  draft.innerHTML = `<iframe sandbox="allow-same-origin" tabindex="-1" style="width:${width}px;height:${target?.offsetHeight || 120}px"></iframe><div class="bs-layer"><svg class="bs-links" aria-hidden="true"></svg></div>`;
  const frame = draft.firstChild, layer = draft.lastChild, links = layer.firstChild;
  const at = s => { draft.style.left = s.x + 'px'; draft.style.top = s.y + 'px'; };
  at(spot); board.append(draft);
  if (target) target.style.visibility = 'hidden';
  frame.srcdoc = doc();
  reveal(spot.y, 400);

  // One agent = one real writer: a cursor and its own selection box. Single answers have agent 0;
  // a swarm has one per section. An agent exists only once it has written something.
  const agents = [];
  const agent = i => {
    if (agents[i]) return agents[i];
    const c = COLORS[i % COLORS.length];
    const cur = document.createElement('div'); cur.className = 'bs-cur'; cur.style.setProperty('--c', c); cur.innerHTML = ARROW(c) + '<span></span>';
    const box = document.createElement('div'); box.className = 'bs-sel'; box.style.setProperty('--c', c); box.innerHTML = '<b></b>';
    const from = agents[i - 1]?.pos || { x: width / 2, y: 0 };
    cur.style.transform = `translate(${from.x}px,${from.y}px) scale(var(--inv,1))`;
    layer.append(box, cur);
    return (agents[i] = { cur, box, i, c, pos: from, el: null, done: false });
  };
  const show = (a, el, note = '') => {
    if (!el?.isConnected) return;
    const r = el.getBoundingClientRect();
    a.el = el;
    Object.assign(a.box.style, { transform: `translate(${r.left - 3}px,${r.top - 3}px)`, width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
    a.box.firstChild.textContent = tagOf(el) + ' · ' + Math.round(r.width) + '×' + Math.round(r.height);
    a.box.classList.add('on');
    // the cursor at the end of what was just written: the bottom-right of a short thing, the last line of a long one
    const x = r.left + Math.min(r.width, 360) - 2, y = r.top + Math.min(r.height, 44) - 6;
    a.pos = { x, y };
    a.cur.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) scale(var(--inv,1))`;
    a.cur.lastChild.textContent = note || tagOf(el);
    a.cur.classList.add('on', 'active');
  };
  const finish = a => { if (!a || a.done) return; a.done = true; a.cur.classList.remove('active'); a.cur.lastChild.textContent += ' ✓'; a.box.classList.remove('on'); setTimeout(() => a.cur.classList.remove('on'), 1100); };

  let ready = false, pending = initial ? partialCode('```html\n' + initial) : '', last = '', timer = 0, closed = false;
  let fed = false, final = false, revealAt = 0;
  let parts = null, swarmCss = '';
  const pics = new Map(); // 3D query → picture (or the promise of it)
  frame.onload = () => {
    const d = frame.contentDocument; if (!d) return;
    const s = d.createElement('style'); s.textContent = STAGE_CSS; d.head.append(s);
    if (spot.rootCss) d.getElementById('__root')?.setAttribute('style', spot.rootCss);
    ready = true; paint(true);
  };

  // new elements fade in where they are written; a 3D object is drawn the moment its tag is complete
  function settle(log, d){
    for (const el of log.fresh) { try { el.animate([{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }); } catch {} }
    if (!model) return;
    for (const img of d.querySelectorAll('img[data-model]')) {
      if (img._drawn) continue;
      const q = img.dataset.model;
      if (typeof pics.get(q) === 'string') { img.src = pics.get(q); img._drawn = true; continue; }
      if (!pics.has(q)) pics.set(q, model(q).then(url => { pics.set(q, url); paint(true); }, () => pics.delete(q)));
    }
  }
  function measure(){
    const d = frame.contentDocument, root = d?.getElementById('__root'); if (!root) return null;
    const h = Math.max(root.scrollHeight, root.getBoundingClientRect().height, fed ? 60 : 0);
    frame.style.height = h + 'px'; grow(spot.y + h);
    return root;
  }
  function paint(force){
    timer = 0; if (closed || !ready || (!force && pending === last)) return;
    last = pending;
    const d = frame.contentDocument, root = d?.getElementById('__root'); if (!root) return;
    if (parts && !final) { paintParts(d, root); return; }
    if (!pending) return;
    const tp = d.createElement('template'); tp.innerHTML = pending;
    let log = { fresh: [], last: null };
    try { log = morph(root, tp.content, keep && fed && !final, log); } catch { root.innerHTML = pending; }
    settle(log, d);
    measure();
    if (!fed) return;
    if (parts) { drawLinks(root); return; } // the swarm's finished page: its agents already signed their sections
    const a = agent(0), el = log.last && subject(log.last, root);
    if (el) {
      show(a, el);
      const r = el.getBoundingClientRect();
      if (Date.now() - revealAt > 700) { revealAt = Date.now(); reveal(spot.y + r.top, r.height); }
    } else if (a.el) show(a, a.el);
    if (final) finish(a);
    drawLinks(root);
  }
  // every agent's stream goes into its own slot, so a half-written section never swallows the next one
  function paintParts(d, root){
    let pg = root.querySelector(':scope > .pg[data-swarm]');
    if (!pg) {
      root.innerHTML = `<style>${swarmCss}</style><div class="pg" data-swarm>${parts.map((p, i) => `<div data-part="${i}" data-kind="${p.kind.replace(/[<>"&]/g, '')}"></div>`).join('')}</div>`;
      pg = root.querySelector('.pg');
    }
    const logs = [];
    parts.forEach((p, i) => {
      const slot = pg.children[i]; if (!slot || slot._v === p.text + p.state) return;
      slot._v = p.text + p.state;
      const code = p.text ? partialCode(p.text) : '';
      if (!code.trim()) return;
      const tp = d.createElement('template'); tp.innerHTML = code;
      let log = { fresh: [], last: null };
      try { log = morph(slot, tp.content, false, log); } catch { slot.innerHTML = code; }
      logs.push([i, log, slot]);
    });
    for (const [, log] of logs) settle(log, d);
    measure();
    for (const [i, log, slot] of logs) {
      if (i >= MAX_AGENTS) continue;
      const a = agent(i), el = log.last && subject(log.last, slot);
      if (el) show(a, el, parts[i].kind + ' · ' + tagOf(el)); else if (a.el) show(a, a.el, parts[i].kind);
      if (parts[i].state === 'done') finish(a);
    }
    // agents keep their spot when other sections above them grow
    for (const a of agents) if (a && !a.done && a.el && !logs.some(([i]) => i === a.i)) show(a, a.el, parts[a.i]?.kind + ' · ' + tagOf(a.el));
    drawLinks(pg);
  }
  // How the blocks join: a seam between neighbouring blocks that are both finished (a dock on each side),
  // and a tether from every writing agent to the block it writes
  function drawLinks(root){
    const w = width, H = parseFloat(frame.style.height) || 0;
    links.setAttribute('viewBox', `0 0 ${w} ${H}`); links.style.height = H + 'px';
    const list = parts ? [...root.children].filter(x => x.childElementCount) : sections(root).filter(x => x.getBoundingClientRect().width > w * 0.7);
    const doneAt = i => parts ? parts[+list[i].dataset.part]?.state === 'done' : final || i < list.length - 1;
    let svg = '';
    for (let i = 0; i < list.length - 1; i++) {
      if (!doneAt(i) || !doneAt(i + 1)) continue;
      const y = list[i].getBoundingClientRect().bottom;
      svg += `<line class="seam joined" x1="0" y1="${y}" x2="${w}" y2="${y}"/><circle class="dock joined" cx="18" cy="${y}" r="5"/><circle class="dock joined" cx="${w - 18}" cy="${y}" r="5"/>`;
    }
    if (parts) for (const a of agents) {
      if (!a || a.done || !a.el?.isConnected) continue;
      const slot = root.children[a.i]; if (!slot) continue;
      const r = slot.getBoundingClientRect(), ax = r.left + 18, ay = r.top + 18, { x, y } = a.pos, mx = (x + ax) / 2;
      svg += `<path class="tether live" style="--c:${a.c}" d="M${ax} ${ay} C ${mx} ${ay}, ${mx} ${y}, ${x} ${y}"/><circle class="anchor" style="--c:${a.c}" cx="${ax}" cy="${ay}" r="4"/>`;
    }
    links.innerHTML = svg;
  }
  const api = {
    // the plan is ready: one slot per section; each agent shows up when its stream starts
    swarm(css, kinds){ if (closed) return; swarmCss = css || ''; parts = kinds.map(kind => ({ kind: String(kind || 'section').slice(0, 24), text: '', state: 'wait', at: 0 })); fed = true; last = ''; pending = '\u0000swarm'; if (!timer) timer = setTimeout(paint, 60); },
    part(i, text, done = false){
      if (closed || !parts?.[i]) return;
      Object.assign(parts[i], { text, state: done ? 'done' : 'write', at: Date.now() });
      pending = '\u0000swarm' + parts.map(p => p.text.length + p.state).join();
      // a finished section is shown at once (its agent signs it off), a growing one at most every 140 ms
      if (done) { clearTimeout(timer); paint(); } else if (!timer) timer = setTimeout(paint, 140);
    },
    feed(text, done = false){
      if (closed) return;
      // the header line says what is being built: a small component moves to a free spot of its own
      if (!keep && !fed) {
        const m = String(text).match(/"full"\s*:\s*(true|false)/);
        if (m && m[1] === 'false') { spot = place(false); at(spot); const r = frame.contentDocument?.getElementById('__root'); if (r && spot.rootCss) r.setAttribute('style', spot.rootCss); }
      }
      const code = partialCode(text);
      // an edit waits for its CSS: without it the old page would lose its look for a moment
      if (keep && !done && /<style\b/i.test(text) && !/<\/style>/i.test(text)) return;
      if (!code.trim()) return;
      fed = true;
      final = done; pending = code; if (!timer) timer = setTimeout(paint, 140);
    },
    // no stream (variants, cinematic pages, providers without streaming): play the finished code in ~2.4s
    async replay(code, ms = 2400){
      const s = String(code || ''), n = 22;
      for (let i = 1; i <= n && !closed; i++) {
        let cut = Math.round(s.length * i / n);
        if (i < n) { const gt = s.indexOf('>', cut); cut = gt < 0 ? s.length : gt + 1; }
        api.feed('```html\n' + s.slice(0, cut), i === n);
        await new Promise(r => setTimeout(r, ms / n));
      }
      await new Promise(r => setTimeout(r, 400));
    },
    close(){
      if (closed) return; closed = true; clearTimeout(timer);
      agents.forEach(finish);
      // the real element is placed under the draft; the draft fades out once it has had a moment to load
      draft.classList.add('done');
      setTimeout(() => {
        if (target) target.style.visibility = '';
        draft.classList.add('out');
        setTimeout(() => { draft.remove(); grow(0); }, 380);
      }, 450);
    },
  };
  return api;
}
