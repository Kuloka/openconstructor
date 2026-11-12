// End-to-end checks of the editor with a faked AI. Uses a running dev server on :5173, or starts one.
//   npm run test:e2e            all scenarios
//   ONLY=chat npm run test:e2e  only scenarios whose name contains "chat"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { editor, block, sleep } from './lib.mjs';
import { mkdtempSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let URL_ = process.env.OC_URL || 'http://127.0.0.1:5173/', server = null;
const up = async u => { try { return (await fetch(u)).ok; } catch { return false; } };
if (!(await up(URL_))) {
  URL_ = 'http://127.0.0.1:5199/';
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 80 && !(await up(URL_)); i++) await sleep(250);
}
process.on('exit', () => server?.kill());
const only = process.env.ONLY || '';
const scenario = (name, fn, setup = {}) => test(name, { skip: !!only && !name.includes(only) }, async () => {
  const opts = {};
  const ed = await editor(URL_, { reply: p => opts.reply(p), lang: 'en', ...setup });
  try { await fn(ed, opts); assert.deepEqual(ed.errors, [], 'page errors'); } finally { ed.close(); }
});

scenario('chat: a question gets a Markdown answer, nothing on the canvas', async (ed, o) => {
  o.reply = () => '{"action":"reply"}\n## Async\n- one\n```js\nawait x;\n```';
  await ed.ask('how does async work?'); await ed.idle(); await sleep(400);
  assert.equal((await ed.items()).length, 0);
  assert.ok(await ed.ev(`!!document.querySelector('#messages .message.assistant.md pre')`));
});

scenario('build: an element is placed, unreadable text gets fixed', async (ed, o) => {
  o.reply = () => block('Card', '<style>.c{padding:20px;background:#fff;color:#fff}</style><div class="c"><p>white on white</p></div>');
  await ed.ask('make a card'); await ed.idle();
  const [it] = await ed.items();
  assert.equal(it?.name, 'Card');
  assert.match(it.code, /data-oc-ink/);
});

scenario('streaming: reasoning shows live and the element lands', async (ed, o) => {
  const answer = block('Streamed', '<div style="padding:20px;background:#111;color:#fff">S</div>');
  o.reply = () => ({ sse: [{ choices: [{ delta: { reasoning: 'Thinking about it.' } }] }, ...answer.match(/[\s\S]{1,16}/g).map(c => ({ choices: [{ delta: { content: c } }] })), { choices: [{ delta: {}, finish_reason: 'stop' }] }] });
  await ed.ask('card'); await ed.idle();
  assert.equal((await ed.items())[0]?.name, 'Streamed');
  assert.equal(JSON.parse(ed.posts.at(-1)).stream, true);
  assert.match(await ed.ev(`[...document.querySelectorAll('.th-reason')].pop()?.textContent || ''`), /Thinking about it/);
});

scenario('part edit: only the picked part changes, Ctrl+Z restores', async (ed, o) => {
  o.reply = () => '```html\n<style>.ocx-big{font-size:40px}</style><span class="ocx-big">CHANGED</span>\n```';
  await ed.ev(`(document.querySelector('[data-add]').click(), 1)`); await sleep(800);
  const [before] = await ed.items();
  await ed.ev(`(window.dispatchEvent(new CustomEvent('oc:edit-inline', { detail: ${JSON.stringify(before.id)} })), 1)`); await sleep(500);
  await ed.ev(`(document.getElementById('insAsk').value = 'bigger', document.getElementById('insAi').requestSubmit(), 1)`);
  await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3'))[0].code.includes('CHANGED')`);
  const [after] = await ed.items();
  assert.ok(after.code.includes('.ocx-big') && !after.code.includes('data-oc-target'));
  await ed.ev(`(document.getElementById('undo').click(), 1)`); await sleep(300);
  assert.equal((await ed.items())[0].code, before.code);
});

scenario('page: "add next" chips and dark version', async (ed, o) => {
  o.reply = p => p.includes('RECOLOR') ? block('Dark', '<section style="padding:40px;background:#0b0b0f;color:#eee">x</section>', { action: 'update', full: true }) : block('Hero', '<section style="padding:40px;background:#fff;color:#111"><h1>Hi</h1></section>', { full: true });
  await ed.ask('landing page'); await ed.idle();
  assert.ok(await ed.ev(`document.querySelectorAll('.msg-next button').length > 0`));
  await ed.ev(`(window.__oc = 1, document.getElementById('themeBtn').click(), 1)`); await sleep(300);
  await ed.ev(`(document.querySelector('[data-recolor="dark"]').click(), 1)`);
  await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3'))[0]?.name === 'Dark'`, 12000);
  assert.equal(await ed.ev(`JSON.parse(localStorage.getItem('oc-page')).bg`), '#0b0b0f');
});

scenario('brand kit + make it better', async (ed, o) => {
  o.reply = () => block('Better', '<div style="padding:30px;background:#533afd;color:#fff">B</div>', { action: 'update' });
  await ed.ev(`(document.querySelector('[data-add]').click(), 1)`); await sleep(700);
  await ed.ev(`(() => { document.getElementById('brandBtn').click(); const h = document.querySelector('[data-hex=primary]'); h.value = '#533afd'; h.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-br=save]').click(); return 1; })()`);
  await ed.ev(`(() => { const n = document.querySelector('.node'), r = n.getBoundingClientRect(); n.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })); return 1; })()`); await sleep(300);
  await ed.ev(`([...document.querySelectorAll('#ctxMenu [data-i]')].find(b => b.textContent.includes('make it better')).click(), 1)`);
  await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3'))[0]?.name === 'Better'`);
  assert.equal((await ed.items()).length, 1);
  assert.ok(ed.posts.at(-1).includes('BRAND KIT') && ed.posts.at(-1).includes('DESIGN REVIEW'));
});

scenario('export: the static site .zip downloads', async (ed) => {
  const dir = mkdtempSync(join(tmpdir(), 'oc-dl-'));
  await ed.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await ed.ev(`(document.querySelector('[data-add]').click(), 1)`); await sleep(600);
  await ed.ev(`(document.getElementById('export').click(), 1)`); await sleep(300);
  await ed.ev(`([...document.querySelectorAll('#ctxMenu [data-i]')].find(b => b.textContent.includes('.zip')).click(), 1)`);
  let files = []; for (let i = 0; i < 40 && !files.some(f => f.endsWith('.zip')); i++) { await sleep(150); files = readdirSync(dir); }
  const zipFile = files.find(f => f.endsWith('.zip'));
  assert.ok(zipFile, 'no zip downloaded');
  assert.ok(statSync(join(dir, zipFile)).size > 200);
  rmSync(dir, { recursive: true, force: true });
});

scenario('site layout: no page strips, locked blocks stay, phones get one column', async (ed) => {
  const hero = '<section style="height:600px;background:#000;color:#fff">Hero</section>';
  const card = '<div style="width:300px;height:120px;background:#fff;color:#000">Card</div>';
  await ed.ev(`(localStorage.setItem('form-canvas-v3', JSON.stringify([{ id: 'h', name: 'Hero', x: 0, y: 16, full: true, code: ${JSON.stringify(hero)} }])), localStorage.setItem('oc-page', JSON.stringify({ w: 1440, h: 1100, bg: '#0f766e' })), 1)`);
  await ed.send('Page.reload'); await sleep(3500);
  // the full-width section moves to the top and the page is exactly as tall as it
  assert.equal((await ed.items())[0].y, 0);
  assert.equal(await ed.ev(`document.getElementById('board').style.height`), '600px');
  // locked: a drag doesn't move it
  await ed.ev(`(() => { const n = document.querySelector('.node'), r = n.getBoundingClientRect(); n.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 })); return 1; })()`); await sleep(200);
  await ed.ev(`([...document.querySelectorAll('#ctxMenu [data-i]')].find(b => b.textContent.includes('lock')).click(), 1)`); await sleep(200);
  const box = await ed.ev(`(() => { const r = document.querySelector('.node').getBoundingClientRect(); return { x: r.left + 200, y: r.top + 200 }; })()`);
  for (const [type, dy] of [['mousePressed', 0], ['mouseMoved', 60], ['mouseMoved', 140], ['mouseReleased', 140]]) await ed.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y + dy, button: 'left', clickCount: 1 });
  await sleep(300);
  assert.equal((await ed.items())[0].y, 0);
  assert.equal((await ed.items())[0].locked, true);
  // free layout + phone: blocks become one column; tablet: the page is scaled
  await ed.ev(`(localStorage.setItem('form-canvas-v3', JSON.stringify([{ id: 'h', name: 'Hero', x: 0, y: 0, full: true, code: ${JSON.stringify(hero)} }, { id: 'c', name: 'Card', x: 900, y: 700, code: ${JSON.stringify(card)} }])), 1)`);
  await ed.send('Page.reload'); await sleep(3500);
  const dir = mkdtempSync(join(tmpdir(), 'oc-dl-'));
  await ed.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await ed.ev(`(document.getElementById('export').click(), 1)`); await sleep(300);
  await ed.ev(`([...document.querySelectorAll('#ctxMenu [data-i]')].find(b => b.textContent.includes('HTML page')).click(), 1)`);
  let file; for (let i = 0; i < 40 && !file; i++) { await sleep(150); file = readdirSync(dir).find(f => f.endsWith('.html')); }
  const html = (await import('node:fs')).readFileSync(join(dir, file), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  const probe = w => ed.ev(`new Promise(done => { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:0;top:0;width:${w}px;height:800px;border:0'; f.srcdoc = ${JSON.stringify(html)}; f.onload = () => { const d = f.contentDocument, card = [...d.querySelectorAll('.oc-b')].find(b => b.textContent.includes('Card')).getBoundingClientRect(), page = d.querySelector('.oc-page'); const r = { cardLeft: Math.round(card.left), cardTop: Math.round(card.top), zoom: getComputedStyle(page).zoom, scrollW: d.documentElement.scrollWidth }; f.remove(); done(r); }; document.body.append(f); })`);
  const phone = await probe(390);
  assert.ok(phone.scrollW <= 390, 'no sideways scroll on a phone: ' + phone.scrollW);
  assert.ok(phone.cardLeft < 100 && phone.cardTop >= 600, 'card stacked under the hero: ' + JSON.stringify(phone));
  const tablet = await probe(1000);
  assert.ok(+tablet.zoom < 1 && tablet.scrollW <= 1000, 'tablet scaled: ' + JSON.stringify(tablet));
});

scenario('change requests update the page even when the model says "add"', async (ed, o) => {
  const pageHtml = c => `<section style="padding:40px;background:${c};color:#111"><h1>Bean There coffee</h1><p>Fresh roasted beans every morning in the heart of the city, open daily from seven</p><a href="#">Order now</a></section>`;
  o.reply = () => block('Coffee page', pageHtml('#fff'), { full: true });
  await ed.ask('coffee landing page'); await ed.idle();
  await ed.send('Page.reload'); await sleep(3500); // forget the selection, keep the project
  o.reply = () => block('Coffee page', pageHtml('#fde68a'), { full: true }); // a rewrite, wrongly labelled "add"
  await ed.ask('make the background yellow'); await ed.idle();
  let list = await ed.items();
  assert.equal(list.length, 1, 'the page was updated, not duplicated');
  assert.match(list[0].code, /fde68a/);
  assert.ok(ed.posts.at(-1).includes('answer with action \\"update\\"'));
  o.reply = () => block('Pricing', '<section style="padding:40px;background:#fff;color:#111"><h2>Pricing plans</h2><p>Starter, team and enterprise tiers with monthly billing</p></section>', { full: true });
  await ed.ask('add a pricing section'); await ed.idle();
  list = await ed.items();
  assert.equal(list.length, 2, 'a really new section is added');
});

scenario('the AI knows the current year; old copyright years get fixed', async (ed, o) => {
  o.reply = () => block('Footer', '<footer style="padding:20px;background:#111;color:#eee">© 2024 Bean There · since 2019</footer>', { full: true });
  await ed.ask('footer'); await ed.idle();
  const year = new Date().getFullYear();
  assert.ok(ed.posts.at(-1).includes(`the current year is ${year}`));
  const [it] = await ed.items();
  assert.match(it.code, new RegExp(`© ${year} Bean There · since 2019`));
});

// the free built-in AI (no key) streams too; the server answers in OpenAI-style SSE
const sse = chunks => chunks.map(c => 'data: ' + JSON.stringify(c) + '\n\n').join('') + 'data: [DONE]\n\n';
const freeAnswer = block('Free page', '<section style="padding:30px;background:#111;color:#eee">Free AI</section>', { full: true });
scenario('free AI: the answer streams live without a key', async (ed) => {
  await ed.ask('a page'); await ed.idle();
  assert.equal((await ed.items())[0]?.name, 'Free page');
  assert.match(await ed.ev(`[...document.querySelectorAll('.th-reason')].pop()?.textContent || ''`), /planning/);
  assert.equal(JSON.parse(globalThis.__freePost).stream, true);
}, { connect: false, signedIn: true, routes: [{ match: u => /\/api\/ai$/.test(u), handle: rq => { globalThis.__freePost = rq.postData; return { type: 'text/event-stream', headers: [{ name: 'X-OC-Quota', value: '3/20' }], body: sse([{ choices: [{ delta: { reasoning: 'planning the page' } }] }, ...freeAnswer.match(/[\s\S]{1,20}/g).map(c => ({ choices: [{ delta: { content: c } }] })), { choices: [{ delta: {}, finish_reason: 'stop' }] }]) }; } }] });

scenario('AI picture: drawn by the free model, placed as a block', async (ed) => {
  await ed.ev(`(window.prompt = () => 'latte art on a table', 1)`);
  await ed.ev(`(document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })), 1)`); await sleep(300);
  await ed.ev(`(() => { const i = document.getElementById('palInput'); i.value = 'AI picture'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
  await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').length === 1`);
  const [it] = await ed.items();
  assert.equal(it.name, 'AI picture');
  assert.match(it.code, /<img class="oc-aipic" src="data:image\/(webp|jpeg)/);
  assert.equal(JSON.parse(globalThis.__imgPost).prompt, 'latte art on a table');
}, { connect: false, signedIn: true, routes: [{ match: u => /\/api\/image$/.test(u), handle: rq => { globalThis.__imgPost = rq.postData; return { type: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }; } }] });

scenario('AI image in the inline editor fills the picked part', async (ed) => {
  await ed.ev(`(window.prompt = () => 'mountain lake at dawn', 1)`);
  await ed.ev(`(document.querySelector('[data-add]').click(), 1)`); await sleep(700);
  const [before] = await ed.items();
  await ed.ev(`(window.dispatchEvent(new CustomEvent('oc:edit-inline', { detail: ${JSON.stringify(before.id)} })), 1)`); await sleep(500);
  await ed.ev(`(document.querySelector('[data-ins="aiimage"]').click(), 1)`); await sleep(1500);
  await ed.ev(`(document.querySelector('[data-ins="done"]').click(), 1)`); await sleep(400);
  const [after] = await ed.items();
  assert.match(after.code, /data:image\/webp/);
  assert.equal(JSON.parse(globalThis.__img2).prompt, 'mountain lake at dawn');
}, { connect: false, signedIn: true, routes: [{ match: u => /\/api\/image$/.test(u), handle: rq => { globalThis.__img2 = rq.postData; return { type: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }; } }] });

// art: tokens are drawn by the free FLUX model (signed in); the cinematic request carries the style reference
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
scenario('cinematic 3D site: built from the template, AI writes content, art drawn', async (ed, opts) => {
  globalThis.__artPosts = [];
  opts.reply = () => JSON.stringify({ brand: 'Nordlicht', hue: 30, titleA: 'Свет как материал.', titleB: 'Эмоции как результат.', heroArt: 'amber neon cube over dark sand dunes, cinematic 3d render', featureArt: 'glowing hall, cinematic 3d render', services: [['Идея', 'Концепция'], ['Сборка', 'Монтаж'], ['Контент', 'Видео'], ['Сервис', '24/7']], reply: 'Готово' });
  await ed.ask('сделай кинематографичный 3D сайт для студии света'); await ed.idle();
  await ed.until(`(JSON.parse(localStorage.getItem('form-canvas-v3') || '[]')[0]?.code || '').includes('data:image')`);
  const [it] = await ed.items();
  assert.equal(it.name, 'Nordlicht · 3D site');
  assert.match(it.code, /Свет как материал\./);
  assert.match(it.code, /class="ci-art" src="data:image\/(webp|jpeg|png)/);
  assert.ok(!it.code.includes('#4d8dff'), 'accent hue applied');
  assert.deepEqual(globalThis.__artPosts.map(p => JSON.parse(p).prompt).sort(), ['amber neon cube over dark sand dunes, cinematic 3d render', 'glowing hall, cinematic 3d render']);
  assert.match(ed.posts[0], /CONTENT for a cinematic/);
}, { signedIn: true, routes: [{ match: u => /\/api\/image$/.test(u), handle: rq => { globalThis.__artPosts.push(rq.postData); return { type: 'image/png', body: PNG1 }; } }] });

// app mode: the AI is told to write a working app, the element runs its script in an isolated frame
// (the frame reports its own size), and the exported page is marked so the published page runs scripts
const COUNTER = '<style>.ct-app{width:300px;padding:20px;background:#111;color:#fff}</style>\n<div class="ct-app"><b class="ct-n">0</b><button class="ct-b">+1</button><div class="ct-pad" style="height:0"></div></div>\n<script>(()=>{const r=document.querySelector(\'.ct-app\');r.querySelector(\'.ct-pad\').style.height=\'317px\';r.querySelector(\'.ct-b\').onclick=()=>{const n=r.querySelector(\'.ct-n\');n.textContent=+n.textContent+1}})();</script>';
scenario('apps: app mode builds a working mini-app that runs in an isolated frame', async (ed, o) => {
  o.reply = () => block('Counter', COUNTER);
  await ed.ev(`(document.getElementById('appToggle').click(), 1)`);
  assert.equal(await ed.ev(`document.getElementById('appToggle').getAttribute('aria-pressed')`), 'true');
  await ed.ask('a click counter'); await ed.idle();
  const [it] = await ed.items();
  assert.equal(it.app, true);
  assert.match(ed.posts[0], /APP MODE/);
  assert.match(ed.posts[0], /Reference app/);
  assert.equal(await ed.ev(`document.querySelector('.node.is-app iframe').getAttribute('sandbox')`), 'allow-scripts');
  // the script ran: it grew the app and the frame reported the new height
  assert.ok(await ed.until(`document.querySelector('.node.is-app iframe').offsetHeight > 340`), 'app frame sized by its script');
  const html = await ed.ev(`window.__oc.studio.html()`);
  assert.match(html, /<meta name="oc-app" content="1">/);
  assert.match(html, /ct-pad/);
});

// free reasoning models sometimes spend the whole answer thinking (empty answer) or get cut mid-script:
// app mode asks again, up to twice, and never places a half-written app
scenario('apps: an empty answer and a cut-off app are retried', async (ed, o) => {
  let n = 0;
  o.reply = () => ++n === 1 ? '' : n === 2 ? block('Counter', COUNTER.replace('</script>', '')) : block('Counter', COUNTER);
  await ed.ev(`(document.getElementById('appToggle').click(), 1)`);
  await ed.ask('a click counter'); await ed.idle();
  const list = await ed.items();
  assert.equal(n, 3);
  assert.equal(list.length, 1);
  assert.match(list[0].code, /<\/script>/);
  assert.match(ed.posts[2], /Do NOT write the code in your reasoning/);
});

// a script error in a new app is shown in the chat with a one-click fix that sends the error to the AI
scenario('apps: a script error offers a fix', async (ed, o) => {
  let n = 0;
  o.reply = () => ++n === 1 ? block('Counter', COUNTER.replace("r.querySelector('.ct-pad')", "r.querySelector('.nope')")) : block('Counter', COUNTER, { action: 'update' });
  await ed.ev(`(document.getElementById('appToggle').click(), 1)`);
  await ed.ask('a click counter'); await ed.idle();
  assert.ok(await ed.until(`!!document.querySelector('.node.is-app-error') && !!document.querySelector('#messages .msg-cta button')`), 'error shown with a fix button');
  await ed.ev(`(document.querySelector('#messages .msg-cta button').click(), 1)`); await sleep(500); await ed.idle();
  assert.match(ed.posts[1], /Fix this script error/);
  assert.ok(await ed.until(`!document.querySelector('.node.is-app-error')`), 'fixed app has no error');
  assert.equal((await ed.items()).length, 1);
});

scenario('apps: the welcome screen opens a ready-made app on a new page', async ed => {
  await ed.ev(`(window.dispatchEvent(new CustomEvent('oc:welcome', { detail: 'wl-apps' })), 1)`);
  assert.ok(await ed.until(`document.querySelectorAll('.wl-app iframe').length === 4`), 'four live app cards');
  await ed.ev(`([...document.querySelectorAll('.wl-app')].find(c => /quiz/i.test(c.textContent)).querySelector('.wl-btn.primary').click(), 1)`);
  assert.ok(await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').some(x => x.app)`), 'app placed');
  const [it] = await ed.items();
  assert.match(it.code, /qz-app/);
  assert.equal(await ed.ev(`document.getElementById('appToggle').getAttribute('aria-pressed')`), 'true');
}, { connect: false });

// openconstructor code: the chat moves into the workspace, a new app shows in the live preview,
// the next request edits that app (not the page on the canvas), the preview width is adjustable
scenario('apps: Code workspace — chat + resizable live preview, edits stay on the app', async (ed, o) => {
  let n = 0;
  o.reply = () => ++n === 1 ? block('Landing', '<section class="lp-x" style="width:100%;height:300px;background:#123">Page</section>', { full: true })
    : n === 2 ? block('Counter', COUNTER) : block('Counter', COUNTER.replace('+1', '+10'), { action: 'update' });
  await ed.ask('a landing page'); await ed.idle();
  await ed.ev(`(document.querySelector('.tb-code').click(), 1)`); await sleep(400);
  assert.equal(await ed.ev(`!!document.querySelector('#cwChat #chatPanel')`), true, 'chat moved into the workspace');
  assert.equal(await ed.ev(`!document.getElementById('cwEmpty').classList.contains('hidden')`), true, 'empty state without an app');
  await ed.ask('a click counter'); await ed.idle(); await sleep(300);
  assert.match(await ed.ev(`document.getElementById('cwIframe').srcdoc`), /ct-app/);
  await ed.ask('make the button add 10'); await ed.idle(); await sleep(300);
  const list = await ed.items();
  assert.equal(list.length, 2);
  assert.match(list.find(x => x.app).code, /\+10/);
  assert.match(list.find(x => !x.app).code, /lp-x/, 'the page on the canvas is untouched');
  // the change is reported by file and language, with the number of lines
  assert.equal(await ed.ev(`document.getElementById('cwDiff').textContent`), '+1−1');
  assert.match(await ed.ev(`[...document.querySelectorAll('.cw-change')].pop().textContent`), /index\.htmlHTML\+1−1/);
  await ed.ev(`(document.querySelector('[data-tab="code"]').click(), 1)`);
  assert.match(await ed.ev(`document.getElementById('cwFiles').textContent`), /index\.html\d+style\.css\d+app\.js\d+/);
  assert.match(await ed.ev(`document.getElementById('cwStats').textContent`), /HTML \d+ · CSS \d+ · JavaScript \d+ — \d+ lines/);
  await ed.ev(`(document.querySelector('[data-tab="preview"]').click(), 1)`);
  await ed.ev(`(document.querySelector('[data-dev="820"]').click(), 1)`);
  assert.equal(await ed.ev(`document.getElementById('cwFrame').style.width`), '820px');
  await ed.ev(`(document.querySelector('.cw-x').click(), 1)`); await sleep(300);
  assert.equal(await ed.ev(`!!document.querySelector('#main #chatPanel')`), true, 'chat back in the editor');
});

// openconstructor code: an error in the live preview goes to the AI at once (with the failing line),
// the fixed version replaces it and the error bar goes away
scenario('apps: Code workspace — a script error is sent to the AI and fixed automatically', async (ed, o) => {
  let n = 0;
  o.reply = () => ++n === 1 ? block('Counter', COUNTER.replace("r.querySelector('.ct-pad')", "r.querySelector('.nope')")) : block('Counter', COUNTER, { action: 'update' });
  await ed.ev(`(document.querySelector('.tb-code').click(), 1)`); await sleep(400);
  await ed.ask('a click counter'); await ed.idle();
  for (let i = 0; i < 60 && n < 2; i++) await sleep(200);
  assert.equal(n, 2, 'fix request sent without a click');
  assert.ok(await ed.until(`document.getElementById('cwErr').classList.contains('hidden')`, 10000), 'error bar gone after the fix');
  assert.equal(n, 2);
  assert.match(ed.posts[1], /has a bug while it runs/);
  assert.match(ed.posts[1], /\.nope/, 'the failing line is sent along');
  assert.equal((await ed.items()).length, 1);
  assert.equal(await ed.ev(`[...document.querySelectorAll('#messages .msg-cta')].map(x => x.textContent).join('|')`), '', 'no duplicate offer from the canvas');
});

// a "silent" bug (NaN on screen) is caught too; auto-fix stops after two tries and leaves a manual button
scenario('apps: Code workspace — NaN on screen is caught, auto-fix gives up after two tries', async (ed, o) => {
  let n = 0;
  const BAD = COUNTER.replace("r.querySelector('.ct-pad').style.height='317px';", "r.querySelector('.ct-n').textContent=String(parseFloat('x'))+' items';");
  o.reply = () => ++n === 1 ? block('Counter', BAD) : block('Counter', BAD.replace('items', 'items ' + n), { action: 'update' });
  await ed.ev(`(document.querySelector('.tb-code').click(), 1)`); await sleep(400);
  await ed.ask('a click counter'); await ed.idle();
  assert.ok(await ed.until(`!document.getElementById('cwFix').hidden && !document.getElementById('cwErr').classList.contains('hidden') && !document.querySelector('.message.thinking:not(.folded)')`, 20000), 'manual fix button after auto tries');
  await sleep(800);
  assert.equal(n, 3, 'one build + two automatic fixes');
  assert.match(await ed.ev(`document.getElementById('cwErrText').textContent`), /NaN/);
  // the bottom panel lists it under Problems, and the status bar counts it
  assert.match(await ed.ev(`document.getElementById('cwProblems').textContent`), /NaN/);
  assert.match(await ed.ev(`document.getElementById('cwStProb').textContent`), /^1/);
  assert.match(ed.posts[1], /the screen shows \\"NaN\\"/);
});
