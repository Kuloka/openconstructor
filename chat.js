// openconstructor chat: a plain conversation with any connected model — no canvas, no pages, just answers.
//   top bar (mode switch, model picker) · conversations on the left · messages · composer.
// Conversations live on this device (localStorage 'oc-chats'); the model is its own ('oc-chat-model'),
// keys and the list of models come from the editor (studio.chatModels / keyFor / openKeys).
import { studio } from './studio.js';
import { byId, converse, aiTurn } from './providers.js';
import { needsWeb, keywordQuery, parseQueries, resultsNote, QUERY_PROMPT } from './web-facts.js';
import { md } from './markdown.js';
import { t } from './i18n.js';
import logoSvg from './src/logo.svg?raw';
import { swarmGlyph } from './swarm-glyph.js';
import { retype } from './chat-ui.js';
import './chat.css';

const $ = (sel, el = root) => el.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (d, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  side: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};
const SYSTEM = 'You are a helpful, friendly assistant in a plain chat. Answer in the language the user writes in. Be clear and direct; use Markdown (lists, **bold**, code blocks) when it helps reading, and keep short questions short. Do not keep asking clarifying questions — when something is ambiguous, give your best answer and say what you assumed.';
const WEB_RULES = 'Fresh web search results for the latest question are below. Answer from them; cite the sources you used as Markdown links [site](url). If the results do not answer it, say so plainly and share what they do show — never claim you cannot browse.';
// the chat searches the web on its own when the question asks for it (names, "find", "look it up", news, prices…)
const ASKS_WEB = /кто так|что так(ое|ой|ая)|найди|найти|поищи|ищи|поиск|посмотри|глянь|загугли|погугли|в интернете|в сети|ссылк|сайт|github|гитхаб|search|look (it )?up|google|find|who is|what is|news|новост|цен[аы]|курс|погод/i;
const WEB_KEY = 'oc-chat-web';
let webAlways = (() => { try { return localStorage.getItem(WEB_KEY) === '1'; } catch { return false; } })();
const IDEAS = ['Explain how CSS grid works', 'Write a short welcome email for new users', 'Ideas for a landing page headline', 'Fix this JavaScript error'];
// the same "thinking" look as the editor's chat: the dot swarm and a word that keeps retyping itself
const MOODS = ['thinking', 'vibing', 'coding', 'sketching', 'tinkering', 'composing', 'brewing', 'crafting'];
const KEY = 'oc-chats', MODEL_KEY = 'oc-chat-model', MAX_CHATS = 60;

const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
let chats = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, MAX_CHATS))); } catch {} };
let activeId = chats[0]?.id || null;
let modelKey = (() => { try { return localStorage.getItem(MODEL_KEY) || ''; } catch { return ''; } })();
let isOpen = false, ctrl = null, sideOpen = innerWidth > 760;
const active = () => chats.find(c => c.id === activeId) || null;

const root = document.createElement('div');
root.className = 'och hidden'; root.id = 'chatWorkspace';
root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'openconstructor chat');
root.innerHTML = `
<header class="och-bar">
  <div class="och-bar-l">
    <button class="och-icon" type="button" data-a="side" title="${esc(t('Conversations'))}">${svg(ICON.side)}</button>
    <button class="och-brand" type="button" data-a="home" title="${esc(t('Home'))}"><span class="och-mark">${logoSvg}</span><span data-no-i18n><i>open</i>constructor</span></button>
    <button class="och-icon" type="button" data-a="new" title="${esc(t('New chat'))} · Ctrl Shift O">${svg(ICON.edit)}</button>
  </div>
  <div class="och-modes-slot" data-modes></div>
  <div class="och-bar-r"></div>
</header>
<div class="och-body">
  <aside class="och-side">
    <button class="och-new" type="button" data-a="new">${svg(ICON.edit, 16)}<span>${esc(t('New chat'))}</span></button>
    <nav class="och-list"></nav>
    <p class="och-side-note">${esc(t('Chats are saved only in this browser.'))}</p>
  </aside>
  <main class="och-main">
    <div class="och-scroll"><div class="och-msgs"></div></div>
    <div class="och-compose-wrap">
      <form class="och-compose">
        <textarea rows="1" placeholder="${esc(t('Ask anything'))}" spellcheck="true"></textarea>
        <div class="och-compose-row">
          <div class="och-model">
            <button class="och-model-btn" type="button" data-a="models" aria-haspopup="listbox" aria-expanded="false" title="${esc(t('Model'))}"></button>
            <div class="och-menu hidden" role="listbox">
              <input class="och-menu-search" type="search" placeholder="${esc(t('Search models'))}" spellcheck="false">
              <div class="och-menu-list"></div>
              <button class="och-menu-keys" type="button" data-a="keys">+ ${esc(t('connect a provider'))}</button>
            </div>
          </div>
          <button class="och-web" type="button" data-a="web" aria-pressed="false" title="${esc(t('Search the web for every question (otherwise only when the question needs it)'))}">${svg(ICON.globe, 15)}<span>${esc(t('Search'))}</span></button>
          <span class="och-row-gap"></span>
          <button class="och-send" type="submit" aria-label="${esc(t('send'))}" disabled>${svg(ICON.send, 18)}</button>
        </div>
      </form>
      <div class="och-ideas">${IDEAS.map(x => `<button type="button" data-idea="${esc(t(x))}">${esc(t(x))}</button>`).join('')}</div>
      <p class="och-foot">${esc(t('AI can make mistakes. Check important facts.'))}</p>
    </div>
  </main>
</div>`;
document.body.append(root);

const ta = $('textarea'), msgsEl = $('.och-msgs'), scrollEl = $('.och-scroll'), menuEl = $('.och-menu'), searchEl = $('.och-menu-search');

/* ── Models ── */
function models(){ try { return studio.chatModels(); } catch { return []; } }
function model(){
  const list = models();
  return list.find(m => m.key === modelKey) || list.find(m => m.key === studio.modelKey()) || list[0] || null;
}
function paintModelBtn(){
  const m = model(), busy = !!ctrl;
  $('[data-a="web"]').setAttribute('aria-pressed', webAlways);
  $('[data-a="models"]').innerHTML = m ? `${m.logo}<span>${esc(m.name)}</span>${svg(ICON.down, 14)}` : `<span>${esc(t('Pick a model'))}</span>${svg(ICON.down, 14)}`;
  const send = $('.och-send');
  send.innerHTML = svg(busy ? ICON.stop : ICON.send, 18);
  send.classList.toggle('stop', busy);
  send.disabled = !busy && !ta.value.trim();
  send.setAttribute('aria-label', t(busy ? 'stop' : 'send'));
}
function paintMenu(){
  const q = searchEl.value.trim().toLowerCase(), cur = model()?.key;
  const groups = new Map();
  for (const m of models()) {
    if (q && !`${m.name} ${m.vendor} ${m.provider} ${m.id}`.toLowerCase().includes(q)) continue;
    if (!groups.has(m.provider)) groups.set(m.provider, []);
    groups.get(m.provider).push(m);
  }
  $('.och-menu-list').innerHTML = [...groups].map(([prov, list]) => `<div class="och-menu-g">${esc(prov)}</div>` + list.map(m =>
    `<button type="button" role="option" class="och-opt${m.key === cur ? ' on' : ''}" data-model="${esc(m.key)}" aria-selected="${m.key === cur}">${m.logo}<span class="och-opt-t">${esc(m.name)}${m.vendor ? `<small>${esc(m.vendor)}</small>` : ''}</span>${m.free ? '<em>$0</em>' : ''}${m.key === cur ? svg(ICON.check, 14) : ''}</button>`).join('')).join('')
    || `<div class="och-menu-empty">${esc(t(q ? 'nothing found' : 'No models yet — connect a provider'))}</div>`;
}
function toggleMenu(open = menuEl.classList.contains('hidden')){
  menuEl.classList.toggle('hidden', !open); $('[data-a="models"]').setAttribute('aria-expanded', open);
  if (open) { searchEl.value = ''; paintMenu(); searchEl.focus(); menuEl.querySelector('.och-opt.on')?.scrollIntoView({ block: 'nearest' }); }
}
searchEl.oninput = paintMenu;
searchEl.onkeydown = e => { if (e.key === 'Escape') toggleMenu(false); if (e.key === 'Enter') menuEl.querySelector('.och-opt')?.click(); };
menuEl.addEventListener('click', e => {
  const o = e.target.closest('[data-model]'); if (!o) return;
  modelKey = o.dataset.model; try { localStorage.setItem(MODEL_KEY, modelKey); } catch {}
  toggleMenu(false); paintModelBtn(); ta.focus();
});
document.addEventListener('pointerdown', e => { if (isOpen && !e.target.closest('.och-model')) toggleMenu(false); });
addEventListener('oc:models', () => { if (!isOpen) return; paintModelBtn(); if (!menuEl.classList.contains('hidden')) paintMenu(); });

/* ── Conversations ── */
const when = ts => { const d = (Date.now() - ts) / 864e5; return d < 1 ? t('Today') : d < 2 ? t('Yesterday') : d < 7 ? t('This week') : t('Older'); };
function paintList(){
  let head = '';
  $('.och-list').innerHTML = chats.map(c => {
    const h = when(c.at), sec = h !== head ? `<div class="och-side-h">${esc(h)}</div>` : ''; head = h;
    return `${sec}<div class="och-item${c.id === activeId ? ' on' : ''}" data-id="${esc(c.id)}"><button type="button" class="och-item-t" data-open="${esc(c.id)}">${esc(c.title || t('New chat'))}</button><button type="button" class="och-item-x" data-del="${esc(c.id)}" title="${esc(t('Delete'))}">${svg(ICON.trash, 14)}</button></div>`;
  }).join('') || `<p class="och-list-empty">${esc(t('No conversations yet'))}</p>`;
}
function msgHTML(m, i, last){
  if (m.role === 'user') return `<div class="och-msg user"><div class="och-bubble">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  const body = m.content ? md(m.content, t('copy')) : m.error ? '' : `<div class="och-think"><span class="och-glyph"></span><span class="och-mood">${esc(t('thinking'))}</span></div>`;
  const err = m.error ? `<div class="och-err">${esc(m.error)}${m.errKeys ? ` <button type="button" data-a="keys">${esc(t('connect a provider'))}</button>` : ''}</div>` : '';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  // each source by its page title (five "github.com" chips would say nothing), the site in small type
  const label = x => String(x.title || '').replace(/\s*[|·–—-]\s*[^|·–—-]*$/, '').trim().slice(0, 34) || host(x.url);
  const srcs = m.sources?.length && !m.live ? `<div class="och-sources"><span class="och-sources-h">${esc(t('Sources'))}</span>${m.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="${esc((x.title || '') + '\n' + x.url)}"><img src="https://icons.duckduckgo.com/ip3/${esc(host(x.url))}.ico" alt="" loading="lazy" onerror="this.remove()"><span>${esc(label(x))}</span><small>${esc(host(x.url))}</small></a>`).join('')}</div>` : '';
  const tools = m.content && !m.live ? `<div class="och-tools"><button type="button" data-copy="${i}" title="${esc(t('copy'))}">${svg(ICON.copy, 14)}</button>${last ? `<button type="button" data-a="retry" title="${esc(t('Regenerate'))}">${svg(ICON.retry, 14)}</button>` : ''}${m.model ? `<span>${esc(m.model)}</span>` : ''}</div>` : '';
  return `<div class="och-msg ai${m.live ? ' live' : ''}"><span class="och-ava">${logoSvg}</span><div class="och-text">${body}${err}${srcs}${tools}</div></div>`;
}
function paintMsgs(stick = true){
  const c = active();
  root.classList.toggle('is-empty', !c || !c.messages.length);
  if (!c || !c.messages.length) {
    msgsEl.innerHTML = `<div class="och-empty"><h1>${esc(t('What can I help with?'))}</h1></div>`;
    return;
  }
  const near = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120;
  msgsEl.innerHTML = c.messages.map((m, i) => msgHTML(m, i, i === c.messages.length - 1)).join('');
  if (stick || near) scrollEl.scrollTop = scrollEl.scrollHeight;
}
function paintSide(){ root.classList.toggle('side-off', !sideOpen); }
function paint(){ paintList(); paintMsgs(); paintModelBtn(); paintSide(); }

function newChat(){
  if (ctrl) return;
  const c = active();
  if (c && !c.messages.length) { ta.focus(); return; }
  activeId = null; paint(); ta.focus();
  if (innerWidth <= 760) { sideOpen = false; paintSide(); }
}

/* ── Sending ── */
async function ask(c){
  const m = model();
  const reply = { role: 'assistant', content: '', live: true, model: m?.name || '' };
  c.messages.push(reply); c.at = Date.now(); paint();
  if (!m) { Object.assign(reply, { live: false, error: t('No AI model is connected yet.'), errKeys: true }); save(); paint(); return; }
  const p = byId(m.pid);
  ctrl = new AbortController(); paintModelBtn();
  const think = msgsEl.lastElementChild?.querySelector('.och-think');
  let wi = 0, moods = 0;
  if (think) {
    think.querySelector('.och-glyph').append(swarmGlyph({ dots: 14 }));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) moods = setInterval(() => { const w = think.querySelector('.och-mood'); if (!w?.isConnected) return clearInterval(moods); wi = (wi + 1) % MOODS.length; retype(w, t(MOODS[wi]), { speed: 90, erase: 50 }); }, 2000);
  }
  let raf = 0;
  const flush = () => { raf = 0; const el = msgsEl.lastElementChild?.querySelector('.och-text'); if (el) { el.innerHTML = md(reply.content, t('copy')); const near = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 160; if (near) scrollEl.scrollTop = scrollEl.scrollHeight; } };
  const say = text => { clearInterval(moods); const w = think?.querySelector('.och-mood'); if (w?.isConnected) retype(w, text, { speed: 40, erase: 25 }); };
  try {
    const history = c.messages.filter(x => x !== reply && !x.error && x.content);
    const key = studio.keyFor(m.pid), last = history.at(-1)?.content || '';
    aiTurn.id = 'chat-' + Date.now().toString(36); // the free AI counts the query + the answer as one
    let system = SYSTEM;
    if (webAlways || ASKS_WEB.test(last) || needsWeb(last)) {
      // the model writes the query from the whole conversation ("look it up!" alone says nothing)
      const convo = history.slice(-6).map(x => `${x.role}: ${x.content.slice(0, 400)}`).join('\n');
      let qs = [keywordQuery(last)];
      try { qs = parseQueries((await converse(p, key, m.id, QUERY_PROMPT, [{ role: 'user', content: 'Conversation:\n' + convo + '\n\nWrite the search queries for the latest request.' }], null, ctrl.signal)).text, last); } catch (e) { if (e.name === 'AbortError') throw e; }
      let notes = '', found = [];
      for (const q of qs) {
        say(`${t('searching the web')}: “${q.slice(0, 48)}”`);
        try {
          const r = await fetch('/api/web?q=' + encodeURIComponent(q), { signal: ctrl.signal });
          if (r.ok) { const d = await r.json(); notes += '\n\n' + resultsNote(q, d); found.push(...(d.results || [])); }
        } catch (e) { if (e.name === 'AbortError') throw e; }
        await new Promise(r => setTimeout(r, 1100)); // the web endpoint allows one lookup a second
      }
      const seen = new Set();
      reply.sources = found.filter(x => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 5).map(x => ({ title: x.title, url: x.url }));
      if (notes) system = SYSTEM + '\n\n' + WEB_RULES + notes;
      say(t('writing the answer'));
    }
    const r = await converse(p, key, m.id, system, history, piece => { if (!piece) return; reply.content += piece; if (!raf) raf = requestAnimationFrame(flush); }, ctrl.signal);
    if (!reply.content) reply.content = r.text || '';
    if (!reply.content) reply.error = t('The model sent an empty answer. Try again or pick another model.');
  } catch (e) {
    if (e.name === 'AbortError') { if (!reply.content) reply.error = t('Stopped.'); }
    else {
      reply.error = e.code === 'signin' ? t('The free AI needs an account after 3 tries a day — sign in or connect your own key.') : (e.message || String(e));
      reply.errKeys = e.code === 'signin' || e.status === 401;
    }
  } finally {
    cancelAnimationFrame(raf); clearInterval(moods); ctrl = null; reply.live = false; c.at = Date.now();
    chats = [c, ...chats.filter(x => x !== c)]; save(); paint();
  }
}
function send(text){
  text = text.trim(); if (!text || ctrl) return;
  let c = active();
  if (!c) { c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: text.replace(/\s+/g, ' ').slice(0, 60), messages: [], at: Date.now() }; chats.unshift(c); activeId = c.id; }
  c.messages.push({ role: 'user', content: text });
  ta.value = ''; grow();
  ask(c);
}
function retry(){
  const c = active(); if (!c || ctrl) return;
  if (c.messages.at(-1)?.role === 'assistant') c.messages.pop();
  if (c.messages.at(-1)?.role === 'user') ask(c);
}
const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; paintModelBtn(); };
ta.addEventListener('input', grow);
ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); } });
$('.och-compose').addEventListener('submit', e => { e.preventDefault(); if (ctrl) ctrl.abort(); else send(ta.value); });

root.addEventListener('click', e => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'close') return closeChat();
  if (a === 'side') { sideOpen = !sideOpen; return paintSide(); }
  // the logo: back to the start screen, the same cross-fade as switching modes
  if (a === 'home') {
    window.dispatchEvent(new CustomEvent('oc:welcome')); // modes.js closes the chat once the start screen covers it
    return;
  }
  if (a === 'new') return newChat();
  if (a === 'models') return toggleMenu();
  if (a === 'keys') { toggleMenu(false); return studio.openKeys(); }
  if (a === 'retry') return retry();
  if (a === 'web') { webAlways = !webAlways; try { localStorage.setItem(WEB_KEY, webAlways ? '1' : '0'); } catch {} paintModelBtn(); ta.focus(); return; }
  // phones: a tap next to the open conversations list closes it
  if (innerWidth <= 760 && sideOpen && !e.target.closest('.och-side, .och-bar')) { sideOpen = false; paintSide(); }
  const idea = e.target.closest('[data-idea]'); if (idea) { send(idea.dataset.idea); return; }
  const open = e.target.closest('[data-open]'); if (open && !ctrl) { activeId = open.dataset.open; paint(); if (innerWidth <= 760) { sideOpen = false; paintSide(); } return; }
  const del = e.target.closest('[data-del]');
  if (del && !(ctrl && del.dataset.del === activeId)) { chats = chats.filter(c => c.id !== del.dataset.del); if (activeId === del.dataset.del) activeId = null; save(); return paint(); }
  const mc = e.target.closest('.md-copy');
  if (mc) { navigator.clipboard?.writeText(mc.nextElementSibling.textContent).then(() => { mc.textContent = t('copied'); setTimeout(() => { mc.textContent = t('copy'); }, 1200); }); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { const m = active()?.messages[+cp.dataset.copy]; if (m) navigator.clipboard?.writeText(m.content).then(() => { cp.innerHTML = svg(ICON.check, 14); setTimeout(() => { cp.innerHTML = svg(ICON.copy, 14); }, 1200); }); }
});
addEventListener('keydown', e => {
  if (!isOpen) return;
  if (e.key === 'Escape' && !menuEl.classList.contains('hidden')) { toggleMenu(false); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newChat(); }
});

/* ── Open / close ── */
export function openChat(){
  if (isOpen) return;
  isOpen = true; if (innerWidth <= 760) sideOpen = false; root.classList.remove('hidden'); document.body.classList.add('och-open');
  if (location.hash !== '#chat') history.replaceState(null, '', location.pathname + location.search + '#chat');
  paint(); requestAnimationFrame(() => ta.focus());
  window.dispatchEvent(new CustomEvent('oc:mode'));
}
export function closeChat(){
  if (!isOpen) return;
  isOpen = false; toggleMenu(false); root.classList.add('hidden'); document.body.classList.remove('och-open');
  if (location.hash === '#chat') history.replaceState(null, '', location.pathname + location.search);
  window.dispatchEvent(new CustomEvent('oc:mode'));
}
export const chatOpen = () => isOpen;
// a new conversation that starts with this question (the welcome screen's "Chat" prompt)
// (opens the chat first: the thinking glyph only animates while it can be seen)
export function startChat(text){ if (ctrl || !String(text || '').trim()) return; openChat(); activeId = null; send(text); }
if (import.meta.env?.DEV) window.__ocChat = { openChat, closeChat };
