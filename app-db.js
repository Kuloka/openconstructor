// App data in the editor.
//  1) Answers oc.db calls from apps running inside the editor (canvas, Code preview, device preview): the
//     records are kept in this browser ('oc-appdata'), private ones are written but never listed — like live.
//  2) The "App data" window: test records from this browser and, for a published page whose author is
//     signed in, the live records from Supabase (supabase/appdata.sql), private ones included.
import { studio } from './studio.js';
import { t } from './i18n.js';

const KEY = 'oc-appdata', MAX_PER_COL = 500, MAX_BYTES = 1_000_000;
const COL_RE = /^[a-z0-9_-]{1,40}$/;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const save = all => { const s = JSON.stringify(all); if (s.length > MAX_BYTES) throw Error('oc.db: test data is full (1 MB) — clear it in App data'); localStorage.setItem(KEY, s); };

export function localOp(m){
  const col = String(m.col || '').toLowerCase();
  if (!COL_RE.test(col)) throw Error('oc.db: bad collection name');
  const all = load(), list = all[col] || (all[col] = []);
  if (m.op === 'add') {
    const data = m.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('oc.db: a record must be an object');
    if (JSON.stringify(data).length > 7000) throw Error('oc.db: one record is limited to 7 KB');
    const row = { id: Date.now() + '' + Math.floor(Math.random() * 1e3), data, private: m.private === true, created_at: new Date().toISOString() };
    list.unshift(row); list.length = Math.min(list.length, MAX_PER_COL);
    save(all); window.dispatchEvent(new CustomEvent('oc:appdata'));
    return { id: row.id, data: row.private ? {} : row.data, created_at: row.created_at };
  }
  if (m.op === 'list') {
    const limit = Math.max(1, Math.min(200, +m.limit || 50));
    return list.filter(r => !r.private).slice(0, limit).map(({ id, data, created_at }) => ({ id, data, created_at }));
  }
  throw Error('oc.db: unknown operation');
}

addEventListener('message', e => {
  const m = e.data; if (!m || m.ocDb !== 1 || typeof m.id !== 'string' || !e.source) return;
  let reply;
  try { reply = { ocDbReply: 1, id: m.id, result: localOp(m) }; }
  catch (err) { reply = { ocDbReply: 1, id: m.id, error: String(err.message || err) }; }
  try { e.source.postMessage(reply, '*'); } catch {}
});

/* ── the App data window ── */
const publishedSlug = () => { try { return (JSON.parse(localStorage.getItem('oc-published') || '{}') || {})[studio.name()] || null; } catch { return null; } };
let modal = null, tab = 'test', live = null; // live = { slug, rows } | { error }

function table(rows){
  if (!rows.length) return `<p class="ad-empty">${t('No records yet.')}</p>`;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r.data || {})))].slice(0, 8);
  const cell = v => esc(typeof v === 'object' && v !== null ? JSON.stringify(v) : v).slice(0, 300);
  return `<div class="ad-table-wrap" data-no-i18n><table class="ad-table"><thead><tr><th>${t('time')}</th>${keys.map(k => `<th>${esc(k)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr${r.private ? ' class="is-private"' : ''}><td class="ad-time">${esc(new Date(r.created_at).toLocaleString())}${r.private ? ` <span class="ad-badge">${t('private')}</span>` : ''}</td>${keys.map(k => `<td>${cell(r.data?.[k])}</td>`).join('')}<td><button type="button" class="ad-del" data-del="${esc(r.id)}" title="${t('Delete record')}">×</button></td></tr>`).join('')}</tbody></table></div>`;
}
function groups(rows){
  const by = {};
  for (const r of rows) (by[r.col] ||= []).push(r);
  const cols = Object.keys(by).sort();
  if (!cols.length) return `<p class="ad-empty">${tab === 'test' ? t('No test records yet. Apps that use oc.db save here while you try them in the editor.') : t('No records yet.')}</p>`;
  return cols.map(c => `<section class="ad-col"><h3 data-no-i18n><span>${esc(c)}</span><em>${by[c].length}</em></h3>${table(by[c])}</section>`).join('');
}
async function loadLive(){
  const slug = publishedSlug();
  if (!slug) { live = { error: t('This project is not published yet. Publish it — then visitors’ records appear here.') }; return paint(); }
  const { supabase, user } = await import('./auth.js');
  if (!supabase || !user) { live = { error: t('Sign in to see the records of your published page.') }; return paint(); }
  live = { slug, loading: true }; paint();
  const { data, error } = await supabase.from('app_rows').select('id, col, data, private, created_at').eq('slug', slug).order('created_at', { ascending: false }).limit(1000);
  live = error ? { slug, error: /app_rows|relation|schema cache/i.test(error.message) ? t('The app data table is not set up yet: run supabase/appdata.sql in the Supabase SQL editor.') : error.message } : { slug, rows: data || [] };
  paint();
}
function paint(){
  if (!modal) return;
  const body = modal.querySelector('.ad-body');
  modal.querySelectorAll('[data-adtab]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.adtab === tab)));
  modal.querySelector('[data-ad="clear"]').hidden = tab !== 'test';
  modal.querySelector('[data-ad="refresh"]').hidden = tab !== 'live';
  if (tab === 'test') {
    const all = load(); const rows = Object.entries(all).flatMap(([col, list]) => (Array.isArray(list) ? list : []).map(r => ({ ...r, col })));
    body.innerHTML = groups(rows);
  } else if (!live || live.loading) body.innerHTML = `<p class="ad-empty">${t('Loading…')}</p>`;
  else if (live.error) body.innerHTML = `<p class="ad-empty">${esc(live.error)}</p>`;
  else body.innerHTML = `<p class="ad-note">openconstructor.pw/p/${esc(live.slug)}</p>` + groups(live.rows);
}
export function openAppData(which = 'test'){
  tab = which;
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal app-data'; modal.id = 'appData';
    modal.innerHTML = `<div class="modal-card wide"><div class="modal-head"><h2>${t('App data')}</h2><button class="btn icon" data-ad="close" aria-label="${t('close')}">×</button></div>
      <p class="muted">${t('Records your apps save with oc.db. Test data stays in this browser; live data comes from visitors of the published page. Private records are visible only here.')}</p>
      <div class="ad-bar"><div class="seg" role="radiogroup"><button type="button" role="radio" data-adtab="test">${t('test (this browser)')}</button><button type="button" role="radio" data-adtab="live">${t('live (published)')}</button></div><span class="sb-spacer"></span><button class="btn" data-ad="refresh">${t('refresh')}</button><button class="btn" data-ad="clear">${t('clear test data')}</button></div>
      <div class="ad-body"></div></div>`;
    document.body.append(modal);
    modal.addEventListener('click', async e => {
      if (e.target === modal || e.target.closest('[data-ad="close"]')) return modal.classList.add('hidden');
      const tb = e.target.closest('[data-adtab]'); if (tb) { tab = tb.dataset.adtab; if (tab === 'live') loadLive(); return paint(); }
      if (e.target.closest('[data-ad="refresh"]')) return loadLive();
      if (e.target.closest('[data-ad="clear"]')) { if (confirm(t('Delete all test records in this browser?'))) { localStorage.removeItem(KEY); paint(); } return; }
      const del = e.target.closest('[data-del]')?.dataset.del; if (!del) return;
      if (tab === 'test') {
        const all = load(); for (const c of Object.keys(all)) all[c] = (all[c] || []).filter(r => String(r.id) !== del);
        save(all); paint();
      } else {
        const { supabase } = await import('./auth.js');
        const { error } = await supabase.from('app_rows').delete().eq('id', +del);
        if (error) studio.status(error.message, 'error'); else { live.rows = live.rows.filter(r => String(r.id) !== del); paint(); }
      }
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) modal.classList.add('hidden'); });
    window.addEventListener('oc:appdata', () => tab === 'test' && !modal.classList.contains('hidden') && paint());
  }
  modal.classList.remove('hidden');
  if (tab === 'live') loadLive(); else paint();
}
document.getElementById('appDataBtn')?.addEventListener('click', () => openAppData());
window.addEventListener('oc:app-data', e => openAppData(e.detail || 'test'));
