// Publish in one click: stores the exported page in Supabase (table `pages`,
// see supabase/publish.sql) and serves it at https://openconstructor.pw/p/<slug>
// through worker.js.
import { supabase, user, openAuth } from './auth.js';
import { studio } from './studio.js';
import './publish.css';

const ORIGIN = 'https://openconstructor.pw';
const MAX_HTML = 1_000_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const STORE_KEY = 'oc-published';
const pageUrl = slug => `${ORIGIN}/p/${slug}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── remembered slug per project name ──
function memory(){ try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function remember(name, slug){ try { const m = memory(); if (slug) m[name] = slug; else delete m[name]; localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch {} }
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
  <p class="pub-lead">Anyone with the link can view this page. Scripts are disabled on published pages.</p>
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
  <div class="pub-list-head"><span>your published pages</span><span class="pub-count" id="pubCount"></span></div>
  <ul class="pub-list" id="pubList"><li class="pub-empty">loading…</li></ul>
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
  goBtn.disabled = true; studio.status(state === 'mine' ? 'updating published page…' : 'publishing…', 'busy');
  const res = state === 'mine'
    ? await supabase.from('pages').update(row).eq('slug', slug).eq('owner', me.id).select('slug').maybeSingle()
    : await supabase.from('pages').insert({ slug, ...row }).select('slug').maybeSingle();
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
  showResult(slug);
  state = 'mine'; goBtn.textContent = 'update';
  setHint(updated ? 'updated. changes may take up to a minute to appear.' : 'published.', 'ok');
  studio.status(updated ? `updated ${pageUrl(slug)}` : `published at ${pageUrl(slug)}`, 'ok');
  loadList();
});

function showResult(slug){
  lastUrl = pageUrl(slug);
  const a = $('#pubLink'); a.href = lastUrl; a.textContent = lastUrl.replace(/^https:\/\//, '');
  $('#pubResult').classList.remove('hidden');
}
$('#pubCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(lastUrl); studio.status('link copied', 'ok'); $('#pubCopy').textContent = 'copied'; setTimeout(() => $('#pubCopy').textContent = 'copy', 1400); }
  catch { studio.status('copy failed — select the link and copy it manually', 'error'); }
};
$('#pubOpen').onclick = () => window.open(lastUrl, '_blank', 'noopener');

async function loadList(){
  const list = $('#pubList');
  if (!me) { list.innerHTML = ''; return; }
  const { data, error } = await supabase.from('pages').select('slug, title, updated_at').eq('owner', me.id).order('updated_at', { ascending: false });
  if (error) { list.innerHTML = `<li class="pub-empty">couldn't load your pages: ${esc(error.message)}</li>`; return; }
  $('#pubCount').textContent = data.length ? `${data.length} / 50` : '';
  if (!data.length) { list.innerHTML = '<li class="pub-empty">nothing published yet.</li>'; return; }
  list.innerHTML = data.map(p => `<li>
    <div class="pub-item"><a href="${esc(pageUrl(p.slug))}" target="_blank" rel="noopener">/p/${esc(p.slug)}</a><span>${esc(p.title || '')} · ${esc(new Date(p.updated_at).toLocaleDateString())}</span></div>
    <button class="btn pub-use" type="button" data-use="${esc(p.slug)}" title="Publish this project to this link">use</button>
    <button class="btn pub-del" type="button" data-del="${esc(p.slug)}">unpublish</button>
  </li>`).join('');
}
$('#pubList').addEventListener('click', async e => {
  const use = e.target.closest('[data-use]')?.dataset.use;
  if (use) { slugInput.value = use; check(); return; }
  const slug = e.target.closest('[data-del]')?.dataset.del;
  if (!slug || !confirm(`Unpublish openconstructor.pw/p/${slug}? The link will stop working.`)) return;
  const { error } = await supabase.from('pages').delete().eq('slug', slug).eq('owner', me.id);
  if (error) { studio.status(`unpublish failed: ${error.message}`, 'error'); return; }
  forget(slug);
  studio.status(`unpublished /p/${slug}`, 'ok');
  if (lastUrl === pageUrl(slug)) $('#pubResult').classList.add('hidden');
  if (slugInput.value === slug) check();
  loadList();
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
  $('#pubResult').classList.add('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => slugInput.focus(), 50);
  check();
  loadList();
}
btn.addEventListener('click', openPublish);
