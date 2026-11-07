/*
 * Page theme — make every component on the page look like one design system, deterministically.
 *  - page palette: all color literals in all items' CSS, clustered, click to replace everywhere
 *  - accent recolor: rotate chromatic colors toward one accent hue, neutrals untouched
 *  - presets, font stack and corner style (the last two go through page.themeCss)
 * The pure helpers at the top have no DOM dependencies, so node can import this module.
 */

/* ── Color parsing / formatting ─────────────────────────── */
const COLOR_RE = /(?<!url\()#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(\s*[^()]*\)/gi;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 3) => +v.toFixed(d);

function num(token, scale){ // "50%" → 0.5*scale, "128" → 128
  const t = String(token).trim();
  if (t.endsWith('%')) return parseFloat(t) / 100 * scale;
  return parseFloat(t);
}
function hue(token){
  const t = String(token).trim().toLowerCase(), v = parseFloat(t);
  if (t.endsWith('turn')) return v * 360;
  if (t.endsWith('rad')) return v * 180 / Math.PI;
  if (t.endsWith('grad')) return v * .9;
  return v;
}

/** Parse a color literal → {r,g,b (0-255), a (0-1), kind: 'hex'|'rgb'|'hsl', legacy: comma syntax} or null. */
export function parseColor(raw){
  const s = String(raw).trim().toLowerCase();
  if (s[0] === '#'){
    let h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255) : 1, kind: 'hex', legacy: true };
  }
  const m = s.match(/^(rgba?|hsla?)\(\s*([^()]*)\)$/); if (!m) return null;
  const legacy = m[2].includes(',');
  let [main, alpha] = m[2].split('/');
  let parts = main.split(legacy ? ',' : /\s+/).map(x => x.trim()).filter(Boolean);
  if (legacy && parts.length === 4) { alpha = parts.pop(); }
  if (parts.length !== 3) return null;
  const a = alpha === undefined ? 1 : clamp(num(alpha, 1));
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.map(p => clamp(Math.round(num(p, 255)), 0, 255));
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a: round(a), kind: 'rgb', legacy };
  }
  const h = hue(parts[0]), sat = clamp(parseFloat(parts[1]) / 100), l = clamp(parseFloat(parts[2]) / 100);
  if ([h, sat, l, a].some(Number.isNaN)) return null;
  return { ...hslToRgb({ h, s: sat, l }), a: round(a), kind: 'hsl', legacy };
}

export function rgbToHsl({ r, g, b }){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s: clamp(s), l };
}
export function hslToRgb({ h, s, l }){
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
/** Opaque #rrggbb key of a color (alpha ignored). */
export const toHex = c => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
const chroma = c => (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;

/** Format a color in the notation of `like` (hex / rgb() / hsl()), keeping the given alpha. */
export function formatColor(c, like = { kind: 'hex', legacy: true }){
  const a = round(clamp(c.a ?? 1));
  if (like.kind === 'hex') return toHex(c) + (a < 1 ? hex2(a * 255) : '');
  if (like.kind === 'rgb') {
    const [r, g, b] = [c.r, c.g, c.b].map(Math.round);
    if (like.legacy) return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
    return `rgb(${r} ${g} ${b}${a < 1 ? ` / ${a}` : ''})`;
  }
  const { h, s, l } = rgbToHsl(c), p = v => round(v * 100, 1) + '%', hh = Math.round(h);
  if (like.legacy) return a < 1 ? `hsla(${hh}, ${p(s)}, ${p(l)}, ${a})` : `hsl(${hh}, ${p(s)}, ${p(l)})`;
  return `hsl(${hh} ${p(s)} ${p(l)}${a < 1 ? ` / ${a}` : ''})`;
}

/* ── Finding colors inside component code ───────────────── */
// Only CSS places are touched: <style> blocks (declaration values only, never selectors like #add),
// style="" attributes and SVG/HTML color attributes. <script> blocks are left alone.
const COLOR_ATTRS = 'fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor';
const REGION_RE = new RegExp(String.raw`(<style\b[^>]*>)([\s\S]*?)(<\/style>)|(<script\b[\s\S]*?<\/script>)|(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')|(\s(?:${COLOR_ATTRS})\s*=\s*)(?:"([^"]*)"|'([^']*)')`, 'gi');
const DECL_RE = /([\w-]+\s*:)([^;{}]+)(?=[;}]|$)/g;

const mapLiterals = (text, fn) => text.replace(COLOR_RE, raw => {
  const c = parseColor(raw); if (!c) return raw;
  const out = fn(c, raw); return out == null ? raw : out;
});
const mapDecls = (css, fn) => css.replace(DECL_RE, (all, prop, value) => prop + mapLiterals(value, fn));

/** Call fn(color, raw) for every color literal in the code's CSS; a returned string replaces the literal. */
export function mapColors(code, fn){
  return String(code ?? '').replace(REGION_RE, (all, sOpen, sBody, sClose, script, stAttr, stD, stS, cAttr, cD, cS) => {
    if (sOpen !== undefined) return sOpen + mapDecls(sBody, fn) + sClose;
    if (script !== undefined) return script;
    if (stAttr !== undefined) return stD !== undefined ? `${stAttr}"${mapDecls(stD, fn)}"` : `${stAttr}'${mapDecls(stS, fn)}'`;
    return cD !== undefined ? `${cAttr}"${mapLiterals(cD, fn)}"` : `${cAttr}'${mapLiterals(cS, fn)}'`;
  });
}

const codesOf = input => (Array.isArray(input) ? input : [input]).map(x => typeof x === 'string' ? x : x?.code || '');
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/**
 * Page palette: every color literal across the input (code string, array of codes or of items),
 * near-duplicates (RGB distance < tolerance) clustered, sorted by usage.
 * → [{ hex, count, members: [{hex, count}], hsl, chroma, translucent }]
 */
export function extractColors(input, { tolerance = 14 } = {}){
  const exact = new Map();
  for (const code of codesOf(input)) mapColors(code, c => {
    const k = toHex(c), e = exact.get(k) || { hex: k, rgb: c, count: 0, translucent: false };
    e.count++; if (c.a < 1) e.translucent = true; exact.set(k, e);
  });
  const clusters = [];
  for (const e of [...exact.values()].sort((a, b) => b.count - a.count)) {
    const home = clusters.find(cl => dist(cl.rgb, e.rgb) < tolerance);
    if (home) { home.members.push({ hex: e.hex, count: e.count }); home.count += e.count; home.translucent ||= e.translucent; }
    else clusters.push({ hex: e.hex, rgb: e.rgb, count: e.count, translucent: e.translucent, members: [{ hex: e.hex, count: e.count }] });
  }
  return clusters.sort((a, b) => b.count - a.count).map(({ rgb, ...cl }) => ({ ...cl, hsl: rgbToHsl(rgb), chroma: chroma(rgb) }));
}

/** Replace every occurrence of `from` (hex or array of hexes, matched by RGB) with `to`, keeping each occurrence's alpha and notation. */
export function replaceColor(code, from, to){
  const keys = new Set((Array.isArray(from) ? from : [from]).map(h => toHex(parseColor(h))));
  const target = parseColor(to); if (!target) return code;
  return mapColors(code, (c, raw) => keys.has(toHex(c)) ? (toHex(c) === toHex(target) ? raw : formatColor({ ...target, a: c.a }, c)) : null);
}

/* ── Accent recolor ─────────────────────────────────────── */
// Grays (incl. Tailwind-style cool/warm grays like #111827, #64748b) are never touched
export const isNeutral = c => { const ch = chroma(c); return ch < .1 || (ch < .2 && rgbToHsl(c).s < .2); };

/** The page's current accent: the most used strongly chromatic color (usage × chroma). Hex or null. */
export function dominantColor(input){
  const chromatic = extractColors(input).filter(c => !isNeutral(parseColor(c.hex)));
  if (!chromatic.length) return null;
  const score = c => c.count * c.chroma * (c.chroma >= .25 ? 2 : 1);
  return chromatic.reduce((a, b) => score(b) > score(a) ? b : a).hex;
}

/**
 * Rotate the hue of every chromatic color by (accent hue − base hue), scale saturation by accent/base,
 * and pull lightness toward the accent for colors whose lightness is close to the base.
 * The base color itself becomes the accent; grays stay as they are; alpha and notation are kept.
 * `base` defaults to dominantColor(code) — pass the page-wide one to keep all items consistent.
 */
export function recolor(code, accent, base = dominantColor(code)){
  const A = parseColor(accent), B = base && parseColor(base);
  if (!A || !B) return code;
  const ah = rgbToHsl(A), bh = rgbToHsl(B);
  const dh = ah.h - bh.h, ds = bh.s > .01 ? clamp(ah.s / bh.s, 0, 1.6) : 1, dl = ah.l - bh.l;
  return mapColors(code, (c, raw) => {
    if (isNeutral(c)) return null;
    const { h, s, l } = rgbToHsl(c);
    const w = clamp(1 - Math.abs(l - bh.l) * 2.5); // full shift near the base lightness, none for very dark/light tints
    const next = { ...hslToRgb({ h: h + dh, s: clamp(s * ds), l: clamp(l + dl * w) }), a: c.a };
    return toHex(next) === toHex(c) ? raw : formatColor(next, c);
  });
}

/** Recolor all items toward `accent` using one page-wide base. → { items, changed } */
export function recolorItems(items, accent){
  const base = dominantColor(items);
  if (!base) return { items, changed: 0 };
  let changed = 0;
  const next = items.map(it => { const code = recolor(it.code, accent, base); if (code !== it.code) changed++; return code === it.code ? it : { ...it, code }; });
  return { items: next, changed, base };
}

/* ── Fonts, corners, presets → themeCss ─────────────────── */
export const PRESETS = [
  { name: 'Ember', accent: '#e4572e' },
  { name: 'Ocean', accent: '#2f7cf6' },
  { name: 'Forest', accent: '#2e9e5b' },
  { name: 'Grape', accent: '#8b5cf6' },
  { name: 'Mono', accent: '#8a8a8a' },
  { name: 'Candy', accent: '#ff5fa2' },
];
export const FONTS = {
  '': { label: 'Component default', stack: '' },
  system: { label: 'System', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  sans: { label: 'Sans (Inter-like)', stack: 'ui-sans-serif, Inter, "Segoe UI Variable", system-ui, "Helvetica Neue", Arial, sans-serif' },
  serif: { label: 'Serif', stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' },
  mono: { label: 'Mono', stack: 'ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace' },
  rounded: { label: 'Rounded', stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", Nunito, system-ui, sans-serif' },
};
export const CORNERS = { sharp: { label: 'Sharp', control: '0', box: '0' }, '': { label: 'Default' }, round: { label: 'Round', control: '999px', box: '18px' } };

/** Compose page.themeCss from { font, corners }. Icon fonts, code and SVG keep their own font. */
export function themeCss({ font = '', corners = '' } = {}){
  const css = [];
  const stack = FONTS[font]?.stack;
  if (stack) css.push(`#__root, #__root :not(i, svg, svg *, code, pre, kbd, samp, [class*="icon"], [class*="material-symbols"], [class*="fa-"]) { font-family: ${stack} !important; }`);
  const c = CORNERS[corners];
  if (c?.control) css.push(
    `#__root :is(button, select, input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"]), [class*="btn"], [class*="button"], [class*="chip"], [class*="badge"], [class*="pill"], [class*="tag"]) { border-radius: ${c.control} !important; }`,
    `#__root :is(textarea, [class*="card"], [class*="panel"], [class*="modal"], [class*="dialog"], [class*="tile"], [class*="box"]) { border-radius: ${c.box} !important; }`);
  return css.join('\n');
}

/* ── UI (browser only) ──────────────────────────────────── */
if (typeof document !== 'undefined') {
  const start = () => mount().catch(e => console.error('theme: failed to mount', e));
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
}

async function mount(){
  const group = document.querySelector('.canvas-toolbar .toolbar-group');
  if (!group || document.getElementById('themeBtn')) return;
  // Loaded lazily so node can import the helpers above without a DOM or CSS loader
  const [{ studio }] = await Promise.all([import('./studio.js'), import('./theme.css')]);

  const button = document.createElement('button');
  button.id = 'themeBtn'; button.className = 'theme-btn'; button.title = 'Page theme: palette, accent, font, corners';
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.4 3.4A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/></svg>theme`;
  const sw = group.querySelector('#swatches');
  sw ? sw.after(button) : group.append(button);

  const panel = document.createElement('div');
  panel.className = 'bg-panel theme-panel hidden'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Page theme');
  document.body.append(panel);

  let palette = [];
  const settings = () => ({ font: '', corners: '', ...(studio.page().theme || {}) });

  function draw(){
    const items = studio.items(), t = settings();
    palette = extractColors(items).slice(0, 30);
    const accent = dominantColor(items) || '#e4572e';
    panel.innerHTML = `
      <div class="bg-head">page theme<button class="btn icon" data-close title="Close">×</button></div>
      <div class="th-label">presets</div>
      <div class="th-presets">${PRESETS.map((p, i) => `<button data-preset="${i}" title="Recolor the page to ${p.name}"><i style="background:${p.accent}"></i>${p.name}</button>`).join('')}</div>
      <label class="bg-field"><span>accent <b>recolors every colored element; grays stay</b></span><input type="color" data-accent value="${accent}"></label>
      <div class="th-label">page colors <span>${palette.length ? 'click to replace everywhere' : 'no colors found'}</span></div>
      <div class="th-palette">${palette.map((c, i) => `<label class="th-swatch${c.translucent ? ' alpha' : ''}" title="${c.hex} · used ${c.count}×${c.members.length > 1 ? ` · ${c.members.length} shades` : ''}" style="--c:${c.hex}"><input type="color" data-pal="${i}" value="${c.hex}"><em>${c.count}</em></label>`).join('')}</div>
      <div class="bg-row">
        <label class="bg-field"><span>font</span><select class="mini-select th-select" data-font>${Object.entries(FONTS).map(([k, f]) => `<option value="${k}"${k === t.font ? ' selected' : ''}>${f.label}</option>`).join('')}</select></label>
      </div>
      <div class="th-label">corners</div>
      <div class="bg-tabs" role="radiogroup">${Object.entries(CORNERS).map(([k, c]) => `<button role="radio" data-corners="${k}" aria-checked="${k === t.corners}" class="${k === t.corners ? 'active' : ''}">${c.label}</button>`).join('')}</div>
      <div class="th-label">dark / light version <span>the AI recolors every block</span></div>
      <div class="bg-tabs"><button data-recolor="dark">🌙 dark</button><button data-recolor="light">☀ light</button></div>
      <div class="th-label">motion</div>
      <label class="th-check"><input type="checkbox" data-reveal${studio.page().reveal ? ' checked' : ''}> blocks appear smoothly while scrolling <span>(published and exported page)</span></label>
      <button class="btn block" data-reset>Reset theme</button>
      <div class="th-hint">Color changes are regular edits: Ctrl+Z undoes them. Reset clears the font and corners.</div>`;
  }

  function applyAccent(accent, name){
    const { items, changed } = recolorItems(studio.items(), accent);
    if (!changed) { studio.status('no colored elements to recolor'); return; }
    studio.update(() => items);
    studio.status(`${name ? name + ' theme' : 'accent'} applied to ${changed} element${changed > 1 ? 's' : ''} · Ctrl+Z to undo`, 'ok');
    draw();
  }
  function setTheme(patch){
    const theme = { ...settings(), ...patch };
    studio.setPage({ theme, themeCss: themeCss(theme) }, { refresh: true });
    draw();
  }

  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close !== undefined) return close();
    if (b.dataset.preset) { const p = PRESETS[+b.dataset.preset]; return applyAccent(p.accent, p.name); }
    if (b.dataset.corners !== undefined) return setTheme({ corners: b.dataset.corners });
    if (b.dataset.recolor) { close(); return studio.recolorAll(b.dataset.recolor); }
    if (b.dataset.reset !== undefined) { studio.setPage({ theme: null, themeCss: '' }, { refresh: true }); studio.status('theme reset · use Ctrl+Z to undo color changes'); draw(); }
  });
  // `change` (not `input`) fires once the picker closes: one undo step, one re-render
  panel.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.accent !== undefined) return applyAccent(el.value);
    if (el.dataset.font !== undefined) return setTheme({ font: el.value });
    if (el.dataset.reveal !== undefined) { studio.setPage({ reveal: el.checked }); studio.status(el.checked ? 'blocks will appear smoothly on the published page' : 'scroll animation off', 'ok'); return; }
    if (el.dataset.pal !== undefined) {
      const c = palette[+el.dataset.pal]; if (!c) return;
      const from = c.members.map(m => m.hex), to = el.value;
      studio.update(list => list.map(it => { const code = replaceColor(it.code, from, to); return code === it.code ? it : { ...it, code }; }));
      studio.status(`${c.hex} → ${to} across the page · Ctrl+Z to undo`, 'ok');
      draw();
    }
  });
  panel.addEventListener('input', e => { // live preview of the swatch while picking
    const el = e.target; if (el.dataset.pal !== undefined) el.closest('.th-swatch')?.style.setProperty('--c', el.value);
  });

  function open(){
    draw(); panel.classList.remove('hidden'); button.setAttribute('aria-expanded', 'true');
    const r = button.getBoundingClientRect();
    panel.style.left = Math.max(12, Math.min(r.left, innerWidth - panel.offsetWidth - 12)) + 'px'; panel.style.top = r.bottom + 8 + 'px';
  }
  function close(){ panel.classList.add('hidden'); button.setAttribute('aria-expanded', 'false'); }
  button.addEventListener('click', () => panel.classList.contains('hidden') ? open() : close());
  addEventListener('pointerdown', e => { if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !button.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
