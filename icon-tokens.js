// Icons and company logos for AI-built pages (resolved in studio.js resolveMedia, before photos):
//   <img src="icon:rocket" …>    → the Lucide icon as inline SVG in currentColor (ISC licence, ~1500 names)
//   <img src="logo:anthropic" …> → the company logo as inline SVG: our colour AI-vendor logos (src/logos),
//                                  else Simple Icons (CC0, 3000+ brands), else a neat monogram — never an empty box
// Inline SVG keeps the page self-contained (no external requests on published pages).
const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@16.30.0/icons/';
const TOKEN = /<img\b([^>]*?)\bsrc=(["'])(icon|logo):([^"'<>]{1,60})\2([^>]*?)\/?>/gi;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attrOf = (attrs, n) => attrs.match(new RegExp(`\\b${n}=(["'])([^"']*)\\1`, 'i'))?.[2] || '';
// keep the picture's class, id, style and size on the svg
function frame(attrs, size){
  const w = /^\d{1,4}$/.test(attrOf(attrs, 'width')) ? attrOf(attrs, 'width') : '', h = /^\d{1,4}$/.test(attrOf(attrs, 'height')) ? attrOf(attrs, 'height') : '';
  const cls = attrOf(attrs, 'class'), id = attrOf(attrs, 'id'), style = attrOf(attrs, 'style'), alt = attrOf(attrs, 'alt');
  return `width="${w || h || size}" height="${h || w || size}"${cls ? ` class="${esc(cls)}"` : ''}${id ? ` id="${esc(id)}"` : ''}${style ? ` style="${esc(style)}"` : ''} ${alt ? `role="img" aria-label="${esc(alt)}"` : 'aria-hidden="true"'}`;
}

// Lucide: the closest name (rocket, chart-line…); models also write "line-chart", "check_circle", "fa-star"
const ICON_ALIAS = { 'line-chart': 'chart-line', 'bar-chart': 'chart-column', 'pie-chart': 'chart-pie', 'chart': 'chart-column', 'check-circle': 'circle-check', 'x-circle': 'circle-x', 'alert': 'triangle-alert', 'warning': 'triangle-alert', 'info': 'info', 'home': 'house', 'mail': 'mail', 'email': 'mail', 'phone': 'phone', 'user': 'user', 'users': 'users', 'team': 'users', 'settings': 'settings', 'gear': 'settings', 'cart': 'shopping-cart', 'bag': 'shopping-bag', 'ai': 'sparkles', 'magic': 'sparkles', 'speed': 'gauge', 'fast': 'zap', 'secure': 'shield-check', 'security': 'shield-check', 'money': 'banknote', 'price': 'tag', 'location': 'map-pin', 'time': 'clock', 'calendar': 'calendar', 'code': 'code', 'brain': 'brain', 'trophy': 'trophy', 'star': 'star', 'heart': 'heart', 'globe': 'globe', 'world': 'globe', 'arrow': 'arrow-right' };
export function lucideName(nodes, raw){
  const n = String(raw).toLowerCase().trim().replace(/^(fa|lucide|mdi|bi|icon)[-_ ]/, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (nodes[n]) return n;
  if (ICON_ALIAS[n] && nodes[ICON_ALIAS[n]]) return ICON_ALIAS[n];
  const flip = n.split('-').reverse().join('-'); if (nodes[flip]) return flip; // check-circle → circle-check
  const hit = Object.keys(nodes).find(k => k.startsWith(n + '-')) || Object.keys(nodes).find(k => k.includes(n)) || n.split('-').map(p => nodes[p] && p).find(Boolean);
  return hit || 'circle';
}
const lucideSvg = (nodes, name, attrs) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${frame(attrs, 24)}>${(nodes[name] || []).map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('')}</svg>`;

// a brand name → Simple Icons slug (lowercase, no spaces; + → plus, . → dot, & → and)
export const brandSlug = s => String(s).toLowerCase().trim().replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
// any svg → our attributes on its root (size, class…), monochrome logos follow the text colour
function restyle(svg, attrs, size, mono){
  const inner = svg.replace(/^[\s\S]*?<svg\b([^>]*)>/i, (all, a) => `<svg ${(a.match(/\bviewBox=(["'])[^"']*\1/i) || ['viewBox="0 0 24 24"'])[0]} xmlns="http://www.w3.org/2000/svg"${mono ? ' fill="currentColor"' : ''} ${frame(attrs, size)}>`).replace(/<title>[\s\S]*?<\/title>/i, '');
  return inner;
}
const monogram = (name, attrs) => { const t = String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ${frame(attrs, 28)}><rect width="32" height="32" rx="9" fill="currentColor" opacity=".14"/><text x="16" y="20.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${t.length > 1 ? 12 : 15}" font-weight="700" fill="currentColor">${esc(t)}</text></svg>`; };

const cache = new Map();
// loaders: lucide() → icon nodes; vendor(name) → our colour svg or ''; fetchFn for Simple Icons
export async function resolveIcons(code, { lucide, vendor = () => '', fetchFn = fetch } = {}){
  const s = String(code);
  const found = [...s.matchAll(TOKEN)]; if (!found.length) return s;
  const nodes = found.some(m => m[3].toLowerCase() === 'icon') ? await lucide().catch(() => ({})) : {};
  const brands = [...new Set(found.filter(m => m[3].toLowerCase() === 'logo').map(m => m[4].trim()))];
  await Promise.all(brands.map(async b => {
    if (cache.has(b)) return;
    const own = vendor(b); if (own) { cache.set(b, { svg: own, mono: false }); return; }
    try { const r = await fetchFn(SIMPLE_ICONS + brandSlug(b) + '.svg'); const t = r.ok ? await r.text() : ''; cache.set(b, /^\s*<svg\b/i.test(t) ? { svg: t, mono: true } : null); } catch { cache.set(b, null); }
  }));
  return s.replace(TOKEN, (all, a, _q, kind, name, b) => {
    const attrs = a + ' ' + b;
    if (kind.toLowerCase() === 'icon') return lucideSvg(nodes, lucideName(nodes, name), attrs);
    const hit = cache.get(name.trim());
    return hit ? restyle(hit.svg, attrs, 28, hit.mono) : monogram(name, attrs);
  });
}

export const ICONS_DOC = `Icons and logos (never draw empty boxes or placeholder squares for them):
- UI icons: <img src="icon:NAME" alt=""> with any Lucide icon name — rocket, sparkles, brain, cpu, code, chart-line, trophy, shield-check, zap, gauge, globe, users, mail, map-pin, clock, star, check… It becomes an inline SVG in the text colour; size it with width="20" or CSS.
- Company / product logos: <img src="logo:BRAND" alt="Brand"> — openai, anthropic, google, gemini, meta, deepseek, mistral, xai, qwen, nvidia, microsoft, github, stripe, spotify, figma, notion… (the real logo as inline SVG; unknown brands get a neat monogram). Use it for model makers in rankings, partner/client logo walls, integrations and "trusted by" rows.
- Charts and graphs: draw them yourself as inline <svg> (bars, lines, areas with labelled axes and the real numbers) or as CSS bars — never an <img> of a chart (there is no chart image to load).`;
