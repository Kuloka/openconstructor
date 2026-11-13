// Browser tests: headless Chrome over the DevTools protocol, the AI provider faked with request interception.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);

// A fresh editor in a fresh browser profile. `reply(postBody)` returns the faked model answer:
// a string (normal JSON answer) or { sse: [chunks] } for a streamed one.
// `connect: false` keeps the default free AI (no Groq key); `signedIn` plants a fake account session;
// `routes` = [{ match: url => bool, handle: request => ({ status, type, body: string | Buffer }) }] for other requests.
export async function editor(url, { reply = () => 'ok', lang = 'en', connect = true, signedIn = false, routes = [], port = 9400 + Math.floor(Math.random() * 500) } = {}){
  const bin = CHROMES.find(p => existsSync(p));
  if (!bin) throw Error('Chrome not found — set CHROME=/path/to/chrome');
  const profile = mkdtempSync(join(tmpdir(), 'oc-e2e-'));
  const chrome = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 60 && !targets?.length; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {} if (!targets?.length) await sleep(250); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let n = 0; const wait = new Map(), errors = [], posts = [];
  const send = (method, params = {}) => new Promise(r => { const id = ++n; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description || 'evaluate failed'); return r.result?.result?.value; };
  const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' }];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); return; }
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 200));
    if (m.method === 'Fetch.requestPaused') {
      const rq = m.params.request, id = m.params.requestId;
      if (rq.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: id, responseCode: 204, responseHeaders: cors });
      const route = routes.find(r => r.match(rq.url));
      if (route) {
        const r = route.handle(rq);
        return send('Fetch.fulfillRequest', { requestId: id, responseCode: r.status || 200, responseHeaders: [{ name: 'Content-Type', value: r.type || 'application/json' }, ...(r.headers || []), ...cors], body: Buffer.from(r.body ?? '').toString('base64') });
      }
      if (!rq.url.includes('api.groq.com')) return send('Fetch.continueRequest', { requestId: id });
      let body, type = 'application/json';
      if (rq.url.includes('/models')) body = JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] });
      else {
        posts.push(rq.postData || '');
        const r = reply(rq.postData || '');
        if (r?.sse) { type = 'text/event-stream'; body = r.sse.map(c => 'data: ' + JSON.stringify(c) + '\n\n').join('') + 'data: [DONE]\n\n'; }
        else body = JSON.stringify({ choices: [{ message: { content: r }, finish_reason: 'stop' }], usage: { prompt_tokens: 1234, completion_tokens: 56 } });
      }
      send('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, ...cors], body: Buffer.from(body).toString('base64') });
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api.groq.com*' }, ...(routes.length || signedIn ? [{ urlPattern: '*/api/*' }, { urlPattern: '*supabase.co/auth/*' }] : [])] });
  await send('Page.navigate', { url }); await sleep(2000);
  await ev(`(localStorage.clear(), localStorage.setItem('oc-welcomed','1'), localStorage.setItem('oc-toured','1'), localStorage.setItem('oc-lang','${lang}'), 1)`);
  if (signedIn) {
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp: 4102444800, role: 'authenticated' })}.sig`;
    const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };
    await ev(`(localStorage.setItem('sb-cxzdfjccdggeudsjxjbp-auth-token', ${JSON.stringify(JSON.stringify(session))}), 1)`);
    routes.push({ match: u => u.includes('supabase.co/auth/v1/user'), handle: () => ({ body: JSON.stringify(user) }) });
  }
  await send('Page.navigate', { url }); await sleep(3000);
  if (connect) { // connect the (faked) Groq provider
    await ev(`(document.getElementById('settingsButton').click(), 1)`); await sleep(300);
    // the key field shows once the service's switch is on
    await ev(`(document.querySelector('#providers [data-key=groq]') || document.querySelector('#providers [data-switch=groq]').click(), 1)`); await sleep(150);
    await ev(`(() => { const i = document.querySelector('#providers [data-key=groq]'); i.value = 'gsk_test'; i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-close="settings"]').click(); return 1; })()`);
    await sleep(1500);
  }
  const until = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
  return {
    ev, send, until, errors, posts,
    items: () => ev(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]')`),
    ask: async text => { await ev(`(() => { const p = document.getElementById('prompt'); p.value = ${JSON.stringify(text)}; document.getElementById('send').click(); return 1; })()`); },
    idle: () => until(`!document.querySelector('.message.thinking:not(.folded)')`, 15000),
    close: () => { try { chrome.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500); },
  };
}

export const block = (name, body, { action = 'add', full = false } = {}) => `{"action":"${action}","full":${full},"name":"${name}","reply":"ok"}\n\`\`\`html\n${body}\n\`\`\``;
