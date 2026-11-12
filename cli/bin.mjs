#!/usr/bin/env node
// openconstructor code — the terminal version.
// Chat in the terminal; the app is written to a folder as index.html + style.css + app.js and runs in your
// browser with live reload. Errors and console output from the browser come back to the terminal, and with
// auto-fix on, a crash goes straight back to the AI. No dependencies: Node 18+ only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as ui from './ui.mjs';
const { c } = ui;

const VERSION = '0.1.0';
const SITE = process.env.OC_SITE || 'https://openconstructor.pw';

/* ── Terminal look lives in ui.mjs: pixel cube logo, cards, the build animation ── */
const out = s => console.log(s);
const DOT = '●', ARROW = '›';

/* ── Arguments ── */
const args = process.argv.slice(2);
const flag = (...names) => { const i = args.findIndex(a => names.includes(a)); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith('-') ? 2 : 1); return v && !v.startsWith('-') ? v : true; };
if (flag('-h', '--help')) {
  out(`${c.acc(c.bold('openconstructor code'))} ${c.grey('v' + VERSION)}
Build small working web apps by talking to an AI, right in your terminal.

  ${c.bold('npx openconstructor')} ${c.grey('[folder] [-p "what to build"] [--port 4321] [--no-open]')}

The app lives in the folder as index.html, style.css and app.js and opens in your browser.
Errors from the browser come back here; with auto-fix on, the AI repairs them right away.

AI: free openconstructor AI by default (a few requests a day), or your own key:
  OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, OPENAI_API_KEY
  or OC_API_KEY + OC_BASE_URL (any OpenAI-compatible API). OC_MODEL picks the model.`);
  process.exit(0);
}
if (flag('-v', '--version')) { out(VERSION); process.exit(0); }
const firstPrompt = flag('-p', '--prompt');
const portWanted = +flag('--port') || 4321;
const noOpen = !!flag('--no-open');
let dir = path.resolve(args[0] || '.');

/* ── The AI: your key if one is set, else the free openconstructor AI ── */
const KEYS = [
  ['OC_API_KEY', process.env.OC_BASE_URL, 'gpt-oss-120b', 'custom'],
  ['OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1', 'openai/gpt-oss-120b', 'OpenRouter'],
  ['GROQ_API_KEY', 'https://api.groq.com/openai/v1', 'openai/gpt-oss-120b', 'Groq'],
  ['GEMINI_API_KEY', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash', 'Gemini'],
  ['CEREBRAS_API_KEY', 'https://api.cerebras.ai/v1', 'gpt-oss-120b', 'Cerebras'],
  ['OPENAI_API_KEY', 'https://api.openai.com/v1', 'gpt-4.1-mini', 'OpenAI'],
];
const own = KEYS.find(([env, base]) => process.env[env] && base);
const backend = own
  ? { name: own[3], url: own[1].replace(/\/$/, '') + '/chat/completions', key: process.env[own[0]], model: process.env.OC_MODEL || own[2], free: false }
  : { name: 'free openconstructor AI', url: SITE + '/api/ai', key: '', model: 'auto', free: true };

const SYSTEM = `You are openconstructor code: you build small, finished, WORKING web apps (tools, trackers, calculators, quizzes, timers, games, dashboards) that run in the browser.
The app is one page made of three files: style.css, the markup inside <body> of index.html, and app.js (loaded at the end of <body>).

ANSWER FORMAT, exactly:
line 1: {"name":"Short app name","reply":"one short sentence about what you made or changed"}
then ONE \`\`\`html block with exactly three parts in this order: <style>…</style>, the markup, <script>…</script>. Nothing after the block.
If the user only asks a question and wants no change, answer with the JSON line alone and put the answer in "reply".

THINKING: plan in a few short sentences only. Never write or rehearse the code in your reasoning: the code goes into the answer once.

CODE RULES (each one prevents a common bug):
- one state object and one render() that updates the screen from it; call render() after every change;
- wrap the script in (() => { … })(); find elements by class or data- attribute; every selector the script uses must exist in the markup you wrote;
- attach events in the script (addEventListener with data-act / data-id), never onclick="…" attributes;
- numbers from inputs: parseFloat(String(v).replace(',', '.')), guard NaN, empty input and division by zero; never show NaN, undefined or Infinity;
- text typed by the user goes in with textContent, never into innerHTML;
- save data in localStorage under one unique key inside try/catch and load it at start;
- plain modern JavaScript, no frameworks, imports, CDNs or external files; no alert/confirm/prompt: show messages inside the page;
- finish everything: no TODOs, no placeholders, no empty handlers; every { ( [ and quote closed; the script ends with })(); and </script>.

DESIGN RULES:
- the app fills the page: style html and body (margin 0, min-height 100vh, background, font) and centre the app; width min(100%, 440px) for a widget, a centred max-width container for a dashboard or a game board;
- one accent colour for the main action and active states, everything else neutral; text contrast at least 4.5:1; dark theme unless asked otherwise;
- spacing from 4/8/12/16/24px, radius 10-16px, controls at least 40px tall with :hover, :active and :focus-visible states, transition .15s;
- a clear type scale: labels 12px muted, body 14-15px, the main number 32-44px bold with tabular numbers;
- start with realistic sample data; empty states get a short hint; no emoji: icons are inline SVG with stroke="currentColor";
- it must look right at 360px wide and on a laptop.

FORMAT: CSS one rule per line, JS one statement per line with 2-space indentation, no comments. Aim for 120-260 lines.
WHEN UPDATING: return the WHOLE app (style, markup and script) with the change applied; keep the design, texts and features that were not part of the request exactly as they are.
Write all texts in the language of the request.`;

/* ── The app on disk: index.html + style.css + app.js ── */
const MARK = '<!-- openconstructor:app -->', END = '<!-- /openconstructor:app -->';
const FILES = [{ id: 'css', name: 'style.css', color: ui.FILE_COLORS.css }, { id: 'html', name: 'index.html', color: ui.FILE_COLORS.html }, { id: 'js', name: 'app.js', color: ui.FILE_COLORS.js }];
const file = n => path.join(dir, n);
const read = n => { try { return fs.readFileSync(file(n), 'utf8'); } catch { return null; } };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function load(){
  const html = read('index.html'); if (html == null) return null;
  const i = html.indexOf(MARK), j = html.indexOf(END);
  const markup = i >= 0 && j > i ? html.slice(i + MARK.length, j).trim() : (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html).replace(/<script\s+src="app\.js"><\/script>/i, '').trim();
  const name = html.match(/<title>([^<]*)<\/title>/i)?.[1] || path.basename(dir);
  return { name, css: read('style.css') || '', html: markup, js: read('app.js') || '' };
}
const pageFor = (name, markup) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${MARK}
${markup}
${END}
<script src="app.js"></script>
</body>
</html>
`;
const joined = a => `<style>\n${a.css}\n</style>\n${a.html}\n<script>\n${a.js}\n</script>`;
// Every version goes into .openconstructor/history first, so /undo can bring it back
function snapshot(){
  const a = load(); if (!a) return;
  const h = path.join(dir, '.openconstructor', 'history', String(Date.now()));
  fs.mkdirSync(h, { recursive: true });
  for (const f of ['index.html', 'style.css', 'app.js']) { const s = read(f); if (s != null) fs.writeFileSync(path.join(h, f), s); }
}
let selfWrite = 0;
function save(app){
  snapshot();
  selfWrite = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file('index.html'), pageFor(app.name, app.html));
  fs.writeFileSync(file('style.css'), app.css.trim() + '\n');
  fs.writeFileSync(file('app.js'), app.js.trim() + '\n');
}
function undo(){
  const h = path.join(dir, '.openconstructor', 'history');
  const list = fs.existsSync(h) ? fs.readdirSync(h).sort() : [];
  if (!list.length) return false;
  const last = path.join(h, list[list.length - 1]);
  selfWrite = Date.now();
  for (const f of ['index.html', 'style.css', 'app.js']) { const p = path.join(last, f); if (fs.existsSync(p)) fs.copyFileSync(p, file(f)); }
  fs.rmSync(last, { recursive: true, force: true });
  return true;
}

/* ── Reading the answer: the JSON line + one html block, split into the three files ── */
function parse(text){
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  let head = {};
  const m = text.match(/\{[^\n]*?"(?:reply|name)"[^\n]*\}/);
  if (m) { try { head = JSON.parse(m[0]); } catch {} }
  const block = text.match(/```(?:html)?[^\n]*\n([\s\S]*?)(?:```|$)/);
  if (!block) return { head, app: null, cut: false };
  const code = block[1];
  const css = [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x => x[1].trim()).join('\n');
  const js = [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(x => x[1].trim()).join('\n');
  const cut = /<script/i.test(code) && !/<\/script>/i.test(code);
  const html = code.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?(<\/script>|$)/gi, '').trim();
  return { head, cut, app: html || js ? { name: String(head.name || 'app').slice(0, 60), css, html, js } : null };
}
/* ── One request to the AI, streamed ── */
let turn = '', controller = null;
async function ask(messages, { sameTurn = false, onText } = {}){
  if (!sameTurn || !turn) turn = randomBytes(12).toString('hex');
  controller = new AbortController();
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'openconstructor-cli/' + VERSION };
  if (backend.key) headers.Authorization = 'Bearer ' + backend.key;
  if (backend.free) headers['X-OC-Turn'] = turn;
  const r = await fetch(backend.url, { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ model: backend.model, messages: [{ role: 'system', content: SYSTEM }, ...messages], stream: true, ...(backend.free ? {} : { max_tokens: 8000 }) }) });
  const quota = r.headers.get('x-oc-quota');
  if (!r.ok) {
    let msg = ''; try { const d = await r.json(); msg = d.error?.message || d.message || ''; } catch {}
    const e = Error(msg || `HTTP ${r.status}`); e.status = r.status; e.quota = quota; throw e;
  }
  let text = '', cut = false, buf = '';
  const dec = new TextDecoder();
  if (!/event-stream/i.test(r.headers.get('content-type') || '')) {
    const d = await r.json(); const ch = d.choices?.[0];
    return { text: ch?.message?.content || '', cut: ch?.finish_reason === 'length', quota };
  }
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      let e; try { e = JSON.parse(data); } catch { continue; }
      if (e.error) throw Error(e.error.message || 'stream error');
      const ch = e.choices?.[0]; if (!ch) continue;
      const piece = ch.delta?.content || '', why = ch.delta?.reasoning || ch.delta?.reasoning_content || '';
      if (piece) text += piece;
      if (piece || why) onText?.(text, !!why && !piece);
      if (ch.finish_reason === 'length') cut = true;
    }
  }
  return { text, cut, quota };
}

/* ── Changes per file, like a tiny diff stat ── */
function diffStat(a = '', b = ''){
  const L = s => s ? s.split('\n') : [];
  const left = new Map(); for (const l of L(a)) left.set(l, (left.get(l) || 0) + 1);
  let add = 0, del = 0;
  for (const l of L(b)) { const n = left.get(l); if (n) left.set(l, n - 1); else add++; }
  for (const n of left.values()) del += n;
  return { add, del };
}
function showChange(prev, next, { name, reply, seconds, quota }){
  const files = FILES.map(f => ({ id: f.id, name: f.name, lines: next[f.id] ? next[f.id].split('\n').length : 0, ...diffStat(prev?.[f.id], next[f.id]) }));
  const foot = [c.muted('preview') + ' ' + c.blue(url), quotaText(quota)].filter(Boolean).join(c.line(' · '));
  ui.resultCard({ name, reply, files, seconds, foot });
}
function quotaText(quota){
  if (!quota || !backend.free) return '';
  const [u, l] = quota.split('/'); if (!+l) return '';
  return c.muted(`free AI ${u}/${l} today`);
}

/* ── The local preview: serves the folder, reloads on change, reports errors back ── */
const clients = new Set();
let server = null, url = '';
const REPORTER = `<script>(function(){var sent={};function send(o){try{fetch('/__oc/log',{method:'POST',body:JSON.stringify(o),keepalive:true})}catch(e){}}
function fail(m,f,l){m=String(m||'error').slice(0,240);if(sent[m])return;sent[m]=1;send({t:'error',m:m,f:String(f||'').split('/').pop().split('?')[0],l:+l||0})}
addEventListener('error',function(e){fail(e.message,e.filename,e.lineno)});
addEventListener('unhandledrejection',function(e){fail(e.reason&&e.reason.message||e.reason)});
['log','warn','error','info'].forEach(function(k){var o=console[k];console[k]=function(){try{send({t:k,m:[].map.call(arguments,function(a){try{return typeof a=='string'?a:JSON.stringify(a)}catch(x){return String(a)}}).join(' ').slice(0,300)})}catch(x){}return o.apply(console,arguments)}});
var tm=0;function look(){clearTimeout(tm);tm=setTimeout(function(){var s=document.body&&document.body.innerText||'',m=s.match(/(^|[^\\w])(NaN|undefined|\\[object Object\\])([^\\w]|$)/);if(m)fail('the screen shows "'+m[2]+'" (a value is missing or not a number)')},400)}
addEventListener('load',look);addEventListener('click',look,true);addEventListener('input',look,true);addEventListener('keyup',look,true);
var es=new EventSource('/__oc/live');es.onmessage=function(e){if(e.data==='reload')location.reload()};
addEventListener('load',function(){send({t:'hello',w:innerWidth})});})();</script>`;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function startServer(){
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/__oc/live') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': hi\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (u.pathname === '/__oc/log' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; if (body.length > 8000) req.destroy(); });
        req.on('end', () => { res.writeHead(204); res.end(); try { fromBrowser(JSON.parse(body)); } catch {} });
        return;
      }
      let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
      const p = path.resolve(dir, '.' + rel);
      if (!p.startsWith(dir + path.sep) || p.includes(`${path.sep}.openconstructor${path.sep}`)) { res.writeHead(403); return res.end(); }
      fs.readFile(p, (err, data) => {
        if (err) {
          if (rel === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(`<!doctype html><meta charset="utf-8"><title>openconstructor code</title>${REPORTER}<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0b;color:#8e8e8e;font:14px ui-monospace,monospace"><div><span style="color:#e8875c">&gt;_</span> describe the app in the terminal</div></body>`); }
          res.writeHead(404); return res.end('not found');
        }
        const type = TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
        if (type === 'text/html') data = Buffer.from(String(data).replace(/<head[^>]*>/i, m => m + REPORTER));
        res.writeHead(200, { 'Content-Type': type + (type.startsWith('text') ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    let port = portWanted;
    server.on('error', e => { if (e.code === 'EADDRINUSE' && port < portWanted + 30) server.listen(++port, '127.0.0.1'); else { out(c.red('preview server: ' + e.message)); resolve(); } });
    server.on('listening', () => { url = `http://localhost:${port}/`; resolve(); });
    server.listen(port, '127.0.0.1');
  });
}
const reload = () => { for (const r of clients) r.write('data: reload\n\n'); };
function openBrowser(){
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}

/* ── Errors from the browser → the terminal → the AI ── */
const AUTO_MAX = 2;
let autofix = true, busy = false, bug = null, autoTries = 0, healthTimer = 0, version = 0;
function fromBrowser(e){
  if (!e || typeof e.m !== 'string') return;
  if (e.t === 'hello') return;
  if (e.t !== 'error') { printAbove(ui.appLog(e.t, e.m)); return; }
  if (bug && bug.m === e.m && bug.v === version) return;
  const src = e.f && e.l ? read(e.f)?.split('\n')[e.l - 1]?.trim().slice(0, 140) : '';
  bug = { m: e.m, f: e.f, l: e.l, src, v: version };
  clearTimeout(healthTimer);
  const willFix = !busy && autofix && autoTries < AUTO_MAX;
  const foot = busy ? c.muted('the AI is busy: it gets this after the current answer, or type /fix')
    : willFix ? c.acc(`auto-fix ${autoTries + 1}/${AUTO_MAX}`) + c.muted(' · sending it to the AI')
    : autofix ? c.muted(`auto-fix gave up after ${AUTO_MAX} tries · /fix to try again, or describe what should happen`) : c.muted('/fix sends it to the AI');
  printAbove(() => ui.errorCard({ message: e.m, file: e.f, line: e.l, src, foot }));
  if (willFix) { autoTries++; run(null, { fix: true }); }
}
// prints above the prompt (or above the build animation) without breaking what the user is typing
let bar = null;
function printAbove(s){
  const text = typeof s === 'function' ? captured(s) : s;
  if (bar) return bar.log(text);
  if (!term || busy) return out(text);
  term.print(text);
}
function captured(fn){ const lines = []; const log = console.log; console.log = x => lines.push(x); try { fn(); } finally { console.log = log; } return lines.join('\n'); }

/* ── One turn: a request (or a fix) → the AI → files → browser ── */
const history = [];
async function run(request, { fix = false } = {}){
  if (fix && !bug) return;
  busy = true; term?.hide();
  const before = load();
  let content;
  if (fix) {
    const where = bug.src ? ` It happens in ${bug.f}, line ${bug.l}: ${bug.src}` : '';
    content = `Current app:\n\`\`\`html\n${joined(before)}\n\`\`\`\nThe app has a bug while it runs: "${bug.m}".${where}\nFind the cause and fix it. Return the complete corrected app; keep the design and everything else as it is.`;
  } else {
    const recent = history.slice(-4).map(h => '- ' + h).join('\n');
    content = (before ? `Current app:\n\`\`\`html\n${joined(before)}\n\`\`\`\n` : '') + (recent ? `Earlier requests in this session:\n${recent}\n` : '') + `Request: ${request}`;
  }
  bar = ui.builder(fix ? 'fixing' : before ? 'updating' : 'building');
  let res, parsed, tries = 0;
  try {
    while (true) {
      res = await ask([{ role: 'user', content }], { sameTurn: fix || tries > 0, onText: (t, th) => bar.update(t, th) });
      parsed = parse(res.text);
      const empty = !parsed.app && !parsed.head.reply;
      if ((empty || parsed.cut || res.cut) && tries < 2) { tries++; bar.update('', true); continue; }
      break;
    }
  } catch (e) {
    bar.stop({ folded: false }); bar = null;
    if (e.name === 'AbortError') ui.note('stopped');
    else if (e.status === 429 || e.status === 401) {
      ui.note('! ' + e.message, c.yellow);
      if (backend.free) { ui.note('  unlimited with your own free key:  set GROQ_API_KEY=gsk_...   (console.groq.com)'); ui.note(`  or keep going in the browser: ${SITE}/#code`); }
    } else ui.note('x ' + e.message, c.red);
    return done();
  }
  const seconds = bar.stop(); bar = null;
  if (res.quota) lastQuota = res.quota;
  if (!fix && request) history.push(request);
  if (!parsed.app) {
    out('  ' + (parsed.head.reply ? c.text(parsed.head.reply) : res.text.trim().slice(0, 1200) || c.grey('(empty answer: try again or rephrase)')));
    return done(res.quota);
  }
  if (parsed.cut || res.cut) ui.note('the answer was cut off: the app may be unfinished. Ask "finish the app" or use your own key.', c.yellow);
  save(parsed.app); version++;
  showChange(before, parsed.app, { name: parsed.app.name, reply: parsed.head.reply || (before ? 'Updated.' : 'Ready.'), seconds, quota: res.quota });
  if (fix) bug = null;
  reload();
  // the new version ran for a few seconds without errors: auto-fix gets its tries back
  clearTimeout(healthTimer); healthTimer = setTimeout(() => { if (!bug || bug.v !== version) autoTries = 0; }, 5000);
  if (!opened && !noOpen && url) { opened = true; openBrowser(); ui.note('opened in the browser'); }
  done();
}
function done(){
  busy = false; controller = null;
  if (startBox) return startBox();
  term?.show();
}
// right side of the hint row under the input: auto-fix, the AI and what is left of the free quota
let lastQuota = '', startBox = null, term = null;
function statusText(){
  const q = lastQuota && backend.free ? ` ${lastQuota.split('/')[0]}/${lastQuota.split('/')[1]}` : '';
  return `${autofix ? c.ok('●') : c.grey('●')} ${c.muted('auto-fix ' + (autofix ? 'on' : 'off'))}${c.grey(' · ')}${c.muted((backend.free ? 'Free AI' : backend.name) + q)}`;
}

/* ── Commands ── */
let opened = false, rl = null;
// the same ideas as the empty code workspace on the site
const IDEAS = ['Expense tracker with categories', 'Flashcards for learning words', 'Workout timer with rounds', 'Snake game', 'Unit converter', 'Random team picker'];
const HELP = [
  ['/open', 'open the preview in the browser'],
  ['/fix', 'send the last error to the AI'],
  ['/auto', 'turn auto-fix on or off'],
  ['/undo', 'go back one version'],
  ['/files', 'show the files and their size'],
  ['/model', 'which AI is used and how to change it'],
  ['/clear', 'clear the screen'],
  ['/exit', 'quit (Ctrl+C twice also works)'],
];
function command(line){
  const [cmd] = line.split(/\s+/);
  if (cmd === '/help' || cmd === '/?') { for (const [k, v] of HELP) out(`  ${c.acc(k.padEnd(8))} ${c.muted(v)}`); return; }
  if (cmd === '/open') { openBrowser(); out(c.grey('  ' + url)); return; }
  if (cmd === '/auto') { autofix = !autofix; autoTries = 0; out(`  ${autofix ? c.green('●') : c.grey('●')} auto-fix ${autofix ? c.green('on') : c.grey('off')}`); return; }
  if (cmd === '/fix') { if (!bug) { out(c.grey('  no error from the app right now')); return; } autoTries = 0; return run(null, { fix: true }); }
  if (cmd === '/undo') { if (undo()) { version++; bug = null; reload(); out(`  ${c.acc('<')} back one version`); } else out(c.grey('  nothing to undo')); return; }
  if (cmd === '/files') { for (const f of FILES) { const s = read(f.name); out(`  ${f.color(DOT)} ${f.name.padEnd(11)} ${c.grey(s == null ? 'not yet' : s.split('\n').length + ' lines')}`); } out(c.grey('  ' + dir)); return; }
  if (cmd === '/model') { out(`  ${backend.name}${backend.free ? '' : c.grey(' · ' + backend.model)}`); out(c.grey('  set OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY or OPENAI_API_KEY before starting; OC_MODEL picks the model')); return; }
  if (cmd === '/clear') { process.stdout.write('\x1b[2J\x1b[H'); return; }
  if (cmd === '/exit' || cmd === '/quit') return quit();
  out(c.grey(`  unknown command ${cmd}. /help lists them`));
}
function quit(){ try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {} term?.hide(); out(''); out(`  ${c.acc('■')} ${c.muted('bye. your app is in')} ${c.text(dir)}`); out(''); server?.close(); for (const r of clients) r.end(); process.exit(0); }

/* ── Start ── */
async function main(){
  // a folder with someone else's index.html: work in a subfolder instead of overwriting it
  const existing = read('index.html');
  if (existing != null && !existing.includes(MARK)) { dir = path.join(dir, 'openconstructor-app'); }
  fs.mkdirSync(dir, { recursive: true });
  await startServer();
  const app = load();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const shortDir = home && dir.toLowerCase().startsWith(home.toLowerCase()) ? '~' + dir.slice(home.length) : dir;
  await ui.intro({ version: VERSION, info: [
    ['preview', c.link(url.replace('http://', ''))],
    ['ai', c.text2(backend.free ? 'Free AI' : `${backend.name} · ${backend.model}`)],
    ['', c.text2(shortDir)],
    ['auto-fix', c.text2('on')],
  ] });
  if (app) { out(''); out(`  ${c.acc(DOT)} ${c.text(c.bold(app.name))} ${c.muted('is open · describe a change')}`); if (!noOpen) { opened = true; openBrowser(); } }
  else ui.emptyState(IDEAS.map((x, i) => `${i + 1}  ${x}`));
  let lastCtrlC = 0;
  const ctrlC = () => {
    if (busy && controller) { controller.abort(); return; }
    if (Date.now() - lastCtrlC < 1500) return quit();
    lastCtrlC = Date.now(); term.print('  ' + c.muted('press Ctrl+C again to quit'));
  };
  const handle = line => {
    line = line.trim();
    if (busy) return;
    if (!line) return term.show();
    if (line.startsWith('/')) { const r = command(line); if (!(r instanceof Promise)) term.show(); return; }
    // a number picks one of the ideas while there is no app yet
    if (/^[1-6]$/.test(line) && !load()) line = IDEAS[+line - 1];
    run(line);
  };
  if (process.stdin.isTTY && process.stdout.isTTY) {
    // a real terminal: the framed input box with the hint row
    const box = ui.inputBox({
      placeholder: () => load() ? 'Describe a change…' : 'Describe an app: a calculator, quiz, tracker…',
      hint: () => c.grey('/help commands · \\ + enter new line · ↑ history · ctrl+c ×2 quit'),
      status: statusText,
      onSubmit: handle, onCtrlC: ctrlC,
    });
    term = { show: () => box.show(), hide: () => box.hide(), print: s => box.print(s) };
    if (typeof firstPrompt !== 'string') box.start();
    else { readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.on('keypress', (s, k) => { if (k?.ctrl && k.name === 'c') ctrlC(); }); startBox = () => { process.stdin.removeAllListeners('keypress'); box.start(); startBox = null; }; }
  } else {
    // piped input (scripts, tests): plain lines
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: c.acc(ARROW + ' '), historySize: 200 });
    rl.on('SIGINT', ctrlC);
    rl.on('line', handle);
    rl.on('close', quit);
    term = { show: () => rl.prompt(), hide(){}, print: s => { process.stdout.write('\r\x1b[2K'); out(s); rl.prompt(true); } };
  }
  // edits made by hand in the folder show up in the browser at once
  let t = 0;
  try {
    fs.watch(dir, (ev, name) => {
      if (!name || !/^(index\.html|style\.css|app\.js)$/.test(name) || Date.now() - selfWrite < 600) return;
      clearTimeout(t); t = setTimeout(() => { version++; bug = null; reload(); printAbove(c.grey(`  ${name} changed on disk: reloaded`)); }, 120);
    });
  } catch {}
  if (typeof firstPrompt === 'string') { out(`${c.acc(ARROW)} ${firstPrompt}`); run(firstPrompt); }
  else if (rl) rl.prompt();
}
main();
