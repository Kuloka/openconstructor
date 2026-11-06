// Cloudflare Worker for openconstructor.pw
// /p/<slug> -> a page published from the editor (Supabase table `pages`, see supabase/publish.sql)
// /api/ai, /api/ai/quota -> free AI without a key for signed-in users (Groq, quota in supabase/ai.sql)
// everything else -> the static site (assets binding, SPA fallback)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const HOME = 'https://openconstructor.pw';
const ISSUES = 'https://github.com/Kuloka/openconstructor/issues';

// User content lives on our main domain: sandbox it (no allow-same-origin -> opaque
// origin, no access to openconstructor.pw cookies/storage) and forbid scripts.
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "sandbox allow-popups allow-popups-to-escape-sandbox; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
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

function notice(status, title, text){
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · openconstructor</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0c0a09;color:#f2ece9;font:14px/1.6 "JetBrains Mono",Consolas,ui-monospace,monospace}
main{max-width:440px;text-align:center}.code{font-size:56px;font-weight:700;color:#e4572e;letter-spacing:-.02em;margin:0}h1{font-size:15px;font-weight:600;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.08em;color:#cbc0bb}p{color:#948884;margin:0 0 22px}
a{display:inline-block;padding:8px 16px;border-radius:4px;background:#e4572e;color:#1a0703;font-weight:600;text-decoration:none}a:hover{background:#f06a3f}</style></head>
<body><main><p class="code">${status}</p><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="${HOME}">open openconstructor</a></main></body></html>`;
  return new Response(body, { status, headers: { ...PAGE_HEADERS, 'Cache-Control': 'no-store' } });
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
      const base = `${env.SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}&select=html,title`;
      // moderated pages (hidden = true) disappear; fall back if the gallery migration hasn't been run yet
      let api = await fetch(base + '&hidden=eq.false', { headers });
      if (api.status === 400) api = await fetch(base, { headers });
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
    res = new Response(inject(row.html, slug, row.title), { status: 200, headers: { ...PAGE_HEADERS, 'Cache-Control': 'public, max-age=60' } });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return request.method === 'HEAD' ? new Response(null, res) : res;
}

// ---------- free AI (no key): signed-in users, AI_DAILY generations a day via our Groq key ----------
const AI_DAILY = 20;
const AI_GLOBAL = 900; // keep both <= the ceilings in supabase/ai.sql
const AI_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];
const AI_MAX_BODY = 200_000;
const AI_MAX_TOKENS = 8000;
const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Free-AI upstreams, tried in this order. Each one is used only if its secret is set
// (`npx wrangler secret put <SECRET>`); when one is out of quota (429) or down (5xx), the next one answers.
// Cloudflare Workers AI needs no key and is the last resort.
const BACKENDS = [
  { id: 'openrouter', secret: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/free', extra: { } },
  { id: 'mistral', secret: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-medium-latest', extra: { } },
  { id: 'groq', secret: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { id: 'gemini', secret: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', extra: { reasoning_effort: 'low' } },
];
const freeBackends = env => [...BACKENDS.filter(b => env[b.secret]), ...(env.AI ? [{ id: 'workers-ai' }] : [])];
const freeBackend = env => freeBackends(env)[0]?.id || null;

// Call the upstreams in order and always answer in OpenAI chat-completions shape: { status, text, be }.
async function callUpstream(env, body){
  let last = null;
  for (const b of freeBackends(env)) {
    const r = b.id === 'workers-ai' ? await callWorkersAI(env, body) : await callOpenAICompatible(env, b, body);
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
async function callWorkersAI(env, body){
  const be = 'workers-ai';
  // Workers AI binding: returns { response } — wrap it like an OpenAI completion
  try {
    const out = await env.AI.run(WORKERS_AI_MODEL, { messages: body.messages, max_tokens: Math.min(body.max_tokens, 4096) });
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

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (url.pathname === '/api/ai' || url.pathname === '/api/ai/') return aiChat(request, env);
    if (url.pathname === '/api/ai/quota') return aiQuota(request, env);
    if (url.pathname.startsWith('/api/')) return fail(404, 'Not found');
    const m = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    if (m) { let slug = ''; try { slug = decodeURIComponent(m[1]); } catch {} return servePage(request, env, ctx, slug); }
    if (url.pathname === '/p/' || url.pathname.startsWith('/p/')) return notice(404, 'page not found', 'There is no published page at this address.');
    return env.ASSETS.fetch(request);
  },
};
