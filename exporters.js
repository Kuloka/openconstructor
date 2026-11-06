// exporters.js: turn a page into code for other targets.
//  - snapshot(frames)                   walks the rendered iframes into a flat list of visual nodes
//  - toRobloxLuau / toLoveLua           draw that node list in Roblox (LocalScript) or LÖVE 2D
//  - toReact / toVue / toSvelte         wrap the raw HTML+CSS items in one component file
// No dependencies; snapshot() needs a browser, everything else is pure string building.

export const TARGETS = [
  { id: 'luau', label: 'Roblox (Luau)', ext: '.client.lua' },
  { id: 'love', label: 'LÖVE 2D (Lua)', ext: '.lua' },
  { id: 'react', label: 'React (JSX)', ext: '.jsx' },
  { id: 'vue', label: 'Vue SFC', ext: '.vue' },
  { id: 'svelte', label: 'Svelte', ext: '.svelte' },
];

const PAD = 16, MAX_NODES = 1500, MAX_DEPTH = 200;

/* ── small utils ─────────────────────────────────────────── */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = n => { const s = (Math.round((+n || 0) * 100) / 100).toString(); return s === '-0' ? '0' : s; };
const int = n => Math.round(+n || 0);

// split a CSS value on top-level commas (ignores commas inside parentheses)
function splitTop(str, sep = ',') {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ── colors ──────────────────────────────────────────────── */
const NAMED = {
  black: '#000', white: '#fff', red: '#f00', green: '#008000', lime: '#0f0', blue: '#00f', yellow: '#ff0',
  cyan: '#0ff', aqua: '#0ff', magenta: '#f0f', fuchsia: '#f0f', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', navy: '#000080', teal: '#008080',
  maroon: '#800000', olive: '#808000', indigo: '#4b0082', gold: '#ffd700', coral: '#ff7f50', tomato: '#ff6347',
  crimson: '#dc143c', violet: '#ee82ee', orchid: '#da70d6', salmon: '#fa8072', skyblue: '#87ceeb',
  royalblue: '#4169e1', dodgerblue: '#1e90ff', slategray: '#708090', whitesmoke: '#f5f5f5', beige: '#f5f5dc',
};

function linToSrgb(c) { c = clamp(c, 0, 1); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// any CSS color string → {r,g,b,a} (0..255, a 0..1) or null
export function parseColor(str) {
  if (!str) return null;
  let s = String(str).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[s]) s = NAMED[s];
  if (s[0] === '#') {
    let h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const v = i => parseInt(h.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? Math.round(v(6) / 255 * 1000) / 1000 : 1 };
  }
  const m = s.match(/^([a-z-]+)\((.*)\)$/);
  if (!m) return null;
  const fn = m[1];
  const parts = m[2].replace(/\//g, ' / ').split(/[\s,]+/).filter(Boolean);
  let alpha = 1;
  const slash = parts.indexOf('/');
  let args = parts;
  if (slash >= 0) { alpha = parts[slash + 1]; args = parts.slice(0, slash); }
  else if ((fn === 'rgba' || fn === 'hsla' || fn === 'rgb' || fn === 'hsl') && parts.length === 4) { alpha = parts[3]; args = parts.slice(0, 3); }
  const pa = v => v == null ? 1 : String(v).endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
  const a = clamp(isNaN(pa(alpha)) ? 1 : pa(alpha), 0, 1);
  const n = (v, pctScale = 1) => v === 'none' ? 0 : String(v).endsWith('%') ? parseFloat(v) / 100 * pctScale : parseFloat(v);
  let rgb = null;
  if (fn === 'rgb' || fn === 'rgba') rgb = args.slice(0, 3).map(v => n(v, 255));
  else if (fn === 'hsl' || fn === 'hsla') rgb = hslToRgb(parseFloat(args[0]), n(args[1]) / (String(args[1]).endsWith('%') ? 1 : 100), n(args[2]) / (String(args[2]).endsWith('%') ? 1 : 100));
  else if (fn === 'oklab') rgb = oklabToRgb(n(args[0]), n(args[1], 0.4), n(args[2], 0.4));
  else if (fn === 'oklch') {
    const L = n(args[0]), C = n(args[1], 0.4), H = (parseFloat(args[2]) || 0) * Math.PI / 180;
    rgb = oklabToRgb(L, C * Math.cos(H), C * Math.sin(H));
  } else if (fn === 'color' && (args[0] === 'srgb' || args[0] === 'srgb-linear')) {
    const v = args.slice(1, 4).map(x => n(x));
    rgb = args[0] === 'srgb' ? v.map(x => x * 255) : v.map(linToSrgb);
  }
  if (!rgb || rgb.length < 3 || rgb.some(x => isNaN(x))) return null;
  return { r: int(clamp(rgb[0], 0, 255)), g: int(clamp(rgb[1], 0, 255)), b: int(clamp(rgb[2], 0, 255)), a: Math.round(a * 1000) / 1000 };
}

/* ── gradients ───────────────────────────────────────────── */
const SIDE_ANGLE = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135, 'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315 };
function parseAngle(t) {
  const m = String(t).trim().match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return { deg: v, turn: v * 360, rad: v * 180 / Math.PI, grad: v * 0.9 }[m[2]];
}
function splitColorStop(arg) {
  arg = arg.trim();
  let color, rest;
  const fm = arg.match(/^[a-z-]+\(/i);
  if (fm) {
    let depth = 0, i = 0;
    for (; i < arg.length; i++) { if (arg[i] === '(') depth++; else if (arg[i] === ')' && --depth === 0) break; }
    color = arg.slice(0, i + 1); rest = arg.slice(i + 1);
  } else { const sp = arg.split(/\s+/); color = sp[0]; rest = sp.slice(1).join(' '); }
  return { color, pos: rest.trim().split(/\s+/).filter(Boolean) };
}

// 'linear-gradient(...)' (or radial, approximated top→bottom when allowRadial) → {angle, stops:[{r,g,b,a,pos}]}
export function parseGradient(str, allowRadial = false) {
  if (!str || str === 'none') return null;
  const layers = splitTop(String(str));
  const layer = layers[0];
  const m = layer && layer.match(/^(linear|radial)-gradient\((.*)\)$/is);
  if (!m || (m[1].toLowerCase() === 'radial' && !allowRadial)) return null;
  const args = splitTop(m[2]);
  let angle = 180;
  if (m[1].toLowerCase() === 'linear' && args.length) {
    const a0 = args[0].trim().toLowerCase();
    const ang = parseAngle(a0);
    if (ang != null) { angle = ang; args.shift(); }
    else if (a0.startsWith('to ')) { const k = a0.slice(3).trim().replace(/\s+/g, ' '); if (k in SIDE_ANGLE) angle = SIDE_ANGLE[k]; args.shift(); }
    else if (a0.startsWith('in ')) args.shift(); // color interpolation hint
  }
  const stops = [];
  for (const a of args) {
    const { color, pos } = splitColorStop(a);
    const c = parseColor(color);
    if (!c) continue; // shape/size config for radial, or a color hint
    const toPos = p => p && p.endsWith('%') ? parseFloat(p) / 100 : null;
    stops.push({ ...c, pos: toPos(pos[0]) });
    if (pos[1]) stops.push({ ...c, pos: toPos(pos[1]) });
  }
  if (stops.length < 2) return stops.length === 1 ? { angle, stops: [{ ...stops[0], pos: 0 }, { ...stops[0], pos: 1 }] } : null;
  if (stops[0].pos == null) stops[0].pos = 0;
  if (stops[stops.length - 1].pos == null) stops[stops.length - 1].pos = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].pos != null) continue;
    let j = i; while (stops[j].pos == null) j++;
    const a = stops[i - 1].pos, b = stops[j].pos;
    for (let k = i; k < j; k++) stops[k].pos = a + (b - a) * (k - i + 1) / (j - i + 1);
  }
  for (let i = 1; i < stops.length; i++) stops[i].pos = Math.max(stops[i].pos, stops[i - 1].pos);
  return { angle: ((angle % 360) + 360) % 360, stops };
}

// page.bg (color or gradient string) → { color, gradient }
function parseBackground(bg) {
  const gradient = parseGradient(bg, true);
  const color = gradient ? { ...gradient.stops[0] } : parseColor(bg);
  return { color: color || { r: 9, g: 9, b: 11, a: 1 }, gradient };
}

/* ── 1. snapshot ─────────────────────────────────────────── */
const INPUT_AS_BUTTON = new Set(['button', 'submit', 'reset']);
const INPUT_AS_BOX = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'image']);
const MEDIA = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'OBJECT', 'EMBED']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE', 'BR', 'WBR']);

function applyTransform(text, tt) {
  if (tt === 'uppercase') return text.toUpperCase();
  if (tt === 'lowercase') return text.toLowerCase();
  if (tt === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
  return text;
}
function cleanText(t, ws) {
  t = String(t || '');
  if (/^pre/.test(ws) || ws === 'break-spaces') return t.replace(/\r/g, '').replace(/^\n+|\n+$/g, '');
  return t.replace(/[ \t\r\f\n]+/g, ' ').trim();
}
function rectUnion(rects) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    if (!r || (r.width <= 0 && r.height <= 0)) continue;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  return x0 === Infinity ? null : { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}
function px(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

export function snapshot(frames) {
  const out = [];
  let count = 0;
  (frames || []).forEach((frame, fi) => {
    if (count >= MAX_NODES) return;
    let doc, win, root;
    try { doc = frame.doc; win = doc && doc.defaultView; root = doc && doc.getElementById('__root'); } catch { return; }
    if (!root || !win) return;
    const fx = +frame.x || 0, fy = +frame.y || 0, fname = String(frame.name || 'Element');
    const local = []; let seq = 0;
    const push = node => { if (count >= MAX_NODES) return; count++; local.push(node); };

    const walk = (el, ctx, depth) => {
      if (count >= MAX_NODES || depth > MAX_DEPTH || !el || el.nodeType !== 1 || SKIP.has(el.tagName)) return;
      let cs;
      try { cs = win.getComputedStyle(el); } catch { return; }
      if (!cs || cs.display === 'none') return;
      const opacity = ctx.op * (cs.opacity === '' ? 1 : px(cs.opacity));
      if (opacity <= 0.01) return;
      let z = ctx.z;
      if (cs.position !== 'static' && cs.zIndex !== 'auto' && !isNaN(parseInt(cs.zIndex))) z = parseInt(cs.zIndex);
      const tag = el.tagName.toUpperCase();
      let textDone = ctx.textDone, descend = true;

      try {
        const visible = cs.visibility !== 'hidden' && cs.visibility !== 'collapse';
        const r = el.getBoundingClientRect();
        const hasSize = r.width > 0.5 && r.height > 0.5;
        const name = fname + '/' + tag.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
        const base = {
          name, x: r.left + fx, y: r.top + fy, w: r.width, h: r.height, opacity: Math.round(opacity * 1000) / 1000,
          bg: null, gradient: null, radius: 0, border: null, text: '', color: parseColor(cs.color) || { r: 238, g: 238, b: 238, a: 1 },
          fontSize: px(cs.fontSize) || 16, fontWeight: parseInt(cs.fontWeight) || 400, fontFamily: cs.fontFamily || '',
          align: /center/.test(cs.textAlign) ? 'center' : /right|end/.test(cs.textAlign) ? 'right' : 'left',
          placeholder: '', zIndex: 0,
          pad: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
        };
        // box visuals
        const clipText = /text/.test(cs.backgroundClip || '') || /text/.test(cs.webkitBackgroundClip || cs.getPropertyValue('-webkit-background-clip') || '');
        let bg = parseColor(cs.backgroundColor); if (bg && bg.a <= 0) bg = null;
        let gradient = parseGradient(cs.backgroundImage);
        if (clipText) {
          // gradient text: use the first visible stop as the text color, no box
          const st = gradient && gradient.stops.find(s => s.a > 0);
          if (st && base.color.a < 0.05) base.color = { r: st.r, g: st.g, b: st.b, a: st.a };
          bg = null; gradient = null;
        }
        if (!bg && !gradient && /url\(/.test(cs.backgroundImage || '')) bg = { r: 128, g: 128, b: 128, a: 0.25 };
        let border = null;
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const bw = px(cs['border' + side + 'Width']), st = cs['border' + side + 'Style'];
          const bc = parseColor(cs['border' + side + 'Color']);
          if (bw > 0 && st !== 'none' && st !== 'hidden' && bc && bc.a > 0) { border = { w: bw, color: bc }; break; }
        }
        let radius = 0;
        const rr = cs.borderTopLeftRadius || '';
        radius = rr.endsWith('%') ? parseFloat(rr) / 100 * Math.min(r.width, r.height) : px(rr);
        radius = Math.round(clamp(radius, 0, Math.min(r.width, r.height) / 2) * 10) / 10;
        Object.assign(base, { bg, gradient, border, radius });
        const hasBox = !!(bg || gradient || border);

        // text owned by this element
        let text = '', textRect = null;
        if (!textDone) {
          const kids = [...el.childNodes];
          const directText = kids.filter(n => n.nodeType === 3 && /\S/.test(n.nodeValue));
          const elemKids = kids.filter(n => n.nodeType === 1 && !SKIP.has(n.tagName));
          const allInline = elemKids.every(k => { try { const d = win.getComputedStyle(k).display; return d === 'inline' || d === 'none'; } catch { return false; } });
          if (directText.length && allInline) {
            text = cleanText(el.innerText != null ? el.innerText : el.textContent, cs.whiteSpace);
            const range = doc.createRange(); range.selectNodeContents(el);
            textRect = rectUnion([...range.getClientRects()]);
            textDone = true;
          } else if (directText.length) {
            text = applyTransform(cleanText(directText.map(n => n.nodeValue).join(' '), cs.whiteSpace), cs.textTransform);
            textRect = rectUnion(directText.map(n => { const rg = doc.createRange(); rg.selectNodeContents(n); return rg.getBoundingClientRect(); }));
          }
        }

        if (tag === 'svg' || tag === 'SVG') {
          descend = false;
          if (visible && hasSize) {
            const fill = cs.fill && cs.fill !== 'none' && !/url\(/.test(cs.fill) ? parseColor(cs.fill) : null;
            const stroke = cs.stroke && cs.stroke !== 'none' ? parseColor(cs.stroke) : null;
            const c = (fill && fill.a > 0 ? fill : stroke && stroke.a > 0 ? stroke : null) || base.color;
            push({ ...base, kind: 'icon', bg: { ...c, a: Math.round(c.a * 0.35 * 1000) / 1000 }, gradient: null, border: null, radius: Math.round(Math.min(r.width, r.height) / 4), seq: seq++, z });
          }
        } else if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          descend = false;
          const type = (el.getAttribute('type') || 'text').toLowerCase();
          if (visible && hasSize && type !== 'hidden') {
            if (tag === 'INPUT' && INPUT_AS_BUTTON.has(type)) {
              push({ ...base, kind: 'button', text: el.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''), seq: seq++, z });
            } else if (tag === 'INPUT' && INPUT_AS_BOX.has(type)) {
              const accent = parseColor(cs.accentColor) || { r: 120, g: 120, b: 128, a: 1 };
              push({ ...base, kind: 'box', bg: bg || (el.checked ? accent : { r: 255, g: 255, b: 255, a: 0.12 }), border: border || { w: 1, color: { r: 255, g: 255, b: 255, a: 0.3 } }, radius: type === 'radio' ? Math.min(r.width, r.height) / 2 : radius || 3, seq: seq++, z });
            } else {
              let value = '';
              if (tag === 'SELECT') value = el.selectedIndex >= 0 && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
              else value = type === 'password' ? '•'.repeat(String(el.value || '').length) : String(el.value || '');
              push({ ...base, kind: 'input', text: value, placeholder: el.getAttribute('placeholder') || '', align: base.align, seq: seq++, z });
            }
          }
        } else {
          const role = (el.getAttribute('role') || '').toLowerCase();
          const isButton = tag === 'BUTTON' || role === 'button' || (tag === 'A' && hasBox);
          if (visible && hasSize && isButton) {
            push({ ...base, kind: 'button', text, seq: seq++, z });
            text = '';
          } else if (visible && hasSize && MEDIA.has(tag)) {
            descend = false;
            push({ ...base, kind: 'box', name: name + '(image)', bg: bg || { r: 128, g: 128, b: 128, a: 0.25 }, seq: seq++, z });
          } else if (visible && hasSize && hasBox) {
            push({ ...base, kind: 'box', seq: seq++, z });
          }
          if (visible && text && textRect && textRect.width > 0 && textRect.height > 0 && base.color.a > 0) {
            push({ ...base, kind: 'text', bg: null, gradient: null, border: null, radius: 0, text,
              x: textRect.left + fx, y: textRect.top + fy, w: textRect.width, h: textRect.height, seq: seq++, z });
          }
        }
      } catch { /* one bad element shouldn't break the export */ }

      if (!descend) return;
      for (const child of el.children) walk(child, { op: opacity, z, textDone }, depth + 1);
    };

    try { walk(root, { op: 1, z: 0, textDone: false }, 0); } catch { /* keep what we have */ }
    local.sort((a, b) => a.z - b.z || a.seq - b.seq);
    for (const n of local) { delete n.seq; delete n.z; out.push(n); }
  });
  out.forEach((n, i) => {
    n.zIndex = i + 1;
    for (const k of ['x', 'y', 'w', 'h']) n[k] = Math.round(n[k] * 10) / 10;
  });
  return out;
}

/* ── shared helpers for the Lua targets ──────────────────── */
// Lua/Luau double-quoted string with full escaping (valid in Lua 5.1, LuaJIT and Luau)
function luaStr(s) {
  let o = '"';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    if (ch === '\\') o += '\\\\';
    else if (ch === '"') o += '\\"';
    else if (ch === '\n') o += '\\n';
    else if (ch === '\r') o += '\\r';
    else if (ch === '\t') o += '\\t';
    else if (c < 32 || c === 127) o += '\\' + String(c).padStart(3, '0');
    else o += ch; // UTF-8 passes through unchanged
  }
  return o + '"';
}
const luaComment = s => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\]\]/g, '] ]');
const isMono = fam => /mono|consol|courier|menlo|monaco|code/i.test(String(fam || '').split(',')[0] || '');
function pageHeight(nodes, page) {
  let bottom = 0;
  for (const n of nodes || []) bottom = Math.max(bottom, (+n.y || 0) + (+n.h || 0));
  return Math.ceil(Math.max(+page.h || 0, bottom ? bottom + 48 : 0)) || 900;
}
// widen single-line labels a little so a wider fallback font doesn't wrap the last word
function slack(n) {
  if (n.kind !== 'text' || n.h > n.fontSize * 1.9) return { x: n.x, w: n.w };
  const extra = Math.max(4, n.w * 0.12);
  return { x: n.align === 'center' ? n.x - extra / 2 : n.align === 'right' ? n.x - extra : n.x, w: n.w + extra };
}
const safeNodes = nodes => (Array.isArray(nodes) ? nodes : []).filter(n => n && n.kind && isFinite(n.x) && isFinite(n.y) && n.w > 0 && n.h > 0).slice(0, MAX_NODES);

/* ── 2. Roblox Luau ──────────────────────────────────────── */
const rgb3 = c => `Color3.fromRGB(${int(c.r)}, ${int(c.g)}, ${int(c.b)})`;
const transp = a => num(clamp(1 - a, 0, 1));

function luauGradientStops(g, opacity = 1) {
  let stops = g.stops.slice(0, 20).map(s => ({ ...s, pos: clamp(s.pos, 0, 1) }));
  if (stops[0].pos > 0) stops.unshift({ ...stops[0], pos: 0 });
  if (stops[stops.length - 1].pos < 1) stops.push({ ...stops[stops.length - 1], pos: 1 });
  if (stops.length > 20) stops = [...stops.slice(0, 19), stops[stops.length - 1]];
  // keypoint times must strictly increase; 0 and 1 must be present
  for (let i = 1; i < stops.length; i++) if (stops[i].pos <= stops[i - 1].pos) stops[i].pos = Math.min(1, stops[i - 1].pos + 0.001);
  stops[0].pos = 0; stops[stops.length - 1].pos = 1;
  for (let i = stops.length - 2; i > 0; i--) if (stops[i].pos >= stops[i + 1].pos) stops[i].pos = stops[i + 1].pos - 0.001;
  return '{' + stops.map(s => `{${(Math.round(s.pos * 1000) / 1000).toString()}, ${int(s.r)}, ${int(s.g)}, ${int(s.b)}, ${transp(s.a * opacity)}}`).join(', ') + '}';
}
const luauRotation = angle => num(((angle - 90) % 360 + 360) % 360); // CSS 90deg (to right) = Roblox 0

export function toRobloxLuau(nodes, page, title) {
  const list = safeNodes(nodes);
  const W = Math.round(+page?.w || 1440), H = pageHeight(list, page || {});
  const pbg = parseBackground(page?.bg);
  const L = [];
  L.push(
    `--[[`,
    `  ${luaComment(title || 'My interface')}`,
    `  Generated by openconstructor (https://openconstructor.pw).`,
    ``,
    `  How to use: in Roblox Studio create a LocalScript in`,
    `  StarterPlayer > StarterPlayerScripts (or StarterGui) and paste this file into it.`,
    `  It builds the UI at runtime and scales the ${W}x${H} design to fit the screen.`,
    `  This is a visual snapshot: buttons and text boxes are not wired to any logic yet.`,
    `]]`,
    ``,
    `local Players = game:GetService("Players")`,
    `local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")`,
    ``,
    `local function make(class, props, parent)`,
    `\tlocal o = Instance.new(class)`,
    `\tfor k, v in pairs(props) do o[k] = v end`,
    `\to.Parent = parent`,
    `\treturn o`,
    `end`,
    `local function corner(o, r) make("UICorner", {CornerRadius = UDim.new(0, r)}, o) end`,
    `local function stroke(o, w, color, t)`,
    `\tmake("UIStroke", {Thickness = w, Color = color, Transparency = t, ApplyStrokeMode = Enum.ApplyStrokeMode.Border}, o)`,
    `end`,
    `local function gradient(o, rotation, stops)`,
    `\tlocal c, t = {}, {}`,
    `\tfor i, s in ipairs(stops) do`,
    `\t\tc[i] = ColorSequenceKeypoint.new(s[1], Color3.fromRGB(s[2], s[3], s[4]))`,
    `\t\tt[i] = NumberSequenceKeypoint.new(s[1], s[5])`,
    `\tend`,
    `\tmake("UIGradient", {Rotation = rotation, Color = ColorSequence.new(c), Transparency = NumberSequence.new(t)}, o)`,
    `end`,
    `local function pad(o, t, r, b, l)`,
    `\tmake("UIPadding", {PaddingTop = UDim.new(0, t), PaddingRight = UDim.new(0, r), PaddingBottom = UDim.new(0, b), PaddingLeft = UDim.new(0, l)}, o)`,
    `end`,
    ``,
    `local W, H = ${W}, ${H}`,
    `local gui = make("ScreenGui", {Name = ${luaStr(title || 'Interface')}, ResetOnSpawn = false, IgnoreGuiInset = true, ZIndexBehavior = Enum.ZIndexBehavior.Sibling}, playerGui)`,
    `local root = make("Frame", {Name = "Page", AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(W, H), BackgroundColor3 = ${pbg.gradient ? 'Color3.new(1, 1, 1)' : rgb3(pbg.color)}, BackgroundTransparency = ${transp(pbg.gradient ? 1 : pbg.color.a)}, BorderSizePixel = 0, ClipsDescendants = true}, gui)`,
  );
  if (pbg.gradient) L.push(`gradient(root, ${luauRotation(pbg.gradient.angle)}, ${luauGradientStops(pbg.gradient)})`);
  L.push(
    `local scale = make("UIScale", {}, root)`,
    `local function fit()`,
    `\tlocal vp = workspace.CurrentCamera.ViewportSize`,
    `\tscale.Scale = math.min(vp.X / W, vp.Y / H)`,
    `end`,
    `fit()`,
    `workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)`,
    ``,
    `local o`,
  );

  for (const n of list) {
    const op = clamp(+n.opacity || 1, 0, 1);
    const color = n.color || { r: 238, g: 238, b: 238, a: 1 };
    const font = isMono(n.fontFamily) ? 'Enum.Font.Code' : (+n.fontWeight || 400) >= 600 ? 'Enum.Font.GothamBold' : 'Enum.Font.Gotham';
    const xa = n.align === 'center' ? 'Center' : n.align === 'right' ? 'Right' : 'Left';
    const textProps = t => `Text = ${luaStr(t)}, TextColor3 = ${rgb3(color)}, TextTransparency = ${transp(color.a * op)}, TextSize = ${int(n.fontSize || 14)}, Font = ${font}, TextXAlignment = Enum.TextXAlignment.${xa}, TextWrapped = true`;
    const { x, w } = slack(n);
    const geo = `Name = ${luaStr(n.name || n.kind)}, Position = UDim2.fromOffset(${num(x)}, ${num(n.y)}), Size = UDim2.fromOffset(${num(w)}, ${num(n.h)}), ZIndex = ${int(n.zIndex) || 1}, BorderSizePixel = 0`;
    const bgProps = () => n.gradient
      ? `BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = ${transp(op)}`
      : n.bg ? `BackgroundColor3 = ${rgb3(n.bg)}, BackgroundTransparency = ${transp(n.bg.a * op)}` : `BackgroundTransparency = 1`;
    const decorate = () => {
      const extra = [];
      if (n.radius > 0) extra.push(`corner(o, ${num(n.radius)})`);
      if (n.border && n.border.w > 0) extra.push(`stroke(o, ${num(n.border.w)}, ${rgb3(n.border.color)}, ${transp(n.border.color.a * op)})`);
      if (n.gradient && n.gradient.stops?.length) extra.push(`gradient(o, ${luauRotation(n.gradient.angle)}, ${luauGradientStops(n.gradient)})`);
      return extra.length ? ' ' + extra.join(' ') : '';
    };
    const p = Array.isArray(n.pad) ? n.pad.map(v => num(Math.max(0, +v || 0))) : null;
    if (n.kind === 'text') {
      const multi = n.h > (n.fontSize || 14) * 1.9;
      L.push(`make("TextLabel", {${geo}, BackgroundTransparency = 1, ${textProps(n.text)}, TextYAlignment = Enum.TextYAlignment.${multi ? 'Top' : 'Center'}}, root)`);
    } else if (n.kind === 'button') {
      L.push(`o = make("TextButton", {${geo}, ${bgProps()}, AutoButtonColor = true, ${textProps(n.text || '')}}, root)` + decorate() + (p && n.align !== 'center' ? ` pad(o, 0, ${p[1]}, 0, ${p[3]})` : ''));
    } else if (n.kind === 'input') {
      const ph = { r: color.r * 0.6, g: color.g * 0.6, b: color.b * 0.6 }; // Color3 has no alpha: dim instead
      L.push(`o = make("TextBox", {${geo}, ${bgProps()}, ClearTextOnFocus = false, PlaceholderText = ${luaStr(n.placeholder || '')}, PlaceholderColor3 = ${rgb3(ph)}, ${textProps(n.text || '')}}, root)` + decorate() + (p ? ` pad(o, 0, ${p[1]}, 0, ${p[3]})` : ''));
    } else {
      // box / icon
      L.push(`o = make("Frame", {${geo}, ${bgProps()}}, root)` + decorate());
    }
  }
  L.push('');
  return L.join('\n');
}

/* ── 3. LÖVE 2D ──────────────────────────────────────────── */
const loveColor = (c, op = 1) => `{${num(c.r / 255)}, ${num(c.g / 255)}, ${num(c.b / 255)}, ${num(clamp(c.a * op, 0, 1))}}`;

export function toLoveLua(nodes, page, title) {
  const list = safeNodes(nodes);
  const W = Math.round(+page?.w || 1440), H = pageHeight(list, page || {});
  const pbg = parseBackground(page?.bg);
  const sizes = new Set();
  const rows = list.map(n => {
    const op = clamp(+n.opacity || 1, 0, 1);
    const f = [`k = ${luaStr(n.kind)}`];
    const { x, w } = slack(n);
    f.push(`x = ${num(x)}, y = ${num(n.y)}, w = ${num(w)}, h = ${num(n.h)}`);
    // gradients are approximated by their first visible stop
    const g = n.gradient && n.gradient.stops && (n.gradient.stops.find(s => s.a > 0) || n.gradient.stops[0]);
    const fill = g || n.bg;
    if (fill && n.kind !== 'text') f.push(`bg = ${loveColor(fill, op)}`);
    if (n.radius > 0) f.push(`r = ${num(n.radius)}`);
    if (n.border && n.border.w > 0) f.push(`bw = ${num(n.border.w)}, bc = ${loveColor(n.border.color, op)}`);
    if (n.kind === 'text' || n.kind === 'button' || n.kind === 'input') {
      const fs = clamp(int(n.fontSize || 14), 6, 200); sizes.add(fs);
      const c = n.color || { r: 238, g: 238, b: 238, a: 1 };
      const showPh = n.kind === 'input' && !n.text && n.placeholder;
      f.push(`t = ${luaStr(showPh ? n.placeholder : n.text || '')}, c = ${loveColor(c, op * (showPh ? 0.5 : 1))}, fs = ${fs}, al = ${luaStr(n.kind === 'input' ? (n.align || 'left') : n.align || 'left')}`);
      if (n.kind !== 'text' && Array.isArray(n.pad)) f.push(`pl = ${num(n.align === 'center' ? 0 : n.pad[3])}, pr = ${num(n.align === 'center' ? 0 : n.pad[1])}`);
    }
    return `\t{${f.join(', ')}},`;
  });
  return [
    `-- ${luaComment(title || 'My interface')}`,
    `-- Generated by openconstructor (https://openconstructor.pw).`,
    `-- Save as main.lua in an empty folder and run it with LÖVE 11.x:  love <folder>`,
    `-- A static snapshot of the design (${W}x${H}); it scales to fit the window.`,
    ``,
    `local W, H = ${W}, ${H}`,
    `local BG = ${loveColor(pbg.color)}`,
    `local nodes = {`,
    ...rows,
    `}`,
    `local fonts = {}`,
    ``,
    `local function font(size)`,
    `\tif not fonts[size] then fonts[size] = love.graphics.newFont(size) end`,
    `\treturn fonts[size]`,
    `end`,
    ``,
    `function love.load()`,
    `\tlove.window.setTitle(${luaStr(title || 'My interface')})`,
    `\tlocal dw, dh = love.window.getDesktopDimensions()`,
    `\tlocal s = math.min(1, dw * 0.9 / W, dh * 0.85 / H)`,
    `\tlove.window.setMode(math.floor(W * s), math.floor(H * s), {resizable = true, highdpi = true, minwidth = 200, minheight = 150})`,
    `\tfor _, n in ipairs(nodes) do`,
    `\t\tif n.fs then`,
    `\t\t\tlocal f = font(n.fs)`,
    `\t\t\tn.tw = math.max(1, n.w - (n.pl or 0) - (n.pr or 0))`,
    `\t\t\tlocal _, lines = f:getWrap(n.t, n.tw)`,
    `\t\t\tlocal th = math.max(1, #lines) * f:getHeight()`,
    `\t\t\tif n.k == "text" and n.h > n.fs * 1.9 then n.ty = n.y else n.ty = n.y + (n.h - th) / 2 end`,
    `\t\tend`,
    `\tend`,
    `end`,
    ``,
    `function love.draw()`,
    `\tlove.graphics.clear(BG[1], BG[2], BG[3], 1)`,
    `\tlocal ww, wh = love.graphics.getDimensions()`,
    `\tlocal s = math.min(ww / W, wh / H)`,
    `\tlove.graphics.push()`,
    `\tlove.graphics.translate((ww - W * s) / 2, (wh - H * s) / 2)`,
    `\tlove.graphics.scale(s, s)`,
    `\tlove.graphics.setScissor((ww - W * s) / 2, (wh - H * s) / 2, W * s, H * s)`,
    `\tfor _, n in ipairs(nodes) do`,
    `\t\tlocal r = n.r or 0`,
    `\t\tif n.bg then`,
    `\t\t\tlove.graphics.setColor(n.bg)`,
    `\t\t\tlove.graphics.rectangle("fill", n.x, n.y, n.w, n.h, r, r)`,
    `\t\tend`,
    `\t\tif n.bw then`,
    `\t\t\tlove.graphics.setColor(n.bc)`,
    `\t\t\tlove.graphics.setLineWidth(n.bw)`,
    `\t\t\tlove.graphics.rectangle("line", n.x + n.bw / 2, n.y + n.bw / 2, n.w - n.bw, n.h - n.bw, r, r)`,
    `\t\tend`,
    `\t\tif n.fs and n.t ~= "" then`,
    `\t\t\tlove.graphics.setColor(n.c)`,
    `\t\t\tlove.graphics.setFont(font(n.fs))`,
    `\t\t\tlove.graphics.printf(n.t, n.x + (n.pl or 0), n.ty or n.y, n.tw or n.w, n.al)`,
    `\t\tend`,
    `\tend`,
    `\tlove.graphics.setScissor()`,
    `\tlove.graphics.pop()`,
    `\tlove.graphics.setColor(1, 1, 1, 1)`,
    `end`,
    ``,
  ].join('\n');
}

/* ── 4. React / Vue / Svelte ─────────────────────────────── */
function componentName(title) {
  const words = String(title || '').normalize('NFKD').replace(/[^\w\s-]/g, ' ').split(/[\s_-]+/).filter(Boolean);
  let name = words.map(w => w[0].toUpperCase() + w.slice(1)).join('').replace(/\W/g, '');
  if (!name) return 'Page';
  if (/^\d/.test(name)) name = 'Page' + name;
  return name;
}
// body of a JS template literal: escape \, `, ${ and </ (so it can sit inside <script>)
const tpl = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/<\//g, '<\\/');
const jsStr = s => JSON.stringify(String(s ?? '')).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\//g, '<\\/');

// pull <style> blocks out of each item's HTML, drop <script>s (they never ran in the builder either)
function prepareItems(items, page) {
  const W = Math.round(+page?.w || 1440);
  const styles = [];
  let bottom = 0;
  const list = (Array.isArray(items) ? items : []).filter(Boolean).map(it => {
    let html = String(it.code ?? '');
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => { if (css.trim()) styles.push(`/* ${String(it.name || 'element').replace(/\*\//g, '* /')} */\n${css.trim()}`); return ''; });
    html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').trim();
    const x = Math.round(+it.x || 0), y = Math.round(+it.y || 0);
    bottom = Math.max(bottom, y + (+it.h || 0));
    const style = it.full
      ? { position: 'absolute', left: 0, top: y, width: W }
      : { position: 'absolute', left: x, top: y, padding: PAD, boxSizing: 'border-box', width: 'max-content', maxWidth: W - 2 * PAD };
    return { name: String(it.name || ''), html, style };
  });
  const H = Math.ceil(Math.max(+page?.h || 900, bottom ? bottom + 48 : 0));
  const bg = String(page?.bg || '#09090b').replace(/[;{}<>]/g, '');
  const base = `.oc-page{position:relative;width:${W}px;min-height:${H}px;margin:0 auto;background:${bg};color:#eee;font-family:system-ui;overflow:hidden}\n.oc-page button{white-space:nowrap}`;
  const css = [base, ...styles].join('\n\n').replace(/<\/style/gi, '<\\/style');
  return { list, css, W, H };
}
const cssText = st => Object.entries(st).map(([k, v]) => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${typeof v === 'number' && k !== 'zIndex' ? v + 'px' : v}`).join(';');
const header = (title, kind) => `Generated by openconstructor (https://openconstructor.pw) from "${String(title || 'My interface').replace(/\*\/|-->|[\r\n]/g, ' ')}". ${kind}`;

export function toReact(items, page, title) {
  const { list, css } = prepareItems(items, page);
  const name = componentName(title);
  return [
    `/* ${header(title, 'A single self-contained React component; each element keeps its original HTML.')} */`,
    ``,
    `const css = \`${tpl(css)}\`;`,
    ``,
    `const items = [`,
    ...list.map(it => `  {\n    name: ${jsStr(it.name)},\n    style: ${JSON.stringify(it.style)},\n    html: \`${tpl(it.html)}\`,\n  },`),
    `];`,
    ``,
    `export default function ${name}() {`,
    `  return (`,
    `    <div className="oc-page">`,
    `      <style>{css}</style>`,
    `      {items.map((it, i) => (`,
    `        <div key={i} data-name={it.name} style={it.style} dangerouslySetInnerHTML={{ __html: it.html }} />`,
    `      ))}`,
    `    </div>`,
    `  );`,
    `}`,
    ``,
  ].join('\n');
}

export function toVue(items, page, title) {
  const { list, css } = prepareItems(items, page);
  const name = componentName(title);
  return [
    `<!-- ${header(title, 'Vue 3 single-file component; each element keeps its original HTML.')} -->`,
    `<template>`,
    `  <div class="oc-page">`,
    `    <div v-for="(it, i) in items" :key="i" :data-name="it.name" :style="it.style" v-html="it.html"></div>`,
    `  </div>`,
    `</template>`,
    ``,
    `<script>`,
    `const items = [`,
    ...list.map(it => `  {\n    name: ${jsStr(it.name)},\n    style: ${jsStr(cssText(it.style))},\n    html: \`${tpl(it.html)}\`,\n  },`),
    `];`,
    ``,
    `export default {`,
    `  name: ${jsStr(name)},`,
    `  data: () => ({ items }),`,
    `};`,
    `</script>`,
    ``,
    `<style>`,
    css,
    `</style>`,
    ``,
  ].join('\n');
}

export function toSvelte(items, page, title) {
  const { list, css } = prepareItems(items, page);
  return [
    `<!-- ${header(title, 'Svelte component; styles go to <svelte:head> so the original class names keep working.')} -->`,
    `<script>`,
    `  const css = \`${tpl(css)}\`;`,
    `  const styleTag = '<style>' + css + '<\\/style>';`,
    ``,
    `  const items = [`,
    ...list.map(it => `    {\n      name: ${jsStr(it.name)},\n      style: ${jsStr(cssText(it.style))},\n      html: \`${tpl(it.html)}\`,\n    },`),
    `  ];`,
    `</script>`,
    ``,
    `<svelte:head>`,
    `  {@html styleTag}`,
    `</svelte:head>`,
    ``,
    `<div class="oc-page">`,
    `  {#each items as it}`,
    `    <div data-name={it.name} style={it.style}>{@html it.html}</div>`,
    `  {/each}`,
    `</div>`,
    ``,
  ].join('\n');
}
