// screens.js: several screens in one project (menu → shop → inventory…).
//
// Data lives in the page object, so cloud projects, version history, publishing and remix carry it
// with no changes of their own:
//   page.screens = [{ id, name, slug, items?, page?, height? }]   (order = tab order, first = start screen)
//   page.screen  = id of the screen on the canvas. Its entry has no items/page: the canvas holds them live.
// A link to "#slug" (inspector → link) opens that screen: in ▶ play, in the exported/published HTML
// (CSS :target, no scripts) and in the Roblox exports (show("Name") in the button handler).
import { studio } from './studio.js';
import './screens.css';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = pg => { const { screens, screen, ...rest } = pg || {}; return rest; };

/* ── model ───────────────────────────────────────────────── */
// The list with an implicit "Main" screen for single-screen projects
function state(){
  const pg = studio.page();
  if (Array.isArray(pg.screens) && pg.screens.length && pg.screens.some(s => s.id === pg.screen)) return { list: pg.screens, cur: pg.screen };
  return { list: [{ id: 'main', name: 'Main', slug: 'main' }], cur: 'main', implicit: true };
}
function slugify(name, list, self){
  let base = String(name).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!base || /^\d/.test(base)) base = 'screen' + (base ? '-' + base : '');
  base = base.slice(0, 40);
  let slug = base, n = 2;
  while (list.some(s => s.slug === slug && s.id !== self)) slug = `${base}-${n++}`;
  return slug;
}
// Current canvas → its list entry (full data); used before leaving it or for exports
const liveEntry = s => ({ ...s, items: studio.items(), page: strip(studio.page()), height: studio.contentHeight() });

function commit(list, cur){ studio.setPage({ screens: list, screen: cur }); draw(); }

// Put another screen on the canvas
function open(id, { animate = true } = {}){
  const { list, cur } = state();
  if (id === cur) return;
  const target = list.find(s => s.id === id); if (!target) return;
  const next = list.map(s => s.id === cur ? liveEntry(s) : s.id === id ? { id: s.id, name: s.name, slug: s.slug } : s);
  const board = document.getElementById('board');
  if (animate && board && !matchMedia('(prefers-reduced-motion: reduce)').matches) board.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
  studio.swap({ items: target.items || [], page: { ...(target.page || strip(studio.page())), screens: next, screen: id } });
  draw();
  studio.status(`screen: ${target.name}`);
}

function add(){
  const { list, cur } = state();
  const name = `Screen ${list.length + 1}`;
  const s = { id: crypto.randomUUID(), name, slug: '' };
  s.slug = slugify(name, list);
  const base = strip(studio.page());
  // the new screen starts empty with the same size, background and theme
  const next = [...list.map(x => x.id === cur ? liveEntry(x) : x), { id: s.id, name: s.name, slug: s.slug }];
  studio.swap({ items: [], page: { ...base, screens: next, screen: s.id } });
  draw();
  studio.status(`added "${name}" — double-click the tab to rename it; link a button to #${s.slug} to open it`, 'ok');
  requestAnimationFrame(() => rename(s.id));
}

function duplicate(id){
  const { list, cur } = state();
  const src = id === cur ? liveEntry(list.find(s => s.id === id)) : list.find(s => s.id === id);
  const name = src.name + ' copy';
  const copy = { ...src, id: crypto.randomUUID(), name, slug: slugify(name, list), items: (src.items || []).map(it => ({ ...it, id: crypto.randomUUID() })) };
  const i = list.findIndex(s => s.id === id);
  const next = [...list]; next.splice(i + 1, 0, copy);
  commit(next, cur);
  open(copy.id);
}

function remove(id){
  let { list, cur } = state();
  if (list.length < 2) return;
  const s = list.find(x => x.id === id);
  if (!confirm(`Delete the screen "${s.name}"? Its elements are removed too.`)) return;
  if (id === cur) { open(list.find(x => x.id !== id).id, { animate: false }); ({ list, cur } = state()); }
  const next = list.filter(x => x.id !== id);
  if (next.length === 1) {
    // back to a plain single-screen project
    studio.setPage({ screens: undefined, screen: undefined }); draw();
  } else commit(next, cur);
}

function move(id, dir){
  const { list, cur } = state();
  const i = list.findIndex(s => s.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
  commit(next, cur);
}

// Rename in place; the slug follows the name and links to the old slug are rewritten everywhere
function rename(id){
  const tab = $(`.scr-tab[data-id="${CSS.escape(id)}"] .scr-name`); if (!tab) return;
  const before = tab.textContent;
  tab.contentEditable = 'plaintext-only'; tab.focus();
  getSelection().selectAllChildren(tab);
  const done = keep => {
    tab.contentEditable = 'false'; tab.onblur = tab.onkeydown = null;
    const name = tab.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!keep || !name || name === before) { tab.textContent = before; return; }
    let { list, cur, implicit } = state();
    if (implicit) { list = [{ id: 'main', name: 'Main', slug: 'main' }]; cur = 'main'; }
    const old = list.find(s => s.id === id), slug = slugify(name, list, id);
    const relink = code => old.slug === slug ? code : String(code).split(`href="#${old.slug}"`).join(`href="#${slug}"`);
    const next = list.map(s => ({ ...(s.id === id ? { ...s, name, slug } : s), ...(s.items ? { items: s.items.map(it => ({ ...it, code: relink(it.code) })) } : {}) }));
    if (old.slug !== slug && studio.items().some(it => it.code.includes(`href="#${old.slug}"`))) studio.update(items => items.map(it => ({ ...it, code: relink(it.code) })));
    commit(next, cur);
  };
  tab.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } };
  tab.onblur = () => done(true);
}

/* ── tabs ────────────────────────────────────────────────── */
const bar = document.createElement('div');
bar.className = 'screens-bar'; bar.id = 'screensBar';
bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Screens');
$('.canvas-toolbar')?.after(bar);

function draw(){
  const { list, cur } = state();
  bar.innerHTML = `<span class="scr-label">screens</span>${list.map((s, i) =>
    `<button class="scr-tab${s.id === cur ? ' active' : ''}" role="tab" aria-selected="${s.id === cur}" data-id="${esc(s.id)}" title="${i === 0 ? 'Start screen · ' : ''}link: #${esc(s.slug)} · double-click to rename, right-click for more">${i === 0 ? '<i class="scr-start" aria-hidden="true">▸</i>' : ''}<span class="scr-name">${esc(s.name)}</span></button>`).join('')}<button class="scr-add" title="Add a screen: menu, shop, inventory, settings…">+ screen</button>${list.length > 1 ? `<span class="scr-hint">link a button to <code>#${esc(list.find(s => s.id !== cur)?.slug || '')}</code> to open a screen</span>` : ''}`;
  links();
}
bar.addEventListener('click', e => {
  if (e.target.closest('.scr-add')) return add();
  const t = e.target.closest('.scr-tab'); if (t && t.querySelector('.scr-name').contentEditable !== 'true' && t.querySelector('.scr-name').contentEditable !== 'plaintext-only') open(t.dataset.id);
});
bar.addEventListener('dblclick', e => { const t = e.target.closest('.scr-tab'); if (t) rename(t.dataset.id); });
bar.addEventListener('contextmenu', e => {
  const t = e.target.closest('.scr-tab'); if (!t) return;
  e.preventDefault();
  const id = t.dataset.id, { list } = state(), i = list.findIndex(s => s.id === id), s = list[i];
  studio.menu(e.clientX, e.clientY, [
    { label: 'Rename', key: 'dbl-click', run: () => rename(id) },
    { label: 'Duplicate', key: '', run: () => duplicate(id) },
    { label: 'Copy link to this screen', key: '#' + s.slug, run: () => { navigator.clipboard?.writeText('#' + s.slug); studio.status(`copied #${s.slug} — paste it into a button's link in the inspector`, 'ok'); } },
    '-',
    ...(i > 0 ? [{ label: 'Make it the start screen', key: '', run: () => { const next = [s, ...list.filter(x => x.id !== id)]; commit(next, state().cur); } }] : []),
    ...(i > 0 ? [{ label: 'Move left', key: '', run: () => move(id, -1) }] : []),
    ...(i < list.length - 1 ? [{ label: 'Move right', key: '', run: () => move(id, 1) }] : []),
    ...(list.length > 1 ? ['-', { label: 'Delete screen', key: '', run: () => remove(id) }] : []),
  ]);
});
// Ctrl+PageUp / Ctrl+PageDown: previous / next screen
addEventListener('keydown', e => {
  if (!e.ctrlKey || (e.key !== 'PageUp' && e.key !== 'PageDown')) return;
  const { list, cur } = state(); if (list.length < 2) return;
  e.preventDefault();
  const i = list.findIndex(s => s.id === cur);
  open(list[(i + (e.key === 'PageDown' ? 1 : -1) + list.length) % list.length].id);
});

// The inspector's link field suggests the screens
const datalist = document.createElement('datalist'); datalist.id = 'ocScreenLinks'; document.body.append(datalist);
function links(){
  const { list } = state();
  datalist.innerHTML = list.map(s => `<option value="#${esc(s.slug)}">${esc(s.name)} screen</option>`).join('');
  const input = document.getElementById('insLink'); if (input && input.getAttribute('list') !== 'ocScreenLinks') input.setAttribute('list', 'ocScreenLinks');
}
document.addEventListener('focusin', e => { if (e.target.id === 'insLink') links(); });

// ▶ play: a click on a link to "#slug" opens that screen
document.getElementById('board')?.addEventListener('load', e => {
  const f = e.target; if (f.tagName !== 'IFRAME') return;
  try {
    f.contentDocument.addEventListener('click', ev => {
      const a = ev.target.closest?.('a[href^="#"]'); if (!a) return;
      const slug = a.getAttribute('href').slice(1), s = state().list.find(x => x.slug === slug);
      if (!s) return;
      ev.preventDefault();
      if (studio.isPlaying()) open(s.id);
    });
  } catch {}
}, true);

/* ── hooks for exports (studio.js) ───────────────────────── */
studio.screens = {
  count: () => state().list.length,
  // All screens with their item data, the current one taken live from the canvas
  forHTML(){
    const { list, cur } = state();
    return list.map(s => s.id === cur ? liveEntry(s) : { ...s, items: s.items || [], page: s.page || strip(studio.page()) });
  },
  // Visit every screen on the canvas and run snap() on it (the Roblox exporters read the rendered DOM)
  async collect(snap){
    const { list, cur } = state(), out = [];
    studio.status('reading every screen…', 'busy');
    try {
      for (const s of list) {
        if (s.id !== state().cur) { open(s.id, { animate: false }); await studio.rendered(); }
        else await studio.rendered(1000);
        out.push({ name: s.name, slug: s.slug, page: strip(studio.page()), nodes: snap() });
      }
    } finally {
      if (state().cur !== cur) { open(cur, { animate: false }); }
    }
    return out;
  },
  open: id => open(id),
};

addEventListener('oc:screens', draw);
draw();
