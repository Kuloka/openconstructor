// Cloudflare Worker for openconstructor.pw
// /p/<slug> -> a page published from the editor (Supabase table `pages`, see supabase/publish.sql)
//   forms on it post to /api/form/<slug> (stored in `form_submissions`, the author gets an e-mail via Resend), each visit counts a view (supabase/manage.sql)
// /api/ai, /api/ai/quota -> free AI without a key for signed-in users (Groq, quota in supabase/ai.sql)
// everything else -> the static site (assets binding, SPA fallback)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const HOME = 'https://openconstructor.pw';
const ISSUES = 'https://github.com/Kuloka/openconstructor/issues';

// User content lives on our main domain: sandbox it (no allow-same-origin -> opaque
// origin, no access to openconstructor.pw cookies/storage) and forbid scripts.
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `sandbox allow-popups allow-popups-to-escape-sandbox allow-forms; script-src 'none'; object-src 'none'; base-uri 'none'; form-action ${HOME}/api/form/`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function badge(slug){
  const report = `${ISSUES}/new?title=${encodeURIComponent(`Report published page /p/${slug}`)}&body=${encodeURIComponent(`Page: ${HOME}/p/${slug}\nReason: `)}`;
  const box = 'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid #3a302d;border-radius:6px;background:#121010ee;box-shadow:0 6px 24px #0008;font:12px/1.4 ui-monospace,Consolas,monospace;color:#cbc0bb';
  const link = 'all:unset;cursor:pointer;color:#f2ece9;font:inherit';
  const muted = 'all:unset;cursor:pointer;color:#948884;font:inherit;text-decoration:underline';
  return `\n<div data-oc-badge style="${box}"><a href="${HOME}" target="_blank" rel="noopener" style="${link}">Made with <b style="all:unset;color:#e4572e;font-weight:600">openconstructor</b></a><a href="${esc(report)}" target="_blank" rel="noopener" style="${muted}">report</a></div>\n`;
}

// Social preview tags (each skipped when the page already declares its own)
function ogTags(html, slug, title){
  const t = String(title || '').trim() || 'Made with openconstructor';
  const has = k => new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']?${k.replace(/[.:]/g, '\\$&')}["'\\s/>]`, 'i').test(html);
  return [
    ['property', 'og:title', t],
    ['property', 'og:description', 'Made with openconstructor'],
    ['property', 'og:image', `${HOME}/og.png`],
    ['property', 'og:url', `${HOME}/p/${slug}`],
    ['property', 'og:type', 'website'],
    ['name', 'twitter:card', 'summary_large_image'],
  ].filter(([, k]) => !has(k)).map(([a, k, v]) => `<meta ${a}="${k}" content="${esc(v)}">`).join('\n');
}

function inject(html, slug, title){
  const meta = ogTags(html, slug, title);
  if (meta) {
    const h = /<head\b[^>]*>/i.exec(html);
    if (h) {
      const at = h.index + h[0].length;
      html = html.slice(0, at) + '\n' + meta + html.slice(at);
    } else {
      // no <head>: put one right after <!doctype>/<html> if present, else at the very start
      const lead = /^\s*(?:<!doctype[^>]*>\s*)?(?:<html\b[^>]*>)?/i.exec(html);
      const at = lead ? lead[0].length : 0;
      html = html.slice(0, at) + `\n<head>\n${meta}\n</head>\n` + html.slice(at);
    }
  }
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i === -1 ? html + badge(slug) : html.slice(0, i) + badge(slug) + html.slice(i);
}

function notice(status, title, text, link = { href: HOME, label: 'open openconstructor' }){
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · openconstructor</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0c0a09;color:#f2ece9;font:14px/1.6 "JetBrains Mono",Consolas,ui-monospace,monospace}
main{max-width:440px;text-align:center}.code{font-size:56px;font-weight:700;color:#e4572e;letter-spacing:-.02em;margin:0}h1{font-size:15px;font-weight:600;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.08em;color:#cbc0bb}p{color:#948884;margin:0 0 22px}
a{display:inline-block;padding:8px 16px;border-radius:4px;background:#e4572e;color:#1a0703;font-weight:600;text-decoration:none}a:hover{background:#f06a3f}</style></head>
<body><main><p class="code">${status}</p><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="${esc(link.href)}">${esc(link.label)}</a></main></body></html>`;
  return new Response(body, { status, headers: { ...PAGE_HEADERS, 'Cache-Control': 'no-store' } });
}

// Forms on published pages: a <form> without its own action posts to /api/form/<slug>; inputs without
// a name get one (from the placeholder or label) so their values arrive; a hidden field catches bots.
function formsWork(res, slug){
  return new HTMLRewriter()
    .on('form', { element(el){
      const action = (el.getAttribute('action') || '').trim();
      if (action && !action.startsWith('#') && !/^javascript:/i.test(action)) return;
      el.setAttribute('action', `${HOME}/api/form/${slug}`);
      el.setAttribute('method', 'post');
      el.removeAttribute('enctype');
      el.append('<input type="text" name="_oc_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">', { html: true });
    } })
    .on('form input, form textarea, form select', { element(el){
      if (el.getAttribute('name')) return;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['submit', 'button', 'reset', 'image', 'file', 'hidden'].includes(type)) return;
      const label = el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('id') || type || el.tagName.toLowerCase();
      el.setAttribute('name', label.replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || 'field');
    } })
    .transform(res);
}

// Views: one per visitor per page every 30 minutes; bots and link previews don't count
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|monitor|curl|wget|python|headless|lighthouse/i;
async function countView(request, env, slug){
  if (BOT_UA.test(request.headers.get('user-agent') || '')) return;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const seen = new Request(`${HOME}/__views/${slug}/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  if (await cache.match(seen)) return;
  await cache.put(seen, new Response('1', { headers: { 'Cache-Control': 'max-age=1800' } }));
  await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/page_view`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug }),
  });
}

// A form sent from a published page: stored for the page's author (see supabase/manage.sql)
async function formSubmit(request, env, ctx, slug){
  const back = { href: `${HOME}/p/${slug}`, label: 'back to the page' };
  if (!SLUG_RE.test(slug)) return notice(404, 'page not found', 'There is no published page at this address.');
  if ((+request.headers.get('content-length') || 0) > 60000) return notice(413, 'too much text', 'The form is too large to send.', back);
  // one submission per visitor every 15 seconds
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const cache = caches.default, gate = new Request(`${HOME}/__forms/${encodeURIComponent(ip)}`);
  if (await cache.match(gate)) return notice(429, 'just a moment', 'Please wait a few seconds before sending again.', back);
  let fd;
  try { fd = await request.formData(); } catch { return notice(400, 'nothing sent', 'The form could not be read.', back); }
  const thanks = () => notice(200, 'sent ✓', 'Thank you! Your message has been delivered to the author of this page.', back);
  if (String(fd.get('_oc_hp') || '').trim()) return thanks(); // a bot filled the hidden field
  const data = {}; let n = 0;
  for (const [k, v] of fd) {
    if (k === '_oc_hp' || typeof v !== 'string') continue;
    if (++n > 40) break;
    const key = String(k).slice(0, 80) || 'field', val = v.slice(0, 3000);
    data[key] = key in data ? [].concat(data[key], val) : val;
  }
  if (!Object.values(data).some(v => String(v).trim())) return notice(400, 'empty form', 'Fill in the form before sending.', back);
  await cache.put(gate, new Response('1', { headers: { 'Cache-Control': 'max-age=15' } }));
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/submit_form`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_data: data }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/too many/i.test(t)) return notice(429, 'try again tomorrow', 'This page has received too many messages today.', back);
      if (/page not found/i.test(t)) return notice(404, 'page not found', 'This page is not accepting messages right now.', back);
      throw new Error(`supabase ${r.status}`);
    }
  } catch (err) {
    console.error('form: store failed', slug, err?.message);
    return notice(502, 'not sent', 'Your message could not be sent right now. Please try again in a minute.', back);
  }
  ctx.waitUntil(notifyAuthor(env, slug, data).catch(err => console.error('form: e-mail failed', slug, err?.message)));
  return thanks();
}

// E-mail the page's author about a new form message (Resend). Needs two secrets:
//   RESEND_API_KEY             — wrangler secret put RESEND_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY  — to look up the author's address (it never leaves the worker)
// MAIL_FROM (optional var) — a sender on a domain verified in Resend, default forms@openconstructor.pw
async function notifyAuthor(env, slug, data){
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/json' };
  const base = `${env.SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}`;
  let r = await fetch(base + '&select=owner,title,notify_email', { headers: svc });
  if (r.status === 400) r = await fetch(base + '&select=owner,title', { headers: svc });
  if (!r.ok) throw new Error(`pages ${r.status}`);
  const page = (await r.json())[0];
  if (!page || page.notify_email === false) return;
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${page.owner}`, { headers: svc });
  if (!u.ok) throw new Error(`user ${u.status}`);
  const to = (await u.json())?.email;
  if (!to) return;
  const rows = Object.entries(data).map(([k, v]) => [k, [].concat(v).join(', ')]);
  const replyTo = rows.map(([, v]) => v).find(v => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(v.trim()));
  const pageUrl = `${HOME}/p/${slug}`, title = page.title || slug;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
<p style="margin:0 0 4px;color:#71717a;font-size:13px">New message from your page</p>
<h2 style="margin:0 0 16px;font-size:20px"><a href="${pageUrl}" style="color:#e4572e;text-decoration:none">${esc(title)}</a></h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#71717a;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 0;color:#71717a;font-size:12px">All messages are in the editor: publish → your published pages → ✉. ${replyTo ? 'Reply to this e-mail to answer the sender.' : ''} To stop these e-mails, switch off ✉ e-mail for this page there.</p>
<p style="margin:8px 0 0;color:#a1a1aa;font-size:12px">openconstructor · <a href="${HOME}" style="color:#a1a1aa">openconstructor.pw</a></p></div>`;
  const text = `New message from ${pageUrl}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nAll messages: open the editor → publish → your published pages → ✉.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'openconstructor <forms@openconstructor.pw>', to: [to], subject: `New message from /p/${slug}`, html, text, ...(replyTo ? { reply_to: replyTo.trim() } : {}) }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function servePage(request, env, ctx, slug){
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (!SLUG_RE.test(slug)) return notice(404, 'page not found', 'There is no published page at this address.');

  const cache = caches.default;
  const key = new Request(`${HOME}/p/${slug}`, { method: 'GET' });
  let res = await cache.match(key);
  if (!res) {
    let rows;
    try {
      const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' };
      const base = `${env.SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}`;
      // moderated pages (hidden = true) disappear; fall back step by step if migrations haven't been run yet
      let api = await fetch(base + '&select=html,title,paused&hidden=eq.false', { headers });
      if (api.status === 400) api = await fetch(base + '&select=html,title&hidden=eq.false', { headers });
      if (api.status === 400) api = await fetch(base + '&select=html,title', { headers });
      if (!api.ok) throw new Error(`supabase ${api.status}`);
      rows = await api.json();
    } catch (err) {
      console.error('publish: fetch failed', slug, err?.message);
      return notice(502, 'temporarily unavailable', 'This page could not be loaded right now. Please try again in a minute.');
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row.html !== 'string') {
      return notice(404, 'page not found', 'This page does not exist or was unpublished by its author.');
    }
    if (row.paused) return notice(404, 'page is turned off', 'The author has turned this page off for now. Try again later.');
    res = formsWork(new Response(inject(row.html, slug, row.title), { status: 200, headers: { ...PAGE_HEADERS, 'Cache-Control': 'public, max-age=60' } }), slug);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  if (request.method === 'GET') ctx.waitUntil(countView(request, env, slug).catch(() => {}));
  return request.method === 'HEAD' ? new Response(null, res) : res;
}

// ---------- free AI (no key): signed-in users, AI_DAILY generations a day via our Groq key ----------
const AI_DAILY = 20;
const AI_GLOBAL = 900; // keep both <= the ceilings in supabase/ai.sql
const AI_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];
const AI_MAX_BODY = 200_000;
const AI_MAX_TOKENS = 8000;
// Open models on Cloudflare's GPUs through the AI binding: no API keys. Tried first, in this order
// (both work on the Workers Free plan; ~10k neurons a day, then the keyed backends below answer).
const WORKERS_AI_MODELS = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

// Free-AI upstreams, tried in this order. Each one is used only if its secret is set
// (`npx wrangler secret put <SECRET>`); when one is out of quota (429) or down (5xx), the next one answers.
// Cloudflare Workers AI needs no key and goes first.
const BACKENDS = [
  { id: 'openrouter', secret: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/free', extra: { } },
  { id: 'mistral', secret: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-medium-latest', extra: { } },
  { id: 'groq', secret: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { id: 'gemini', secret: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', extra: { reasoning_effort: 'low' } },
];
const freeBackends = env => [...(env.AI ? WORKERS_AI_MODELS.map(model => ({ id: 'workers-ai', model })) : []), ...BACKENDS.filter(b => env[b.secret])];
const freeBackend = env => freeBackends(env)[0]?.id || null;

// Call the upstreams in order and always answer in OpenAI chat-completions shape: { status, text, be }.
async function callUpstream(env, body){
  let last = null;
  for (const b of freeBackends(env)) {
    const r = b.id === 'workers-ai' ? await callWorkersAI(env, body, b.model) : await callOpenAICompatible(env, b, body);
    if (r.status >= 200 && r.status < 300) return r;
    last = r;
    console.error('ai: backend failed, trying next', b.id, r.status, String(r.text).slice(0, 200));
    if (!(r.status === 429 || r.status >= 500 || r.status === 402 || r.status === 401 || r.status === 403)) break; // a real request error: don't retry elsewhere
  }
  return last || { status: 503, text: 'no backend', be: null };
}
async function callOpenAICompatible(env, b, body){
  const headers = { Authorization: `Bearer ${env[b.secret]}`, 'Content-Type': 'application/json' };
  if (b.id === 'openrouter') { headers['HTTP-Referer'] = 'https://openconstructor.pw'; headers['X-Title'] = 'openconstructor'; }
  try {
    const r = await fetch(b.url, { method: 'POST', headers, body: JSON.stringify({ model: b.model, messages: body.messages, max_tokens: body.max_tokens, ...b.extra }) });
    return { status: r.status, text: await r.text(), be: b.id };
  } catch (err) { return { status: 502, text: String(err?.message || err), be: b.id }; }
}
async function callWorkersAI(env, body, model){
  const be = 'workers-ai';
  // Workers AI binding: returns { response } — wrap it like an OpenAI completion
  try {
    const out = await env.AI.run(model, { messages: body.messages, max_tokens: Math.min(body.max_tokens, 4096) });
    const content = typeof out === 'string' ? out : out?.response ?? out?.choices?.[0]?.message?.content ?? '';
    return { status: 200, be, text: JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: out?.finish_reason === 'length' ? 'length' : 'stop' }] }) };
  } catch (err) {
    const msg = String(err?.message || err);
    return { status: /limit|quota|neurons|429/i.test(msg) ? 429 : 502, text: msg, be };
  }
}

const json = (status, data, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const fail = (status, message, headers) => json(status, { error: { message } }, headers);

function bearer(request){
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
  return m && m[1].split('.').length === 3 ? m[1] : null;
}
const sbHeaders = (env, token) => ({ apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' });

// Validate and normalize { model?, messages, max_tokens? }. Returns { body } or { error: Response }.
function parseAiBody(raw){
  let d;
  try { d = JSON.parse(raw); } catch { return { error: fail(400, 'Request body must be JSON.') }; }
  if (!d || !Array.isArray(d.messages) || !d.messages.length || d.messages.length > 50) return { error: fail(400, '`messages` must be a non-empty array.') };
  const messages = [];
  for (const m of d.messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role)) return { error: fail(400, 'Each message needs a role: system, user or assistant.') };
    let content = m.content;
    if (Array.isArray(content)) {
      if (content.some(c => c && (c.type === 'image_url' || c.type === 'image' || c.image_url))) {
        return { error: fail(400, 'The free openconstructor AI is text-only: screenshots need a vision model. Connect Gemini or OpenAI with your own key.') };
      }
      content = content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('');
    }
    if (typeof content !== 'string') return { error: fail(400, 'Message content must be text.') };
    messages.push({ role: m.role, content });
  }
  const model = AI_MODELS.includes(d.model) ? d.model : AI_MODELS[0];
  const max = Number.isFinite(+d.max_tokens) && +d.max_tokens > 0 ? Math.min(Math.floor(+d.max_tokens), AI_MAX_TOKENS) : AI_MAX_TOKENS;
  const body = { model, messages, max_tokens: max };
  if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  return { body };
}

async function aiChat(request, env){
  if (request.method !== 'POST') return fail(405, 'Method not allowed', { Allow: 'POST' });
  const token = bearer(request);
  if (!token) return fail(401, 'Sign in to use the free openconstructor AI.');
  if (!freeBackend(env)) return fail(503, 'The free openconstructor AI is not configured yet. Add your own key to keep going.');

  const tooBig = () => fail(413, 'Request is too large for the free AI (200 KB max).');
  if ((+request.headers.get('Content-Length') || 0) > AI_MAX_BODY) return tooBig();
  const raw = await request.text();
  if (raw.length > AI_MAX_BODY) return tooBig();
  const parsed = parseAiBody(raw);
  if (parsed.error) return parsed.error;

  // Called with the user's JWT: PostgREST rejects bad tokens, and auth.uid() is the user whose quota is counted
  let q;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST', headers: sbHeaders(env, token), body: JSON.stringify({ daily_limit: AI_DAILY, global_limit: AI_GLOBAL }),
    });
    if (r.status === 401 || r.status === 403) return fail(401, 'Your session has expired. Sign in again to use the free AI.');
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    q = await r.json();
  } catch (err) {
    console.error('ai: quota check failed', err?.message);
    return fail(502, 'Could not check the free AI quota right now. Try again in a minute or add your own key.');
  }
  if (!q || typeof q !== 'object') return fail(502, 'Unexpected quota response.');
  const limit = q.limit ?? AI_DAILY;
  const quota = { 'X-OC-Quota': `${q.used ?? 0}/${limit}` };
  if (!q.ok) {
    if (q.reason === 'auth') return fail(401, 'Sign in to use the free openconstructor AI.');
    if (q.reason === 'global') return fail(429, 'The free AI has reached its limit for today. Add your own key for unlimited use.', quota);
    return fail(429, `Daily free limit reached (${limit}/day). Add your own key for unlimited use.`, quota);
  }

  let g;
  try { g = await callUpstream(env, parsed.body); }
  catch (err) {
    console.error('ai: upstream unreachable', err?.message);
    return fail(502, 'The free AI is unreachable right now. Try again in a minute.', quota);
  }
  const text = g.text;
  if (g.status < 200 || g.status >= 300) {
    console.error('ai: upstream error', g.be, g.status, String(text).slice(0, 300));
    if (g.status === 429) return fail(503, 'The free AI is busy right now. Try again in a minute or add your own key.', quota);
    if (g.status === 413 || (g.status === 400 && /context|too long|too large|tokens/i.test(text))) return fail(413, 'This request is too long for the free AI. Try a shorter prompt or add your own key.', quota);
    return fail(502, `The free AI failed (upstream ${g.status}). Try again or add your own key.`, quota);
  }
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...quota } });
}

async function aiQuota(request, env){
  if (request.method !== 'GET') return fail(405, 'Method not allowed', { Allow: 'GET' });
  const token = bearer(request);
  if (!token) return fail(401, 'Sign in to use the free openconstructor AI.');
  const day = new Date().toISOString().slice(0, 10); // Supabase current_date is UTC
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage?day=eq.${day}&select=count`, { headers: sbHeaders(env, token) });
    if (r.status === 401 || r.status === 403) return fail(401, 'Your session has expired. Sign in again.');
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json();
    return json(200, { used: (Array.isArray(rows) && rows[0]?.count) || 0, limit: AI_DAILY });
  } catch (err) {
    console.error('ai: quota read failed', err?.message);
    return fail(502, 'Could not read the free AI quota right now.');
  }
}

/* ── Stock photos for AI-built pages ─────────────────────────
   GET /api/photo?q=latte+art&o=landscape|portrait|square&i=0
   Returns one image (bytes) for a short search query. Pexels when PEXELS_API_KEY is set (free key,
   no attribution required), otherwise Openverse limited to CC0 / public domain (no key, no attribution).
   The editor turns it into a data: URL, so pages stay self-contained. Cached at the edge for a week. */
const PHOTO_UA = 'openconstructor/1.0 (+https://openconstructor.pw)';
async function photoSearch(env, q, o){
  if (env.PEXELS_API_KEY) {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=${o}`, { headers: { Authorization: env.PEXELS_API_KEY } });
    if (r.ok) {
      const d = await r.json();
      const list = (d.photos || []).map(p => ({ urls: [o === 'portrait' && p.src.portrait ? p.src.portrait : p.src.large], credit: `Photo by ${p.photographer} on Pexels` }));
      if (list.length) return list;
    }
  }
  const aspect = o === 'landscape' ? 'wide' : o === 'portrait' ? 'tall' : 'square';
  const search = async (words, extra) => {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(words)}&page_size=8&license=cc0,pdm&mature=false&source=stocksnap${extra}`, { headers: { 'User-Agent': PHOTO_UA } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || []).filter(x => !x.mature).map(x => ({ urls: [x.thumbnail + '?full_size=true', x.thumbnail], credit: `${x.title || 'Photo'} — ${x.creator || 'unknown'} (${String(x.license).toUpperCase()})` }));
  };
  // Only StockSnap (curated CC0 stock photography): the rest of Openverse is mostly snapshots and
  // off-topic pictures. A query with no match is shortened from the front ('black oversized hoodie'
  // → 'oversized hoodie' → 'hoodie'): the last word is usually the subject.
  // then from the back ('black hoodie streetwear' → 'black hoodie' → 'hoodie'), then single words
  const words = q.split(' ');
  const tries = [...new Set([
    ...words.map((_, k) => words.slice(k).join(' ')),
    ...words.map((_, k) => words.slice(0, words.length - k).join(' ')),
    ...[...words].sort((a, b) => b.length - a.length),
  ])].filter(w => w.length > 2).slice(0, 6);
  for (const w of tries) {
    let list = await search(w, `&aspect_ratio=${aspect}`);
    if (list.length < 3) list = [...list, ...await search(w, '')];
    if (list.length) return list;
  }
  return [];
}
async function photo(request, env, ctx, url){
  const q = (url.searchParams.get('q') || '').replace(/[^\p{L}\p{N} &'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();
  if (!q) return fail(400, 'Missing ?q= search words.');
  const o = ['landscape', 'portrait', 'square'].includes(url.searchParams.get('o')) ? url.searchParams.get('o') : 'landscape';
  const i = Math.min(7, Math.max(0, parseInt(url.searchParams.get('i')) || 0));
  const cache = caches.default, key = new Request(`https://photo-cache.invalid/v5/${o}/${i}/${encodeURIComponent(q)}`);
  const hit = await cache.match(key); if (hit) return hit;
  let list;
  try { list = await photoSearch(env, q, o); } catch { list = []; }
  if (!list.length) return fail(404, 'No photo found.');
  // start at the requested result, fall through to the next ones when a host refuses
  let img = null, pick = null, type = '';
  for (let k = 0; k < Math.min(4, list.length) && !img; k++) {
    pick = list[(i + k) % list.length];
    for (const u of pick.urls) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': PHOTO_UA }, cf: { cacheTtl: 604800 } });
        type = r.headers.get('Content-Type') || '';
        if (r.ok && type.startsWith('image/') && (+r.headers.get('Content-Length') || 0) <= 12e6) { img = r; break; }
        r.body?.cancel();
      } catch {}
    }
  }
  if (!img) return fail(502, 'Could not load the photo.');
  const res = new Response(img.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Photo-Credit': encodeURIComponent(pick.credit).slice(0, 400) } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* ── Roblox Studio sync ──────────────────────────────────────
   POST /api/sync        (signed in) { code?, spec } → { code }   stores the UI tree under a sync code
   GET  /api/sync/<code> (public, the code is the secret)        → spec, read by the Studio plugin
   One KV entry per code: { owner, updated, spec }. Re-syncing with your own code overwrites it. */
const SYNC_MAX = 1_500_000; // bytes of JSON
const SYNC_CODE = /^[a-z2-7]{12}$/;
function newCode(){
  const abc = 'abcdefghijklmnopqrstuvwxyz234567', b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => abc[x & 31]).join('');
}
async function supabaseUser(env, token){
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}
async function syncPut(request, env){
  if (!env.SYNC) return fail(503, 'Roblox sync is not configured.');
  const token = bearer(request);
  if (!token) return fail(401, 'Sign in to sync with Roblox Studio.');
  if ((+request.headers.get('Content-Length') || 0) > SYNC_MAX) return fail(413, 'This UI is too large to sync (1.5 MB max).');
  const raw = await request.text();
  if (raw.length > SYNC_MAX) return fail(413, 'This UI is too large to sync (1.5 MB max).');
  let d; try { d = JSON.parse(raw); } catch { return fail(400, 'Request body must be JSON.'); }
  const spec = d?.spec;
  if (!spec || spec.v !== 1 || !spec.tree || spec.tree.c !== 'ScreenGui') return fail(400, 'Not a Roblox UI spec.');
  const user = await supabaseUser(env, token);
  if (!user) return fail(401, 'Your session has expired. Sign in again.');
  // one sync per user every 3 seconds (KV allows one write per key per second anyway)
  const gate = new Request(`https://sync-gate.invalid/${user.id}`);
  if (await caches.default.match(gate)) return fail(429, 'Syncing too fast — wait a few seconds.');
  await caches.default.put(gate, new Response('1', { headers: { 'Cache-Control': 'max-age=3' } }));

  let code = typeof d.code === 'string' && SYNC_CODE.test(d.code) ? d.code : null;
  if (code) {
    const prev = await env.SYNC.get('sync:' + code, 'json');
    if (prev && prev.owner !== user.id) code = null; // someone else's code: issue a fresh one
  }
  code ||= newCode();
  const updated = Date.now();
  await env.SYNC.put('sync:' + code, JSON.stringify({ owner: user.id, updated, spec }), { metadata: { updated } });
  return json(200, { code, updated });
}
async function syncGet(request, env, ctx, code){
  if (!env.SYNC) return fail(503, 'Roblox sync is not configured.');
  if (!SYNC_CODE.test(code)) return fail(404, 'Unknown sync code.');
  // the plugin's live mode polls: a 3-second edge cache keeps KV reads low
  const cache = caches.default, key = new Request(new URL(`/api/sync/${code}`, request.url).toString());
  let res = await cache.match(key);
  if (!res) {
    const row = await env.SYNC.get('sync:' + code, 'json');
    if (!row) return fail(404, 'Unknown sync code. Copy it again from openconstructor → Export → Sync to Roblox Studio.');
    res = new Response(JSON.stringify({ updated: row.updated, spec: row.spec }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3' } });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') { url.protocol = 'https:'; return Response.redirect(url.toString(), 301); }
    if (url.pathname === '/api/ai' || url.pathname === '/api/ai/') return aiChat(request, env);
    if (url.pathname === '/api/ai/quota') return aiQuota(request, env);
    if (url.pathname === '/api/photo') return request.method === 'GET' ? photo(request, env, ctx, url) : fail(405, 'Method not allowed', { Allow: 'GET' });
    if (url.pathname === '/api/sync') return request.method === 'POST' ? syncPut(request, env) : fail(405, 'Method not allowed', { Allow: 'POST' });
    const sm = /^\/api\/sync\/([^/]+)$/.exec(url.pathname);
    if (sm) return request.method === 'GET' ? syncGet(request, env, ctx, sm[1]) : fail(405, 'Method not allowed', { Allow: 'GET' });
    const fm = /^\/api\/form\/([^/]+)$/.exec(url.pathname);
    if (fm) return request.method === 'POST' ? formSubmit(request, env, ctx, decodeURIComponent(fm[1])) : fail(405, 'Method not allowed', { Allow: 'POST' });
    if (url.pathname.startsWith('/api/')) return fail(404, 'Not found');
    const m = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    if (m) { let slug = ''; try { slug = decodeURIComponent(m[1]); } catch {} return servePage(request, env, ctx, slug); }
    if (url.pathname === '/p/' || url.pathname.startsWith('/p/')) return notice(404, 'page not found', 'There is no published page at this address.');
    return env.ASSETS.fetch(request);
  },
};
