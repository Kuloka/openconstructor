// Live build right on the canvas: while the AI streams the page, a draft node sits on the board where the
// result will land (or over the element being edited) and the page grows in it section by section.
// Every section gets its own AI cursor (up to 20), named after the section; the cursor of the section
// being written follows the line the model is writing right now, the others keep polishing their blocks.
// Unchanged nodes are kept between updates (morph), so finished sections don't flicker or replay.
// Agent names and section labels are never translated (data-no-i18n): they name things, like teammates.
//
// createStage({ board, doc, width, initial, place, target, reveal, grow }) → { feed(text, done), replay(code), close() }
//   doc()          empty frame document with #__root        place(full) → { x, y, rootCss } on the board
//   initial        code of the element being edited          target      its node (hidden while the draft covers it)
//   reveal(y, h)   scroll the canvas to a board area          grow(bottom) the board must reach this y (0 = done)

const COLORS = ['#f2f2f2', '#4d8dff', '#2fbf71', '#f5b301', '#c254ff', '#00b8d9', '#ff3d8b', '#8bc34a', '#ff8a00', '#5c6bc0'];
const MAX_AGENTS = 20;
const NAMES = ['header', 'nav', 'hero', 'features', 'feature', 'pricing', 'plans', 'about', 'team', 'testimonials', 'reviews', 'faq', 'cta', 'footer', 'gallery', 'menu', 'contact', 'stats', 'logos', 'services', 'work', 'cases', 'products', 'showcase', 'steps', 'blog', 'newsletter', 'form', 'statement', 'calculator', 'card', 'banner'];
const ARROW = c => `<svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true"><path d="M2 1.5v15.2l4.1-3.9 2.7 6 3-1.3-2.7-5.9h5.6z" fill="${c}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
// before the first line of code: a skeleton page the cursors already work on
const SKELETON = '<div class="__sk"><div class="__sk-header"><i style="width:120px"></i><i style="width:260px;margin-left:auto"></i></div><div class="__sk-hero"><div><i style="width:80%;height:56px"></i><i style="width:60%;height:56px"></i><i style="width:90%"></i><i style="width:70%"></i><i class="__sk-btn"></i></div><i class="__sk-pic"></i></div><div class="__sk-features"><i class="__sk-card"></i><i class="__sk-card"></i><i class="__sk-card"></i></div></div>';
const SK_CSS = `.__sk{padding:0 64px;color:#888}.__sk i{display:block;height:16px;margin:0 0 16px;border-radius:8px;background:linear-gradient(100deg,#8883 20%,#ffffff55 50%,#8883 80%) 0 0/200% 100%;animation:oc-sh 1.4s linear infinite}.__sk-header{display:flex;gap:20px;padding:28px 0;border-bottom:1px solid #8882}.__sk-hero{display:grid;grid-template-columns:1.1fr 1fr;gap:56px;padding:90px 0}.__sk-btn{width:180px;height:48px!important;border-radius:99px!important;margin-top:30px!important}.__sk-pic{height:380px!important;border-radius:18px!important}.__sk-features{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding-bottom:90px}.__sk-card{height:190px!important;border-radius:16px!important}`;
const SLOT_SKELETON = '<div class="__sk" style="padding:64px"><i style="width:30%;height:40px"></i><i style="width:55%"></i><div class="__sk-features" style="padding:24px 0 0"><i class="__sk-card" style="height:140px!important"></i><i class="__sk-card" style="height:140px!important"></i><i class="__sk-card" style="height:140px!important"></i></div></div>';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// the frame never shows broken-image icons for photos and 3D models that aren't made yet: a shimmer instead
const STAGE_CSS = `img[data-ph]{font-size:0;color:transparent;background:linear-gradient(100deg,#8881 20%,#ffffff33 50%,#8881 80%) 0 0/200% 100%;animation:oc-sh 1.2s linear infinite}@keyframes oc-sh{to{background-position:-200% 0}}*{animation-timeline:auto!important}` + SK_CSS;

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
  s = s.replace(/\ssrc=(["'])(?:photo|art|kept|model):/gi, ` data-ph src=$1${GIF}#`); // media not made yet: a blank pixel + shimmer
  return s;
}

// keep equal nodes, patch the rest: the DOM only changes where the stream added something
// Old and new children are paired by kind (tag + class), not by position: the saved page has extra
// blocks the editor added (motion styles, fixes), and an edit may insert or drop a section.
const same = (o, n) => o.nodeType === n.nodeType && (o.nodeType !== 1 || (o.tagName === n.tagName && (o.getAttribute('class') || '') === (n.getAttribute('class') || '')));
function morph(dst, src, keep = false){
  const a = [...dst.childNodes], b = [...src.childNodes];
  let j = 0;
  for (const n of b) {
    // the next old node of the same kind (a few ahead at most); the old ones skipped over are gone in the new version
    let k = -1;
    for (let q = j; q < Math.min(a.length, j + 6); q++) if (same(a[q], n)) { k = q; break; }
    if (k < 0) { const c = n.cloneNode(true); a[j] ? dst.insertBefore(c, a[j]) : dst.append(c); continue; }
    for (; j < k; j++) a[j].remove();
    const o = a[j++];
    if (o.isEqualNode(n)) continue;
    if (o.nodeType === 3) { o.nodeValue = n.nodeValue; continue; }
    if (o.nodeType === 1 && o.tagName !== 'STYLE') {
      for (const at of [...o.attributes]) if (!n.hasAttribute(at.name)) o.removeAttribute(at.name);
      for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value) o.setAttribute(at.name, at.value);
      morph(o, n, keep); continue;
    }
    dst.replaceChild(n.cloneNode(true), o);
  }
  // an edit in progress keeps the rest of the old page below the part already rewritten
  if (!keep) for (; j < a.length; j++) a[j].remove();
}

// the page's sections: children of the first wrapper that has more than one block
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
const label = (el, i) => {
  if (el.dataset?.kind) return el.dataset.kind;
  const words = [el.tagName.toLowerCase(), el.id, ...el.classList].join(' ').toLowerCase().split(/[\s_-]+/);
  const hit = NAMES.find(n => words.includes(n));
  if (hit) return hit;
  const h = el.querySelector('h1,h2,h3')?.textContent.trim();
  return h ? h.slice(0, 18) + (h.length > 18 ? '…' : '') : 'block ' + (i + 1);
};
const TEXT = 'h1,h2,h3,h4,p,li,a,button,span,blockquote,label,td,input';
const visible = x => { const r = x.getBoundingClientRect(); return r.height > 2 && r.width > 2; };
const lastText = el => { const all = [...el.querySelectorAll(TEXT)].filter(x => (x.textContent.trim() || x.tagName === 'INPUT') && visible(x)); return all[all.length - 1] || null; };
const pick = list => list[Math.floor(Math.random() * list.length)];

export function createStage({ board, doc, width = 1280, initial = '', place, target = null, reveal = () => {}, grow = () => {} } = {}){
  if (!board || !place) return null;
  const keep = !!initial;
  let spot = place(true);
  const draft = document.createElement('div'); draft.className = 'bs-draft'; draft.setAttribute('aria-hidden', 'true'); draft.dataset.noI18n = '';
  draft.innerHTML = `<iframe sandbox="allow-same-origin" tabindex="-1" style="width:${width}px;height:${target?.offsetHeight || 640}px"></iframe><div class="bs-layer"><svg class="bs-links" aria-hidden="true"></svg><div class="bs-sel"><b></b></div></div>`;
  const frame = draft.firstChild, layer = draft.lastChild, links = layer.firstChild, sel = layer.children[1], selTag = sel.firstChild;
  const at = s => { draft.style.left = s.x + 'px'; draft.style.top = s.y + 'px'; };
  at(spot); board.append(draft);
  if (target) target.style.visibility = 'hidden';
  frame.srcdoc = doc();
  reveal(spot.y, 400);

  const agents = []; // agent i works on section i
  const agent = i => {
    if (agents[i]) return agents[i];
    const c = COLORS[i % COLORS.length];
    const el = document.createElement('div'); el.className = 'bs-cur'; el.style.setProperty('--c', c);
    el.innerHTML = ARROW(c) + '<span></span>';
    // a new agent flies in from the one before it
    const from = agents[i - 1]?.pos || { x: width / 2, y: 0 };
    el.style.transform = `translate(${from.x}px,${from.y}px) scale(var(--inv,1))`;
    layer.append(el);
    return (agents[i] = { el, i, pos: from, at: 0, on: null });
  };
  const move = (a, x, y) => { a.pos = { x, y }; a.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) scale(var(--inv,1))`; a.el.classList.add('on'); };

  let ready = false, pending = initial ? partialCode('```html\n' + initial) : SKELETON, last = '', timer = 0, closed = false;
  let fed = false, final = false, focus = -1, snaps = [], revealAt = 0;
  // swarm: one agent per section, all writing at once — parts[i] = { kind, text, state: 'wait'|'write'|'done', at }
  let parts = null, swarmCss = '';
  frame.onload = () => {
    const d = frame.contentDocument; if (!d) return;
    const s = d.createElement('style'); s.textContent = STAGE_CSS; d.head.append(s);
    if (spot.rootCss) d.getElementById('__root')?.setAttribute('style', spot.rootCss);
    ready = true; paint(true);
  };
  // the cursors keep working between stream chunks (and while the model is still thinking)
  const pulse = setInterval(() => { if (ready && !closed) aim(false); }, 900);

  function aim(stream){
    const d = frame.contentDocument, root = d?.getElementById('__root'); if (!root) return;
    const h = Math.max(root.scrollHeight, root.getBoundingClientRect().height, 120);
    frame.style.height = h + 'px'; grow(spot.y + h);
    const list = sections(root); if (!list.length) return;
    // the section being written: the last one that changed (a new page grows at the bottom, an edit anywhere)
    const html = list.map(x => x.outerHTML);
    if (parts) { let t = -1; parts.forEach((p, i) => { if (p.state === 'write' && p.at > t) { t = p.at; focus = i; } }); }
    else if (stream && fed) { for (let i = html.length - 1; i >= 0; i--) if (html[i] !== snaps[i]) { focus = i; break; } }
    else if (!fed && Math.random() < .5) focus = Math.floor(Math.random() * list.length);
    if (focus < 0 || focus >= list.length) focus = keep ? 0 : list.length - 1;
    snaps = html;
    const now = list[focus], r = now.getBoundingClientRect();
    Object.assign(sel.style, { transform: `translate(${r.left}px,${r.top}px)`, width: r.width + 'px', height: r.height + 'px' }); sel.classList.add('on');
    selTag.textContent = `${label(now, focus)} · ${fed ? Math.round(r.width) + '×' + Math.round(r.height) : parts ? 'waiting' : 'thinking'}`;
    // the canvas follows the section being written (with a swarm every agent writes at once: the view stays put)
    if (fed && stream && !parts && Date.now() - revealAt > 700) { revealAt = Date.now(); reveal(spot.y + r.top, r.height); }
    const n = Math.min(list.length, MAX_AGENTS);
    for (let i = 0; i < n; i++) {
      const a = agent(i), s = list[i];
      const st = parts?.[i]?.state;
      a.el.lastChild.textContent = label(s, i) + (st === 'wait' ? ' · waiting' : st === 'done' ? ' ✓' : '');
      a.el.classList.toggle('active', parts ? st === 'write' : i === focus);
      if (parts ? st === 'write' : i === focus && fed) {
        // the writer: at the end of the newest line
        const t = lastText(s), q = (t || s).getBoundingClientRect();
        move(a, q.left + Math.min(q.width, 320), q.top + Math.min(q.height, 40) - 4);
      } else if (!stream || !a.on?.isConnected || Date.now() - a.at > 1400 + i * 97) {
        // the others look their block over: a heading, a button, a card, a picture
        a.at = Date.now();
        const pool = [...s.querySelectorAll('h1,h2,h3,p,button,a,img,li,[class*=card],input')].filter(visible);
        a.on = pool.length ? pick(pool) : s;
        const q = a.on.getBoundingClientRect();
        move(a, q.left + q.width * (.3 + Math.random() * .5), q.top + q.height * (.4 + Math.random() * .4));
      }
    }
    for (let i = n; i < agents.length; i++) agents[i]?.el.classList.remove('on');
    drawLinks(list, n);
  }
  // How the agents join the page: a seam between neighbouring sections (lit once both are built, with a dock
  // node on each side) and a tether from every agent's cursor to the anchor of the section it works on
  function drawLinks(list, n){
    const w = width, H = parseFloat(frame.style.height) || 0;
    links.setAttribute('viewBox', `0 0 ${w} ${H}`); links.style.height = H + 'px';
    const state = i => parts ? parts[i]?.state : fed ? (i < list.length - 1 || final ? 'done' : 'write') : 'wait';
    let svg = '';
    for (let i = 0; i < list.length - 1; i++) {
      const y = list[i].getBoundingClientRect().bottom, both = state(i) === 'done' && state(i + 1) === 'done';
      svg += `<line class="seam${both ? ' joined' : ''}" x1="0" y1="${y}" x2="${w}" y2="${y}"/><circle class="dock${both ? ' joined' : ''}" cx="18" cy="${y}" r="5"/><circle class="dock${both ? ' joined' : ''}" cx="${w - 18}" cy="${y}" r="5"/>`;
    }
    for (let i = 0; i < n; i++) {
      const a = agents[i]; if (!a?.pos) continue;
      const r = list[i].getBoundingClientRect(), ax = r.left + 18, ay = r.top + 18, { x, y } = a.pos;
      const mx = (x + ax) / 2;
      svg += `<path class="tether${state(i) === 'write' ? ' live' : ''}" style="--c:${COLORS[i % COLORS.length]}" d="M${ax} ${ay} C ${mx} ${ay}, ${mx} ${y}, ${x} ${y}"/><circle class="anchor" style="--c:${COLORS[i % COLORS.length]}" cx="${ax}" cy="${ay}" r="4"/>`;
    }
    links.innerHTML = svg;
  }
  function paint(force){
    timer = 0; if (closed || !ready || (!force && pending === last)) return;
    last = pending;
    const d = frame.contentDocument, root = d?.getElementById('__root'); if (!root) return;
    if (parts && !final) { paintParts(d, root); aim(true); return; }
    const tp = d.createElement('template'); tp.innerHTML = pending;
    try { morph(root, tp.content, keep && fed && !final); } catch { root.innerHTML = pending; }
    aim(true);
  }
  // every agent's stream goes into its own slot, so a half-written section never swallows the next one
  function paintParts(d, root){
    let pg = root.querySelector(':scope > .pg[data-swarm]');
    if (!pg) {
      root.innerHTML = `<style>${swarmCss}</style><div class="pg" data-swarm>${parts.map((p, i) => `<div data-part="${i}" data-kind="${p.kind.replace(/[<>"&]/g, '')}"></div>`).join('')}</div>`;
      pg = root.querySelector('.pg');
    }
    parts.forEach((p, i) => {
      const slot = pg.children[i]; if (!slot || slot._v === p.text + p.state) return;
      slot._v = p.text + p.state;
      const code = p.text ? partialCode(p.text) : '';
      const tp = d.createElement('template'); tp.innerHTML = code.trim() ? code : SLOT_SKELETON;
      try { morph(slot, tp.content); } catch { slot.innerHTML = tp.innerHTML; }
    });
  }
  const api = {
    // the plan is ready: one slot and one agent per section, each waiting for its stream
    swarm(css, kinds){ if (closed) return; swarmCss = css || ''; parts = kinds.map(kind => ({ kind: String(kind || 'section').slice(0, 24), text: '', state: 'wait', at: 0 })); fed = true; last = ''; pending = '\u0000swarm'; if (!timer) timer = setTimeout(paint, 60); },
    part(i, text, done = false){
      if (closed || !parts?.[i]) return;
      Object.assign(parts[i], { text, state: done ? 'done' : 'write', at: Date.now() });
      pending = '\u0000swarm' + parts.map(p => p.text.length + p.state).join(); if (!timer) timer = setTimeout(paint, 160);
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
      if (!fed) { fed = true; focus = -1; snaps = []; }
      final = done; pending = code; if (!timer) timer = setTimeout(paint, 180);
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
      if (closed) return; closed = true; clearTimeout(timer); clearInterval(pulse);
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
