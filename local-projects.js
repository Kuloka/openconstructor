// Projects on this device: a list of every page the user made in this browser, no account needed.
// The open project autosaves into its entry; opening a template starts a new project instead of
// overwriting the current one. Stored in IndexedDB (falls back to localStorage); the id of the open
// project is in localStorage `oc-local-id`. Cloud projects (projects.js) open from the same window.
import { studio } from './studio.js';
import { projects as cloud } from './projects.js';
import { t, lang } from './i18n.js';
import './projects.css';

const CUR = 'oc-local-id', LS_DB = 'oc-local-projects';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const cleanName = s => String(s || '').trim().slice(0, 60) || 'untitled';

/* ── Storage: IndexedDB, or localStorage if it isn't available ── */
let dbp = null;
function db(){
  return dbp ||= new Promise(resolve => {
    try {
      const req = indexedDB.open('oc-projects', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
const lsAll = () => { try { return JSON.parse(ls.get(LS_DB)) || []; } catch { return []; } };
async function tx(mode, fn){
  const d = await db();
  if (!d) {
    const all = lsAll(), out = fn({ all });
    if (mode === 'readwrite') ls.set(LS_DB, JSON.stringify(all));
    return out;
  }
  return new Promise((resolve, reject) => {
    const tr = d.transaction('projects', mode), store = tr.objectStore('projects');
    let out;
    const r = fn({ store });
    if (r instanceof IDBRequest) r.onsuccess = () => { out = r.result; }; else out = r;
    tr.oncomplete = () => resolve(out);
    tr.onerror = tr.onabort = () => reject(tr.error);
  });
}
const getAll = () => tx('readonly', ({ store, all }) => store ? store.getAll() : all.slice());
const getOne = id => tx('readonly', ({ store, all }) => store ? store.get(id) : all.find(p => p.id === id));
const put = p => tx('readwrite', ({ store, all }) => { if (store) return store.put(p); const i = all.findIndex(x => x.id === p.id); i < 0 ? all.push(p) : all[i] = p; });
const remove = id => tx('readwrite', ({ store, all }) => { if (store) return store.delete(id); const i = all.findIndex(x => x.id === id); if (i >= 0) all.splice(i, 1); });

/* ── The open project ── */
let currentId = ls.get(CUR);
const setCurrent = id => { currentId = id; ls.set(CUR, id); };
const snapshot = () => ({ items: studio.items(), page: studio.page() });
const entry = (id, name, data) => ({ id, name: cleanName(name), data, updated: Date.now(), count: data.items.length, bg: data.page?.bg || '' });

// Names are unique: chat and version history are kept per project name
async function uniqueName(base, except){
  const taken = new Set((await getAll()).filter(p => p.id !== except).map(p => p.name));
  base = cleanName(base);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

let timer = 0, saving = Promise.resolve();
function saveSoon(delay = 800){ clearTimeout(timer); timer = setTimeout(saveNow, delay); }
function saveNow(){
  clearTimeout(timer); timer = 0;
  if (!currentId) return saving;
  const e = entry(currentId, studio.name(), snapshot());
  return (saving = saving.then(async () => {
    try { await put(e); if (isOpen()) refresh(); }
    catch (err) { console.warn('[projects] local save failed', err); }
  }));
}
window.addEventListener('oc:changed', () => saveSoon());
document.getElementById('projectName')?.addEventListener('blur', () => saveSoon(100));
window.addEventListener('oc:before-replace', () => saveNow());
window.addEventListener('oc:replaced', () => { setCurrent(crypto.randomUUID()); saveNow(); });
window.addEventListener('beforeunload', () => { if (timer) saveNow(); });

// First run: whatever is on the canvas becomes the first project in the list
(async () => {
  if (currentId && await getOne(currentId)) return;
  setCurrent(crypto.randomUUID());
  await put(entry(currentId, studio.name(), snapshot()));
})();

/** Starts a new empty project; the open one stays saved in the list. */
export async function startNew(name = t('untitled')){
  cloud.unlink();
  const reuse = currentId && !studio.items().length;
  await saveNow();
  const id = reuse ? currentId : crypto.randomUUID(), n = await uniqueName(name, id);
  setCurrent(id);
  studio.load({ items: [], name: n });
  await put(entry(id, n, snapshot()));
  if (isOpen()) refresh();
}

async function openLocal(id){
  if (id === currentId) return close();
  await saveNow();
  const p = await getOne(id); if (!p) return refresh();
  cloud.unlink();
  setCurrent(id);
  studio.load({ items: p.data?.items || [], page: p.data?.page, name: p.name });
  studio.status(`opened "${p.name}"`, 'ok');
  close();
}
async function renameLocal(id, name){
  const p = await getOne(id); if (!p) return;
  p.name = await uniqueName(name, id);
  await put(p);
  if (id === currentId) { const el = document.getElementById('projectName'); if (el) el.textContent = p.name; try { localStorage.setItem('oc-name', JSON.stringify(p.name)); } catch {} }
  refresh();
}
async function duplicateLocal(id){
  if (id === currentId) await saveNow();
  const p = await getOne(id); if (!p) return;
  await put({ ...p, id: crypto.randomUUID(), name: await uniqueName(p.name + ' copy'), updated: Date.now() });
  refresh();
}
async function deleteLocal(id, name){
  if (!confirm(`Delete "${name}" from this device? This can't be undone.`)) return;
  await remove(id);
  if (id === currentId) {
    const rest = (await getAll()).sort((a, b) => b.updated - a.updated);
    if (rest[0]) { setCurrent(rest[0].id); studio.load({ items: rest[0].data?.items || [], page: rest[0].data?.page, name: rest[0].name }); }
    else { setCurrent(null); await startNew(); }
  }
  refresh();
}

/* ── Window ── */
const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'localProjectsModal';
modal.innerHTML = `<div class="modal-card wide pj-card" role="dialog" aria-modal="true" aria-labelledby="lpTitle">
  <div class="modal-head"><h2 id="lpTitle">projects</h2><button class="btn icon" data-lp="close" title="Close">×</button></div>
  <div class="pj-body"></div>
</div>`;
document.body.append(modal);
const body = modal.querySelector('.pj-body');
const isOpen = () => !modal.classList.contains('hidden');
function open(){ modal.classList.remove('hidden'); saveNow(); refresh(); }
function close(){ modal.classList.add('hidden'); }
modal.addEventListener('mousedown', e => { if (e.target === modal) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen() && !body.querySelector('.pj-rename')) close(); });

function ago(ts){
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const units = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2592000], ['year', 31536000]];
  let pick = units[0];
  for (const u of units) if (s >= u[1] * 0.95) pick = u;
  return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-Math.max(1, Math.round(s / pick[1])), pick[0]);
}
// The tile shows the project's own page background; only safe CSS values are used
const tileBg = bg => /^[#a-z0-9(),.%\s-]+$/i.test(bg || '') ? bg : '#18181b';

let list = [];
async function refresh(){
  list = (await getAll()).sort((a, b) => b.updated - a.updated);
  render();
}
function render(){
  const rows = list.map(p => `<li class="pj-row${p.id === currentId ? ' current' : ''}" data-id="${esc(p.id)}">
      <button class="pj-open" data-lp="open" title="Open">
        <span class="lp-tile" style="background:${esc(tileBg(p.bg))}" aria-hidden="true"></span>
        <span class="lp-text"><span class="pj-name" data-no-i18n>${esc(p.name)}</span>
        <span class="pj-meta">${p.id === currentId ? `<em>${esc(t('open now'))}</em> · ` : ''}${esc(t(ago(p.updated)))} · ${esc(t(`${p.count ?? 0} element${p.count === 1 ? '' : 's'}`))}</span></span>
      </button>
      <span class="pj-tools">
        <button class="btn" data-lp="rename">rename</button>
        <button class="btn" data-lp="dup">duplicate</button>
        <button class="btn pj-del" data-lp="del">delete</button>
      </span>
    </li>`).join('');
  body.innerHTML = `<div class="pj-bar">
      <div class="pj-state"><span class="pj-dot on"></span>Saved on this device automatically</div>
      <div class="pj-actions"><button class="btn" data-lp="cloud">☁ cloud projects</button><button class="btn primary" data-lp="new">+ new project</button></div>
    </div>
    ${list.length ? `<ul class="pj-list">${rows}</ul>` : '<div class="pj-empty">loading…</div>'}`;
}
body.addEventListener('click', e => {
  const b = e.target.closest('[data-lp]'); if (!b) return;
  const act = b.dataset.lp, row = b.closest('.pj-row'), id = row?.dataset.id, item = list.find(p => p.id === id);
  if (act === 'new') { startNew().then(close); }
  else if (act === 'cloud') { close(); cloud.open(); }
  else if (act === 'open') openLocal(id);
  else if (act === 'dup') duplicateLocal(id);
  else if (act === 'del') deleteLocal(id, item?.name || 'project');
  else if (act === 'rename' && item) {
    const nameEl = row.querySelector('.pj-name'), input = document.createElement('input');
    input.className = 'pj-rename'; input.value = item.name; input.maxLength = 60;
    nameEl.replaceWith(input); row.querySelector('.pj-open').dataset.lp = '';
    input.addEventListener('click', ev => ev.stopPropagation());
    input.focus(); input.select();
    let done = false;
    const finish = ok => { if (done) return; done = true; ok && cleanName(input.value) !== item.name ? renameLocal(id, input.value) : render(); };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }
});
modal.querySelector('[data-lp="close"]').onclick = close;

/* ── Title-bar entry: "projects" opens this list ── */
function mountButton(){
  const menu = document.querySelector('.tb-menu');
  if (!menu || menu.querySelector('[data-lp-menu]')) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'projects'; btn.dataset.lpMenu = ''; btn.title = 'Your projects';
  btn.addEventListener('click', open);
  menu.append(btn);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton); else mountButton();

export const localProjects = { open, startNew };
