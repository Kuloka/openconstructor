// Interface languages.
// The UI is written in English right in the markup and scripts. Instead of rewriting every file,
// this module watches the page and swaps each English text (text nodes, title, placeholder,
// aria-label) for its translation as it appears. Dictionaries live in locales/<code>.js and map
// the English text to the translation; keys with {0}, {1} are patterns for texts with numbers or names.
// Switching the language reloads the page, so every screen starts clean in the new language.

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
];
// The language the AI should write its replies in
export const AI_LANG = { en: 'English', ru: 'Russian', tr: 'Turkish', es: 'Spanish', de: 'German' };

const KEY = 'oc-lang';
const known = c => LANGS.some(l => l.code === c);
function detect(){
  try { const s = localStorage.getItem(KEY); if (known(s)) return s; } catch {}
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (known(c)) return c;
  }
  return 'en';
}
export const lang = detect();
document.documentElement.lang = lang;

const loaders = import.meta.glob(['./locales/*.js', '!./locales/plural.js']);
let dict = {};
if (lang !== 'en' && loaders[`./locales/${lang}.js`]) {
  try { dict = (await loaders[`./locales/${lang}.js`]()).default; } catch (e) { console.warn('[i18n] could not load', lang, e); }
}

// Patterns: "{0} elements" → /^(.+?) elements$/
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(dict).filter(k => /\{\d\}/.test(k)).map(k => ({
  re: new RegExp('^' + k.split(/(\{\d\})/).map(p => /^\{\d\}$/.test(p) ? '([\\s\\S]+?)' : escapeRe(p)).join('') + '$'),
  order: [...k.matchAll(/\{(\d)\}/g)].map(m => +m[1]),
  value: dict[k],
}));

function lookup(s){
  const hit = dict[s];
  if (typeof hit === 'string') return hit;
  for (const p of patterns) {
    const m = s.match(p.re);
    if (!m) continue;
    if (typeof p.value === 'function' && !/^[\d\s.,]+$/.test(m[1])) continue; // plural forms are for numbers
    const args = [];
    p.order.forEach((n, i) => { args[n] = t(m[i + 1]); });
    return typeof p.value === 'function' ? p.value(...args) : p.value.replace(/\{(\d)\}/g, (_, n) => args[n] ?? '');
  }
  // Texts glued with " · " (a model name · its note): translate each piece that has a translation
  if (/ ·( |$)/.test(s)) {
    let found = false;
    const out = s.split(/( ·(?: |$))/).map(p => {
      if (!p || / ·/.test(p)) return p;
      const r = lookup(p);
      if (r == null) return p;
      found = true; return r;
    }).join('');
    if (found) return out;
  }
  return null;
}

// Translate one text; unknown texts come back unchanged. Spaces around it are kept.
export function t(text){
  if (lang === 'en' || text == null) return text;
  const s = String(text), core = s.trim();
  if (!core || !/[A-Za-z]/.test(core)) return s;
  const out = lookup(core.replace(/\s+/g, ' '));
  if (out == null) return s;
  const at = s.indexOf(core);
  return s.slice(0, at) + out + s.slice(at + core.length);
}

export function setLang(code){
  if (!known(code) || code === lang) return;
  try { localStorage.setItem(KEY, code); } catch {}
  location.reload();
}

// A <select> with the languages; put it anywhere
export function langSelect(className = 'lang-select'){
  const sel = document.createElement('select');
  sel.className = className;
  sel.setAttribute('aria-label', 'Language');
  sel.dataset.noI18n = '';
  sel.innerHTML = LANGS.map(l => `<option value="${l.code}"${l.code === lang ? ' selected' : ''}>${l.name}</option>`).join('');
  sel.onchange = () => setLang(sel.value);
  return sel;
}

/* ── Live translation of the page ── */
if (lang !== 'en') {
  const ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
  const SKIP = 'script,style,textarea,code,pre,[contenteditable],[data-no-i18n],.message.user,.wordmark,.wl-brand';
  const done = new WeakMap(); // node → text we wrote, so our own writes don't loop
  const skipped = el => !el || el.closest?.(SKIP);

  const textNode = n => {
    const v = n.nodeValue;
    if (done.get(n) === v || skipped(n.parentElement)) return;
    const out = t(v);
    done.set(n, out);
    if (out !== v) n.nodeValue = out;
  };
  const attr = (el, a) => {
    const v = el.getAttribute(a);
    if (v == null || el._i18n?.[a] === v) return;
    if (a === 'label' && !/^(OPTGROUP|OPTION)$/.test(el.tagName)) return;
    if (el.tagName === 'TEXTAREA' ? skipped(el.parentElement) : skipped(el)) return;
    const out = t(v);
    (el._i18n ||= {})[a] = out;
    if (out !== v) el.setAttribute(a, out);
  };
  const walk = root => {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 || (root.tagName !== 'TEXTAREA' && skipped(root))) return;
    ATTRS.forEach(a => root.hasAttribute(a) && attr(root, a));
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeType === 1 && n.tagName !== 'TEXTAREA' && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 3) textNode(n);
      else ATTRS.forEach(a => n.hasAttribute(a) && attr(n, a));
    }
  };

  walk(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') textNode(m.target);
      else attr(m.target, m.attributeName);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // Browser dialogs aren't in the page, translate their text on the way in
  const { confirm, alert, prompt } = window;
  window.confirm = msg => confirm.call(window, tParts(msg));
  window.alert = msg => alert.call(window, tParts(msg));
  window.prompt = (msg, def) => prompt.call(window, tParts(msg), def);
}
// Dialog texts often join two sentences with blank lines — translate each part
function tParts(msg){
  return String(msg ?? '').split(/(\n\n)/).map(p => p === '\n\n' ? p : t(p)).join('');
}
