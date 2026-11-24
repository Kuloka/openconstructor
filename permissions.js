// AI permissions, the opencode way: the AI gets real freedom (scripts, web fonts, bold rewrites), and every
// risky capability has a rule — allow / ask / deny. "ask" shows a card in the chat: allow once · always · no.
// The hard walls stay whatever the rules say: scripts run in a sandboxed frame with an opaque origin and no
// network (apps.js APP_CSP, worker.js APP_HEADERS), fonts come only from Google Fonts, everything is undoable.
import { t } from './i18n.js';

const KEY = 'oc-perms';
export const PERMS = [
  { id: 'scripts', label: 'JavaScript on pages', hint: 'sliders, tabs with state, counters, validation — runs sandboxed, without network', def: 'ask' },
  { id: 'fonts', label: 'Google Fonts', hint: 'real typefaces instead of system ones; visitors load them from Google', def: 'allow' },
  { id: 'rewrite', label: 'Big rewrites', hint: 'replacing most of an existing page or element', def: 'ask' },
];
const VALUES = ['allow', 'ask', 'deny'];
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
export const perm = id => { const v = read()[id]; return VALUES.includes(v) ? v : PERMS.find(p => p.id === id)?.def || 'ask'; };
export function setPerm(id, v){
  if (!VALUES.includes(v)) return;
  const all = read(); all[id] = v;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  window.dispatchEvent(new CustomEvent('oc:perms', { detail: { id, v } }));
}

// Where web fonts may come from (canvas frames, previews, app frames)
export const FONT_CSP = { style: 'https://fonts.googleapis.com', font: 'https://fonts.gstatic.com' };

/* ── what the AI is told ── */
export function promptRules(){
  const s = perm('scripts'), f = perm('fonts');
  const script = s === 'deny'
    ? 'No JavaScript.'
    : 'JavaScript is allowed when it makes the result clearly better (a carousel, tabs or filters with state, a counter, form validation, a pricing toggle, a small canvas animation); prefer CSS when CSS is enough. Put ONE <script> at the very end of the html block, wrap it in an IIFE and look elements up only inside your root element. It runs sandboxed with NO network: no fetch/XHR/WebSocket, no external scripts, no imports, no CDN libraries; localStorage may be empty. The one exception is oc.db for data shared between visitors (a guestbook, poll, waitlist, leaderboard): await oc.db.add(\'name\', {…}) saves a record, await oc.db.list(\'name\') returns the newest as [{ id, data, created_at }], oc.db.add(\'orders\', data, { private: true }) for personal data only the author can read; wrap calls in try/catch.';
  const fonts = f === 'deny'
    ? 'No external fonts or links.'
    : 'Fonts: you may use up to two Google Fonts that fit the brief — the first line inside <style> is @import url(\'https://fonts.googleapis.com/css2?family=Name:wght@400;600&display=swap\'); always keep a system fallback in font-family. No other external URLs.';
  return { script, fonts };
}

/* ── checking an answer before it lands on the canvas ── */
const SCRIPT_RE = /<script\b[\s\S]*?(<\/script\s*>|$)/gi;
const FONT_IMPORT_RE = /@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/gi;
const FONT_LINK_RE = /<link\b[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi;
export const hasScript = code => /<script\b/i.test(code);
export const hasFonts = code => /fonts\.googleapis\.com/i.test(code);
export const stripScripts = code => String(code).replace(SCRIPT_RE, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
export const stripFonts = code => String(code).replace(FONT_IMPORT_RE, '').replace(FONT_LINK_RE, '');

// How much of the old visible text and structure is gone in the new version (0 = same, 1 = all new)
export function changeRatio(oldCode, newCode){
  const words = s => new Set(String(s).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const a = words(oldCode); if (a.size < 12) return 0;
  const b = words(newCode); let kept = 0; for (const w of a) if (b.has(w)) kept++;
  return 1 - kept / a.size;
}
const ASKED_REWRITE = /redesign|rewrite|from scratch|start over|completely|whole new|переделай|переделать|с нуля|заново|полностью|целиком|новый дизайн|редизайн/i;
export const isBigRewrite = (oldCode, newCode, request = '') => !ASKED_REWRITE.test(request) && String(oldCode).length > 1500 && changeRatio(oldCode, newCode) > .6;

// The "ask" card in the chat. Resolves true (allowed) or false.
const QUESTIONS = {
  scripts: 'The AI wants to add JavaScript to this block. It will run sandboxed, without network.',
  fonts: 'The AI wants to load Google Fonts on this page.',
  rewrite: 'The AI wants to replace most of the existing content. Apply it?',
};
export function askPerm(id, box = document.getElementById('messages')){
  return new Promise(resolve => {
    if (!box) return resolve(false);
    const card = document.createElement('div');
    card.className = 'message assistant perm-ask'; card.dataset.perm = id;
    card.innerHTML = `<p class="perm-q"></p><div class="perm-btns"><button type="button" class="btn primary" data-p="once"></button><button type="button" class="btn" data-p="always"></button><button type="button" class="btn" data-p="no"></button></div>`;
    card.querySelector('.perm-q').textContent = t(QUESTIONS[id] || id);
    card.querySelector('[data-p=once]').textContent = t('Allow once');
    card.querySelector('[data-p=always]').textContent = t('Always allow');
    card.querySelector('[data-p=no]').textContent = t('No');
    box.append(card); card.scrollIntoView({ block: 'nearest' });
    card.addEventListener('click', e => {
      const a = e.target.closest('[data-p]')?.dataset.p; if (!a) return;
      if (a === 'always') setPerm(id, 'allow');
      card.querySelectorAll('button').forEach(b => b.disabled = true);
      card.classList.add('answered');
      card.querySelector('.perm-btns').textContent = a === 'no' ? t('Not allowed') : t('Allowed');
      resolve(a !== 'no');
    });
  });
}
const allowed = async id => { const v = perm(id); return v === 'allow' ? true : v === 'deny' ? false : askPerm(id); };

// Apply the rules to a finished answer. Returns { code, app, skip }:
//   app — the block keeps its script and must run as a sandboxed app; skip — the user declined the rewrite.
export async function gate(code, { appMode = false, oldCode = '', request = '' } = {}){
  let app = false;
  if (oldCode && isBigRewrite(oldCode, code, request) && !(await allowed('rewrite'))) return { code: oldCode, app: false, skip: true };
  if (hasFonts(code) && !(await allowed('fonts'))) code = stripFonts(code);
  if (hasScript(code) && !appMode) { if (await allowed('scripts')) app = true; else code = stripScripts(code); }
  return { code, app, skip: false };
}

/* ── the settings section (inside the AI keys dialog) ── */
export function permsSection(){
  const sec = document.createElement('section');
  sec.className = 'perms'; sec.id = 'aiPerms';
  const paint = () => {
    sec.innerHTML = `<h3 class="perms-h">${t('AI permissions')}</h3><p class="perms-note">${t('What the AI may do on its own. “Ask” shows a question in the chat. Scripts always run sandboxed, without network.')}</p>` +
      PERMS.map(p => `<div class="perm-row"><div class="perm-t"><b>${t(p.label)}</b><span>${t(p.hint)}</span></div><div class="seg" role="radiogroup" aria-label="${t(p.label)}">${VALUES.map(v => `<button type="button" role="radio" data-perm="${p.id}" data-v="${v}" aria-checked="${perm(p.id) === v}">${t(v)}</button>`).join('')}</div></div>`).join('');
  };
  paint();
  sec.addEventListener('click', e => { const b = e.target.closest('[data-perm]'); if (!b) return; setPerm(b.dataset.perm, b.dataset.v); paint(); });
  window.addEventListener('oc:perms', paint);
  return sec;
}
