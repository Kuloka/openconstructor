// openconstructor code: a full-screen workspace for mini-apps, laid out like VS Code.
//   title bar · activity bar · explorer (files of the app, list of apps) · editor (code on the left, live preview
//   on the right) · bottom panel (problems and console) · AI chat on the right · status bar.
// The editor's own AI chat moves in (same conversation, model picker and attachments). AI requests here
// change only the app in focus (studio.setCodeFocus), never the page on the canvas.
import { studio, prefillPrompt } from './studio.js';
import { APP_CSP, APP_SHIM, APP_ERR } from './apps.js';
import { t } from './i18n.js';
import logoSvg from './src/logo.svg?raw';
import './code.css';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'oc-code-ui2', MIN_W = 280, MAX_W = 2560;
// tab: which editors show — 'split' (code + preview), 'code' or 'preview'; width 0 = the preview fills its area
let ui = { chatW: 380, sideW: 220, codeFrac: .5, panelH: 170, side: true, chat: true, panel: true, ptab: 'problems', width: 0, tab: 'split', file: 'js', autofix: true };
try { ui = { ...ui, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {} };

const ICON = {
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  laptop: '<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
  fill: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18M7 17h4"/>',
  canvas: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  code: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  app: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  err: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
const DEVICES = [{ id: 'fill', w: 0 }, { id: 'phone', w: 390 }, { id: 'tablet', w: 820 }, { id: 'laptop', w: 1280 }];
const IDEAS = ['Expense tracker with categories', 'Flashcards for learning words', 'Workout timer with rounds', 'Snake game', 'Unit converter', 'Random team picker'];
const svg = (d, s = 15) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const slug = s => String(s || 'app').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'app';

const root = document.createElement('div');
root.className = 'cw hidden'; root.id = 'codeWorkspace';
root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'openconstructor code');
root.innerHTML = `
<header class="cw-bar">
  <button class="cw-brand" type="button" data-cw="close" title="${esc(t('Back to the editor'))}"><span class="oc-logo tiny" aria-hidden="true"></span><span class="cw-word"><i>open</i>constructor</span><b>code</b></button>
  <div class="cw-title"><span class="cw-name" id="cwName"></span><span class="cw-diff" id="cwDiff"></span></div>
  <div class="cw-actions">
    <div class="cw-layout" role="group" aria-label="${esc(t('Layout'))}">
      <button type="button" data-tab="code" title="${esc(t('code only'))}">${svg(ICON.code, 14)}</button>
      <button type="button" data-tab="split" title="${esc(t('code and preview'))}">${svg(ICON.split, 14)}</button>
      <button type="button" data-tab="preview" title="${esc(t('preview only'))}">${svg(ICON.eye, 14)}</button>
    </div>
    <button class="btn" type="button" data-cw="new">+ ${esc(t('new app'))}</button>
    <button class="btn" type="button" data-cw="canvas">${esc(t('open on canvas'))}</button>
    <button class="btn primary" type="button" data-cw="publish">${esc(t('publish'))}</button>
    <button class="btn icon cw-x" type="button" data-cw="close" aria-label="${esc(t('close'))}" title="${esc(t('Back to the editor'))}">×</button>
  </div>
</header>
<div class="cw-body">
  <nav class="cw-act" aria-label="${esc(t('Views'))}">
    <button type="button" data-pane="side" title="${esc(t('Explorer'))}">${svg(ICON.files, 20)}</button>
    <button type="button" data-pane="chat" title="${esc(t('AI chat'))}">${svg(ICON.chat, 20)}</button>
    <button type="button" data-pane="panel" title="${esc(t('Problems and console'))}">${svg(ICON.panel, 20)}<em id="cwActN"></em></button>
    <span></span>
    <button type="button" data-cw="close" title="${esc(t('Back to the editor'))}">${svg(ICON.canvas, 20)}</button>
  </nav>
  <aside class="cw-side" id="cwSide">
    <div class="cw-side-h">${esc(t('Explorer'))}</div>
    <div class="cw-sec"><div class="cw-sec-h">${svg(ICON.down, 12)}<span id="cwFolder"></span></div><div class="cw-tree" id="cwTree"></div></div>
    <div class="cw-sec"><div class="cw-sec-h">${svg(ICON.down, 12)}<span>${esc(t('apps'))}</span><button type="button" data-cw="new" title="${esc(t('new app'))}">+</button></div><div class="cw-tree" id="cwApps"></div></div>
  </aside>
  <div class="cw-sash" data-sash="side"></div>
  <div class="cw-main" id="cwMain">
    <div class="cw-editors" id="cwEditors">
      <section class="cw-code" id="cwCode">
        <div class="cw-tabsrow"><div class="cw-files" id="cwFiles" role="tablist"></div><button class="btn primary" type="button" data-cw="apply" id="cwApply" title="${esc(t('Apply your edits to the app'))} · Ctrl+S">${esc(t('apply'))}</button></div>
        <div class="cw-crumbs" id="cwCrumbs"></div>
        <div class="cw-editor"><pre class="cw-gutter" id="cwGutter" aria-hidden="true"></pre><div class="cw-src"><pre class="cw-hl" id="cwHl" aria-hidden="true"></pre><textarea id="cwText" spellcheck="false" wrap="off" aria-label="${esc(t('code'))}"></textarea></div><div class="cw-code-empty hidden" id="cwCodeEmpty"><span>&lt;/&gt;</span><p>${esc(t('No code yet. Describe an app in the chat and its files show up here.'))}</p></div></div>
      </section>
      <div class="cw-sash v" data-sash="code"></div>
      <section class="cw-view" id="cwView">
        <div class="cw-tools">
          <span class="cw-ptitle">${svg(ICON.eye, 13)}${esc(t('preview'))}</span>
          <div class="cw-devices">${DEVICES.map(d => `<button type="button" data-dev="${d.w}" title="${esc(t(d.w ? d.id : 'full width'))}${d.w ? ' · ' + d.w + 'px' : ''}">${svg(ICON[d.id], 14)}</button>`).join('')}</div>
          <label class="cw-width" title="${esc(t('Preview width'))}"><input id="cwW" inputmode="numeric" maxlength="4" aria-label="${esc(t('Preview width'))}"><span>px</span></label>
          <span class="cw-zoom" id="cwZoom"></span>
          <button class="cw-tool" type="button" data-cw="reload" title="${esc(t('Restart the app'))}">${svg(ICON.reload, 14)}</button>
        </div>
        <div class="cw-stage" id="cwStage">
          <div class="cw-frame hidden" id="cwFrame">
            <span class="cw-grip" data-grip="-1" title="${esc(t('Drag to change the width'))}"></span>
            <div class="cw-chrome" aria-hidden="true"><i></i><i></i><i></i><span id="cwUrl"></span><em id="cwSize"></em></div>
            <iframe id="cwIframe" sandbox="allow-scripts" title="${esc(t('app preview'))}"></iframe>
            <span class="cw-grip" data-grip="1" title="${esc(t('Drag to change the width'))}"></span>
          </div>
          <div class="cw-err hidden" id="cwErr" role="status" aria-live="polite"><i></i><div><b id="cwErrText"></b><code id="cwErrLine"></code></div><span id="cwErrState"></span><button class="btn primary" type="button" data-cw="fix" id="cwFix">${esc(t('fix it'))}</button><button class="btn icon" type="button" data-cw="dismiss" aria-label="${esc(t('close'))}">×</button></div>
          <div class="cw-empty hidden" id="cwEmpty">
            <div class="cw-orb" aria-hidden="true">&gt;<i>_</i></div>
            <h2>${esc(t('What app should we build?'))}</h2>
            <p>${esc(t('Describe it in the AI chat: it writes the interface and the logic, and the app runs right here.'))}</p>
            <div class="cw-ideas">${IDEAS.map(x => `<button type="button" data-idea="${esc(x)}">${esc(t(x))}</button>`).join('')}</div>
          </div>
        </div>
      </section>
    </div>
    <div class="cw-sash h" data-sash="panel"></div>
    <section class="cw-panel" id="cwPanel">
      <div class="cw-panel-h" role="tablist">
        <button type="button" role="tab" data-ptab="problems">${esc(t('Problems'))}<em id="cwProbN"></em></button>
        <button type="button" role="tab" data-ptab="console">${esc(t('Console'))}<em id="cwLogN"></em></button>
        <span></span>
        <button class="cw-tool" type="button" data-cw="clear" title="${esc(t('Clear'))}">${svg(ICON.trash, 14)}</button>
        <button class="cw-tool" type="button" data-pane="panel" title="${esc(t('Hide the panel'))}">×</button>
      </div>
      <div class="cw-panel-b" id="cwProblems"></div>
      <div class="cw-panel-b cw-console" id="cwConsole" hidden></div>
    </section>
  </div>
  <div class="cw-sash" data-sash="chat"></div>
  <div class="cw-chat" id="cwChat"></div>
</div>
<footer class="cw-status">
  <span class="cw-st-brand">${svg(ICON.code, 12)}code</span>
  <button type="button" data-cw="problems" id="cwStProb" title="${esc(t('Problems'))}"></button>
  <button class="cw-auto" type="button" data-cw="autofix" id="cwAuto" title="${esc(t('When the app throws an error, send it to the AI right away and fix it'))}"><i></i>${esc(t('auto-fix'))}</button>
  <span class="cw-st-gap"></span>
  <span class="cw-langbar" id="cwLangbar"></span><span class="cw-stats" id="cwStats"></span>
  <span id="cwPos"></span><span id="cwLang"></span>
</footer>`;
document.body.append(root);
root.querySelector('.oc-logo').innerHTML = logoSvg;

const frame = $('cwFrame'), iframe = $('cwIframe'), stage = $('cwStage'), wInput = $('cwW');

/* ── The chat moves in while the workspace is open, then goes back to its place ── */
const chat = $('chatPanel');
let home = null;
// the floating chat (layout.js) turns back into a plain panel here: the message box returns inside it
function takeChat(){ if (home || !chat) return; document.body.classList.add('chat-in-code'); window.dispatchEvent(new Event('oc:layout')); home = { parent: chat.parentNode, next: chat.nextSibling }; $('cwChat').append(chat); }
function giveChat(){ if (!home) return; home.parent.insertBefore(chat, home.next); home = null; document.body.classList.remove('chat-in-code'); window.dispatchEvent(new Event('oc:layout')); window.dispatchEvent(new Event('resize')); }

/* ── Which app is open ── */
let focus = null, isOpen = false, prevAppMode = false, lastDoc = '';
const appItem = () => studio.items().find(x => x.id === focus && x.app) || null;
function setFocus(id){ if (id !== focus) { bug = null; autoTries = 0; problems = []; } focus = id || null; studio.setCodeFocus(focus); }
function pickFocus(id){
  const list = studio.items();
  const it = (id && list.find(x => x.id === id && x.app)) || list.find(x => x.id === studio.selectedId() && x.app) || [...list].reverse().find(x => x.app);
  setFocus(it?.id);
}

/* ── Code view: the app as three files by language, with line counts and a +/− count per change ── */
const FILES = [{ id: 'html', name: 'index.html', lang: 'HTML', color: '#e34c26' }, { id: 'css', name: 'style.css', lang: 'CSS', color: '#7e57c2' }, { id: 'js', name: 'app.js', lang: 'JavaScript', color: '#f1e05a' }];
const ALL = { id: 'all', name: 'app.html', lang: 'HTML', color: '#e34c26' };
const L = s => s ? String(s).split('\n') : [];
// null when the code doesn't have the plain <style> + markup + <script> shape (then it stays one file)
function splitCode(code){
  if (/<(style|script)\s[^>]*>/i.test(code) || (code.match(/<script>/gi) || []).length > 1) return null;
  const grab = tag => [...code.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'))].map(m => m[1].trim()).join('\n');
  return { html: code.replace(/<style>[\s\S]*?<\/style>/gi, '').replace(/<script>[\s\S]*?<\/script>/gi, '').trim(), css: grab('style'), js: grab('script') };
}
const joinCode = p => (p.css ? `<style>\n${p.css}\n</style>\n` : '') + p.html + (p.js ? `\n<script>\n${p.js}\n</script>` : '');
function diffStat(a, b){
  const left = new Map(); for (const l of L(a)) left.set(l, (left.get(l) || 0) + 1);
  let add = 0, del = 0;
  for (const l of L(b)) { const n = left.get(l); if (n) left.set(l, n - 1); else add++; }
  for (const n of left.values()) del += n;
  return { add, del };
}
let known = { id: null, code: '' }, draft = null, dirty = false, change = null, fresh = false, justMade = false;
// Called on every render: notices a new version of the app, counts what changed, refreshes the files
function track(it){
  if (!it) { known = { id: null, code: '' }; draft = null; dirty = false; change = null; return; }
  if (known.id === it.id && known.code === it.code) return;
  const prev = known.id === it.id ? known.code : justMade ? '' : null;
  justMade = false;
  if (prev != null) {
    const a = splitCode(prev), b = splitCode(it.code);
    const files = b && (a || !prev) ? FILES.map(f => ({ ...f, ...diffStat(a?.[f.id], b[f.id]) })) : [{ ...ALL, ...diffStat(prev, it.code) }];
    change = { files: files.filter(f => f.add || f.del), add: files.reduce((n, f) => n + f.add, 0), del: files.reduce((n, f) => n + f.del, 0) };
    fresh = true;
  } else change = null;
  known = { id: it.id, code: it.code };
  draft = splitCode(it.code) || { all: it.code }; dirty = false;
}
/* ── Syntax colours: a coloured copy of the text sits under a transparent textarea ── */
const LEX = {
  js: /(?<c>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<s>`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(?<k>\b(?:const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|switch|case|break|continue|default|try|catch|finally|throw|typeof|instanceof|async|await|this|void|delete)\b)|(?<b>\b(?:true|false|null|undefined|NaN|Infinity)\b)|(?<n>\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|(?<f>\b[A-Za-z_$][\w$]*(?=\s*\())|(?<p>(?<=\.)[A-Za-z_$][\w$]*)/g,
  css: /(?<c>\/\*[\s\S]*?\*\/)|(?<s>'[^'\n]*'|"[^"\n]*")|(?<a>@[\w-]+)|(?<p>[\w-]+(?=\s*:[^;{}]*[;}]))|(?<n>#[0-9a-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:px|rem|em|%|vh|vw|s|ms|deg|fr|ch)?\b)|(?<k>[.#]?[\w-]+(?=[^{};]*\{)|:[\w-]+(?=[^{};]*\{))/g,
  html: /(?<c><!--[\s\S]*?-->)|(?<k><\/?[\w-]+|\/?>)|(?<p>\s[\w:-]+(?==))|(?<s>"[^"]*"|'[^']*')/g,
};
const HL_MAX = 60000;
function highlight(code, lang){
  const re = LEX[lang]; if (!re || code.length > HL_MAX) return esc(code) + '\n';
  let out = '', last = 0;
  for (const m of code.matchAll(re)) {
    const kind = Object.keys(m.groups).find(k => m.groups[k] != null); if (!kind) continue;
    out += esc(code.slice(last, m.index)) + `<span class="hl-${kind}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last)) + '\n';
}
function paintCode(){
  const ta = $('cwText');
  $('cwHl').innerHTML = highlight(ta.value, ui.file === 'all' ? 'html' : ui.file);
  $('cwHl').style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
}
// "Ln 3, Col 14" in the status bar
function caret(){
  const ta = $('cwText'), before = ta.value.slice(0, ta.selectionStart).split('\n');
  $('cwPos').textContent = appItem() ? `${t('Ln')} ${before.length}, ${t('Col')} ${before[before.length - 1].length + 1}` : '';
}

function renderCode(){
  const d = draft || { all: '' }, files = 'all' in d ? [ALL] : FILES, it = appItem();
  if (!files.some(f => f.id === ui.file)) ui.file = files[files.length - 1].id;
  const cur = files.find(f => f.id === ui.file);
  $('cwFiles').innerHTML = it ? files.map(f => `<button type="button" role="tab" data-file="${f.id}" aria-selected="${f.id === ui.file}"><i style="background:${f.color}"></i>${f.name}<em>${L(d[f.id]).length}</em>${dirty && f.id === ui.file ? '<b class="cw-dot" title="' + esc(t('edited')) + '"></b>' : ''}</button>`).join('') : '';
  $('cwCrumbs').innerHTML = it ? `<span>${esc(slug(it.name))}</span>${svg('<path d="m9 6 6 6-6 6"/>', 11)}<span><i style="background:${cur.color}"></i>${cur.name}</span>` : '';
  const ta = $('cwText'); if (ta.value !== (d[ui.file] || '')) { ta.value = d[ui.file] || ''; ta.scrollTop = 0; ta.scrollLeft = 0; }
  paintCode();
  $('cwCodeEmpty').classList.toggle('hidden', !!it);
  $('cwGutter').textContent = Array.from({ length: Math.max(1, L(ta.value).length) }, (_, i) => i + 1).join('\n');
  $('cwGutter').scrollTop = ta.scrollTop;
  const total = files.reduce((n, f) => n + L(d[f.id]).length, 0);
  $('cwLangbar').innerHTML = it ? files.map(f => `<i style="flex:${L(d[f.id]).length || 0.001};background:${f.color}" title="${f.lang}"></i>`).join('') : '';
  $('cwStats').textContent = it ? files.map(f => `${f.lang} ${L(d[f.id]).length}`).join(' · ') + (files.length > 1 ? ` — ${total} ${t('lines')}` : ` ${t('lines')}`) + (dirty ? ` · ${t('edited')}` : '') : '';
  $('cwLang').textContent = it ? cur.lang : '';
  $('cwApply').hidden = !dirty;
  $('cwDiff').innerHTML = change && (change.add || change.del) ? `<b class="add">+${change.add}</b><b class="del">−${change.del}</b>` : '';
  caret(); renderSide();
}
// The explorer: the files of the app in focus, and every app of the project
function renderSide(){
  const it = appItem(), d = draft || { all: '' }, files = 'all' in d ? [ALL] : FILES;
  $('cwFolder').textContent = it ? slug(it.name) : t('new app');
  $('cwTree').innerHTML = it ? files.map(f => `<button type="button" data-file="${f.id}" aria-current="${f.id === ui.file && ui.tab !== 'preview'}"><i style="background:${f.color}"></i><span>${f.name}</span><em>${L(d[f.id]).length}</em></button>`).join('')
    : `<p>${esc(t('No files yet. Describe an app in the chat.'))}</p>`;
  const apps = studio.items().filter(x => x.app);
  $('cwApps').innerHTML = apps.map(a => `<button type="button" data-app="${esc(a.id)}" aria-current="${a.id === focus}">${svg(ICON.app, 13)}<span>${esc(a.name)}</span></button>`).join('') || `<p>${esc(t('No apps yet.'))}</p>`;
}
// After an AI change: a short "which file, how many lines" note under the answer in the chat
function postChange(){
  const show = fresh && change?.files.length; fresh = false;
  if (!show) return;
  const el = document.createElement('div'); el.className = 'cw-change';
  el.innerHTML = change.files.map(f => `<div><i style="background:${f.color}"></i><span>${f.name}</span><em>${f.lang}</em><b class="add">+${f.add}</b><b class="del">−${f.del}</b></div>`).join('');
  const box = $('messages'); box.append(el); box.scrollTop = box.scrollHeight;
}

// console.log / warn / error of the app go to the Console tab (only in this preview, not on the canvas)
const APP_LOG = `<script>(function(){var n=0;['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){try{if(n++<300)parent.postMessage({ocApp:1,level:k,log:[].map.call(arguments,function(a){if(typeof a=='string')return a;try{var s=JSON.stringify(a);return s===undefined?String(a):s}catch(e){return String(a)}}).join(' ').slice(0,500)},'*')}catch(e){}return o.apply(console,arguments)}})})();</script>`;
// The app alone on the page background, as a visitor would see it
function docFor(it){
  const bg = studio.page().bg || '#0b0b0f';
  // a fixed-width card still fits a narrow preview instead of being cut off on the right
  const box = it.full ? '' : 'display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:24px;box-sizing:border-box}body>*{max-width:100%';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APP_CSP}${APP_SHIM}${APP_ERR}${APP_LOG}<style>:root{color-scheme:dark}html,body{margin:0}*,*::before,*::after{box-sizing:border-box}body{min-height:100vh;background:${bg};color:#eee;font-family:system-ui;${box}}</style></head><body>${it.code}</body></html>`;
}

function render(){
  if (!isOpen) return;
  const it = appItem();
  $('cwName').textContent = it ? it.name : t('new app');
  root.dataset.layout = ui.tab;
  $('cwEmpty').classList.toggle('hidden', !!it);
  frame.classList.toggle('hidden', !it);
  root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === ui.tab)));
  root.querySelector('[data-cw="canvas"]').disabled = !it;
  track(it);
  if (it) {
    const doc = docFor(it);
    if (doc !== lastDoc) {
      if (lastDoc) addLog('info', t('app restarted'), true);
      lastDoc = doc; problems = []; iframe.srcdoc = doc; watchHealth();
    }
  } else lastDoc = '';
  renderCode();
  renderPanel();
  size();
  showBug();
}

// Panes and sizes: explorer / chat / panel shown or hidden, widths kept between visits
function layout(){
  root.classList.toggle('no-side', !ui.side);
  root.classList.toggle('no-chat', !ui.chat);
  root.classList.toggle('no-panel', !ui.panel);
  root.querySelectorAll('.cw-act [data-pane]').forEach(b => b.setAttribute('aria-pressed', String(!!ui[b.dataset.pane])));
  $('cwSide').style.width = ui.sideW + 'px';
  $('cwChat').style.width = ui.chatW + 'px';
  $('cwPanel').style.height = ui.panelH + 'px';
  $('cwCode').style.flex = `${ui.codeFrac} 1 0`;
  $('cwView').style.flex = `${1 - ui.codeFrac} 1 0`;
  document.documentElement.style.setProperty('--cw-chat-w', (ui.chat ? ui.chatW : 0) + 'px');
}
// The preview keeps its chosen width; when that is wider than its area it is scaled down to fit
function size(){
  if (!isOpen) return;
  layout();
  const fill = !ui.width;
  stage.classList.toggle('is-fill', fill);
  if (ui.tab === 'code' || !stage.clientWidth) { $('cwZoom').textContent = ''; return; }
  const small = innerWidth <= 760, pad = fill ? (small ? 16 : 24) : small ? 32 : 56;
  const sw = Math.max(200, stage.clientWidth - pad), sh = Math.max(160, stage.clientHeight - (fill ? pad : small ? 24 : 40));
  const w = ui.width || sw, k = Math.min(1, sw / w);
  frame.style.width = w + 'px'; frame.style.height = sh / k + 'px';
  frame.style.transform = `translateX(-50%) scale(${k})`;
  if (document.activeElement !== wInput) wInput.value = Math.round(w);
  $('cwZoom').textContent = k < 1 ? Math.round(k * 100) + '%' : '';
  $('cwSize').textContent = `${Math.round(w)} × ${Math.max(0, Math.round(sh / k) - 30)}`;
  $('cwUrl').textContent = slug(appItem()?.name) + '.app';
  root.querySelectorAll('[data-dev]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.dev === ui.width)));
}
const clampW = v => Math.min(MAX_W, Math.max(MIN_W, Math.round(v)));

/* ── Bottom panel: problems (errors of the running app) and the app's console ── */
let problems = [], logs = [];
const time = () => new Date().toTimeString().slice(0, 8);
function addLog(level, text, divider = false){
  logs.push({ level, text: String(text), at: time(), divider });
  if (logs.length > 300) logs.splice(0, logs.length - 300);
  if (isOpen) renderPanel();
}
function renderPanel(){
  const warns = logs.filter(l => l.level === 'warn').length;
  root.querySelectorAll('[data-ptab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ptab === ui.ptab)));
  $('cwProbN').textContent = problems.length || '';
  $('cwLogN').textContent = logs.filter(l => !l.divider).length || '';
  $('cwActN').textContent = problems.length || '';
  $('cwStProb').innerHTML = `${svg(ICON.err, 13)}${problems.length}${svg(ICON.warn, 13)}${warns}`;
  $('cwStProb').classList.toggle('has-err', problems.length > 0);
  $('cwProblems').hidden = ui.ptab !== 'problems'; $('cwConsole').hidden = ui.ptab !== 'console';
  $('cwProblems').innerHTML = problems.length ? problems.map(p => `<div class="cw-row err">${svg(ICON.err, 14)}<span>${esc(p.error)}</span>${p.line ? `<code>${esc(t('line'))} ${p.line}</code>` : ''}<em>${p.at}</em></div>${p.code ? `<pre class="cw-row-src">${esc(p.code)}</pre>` : ''}`).join('')
    : `<p class="cw-panel-empty">${esc(appItem() ? t('No problems found in the running app.') : t('Errors of the running app show up here, and go to the AI to fix.'))}</p>`;
  const con = $('cwConsole'), stick = con.scrollTop + con.clientHeight >= con.scrollHeight - 8;
  con.innerHTML = logs.length ? logs.map(l => l.divider ? `<div class="cw-line div"><span>${esc(l.text)}</span><em>${l.at}</em></div>`
    : `<div class="cw-line ${l.level}"><b>${l.level === 'error' ? '✕' : l.level === 'warn' ? '!' : '›'}</b><span>${esc(l.text)}</span><em>${l.at}</em></div>`).join('')
    : `<p class="cw-panel-empty">${esc(t('Nothing logged yet. console.log() from the app shows up here.'))}</p>`;
  if (stick) con.scrollTop = con.scrollHeight;
}

/* ── The chat's greeting speaks about apps while the workspace is open ── */
let introWas = null;
function swapIntro(on){
  const el = document.querySelector('#messages .message.welcome'); if (!el) return;
  if (on && introWas == null) {
    introWas = el.innerHTML;
    el.innerHTML = `<strong>${esc(t('What app should we build?'))}</strong><p>${esc(t('Describe it in plain words: the AI writes the interface and the logic, and it runs in the preview. If the app throws an error, it goes straight back to the AI to fix.'))}</p>`;
  } else if (!on && introWas != null) { el.innerHTML = introWas; introWas = null; }
}

/* ── Open / close ── */
export function openCode({ prompt = '', appId = null } = {}){
  if (!isOpen) {
    isOpen = true; prevAppMode = studio.appMode();
    studio.setAppMode(true, true);
    takeChat(); root.classList.remove('hidden'); document.body.classList.add('cw-open'); swapIntro(true);
    if (location.hash !== '#code') history.replaceState(null, '', location.pathname + location.search + '#code');
  }
  pickFocus(appId);
  render(); requestAnimationFrame(size);
  if (prompt) prefillPrompt(prompt);
  else requestAnimationFrame(() => document.querySelector('#react-composer textarea')?.focus());
}
export function closeCode(){
  if (!isOpen) return;
  isOpen = false; studio.setCodeFocus(undefined); studio.setAppMode(prevAppMode, true);
  swapIntro(false); giveChat(); root.classList.add('hidden'); document.body.classList.remove('cw-open');
  if (location.hash === '#code') history.replaceState(null, '', location.pathname + location.search);
}
export const codeOpen = () => isOpen;
if (import.meta.env?.DEV) window.__ocCode = { openCode, closeCode };

function apply(){
  const code = draft ? draft.all ?? joinCode(draft) : ''; if (!appItem() || !code.trim() || !dirty) return;
  studio.update(list => list.map(x => x.id === focus ? { ...x, code } : x));
  fresh = false; studio.status(t('code applied'), 'ok'); render();
}
root.addEventListener('click', e => {
  const b = e.target.closest('[data-cw], [data-tab], [data-dev], [data-idea], [data-file], [data-app], [data-pane], [data-ptab]'); if (!b) return;
  if (b.dataset.file) { ui.file = b.dataset.file; if (ui.tab === 'preview') ui.tab = 'split'; save(); return render(); }
  if (b.dataset.app) { setFocus(b.dataset.app); return render(); }
  if (b.dataset.tab) { ui.tab = b.dataset.tab; save(); return render(); }
  if (b.dataset.dev != null) { ui.width = +b.dataset.dev; if (ui.tab === 'code') ui.tab = 'split'; save(); return render(); }
  if (b.dataset.pane) {
    const p = b.dataset.pane; ui[p] = !ui[p]; save(); size();
    if (p === 'chat' && ui.chat) requestAnimationFrame(() => document.querySelector('#react-composer textarea')?.focus());
    return;
  }
  if (b.dataset.ptab) { ui.ptab = b.dataset.ptab; save(); return renderPanel(); }
  if (b.dataset.idea) { if (!ui.chat) { ui.chat = true; save(); size(); } return prefillPrompt(t(b.dataset.idea)); }
  const a = b.dataset.cw;
  if (a === 'close') closeCode();
  if (a === 'new') { setFocus(null); if (!ui.chat) ui.chat = true; render(); requestAnimationFrame(() => document.querySelector('#react-composer textarea')?.focus()); }
  if (a === 'canvas') closeCode();
  if (a === 'reload') { lastDoc = ''; bug = null; showBug(); render(); }
  if (a === 'autofix') { ui.autofix = !ui.autofix; save(); showBug(); if (ui.autofix && bug && !bug.sent) fixBug(true); }
  if (a === 'fix') fixBug(false);
  if (a === 'dismiss') { bug = null; showBug(); }
  if (a === 'problems') { ui.panel = true; ui.ptab = 'problems'; save(); size(); renderPanel(); }
  if (a === 'clear') { if (ui.ptab === 'console') logs = []; else { problems = []; bug = null; showBug(); } renderPanel(); }
  if (a === 'publish') import('./publish.js').then(m => m.openPublish());
  if (a === 'apply') apply();
});
wInput.addEventListener('change', () => { const v = parseInt(wInput.value, 10); ui.width = Number.isFinite(v) ? clampW(v) : 0; save(); size(); });
$('cwText').addEventListener('input', () => { if (!draft) return; draft[ui.file] = $('cwText').value; dirty = true; renderCode(); });
$('cwText').addEventListener('scroll', () => { const ta = $('cwText'); $('cwGutter').scrollTop = ta.scrollTop; $('cwHl').style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; });
['keyup', 'click', 'select'].forEach(ev => $('cwText').addEventListener(ev, caret));
// Tab inserts two spaces instead of leaving the editor; Ctrl+S applies the edits
$('cwText').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); return apply(); }
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey) return;
  e.preventDefault(); document.execCommand('insertText', false, '  ');
});
wInput.addEventListener('keydown', e => { if (e.key === 'Enter') wInput.blur(); });

// Drag a handle: the preview grows on both sides from its centre
root.querySelectorAll('.cw-grip').forEach(g => g.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); g.setPointerCapture(e.pointerId); root.classList.add('cw-resizing');
  const dir = +g.dataset.grip, x0 = e.clientX, k = frame.getBoundingClientRect().width / frame.offsetWidth || 1, w0 = frame.offsetWidth;
  const move = ev => { ui.width = clampW(w0 + dir * 2 * (ev.clientX - x0) / k); size(); };
  const up = () => { g.removeEventListener('pointermove', move); root.classList.remove('cw-resizing'); save(); };
  g.addEventListener('pointermove', move);
  g.addEventListener('pointerup', up, { once: true }); g.addEventListener('pointercancel', up, { once: true });
}));
// Drag the lines between the panes (double-click puts one back)
const SASH = {
  side: { reset: () => { ui.sideW = 220; }, move: (dx, dy, s) => { ui.sideW = Math.min(420, Math.max(160, s.sideW + dx)); } },
  chat: { reset: () => { ui.chatW = 380; }, move: (dx, dy, s) => { ui.chatW = Math.min(Math.max(300, innerWidth - 560), Math.max(300, s.chatW - dx)); } },
  code: { reset: () => { ui.codeFrac = .5; }, move: (dx, dy, s) => { const w = $('cwEditors').clientWidth || 1; ui.codeFrac = Math.min(.8, Math.max(.2, s.codeFrac + dx / w)); } },
  panel: { reset: () => { ui.panelH = 170; }, move: (dx, dy, s) => { ui.panelH = Math.min(Math.max(90, $('cwMain').clientHeight - 160), Math.max(90, s.panelH - dy)); } },
};
root.querySelectorAll('[data-sash]').forEach(el => {
  const s = SASH[el.dataset.sash];
  el.title = t('Drag to resize · double-click to reset');
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); root.classList.add('cw-resizing', el.classList.contains('h') ? 'rows' : 'cols');
    const x0 = e.clientX, y0 = e.clientY, start = { ...ui };
    const move = ev => { s.move(ev.clientX - x0, ev.clientY - y0, start); size(); };
    const up = () => { el.removeEventListener('pointermove', move); root.classList.remove('cw-resizing', 'rows', 'cols'); save(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true }); el.addEventListener('pointercancel', up, { once: true });
  });
  el.addEventListener('dblclick', () => { s.reset(); save(); size(); });
});

/* ── Errors in the preview go straight to the AI ──
   The preview frame reports script errors (with the line) and "NaN / undefined on screen". With auto-fix on,
   the error is sent to the AI at once; at most AUTO_MAX tries in a row, so a stubborn bug can't burn the daily limit. */
const AUTO_MAX = 2;
let bug = null, autoTries = 0, healthy = 0;
function sourceLine(n){
  const lines = lastDoc.split('\n'); if (!n || n > lines.length) return '';
  return lines[n - 1].trim().slice(0, 160);
}
function showBug(){
  const box = $('cwErr');
  $('cwAuto').setAttribute('aria-pressed', String(!!ui.autofix));
  box.classList.toggle('hidden', !bug);
  if (!bug) return;
  $('cwErrText').textContent = bug.error;
  $('cwErrLine').textContent = bug.code ? (bug.line ? `${t('line')} ${bug.line}: ` : '') + bug.code : '';
  const busy = studio.busy();
  $('cwErrState').textContent = bug.sent ? t('the AI is fixing it…') : bug.waiting ? t('fix queued: waiting for the AI') : bug.gaveUp ? t('auto-fix gave up after 2 tries') : '';
  $('cwFix').hidden = bug.sent || busy;
  box.classList.toggle('is-fixing', !!bug.sent);
}
function fixBug(auto){
  const it = appItem(); if (!bug || !it || bug.sent) return;
  if (studio.busy()) { bug.waiting = true; return showBug(); }
  if (auto) autoTries++; else autoTries = 0;
  bug.sent = true; bug.waiting = false; showBug();
  const where = bug.code ? ` It happens at this line: ${bug.code}` : '';
  studio.ai(`${t('Fix the error')}: ${bug.error}`, { targetId: it.id, sameTurn: auto, ask: `Use action "update". The app has a bug while it runs: "${bug.error}".${where} Find the cause and fix it, then return the complete corrected app (style, markup and script). Check that every element the script looks up exists in the markup, that numbers are parsed and guarded, and that every button still works. Keep the design and everything else as it is.` });
}
// The new version ran for a few seconds without errors: auto-fix gets its tries back
function watchHealth(){
  clearTimeout(healthy);
  if (bug?.sent) bug = null;
  showBug();
  healthy = setTimeout(() => { if (!bug) autoTries = 0; }, 4000);
}
addEventListener('message', e => {
  const d = e.data;
  if (!isOpen || !d || d.ocApp !== 1 || e.source !== iframe.contentWindow) return;
  if (d.log != null) return addLog(['warn', 'error', 'info', 'debug'].includes(d.level) ? d.level : 'log', d.log);
  if (!d.error) return;
  const error = String(d.error).slice(0, 200), line = +d.line || 0;
  if (!problems.some(p => p.error === error)) { problems.push({ error, line, code: sourceLine(line), at: time() }); addLog('error', error); }
  if (bug && !bug.sent && bug.error === d.error) return;
  bug = { error, line, code: sourceLine(line) };
  if (ui.autofix && autoTries < AUTO_MAX) fixBug(true);
  else if (ui.autofix) bug.gaveUp = true;
  showBug(); renderPanel();
});
// the AI finished (or failed): run a queued fix, or let the user try again
addEventListener('oc:ai-idle', () => {
  if (!isOpen || !bug) return;
  if (bug.waiting) return fixBug(true);
  // still here after a fix request = the AI failed or changed nothing (a new version clears the bug in watchHealth)
  if (bug.sent) { bug.sent = false; bug.gaveUp = autoTries >= AUTO_MAX; }
  showBug();
});

addEventListener('resize', () => size());
addEventListener('oc:changed', () => render());
// a new app made here becomes the one in focus
addEventListener('oc:generated', () => {
  if (!isOpen) return;
  const id = studio.selectedId(), it = studio.items().find(x => x.id === id);
  if (it?.app && id !== focus) { justMade = true; setFocus(id); }
  render(); postChange();
});

// Entry points: a "code" button in the editor's top menu, and links to /#code
const menu = document.querySelector('.tb-menu');
if (menu) {
  const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'tb-code', innerHTML: `<span aria-hidden="true">&lt;/&gt;</span> code` });
  btn.title = t('openconstructor code: build working mini-apps with a live preview');
  btn.onclick = () => openCode();
  menu.prepend(btn);
}
if (location.hash === '#code') { try { localStorage.setItem('oc-welcomed', '1'); } catch {} setTimeout(() => openCode(), 300); }
