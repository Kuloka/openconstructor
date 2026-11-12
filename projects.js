// Cloud projects: signed-in users keep many projects in Supabase and open them anywhere.
// Local editing (localStorage) always keeps working; the cloud is a mirror of the current
// project once it is linked to a row (id remembered in localStorage `oc-cloud-id`).
// Table + policies: supabase/projects.sql
import { supabase, openAuth } from './auth.js';
import * as auth from './auth.js';
import { studio } from './studio.js';
import { t, lang } from './i18n.js';
import { track } from './track.js';
import './projects.css';

const LINK = 'oc-cloud-id', LINK_OWNER = 'oc-cloud-owner';
const DEBOUNCE = 2000, MAX_BYTES = 1_900_000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const me = () => auth.user;                     // live binding from auth.js
const cleanName = s => (String(s || '').trim().slice(0, 120) || 'untitled');

/* ── Link between the open project and a cloud row ───────── */
let linkedId = ls.get(LINK);
function link(id){ linkedId = id || null; ls.set(LINK, linkedId); ls.set(LINK_OWNER, linkedId ? me()?.id : null); }
function checkOwner(){
  // Another account signed in on this browser: the old link isn't theirs
  const owner = ls.get(LINK_OWNER), u = me();
  if (linkedId && u && owner && owner !== u.id) { link(null); lastSaved = ''; }
}

const snapshot = () => ({ items: studio.items(), page: studio.page() });
const fingerprint = (name, data) => name + '\u0000' + JSON.stringify(data);

/* ── Autosave ────────────────────────────────────────────── */
let lastSaved = '', timer = 0, saving = null, again = false, retryTimer = 0;
const canSync = () => !!(supabase && me() && linkedId);

function schedule(delay = DEBOUNCE){
  if (!canSync()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { save().catch(() => {}); }, delay);
}

// Saves the current project to its linked row. If the row is gone (deleted elsewhere,
// or belongs to someone else) a new row is created and linked instead.
async function save({ force = false, quiet = false } = {}){
  if (!canSync()) return false;
  if (saving) { again = true; return saving; }
  clearTimeout(timer);
  const name = cleanName(studio.name()), data = snapshot(), fp = fingerprint(name, data);
  if (!force && fp === lastSaved) return true;
  if (fp.length > MAX_BYTES) { studio.status('project too large for cloud sync', 'error'); return false; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { if (!quiet) studio.status('offline · will sync to cloud when back', 'warn'); return false; }

  saving = (async () => {
    try {
      const { data: rows, error } = await supabase.from('projects').update({ name, data }).eq('id', linkedId).select('id');
      if (error) throw error;
      if (!rows?.length) {
        const { data: row, error: e2 } = await supabase.from('projects').insert({ name, data }).select('id').single();
        if (e2) throw e2;
        link(row.id);
      }
      lastSaved = fp;
      clearTimeout(retryTimer);
      if (!quiet) studio.status('saved to cloud', 'ok');
      if (!modal.classList.contains('hidden')) refresh();
      return true;
    } catch (e) {
      console.warn('[cloud] save failed', e);
      if (!quiet) studio.status('cloud save failed · will retry', 'warn');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => schedule(0), 30000);   // also retried on the next change
      return false;
    } finally {
      saving = null;
      if (again) { again = false; schedule(300); }
    }
  })();
  return saving;
}

window.addEventListener('oc:changed', () => schedule());
window.addEventListener('online', () => schedule(500));
const nameEl = document.getElementById('projectName');
nameEl?.addEventListener('input', () => schedule());
nameEl?.addEventListener('blur', () => schedule(300));
window.addEventListener('oc:auth', () => { checkOwner(); if (!modal.classList.contains('hidden')) render(); schedule(1000); });
if (supabase) setTimeout(() => { checkOwner(); schedule(1000); }, 1500);

/* ── Cloud operations ────────────────────────────────────── */
const errText = e => {
  const m = e?.message || String(e || '');
  if (/project limit/i.test(m)) return 'You have reached the limit of 100 cloud projects. Delete some to make room.';
  if (/projects_data_size/i.test(m)) return 'This project is too large to store in the cloud.';
  if (/relation .*projects.* does not exist|Could not find the table/i.test(m)) return 'Cloud projects are not set up on the server yet (run supabase/projects.sql).';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Network error: check your connection and try again.';
  return m || 'Something went wrong';
};

async function createFromCurrent(){
  const name = cleanName(studio.name()), data = snapshot();
  const { data: row, error } = await supabase.from('projects').insert({ name, data }).select('id').single();
  if (error) throw error;
  link(row.id); lastSaved = fingerprint(name, data);
  return row.id;
}

// Before replacing the open project: push it to the cloud so nothing is lost.
// Linked → save now. Unlinked with content → save as a new cloud project.
async function secureCurrent(){
  if (linkedId) {
    const ok = await save({ force: false });
    if (ok) return true;
    return confirm('The current project could not be saved to the cloud (its latest changes are still on this device only and will be replaced). Continue anyway?');
  }
  if (!studio.items().length) return true;
  try { await createFromCurrent(); studio.status('current project saved to cloud', 'ok'); return true; }
  catch (e) { return confirm(`Couldn't save the current page to the cloud: ${errText(e)}\n\nOpen anyway and replace the current page?`); }
}

async function openProject(id){
  if (id === linkedId) { close(); return; }
  setBusy(true);
  try {
    if (!(await secureCurrent())) return;
    const { data: row, error } = await supabase.from('projects').select('id,name,data').eq('id', id).single();
    if (error) throw error;
    const d = row.data || {};
    window.dispatchEvent(new CustomEvent('oc:before-replace'));
    link(row.id);
    studio.load({ items: Array.isArray(d.items) ? d.items : [], page: d.page && typeof d.page === 'object' ? d.page : undefined, name: row.name });
    lastSaved = fingerprint(cleanName(studio.name()), snapshot());
    window.dispatchEvent(new CustomEvent('oc:replaced'));
    studio.status(`opened "${row.name}" from cloud`, 'ok');
    close();
  } catch (e) { flash(errText(e)); }
  finally { setBusy(false); }
}

async function newProject(){
  setBusy(true);
  try {
    if (!(await secureCurrent())) return;
    window.dispatchEvent(new CustomEvent('oc:before-replace'));
    link(null); lastSaved = '';
    studio.load({ items: [], name: 'untitled' });
    window.dispatchEvent(new CustomEvent('oc:replaced'));
    try { await createFromCurrent(); studio.status('new cloud project created', 'ok'); }
    catch (e) { studio.status('new project (local only)', 'warn'); flash(errText(e)); return; }
    close();
  } finally { setBusy(false); }
}

async function saveCurrent(){
  setBusy(true);
  try {
    if (linkedId) { if (!(await save({ force: true }))) flash('Could not save right now. Your work is safe on this device; we will retry.'); }
    else { await createFromCurrent(); studio.status('saved to cloud', 'ok'); }
    await refresh();
  } catch (e) { flash(errText(e)); }
  finally { setBusy(false); }
}

async function renameProject(id, name){
  name = cleanName(name);
  const { error } = await supabase.from('projects').update({ name }).eq('id', id);
  if (error) return flash(errText(error));
  if (id === linkedId) {
    const el = document.getElementById('projectName');
    if (el) el.textContent = name;
    try { localStorage.setItem('oc-name', JSON.stringify(name)); } catch {}
    lastSaved = fingerprint(name, snapshot());
  }
  refresh();
}

async function duplicateProject(id){
  setBusy(true);
  try {
    const { data: row, error } = await supabase.from('projects').select('name,data,thumbnail').eq('id', id).single();
    if (error) throw error;
    const { error: e2 } = await supabase.from('projects').insert({ name: cleanName(row.name + ' copy'), data: row.data, thumbnail: row.thumbnail });
    if (e2) throw e2;
    await refresh();
  } catch (e) { flash(errText(e)); }
  finally { setBusy(false); }
}

async function deleteProject(id, name){
  if (!confirm(`Delete "${name}" from the cloud? This can't be undone.${id === linkedId ? '\n\nIt is open right now — the page stays on this device, it just stops syncing.' : ''}`)) return;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return flash(errText(error));
  if (id === linkedId) { link(null); lastSaved = ''; }
  refresh();
}

/* ── Modal ───────────────────────────────────────────────── */
const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'projectsModal';
modal.innerHTML = `<div class="modal-card wide pj-card" role="dialog" aria-modal="true" aria-labelledby="pjTitle">
  <div class="modal-head"><h2 id="pjTitle">cloud projects</h2><button class="btn icon" data-pj-close title="Close">×</button></div>
  <div class="pj-body"></div>
</div>`;
document.body.append(modal);
const body = modal.querySelector('.pj-body');
modal.querySelector('[data-pj-close]').onclick = () => close();
modal.addEventListener('mousedown', e => { if (e.target === modal) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden') && !body.querySelector('.pj-rename')) close(); });

let list = [], loading = false, error = '';
function open(){ modal.classList.remove('hidden'); checkOwner(); render(); refresh(); }
function close(){ modal.classList.add('hidden'); }
function setBusy(on){ modal.querySelector('.pj-card').classList.toggle('busy', on); body.querySelectorAll('button').forEach(b => b.disabled = on); }
function flash(text){ error = text; renderMsg(); }
function renderMsg(){ const el = body.querySelector('.pj-msg'); if (el) { el.textContent = error; el.classList.toggle('hidden', !error); } }

function ago(ts){
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return 'just now';
  const units = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2592000], ['year', 31536000]];
  let pick = units[0];
  for (const u of units) if (s >= u[1] * 0.95) pick = u;
  const n = Math.max(1, Math.round(s / pick[1]));
  return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-n, pick[0]);
}

async function refresh(){
  if (!supabase || !me()) return render();
  loading = true; render();
  const { data, error: e } = await supabase.from('projects').select('id,name,updated_at,item_count').order('updated_at', { ascending: false }).limit(100);
  loading = false;
  if (e) { list = []; error = errText(e); }
  else { list = data || []; if (error && !/limit|large/i.test(error)) error = ''; }
  render();
}

function render(){
  if (!supabase) {
    body.innerHTML = `<p>Accounts are not configured on this site, so cloud projects are unavailable. Your work is saved in this browser.</p>`;
    return;
  }
  if (!me()) {
    body.innerHTML = `<div class="pj-intro">
      <p>Keep as many projects as you like in the cloud and open them on any device. Projects sync automatically while you work.</p>
      <ul><li>up to 100 projects per account</li><li>autosave every couple of seconds</li><li>your current page stays in this browser either way</li></ul>
      <div class="modal-actions"><button class="btn" data-pj="signin">sign in</button><button class="btn primary" data-pj="signup">create a free account</button></div>
    </div>`;
    return;
  }
  const current = list.find(p => p.id === linkedId);
  const head = `<div class="pj-bar">
    <div class="pj-state">${linkedId
      ? `<span class="pj-dot on"></span>current page syncs to <b>${esc(current?.name || studio.name())}</b>`
      : `<span class="pj-dot"></span>current page is stored only in this browser`}</div>
    <div class="pj-actions"><button class="btn" data-pj="save">${linkedId ? 'save now' : 'save current to cloud'}</button><button class="btn primary" data-pj="new">+ new project</button></div>
  </div>
  <p class="pj-msg${error ? '' : ' hidden'}">${esc(error)}</p>`;
  const rows = list.map(p => `<li class="pj-row${p.id === linkedId ? ' current' : ''}" data-id="${esc(p.id)}">
      <button class="pj-open" data-pj="open" title="Open">
        <span class="pj-name" data-no-i18n>${esc(p.name)}</span>
        <span class="pj-meta">${p.id === linkedId ? '<em>open</em> · ' : ''}${esc(t(ago(p.updated_at)))} · ${esc(t(`${p.item_count ?? 0} element${p.item_count === 1 ? '' : 's'}`))}</span>
      </button>
      <span class="pj-tools">
        <button class="btn" data-pj="rename">rename</button>
        <button class="btn" data-pj="dup">duplicate</button>
        <button class="btn pj-del" data-pj="del">delete</button>
      </span>
    </li>`).join('');
  const empty = loading ? '<div class="pj-empty">loading…</div>' : '<div class="pj-empty">No cloud projects yet. Save the current page or start a new project.</div>';
  body.innerHTML = head + (list.length ? `<ul class="pj-list">${rows}</ul><div class="pj-count">${list.length} / 100 projects</div>` : empty);
}

body.addEventListener('click', e => {
  const b = e.target.closest('[data-pj]'); if (!b || b.disabled) return;
  const act = b.dataset.pj, row = b.closest('.pj-row'), id = row?.dataset.id;
  const item = list.find(p => p.id === id);
  error = ''; renderMsg();
  if (act === 'signin' || act === 'signup') { close(); openAuth(act); }
  else if (act === 'save') saveCurrent();
  else if (act === 'new') newProject();
  else if (act === 'open') openProject(id);
  else if (act === 'dup') duplicateProject(id);
  else if (act === 'del') deleteProject(id, item?.name || 'project');
  else if (act === 'rename') startRename(row, item);
});

function startRename(row, item){
  if (!row || !item) return;
  const nameEl = row.querySelector('.pj-name');
  const input = document.createElement('input');
  input.className = 'pj-rename'; input.value = item.name; input.maxLength = 120;
  nameEl.replaceWith(input);
  const openBtn = row.querySelector('.pj-open'); openBtn.dataset.pj = '';
  input.addEventListener('click', e => e.stopPropagation());
  input.focus(); input.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = cleanName(input.value);
    if (ok && v !== item.name) { item.name = v; renameProject(item.id, v); }
    render();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
}

/* ── "Only in this browser" nudge ────────────────────────────
   Signed-out visitors keep their page in localStorage only. Once they have made something
   (a second AI result, or a few elements on the page) a card says so and offers a free account;
   right after signing up the page is saved to the cloud. Closing it hides it for this visit. */
const NUDGE_OFF = 'oc-local-nudge-off';
let nudgeEl = null, generated = 0, wantsCloud = false;
const nudgeHidden = () => { try { return sessionStorage.getItem(NUDGE_OFF) === '1'; } catch { return false; } };
function hideNudge(forever){
  if (forever) { try { sessionStorage.setItem(NUDGE_OFF, '1'); } catch {} }
  if (!nudgeEl) return;
  const el = nudgeEl; nudgeEl = null;
  el.classList.add('out'); setTimeout(() => el.remove(), 220);
}
function maybeNudge(){
  if (nudgeEl || !supabase || me() || nudgeHidden() || !studio.items().length) return;
  if (generated < 2 && studio.items().length < 3) return;
  const box = document.querySelector('.toasts');
  if (!box || !document.getElementById('authModal')?.classList.contains('hidden')) return;
  track('signup_prompt');
  nudgeEl = document.createElement('div');
  nudgeEl.className = 'toast warn local-nudge';
  nudgeEl.innerHTML = `<i aria-hidden="true"></i><span><b>${esc(t('This page is saved only in this browser.'))}</b> ${esc(t('Clearing the browser or switching devices loses it. A free account keeps it in the cloud and lets you publish it.'))}<span class="local-nudge-row"><button class="btn primary" type="button" data-nudge-save>${esc(t('save to cloud'))}</button></span></span><button type="button" data-nudge-x aria-label="${esc(t('close'))}">×</button>`;
  nudgeEl.addEventListener('click', e => {
    if (e.target.closest('[data-nudge-x]')) return hideNudge(true);
    if (!e.target.closest('[data-nudge-save]')) return;
    track('signup_click'); wantsCloud = true; hideNudge(false);
    openAuth('signup');
    const m = document.getElementById('authMsg');
    if (m) { m.textContent = t('Your page will be saved to the cloud as soon as you are in — open it on any device, keep editing, publish by link.'); m.className = 'auth-msg'; }
  });
  box.append(nudgeEl);
}
window.addEventListener('oc:generated', () => { generated++; setTimeout(maybeNudge, 1500); });
window.addEventListener('oc:changed', () => { if (studio.items().length >= 3) setTimeout(maybeNudge, 1500); });
window.addEventListener('oc:auth', async e => {
  if (!e.detail) return;
  hideNudge(false);
  if (!wantsCloud) return;
  wantsCloud = false;
  if (linkedId || !studio.items().length) return;
  try { await createFromCurrent(); studio.status(t('current project saved to cloud'), 'ok'); }
  catch (err) { studio.status(errText(err), 'error'); }
});

export const projects = { open, save: () => save({ force: true }), linkedId: () => linkedId, unlink: () => { link(null); lastSaved = ''; } };
