// Sign up / sign in: Google, GitHub, email + password, magic link.
// Powered by Supabase Auth. Project keys come from .env.local (see SETUP.md).
import { createClient } from '@supabase/supabase-js';

const $ = id => document.getElementById(id);
const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = URL_ && KEY ? createClient(URL_, KEY) : null;
export let user = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  google: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>',
  github: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>',
};

// ── Sign-in dialog ──
const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'authModal';
modal.innerHTML = `<div class="modal-card auth-card">
  <div class="modal-head"><h2 id="authTitle">sign in</h2><button class="btn icon" data-close="authModal">×</button></div>
  <div class="auth-tabs"><button data-mode="signin" class="active">sign in</button><button data-mode="signup">create account</button></div>
  <div class="auth-off hidden" id="authOff">Accounts aren't connected to a server yet (a Supabase project is needed — see <b>SETUP.md</b>). You can keep using the editor without an account.</div>
  <div class="auth-oauth">
    <button class="btn auth-provider" data-oauth="google">${ICONS.google}<span>continue with Google</span></button>
    <button class="btn auth-provider" data-oauth="github">${ICONS.github}<span>continue with GitHub</span></button>
  </div>
  <div class="auth-or">or with email</div>
  <form id="authForm" class="auth-form">
    <label class="field">Email<input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email" required></label>
    <label class="field">Password<input type="password" id="authPass" placeholder="at least 8 characters" autocomplete="current-password" minlength="8"></label>
    <button class="btn primary block" type="submit" id="authSubmit">sign in</button>
    <button class="btn block auth-magic" type="button" id="authMagic">email me a sign-in code instead</button>
  </form>
  <form id="authCodeForm" class="auth-form hidden" autocomplete="off">
    <label class="field auth-code-field">Code from the email<input id="authCode" inputmode="numeric" pattern="[0-9]{6,10}" maxlength="10" placeholder="••••••••" autocomplete="one-time-code" required></label>
    <button class="btn primary block" type="submit">continue</button>
    <button class="btn block" type="button" id="authResend">send the email again</button>
    <button class="btn block auth-back" type="button" id="authBack">← use password instead</button>
  </form>
  <p class="auth-msg" id="authMsg"></p>
  <p class="auth-legal">By continuing you agree to the <a href="/terms" target="_blank">terms of use</a> and the <a href="/privacy" target="_blank">privacy policy</a>.</p>
</div>`;
document.body.append(modal);
modal.querySelector('[data-close]').onclick = () => modal.classList.add('hidden');
modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };

let mode = 'signin';
function setMode(m){
  mode = m;
  modal.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  $('authTitle').textContent = m === 'signin' ? 'sign in' : 'create account';
  $('authSubmit').textContent = m === 'signin' ? 'sign in' : 'create account';
  $('authPass').autocomplete = m === 'signin' ? 'current-password' : 'new-password';
  codeMode(false);
  msg('');
}
// "code only": the password form and the other options step aside, only the big code field stays
const card = modal.querySelector('.auth-card');
function codeMode(on){
  card.classList.toggle('coding', on);
  $('authCodeForm')?.classList.toggle('hidden', !on);
}
modal.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
const msg = (text, kind = '') => { const el = $('authMsg'); el.textContent = text; el.className = 'auth-msg ' + kind; };
const busy = on => modal.querySelectorAll('button, input').forEach(el => { if (!el.dataset.close && !el.dataset.mode) el.disabled = on; });

export function openAuth(m = 'signin'){
  setMode(m);
  $('authOff').classList.toggle('hidden', !!supabase);
  modal.querySelectorAll('.auth-oauth button, #authForm button, #authForm input').forEach(el => el.disabled = !supabase);
  syncProviders();
  modal.classList.remove('hidden');
  if (supabase) setTimeout(() => $('authEmail').focus(), 50);
}

// Show only the social buttons whose provider is switched on in Supabase,
// so a half-configured project never shows a button that fails.
let enabled = null;
async function syncProviders(){
  const box = modal.querySelector('.auth-oauth'), or = modal.querySelector('.auth-or');
  if (!supabase) return;
  if (!enabled) {
    try { const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } }); enabled = (await r.json()).external || {}; }
    catch { enabled = {}; }
  }
  let any = false;
  box.querySelectorAll('[data-oauth]').forEach(b => { const on = !!enabled[b.dataset.oauth]; b.classList.toggle('hidden', !on); any ||= on; });
  box.classList.toggle('hidden', !any); or.classList.toggle('hidden', !any);
}

const errText = e => ({
  'Invalid login credentials': 'Wrong email or password',
  'User already registered': 'This email is already registered — try signing in',
  'Email not confirmed': 'Please confirm your email: we sent you a link',
}[e?.message] || e?.message || 'Something went wrong');
const back = () => location.origin + location.pathname;

modal.querySelectorAll('[data-oauth]').forEach(b => b.onclick = async () => {
  busy(true); msg('redirecting…');
  const { error } = await supabase.auth.signInWithOAuth({ provider: b.dataset.oauth, options: { redirectTo: back() } });
  if (error) { msg(errText(error), 'err'); busy(false); }
});
$('authForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  if (password.length < 8) { msg('Password must be at least 8 characters', 'err'); return; }
  busy(true); msg('');
  const { data, error } = mode === 'signin'
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: back() } });
  busy(false);
  if (error) {
    if (error.message === 'Email not confirmed') { askCode(email, 'signup'); return msg('Please confirm your email first: enter the code from our email, or click its link.', 'err'); }
    return msg(errText(error), 'err');
  }
  // Supabase answers a sign-up for an existing address with a user that has no identities and sends
  // no email (so nobody can probe which addresses are registered) — tell the person what to do instead
  if (mode === 'signup' && data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
    setMode('signin');
    return msg('This email already has an account. Sign in with your password, or get a sign-in code by email.', 'err');
  }
  if (mode === 'signup' && !data.session) { askCode(email, 'signup'); return msg(`Almost there — we sent a code to ${email}. Enter it below, or click the link in the email.`, 'ok'); }
  modal.classList.add('hidden');
};
$('authMagic').onclick = async () => {
  const email = $('authEmail').value.trim();
  if (!email) { msg('Enter your email', 'err'); $('authEmail').focus(); return; }
  busy(true);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: back() } });
  busy(false);
  if (error) return msg(errText(error), 'err');
  askCode(email, 'email');
  msg(`We sent a code to ${email}. Enter it below, or click the link in the email. Not there? Check the spam folder.`, 'ok');
};

// One-time code from the email (works on any device, unlike the link). type: 'signup' confirms a new
// account, 'email' signs in an existing one.
let codeFor = null;
function askCode(email, type){
  codeFor = { email, type };
  codeMode(true);
  $('authCode').value = '';
  setTimeout(() => $('authCode').focus(), 50);
}
$('authCodeForm').onsubmit = async e => {
  e.preventDefault();
  if (!codeFor) return;
  const token = $('authCode').value.replace(/\D/g, '');
  busy(true);
  let { error } = await supabase.auth.verifyOtp({ email: codeFor.email, token, type: codeFor.type });
  // a code from a sign-in email works for an unconfirmed account too, and the other way round
  if (error) ({ error } = await supabase.auth.verifyOtp({ email: codeFor.email, token, type: codeFor.type === 'signup' ? 'email' : 'signup' }));
  busy(false);
  if (error) return msg(/expired|invalid/i.test(error.message) ? 'This code is wrong or expired — check it, or send the email again.' : errText(error), 'err');
  codeMode(false); codeFor = null;
  modal.classList.add('hidden');
};
$('authCode').oninput = e => { e.target.value = e.target.value.replace(/\D/g, ''); };
$('authBack').onclick = () => { codeMode(false); codeFor = null; msg(''); setTimeout(() => $('authPass').focus(), 50); };
$('authResend').onclick = async () => {
  if (!codeFor) return;
  busy(true);
  const { error } = codeFor.type === 'signup'
    ? await supabase.auth.resend({ type: 'signup', email: codeFor.email, options: { emailRedirectTo: back() } })
    : await supabase.auth.signInWithOtp({ email: codeFor.email, options: { emailRedirectTo: back() } });
  busy(false);
  msg(error ? errText(error) : `Sent again to ${codeFor.email}. It can take a minute; check the spam folder too.`, error ? 'err' : 'ok');
};

// ── Account button in the title bar ──
const acc = document.createElement('div');
acc.className = 'account';
document.querySelector('.tb-right').prepend(acc);
function renderAccount(){
  if (!user) {
    acc.innerHTML = `<button class="btn" id="loginBtn">sign in</button><button class="btn accent-outline" id="signupBtn">sign up</button>`;
    $('loginBtn').onclick = () => openAuth('signin'); $('signupBtn').onclick = () => openAuth('signup');
    return;
  }
  // Name and avatar come from Google/GitHub — escape before inserting into HTML
  const name = esc(user.user_metadata?.full_name || user.user_metadata?.user_name || user.email);
  const avatar = /^https:\/\//.test(user.user_metadata?.avatar_url || '') ? esc(user.user_metadata.avatar_url) : '';
  acc.innerHTML = `<button class="account-chip" id="accChip" title="${name}">${avatar ? `<img src="${avatar}" alt="" referrerpolicy="no-referrer">` : `<span>${(name || '?')[0].toUpperCase()}</span>`}<em>${name}</em></button>`;
  $('accChip').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('oc:account-menu', { detail: { x: r.left, y: r.bottom + 4 } }));
  };
}
export async function signOut(){ await supabase?.auth.signOut(); }

if (supabase) {
  supabase.auth.getSession().then(({ data }) => { user = data.session?.user || null; renderAccount(); });
  supabase.auth.onAuthStateChange((_e, session) => { user = session?.user || null; renderAccount(); window.dispatchEvent(new CustomEvent('oc:auth', { detail: user })); });
}
renderAccount();
