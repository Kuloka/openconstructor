// Version history: automatic local snapshots of { items, page, name } per project.
// Stored in IndexedDB ('oc-history'), falling back to localStorage when IndexedDB is unavailable.
// Snapshots: after edits (debounced, at most one per 2 minutes), on page close, before a restore,
// and manually with an optional label. Up to 60 per project, thinned out with age.
import { studio } from './studio.js';
import { t, lang } from './i18n.js';
import './versions.css';

const DB_NAME = 'oc-history', STORE = 'snapshots';
const LS_PREFIX = 'oc-history:', PENDING_KEY = 'oc-history-pending';
const MIN_GAP = 2 * 60e3;          // min time between automatic snapshots
const DEBOUNCE = 4000;             // wait for edits to settle
const MAX_VERSIONS = 60;
const MAX_IMAGES = 3 * 1024 * 1024; // embedded data:image bytes per snapshot
const HOUR = 36e5, DAY = 864e5;
const IMG_RE = /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number.isFinite(+v) ? +v : 0;

// cyrb53 — fast non-cryptographic string hash, enough to detect "nothing changed"
function hash(str){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length;
}

/* ── storage ─────────────────────────────────────────────── */
let dbPromise = null, fallback = false;
const lastCache = new Map(); // project -> { hash, t } of its newest snapshot
function openDB(){
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('project', 'project'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IndexedDB open failed'));
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise;
}
function txDone(t){ return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('transaction failed')); }); }
const idb = {
  async list(project){
    const db = await openDB();
    return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).index('project').getAll(project); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
  },
  async put(rec){ const db = await openDB(); const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(rec); return txDone(t); },
  async del(project, ids){ const db = await openDB(); const t = db.transaction(STORE, 'readwrite'); const s = t.objectStore(STORE); ids.forEach(id => s.delete(id)); return txDone(t); },
};
const ls = {
  read(project){ try { return JSON.parse(localStorage.getItem(LS_PREFIX + project)) || []; } catch { return []; } },
  write(project, list){
    // on quota errors drop the oldest automatic snapshots until it fits
    const sorted = [...list].sort((a, b) => b.t - a.t);
    for (;;) {
      try { localStorage.setItem(LS_PREFIX + project, JSON.stringify(sorted)); return; }
      catch (e) { const i = sorted.findLastIndex(v => !v.manual); if (sorted.length <= 1 || i < 0) throw e; sorted.splice(i, 1); }
    }
  },
  async list(project){ return ls.read(project); },
  async put(rec){ ls.write(rec.project, [...ls.read(rec.project).filter(v => v.id !== rec.id), rec]); },
  async del(project, ids){ const set = new Set(ids); ls.write(project, ls.read(project).filter(v => !set.has(v.id))); },
};
async function run(op, ...args){
  if (!fallback) {
    try { return await idb[op](...args); }
    catch (e) { console.warn('[versions] IndexedDB unavailable, using localStorage:', e); fallback = true; }
  }
  return ls[op](...args);
}

/** All versions of a project, newest first. */
export async function listVersions(project = studio.name()){
  const list = (await run('list', project)).sort((a, b) => b.t - a.t);
  if (list[0]) lastCache.set(project, { hash: list[0].hash, t: list[0].t });
  else lastCache.delete(project);
  return list;
}

// Keep everything from the last hour, then the newest per hour for a day, then the newest per day.
// Manual versions are never thinned; the 60 cap removes the oldest automatic ones first.
function thinned(list, now = Date.now()){
  const keep = [], seen = new Set();
  for (const v of list) { // newest first
    const age = now - v.t;
    if (v.manual || age < HOUR) { keep.push(v); continue; }
    const d = new Date(v.t);
    const bucket = age < DAY ? 'h' + Math.floor(v.t / HOUR) : `d${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (seen.has(bucket)) continue;
    seen.add(bucket); keep.push(v);
  }
  while (keep.length > MAX_VERSIONS) {
    const i = keep.findLastIndex(v => !v.manual);
    keep.splice(i >= 0 ? i : keep.length - 1, 1);
  }
  return keep;
}
async function prune(project){
  const list = await listVersions(project);
  const keep = new Set(thinned(list).map(v => v.id));
  const drop = list.filter(v => !keep.has(v.id)).map(v => v.id);
  if (drop.length) await run('del', project, drop);
}

/* ── capture ─────────────────────────────────────────────── */
function capture(){
  const data = { items: studio.items(), page: studio.page(), name: studio.name() };
  let json = JSON.stringify(data), omitted = 0;
  const imgs = json.match(IMG_RE) || [];
  let total = imgs.reduce((n, s) => n + s.length, 0);
  if (total > MAX_IMAGES) {
    // drop the largest embedded images first until the rest fits
    for (const s of [...new Set(imgs)].sort((a, b) => b.length - a.length)) {
      if (total <= MAX_IMAGES) break;
      const parts = json.split(s);
      total -= s.length * (parts.length - 1); omitted += parts.length - 1;
      json = parts.join(BLANK_IMG);
    }
  }
  return { json, omitted, count: data.items.length, project: data.name };
}
function makeRecord(cap, { label = '', manual = false } = {}){
  const t = Date.now();
  return {
    id: `${t.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    project: cap.project, t, label: String(label || '').trim().slice(0, 80), manual,
    hash: hash(cap.json), size: cap.json.length, count: cap.count, omitted: cap.omitted,
    data: JSON.parse(cap.json),
  };
}

let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));

async function lastInfo(project){
  if (!lastCache.has(project)) await listVersions(project);
  return lastCache.get(project) || null;
}

/**
 * Take a snapshot of the current page now (ignores the 2-minute gap).
 * Skipped when identical to the newest snapshot, or when the page is empty (unless manual).
 * Resolves to the stored record, or null when skipped.
 */
export function snapshot({ label = '', manual = false } = {}){
  return serial(async () => {
    const cap = capture();
    if (!cap.count && !manual) return null;
    const rec = makeRecord(cap, { label, manual });
    const last = await lastInfo(cap.project);
    if (last && last.hash === rec.hash && !manual) return null;
    if (last && last.hash === rec.hash && manual && !rec.label) return null;
    await run('put', rec);
    lastCache.set(cap.project, { hash: rec.hash, t: rec.t });
    await prune(cap.project);
    if (cap.omitted) studio.status(`version saved without ${cap.omitted} image${cap.omitted > 1 ? 's' : ''} · images over 3 MB are not kept in history`, 'warn');
    if (isOpen()) refresh();
    return rec;
  });
}
/** Manual "save version" with an optional label. */
export const saveVersion = (label = '') => snapshot({ label, manual: true });

// automatic: debounce edits, then snapshot when ≥ 2 min since the project's last snapshot
let timer = 0;
async function tick(){
  timer = 0;
  try {
    const last = await lastInfo(studio.name());
    const wait = last ? last.t + MIN_GAP - Date.now() : 0;
    if (wait > 0) { timer = setTimeout(tick, wait + 50); return; }
    await snapshot();
  } catch (e) { console.warn('[versions] snapshot failed:', e); }
}
function schedule(){ if (timer) clearTimeout(timer); timer = setTimeout(tick, DEBOUNCE); }
window.addEventListener('oc:changed', schedule);

// on close: write synchronously to localStorage as "pending" (IndexedDB may not finish in time),
// also try IndexedDB directly; pending records are merged on the next start.
window.addEventListener('beforeunload', () => {
  try {
    const cap = capture();
    if (!cap.count) return;
    const rec = makeRecord(cap, { label: '' });
    if (lastCache.get(cap.project)?.hash === rec.hash) return;
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(rec)); } catch {}
    if (!fallback) idb.put(rec).catch(() => {});
    else ls.put(rec).catch(() => {});
  } catch {}
});
async function flushPending(){
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch {}
  if (!rec?.id || !rec.project) return;
  await serial(async () => {
    const list = await listVersions(rec.project);
    if (!list.some(v => v.id === rec.id) && list[0]?.hash !== rec.hash) { await run('put', rec); await prune(rec.project); await listVersions(rec.project); }
  });
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}
flushPending().catch(e => console.warn('[versions] pending merge failed:', e)).finally(schedule);

/** Restore a version (one undo step). The current state is snapshotted first, so it is reversible. */
export async function restoreVersion(id, project = studio.name()){
  const v = (await listVersions(project)).find(x => x.id === id);
  if (!v) throw new Error('version not found');
  await snapshot({ label: 'before restore' });
  studio.load(structuredClone(v.data));
  studio.status(`restored version from ${when(v.t)} · Ctrl+Z to undo`, 'ok');
  return v;
}
/** Delete a version. */
export async function deleteVersion(id, project = studio.name()){
  await serial(async () => { await run('del', project, [id]); await listVersions(project); });
}
/** Which storage is in use: 'indexeddb' or 'localStorage'. */
export const storageBackend = () => fallback ? 'localStorage' : 'indexeddb';

/* ── formatting ──────────────────────────────────────────── */
function when(t){
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : lang, { hour: '2-digit', minute: '2-digit' });
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / DAY);
  if (diff === 0) return `today ${hm}`;
  if (diff === 1) return `yesterday ${hm}`;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString(lang === 'en' ? 'en-US' : lang, opts)}, ${hm}`;
}
function bytes(n){ return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ── preview: items placed absolutely, each in its own shadow root (styles don't leak) ── */
function previewDoc(data){
  const pg = data.page || {}, w = num(pg.w) || 1440, h = num(pg.h) || 900;
  const bg = String(pg.bg || '#0c0a09').replace(/[<>{};]/g, '');
  const hosts = (data.items || []).map((it, i) => `<div class="h" data-i="${i}" style="left:${it.full ? 0 : num(it.x)}px;top:${num(it.y)}px;z-index:${i + 1}"></div>`).join('');
  return `<!doctype html><html><head>${CSP}<meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;overflow:hidden}body{position:relative;width:${w}px;min-height:${h}px;background:${bg};color:#eee;font-family:system-ui}.h{position:absolute}</style></head><body>${hosts}</body></html>`;
}
function fillPreview(frame, data){
  const doc = frame.contentDocument; if (!doc) return;
  const pg = data.page || {}, w = num(pg.w) || 1440;
  const theme = pg.themeCss ? `<style>${pg.themeCss}</style>` : '';
  doc.querySelectorAll('.h').forEach(host => {
    const it = data.items[+host.dataset.i]; if (!it) return;
    const box = it.full ? `width:${w}px;padding:0` : `width:max-content;max-width:${w - 32}px;padding:16px`;
    const css = `<style>:host{display:block;color:#eee;font-family:system-ui}button{white-space:nowrap}#__root{display:inline-block;box-sizing:border-box;${box}}</style>`;
    let root = host;
    try { root = host.shadowRoot || host.attachShadow({ mode: 'open' }); } catch {}
    root.innerHTML = css + theme + `<div id="__root">${it.code || ''}</div>`;
  });
}

/* ── UI ──────────────────────────────────────────────────── */
const btn = document.createElement('button');
btn.type = 'button'; btn.id = 'historyBtn'; btn.textContent = 'history'; btn.title = 'Version history: restore earlier states of this page';
document.querySelector('.tb-menu')?.append(btn);

const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'versionsModal';
modal.innerHTML = `<div class="modal-card vh-card" role="dialog" aria-modal="true" aria-labelledby="vhTitle">
  <div class="modal-head"><h2 id="vhTitle">version history</h2><span class="vh-project" id="vhProject"></span><button class="btn icon" type="button" data-vh-close aria-label="Close">×</button></div>
  <form class="vh-save" id="vhSave" autocomplete="off">
    <input id="vhLabel" maxlength="80" spellcheck="false" placeholder="label for this version (optional)" aria-label="Version label">
    <button class="btn primary" type="submit">save current version</button>
  </form>
  <div class="vh-body">
    <ul class="vh-list" id="vhList" role="listbox" tabindex="0" aria-label="Versions"></ul>
    <div class="vh-side">
      <div class="vh-preview" id="vhPreview"><iframe sandbox="allow-same-origin" tabindex="-1" referrerpolicy="no-referrer" title="Version preview"></iframe><div class="vh-preview-empty" id="vhPreviewEmpty">no version selected</div></div>
      <div class="vh-info" id="vhInfo"></div>
      <div class="vh-actions"><button class="btn vh-del" type="button" id="vhDelete">delete</button><button class="btn primary" type="button" id="vhRestore">restore</button></div>
    </div>
  </div>
  <div class="vh-foot">Saved on this device · automatically every 2 min while you edit and when you close the tab · up to ${MAX_VERSIONS} per project</div>
</div>`;
document.body.append(modal);

const $ = sel => modal.querySelector(sel);
const listEl = $('#vhList'), frame = $('#vhPreview iframe'), emptyEl = $('#vhPreviewEmpty'), infoEl = $('#vhInfo');
const restoreBtn = $('#vhRestore'), deleteBtn = $('#vhDelete'), labelInput = $('#vhLabel');
let versions = [], selectedId = null, previewSeq = 0, delArmed = 0;

const isOpen = () => !modal.classList.contains('hidden');
export function openHistory(){ modal.classList.remove('hidden'); $('#vhProject').textContent = studio.name(); selectedId = null; refresh(); requestAnimationFrame(() => listEl.focus()); }
export function closeHistory(){ modal.classList.add('hidden'); frame.srcdoc = ''; }
btn.addEventListener('click', openHistory);
$('[data-vh-close]').addEventListener('click', closeHistory);
modal.addEventListener('click', e => { if (e.target === modal) closeHistory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); closeHistory(); } }, true);

async function refresh(){
  try { versions = await listVersions(studio.name()); }
  catch (e) { versions = []; studio.status('could not read version history', 'error'); }
  if (!versions.some(v => v.id === selectedId)) selectedId = versions[0]?.id || null;
  renderList(); showSelected();
}
function renderList(){
  if (!versions.length) { listEl.innerHTML = '<li class="vh-empty">No versions yet.<br>They appear automatically as you edit, or save one above.</li>'; return; }
  listEl.innerHTML = versions.map(v => `<li class="vh-row${v.id === selectedId ? ' sel' : ''}${v.manual ? ' manual' : ''}" role="option" aria-selected="${v.id === selectedId}" data-id="${esc(v.id)}">
    <span class="vh-when">${esc(when(v.t))}</span>${v.label ? `<span class="vh-label">${esc(v.label)}</span>` : ''}
    <span class="vh-meta">${t(plural(v.count, 'element'))} · ${bytes(v.size)}${v.omitted ? ' · <em>images omitted</em>' : ''}</span></li>`).join('');
}
function showSelected(){
  const v = versions.find(x => x.id === selectedId);
  restoreBtn.disabled = deleteBtn.disabled = !v; disarmDelete();
  listEl.querySelectorAll('.vh-row').forEach(r => { const on = r.dataset.id === selectedId; r.classList.toggle('sel', on); r.setAttribute('aria-selected', on); });
  listEl.querySelector('.vh-row.sel')?.scrollIntoView({ block: 'nearest' });
  if (!v) { frame.srcdoc = ''; frame.style.visibility = 'hidden'; emptyEl.hidden = false; infoEl.textContent = ''; return; }
  emptyEl.hidden = true;
  const pg = v.data.page || {};
  infoEl.innerHTML = `<b>${esc(when(v.t))}</b>${v.label ? ` · ${esc(v.label)}` : ''}<br><span>${t(plural(v.count, 'element'))} · ${num(pg.w) || 1440}×${num(pg.h) || 900} · ${bytes(v.size)}${v.manual ? ' · saved manually' : ''}</span>`;
  renderPreview(v);
}
function renderPreview(v){
  const seq = ++previewSeq, pg = v.data.page || {}, w = num(pg.w) || 1440, h = num(pg.h) || 900;
  frame.style.visibility = 'hidden';
  frame.onload = () => {
    if (seq !== previewSeq) return;
    try { fillPreview(frame, v.data); } catch {}
    const fit = () => {
      if (seq !== previewSeq) return;
      let H = h;
      try { H = Math.min(6000, Math.max(h, frame.contentDocument.documentElement.scrollHeight)); } catch {}
      const box = frame.parentElement, bw = box.clientWidth, bh = box.clientHeight;
      const s = Math.min(bw / w, bh / H);
      frame.style.width = w + 'px'; frame.style.height = H + 'px';
      frame.style.transform = `translate(${Math.max(0, (bw - w * s) / 2)}px, ${Math.max(0, (bh - H * s) / 2)}px) scale(${s})`;
      frame.style.visibility = 'visible';
    };
    requestAnimationFrame(fit); setTimeout(fit, 400);
  };
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  frame.srcdoc = previewDoc(v.data);
}
function select(id){ if (id && id !== selectedId) { selectedId = id; showSelected(); } }
listEl.addEventListener('click', e => { const r = e.target.closest('.vh-row'); if (r) select(r.dataset.id); });
listEl.addEventListener('dblclick', e => { if (e.target.closest('.vh-row')) restoreBtn.click(); });
listEl.addEventListener('keydown', e => {
  const i = versions.findIndex(v => v.id === selectedId);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = versions[Math.max(0, Math.min(versions.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) select(n.id); }
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const n = versions[e.key === 'Home' ? 0 : versions.length - 1]; if (n) select(n.id); }
  else if (e.key === 'Enter' && selectedId) { e.preventDefault(); restoreBtn.click(); }
  else if (e.key === 'Delete' && selectedId) { e.preventDefault(); deleteBtn.click(); }
});

restoreBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  restoreBtn.disabled = true;
  try { await restoreVersion(selectedId); closeHistory(); }
  catch (e) { studio.status('restore failed: ' + (e?.message || e), 'error'); }
  finally { restoreBtn.disabled = false; }
});
function disarmDelete(){ clearTimeout(delArmed); delArmed = 0; deleteBtn.textContent = 'delete'; deleteBtn.classList.remove('armed'); }
deleteBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  if (!delArmed) { deleteBtn.textContent = 'confirm delete'; deleteBtn.classList.add('armed'); delArmed = setTimeout(disarmDelete, 3000); return; }
  disarmDelete();
  const i = versions.findIndex(v => v.id === selectedId);
  try { await deleteVersion(selectedId); selectedId = (versions[i + 1] || versions[i - 1])?.id || null; await refresh(); studio.status('version deleted'); }
  catch (e) { studio.status('could not delete version', 'error'); }
});
$('#vhSave').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const rec = await saveVersion(labelInput.value);
    if (rec) { labelInput.value = ''; selectedId = rec.id; await refresh(); studio.status('version saved', 'ok'); }
    else studio.status('no changes since the last version');
  } catch (err) { studio.status('could not save version: ' + (err?.message || err), 'error'); }
});
