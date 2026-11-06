// Cloudflare Worker for openconstructor.pw
// /p/<slug> -> a page published from the editor (Supabase table `pages`, see supabase/publish.sql)
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

function inject(html, slug){
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
      const api = await fetch(`${env.SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}&select=html,title`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      });
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
    res = new Response(inject(row.html, slug), { status: 200, headers: { ...PAGE_HEADERS, 'Cache-Control': 'public, max-age=60' } });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return request.method === 'HEAD' ? new Response(null, res) : res;
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    const m = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    if (m) { let slug = ''; try { slug = decodeURIComponent(m[1]); } catch {} return servePage(request, env, ctx, slug); }
    if (url.pathname === '/p/' || url.pathname.startsWith('/p/')) return notice(404, 'page not found', 'There is no published page at this address.');
    return env.ASSETS.fetch(request);
  },
};
