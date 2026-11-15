// openconstructor desktop: splash → sign in → Home (Web interface · Code · Agents) → the editor or the agents.
// Everything that touches the computer goes through window.oc (preload.cjs → main.cjs).
import { swarmGlyph } from '../../swarm-glyph.js';
import { field, tilt, burst, buildLogo, letters } from './fx.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let session = null;

/* ── screens ── */
const SCREENS = { splash: 'splash', auth: 'auth', home: 'home', web: 'web', agents: 'agentsScreen' };
const bg = field($('field'));
function go(name){
  const swap = () => {
    for (const [k, id] of Object.entries(SCREENS)) $(id).hidden = k !== name;
    document.body.dataset.screen = name;
    bg.pause(name === 'web'); // the editor covers the window: no need to draw the field under it
    if (name === 'home') enterHome();
    if (name === 'agents') enterAgents();
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap); else swap();
}
window.__go = go; // for screenshots (main.cjs OC_SCREEN / OC_JS)
window.__open = (...a) => openWeb(...a);
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  const o = e.target.closest('[data-open]'); if (o) { openWeb(o.dataset.open); return; }
  const p = e.target.closest('[data-web-path]'); if (p) openWeb('web', p.dataset.webPath);
});
function toast(text){ const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); }

/* ── splash ── */
buildLogo($('pxLogo'));
letters($('wordmark'), [['open', 'dim'], ['constructor']]);
setTimeout(() => $('pxLogo').classList.add('glow'), 1100);

/* ── sign in ── */
let tab = 'signin', codeEmail = '';
const tabs = document.querySelector('.tabs');
function setTab(t){
  tab = t; tabs.dataset.tab = t;
  tabs.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('authLabel').textContent = t === 'signin' ? 'Sign in' : 'Create account';
  $('password').autocomplete = t === 'signin' ? 'current-password' : 'new-password';
  msg('');
}
tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
$('eye').onclick = () => { const p = $('password'); p.type = p.type === 'password' ? 'text' : 'password'; };
const msg = (text, kind = '') => { const m = $('authMsg'); m.className = 'auth-msg' + (kind ? ' ' + kind : ''); m.textContent = text; void m.offsetWidth; };
// the one-time code: six boxes, typing moves on, paste fills all
$('otp').innerHTML = Array.from({ length: 6 }, () => '<input inputmode="numeric" maxlength="1" aria-label="code digit">').join('');
const boxes = [...$('otp').querySelectorAll('input')];
boxes.forEach((b, i) => {
  b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); b.classList.toggle('filled', !!b.value); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every(x => x.value)) $('authForm').requestSubmit(); });
  b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
  b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!d) return; e.preventDefault(); boxes.forEach((x, k) => { x.value = d[k] || ''; x.classList.toggle('filled', !!x.value); }); if (d.length === 6) $('authForm').requestSubmit(); });
});
function askCode(email){
  codeEmail = email; $('stepCreds').hidden = true; $('stepCode').hidden = false; tabs.hidden = true;
  $('codeNote').textContent = `We sent a 6-digit code to ${email}. It may take a minute — check spam too.`;
  $('authLabel').textContent = 'Confirm'; boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); }); boxes[0].focus();
}
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('authSubmit'); if (btn.classList.contains('busy')) return;
  let r;
  if (codeEmail) {
    const code = boxes.map(b => b.value).join(''); if (code.length < 6) return msg('Enter all 6 digits.', 'err');
    btn.classList.add('busy'); r = await window.oc.verify(codeEmail, code); btn.classList.remove('busy');
  } else {
    const email = $('email').value.trim(), password = $('password').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Enter your email.', 'err');
    if (password.length < 6) return msg('The password needs at least 6 characters.', 'err');
    btn.classList.add('busy'); r = await (tab === 'signin' ? window.oc.signIn(email, password) : window.oc.signUp(email, password)); btn.classList.remove('busy');
    if (r?.needCode) { askCode(email); return msg(tab === 'signup' ? 'Account created — confirm it with the code.' : 'Confirm your email first with the code.', 'ok'); }
  }
  if (r?.error) return msg(/invalid login/i.test(r.error) ? 'Wrong email or password.' : /already registered/i.test(r.error) ? 'This email already has an account — sign in instead.' : /token|otp|expired/i.test(r.error) ? 'This code is wrong or expired.' : r.error, 'err');
  if (r?.session) signedIn(r.session);
});
async function signedIn(s){
  session = s;
  const rect = $('authSubmit').getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  $('authForm').classList.add('leave');
  await sleep(500); go('home');
}
$('skipAuth').onclick = () => go('home');
// the headline's last word keeps changing
const WORDS = ['by talking.', 'with Claude Code.', 'with Codex.', 'with Gemini.', 'in minutes.'];
let wi = 0;
setInterval(() => { if ($('auth').hidden) return; wi = (wi + 1) % WORDS.length; $('rotator').innerHTML = `<b>${WORDS[wi]}</b>`; }, 2600);

/* ── home ── */
document.querySelectorAll('.tile').forEach(t => tilt(t));
let homeReady = false;
function enterHome(){
  const user = session?.user, email = user?.email || '';
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name || (email ? email.split('@')[0] : '');
  const h = new Date().getHours(), part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('hello').innerHTML = name ? `${part}, <span class="name">${esc(name.replace(/^./, c => c.toUpperCase()))}</span>.` : `${part}.`;
  $('avatarLetter').textContent = (name || '?')[0].toUpperCase();
  $('meEmail').textContent = email || 'Not signed in';
  $('signOut').textContent = session ? 'Sign out' : 'Sign in';
  if (homeReady) return; homeReady = true;
  $('askSwarm').append(swarmGlyph()); $('tileSwarm').append(swarmGlyph({ dots: 70 }));
}
const tickClock = () => { $('clock').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
tickClock(); setInterval(tickClock, 15000);
$('avatar').onclick = e => { e.stopPropagation(); $('meMenu').hidden = !$('meMenu').hidden; };
document.addEventListener('click', () => { $('meMenu').hidden = true; });
$('signOut').onclick = async () => { if (session) { await window.oc.signOut(); session = null; } setTab('signin'); $('authForm').classList.remove('leave'); go('auth'); };
$('ask').addEventListener('submit', e => { e.preventDefault(); const text = $('askInput').value.trim(); if (!text) return $('askInput').focus(); openWeb('web', '', text); $('askInput').value = ''; });
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('home').hidden) { e.preventDefault(); $('askInput').focus(); }
  if ($('home').hidden || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { if (e.key === 'Escape' && !$('agentsScreen').hidden) go('home'); return; }
  if (e.key === '1') openWeb('web'); if (e.key === '2') openWeb('code'); if (e.key === '3') go('agents');
});
$('stFolder').onclick = () => window.oc.openFolder();
$('stMcp').onclick = async () => {
  const cmd = 'claude mcp add openconstructor -- npx -y openconstructor mcp';
  try { await navigator.clipboard.writeText(cmd); toast('Copied: ' + cmd); } catch { toast(cmd); }
};

/* ── the editor (the website itself, signed in with the same account) ── */
let webview = null, webMode = 'web', pendingPrompt = '', primed = false, webBase = '';
async function openWeb(mode = 'web', pathPart = '', prompt = ''){
  go('web'); setMode(mode, false);
  pendingPrompt = prompt;
  const { url, storageKey, session: s } = await window.oc.web();
  webBase = url;
  const target = url + (pathPart || '') + (mode === 'code' ? '#code' : '');
  $('webLoad').classList.remove('done'); $('webState').textContent = '';
  if (!$('loadSwarm').firstChild) $('loadSwarm').append(swarmGlyph({ dots: 40 }));
  if (!webview) {
    webview = document.createElement('webview');
    webview.setAttribute('partition', 'persist:openconstructor');
    webview.setAttribute('allowpopups', '');
    $('webWrap').append(webview);
    webview.addEventListener('dom-ready', async () => {
      // first load: hand over the account and skip the website's welcome and tour, then load again
      if (!primed) {
        primed = true;
        const set = s ? `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(s))});` : '';
        await webview.executeJavaScript(`${set} localStorage.setItem('oc-welcomed','1'); localStorage.setItem('oc-toured','1'); 1`).catch(() => {});
        webview.reload(); return;
      }
      $('webLoad').classList.add('done');
      $('webState').textContent = session ? (session.user?.email || '') : 'not signed in';
      if (pendingPrompt) {
        const p = pendingPrompt; pendingPrompt = '';
        await sleep(1200);
        webview.executeJavaScript(`(() => { const i = document.getElementById('prompt'); if (!i) return 0; i.value = ${JSON.stringify(p)}; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('send')?.click(); return 1; })()`).catch(() => {});
      }
    });
    webview.addEventListener('did-fail-load', e => { if (e.errorCode !== -3) { $('webLoad').classList.remove('done'); $('webLoad').lastChild.textContent = `Could not open the editor (${e.errorDescription}). Check the connection.`; } });
    webview.src = target;
  } else if (webview.getURL() !== target) { webview.loadURL(target); } else { $('webLoad').classList.add('done'); }
}
function setMode(mode, navigate = true){
  webMode = mode; const seg = document.querySelector('.seg'); seg.dataset.mode = mode;
  seg.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  if (navigate && webview) webview.loadURL(webBase + (mode === 'code' ? '#code' : ''));
}
document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && b.dataset.mode !== webMode) setMode(b.dataset.mode); });
$('webBrowser').onclick = () => window.oc.openExternal(webview?.getURL() || webBase);

/* ── agents ── */
const IDEAS = ['A landing page for a coffee shop', 'A SaaS pricing page with three plans', 'A portfolio for a photographer', 'A dark dashboard for sales'];
const MOODS = ['thinking', 'reading the catalog', 'composing', 'assembling', 'checking the screenshot', 'polishing'];
let agents = [], current = null, connected = false, busy = false, agentsReady = false;
const tools = new Map(); let aiMsg = null, thought = null;
const frame = $('frame'), wrap = $('frameWrap');
async function enterAgents(){
  if (agentsReady) return; agentsReady = true;
  const state = await window.oc.state();
  $('folderName').textContent = state.folder; $('url').textContent = state.previewUrl.replace('http://', ''); frame.src = state.previewUrl;
  agents = await window.oc.agents(); renderAgents(); setComposer();
}
document.querySelector('.devices').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.devices button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  const w = +b.dataset.w; wrap.classList.toggle('narrow', !!w); frame.style.width = w ? `${w}px` : '100%';
});
$('reload').onclick = () => { frame.src = frame.src; };
$('openFolder').onclick = () => window.oc.openFolder();
$('openBrowser').onclick = () => window.oc.openInBrowser();
$('folder').onclick = async () => {
  const f = await window.oc.chooseFolder(); if (!f) return;
  $('folderName').textContent = f; $('stFolderPath').textContent = f; frame.src = frame.src; connected = false; setComposer(); renderAgents();
  note(`Project folder: ${f}. Connect the agent again for the new folder.`);
};
function renderAgents(){
  $('agents').innerHTML = agents.map(a => {
    const on = a.id === current && connected;
    const st = on ? '<span class="ast on">connected</span>' : a.available ? '<span class="ast ready">ready</span>' : '<span class="ast missing">not installed</span>';
    return `<button type="button" class="agent${a.available ? '' : ' missing'}" role="radio" aria-checked="${a.id === current}" data-agent="${a.id}"><span class="mark">${esc(a.name[0])}</span><span class="who"><b>${esc(a.name)}</b><span>${esc(a.available ? `${a.by} · ${a.note}` : `Install: ${a.install}`)}</span></span>${st}</button>`;
  }).join('');
}
$('agents').addEventListener('click', e => { const b = e.target.closest('[data-agent]'); if (b) connect(b.dataset.agent); });
function conn(html, cls = ''){ const c = $('conn'); c.hidden = !html; c.className = 'conn' + (cls ? ' ' + cls : ''); c.innerHTML = html || ''; }
async function connect(id){
  if (busy) return;
  const a = agents.find(x => x.id === id); current = id; connected = false; renderAgents(); setComposer();
  if (!a.available) { conn(`<b>${esc(a.name)} is not installed.</b><span>${esc(a.install)}</span>`, 'err'); return; }
  conn(`<span>Starting ${esc(a.name)}… the first start can take a minute while it downloads.</span>`);
  handleConnect(a, await window.oc.connect(id));
}
function handleConnect(a, r){
  if (r.error) { conn(`<b>${esc(a.name)} could not start.</b><span>${esc(r.error)}</span>${r.tail ? `<pre>${esc(r.tail)}</pre>` : ''}<span>${esc(a.install)}</span>`, 'err'); return; }
  if (r.ready) {
    connected = true; renderAgents(); setComposer();
    conn(`<span><b>${esc(r.info?.agentInfo?.title || r.info?.agentInfo?.name || a.name)}</b> is connected with openconstructor's tools. Describe the page.</span>`);
    $('input').focus(); return;
  }
  const methods = r.authMethods || [];
  conn(`<b>Sign in to ${esc(a.name)}</b><span>${methods.length ? 'Choose how. A browser window may open.' : 'Run it once in a terminal to sign in, then click it here again.'}</span><div class="row">${methods.map((m, i) => `<button type="button" class="${i ? '' : 'primary'}" data-auth="${esc(m.id)}" title="${esc(m.description || '')}">${esc(m.name || m.id)}</button>`).join('')}</div>`);
}
$('conn').addEventListener('click', async e => {
  const b = e.target.closest('[data-auth]'); if (!b) return;
  const a = agents.find(x => x.id === current); conn('<span>Waiting for the sign-in to finish…</span>');
  handleConnect(a, await window.oc.authenticate(b.dataset.auth));
});
const log = $('log');
const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;
function add(el){ const stick = atBottom(); $('logHello')?.remove(); log.append(el); if (stick) log.scrollTop = log.scrollHeight; return el; }
const div = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
const note = (text, err) => add(div('note' + (err ? ' err' : ''), esc(text)));
window.oc.on('update', u => {
  const kind = u.sessionUpdate, text = u.content?.type === 'text' ? u.content.text : '';
  if (kind === 'agent_message_chunk') { thought = null; if (!aiMsg) aiMsg = add(div('msg ai')); const stick = atBottom(); aiMsg.textContent += text; if (stick) log.scrollTop = log.scrollHeight; }
  else if (kind === 'agent_thought_chunk') { if (!thought) thought = add(div('thought')); thought.textContent = (thought.textContent + text).slice(-600); }
  else if (kind === 'tool_call') { aiMsg = null; thought = null; tools.set(u.toolCallId, add(div(`tool ${u.status || 'pending'}`, `<i></i><span>${esc(u.title || u.kind || 'tool')}</span>`))); }
  else if (kind === 'tool_call_update') { const row = tools.get(u.toolCallId); if (row) { if (u.status) row.className = `tool ${u.status}`; if (u.title) row.querySelector('span').textContent = u.title; } }
  else if (kind === 'plan') { aiMsg = null; let p = log.lastElementChild; if (!p?.classList.contains('plan')) p = add(div('plan')); p.innerHTML = (u.entries || []).map(x => `<div class="${x.status === 'completed' ? 'done' : esc(x.status)}">${x.status === 'completed' ? '✓' : x.status === 'in_progress' ? '›' : '·'} ${esc(x.content)}</div>`).join(''); }
});
window.oc.on('permission', ({ requestId, toolCall, options }) => {
  const card = add(div('perm', `<b>${esc(toolCall?.title || 'The agent wants to run a tool')}</b><div class="row">${(options || []).map(o => `<button type="button" class="${/allow/.test(o.kind) ? 'primary' : ''}" data-opt="${esc(o.optionId)}">${esc(o.name)}</button>`).join('')}</div>`));
  card.addEventListener('click', e => { const b = e.target.closest('[data-opt]'); if (!b) return; window.oc.answerPermission(requestId, b.dataset.opt); card.remove(); });
});
window.oc.on('agent-exit', ({ tail }) => {
  connected = false; setWorking(false); renderAgents(); setComposer();
  const a = agents.find(x => x.id === current);
  conn(`<b>${esc(a?.name || 'The agent')} stopped.</b>${tail ? `<pre>${esc(tail)}</pre>` : ''}<span>Click it to start again.</span>`, 'err');
});
const input = $('input');
function setComposer(){
  input.disabled = !connected; $('send').disabled = !connected; $('send').textContent = busy ? 'Stop' : 'Send';
  $('hint').textContent = !connected ? 'Connect an agent to start' : busy ? 'The agent is working…' : 'Enter to send · Shift+Enter for a new line';
}
let clock = 0, moodT = 0, t0 = 0;
function setWorking(on){
  busy = on; $('working').hidden = !on; setComposer(); clearInterval(clock); clearInterval(moodT);
  const box = $('swarm'); box.innerHTML = ''; if (!on) return;
  box.append(swarmGlyph()); t0 = Date.now(); let i = 0; $('mood').textContent = MOODS[0];
  clock = setInterval(() => { $('time').textContent = Math.floor((Date.now() - t0) / 1000) + 's'; }, 500);
  moodT = setInterval(() => { $('mood').textContent = MOODS[i = (i + 1) % MOODS.length]; }, 2400);
}
async function sendText(text){
  if (!text.trim() || !connected) return;
  add(div('msg me', esc(text))); aiMsg = null; thought = null; input.value = ''; setWorking(true);
  const r = await window.oc.prompt(text); setWorking(false);
  if (r?.error) note(r.error, true); else if (r?.stopReason && r.stopReason !== 'end_turn') note(r.stopReason === 'cancelled' ? 'Stopped.' : `Stopped: ${r.stopReason}`);
}
$('composer').addEventListener('submit', e => { e.preventDefault(); if (busy) window.oc.cancel(); else sendText(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) sendText(input.value); } });
$('ideas').innerHTML = IDEAS.map(t => `<button type="button">${esc(t)}</button>`).join('');
$('ideas').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; input.value = b.textContent; if (connected) input.focus(); });

/* ── start: the splash plays while the session loads ── */
const [s, state] = await Promise.all([window.oc.session(), window.oc.state(), sleep(2300)]);
session = s && !s.error ? s : null;
$('stFolderPath').textContent = state.folder;
go(session ? 'home' : 'auth');
