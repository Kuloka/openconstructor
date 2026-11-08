// Pictures of a published page, made in the browser at publish time (no server-side browser needed):
// - og:   1200×630 JPEG of the top of the page — the link preview in Telegram, X, Reddit, Slack…
// - full: the whole page, 480px wide — the gallery card that scrolls on hover.
// The page is laid out in a hidden, script-less iframe, then drawn through an SVG <foreignObject>.
// An SVG image can't fetch anything, so web fonts (only the subsets the page's text uses) and remote
// images are fetched first and inlined as data: URIs; whatever can't be fetched (no CORS, too slow)
// falls back to a system font / empty box.
const VW = 1440, MAX_H = 6000, FULL_W = 480;

export async function pageShots(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  await inlineAssets(doc).catch(() => {});
  doc.querySelectorAll('script, noscript, iframe, object, embed, video, audio, link[rel="stylesheet"], link[rel="preload"]').forEach(n => n.remove());
  doc.querySelectorAll('[data-oc-badge]').forEach(n => n.remove());
  // the hidden-on-screen "reveal on scroll" state would leave sections invisible in a still picture
  const still = doc.createElement('style');
  still.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}[data-oc-motion],[data-oc-motion] *{animation:none!important}.oc-reveal,[class*="reveal"]{opacity:1!important;transform:none!important;animation:none!important}';
  doc.head.append(still);
  // inside the picture the "screen" is the whole page, so 100vh would stretch hero sections: pin vh to a 900px screen
  const vh = css => css.replace(/(\d*\.?\d+)(d|s|l)?vh\b/g, (_, n) => `${(+n * 9).toFixed(1)}px`);
  doc.querySelectorAll('style').forEach(s => { s.textContent = vh(s.textContent); });
  doc.querySelectorAll('[style*="vh"]').forEach(el => el.setAttribute('style', vh(el.getAttribute('style'))));

  const { height, bg } = await measure(doc.documentElement.outerHTML);
  const h = Math.min(MAX_H, Math.max(400, height));
  const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();

  const draw = (w, ch, sh) => {
    const c = document.createElement('canvas'); c.width = w; c.height = ch;
    const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, ch);
    x.drawImage(img, 0, 0, VW, sh, 0, 0, w, ch);
    return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(Error('canvas is empty')), 'image/jpeg', .82));
  };
  const ogH = Math.min(h, Math.round(VW * 630 / 1200));
  const [og, full] = await Promise.all([draw(1200, Math.round(ogH * 1200 / VW), ogH), draw(FULL_W, Math.round(h * FULL_W / VW), h)]);
  return { og, full, height: h };
}

const FONT_CSS = /^https:\/\/(fonts\.googleapis\.com|fonts\.bunny\.net|api\.fontshare\.com)\//;
const BUDGET = 3_000_000; // bytes of fonts + images inlined into one picture
const get = (url, ms = 4000) => fetch(url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw Error(r.status); return r; });
const dataUrl = blob => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
// does a "U+0000-00FF, U+0131" range cover any character the page shows?
const covers = (range, chars) => range.split(',').some(part => {
  const [a, b] = part.trim().replace(/^U\+/i, '').split('-'); if (a.includes('?')) return true;
  const lo = parseInt(a, 16), hi = b ? parseInt(b, 16) : lo;
  for (const c of chars) if (c >= lo && c <= hi) return true;
  return false;
});
export async function inlineAssets(doc){
  let spent = 0;
  const chars = new Set([...(doc.body?.textContent || '') + 'abcdefghijklmnopqrstuvwxyz0123456789'].map(c => c.codePointAt(0)));
  // web fonts: <link> stylesheets and @import from known font CDNs
  const sheets = [...doc.querySelectorAll('link[rel="stylesheet"][href]')].map(l => l.getAttribute('href')).filter(h => FONT_CSS.test(h));
  doc.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)[^;]*;/g, (m, u) => FONT_CSS.test(u) ? (sheets.push(u), '') : m); });
  const faces = (await Promise.all(sheets.slice(0, 6).map(u => get(u).then(r => r.text()).catch(() => '')))).join('\n').match(/@font-face\s*\{[^}]*\}/g) || [];
  const used = faces.filter(f => { const r = f.match(/unicode-range:\s*([^;}]+)/); return !r || covers(r[1], chars); }).slice(0, 40);
  const css = await Promise.all(used.map(async face => {
    const m = face.match(/url\(\s*['"]?(https:[^'")]+)['"]?\s*\)/); if (!m) return face;
    try { const b = await (await get(m[1])).blob(); if ((spent += b.size) > BUDGET) return ''; return face.replace(m[0], `url(${await dataUrl(b)})`); } catch { return ''; }
  }));
  if (css.some(Boolean)) { const st = doc.createElement('style'); st.textContent = css.join('\n'); doc.head.prepend(st); }
  // remote pictures
  await Promise.all([...doc.querySelectorAll('img[src^="http"]')].slice(0, 24).map(async img => {
    try { const b = await (await get(img.getAttribute('src'))).blob(); if (b.size > 900_000 || (spent += b.size) > BUDGET) return; img.setAttribute('src', await dataUrl(b)); img.removeAttribute('srcset'); img.removeAttribute('loading'); } catch {}
  }));
}

// Lay the page out at desktop width (scripts off); read its height and background colour
function measure(html){
  return new Promise(resolve => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:${VW}px;height:900px;border:0;visibility:hidden;pointer-events:none`;
    const done = (height, bg = '#ffffff') => { f.remove(); resolve({ height, bg }); };
    const t = setTimeout(() => done(900), 4000);
    f.onload = () => setTimeout(() => {
      clearTimeout(t);
      try {
        const d = f.contentDocument, w = f.contentWindow;
        const solid = el => { const c = el && w.getComputedStyle(el).backgroundColor; return c && !/rgba\(.*,\s*0\)|transparent/.test(c) ? c : null; };
        done(Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight || 0), solid(d.body) || solid(d.documentElement) || '#ffffff');
      } catch { done(900); }
    }, 150);
    f.srcdoc = html;
    document.body.append(f);
  });
}

// 16 hex characters of SHA-256 of the page HTML: the pictures' version
export async function htmlHash(html){
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Make both pictures and hand them to the worker; quiet on failure (the page is published either way).
// Skipped when the worker already has pictures of exactly this HTML (an update that changed nothing visible).
export async function uploadShots(slug, html, token){
  try {
    const hash = await htmlHash(html);
    const head = await fetch('/api/shot/' + encodeURIComponent(slug), { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (head?.ok && head.headers.get('ETag') === `"${hash}"`) return true;
    // pictures are stored by content: if this account already has pictures of exactly this HTML
    // (a renamed or re-published page), just point the page at them
    const link = new FormData(); link.append('hash', hash);
    const linked = await fetch('/api/shot/' + encodeURIComponent(slug), { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: link }).catch(() => null);
    if (linked?.ok) return true;
    const { og, full } = await pageShots(html);
    const body = new FormData();
    body.append('og', og, 'og.jpg'); body.append('full', full, 'full.jpg'); body.append('hash', hash);
    const r = await fetch('/api/shot/' + encodeURIComponent(slug), { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body });
    if (!r.ok) console.warn('page pictures were not saved:', r.status);
    return r.ok;
  } catch (err) { console.warn('page pictures were not made:', err?.message); return false; }
}
