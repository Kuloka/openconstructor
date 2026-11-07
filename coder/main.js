// openconstructor code: an AI coding agent working on a project folder in the browser.
// Explorer (left) · editor with tabs (centre) · agent chat with change cards (right).
import { t, lang, AI_LANG, langSelect } from '../i18n.js';
import '../studio.css';
import './code.css';
import logoSvg from '../src/logo.svg?raw';
import { PROVIDERS, byId, listModels, chat } from '../providers.js';
import * as vault from '../keyvault.js';
import * as auth from '../auth.js';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as T } from '@lezer/highlight';
import { diffLines } from 'diff';
import * as fs from './fs.js';
import { langName, langExtension } from './langs.js';
import { runAgent, countLines } from './agent.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
document.querySelectorAll('.oc-logo').forEach(el => el.innerHTML = logoSvg);
$('cxLangSel').append(langSelect('lang-select'));

let project = fs.emptyProject();
let openPath = null, tabs = [];
const changes = [];            // every edit the agent made: { id, path, before, after, added, removed, lang, isNew, status }
let history = [];              // earlier requests in this conversation, for context
let running = null;            // AbortController of the current run
let keys = {};

/* ── Status bar ── */
let stateTimer = 0;
function setState(text, kind = ''){
  const el = $('cxState'); el.className = 'sb-item sb-state ' + kind; el.innerHTML = `<i></i>${esc(text)}`;
  clearTimeout(stateTimer);
  if (kind && kind !== 'busy') stateTimer = setTimeout(() => setState('ready'), 5000);
}
function renderTotals(){
  const touched = new Set(), sum = { added: 0, removed: 0 };
  for (const e of project.files.values()) {
    if (e.text == null || e.text === e.base) continue;
    const c = countLines(e.base ?? '', e.text); sum.added += c.added; sum.removed += c.removed; touched.add(e.path);
  }
  $('cxTotals').innerHTML = touched.size ? `${t('unsaved')}: <span class="plus">+${sum.added}</span> <span class="minus">−${sum.removed}</span> · ${t(`${touched.size} ${touched.size === 1 ? 'file' : 'files'}`)}` : '';
  $('cxMode').textContent = !project.name ? '' : project.writable ? t('saving to disk') : t('read-only copy · changes download as .zip');
}

/* ── Editor ── */
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--subtle)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-2)' },
  '.cm-activeLine': { backgroundColor: '#ffffff06' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#e4572e33 !important' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: '#fbbf2433' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--panel-2)', border: 'none', color: 'var(--muted)' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', border: '1px solid var(--border-2)' },
}, { dark: true });
const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [T.keyword, T.modifier, T.controlKeyword, T.operatorKeyword], color: '#ff7a4d' },
  { tag: [T.string, T.special(T.string), T.regexp], color: '#a5d6a7' },
  { tag: [T.number, T.bool, T.null, T.atom], color: '#f9c97c' },
  { tag: [T.comment, T.lineComment, T.blockComment], color: '#6f6561', fontStyle: 'italic' },
  { tag: [T.function(T.variableName), T.function(T.propertyName)], color: '#8fc7ff' },
  { tag: [T.typeName, T.className, T.namespace], color: '#d7b4ff' },
  { tag: [T.propertyName, T.attributeName], color: '#f2c6b4' },
  { tag: [T.tagName, T.heading], color: '#ff9e7a', fontWeight: '600' },
  { tag: [T.definition(T.variableName)], color: '#f2ece9' },
  { tag: [T.meta, T.punctuation, T.bracket], color: '#948884' },
  { tag: T.link, color: '#8fc7ff', textDecoration: 'underline' },
]));
const langSlot = new Compartment();
const states = new Map();   // path → EditorState (keeps undo history per tab)
let applying = false;
const view = new EditorView({ parent: $('cxCm'), state: EditorState.create({ doc: '' }) });

function makeState(path, doc, ext){
  return EditorState.create({ doc, extensions: [
    basicSetup, theme, highlight, langSlot.of(ext || []),
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { saveFile(path); return true; } }]),
    EditorView.updateListener.of(u => {
      if (!u.docChanged || applying) return;
      const e = project.files.get(path); if (!e) return;
      e.text = u.state.doc.toString(); renderTabs(); renderTreeSoon(); renderTotals();
    }),
  ] });
}
async function openFile(path){
  const e = project.files.get(path); if (!e) return;
  if (e.binary) { setState(`${path}: ${t('binary or too large to open')}`, 'warn'); return; }
  let text; try { text = await fs.readText(project, path); } catch (err) { setState(err.message, 'error'); return; }
  if (openPath) states.set(openPath, view.state);
  let st = states.get(path);
  if (!st) st = makeState(path, text, await langExtension(path));
  else if (st.doc.toString() !== text) st = st.update({ changes: { from: 0, to: st.doc.length, insert: text } }).state;
  view.setState(st);
  openPath = path;
  if (!tabs.includes(path)) tabs.push(path);
  $('cxEmpty').classList.add('hidden');
  $('cxLang').textContent = `${langName(path)} · ${t(`${text.split('\n').length} lines`)}`;
  renderTabs(); renderTree();
}
// The working copy changed outside the editor (agent edit, reject): show it
function syncEditor(path){
  const e = project.files.get(path);
  if (path === openPath) {
    if (!e) { closeTab(path); return; }
    if (view.state.doc.toString() !== e.text) { applying = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: e.text } }); applying = false; }
  } else states.delete(path);
}
function closeTab(path){
  tabs = tabs.filter(p => p !== path); states.delete(path);
  if (openPath === path) { openPath = null; if (tabs.length) openFile(tabs.at(-1)); else { view.setState(EditorState.create({ doc: '' })); $('cxLang').textContent = ''; if (!project.name) $('cxEmpty').classList.remove('hidden'); } }
  renderTabs(); renderTree();
}
function renderTabs(){
  $('cxTabs').innerHTML = tabs.map(p => {
    const e = project.files.get(p), dirty = e && e.text != null && e.text !== e.base;
    return `<button class="cx-tab${p === openPath ? ' on' : ''}" data-tab="${esc(p)}" title="${esc(p)}">${dirty ? '<i class="dot"></i>' : ''}${esc(p.split('/').pop())}<span class="x" data-close-tab="${esc(p)}">×</span></button>`;
  }).join('');
}
$('cxTabs').onclick = e => {
  const x = e.target.closest('[data-close-tab]'); if (x) { e.stopPropagation(); closeTab(x.dataset.closeTab); return; }
  const tb = e.target.closest('[data-tab]'); if (tb) openFile(tb.dataset.tab);
};

/* ── Saving: accept / reject per file ── */
async function saveFile(path){
  const e = project.files.get(path); if (!e || e.text == null) return;
  try {
    await fs.writeToDisk(project, path);
    for (const c of changes) if (c.path === path && c.status === 'pending') c.status = 'accepted';
    setState(project.writable ? `${t('saved')} ${path}` : `${path}: ${t('kept in memory — download the .zip to get it')}`, 'ok');
  } catch (err) { setState(`${t('could not save')} ${path}: ${err.message}`, 'error'); }
  refreshAll();
}
function rejectFile(path){
  const e = project.files.get(path); if (!e) return;
  if (e.base === null) project.files.delete(path);   // a new file that was never saved
  else e.text = e.base;
  for (const c of changes) if (c.path === path && c.status === 'pending') c.status = 'rejected';
  syncEditor(path); refreshAll();
}
const pendingPaths = () => [...new Set(changes.filter(c => c.status === 'pending').map(c => c.path))];
async function acceptAll(){ for (const p of pendingPaths()) await saveFile(p); }
function rejectAll(){ for (const p of pendingPaths()) rejectFile(p); }
function refreshAll(){ renderTree(); renderTabs(); renderTotals(); renderChangesPanel(); renderCards(); }

function renderChangesPanel(){
  const paths = pendingPaths();
  const unsaved = fs.changedFiles(project).length;
  if (!paths.length && !(unsaved && !project.writable)) { $('cxChanges').innerHTML = ''; return; }
  const rows = paths.map(p => { const e = project.files.get(p); const c = countLines(e?.base ?? '', e?.text ?? ''); return `<div class="row" data-open="${esc(p)}"><span>${esc(p)}</span><span class="plus">+${c.added}</span><span class="minus">−${c.removed}</span></div>`; }).join('');
  $('cxChanges').innerHTML = `<h3><span>${t('changes to review')}</span><span>${paths.length}</span></h3>${rows}<div class="acts">${paths.length ? `<button class="btn primary" data-act="accept-all">${t('accept all')}</button><button class="btn" data-act="reject-all">${t('reject all')}</button>` : ''}${!project.writable && unsaved ? `<button class="btn" data-act="zip">⬇ .zip</button>` : ''}</div>`;
}
$('cxChanges').onclick = e => {
  const r = e.target.closest('[data-open]'); if (r) return openFile(r.dataset.open);
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'accept-all') acceptAll(); else if (a === 'reject-all') rejectAll(); else if (a === 'zip') fs.downloadChanges(project);
};

/* ── Explorer ── */
const openDirs = new Set(ls.get('oc-code-dirs', []));
let treeTimer = 0;
const renderTreeSoon = () => { clearTimeout(treeTimer); treeTimer = setTimeout(renderTree, 300); };
function renderTree(){
  if (!project.name) return;
  const root = { dirs: new Map(), files: [] };
  for (const p of [...project.files.keys()].sort()) {
    const parts = p.split('/'); let node = root;
    for (const d of parts.slice(0, -1)) { if (!node.dirs.has(d)) node.dirs.set(d, { dirs: new Map(), files: [] }); node = node.dirs.get(d); }
    node.files.push(p);
  }
  const out = [];
  const walk = (node, prefix, depth) => {
    for (const [name, sub] of [...node.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
      const path = prefix + name, open = openDirs.has(path);
      out.push(`<button class="cx-node" data-dir="${esc(path)}" style="--d:${depth}"><span class="ic">${open ? '▾' : '▸'}</span><span class="nm">${esc(name)}</span></button>`);
      if (open) walk(sub, path + '/', depth + 1);
    }
    for (const p of node.files) {
      const e = project.files.get(p), st = e.text == null || e.text === e.base ? '' : e.base == null ? '<span class="st a">A</span>' : '<span class="st m">M</span>';
      out.push(`<button class="cx-node${e.binary ? ' bin' : ''}${p === openPath ? ' open-file' : ''}" data-file="${esc(p)}" style="--d:${depth}" title="${esc(p)}"><span class="ic">·</span><span class="nm">${esc(p.split('/').pop())}</span>${st}</button>`);
    }
  };
  walk(root, '', 0);
  $('cxTree').innerHTML = out.join('') || `<p class="cx-hint">${t('This folder is empty.')}</p>`;
}
$('cxTree').onclick = e => {
  const d = e.target.closest('[data-dir]');
  if (d) { const p = d.dataset.dir; openDirs.has(p) ? openDirs.delete(p) : openDirs.add(p); ls.set('oc-code-dirs', [...openDirs].slice(-200)); renderTree(); return; }
  const f = e.target.closest('[data-file]'); if (f) openFile(f.dataset.file);
};

/* ── Opening a folder ── */
const hasUnsaved = () => fs.changedFiles(project).length > 0;
function useProject(p){
  project = p; tabs = []; openPath = null; states.clear(); changes.length = 0; history = [];
  $('cxProject').textContent = p.name;
  document.title = `${p.name} — openconstructor code`;
  $('cxEmpty').classList.add('hidden');
  // open the top-level folders that matter most
  for (const d of ['src', 'app', 'lib']) if ([...p.files.keys()].some(k => k.startsWith(d + '/'))) openDirs.add(d);
  renderTree(); renderTabs(); renderTotals(); renderChangesPanel();
  $('cxMessages').innerHTML = `<div class="message assistant welcome"><strong>${esc(p.name)} · ${t(`${p.files.size} files`)}${p.writable ? '' : ' · ' + t('read-only copy')}</strong><p>${t('Describe what to change. The agent reads the files it needs; you review every edit before it is saved.')}</p></div>`;
  const readme = [...p.files.keys()].find(k => /^readme\.md$/i.test(k));
  if (readme) openFile(readme);
  setState(`${t('opened')} ${p.name}`, 'ok');
}
async function openFolder(){
  if (hasUnsaved() && !confirm(t('There are unsaved changes in the current folder. Open another one anyway?'))) return;
  if (!fs.canWriteFolders()) { $('cxDirInput').click(); return; }
  try { setState(t('reading the folder…'), 'busy'); useProject(await fs.pickFolder()); }
  catch (err) { if (err.name !== 'AbortError') setState(err.message, 'error'); else setState('ready'); }
}
$('cxOpenBtn').onclick = $('cxOpenBig').onclick = openFolder;
$('cxDirInput').onchange = e => { if (e.target.files.length) useProject(fs.fromFileList(e.target.files)); e.target.value = ''; };
$('cxRefresh').onclick = async () => {
  if (!project.root) return;
  if (hasUnsaved() && !confirm(t('Reload from disk? Unsaved changes will be lost.'))) return;
  useProject(await fs.loadFolder(project.root));
};
if (!fs.canWriteFolders()) {
  $('cxNote').textContent = t('This browser cannot save into folders. You can open a read-only copy and download the changes as a .zip — or use Chrome or Edge for the full mode.');
  $('cxOpenBig').classList.add('hidden'); $('cxPickRO').classList.remove('hidden'); $('cxPickRO').classList.add('primary');
} else fs.recentFolder().then(h => {
  if (!h) return;
  const b = $('cxReopen'); b.textContent = `↺ ${t('reopen')} ${h.name}`; b.classList.remove('hidden');
  b.onclick = async () => { try { useProject(await fs.reopen(h)); } catch (err) { setState(err.message, 'error'); } };
});
addEventListener('beforeunload', e => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });

/* ── Models and keys ── */
const modelsBy = {};
let model = ls.get('oc-code-model', '') || ls.get('form-model', 'oc::auto');
async function loadModels(){
  const ps = PROVIDERS.filter(p => p.kind === 'proxy' || keys[p.id]);
  await Promise.all(ps.map(async p => { if (modelsBy[p.id]) return; try { modelsBy[p.id] = await listModels(p, keys[p.id]); } catch { modelsBy[p.id] = []; } }));
  renderModels();
}
function renderModels(){
  const sel = $('cxModel');
  const groups = PROVIDERS.filter(p => (p.kind === 'proxy' || keys[p.id]) && modelsBy[p.id]?.length);
  sel.innerHTML = groups.map(p => `<optgroup label="${esc(p.name)}">${modelsBy[p.id].map(m => `<option value="${esc(p.id + '::' + m.id)}">${esc(m.name)}${m.paid ? ' $' : ''}</option>`).join('')}</optgroup>`).join('');
  // someone who connected their own key wants to use it rather than the free quota
  const onFree = model.startsWith('oc::') && groups.some(p => p.kind !== 'proxy');
  if (onFree || ![...sel.options].some(o => o.value === model)) {
    // prefer a connected provider's recommended model over the free quota
    const pr = groups.find(p => p.kind !== 'proxy') || groups[0];
    const best = pr && ((pr.prefer || []).map(id => modelsBy[pr.id].find(m => m.id === id)).find(Boolean) || modelsBy[pr.id][0]);
    if (best) model = pr.id + '::' + best.id;
  }
  sel.value = model; renderCost();
}
$('cxModel').onchange = e => { model = e.target.value; ls.set('oc-code-model', model); renderCost(); };
function renderCost(){
  const pid = model.split('::')[0], el = $('cxCost');
  el.classList.toggle('warn', pid === 'oc');
  el.textContent = pid === 'oc' ? t('Free AI: every agent step uses one of your 20 free generations a day. For real coding, connect your own key (⚙ keys).') : `${byId(pid)?.name || ''} · ${t('your key')}`;
}
function renderProvs(){
  $('cxProvs').innerHTML = PROVIDERS.filter(p => p.kind !== 'proxy').map(p => `<div class="cx-prov${keys[p.id] ? ' on' : ''}"><div><b>${esc(p.name)}</b><span>${esc(p.note)} · <a href="${p.keyUrl}" target="_blank" rel="noreferrer">${t('get a key ↗')}</a></span></div><input type="password" data-key="${p.id}" value="${esc(keys[p.id] || '')}" placeholder="${esc(p.hint || 'API key')}" autocomplete="off" spellcheck="false"></div>`).join('');
}
$('cxKeysBtn').onclick = () => { renderProvs(); $('cxKeys').classList.remove('hidden'); };
$('cxKeys').addEventListener('click', e => { if (e.target === $('cxKeys') || e.target.closest('[data-close]')) $('cxKeys').classList.add('hidden'); });
$('cxProvs').addEventListener('change', async e => {
  const pid = e.target.dataset.key; if (!pid) return;
  const v = e.target.value.trim(); if (v) keys[pid] = v; else delete keys[pid];
  delete modelsBy[pid];
  try { await vault.saveKeys(keys); } catch { setState(t('could not save keys on this device'), 'error'); }
  renderProvs(); loadModels();
});
vault.onKeysChanged(async () => { keys = await vault.loadKeys().catch(() => keys); for (const k in modelsBy) if (!keys[k] && byId(k)?.kind !== 'proxy') delete modelsBy[k]; loadModels(); });
vault.loadKeys().then(k => { keys = k || {}; }).catch(() => {}).finally(loadModels);
window.addEventListener('oc:auth', renderCost);

/* ── Agent chat ── */
const toBottom = () => { const m = $('cxMessages'); m.scrollTop = m.scrollHeight; };
function addMsg(html, cls = ''){ const d = document.createElement('div'); d.className = 'message ' + cls; d.innerHTML = html; $('cxMessages').append(d); toBottom(); return d; }

// Unified diff with a little context around each change
function diffHtml(before, after){
  const out = []; let lines = 0;
  for (const part of diffLines(before || '', after || '')) {
    const rows = part.value.replace(/\n$/, '').split('\n');
    if (part.added || part.removed) { for (const r of rows) if (lines++ < 400) out.push(`<div class="${part.added ? 'a' : 'r'}">${part.added ? '+' : '-'} ${esc(r)}</div>`); continue; }
    if (rows.length <= 6) rows.forEach(r => out.push(`<div class="c">  ${esc(r)}</div>`));
    else { rows.slice(0, 2).forEach(r => out.push(`<div class="c">  ${esc(r)}</div>`)); out.push(`<div class="gap">  ⋯ ${t(`${rows.length - 4} unchanged lines`)}</div>`); rows.slice(-2).forEach(r => out.push(`<div class="c">  ${esc(r)}</div>`)); }
  }
  if (lines > 400) out.push(`<div class="gap">  ⋯ ${t('diff shortened')}</div>`);
  return out.join('');
}
function cardHtml(c){
  const st = c.status === 'accepted' ? `<span class="st ok">✓ ${t(project.writable ? 'saved' : 'kept')}</span>` : c.status === 'rejected' ? `<span class="st no">✗ ${t('rejected')}</span>` : `<span class="st"></span>`;
  const later = changes.some(x => x.path === c.path && x.id > c.id && x.status === 'pending');
  return `<div class="cx-card-head"><span class="path" data-open="${esc(c.path)}" title="${esc(c.path)}">${esc(c.path)}</span><span class="lang">${esc(c.lang)}</span>${c.isNew ? `<span class="new">${t('new')}</span>` : ''}<span class="nums"><span class="plus">+${c.added}</span> <span class="minus">−${c.removed}</span></span></div>
    <div class="cx-diff">${diffHtml(c.before, c.after)}</div>
    <div class="cx-card-foot">${st}${c.status === 'pending' && !later ? `<button class="btn" data-toggle>${t('diff')}</button><button class="btn" data-reject="${esc(c.path)}">${t('reject')}</button><button class="btn primary" data-accept="${esc(c.path)}">${t(project.writable ? 'accept & save' : 'accept')}</button>` : `<button class="btn" data-toggle>${t('diff')}</button>`}</div>`;
}
const cards = new Map(); // change id → element
function renderCards(){ for (const [id, el] of cards) { const c = changes.find(x => x.id === id); if (c) el.innerHTML = cardHtml(c); } }
$('cxMessages').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { openFile(o.dataset.open); return; }
  const a = e.target.closest('[data-accept]'); if (a) { saveFile(a.dataset.accept); return; }
  const r = e.target.closest('[data-reject]'); if (r) { rejectFile(r.dataset.reject); return; }
  const tg = e.target.closest('[data-toggle]'); if (tg) { tg.closest('.cx-card').classList.toggle('collapsed'); return; }
  const ra = e.target.closest('[data-run-act]')?.dataset.runAct;
  if (ra === 'accept') acceptAll(); else if (ra === 'reject') rejectAll(); else if (ra === 'signin') auth.openAuth('signin'); else if (ra === 'keys') $('cxKeysBtn').click();
});

async function send(request){
  if (running) return;
  if (!project.name) { setState(t('Open a project folder first.'), 'warn'); openFolder(); return; }
  if (!model) { $('cxKeysBtn').click(); return; }
  $('cxStatus').textContent = '';
  addMsg(esc(request), 'user');
  // "Thinking" panel, the same as in the builder: steps tick off one by one, then it folds into "thought for Ns"
  const node = addMsg(`<button class="th-head" type="button" aria-expanded="true"><span class="oc-logo thinking-logo" aria-hidden="true">${logoSvg}</span><span class="th-title">${esc(t('thinking'))}</span><span class="th-time">0s</span></button><ol class="th-steps"></ol>`, 'assistant thinking');
  const steps = node.querySelector('.th-steps'), title = node.querySelector('.th-title'), clock = node.querySelector('.th-time'), t0 = Date.now();
  const cardBox = document.createElement('div'); cardBox.className = 'cx-cards'; $('cxMessages').append(cardBox);
  const tick = setInterval(() => { clock.textContent = Math.floor((Date.now() - t0) / 1000) + 's'; }, 250);
  const startCount = changes.length;
  let current = null, count = 0;
  const step = (label, detail = '', cls = 'run') => {
    current?.classList.replace('run', 'done');
    current = document.createElement('li'); current.className = cls;
    current.innerHTML = `<i class="th-mark" aria-hidden="true"></i><span>${esc(label)}</span>${detail ? `<span class="th-d">${esc(detail)}</span>` : ''}`;
    steps.append(current); toBottom();
  };
  const fold = () => {
    current?.classList.replace('run', 'done');
    const sec = Math.max(1, Math.round((Date.now() - t0) / 1000));
    node.classList.add('folded'); title.textContent = t(`thought for ${sec}s`); clock.textContent = t(`${count} steps`);
    const head = node.querySelector('.th-head'); head.setAttribute('aria-expanded', 'false');
    head.onclick = () => { const folded = node.classList.toggle('folded'); head.setAttribute('aria-expanded', String(!folded)); };
  };
  running = new AbortController();
  window.dispatchEvent(new CustomEvent('cx:busy', { detail: true }));
  setState(t('the agent is working…'), 'busy');
  step(t('reading your request'));
  const [pid, ...rest] = model.split('::');
  try {
    const res = await runAgent({
      project, request, history, openPath, lang: AI_LANG[lang] || 'English', signal: running.signal,
      callModel: (system, user) => chat(byId(pid), keys[pid], rest.join('::'), system, user),
      onStep: s => {
        if (s.kind === 'done' || s.kind === 'ask') return;
        count++;
        step(s.label, s.detail, s.kind === 'error' ? 'run err' : 'run');
        if (s.kind === 'edit') title.textContent = t('composing');
      },
      onChange: c => {
        changes.push(c);
        const el = document.createElement('div'); el.className = 'cx-card'; cards.set(c.id, el); cardBox.append(el);
        syncEditor(c.path); refreshAll(); toBottom();
      },
    });
    fold();
    const mine = changes.slice(startCount), files = new Set(mine.map(c => c.path));
    const sum = mine.reduce((a, c) => ({ added: a.added + c.added, removed: a.removed + c.removed }), { added: 0, removed: 0 });
    addMsg(`${esc(res.summary)}${mine.length ? `<div class="cx-runfoot"><span><span class="plus">+${sum.added}</span> <span class="minus">−${sum.removed}</span> · ${t(`${files.size} ${files.size === 1 ? 'file' : 'files'}`)}</span><span class="sp"></span><button class="btn" data-run-act="reject">${t('reject all')}</button><button class="btn primary" data-run-act="accept">${t(project.writable ? 'accept all & save' : 'accept all')}</button></div>` : ''}`, 'assistant');
    history.push({ request, summary: res.summary + (mine.length ? ` (edited: ${[...files].join(', ')})` : '') });
    if (history.length > 8) history = history.slice(-8);
    setState(mine.length ? t('done — review the changes') : t('done'), 'ok');
  } catch (err) {
    const msg = String(err.message || err), stopped = msg === 'stopped';
    if (changes.length > startCount || count) fold(); else { node.remove(); }
    const needsSignIn = /sign in/i.test(msg);
    addMsg(`${esc(stopped ? t('Stopped. The changes made so far are still waiting for review.') : msg)}${needsSignIn ? `<div class="cx-runfoot"><button class="btn" data-run-act="signin">${t('sign in')}</button><button class="btn" data-run-act="keys">⚙ ${t('keys')}</button></div>` : ''}`, stopped ? 'assistant' : 'assistant cx-err');
    setState(stopped ? t('stopped') : t('agent error'), stopped ? 'warn' : 'error');
  } finally {
    clearInterval(tick); running = null; refreshAll();
    window.dispatchEvent(new CustomEvent('cx:busy', { detail: false }));
  }
}
window.addEventListener('cx:send', e => { const v = String(e.detail || '').trim(); if (v) send(v); });
window.addEventListener('cx:stop', () => { if (running) { running.abort(); setState(t('stopping after this step…'), 'busy'); } });
const welcome = (title, text) => `<div class="message assistant welcome"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
$('cxNewChat').onclick = () => {
  if (running) return;
  history = []; cards.clear();
  $('cxMessages').innerHTML = welcome(t('New conversation'), t('The agent forgets earlier requests; files and pending changes stay as they are.'));
};
renderTotals();
