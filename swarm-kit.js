// Swarm kit: what makes a weak open model build pages that look designed.
// The model does not invent the design system — it picks one of a few hand-made ones (fonts, type scale,
// spacing, palette, layout primitives). Section agents then only compose content from ready classes,
// with a short focused prompt instead of the whole website prompt. Measured with scripts/eval/run.mjs.

// ── Language: every visible word goes in the language of the request (the briefs are English) ──
const LANGS = [
  [/[а-яё]/i, 'Russian'], [/[ğışçöü]/i, 'Turkish'], [/[äöüß]/i, 'German'], [/[ñ¿¡]|[áéíóú].*\b(el|la|de|para)\b/i, 'Spanish'],
];
export const requestLang = text => (LANGS.find(([re]) => re.test(text)) || [, 'English'])[1];

// ── Design systems: hand-tuned tokens. System font stacks only (no external fonts on published pages). ──
const SANS = `ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI Variable Display","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif`;
const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif`;
const MONO = `ui-monospace,"SF Mono","Cascadia Mono","Segoe UI Mono",Menlo,Consolas,monospace`;

export const SYSTEMS = {
  // clean product/SaaS — white, ink text, one saturated accent
  product: { light: true, label: 'clean product (SaaS, apps, services, clinics, schools)', bg: '#ffffff', surface: '#f6f7f9', text: '#0b0d12', muted: '#5b6170', line: '#e6e8ec', accent: '#2f5bff', radius: '14px', head: SANS, body: SANS, hw: 650, track: '-0.035em' },
  // warm editorial — cream paper, serif headlines (cafés, restaurants, crafts, hotels, wedding)
  warm: { light: true, label: 'warm editorial (cafés, restaurants, bakeries, handmade goods, hotels, weddings)', bg: '#f7f2ea', surface: '#efe7da', text: '#1f1a14', muted: '#6e6457', line: '#e0d5c4', accent: '#b4532a', radius: '6px', head: SERIF, body: SANS, hw: 500, track: '-0.02em' },
  // quiet luxury — near-black, serif, thin lines (real estate, jewellery, architecture, beauty)
  noir: { light: false, label: 'quiet luxury dark (real estate, architecture, jewellery, premium beauty, fashion)', bg: '#0c0c0d', surface: '#151517', text: '#f3f1ec', muted: '#9a968d', line: '#2a2a2d', accent: '#c9a96e', radius: '2px', head: SERIF, body: SANS, hw: 400, track: '-0.02em' },
  // bold studio — off-white, huge grotesk, black blocks (agencies, portfolios, studios, events)
  studio: { light: true, label: 'bold studio (design agencies, portfolios, creative studios, events)', bg: '#f4f4f1', surface: '#e9e9e4', text: '#0a0a0a', muted: '#62625c', line: '#d6d6cf', accent: '#ff4a1c', radius: '0px', head: SANS, body: SANS, hw: 700, track: '-0.05em' },
  // tech dark — graphite, mono labels (dev tools, AI, crypto, gaming)
  tech: { light: false, label: 'tech dark (developer tools, AI, data, crypto, gaming)', bg: '#0a0b0e', surface: '#12141a', text: '#eef0f4', muted: '#8b91a0', line: '#23262f', accent: '#7cf0b4', radius: '10px', head: SANS, body: SANS, hw: 620, track: '-0.04em' },
  // fresh soft — light tint, rounded, friendly (kids, health, fitness, pets, food delivery)
  soft: { light: true, label: 'fresh & friendly (fitness, wellness, kids, pets, delivery, education for kids)', bg: '#fbfaf7', surface: '#f0f4ee', text: '#16201a', muted: '#5c6a60', line: '#dfe6dc', accent: '#1f8a5b', radius: '22px', head: SANS, body: SANS, hw: 700, track: '-0.03em' },
};
const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
const ink = c => { const n = parseInt(c.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#0b0b0c' : '#ffffff'; };

// The shared CSS every section builds on: tokens, type scale, layout primitives, components, motion.
export function systemCSS(id, accent){
  const s = SYSTEMS[id] || SYSTEMS.product, a = hex(accent) || s.accent;
  return `.pg{--bg:${s.bg};--surface:${s.surface};--text:${s.text};--muted:${s.muted};--line:${s.line};--accent:${a};--accent-text:${ink(a)};--radius:${s.radius};--head:${s.head};--font:${s.body};--mono:${MONO};
background:var(--bg);color:var(--text);font:400 17px/1.6 var(--font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:clip}
.pg *,.pg *::before,.pg *::after{box-sizing:border-box}
.pg :where(h1,h2,h3,h4,p,ul,ol,figure,blockquote){margin:0}
.pg :where(ul,ol){padding:0;list-style:none}
.pg img{display:block;max-width:100%}
.pg a{color:inherit;text-decoration:none}
.pg .wrap{max-width:1180px;margin:0 auto;padding:0 32px}
.pg .sec{padding:112px 0}
.pg .sec.tight{padding:72px 0}
.pg .alt{background:var(--surface)}
.pg :where(h1,h2,h3){font-family:var(--head);font-weight:${s.hw};letter-spacing:${s.track};line-height:1.04;text-wrap:balance}
.pg h1{font-size:clamp(44px,6.4vw,92px)}
.pg h2{font-size:clamp(32px,4vw,56px)}
.pg h3{font-size:clamp(20px,1.6vw,24px);line-height:1.2;letter-spacing:-0.015em}
.pg .lead{font-size:clamp(18px,1.5vw,21px);color:var(--muted);max-width:56ch;text-wrap:pretty}
.pg .muted{color:var(--muted)}
.pg .eyebrow{display:inline-block;font:500 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:20px}
.pg .head{max-width:760px;margin-bottom:56px}
.pg .head.center{margin-left:auto;margin-right:auto;text-align:center}
.pg .head .lead{margin-top:18px}
.pg .head.center .lead{margin-left:auto;margin-right:auto}
.pg .grid{display:grid;gap:24px}
.pg .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.pg .g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.pg .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.pg .split{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center}
.pg .stack{display:flex;flex-direction:column;gap:16px}
.pg .row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.pg .card{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);padding:28px;transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s,border-color .35s}
.pg .alt .card{background:var(--bg)}
.pg :not(.alt)>.wrap .card{background:var(--surface);border-color:transparent}
.pg .card:hover{transform:translateY(-4px);box-shadow:0 18px 40px -22px rgba(0,0,0,.35)}
.pg .media{border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.pg .media img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.pg .media:hover img{transform:scale(1.04)}
.pg .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 24px;border-radius:min(var(--radius),999px);background:var(--accent);color:var(--accent-text);font:600 15px/1 var(--font);border:1px solid var(--accent);cursor:pointer;transition:transform .2s,filter .2s}
.pg .btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.pg .btn-ghost{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 24px;border-radius:min(var(--radius),999px);background:transparent;color:var(--text);font:600 15px/1 var(--font);border:1px solid var(--line);cursor:pointer;transition:border-color .2s,background .2s}
.pg .btn-ghost:hover{border-color:var(--text)}
.pg :is(.btn,.btn-ghost):focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.pg .tag{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);font-size:13px;color:var(--muted)}
.pg .price{font-family:var(--head);font-size:clamp(36px,3.4vw,48px);font-weight:${s.hw};letter-spacing:${s.track};line-height:1}
.pg .num{font-family:var(--head);font-size:clamp(40px,4.4vw,64px);font-weight:${s.hw};letter-spacing:${s.track};line-height:1}
.pg .list>li{display:flex;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:1px solid var(--line)}
.pg .divider{height:1px;background:var(--line);border:0;margin:0}
.pg .icon{width:44px;height:44px;border-radius:min(var(--radius),12px);display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.pg .icon svg{width:22px;height:22px}
.pg :where(input,select,textarea){width:100%;min-height:48px;padding:12px 16px;border-radius:min(var(--radius),12px);border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}
.pg textarea{min-height:120px}
.pg label{display:block;font-size:14px;font-weight:500;margin-bottom:8px}
@supports (animation-timeline:view()){.pg .reveal{animation:pg-rise linear both;animation-timeline:view();animation-range:entry 0% cover 28%}}
@keyframes pg-rise{from{opacity:0;transform:translateY(40px)}}
@media (prefers-reduced-motion:reduce){.pg *{animation:none!important;transition:none!important}}
@media (max-width:900px){.pg .g3,.pg .g4{grid-template-columns:repeat(2,minmax(0,1fr))}.pg .split{grid-template-columns:1fr;gap:40px}}
@media (max-width:600px){.pg .wrap{padding:0 20px}.pg .sec{padding:72px 0}.pg .g2,.pg .g3,.pg .g4{grid-template-columns:1fr}.pg .head{margin-bottom:36px}}`;
}

export const KIT_DOC = `READY CLASSES (already styled — use them, do not restyle them):
layout: .wrap (centered container) · .sec (section padding; add .tight for less) · .alt (surface background — the planner says which sections get it) · .grid + .g2/.g3/.g4 (equal columns, collapse on mobile) · .split (text | media two columns) · .stack (vertical gap) · .row (horizontal, wraps)
text: h1 (hero only), h2 (section titles), h3 (card titles) · .eyebrow (small label above a title) · .lead (big muted intro) · .muted · .head (title block: .eyebrow + h2 + .lead; add .center to centre)
parts: .card (padded box with hover lift) · .media (rounded image frame: <div class="media" style="aspect-ratio:4/3"><img …></div>) · .btn / .btn-ghost · .tag (pill) · .price / .num (big figures) · .list>li (two-column row with a divider — menus, schedules, specs) · .icon (accent tile for an inline SVG 24×24 stroke icon) · .divider · .reveal (rises in on scroll)
forms: plain <label>, <input>, <select>, <textarea> are styled.`;

// The short system prompt for one section agent (replaces the whole website prompt)
export const sectionSystem = lang => `You are a senior web designer writing ONE section of a landing page that a team builds in parallel. Your output is pasted into the page as is.
Reply with ONLY one \`\`\`html block — no JSON, no words before or after.
${KIT_DOC}
Rules:
- Build the section from the ready classes; your own <style> is ONLY for what they do not cover (a special layout, a decoration). Never set font-family (only var(--serif), var(--mono) or var(--condensed) where the ART DIRECTION asks for them), never redefine .wrap/.btn/.card/h1/h2/h3, never hard-code colours: use var(--bg) var(--surface) var(--text) var(--muted) var(--line) var(--accent) var(--accent-text).
- Every grid must line up: equal items in .grid.g2/.g3/.g4, a text+picture pair in .split. Do not put a lone small picture next to a list; no empty boxes, no placeholder rectangles, no fake maps (an address is just text + a photo).
- ALL visible text in ${lang} — headings, labels, .eyebrow, buttons, nav links, form labels, placeholders, alt texts. Brand names may stay as they are. Never mix languages.
- Real, specific content: real-sounding names, numbers, prices, times, addresses for this business. No lorem ipsum, no "Feature 1".
- Photos: <img src="photo:2-4 English words" alt="…"> inside a .media frame with an aspect-ratio (photos must show this business — "latte art cup", not "glass"). Icons and logos: see below (icon: and logo: pictures).
- No JavaScript, no external URLs or fonts. Add class "reveal" to cards and media so they rise in on scroll.
${INTERACTIVE_DOC}
${ICONS_DOC}`;

// controls without JavaScript (tabs, filters, accordions) — interactive-kit.js
import { INTERACTIVE_DOC } from './interactive-kit.js';
import { ICONS_DOC } from './icon-tokens.js';
// What the planner chooses instead of writing CSS
export const PLANNER_SYSTEMS = Object.entries(SYSTEMS).map(([id, s]) => `"${id}" — ${s.label}`).join('; ');
