// Controls that work without JavaScript (pages are HTML + CSS only: scripts are off on the canvas and in exports).
// The model writes only the markup; withInteractive() adds the CSS when the page uses it (studio.js, after the answer).
//   tabs / filters / segmented switches:  hidden radios + labels; the checked one shows its panel (:has)
//   accordions / FAQ: <details class="oc-acc"><summary>…</summary>…</details>
//   on/off toggles: <label class="oc-toggle"><input type="checkbox"><i></i> text</label>
const N = 8;
const panels = Array.from({ length: N }, (_, i) => `.oc-tabs:has(>input:nth-of-type(${i + 1}):checked)>.oc-panels>:nth-child(${i + 1})`).join(',');
export const INTERACTIVE_CSS = `.oc-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.oc-tabs>input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.oc-tabs>label{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border:1px solid var(--line,#ffffff26);border-radius:99px;color:var(--muted,inherit);font:inherit;font-size:13px;cursor:pointer;user-select:none;transition:background .2s,color .2s,border-color .2s}
.oc-tabs>label:hover{color:var(--text,inherit);border-color:var(--text,currentColor)}
.oc-tabs>input:checked+label{background:var(--text,#fff);border-color:var(--text,#fff);color:var(--bg,#000)}
.oc-tabs>input:focus-visible+label{outline:2px solid var(--accent,currentColor);outline-offset:2px}
.oc-tabs>.oc-panels{flex-basis:100%;margin-top:18px}
.oc-tabs>.oc-panels>*{display:none}
${panels}{display:block;animation:oc-tab-in .35s ease both}
@keyframes oc-tab-in{from{opacity:0;transform:translateY(6px)}}
.oc-acc{border-bottom:1px solid var(--line,#ffffff26)}
.oc-acc>summary{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;cursor:pointer;list-style:none;font-weight:600}
.oc-acc>summary::-webkit-details-marker{display:none}
.oc-acc>summary::after{content:"+";font-size:1.4em;line-height:1;transition:transform .25s}
.oc-acc[open]>summary::after{transform:rotate(45deg)}
.oc-acc>:not(summary){margin:0 0 18px;color:var(--muted,inherit);animation:oc-tab-in .3s ease both}
.oc-toggle{display:inline-flex;align-items:center;gap:10px;cursor:pointer}
.oc-toggle>input{position:absolute;opacity:0;width:1px;height:1px}
.oc-toggle>i{position:relative;width:42px;height:24px;border-radius:99px;background:var(--line,#ffffff33);transition:background .2s}
.oc-toggle>i::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .25s}
.oc-toggle>input:checked+i{background:var(--accent,#5b5bf6)}
.oc-toggle>input:checked+i::after{transform:translateX(18px)}
@media (prefers-reduced-motion:reduce){.oc-tabs *,.oc-acc *{animation:none!important}}`;

// what the model reads (the main prompt and the section agents)
export const INTERACTIVE_DOC = `Interactive controls WITHOUT JavaScript (scripts never run on these pages — a <button> that should switch, filter or open something does NOTHING; use these patterns, their CSS is added automatically):
- Tabs, filters, segmented switches ("All · Code · Math", monthly/yearly prices, menu categories): <div class="oc-tabs"><input type="radio" name="UNIQUE" id="UNIQUE-1" checked><label for="UNIQUE-1">All</label><input type="radio" name="UNIQUE" id="UNIQUE-2"><label for="UNIQUE-2">Code</label><div class="oc-panels"><div>…content for All…</div><div>…content for Code…</div></div></div> — radios and labels alternate as direct children, then ONE .oc-panels with one child per tab in the same order (up to 8); every panel holds real, different content; ids/names unique on the page.
- FAQ / accordions: <details class="oc-acc"><summary>Question</summary><p>Answer</p></details>.
- On/off switches: <label class="oc-toggle"><input type="checkbox"><i></i> Label</label>.
- Every button and link must lead somewhere real: navigation and "Learn more" are <a href="#pricing" class="btn">…</a> with id="pricing" on that section (give every section an id); action buttons ("Order", "Book a table", "Sign up", "Get a quote", "Contact us") link to a section with a real <form> (name, e-mail or phone, message, a submit button) — forms on published pages really send to the author. Never write href="#", an empty href or a <button> outside a form. Anything still left dead is wired automatically: to the matching section by its text, or to a pop-up request form.`;

// ─── Dead buttons and links → working ones ───
// The model often leaves <a href="#">, <button>Order</button> and the like. Without scripts they do nothing, so
// after every answer wireControls() sends each one somewhere real, judged by its text:
//   a section of the page that matches ("Prices" → #pricing, "Menu" → #menu, "Learn more" → the next section),
//   actions ("Order", "Book", "Sign up", "Contact") → the page's own form, or else a pop-up form (:target, no JS);
//   on a published page that form really reaches the author (worker.js formsWork → /api/form/<slug>).
// A <button> becomes <a class="oc-btn">; the page's `button` CSS selectors are widened so it keeps its look.
const FAMILIES = [
  ['pricing', /pric|\bplans?\b|tarif|тариф|цен[аыу]|стоимост|прайс/i],
  ['menu', /\bmenu\b|меню/i],
  ['faq', /\bfaq\b|question|вопрос/i],
  ['reviews', /review|testimonial|отзыв/i],
  ['team', /\bteam\b|команд/i],
  ['about', /about|our story|о нас|о компании|истори/i],
  ['features', /feature|benefit|\bwhy\b|возможност|преимущ|почему/i],
  ['services', /service|услуг/i],
  ['work', /portfolio|\bwork\b|project|case|gallery|портфолио|работ[ыа]|проект|галере|кейс/i],
  ['shop', /\bshop\b|store|product|catalog|collection|магазин|каталог|товар|коллекц/i],
  ['location', /location|address|find us|visit us|\bmap\b|hours|адрес|как добраться|где мы|карт[аеу]/i],
  ['blog', /\bblog\b|news|article|блог|новост|стать/i],
  ['contact', /contact|order|book|reserv|\bbuy\b|purchase|get started|start now|sign ?up|join|subscribe|demo|quote|hire|talk|request|apply|register|enrol|\bcall\b|reach|try (it )?free|get in touch|log ?in|sign ?in|account|заказ|куп|запис|связ|контакт|брон|начать|подпис|заявк|оформ|регистр|звон|напиш|войти|вход|аккаунт|попроб/i],
];
const familyOf = text => (FAMILIES.find(([, re]) => re.test(text)) || [])[0] || '';
const plain = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (attrs, name) => (new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs) || []).slice(2).find(v => v != null);
const MORE = /more|learn|explore|discover|\bsee\b|\bview\b|details|подробн|узнать|смотр|далее|ещё|еще/i;

export const MODAL_CSS = `.oc-modal{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.55)}
.oc-modal:target{display:grid;animation:oc-tab-in .25s ease both}
.oc-modal>.oc-modal-bg{position:absolute;inset:0;cursor:default}
.oc-modal>form{position:relative;display:grid;gap:12px;width:min(420px,100%);padding:28px;border-radius:16px;background:var(--surface,var(--card,var(--bg,#fff)));color:var(--text,#111);box-shadow:0 30px 80px -20px rgba(0,0,0,.5);font:inherit;text-align:left}
.oc-modal h3{margin:0;font-size:22px;line-height:1.2}
.oc-modal p{margin:0 0 4px;opacity:.7;font-size:14px}
.oc-modal input,.oc-modal textarea{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:15px}
.oc-modal textarea{min-height:90px;resize:vertical}
.oc-modal button{padding:13px 18px;border:0;border-radius:10px;background:var(--accent,#111);color:var(--accent-ink,var(--on-accent,#fff));font:inherit;font-weight:600;cursor:pointer}
.oc-modal-x{position:absolute;top:12px;right:16px;color:inherit;font-size:24px;line-height:1;text-decoration:none;opacity:.6}
:where(a.oc-btn){display:inline-block;text-align:center;text-decoration:none;cursor:pointer}
@keyframes oc-tab-in{from{opacity:0;transform:translateY(6px)}}`;

const SKIP_TAG = /^(input|label|option|svg|path|defs|stop|clippath|lineargradient|radialgradient|filter|mask|symbol|g|use|form|textarea|select)$/i;
// sections the page already has: id → what it is about (its id and its first heading)
function sectionsOf(s){
  const out = [], re = /<([a-z][\w-]*)\b[^>]*\sid\s*=\s*["']([^"']+)["'][^>]*>/gi; let m;
  while ((m = re.exec(s))) {
    if (SKIP_TAG.test(m[1]) || /^oc-/.test(m[2])) continue;
    const head = (/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(s.slice(m.index, m.index + 1500)) || [])[1] || '';
    out.push({ id: m[2], at: m.index, fam: familyOf(m[2].replace(/[-_]/g, ' ')) || familyOf(plain(head)) });
  }
  return out;
}

export function wireControls(code){
  let s = String(code);
  if (!/<(a|button)\b/i.test(s)) return s;
  const ids = new Set([...s.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
  const secs = sectionsOf(s);
  const forms = [...s.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(m => [m.index, m.index + m[0].length]);
  const inForm = i => forms.some(([a, b]) => i > a && i < b);
  const formSec = forms.length ? secs.filter(x => x.at < forms[0][0]).pop() : null;
  const ru = /[а-яё]{3}/i.test(plain(s.replace(/<style[\s\S]*?<\/style>/gi, '')));
  const modals = new Map();
  const modalFor = text => {
    const key = text.toLowerCase().slice(0, 60);
    if (!modals.has(key)) modals.set(key, { id: 'oc-f-' + (modals.size + 1), text });
    return '#' + modals.get(key).id;
  };
  const targetFor = (text, at) => {
    const fam = familyOf(text);
    if (fam) {
      // the matching section, but not the one the control itself sits in
      const hit = secs.find(x => x.fam === fam && !(x.at <= at && secs.every(y => y.at <= x.at || y.at > at)));
      if (hit) return '#' + hit.id;
      if (fam === 'contact') return formSec ? '#' + formSec.id : modalFor(text);
      if (fam === 'pricing' || fam === 'shop') return modalFor(text);
    }
    if (MORE.test(text)) { const next = secs.find(x => x.at > at); if (next) return '#' + next.id; }
    return '#top';
  };
  const linkOk = href => href != null && href.trim() !== '' && !/^\s*javascript:/i.test(href) && (!href.startsWith('#') || href === '#top' || (href.length > 1 && ids.has(href.slice(1))));
  // links that go nowhere
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (all, attrs, inner, at) => {
    const href = attr(attrs, 'href'), text = plain(inner) || attr(attrs, 'aria-label') || attr(attrs, 'title') || '';
    // a phone number or an e-mail written as the link text calls / writes, wherever the model pointed it inside the page
    const tel = /^\+?[\d\s()‑–-]{7,20}$/.test(text.trim()) && (text.match(/\d/g) || []).length >= 7, mail = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(text.trim());
    if ((tel || mail) && (href == null || !/^(tel|mailto|https?):/i.test(href.trim()))) {
      const rest = attrs.replace(/\s(href|onclick|target)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<a href="${tel ? 'tel:' + text.replace(/[^\d+]/g, '') : 'mailto:' + text.trim()}"${rest}>${inner}</a>`;
    }
    if (linkOk(href) || /\sclass\s*=\s*["'][^"']*\boc-modal/i.test(attrs)) return all;
    if (!/\p{L}/u.test(text)) return all; // arrows, ☰, bare icons: no way to tell where they lead, leave them
    const rest = attrs.replace(/\s(href|onclick|target)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<a href="${targetFor(text, at)}"${rest}>${inner}</a>`;
  });
  // buttons outside forms do nothing without scripts
  let changed = false;
  s = s.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (all, attrs, inner, at) => {
    if (inForm(at) || /\s(popovertarget|form|commandfor)\s*=/i.test(attrs)) return all;
    const text = plain(inner) || attr(attrs, 'aria-label') || attr(attrs, 'title') || '';
    if (!/\p{L}/u.test(text)) return all; // arrows, ☰, bare icons: no way to tell where they lead, leave them
    changed = true;
    let rest = attrs.replace(/\s(type|onclick|disabled|name|value)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
    rest = /\sclass\s*=/i.test(rest) ? rest.replace(/(\sclass\s*=\s*["'])/i, '$1oc-btn ') : rest + ' class="oc-btn"';
    return `<a href="${targetFor(text, at)}" role="button"${rest}>${inner}</a>`;
  });
  // keep the look: `button` in the page's CSS now also means a.oc-btn (same specificity)
  if (changed) s = s.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (all, a, css) => `<style${a}>${css.replace(/([^{}]+)\{/g, (r, sel) => sel.trim().startsWith('@') ? r : sel.replace(/(?<![.#\w\-="':])button(?![\w-])/gi, ':is(button,a:where(.oc-btn))') + '{')}</style>`);
  if (modals.size) {
    const T = ru
      ? { sub: 'Оставьте контакты — мы ответим.', name: 'Имя', mail: 'E-mail или телефон', msg: 'Сообщение', send: 'Отправить', close: 'Закрыть' }
      : { sub: 'Leave your details and we will get back to you.', name: 'Name', mail: 'E-mail or phone', msg: 'Message', send: 'Send', close: 'Close' };
    const html = [...modals.values()].map(({ id, text }) => `<div class="oc-modal" id="${id}" role="dialog" aria-label="${esc(text || T.send)}"><a class="oc-modal-bg" href="#oc-close" aria-label="${T.close}"></a><form method="post"><a class="oc-modal-x" href="#oc-close" aria-label="${T.close}">×</a><h3>${esc(text || T.send)}</h3><p>${T.sub}</p><input type="hidden" name="request" value="${esc(text)}"><input name="name" placeholder="${T.name}" autocomplete="name"><input name="contact" placeholder="${T.mail}" required autocomplete="email"><textarea name="message" placeholder="${T.msg}"></textarea><button type="submit">${T.send}</button></form></div>`).join('');
    s = /<\/body>/i.test(s) ? s.replace(/<\/body>/i, html + '</body>') : s + html;
  }
  return s;
}

const addStyle = (s, css) => /<\/head>/i.test(s) ? s.replace(/<\/head>/i, `<style>${css}</style></head>`)
  : /^\s*<!doctype/i.test(s) ? s.replace(/^(\s*<!doctype[^>]*>)/i, `$1<style>${css}</style>`) : `<style>${css}</style>` + s;

// after every answer: just the CSS of the no-JS controls the block uses (the code itself stays as the model wrote it)
export function withInteractive(code){
  const s = String(code);
  return /class=["'][^"']*\boc-(tabs|acc|toggle)\b/.test(s) && !s.includes('.oc-tabs>input') ? addStyle(s, INTERACTIVE_CSS) : s;
}

// the whole page, when it is built for Preview, Export and Publish: dead controls wired across all blocks
// (a header link in one block finds the section in another); pages with scripts (mini-apps) are left alone
export function wirePage(html){
  let s = String(html);
  if (/<script\b/i.test(s)) return s;
  s = withInteractive(wireControls(s));
  if (/class=["'][^"']*\boc-(modal|btn)\b/.test(s) && !s.includes('.oc-modal:target')) s = addStyle(s, MODAL_CSS);
  return s;
}
