// The openconstructor account in the desktop app: the same Supabase project as the website (email + password,
// a one-time code from the email to confirm), talked to over its REST API. The session is kept encrypted with the
// operating system's key store (Electron safeStorage) and handed to the embedded editor, so you sign in once.
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

// public values, the same as the website's (the anon key only allows what row-level security allows)
const SB = 'https://cxzdfjccdggeudsjxjbp.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4emRmamNjZGdnZXVkc2p4amJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODY5MDcsImV4cCI6MjEwOTU2MjkwN30.5hP7ZGisLhXKGrxc2598Jhn9BuKsaraRMYNcmx9ldRY';
const STORAGE_KEY = 'sb-cxzdfjccdggeudsjxjbp-auth-token'; // what supabase-js in the editor reads

let anon = ANON;
const file = () => path.join(app.getPath('userData'), 'session.bin');

async function call(route, body){
  const r = await fetch(`${SB}/auth/v1/${route}`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.msg || d.error_description || d.message || `sign-in failed (${r.status})`);
  return d;
}
// supabase-js's own session shape, so the editor accepts it as is
const shape = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, token_type: 'bearer', expires_in: d.expires_in, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user });

function save(session){
  const text = JSON.stringify(session);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text));
}
function load(){
  try { const buf = fs.readFileSync(file()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString()); } catch { return null; }
}

const account = {
  setKey(key){ if (key) anon = key; },
  storageKey: STORAGE_KEY,
  // the session, refreshed when it is about to expire; null when signed out
  async session(){
    let s = load(); if (!s) return null;
    if (s.expires_at && s.expires_at - 60 < Date.now() / 1000) {
      try { s = shape(await call('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); save(s); }
      catch { this.signOut(); return null; }
    }
    return s;
  },
  async signIn(email, password){
    try { const s = shape(await call('token?grant_type=password', { email, password })); save(s); return { session: s }; }
    catch (e) { if (/not confirmed/i.test(e.message)) { await call('resend', { type: 'signup', email }).catch(() => {}); return { needCode: true }; } throw e; }
  },
  async signUp(email, password){
    const d = await call('signup', { email, password });
    if (d.access_token) { const s = shape(d); save(s); return { session: s }; }
    return { needCode: true }; // confirmation email with a one-time code
  },
  async verify(email, token){
    let d;
    try { d = await call('verify', { type: 'signup', email, token }); }
    catch { d = await call('verify', { type: 'email', email, token }); }
    const s = shape(d); save(s); return { session: s };
  },
  signOut(){ try { fs.rmSync(file(), { force: true }); } catch {} },
};

module.exports = { account };
