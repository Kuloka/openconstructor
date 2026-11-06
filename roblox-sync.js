// roblox-sync.js: Export → "Sync to Roblox Studio".
// Sends the page (all screens) as a Roblox instance tree to /api/sync and shows a sync code; the
// openconstructor Studio plugin (public/roblox/openconstructor-sync.lua) pulls it into StarterGui.
// Each project keeps its code, so re-syncing updates the same UI in Studio (live mode picks it up).
import { studio, robloxSpec } from './studio.js';
import { supabase, openAuth } from './auth.js';
import './roblox-sync.css';

const PLUGIN_URL = '/roblox/openconstructor-sync.lua';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const codes = { get(){ try { return JSON.parse(localStorage.getItem('oc-sync-codes')) || {}; } catch { return {}; } }, set(v){ try { localStorage.setItem('oc-sync-codes', JSON.stringify(v)); } catch {} } };

const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'syncModal';
modal.innerHTML = `<div class="modal-card sync-card" role="dialog" aria-labelledby="syncTitle">
  <div class="modal-head"><h2 id="syncTitle">sync to roblox studio</h2><button class="btn icon" type="button" data-sync-close aria-label="Close">×</button></div>
  <ol class="sync-steps">
    <li><b>Install the plugin once</b><span>Download it, then in Studio: <i>Plugins</i> tab → <i>Plugins Folder</i> → drop the file there and restart Studio.</span>
      <a class="btn mini" href="${PLUGIN_URL}" download="openconstructor-sync.lua">⬇ openconstructor-sync.lua</a></li>
    <li><b>Send this page</b><span>All screens go as one ScreenGui: named buttons, links between screens already wired.</span>
      <button class="btn primary" type="button" id="syncGo">sync now</button></li>
    <li><b>Pull it in Studio</b><span>Toolbar <i>openconstructor</i> → <i>Sync UI</i> → paste the code → <i>Sync</i>. Turn on <i>Live</i> and every “sync now” here updates Studio by itself.</span>
      <div class="sync-code" id="syncCode" hidden><code></code><button class="btn mini" type="button" data-copy>copy</button></div></li>
  </ol>
  <p class="sync-hint" id="syncHint" role="status"></p>
  <p class="sync-fine">Anyone with the code can read this UI, so share it only with your team. Your button scripts in Studio are kept when you re-sync.</p>
</div>`;
document.body.append(modal);
const $ = s => modal.querySelector(s);
const hint = (text, kind = '') => { const h = $('#syncHint'); h.textContent = text; h.dataset.kind = kind; };
const showCode = code => { const box = $('#syncCode'); box.hidden = !code; box.querySelector('code').textContent = code || ''; };

function open(){
  modal.classList.remove('hidden');
  hint('');
  showCode(codes.get()[studio.name()] || '');
}
const close = () => modal.classList.add('hidden');
modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-sync-close]')) close(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
$('[data-copy]').onclick = () => { const c = $('#syncCode code').textContent; navigator.clipboard?.writeText(c).then(() => hint('code copied — paste it into the plugin in Studio', 'ok')); };

async function sync(){
  const go = $('#syncGo');
  if (!supabase) { hint('Accounts are not configured on this build.', 'err'); return; }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) { hint('Sign in first — sync codes belong to your account.', 'err'); openAuth('signin'); return; }
  if (!studio.items().length && !(studio.screens?.count() > 1)) { hint('The page is empty — add some blocks first.', 'err'); return; }
  go.disabled = true; hint('reading the page…');
  try {
    const spec = await robloxSpec();
    hint('uploading…');
    const name = studio.name(), all = codes.get();
    const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ code: all[name] || undefined, spec }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d?.error?.message || `HTTP ${r.status}`);
    all[name] = d.code; codes.set(all);
    showCode(d.code);
    const screens = studio.screens?.count() || 1;
    hint(`synced ${screens > 1 ? screens + ' screens ' : ''}at ${new Date(d.updated).toLocaleTimeString()} — ${all[name] === d.code ? 'paste the code in Studio, or just wait if Live is on' : ''}`, 'ok');
    studio.status('synced to Roblox Studio · code ' + d.code, 'ok');
  } catch (e) { hint('sync failed: ' + e.message, 'err'); }
  finally { go.disabled = false; }
}
$('#syncGo').onclick = sync;

addEventListener('oc:roblox-sync', open);
export const robloxSync = { open, sync };
