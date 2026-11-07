// Publish in one click: stores the exported page in Supabase (table `pages`,
// see supabase/publish.sql) and serves it at https://openconstructor.pw/p/<slug>
// through worker.js.
import { supabase, user, openAuth } from './auth.js';
import { studio } from './studio.js';
import './publish.css';

const ORIGIN = 'https://openconstructor.pw';
const MAX_HTML = 1_000_000;
const MAX_SOURCE = 1_400_000; // supabase/remix.sql caps the stored project at ~1.5 MB
const REMIX_KEY = 'oc-remixed-from'; // set by remix.js: { slug, name }
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const STORE_KEY = 'oc-published';
const pageUrl = slug => `${ORIGIN}/p/${slug}`;
const embedCode = (slug, title) => `<iframe src="${pageUrl(slug)}" width="100%" height="600" style="border:0;border-radius:12px" loading="lazy" title="${esc(title || slug)}"></iframe>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── remembered slug per project name ──
function memory(){ try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function remember(name, slug){ try { const m = memory(); if (slug) m[name] = slug; else delete m[name]; localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch {} }
// The page this project was remixed from (only while the project keeps the name remix.js gave it)
function remixedFrom(){
  try {
    const r = JSON.parse(localStorage.getItem(REMIX_KEY) || sessionStorage.getItem(REMIX_KEY) || 'null');
    return r && SLUG_RE.test(r.slug) && r.name === studio.name() ? r.slug : null;
  } catch { return null; }
}
function forget(slug){ try { const m = memory(); for (const k of Object.keys(m)) if (m[k] === slug) delete m[k]; localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch {} }

export function slugify(text){
  let s = String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.html?$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  if (!s) s = 'my-page';
  if (s.length < 3) s = `${s}-page`;
  return s;
}

async function currentUser(){
  if (user) return user;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
}

// ── title bar button ──
const btn = document.createElement('button');
btn.className = 'btn pub-btn'; btn.id = 'publish'; btn.type = 'button';
btn.title = 'Publish this page to a public link';
btn.innerHTML = '<span class="pub-dot"></span>publish';
const right = document.querySelector('.tb-right');
const exportBtn = document.getElementById('export');
if (right) exportBtn && exportBtn.parentElement === right ? right.insertBefore(btn, exportBtn) : right.append(btn);

// ── dialog ──
const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'publishModal';
modal.innerHTML = `<div class="modal-card pub-card" role="dialog" aria-labelledby="pubTitle">
  <div class="modal-head"><h2 id="pubTitle">publish</h2><button class="btn icon" type="button" data-pub-close aria-label="Close">×</button></div>
  <p class="pub-lead">Only people with the link can open the page, unless you also show it in the gallery. You can switch it off or delete it any time. Scripts are disabled on published pages; forms work and their messages come to you.</p>
  <form class="pub-form" id="pubForm" autocomplete="off">
    <label class="field">Link
      <span class="pub-slug"><span class="pub-prefix">openconstructor.pw/p/</span><input id="pubSlug" maxlength="48" spellcheck="false" required></span>
    </label>
    <div class="pub-hint" id="pubHint"></div>
    <label class="pub-listed"><input type="checkbox" id="pubListed"> <span><b>Show in the community gallery</b> — let others discover it at <a href="/gallery" target="_blank">openconstructor.pw/gallery</a></span></label>
    <div class="modal-actions"><button class="btn primary" type="submit" id="pubGo">publish</button></div>
  </form>
  <div class="pub-result hidden" id="pubResult">
    <a id="pubLink" target="_blank" rel="noopener"></a>
    <div class="pub-result-actions"><button class="btn" type="button" id="pubCopy">copy</button><button class="btn" type="button" id="pubOpen">open ↗</button></div>
  </div>
  <div class="pub-embed hidden" id="pubEmbed">
    <div class="pub-embed-head"><span>embed on your site</span><button class="btn" type="button" id="pubEmbedCopy">copy</button></div>
    <textarea id="pubEmbedCode" readonly rows="3" spellcheck="false" aria-label="Embed code"></textarea>
  </div>
  <div class="pub-list-head"><span>your published pages</span><span class="pub-count" id="pubCount"></span></div>
  <ul class="pub-list" id="pubList"><li class="pub-empty">loading…</li></ul>
  <div class="pub-subs hidden" id="pubSubs"></div>
</div>`;
document.body.append(modal);

const $ = sel => modal.querySelector(sel);
const slugInput = $('#pubSlug'), hint = $('#pubHint'), goBtn = $('#pubGo');
const close = () => modal.classList.add('hidden');
$('[data-pub-close]').onclick = close;
modal.addEventListener('click', e => { if (e.target === modal) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

let me = null;          // signed-in user
let state = 'unknown';  // 'new' | 'mine' | 'taken' | 'invalid' | 'unknown'
let checkSeq = 0;
let lastUrl = '';

function setHint(text, kind = ''){ hint.innerHTML = text; hint.className = 'pub-hint ' + kind; }

// Names that belong to the site itself (mirrored by a check constraint in supabase/gallery.sql)
const RESERVED = new Set(['gallery', 'admin', 'api', 'app', 'auth', 'login', 'signup', 'settings', 'help', 'about', 'docs', 'blog', 'pricing', 'terms', 'privacy', 'support', 'openconstructor', 'official', 'staff', 'team', 'www', 'mail', 'root', 'null', 'undefined']);
async function check(){
  const seq = ++checkSeq;
  const slug = slugInput.value.trim();
  if (!SLUG_RE.test(slug)) {
    state = 'invalid'; goBtn.textContent = 'publish';
    setHint('3–48 characters: lowercase letters, digits and dashes; must start with a letter or digit.', 'err');
    return;
  }
  if (RESERVED.has(slug)) { state = 'taken'; goBtn.textContent = 'publish'; setHint('this name is reserved, try another one.', 'err'); return; }
  setHint('checking…');
  const { data, error } = await supabase.from('pages').select('slug, owner, listed').eq('slug', slug).maybeSingle();
  if (seq !== checkSeq) return;
  if (error) { state = 'unknown'; goBtn.textContent = 'publish'; setHint(`couldn't check this link: ${esc(error.message)}`, 'err'); return; }
  if (!data) { state = 'new'; goBtn.textContent = 'publish'; setHint('this link is free.', 'ok'); return; }
  if (data.owner === me?.id) { state = 'mine'; goBtn.textContent = 'update'; $('#pubListed').checked = !!data.listed; setHint('you already published here — this will update the page.', 'ok'); return; }
  state = 'taken'; goBtn.textContent = 'publish';
  const alt = await suggest(slug);
  if (seq !== checkSeq) return;
  setHint(alt ? `this link is taken. try <button type="button" class="pub-suggest" data-slug="${esc(alt)}">${esc(alt)}</button>` : 'this link is taken, try another one.', 'err');
}

async function suggest(base){
  const stem = base.slice(0, 44).replace(/-+$/, '');
  const candidates = [2, 3, 4, 5, 6, 7, 8, 9].map(n => `${stem}-${n}`)
    .concat(Array.from({ length: 3 }, () => `${stem}-${Math.random().toString(36).slice(2, 6)}`))
    .filter(s => SLUG_RE.test(s));
  const { data, error } = await supabase.from('pages').select('slug').in('slug', candidates);
  if (error) return null;
  const used = new Set((data || []).map(r => r.slug));
  return candidates.find(s => !used.has(s)) || null;
}

let timer = 0;
slugInput.addEventListener('input', () => {
  const clean = slugInput.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-');
  if (clean !== slugInput.value) slugInput.value = clean;
  clearTimeout(timer); timer = setTimeout(check, 300);
});
hint.addEventListener('click', e => {
  const s = e.target.closest('.pub-suggest')?.dataset.slug;
  if (s) { slugInput.value = s; check(); slugInput.focus(); }
});

function titleOf(html){
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  return (t || studio.name()).slice(0, 200);
}

$('#pubForm').addEventListener('submit', async e => {
  e.preventDefault();
  clearTimeout(timer);
  await check();
  const slug = slugInput.value.trim();
  if (state === 'invalid' || state === 'taken') { slugInput.focus(); return; }
  me = await currentUser();
  if (!me) { close(); askSignIn(); return; }

  let html;
  try { html = studio.html(); } catch (err) { setHint(`couldn't build the page: ${esc(err.message)}`, 'err'); return; }
  if (!html || !studio.items().length) { setHint('the page is empty — add some blocks first.', 'err'); return; }
  if (html.length > MAX_HTML) { setHint(`the page is too large to publish (${Math.round(html.length / 1000)} KB, max 1000 KB). Large inline images are the usual cause.`, 'err'); return; }

  const row = { title: titleOf(html), html, listed: $('#pubListed').checked };
  // The editable project, so others can remix it (see remix.js / supabase/remix.sql)
  const extra = {};
  const source = { items: studio.items(), page: studio.page(), name: studio.name() };
  if (JSON.stringify(source).length <= MAX_SOURCE) extra.source = source;
  const from = state === 'mine' ? null : remixedFrom();
  if (from && from !== slug) extra.remixed_from = from;

  goBtn.disabled = true; studio.status(state === 'mine' ? 'updating published page…' : 'publishing…', 'busy');
  const send = fields => state === 'mine'
    ? supabase.from('pages').update(fields).eq('slug', slug).eq('owner', me.id).select('slug').maybeSingle()
    : supabase.from('pages').insert({ slug, ...fields }).select('slug').maybeSingle();
  let res = await send({ ...row, ...extra });
  // Database without supabase/remix.sql yet (unknown column / no column grant): publish without the project
  if (res.error && Object.keys(extra).length && ['PGRST204', '42703', '42501'].includes(res.error.code)) res = await send(row);
  goBtn.disabled = false;

  if (res.error || !res.data) {
    const err = res.error;
    if (err?.code === '23505' || err?.code === '42501' || !err) { await check(); studio.status('that link was just taken', 'error'); return; }
    const text = /page limit/i.test(err.message) ? 'you have 50 published pages — unpublish one first.' : err.message;
    setHint(esc(text), 'err'); studio.status(`publish failed: ${text}`, 'error');
    return;
  }
  const updated = state === 'mine';
  remember(studio.name(), slug);
  showResult(slug, row.title);
  state = 'mine'; goBtn.textContent = 'update';
  setHint(updated ? 'updated. changes may take up to a minute to appear.' : 'published.', 'ok');
  studio.status(updated ? `updated ${pageUrl(slug)}` : `published at ${pageUrl(slug)}`, 'ok');
  loadList();
});

function showResult(slug, title){
  lastUrl = pageUrl(slug);
  const a = $('#pubLink'); a.href = lastUrl; a.textContent = lastUrl.replace(/^https:\/\//, '');
  $('#pubResult').classList.remove('hidden');
  $('#pubEmbedCode').value = embedCode(slug, title);
  $('#pubEmbed').classList.remove('hidden');
}
function hideResult(){ $('#pubResult').classList.add('hidden'); $('#pubEmbed').classList.add('hidden'); }
$('#pubCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(lastUrl); studio.status('link copied', 'ok'); $('#pubCopy').textContent = 'copied'; setTimeout(() => $('#pubCopy').textContent = 'copy', 1400); }
  catch { studio.status('copy failed — select the link and copy it manually', 'error'); }
};
$('#pubEmbedCode').addEventListener('focus', e => e.target.select());
$('#pubEmbedCopy').onclick = async () => {
  const b = $('#pubEmbedCopy'), code = $('#pubEmbedCode');
  try { await navigator.clipboard.writeText(code.value); studio.status('embed code copied', 'ok'); b.textContent = 'copied'; setTimeout(() => b.textContent = 'copy', 1400); }
  catch { code.focus(); code.select(); studio.status('copy failed — the code is selected, press Ctrl+C', 'error'); }
};
$('#pubOpen').onclick = () => window.open(lastUrl, '_blank', 'noopener');

// ── your published pages: visibility, on/off, views, form messages, delete ──
let pages = [];
let canManage = true; // false until supabase/manage.sql has been run (no paused/views columns yet)
async function loadList(){
  const list = $('#pubList');
  if (!me) { list.innerHTML = ''; return; }
  let res = await supabase.from('pages').select('slug, title, updated_at, listed, paused, views, notify_email').eq('owner', me.id).order('updated_at', { ascending: false });
  canManage = !res.error;
  if (res.error) res = await supabase.from('pages').select('slug, title, updated_at, listed').eq('owner', me.id).order('updated_at', { ascending: false });
  if (res.error) { list.innerHTML = `<li class="pub-empty">couldn't load your pages: ${esc(res.error.message)}</li>`; return; }
  pages = res.data || [];
  $('#pubCount').textContent = pages.length ? `${pages.length} / 50` : '';
  if (!pages.length) { list.innerHTML = '<li class="pub-empty">nothing published yet.</li>'; return; }
  // messages per page (only rows the owner may read come back)
  const counts = {};
  if (canManage) {
    const { data } = await supabase.from('form_submissions').select('slug').in('slug', pages.map(p => p.slug)).limit(5000);
    for (const r of data || []) counts[r.slug] = (counts[r.slug] || 0) + 1;
  }
  list.innerHTML = pages.map(p => `<li class="${p.paused ? 'off' : ''}">
    <div class="pub-item"><a href="${esc(pageUrl(p.slug))}" target="_blank" rel="noopener">/p/${esc(p.slug)}</a><span>${esc(p.title || '')} · ${esc(new Date(p.updated_at).toLocaleDateString())}</span>
      <div class="pub-meta">
        ${canManage ? `<span title="Views">👁 ${p.views ?? 0}</span>` : ''}
        ${canManage ? `<button type="button" class="pub-chip" data-subs="${esc(p.slug)}" title="Messages sent through forms on this page">✉ ${counts[p.slug] || 0}</button>` : ''}
        <button type="button" class="pub-chip${p.listed ? ' on' : ''}" data-listed="${esc(p.slug)}" title="Who can find it">${p.listed ? 'in gallery' : 'link only'}</button>
        ${canManage ? `<button type="button" class="pub-chip${p.paused ? '' : ' on'}" data-paused="${esc(p.slug)}" title="Turn the page off without deleting it">${p.paused ? 'off' : 'on'}</button>` : ''}
        ${canManage ? `<button type="button" class="pub-chip${p.notify_email === false ? '' : ' on'}" data-notify="${esc(p.slug)}" title="E-mail me about each form message">${p.notify_email === false ? 'e-mail off' : 'e-mail on'}</button>` : ''}
      </div>
    </div>
    <button class="btn pub-use" type="button" data-use="${esc(p.slug)}" title="Publish this project to this link">use</button>
    <button class="btn pub-del" type="button" data-del="${esc(p.slug)}">delete</button>
  </li>`).join('') + (canManage ? '' : `<li class="pub-empty">Views, form messages and turning pages off need one more database step: run supabase/manage.sql.</li>`);
}
async function setFlag(slug, field, value){
  const { error } = await supabase.from('pages').update({ [field]: value }).eq('slug', slug).eq('owner', me.id);
  if (error) { studio.status(`couldn't change the page: ${error.message}`, 'error'); return; }
  const msg = field === 'listed' ? (value ? 'shown in the gallery' : 'now only people with the link can open it') : field === 'notify_email' ? (value ? 'form messages will also come by e-mail' : 'no e-mails for form messages') : (value ? 'page turned off' : 'page turned on');
  studio.status(`/p/${slug}: ${msg} · may take up to a minute`, 'ok');
  loadList();
}
$('#pubList').addEventListener('click', async e => {
  const use = e.target.closest('[data-use]')?.dataset.use;
  if (use) { slugInput.value = use; check(); return; }
  const l = e.target.closest('[data-listed]')?.dataset.listed;
  if (l) { const p = pages.find(x => x.slug === l); return setFlag(l, 'listed', !p?.listed); }
  const nt = e.target.closest('[data-notify]')?.dataset.notify;
  if (nt) { const p = pages.find(x => x.slug === nt); return setFlag(nt, 'notify_email', p?.notify_email === false); }
  const pz = e.target.closest('[data-paused]')?.dataset.paused;
  if (pz) { const p = pages.find(x => x.slug === pz); return setFlag(pz, 'paused', !p?.paused); }
  const sb = e.target.closest('[data-subs]')?.dataset.subs;
  if (sb) return showSubs(sb);
  const slug = e.target.closest('[data-del]')?.dataset.del;
  if (!slug || !confirm(`Delete openconstructor.pw/p/${slug}? The link will stop working and its form messages will be deleted too.`)) return;
  const { error } = await supabase.from('pages').delete().eq('slug', slug).eq('owner', me.id);
  if (error) { studio.status(`unpublish failed: ${error.message}`, 'error'); return; }
  forget(slug);
  studio.status(`unpublished /p/${slug}`, 'ok');
  if (lastUrl === pageUrl(slug)) hideResult();
  if (slugInput.value === slug) check();
  loadList();
});

// ── form messages of one page ──
let subs = [], subsSlug = '';
async function showSubs(slug){
  subsSlug = slug;
  const box = $('#pubSubs');
  box.classList.remove('hidden'); $('#pubList').classList.add('hidden');
  box.innerHTML = '<div class="pub-empty">loading…</div>';
  const { data, error } = await supabase.from('form_submissions').select('id, data, created_at').eq('slug', slug).order('created_at', { ascending: false }).limit(500);
  if (error) { box.innerHTML = `<div class="pub-empty">couldn't load messages: ${esc(error.message)}</div>`; return; }
  subs = data || [];
  renderSubs();
}
function renderSubs(){
  const box = $('#pubSubs');
  const rows = subs.map(r => `<li><div class="pub-sub-head"><span>${esc(new Date(r.created_at).toLocaleString())}</span><button type="button" class="btn icon" data-sub-del="${r.id}" title="Delete this message">×</button></div>
    <dl>${Object.entries(r.data || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc([].concat(v).join(', '))}</dd>`).join('')}</dl></li>`).join('');
  box.innerHTML = `<div class="pub-list-head"><button type="button" class="btn" data-subs-back>← back</button><span>messages from /p/${esc(subsSlug)} · ${subs.length}</span>${subs.length ? '<button type="button" class="btn" data-subs-csv>⬇ CSV</button>' : ''}</div>
    ${subs.length ? `<ul class="pub-sub-list">${rows}</ul>` : '<div class="pub-empty">No messages yet. When visitors send a form on this page, it shows up here.</div>'}`;
}
$('#pubSubs').addEventListener('click', async e => {
  if (e.target.closest('[data-subs-back]')) { $('#pubSubs').classList.add('hidden'); $('#pubList').classList.remove('hidden'); loadList(); return; }
  if (e.target.closest('[data-subs-csv]')) {
    const keys = [...new Set(subs.flatMap(r => Object.keys(r.data || {})))];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['date', ...keys].map(cell).join(','), ...subs.map(r => [r.created_at, ...keys.map(k => [].concat(r.data?.[k] ?? '').join(', '))].map(cell).join(','))].join('\r\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `${subsSlug}-messages.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return;
  }
  const id = e.target.closest('[data-sub-del]')?.dataset.subDel;
  if (id && confirm('Delete this message?')) {
    const { error } = await supabase.from('form_submissions').delete().eq('id', id);
    if (error) { studio.status(`couldn't delete: ${error.message}`, 'error'); return; }
    subs = subs.filter(r => String(r.id) !== id); renderSubs();
  }
});

// ── open ──
let pending = false;
function askSignIn(){
  pending = true;
  studio.status('create a free account (or sign in) to publish your page');
  openAuth('signup');
  const m = document.getElementById('authMsg');
  if (m) { m.textContent = 'An account is needed to publish — it lets you update or unpublish your pages later.'; m.className = 'auth-msg'; }
}
window.addEventListener('oc:auth', e => {
  if (e.detail && pending) { pending = false; document.getElementById('authModal')?.classList.add('hidden'); openPublish(); }
  if (!e.detail) { me = null; close(); }
});

export async function openPublish(){
  if (!supabase) { studio.status('publishing needs accounts, which are not configured on this build', 'error'); return; }
  me = await currentUser();
  if (!me) { askSignIn(); return; }
  const remembered = memory()[studio.name()];
  slugInput.value = remembered || slugify(studio.name());
  hideResult();
  $('#pubSubs').classList.add('hidden'); $('#pubList').classList.remove('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => slugInput.focus(), 50);
  check();
  loadList();
}
btn.addEventListener('click', openPublish);
