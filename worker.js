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
  return `\n<div data-oc-badge style="${box}"><a href="${HOME}" target="_blank" rel="noopener" style="${link}">Made with <b style="all:unset;color:#e8875c;font-weight:600">openconstructor</b></a><a href="${esc(report)}" target="_blank" rel="noopener" style="${muted}">report</a></div>\n`;
}

// Social preview tags (each skipped when the page already declares its own)
// The picture address carries the hash of the page it shows: cached forever, and a new one after each change
function ogTags(html, slug, title, hash = ''){
  const t = String(title || '').trim() || 'Made with openconstructor';
  const has = k => new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']?${k.replace(/[.:]/g, '\\$&')}["'\\s/>]`, 'i').test(html);
  const image = `${HOME}/api/og/${slug}${hash ? '/' + hash : ''}`;
  return [
    ['property', 'og:title', t],
    ['property', 'og:description', 'Made with openconstructor'],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:image', image],
    ['property', 'og:url', `${HOME}/p/${slug}`],
    ['property', 'og:type', 'website'],
    ['name', 'twitter:card', 'summary_large_image'],
  ].filter(([, k]) => !has(k)).map(([a, k, v]) => `<meta ${a}="${k}" content="${esc(v)}">`).join('\n');
}

function inject(html, slug, title, hash = ''){
  const meta = ogTags(html, slug, title, hash);
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
main{max-width:440px;text-align:center}.code{font-size:56px;font-weight:700;color:#e8875c;letter-spacing:-.02em;margin:0}h1{font-size:15px;font-weight:600;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.08em;color:#cbc0bb}p{color:#948884;margin:0 0 22px}
a{display:inline-block;padding:8px 16px;border-radius:4px;background:#e8875c;color:#1f0f08;font-weight:600;text-decoration:none}a:hover{background:#f0a27c}</style></head>
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
<h2 style="margin:0 0 16px;font-size:20px"><a href="${pageUrl}" style="color:#e8875c;text-decoration:none">${esc(title)}</a></h2>
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

async function servePage(request, env, ctx, slug, screen = '', base = null){
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
    const hash = await shotHash(env, slug).catch(() => '');
    res = formsWork(new Response(inject(row.html, slug, row.title, hash), { status: 200, headers: { ...PAGE_HEADERS, 'Cache-Control': 'public, max-age=60' } }), slug);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  res = await routeScreens(res, screen, base ?? `/p/${slug}`, base === '');
  if (!res) return notice(404, 'page not found', 'This page has no screen with that name.');
  if (request.method === 'GET') ctx.waitUntil(countView(request, env, slug).catch(() => {}));
  return request.method === 'HEAD' ? new Response(null, res) : res;
}

// Screens of a multi-screen page get their own addresses: /p/slug/<screen> (or /<screen> on a custom
// domain). Links to "#screen" become real links, and the asked screen is the one shown.
const SCREEN_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
async function routeScreens(res, screen, base, custom){
  const html = await res.text();
  const ids = [...html.matchAll(/<section class="oc-screen" id="([a-z0-9-]+)"/g)].map(m => m[1]);
  if (screen && !ids.includes(screen)) return null;
  const headers = new Headers(res.headers);
  if (custom) headers.delete('X-Robots-Tag'); // the owner's own domain may be indexed
  const out = new Response(html, { status: res.status, headers });
  if (!ids.length) return out;
  const set = new Set(ids), first = ids[0];
  const link = id => id === first ? (base || '/') : `${base}/${id}`;
  let rw = new HTMLRewriter().on('a[href^="#"]', { element(el){ const id = el.getAttribute('href').slice(1); if (set.has(id)) el.setAttribute('href', link(id)); } });
  if (screen && screen !== first) rw = rw.on('head', { element(el){ el.append(`<style>.oc-screen{display:none!important}#${screen}{display:block!important}</style>`, { html: true }); } });
  return rw.transform(out);
}

// ---------- custom domains (Cloudflare for SaaS): mysite.com → a published page ----------
// Visitors' domains point a CNAME at DOMAIN_TARGET; a second deploy of this worker (wrangler.domains.jsonc,
// route */*) receives that traffic. The host → slug map is the `domains` table (supabase/domains.sql).
const MAIN_HOSTS = new Set(['openconstructor.pw', 'www.openconstructor.pw', 'localhost', '127.0.0.1']);
const DOMAIN_TARGET = 'domains.openconstructor.pw';
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_DOMAINS = 3;
const isMainHost = h => MAIN_HOSTS.has(h) || h.endsWith('.workers.dev');
async function domainSlug(env, ctx, host){
  const cache = caches.default, key = new Request(`${HOME}/__domain/${encodeURIComponent(host)}`);
  const hit = await cache.match(key);
  if (hit) return (await hit.text()) || null;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/domains?host=eq.${encodeURIComponent(host)}&select=slug`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' } });
  const rows = r.ok ? await r.json() : [];
  const slug = (Array.isArray(rows) && rows[0]?.slug) || '';
  ctx.waitUntil(cache.put(key, new Response(slug, { headers: { 'Cache-Control': 'max-age=120' } })));
  return slug || null;
}
async function customDomain(request, env, ctx, url){
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });
  const slug = await domainSlug(env, ctx, url.hostname.toLowerCase());
  if (!slug) return notice(404, 'domain not connected', 'This domain is not connected to a page on openconstructor yet.');
  const m = /^\/(?:([a-z0-9][a-z0-9-]{0,47})\/?)?$/.exec(url.pathname);
  if (!m) return notice(404, 'page not found', 'There is nothing at this address.');
  return servePage(request, env, ctx, slug, m[1] || '', '');
}
// /api/domain — GET ?slug= (domains of my page + status), POST {slug, host} (connect), DELETE ?host= (disconnect)
async function domainApi(request, env, ctx, url){
  const token = bearer(request);
  const user = token && await supabaseUser(env, token);
  if (!user) return fail(401, 'Sign in first.');
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID || !env.SUPABASE_SERVICE_ROLE_KEY) return fail(503, 'Custom domains are not set up on this server yet.');
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const db = (q, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${q}`, { ...init, headers: { ...svc, ...(init.headers || {}) } });
  const cf = async (path, init = {}) => { const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames${path}`, { ...init, headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' } }); return r.json().catch(() => ({ success: false })); };
  const view = (host, h) => ({ host, target: DOMAIN_TARGET, status: h?.status || 'pending', ssl: h?.ssl?.status || 'pending', txt: h?.ownership_verification || null, errors: [...(h?.verification_errors || []), ...(h?.ssl?.validation_errors || []).map(e => e.message)].filter(Boolean).slice(0, 3) });
  const purge = host => ctx.waitUntil(caches.default.delete(new Request(`${HOME}/__domain/${encodeURIComponent(host)}`)));

  if (request.method === 'GET') {
    const slug = url.searchParams.get('slug') || '';
    if (!SLUG_RE.test(slug)) return fail(400, 'Bad page.');
    const rows = await (await db(`domains?owner=eq.${user.id}&slug=eq.${slug}&select=host,cf_id`)).json();
    const list = await Promise.all((Array.isArray(rows) ? rows : []).map(async r => view(r.host, r.cf_id ? (await cf('/' + r.cf_id)).result : null)));
    return json(200, { domains: list, target: DOMAIN_TARGET });
  }
  if (request.method === 'POST') {
    let d; try { d = await request.json(); } catch { return fail(400, 'Bad request.'); }
    const slug = String(d?.slug || '');
    const host = String(d?.host || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
    if (!SLUG_RE.test(slug)) return fail(400, 'Bad page.');
    if (!HOST_RE.test(host) || isMainHost(host) || host.endsWith('.openconstructor.pw')) return fail(400, 'That doesn\'t look like a domain you own (example: www.mysite.com).');
    const page = await (await db(`pages?slug=eq.${slug}&owner=eq.${user.id}&select=slug`)).json();
    if (!Array.isArray(page) || !page.length) return fail(403, 'This is not your page.');
    const existing = await (await db(`domains?host=eq.${encodeURIComponent(host)}&select=owner,cf_id`)).json();
    if (existing?.[0] && existing[0].owner !== user.id) return fail(409, 'This domain is already connected to another page.');
    if (existing?.[0]) {
      await db(`domains?host=eq.${encodeURIComponent(host)}`, { method: 'PATCH', body: JSON.stringify({ slug }) });
      purge(host);
      return json(200, view(host, existing[0].cf_id ? (await cf('/' + existing[0].cf_id)).result : null));
    }
    const mine = await (await db(`domains?owner=eq.${user.id}&select=host`)).json();
    if (Array.isArray(mine) && mine.length >= MAX_DOMAINS) return fail(429, `Up to ${MAX_DOMAINS} domains per account for now.`);
    let made = await cf('', { method: 'POST', body: JSON.stringify({ hostname: host, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }) });
    if (!made.success) {
      const found = await cf('?hostname=' + encodeURIComponent(host));
      if (found.result?.[0]) made = { success: true, result: found.result[0] };
      else return fail(502, `Cloudflare: ${made.errors?.[0]?.message || 'could not add the domain'}`);
    }
    const ins = await db('domains', { method: 'POST', body: JSON.stringify({ host, slug, owner: user.id, cf_id: made.result.id }) });
    if (!ins.ok) return fail(502, 'Could not save the domain.');
    purge(host);
    return json(200, view(host, made.result));
  }
  if (request.method === 'DELETE') {
    const host = String(url.searchParams.get('host') || '').toLowerCase();
    const rows = await (await db(`domains?host=eq.${encodeURIComponent(host)}&owner=eq.${user.id}&select=cf_id`)).json();
    if (!Array.isArray(rows) || !rows.length) return fail(404, 'Not found.');
    if (rows[0].cf_id) await cf('/' + rows[0].cf_id, { method: 'DELETE' });
    await db(`domains?host=eq.${encodeURIComponent(host)}&owner=eq.${user.id}`, { method: 'DELETE' });
    purge(host);
    return json(200, { ok: true });
  }
  return fail(405, 'Method not allowed', { Allow: 'GET, POST, DELETE' });
}

// ---------- brand kit: colours, fonts and logo of a website (for the editor's "brand" window) ----------
const BRAND_MAX = 1_500_000;
async function fetchText(url, max = BRAND_MAX){
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; openconstructor-brand/1.0)', Accept: 'text/html,text/css,*/*' }, redirect: 'follow', cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  return t.slice(0, max);
}
const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function normColor(c){
  c = c.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3})$/); if (m) return '#' + m[1].split('').map(x => x + x).join('');
  m = c.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/); if (m) return '#' + m[1];
  m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/); if (m) { if (m[4] && parseFloat(m[4]) < (m[4].endsWith('%') ? 50 : 0.5)) return null; return hexOf(+m[1], +m[2], +m[3]); }
  return null;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const sat = h => { const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const far = (a, b) => rgb(a).reduce((s, v, i) => s + Math.abs(v - rgb(b)[i]), 0) > 90;
async function brand(request, url){
  const target = url.searchParams.get('url') || '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(target) ? target : 'https://' + target); } catch { return fail(400, 'That address doesn\'t look like a website'); }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return fail(400, 'Only public websites can be read');
  // one request per visitor every 5 seconds
  const ip = request.headers.get('cf-connecting-ip') || 'unknown', cache = caches.default, gate = new Request(`${HOME}/__brand/${encodeURIComponent(ip)}`);
  if (await cache.match(gate)) return fail(429, 'Please wait a few seconds');
  await cache.put(gate, new Response('1', { headers: { 'Cache-Control': 'max-age=5' } }));
  let html;
  try { html = await fetchText(u.href); } catch (e) { return fail(502, `Couldn't open the site (${e.message})`); }
  const abs = h => { try { return new URL(h, u).href; } catch { return null; } };
  const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1];
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
  const meta = key => { const t = metas.find(x => new RegExp(`(?:name|property)\\s*=\\s*["']${key}["']`, 'i').test(x)); return t ? attr(t, 'content') : null; };
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  // CSS: inline styles plus up to 3 stylesheets
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') + '\n' + [...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map(m => m[1]).join(';');
  const sheets = links.filter(l => /rel\s*=\s*["'][^"']*stylesheet/i.test(l)).map(l => abs(attr(l, 'href'))).filter(Boolean).slice(0, 3);
  for (const href of sheets) { try { css += '\n' + await fetchText(href, 400_000); } catch {} }
  // colours by frequency; CSS custom properties named like brand/primary/accent count extra
  const counts = new Map();
  const bump = (c, w = 1) => { const h = normColor(c); if (h) counts.set(h, (counts.get(h) || 0) + w); };
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) bump(m[0]);
  for (const m of css.matchAll(/--[\w-]*(?:primary|brand|accent|main|highlight)[\w-]*\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)) bump(m[1], 25);
  const theme = meta('theme-color'); if (theme) bump(theme, 30);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const vivid = sorted.filter(h => sat(h) > .35 && lum(h) > .03 && lum(h) < .85);
  const primary = vivid[0] || sorted.find(h => lum(h) > .05 && lum(h) < .8) || '#e8875c';
  const accent = vivid.find(h => far(h, primary)) || null;
  // background / text from the body rule if present, else the most used very light / very dark colours
  const bodyRule = (css.match(/(?:^|[}\s,])(?:html|body)\s*\{([^}]*)\}/i) || [])[1] || '';
  const bodyBg = normColor((bodyRule.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i) || [])[1] || '');
  const bodyFg = normColor((bodyRule.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i) || [])[1] || '');
  const background = bodyBg || sorted.find(h => lum(h) > .85) || '#ffffff';
  const text = bodyFg || (lum(background) > .5 ? sorted.find(h => lum(h) < .08) || '#18181b' : sorted.find(h => lum(h) > .8) || '#fafafa');
  // fonts: the most used family that isn't a generic or icon font
  const fonts = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!first || /^(inherit|initial|unset|var\(|system-ui|sans-serif|serif|monospace|-apple-system|blinkmacsystemfont)|icon|awesome|material|katex|mathjax/i.test(first)) continue;
    fonts.set(first, (fonts.get(first) || 0) + 1);
  }
  const font = [...fonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const radii = [...css.matchAll(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/gi)].map(m => +m[1]).filter(v => v > 0 && v < 60);
  const radius = radii.length ? radii.sort((a, b) => a - b)[Math.floor(radii.length / 2)] : null;
  // logo: og:image is often a big banner, so prefer icons; embed small images as data URLs (the canvas allows no remote images)
  const iconHref = (links.find(l => /rel\s*=\s*["'][^"']*apple-touch-icon/i.test(l)) || links.find(l => /rel\s*=\s*["'][^"']*\bicon\b/i.test(l)));
  let logo = null;
  for (const src of [iconHref && abs(attr(iconHref, 'href')), abs('/favicon.ico')].filter(Boolean)) {
    try {
      const r = await fetch(src, { cf: { cacheTtl: 3600 } });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//.test(type)) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 150_000) continue;
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      logo = `data:${type.split(';')[0]};base64,${btoa(bin)}`; break;
    } catch {}
  }
  const name = (meta('og:site_name') || (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || u.hostname).trim().split(/\s[|–—-]\s/)[0].slice(0, 60);
  const description = (meta('description') || meta('og:description') || '').trim().slice(0, 300);
  return json(200, { name, description, primary, accent, background, text, font, radius, logo, palette: sorted.slice(0, 12), source: u.origin });
}

// ---------- free AI (no key): signed-in users, AI_DAILY generations a day via our Groq key ----------
const AI_DAILY = 20;
const AI_GLOBAL = 900; // keep both <= the ceilings in supabase/ai.sql
const AI_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
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
  if (d.stream === true) body.stream = true;
  return { body };
}

// ---------- streaming free AI: every backend's stream becomes OpenAI-style SSE chunks ----------
const sseChunk = (content, reasoning, finish) => `data: ${JSON.stringify({ choices: [{ delta: { ...(content ? { content } : {}), ...(reasoning ? { reasoning } : {}) }, finish_reason: finish || null }] })}\n\n`;
// Workers AI (OpenAI chunks, or {response} for older models) and OpenAI-compatible SSE → slim OpenAI chunks
function normalizeSSE(){
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = '';
  const line = (l, ctrl) => {
    l = l.trim(); if (!l.startsWith('data:')) return;
    const d = l.slice(5).trim(); if (!d || d === '[DONE]') return;
    let j; try { j = JSON.parse(d); } catch { return; }
    if (j.error) { ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: { message: String(j.error.message || j.error) } })}\n\n`)); return; }
    const ch = j.choices?.[0];
    const content = ch?.delta?.content ?? (typeof j.response === 'string' ? j.response : ''), reasoning = ch?.delta?.reasoning ?? ch?.delta?.reasoning_content ?? '';
    const finish = ch?.finish_reason === 'length' ? 'length' : ch?.finish_reason ? 'stop' : null;
    if (content || reasoning || finish) ctrl.enqueue(enc.encode(sseChunk(content, reasoning, finish)));
  };
  return new TransformStream({
    transform(chunk, ctrl){ buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i), ctrl); buf = buf.slice(i + 1); } },
    flush(ctrl){ if (buf) line(buf, ctrl); ctrl.enqueue(enc.encode('data: [DONE]\n\n')); },
  });
}
// A whole (non-streamed) completion as a one-chunk stream, so the client handles one format
const oneShotSSE = text => { let content = ''; try { content = JSON.parse(text).choices?.[0]?.message?.content || ''; } catch {} return new Response(sseChunk(content, '', 'stop') + 'data: [DONE]\n\n').body; };
// Like callUpstream, but returns { status, stream } — falls through to the next backend until one starts answering
async function callUpstreamStream(env, body){
  let last = null;
  for (const b of freeBackends(env)) {
    let r;
    if (b.id === 'workers-ai') {
      try {
        const out = await env.AI.run(b.model, { messages: body.messages, max_tokens: Math.min(body.max_tokens, 4096), stream: true });
        if (out instanceof ReadableStream) return { status: 200, be: b.id, stream: out.pipeThrough(normalizeSSE()) };
        const content = typeof out === 'string' ? out : out?.response ?? out?.choices?.[0]?.message?.content ?? '';
        return { status: 200, be: b.id, stream: new Response(sseChunk(content, '', 'stop') + 'data: [DONE]\n\n').body };
      } catch (err) { const msg = String(err?.message || err); r = { status: /limit|quota|neurons|429/i.test(msg) ? 429 : 502, text: msg, be: b.id }; }
    } else {
      const headers = { Authorization: `Bearer ${env[b.secret]}`, 'Content-Type': 'application/json' };
      if (b.id === 'openrouter') { headers['HTTP-Referer'] = 'https://openconstructor.pw'; headers['X-Title'] = 'openconstructor'; }
      try {
        const res = await fetch(b.url, { method: 'POST', headers, body: JSON.stringify({ model: b.model, messages: body.messages, max_tokens: body.max_tokens, stream: true, ...b.extra }) });
        if (res.ok) return { status: 200, be: b.id, stream: /event-stream/i.test(res.headers.get('content-type') || '') ? res.body.pipeThrough(normalizeSSE()) : oneShotSSE(await res.text()) };
        r = { status: res.status, text: await res.text(), be: b.id };
      } catch (err) { r = { status: 502, text: String(err?.message || err), be: b.id }; }
    }
    last = r;
    console.error('ai stream: backend failed, trying next', b.id, r.status, String(r.text).slice(0, 200));
    if (!(r.status === 429 || r.status >= 500 || r.status === 402 || r.status === 401 || r.status === 403)) break;
  }
  return last || { status: 503, text: 'no backend', be: null };
}

async function aiChat(request, env){
  if (request.method !== 'POST') return fail(405, 'Method not allowed', { Allow: 'POST' });
  const token = bearer(request);
  if (!freeBackend(env)) return fail(503, 'The free openconstructor AI is not configured yet. Add your own key to keep going.');

  const tooBig = () => fail(413, 'Request is too large for the free AI (200 KB max).');
  if ((+request.headers.get('Content-Length') || 0) > AI_MAX_BODY) return tooBig();
  const raw = await request.text();
  if (raw.length > AI_MAX_BODY) return tooBig();
  const parsed = parseAiBody(raw);
  if (parsed.error) return parsed.error;

  // Signed in: the user's JWT goes to PostgREST, auth.uid() is the user whose quota is counted.
  // Signed out: a few generations a day per visitor, so people can try it before making an account.
  const t = token ? await takeQuota(env, token) : await anonQuota(request, env);
  if (t.error) return t.error;
  const quota = t.quota;

  let g;
  try { g = await (parsed.body.stream ? callUpstreamStream : callUpstream)(env, parsed.body); }
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
  if (g.stream) return new Response(g.stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', ...quota } });
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...quota } });
}

async function takeQuota(env, token){
  let q;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST', headers: sbHeaders(env, token), body: JSON.stringify({ daily_limit: AI_DAILY, global_limit: AI_GLOBAL }),
    });
    if (r.status === 401 || r.status === 403) return { error: fail(401, 'Your session has expired. Sign in again to use the free AI.') };
    // supabase/ai.sql not run yet (no consume_ai_quota): count in KV so the free AI still works
    if (r.status === 404) {
      const u = await supabaseUser(env, token);
      if (!u) return { error: fail(401, 'Your session has expired. Sign in again to use the free AI.') };
      return kvQuota(env, 'uq:' + u.id, AI_DAILY, `Daily free limit reached (${AI_DAILY}/day). Add your own key for unlimited use.`);
    }
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    q = await r.json();
  } catch (err) {
    console.error('ai: quota check failed', err?.message);
    return { error: fail(502, 'Could not check the free AI quota right now. Try again in a minute or add your own key.') };
  }
  if (!q || typeof q !== 'object') return { error: fail(502, 'Unexpected quota response.') };
  const limit = q.limit ?? AI_DAILY;
  const quota = { 'X-OC-Quota': `${q.used ?? 0}/${limit}` };
  if (!q.ok) {
    if (q.reason === 'auth') return { error: fail(401, 'Sign in to use the free openconstructor AI.') };
    if (q.reason === 'global') return { error: fail(429, 'The free AI has reached its limit for today. Add your own key for unlimited use.', quota) };
    return { error: fail(429, `Daily free limit reached (${limit}/day). Add your own key for unlimited use.`, quota) };
  }
  return { quota };
}

// Visitors without an account: ANON_DAILY generations a day, counted per hashed IP (the IP itself is not stored).
// The 429 carries code "signin" so the editor can offer an account (AI_DAILY a day) instead of a dead end.
const ANON_DAILY = 3;
async function anonQuota(request, env){
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('oc-anon:' + ip)))].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  return kvQuota(env, 'aq:' + hash, ANON_DAILY, `You've used the ${ANON_DAILY} free tries for today. Sign in (free, 10 seconds) to get ${AI_DAILY} generations a day.`, 'signin');
}
// A per-day counter in KV ("<key>:<YYYY-MM-DD>", expires after two days). Not atomic, which is fine for a soft limit.
async function kvQuota(env, key, limit, message, code){
  if (!env.SYNC) return code ? { error: json(401, { error: { message: 'Sign in to use the free openconstructor AI.', code } }) } : { quota: {} };
  const k = `${key}:${new Date().toISOString().slice(0, 10)}`;
  const used = +(await env.SYNC.get(k)) || 0;
  const quota = { 'X-OC-Quota': `${used}/${limit}` };
  if (used >= limit) return { error: json(429, { error: { message, ...(code ? { code } : {}) } }, quota) };
  try { await env.SYNC.put(k, String(used + 1), { expirationTtl: 172800 }); }
  catch (err) { console.error('ai: kv quota write failed', err?.message); }
  return { quota: { 'X-OC-Quota': `${used + 1}/${limit}` } };
}

// ---------- AI images: FLUX schnell on Workers AI, one picture = one free generation ----------
async function image(request, env, url, test = false){
  if (!test && request.method !== 'POST') return fail(405, 'Method not allowed', { Allow: 'POST' });
  if (!env.AI) return fail(503, 'AI images are not available on this server.');
  let prompt = 'latte art in a white cup on a wooden table, warm morning light', quota = {};
  if (!test) {
    const token = bearer(request);
    if (!token) return fail(401, 'Sign in to generate images with the free AI.');
    let d; try { d = await request.json(); } catch { return fail(400, 'Bad request.'); }
    prompt = String(d?.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (prompt.length < 3) return fail(400, 'Describe the picture in a few words.');
    const t = await takeQuota(env, token);
    if (t.error) return t.error;
    quota = t.quota;
  }
  try {
    const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 6 });
    if (!out?.image) throw new Error('empty image');
    const bin = atob(out.image), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', ...quota } });
  } catch (err) {
    const msg = String(err?.message || err);
    console.error('image: failed', msg.slice(0, 200));
    return fail(/limit|quota|neurons|429/i.test(msg) ? 503 : 502, 'The image could not be made right now. Try again in a minute.', quota);
  }
}

async function aiQuota(request, env){
  if (request.method !== 'GET') return fail(405, 'Method not allowed', { Allow: 'GET' });
  const token = bearer(request);
  if (!token) return fail(401, 'Sign in to use the free openconstructor AI.');
  const day = new Date().toISOString().slice(0, 10); // Supabase current_date is UTC
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage?day=eq.${day}&select=count`, { headers: sbHeaders(env, token) });
    if (r.status === 401 || r.status === 403) return fail(401, 'Your session has expired. Sign in again.');
    if (r.status === 404 && env.SYNC) { // no ai_usage table yet: the KV counter kvQuota keeps
      const u = await supabaseUser(env, token);
      if (!u) return fail(401, 'Your session has expired. Sign in again.');
      return json(200, { used: +(await env.SYNC.get(`uq:${u.id}:${day}`)) || 0, limit: AI_DAILY });
    }
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
// ---------- Page pictures: made in the editor at publish time (page-shot.js), kept in KV ----------
// og:<slug>   1200×630 link preview   ·   shot:<slug>   whole page, 480px wide, for the gallery
// shothash:<slug>   hash of the page HTML the pictures were made from. The editor skips making new
// pictures when it matches; /api/<kind>/<slug>/<hash> is cached forever (a new hash = a new address,
// so link previews refresh too); /api/<kind>/<slug> answers 304 to a matching If-None-Match.
const SHOT_MAX = 600_000;
const HASH_RE = /^[0-9a-f]{16}$/;
async function shotPut(request, env, slug){
  if (!env.SYNC) return fail(503, 'Page pictures are not configured.');
  if (!SLUG_RE.test(slug)) return fail(404, 'Unknown page.');
  const token = bearer(request);
  if (!token) return fail(401, 'Sign in first.');
  if ((+request.headers.get('Content-Length') || 0) > SHOT_MAX * 2 + 4096) return fail(413, 'Pictures are too large.');
  const user = await supabaseUser(env, token);
  if (!user) return fail(401, 'Your session has expired. Sign in again.');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}&select=owner`, { headers: sbHeaders(env, env.SUPABASE_ANON_KEY) });
  const row = r.ok ? (await r.json())[0] : null;
  if (!row || row.owner !== user.id) return fail(403, 'This is not your page.');
  let form; try { form = await request.formData(); } catch { return fail(400, 'Bad request.'); }
  const jpeg = async f => {
    if (!f || typeof f.arrayBuffer !== 'function' || f.size > SHOT_MAX) return null;
    const b = new Uint8Array(await f.arrayBuffer());
    return b[0] === 0xff && b[1] === 0xd8 ? b : null; // JPEG only
  };
  const og = await jpeg(form.get('og')), full = await jpeg(form.get('full'));
  if (!og || !full) return fail(400, 'Send two JPEG pictures under 600 KB.');
  const at = Date.now(), sent = String(form.get('hash') || '');
  const hash = HASH_RE.test(sent) ? sent : at.toString(16).padStart(16, '0').slice(-16);
  await Promise.all([env.SYNC.put('og:' + slug, og, { metadata: { at, hash } }), env.SYNC.put('shot:' + slug, full, { metadata: { at, hash } }), env.SYNC.put('shothash:' + slug, hash)]);
  // the page itself too: its og:image address carries the hash
  await Promise.all([`${HOME}/api/og/${slug}`, `${HOME}/api/shot/${slug}`, `${HOME}/p/${slug}`].map(u => caches.default.delete(new Request(u)))).catch(() => {});
  return json(200, { ok: true, hash });
}
const shotHash = async (env, slug) => (env.SYNC && await env.SYNC.get('shothash:' + slug)) || '';
async function shotGet(request, env, ctx, kind, slug, want = ''){
  if (!SLUG_RE.test(slug) || (want && !HASH_RE.test(want))) return fail(404, 'Unknown page.');
  const cur = await shotHash(env, slug);
  const etag = cur ? `"${cur}"` : '';
  // the editor asks "is the picture for this HTML already there?" with HEAD; browsers revalidate with If-None-Match
  if (etag && (request.method === 'HEAD' || request.headers.get('If-None-Match') === etag)) {
    return new Response(null, { status: request.method === 'HEAD' ? 200 : 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } });
  }
  // an old hashed address: send to the current picture
  if (want && want !== cur) return new Response(null, { status: 302, headers: { Location: `${HOME}/api/${kind}/${slug}${cur ? '/' + cur : ''}`, 'Cache-Control': 'public, max-age=300' } });
  const cache = caches.default, key = new Request(`${HOME}/api/${kind}/${slug}${want ? '/' + want : ''}`);
  let res = await cache.match(key);
  if (res) return res;
  const bytes = env.SYNC ? await env.SYNC.get((kind === 'og' ? 'og:' : 'shot:') + slug, 'arrayBuffer') : null;
  if (!bytes) return kind === 'og' ? Response.redirect(`${HOME}/og.png`, 302) : fail(404, 'No picture yet.');
  res = new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': want ? 'public, max-age=31536000, immutable' : 'public, max-age=300', ...(etag ? { ETag: etag } : {}), 'Access-Control-Allow-Origin': '*' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
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
    if (!isMainHost(url.hostname)) return customDomain(request, env, ctx, url);
    if (url.pathname === '/api/domain') return domainApi(request, env, ctx, url);
    if (url.pathname === '/api/ai' || url.pathname === '/api/ai/') return aiChat(request, env);
    if (url.pathname === '/api/ai/quota') return aiQuota(request, env);
    if (url.pathname === '/api/image') return image(request, env, url);
    if (url.pathname === '/api/photo') return request.method === 'GET' ? photo(request, env, ctx, url) : fail(405, 'Method not allowed', { Allow: 'GET' });
    if (url.pathname === '/api/sync') return request.method === 'POST' ? syncPut(request, env) : fail(405, 'Method not allowed', { Allow: 'POST' });
    const pm = /^\/api\/(shot|og)\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
    if (pm) return request.method === 'POST' && pm[1] === 'shot' && !pm[3] ? shotPut(request, env, decodeURIComponent(pm[2])) : request.method === 'GET' || request.method === 'HEAD' ? shotGet(request, env, ctx, pm[1], decodeURIComponent(pm[2]), pm[3] || '') : fail(405, 'Method not allowed', { Allow: 'GET, POST' });
    const sm = /^\/api\/sync\/([^/]+)$/.exec(url.pathname);
    if (sm) return request.method === 'GET' ? syncGet(request, env, ctx, sm[1]) : fail(405, 'Method not allowed', { Allow: 'GET' });
    const fm = /^\/api\/form\/([^/]+)$/.exec(url.pathname);
    if (fm) return request.method === 'POST' ? formSubmit(request, env, ctx, decodeURIComponent(fm[1])) : fail(405, 'Method not allowed', { Allow: 'POST' });
    if (url.pathname === '/api/brand') return request.method === 'GET' ? brand(request, url) : fail(405, 'Method not allowed', { Allow: 'GET' });
    if (url.pathname.startsWith('/api/')) return fail(404, 'Not found');
    const m = /^\/p\/([^/]+)(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (m) {
      let slug = '', screen = ''; try { slug = decodeURIComponent(m[1]); screen = m[2] ? decodeURIComponent(m[2]) : ''; } catch {}
      if (screen && !SCREEN_RE.test(screen)) return notice(404, 'page not found', 'There is no published page at this address.');
      return servePage(request, env, ctx, slug, screen);
    }
    if (url.pathname === '/p/' || url.pathname.startsWith('/p/')) return notice(404, 'page not found', 'There is no published page at this address.');
    return env.ASSETS.fetch(request);
  },
};
