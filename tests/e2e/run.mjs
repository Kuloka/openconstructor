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

scenario('live build: the page appears as it is written, the AI cursor outlines each element it writes, then the draft goes away', async (ed, o) => {
  o.reply = () => block('Cafe', '<style>.lp{background:#f6f1ea;color:#111}</style><div class="lp"><header class="lp-header"><b>Brew</b></header><section class="lp-hero"><h1>Coffee</h1><p>Small-batch roasts.</p></section><section class="lp-menu"><h2>Menu</h2></section><footer class="lp-footer">© Brew</footer></div>', { full: true });
  await ed.ev(`(window.__bs = [], new MutationObserver(() => { const s = document.querySelector('#board .bs-draft'); if (s) window.__bs.push([s.querySelectorAll('.bs-cur.on').length, [...s.querySelectorAll('.bs-cur span')].map(x => x.textContent).join(',')]); }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true }), 1)`);
  await ed.ask('a landing page for a coffee shop');
  assert.ok(await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').length > 0`, 15000), 'the page was placed');
  await ed.idle(); await sleep(1200);
  const seen = await ed.ev('window.__bs');
  assert.ok(seen.length, 'the draft was on the board');
  // one real writer, no staged extras; it went through the elements it wrote, in order
  assert.ok(seen.every(([n]) => n <= 1), 'one cursor for one answer: ' + JSON.stringify(seen.find(([n]) => n > 1)));
  const labels = seen.map(([, l]) => l).filter(Boolean);
  assert.ok(!labels.some(l => /thinking|waiting/.test(l)), 'no staged states');
  const i1 = labels.findIndex(l => /^(h1|p|b)$|hero/.test(l)), i2 = labels.findIndex(l => /footer/.test(l));
  assert.ok(i1 >= 0 && i2 > i1, 'the cursor followed the writing: ' + JSON.stringify([...new Set(labels)]));
  assert.equal(await ed.ev(`document.querySelectorAll('.bs-draft').length`), 0, 'the draft is gone');
  assert.equal((await ed.items())[0]?.name, 'Cafe');
});

scenario('swarm: a new page is planned, then every section is built by its own agent at once', async (ed, o) => {
  const plan = { name: 'Brew', reply: 'ok', css: '.pg{--bg:#f6f1ea;--surface:#fff;--text:#1d1a16;background:var(--bg);color:var(--text)}.pg .wrap{max-width:1160px;margin:0 auto;padding:0 28px}', sections: ['header', 'hero', 'menu', 'contact', 'footer'].map(kind => ({ kind, brief: 'the ' + kind })) };
  const asks = [];
  o.reply = body => {
    const b = JSON.parse(body), all = JSON.stringify(b.messages);
    if (/lead designer of a team/.test(all)) return JSON.stringify(plan);
    const n = +(all.match(/YOUR PART: section (\d+)/) || [])[1];
    asks.push(n);
    const kind = plan.sections[n - 1].kind, tag = kind === 'header' ? 'header' : kind === 'footer' ? 'footer' : 'section';
    return '```html\n<style>.s' + n + '{padding:40px 0;background:var(--surface)}</style><' + tag + ' class="s' + n + '"><div class="wrap"><h2>' + kind + ' part</h2><p>Text of ' + kind + '</p></div></' + tag + '>\n```';
  };
  await ed.ev(`(window.__sw = [], new MutationObserver(() => { const s = document.querySelector('#board .bs-draft'); if (s) window.__sw.push([...s.querySelectorAll('.bs-cur span')].map(x => x.textContent).join(',')); }).observe(document.body, { childList: true, subtree: true, characterData: true }), 1)`);
  await ed.ask('a landing page for a coffee shop');
  assert.ok(await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').length > 0`, 20000), 'the page was placed');
  await ed.idle(); await sleep(1200);
  assert.deepEqual([...asks].sort(), [1, 2, 3, 4, 5], 'one call per section');
  const [it] = await ed.items();
  assert.equal(it.name, 'Brew');
  for (const k of ['header part', 'hero part', 'menu part', 'contact part', 'footer part']) assert.ok(it.code.includes(k), k);
  assert.ok(it.code.indexOf('header part') < it.code.indexOf('footer part'), 'sections stay in plan order');
  const seen = await ed.ev('window.__sw');
  assert.ok(seen.some(x => ['header', 'hero', 'menu', 'contact', 'footer'].every(k => x.includes(k))), 'a cursor per agent: ' + seen.at(-1));
  assert.equal(await ed.ev(`document.querySelectorAll('.bs-draft').length`), 0);
});

scenario('3D objects: model: objects are live 3D with a rendered still picture', async (ed, o) => {
  o.reply = () => block('Shapes', '<div style="background:#111;color:#fff;padding:20px"><img src="model:torus chrome" alt="torus" width="200"><img src="model:diamond glass #8b5cf6" alt="gem" width="200"></div>');
  await ed.ask('two 3d shapes');
  assert.ok(await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').length > 0`, 15000));
  const [it] = await ed.items();
  assert.equal((it.code.match(/<canvas data-oc-model="(torus chrome|diamond glass #8b5cf6)"/g) || []).length, 2, 'both objects are live canvases');
  assert.equal((it.code.match(/background:url\('data:image\/(webp|png)/g) || []).length, 2, 'both have a rendered still picture');
  assert.match(it.code, /width:200px/);
  assert.ok(!/model:/.test(it.code));
  // exported pages load the live-3D runtime
  assert.match(await ed.ev(`import('/studio.js').then(m => m.studio.html())`), /<script src="https:\/\/openconstructor\.pw\/oc3d\.js" defer><\/script>/);
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
  // the design review goes out with the brand kit; its own wording ("Current element") must not start a web search
  const review = ed.posts.find(p => p.includes('DESIGN REVIEW') && !p.includes('You write web search'));
  assert.ok(review && review.includes('BRAND KIT'), 'review request carries the brand kit');
  assert.ok(!ed.posts.some(p => p.includes('You write web search')), 'no web search for "make it better"');
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

// the AI keys dialog is a plain list with a search box and a filter; keyless services list only their free models
scenario('keys: search and filter the services, a keyless service lists its free models', async (ed) => {
  await ed.ev(`(document.getElementById('settingsButton').click(), 1)`); await sleep(300);
  const rows = () => ed.ev(`[...document.querySelectorAll('#providers .prov[data-prov]')].map(r => r.dataset.prov)`);
  assert.ok((await rows()).length > 80, 'all services are listed');
  await ed.ev(`(() => { const i = document.getElementById('provSearch'); i.value = 'kilo'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  assert.deepEqual(await rows(), ['kilo']);
  await ed.ev(`(() => { const i = document.getElementById('provSearch'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#provFilter [data-f=nokey]').click(); return 1; })()`);
  const nokey = await rows();
  assert.ok(nokey.includes('kilo') && nokey.includes('ovh') && !nokey.includes('groq'), 'the filter keeps only keyless services');
  await ed.ev(`(document.querySelector('#provFilter [data-f=on]').click(), 1)`);
  assert.deepEqual(await rows(), ['groq'], '"On" shows only what is switched on');
  // no lights: the old cursor spotlight / border sweep are gone
  assert.equal(await ed.ev(`getComputedStyle(document.querySelector('#providers .prov'), '::before').content`), 'none');
}, { routes: [{ match: u => u.includes('/api/relay/kilo/models'), handle: () => ({ body: JSON.stringify({ data: [{ id: 'nvidia/nemotron-3.5-super-vl:free', name: 'NVIDIA: Nemotron 3.5 Super (free)' }, { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5' }] }) }) }] });

scenario('keys: a keyless relay service shows only its free models without a key', async (ed) => {
  await ed.ev(`(document.getElementById('settingsButton').click(), 1)`); await sleep(300);
  await ed.ev(`(document.querySelector('#providers [data-switch=kilo]').click(), 1)`);
  assert.ok(await ed.until(`/1 /.test(document.querySelector('#providers [data-prov=kilo] .prov-st.ok')?.textContent || '')`), 'one free model, the paid one is hidden');
}, { routes: [{ match: u => u.includes('/api/relay/kilo/models'), handle: () => ({ body: JSON.stringify({ data: [{ id: 'nvidia/nemotron-3.5-super-vl:free', name: 'NVIDIA: Nemotron 3.5 Super (free)' }, { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5' }] }) }) }] });

// plain chat mode: opened from the mode switch, the whole conversation goes to the model, the answer streams in,
// the conversation is remembered, nothing lands on the canvas, Build brings the editor back
scenario('plain chat: mode switch, streamed answer, history, back to Build', async (ed, o) => {
  o.reply = () => ({ sse: ['Hello', ' there', '!\n\n- one\n- two'].map(c => ({ choices: [{ delta: { content: c } }] })).concat([{ choices: [{ delta: {}, finish_reason: 'stop' }] }]) });
  await ed.ev(`(document.querySelector('.oc-modes.in-editor [data-mode=chat]').click(), 1)`); await sleep(300);
  assert.equal(await ed.ev(`!document.getElementById('chatWorkspace').classList.contains('hidden')`), true, 'chat is open');
  assert.equal(await ed.ev(`location.hash`), '#chat');
  assert.match(await ed.ev(`document.querySelector('.och-model-btn').textContent`), /llama/i, 'the connected model is picked');
  const send = text => ed.ev(`(() => { const t = document.querySelector('.och-compose textarea'); t.value = ${JSON.stringify(text)}; document.querySelector('.och-compose').requestSubmit(); return 1; })()`);
  await send('hi');
  assert.ok(await ed.until(`!document.querySelector('.och-msg.live') && !!document.querySelector('.och-msg.ai li')`), 'the answer streamed in with Markdown');
  assert.match(await ed.ev(`document.querySelector('.och-msg.ai .och-text').textContent`), /Hello there!/);
  await send('and again');
  assert.ok(await ed.until(`document.querySelectorAll('.och-msg.ai').length === 2 && !document.querySelector('.och-msg.live')`));
  const body = JSON.parse(ed.posts.at(-1));
  assert.deepEqual(body.messages.filter(m => m.role !== 'system').map(m => m.role), ['user', 'assistant', 'user'], 'the history goes along');
  const saved = await ed.ev(`JSON.parse(localStorage.getItem('oc-chats'))`);
  assert.equal(saved.length, 1); assert.equal(saved[0].title, 'hi'); assert.equal(saved[0].messages.length, 4);
  assert.equal((await ed.items()).length, 0, 'nothing on the canvas');
  await ed.ev(`(document.querySelector('.oc-modes.in-chat [data-mode=build]').click(), 1)`); await sleep(200);
  assert.equal(await ed.ev(`document.getElementById('chatWorkspace').classList.contains('hidden') && location.hash === ''`), true, 'back to the editor');
  assert.equal(await ed.ev(`document.querySelector('.oc-modes.in-editor [data-mode=build]').getAttribute('aria-pressed')`), 'true');
});

// "who is X, look it up" in the chat: the model writes a query from the conversation, the web is searched,
// the answer gets the results, and the sources show under it
scenario('plain chat: searches the web when asked, shows sources', async (ed, o) => {
  o.reply = body => /You write web search queries/.test(body) ? '["Kuloka developer github"]' : 'Kuloka is a developer on [GitHub](https://github.com/Kuloka).';
  await ed.ev(`(window.__webCalls = [], window.__origFetch = window.fetch, window.fetch = (u, o) => { if (String(u).startsWith('/api/web')) { window.__webCalls.push(String(u)); return Promise.resolve(new Response(JSON.stringify({ results: [{ title: 'Kuloka · GitHub', url: 'https://github.com/Kuloka', snippet: 'openconstructor author' }] }), { headers: { 'Content-Type': 'application/json' } })); } return window.__origFetch(u, o); }, 1)`);
  await ed.ev(`(document.querySelector('.oc-modes.in-editor [data-mode=chat]').click(), 1)`); await sleep(400);
  await ed.ev(`(() => { const t = document.querySelector('.och-compose textarea'); t.value = 'кто такой Kuloka, поищи'; document.querySelector('.och-compose').requestSubmit(); return 1; })()`);
  assert.ok(await ed.until(`!document.querySelector('.och-msg.live') && !!document.querySelector('.och-sources a')`, 12000), 'sources under the answer');
  assert.match((await ed.ev(`window.__webCalls`))[0], /Kuloka%20developer%20github/, 'the model-written query was searched');
  assert.match(ed.posts.at(-1), /Web results for/, 'the answer request carries the results');
  assert.match(await ed.ev(`document.querySelector('.och-sources a').href`), /github\.com\/Kuloka/);
  // a plain question does not search
  await ed.ev(`(() => { const t = document.querySelector('.och-compose textarea'); t.value = 'привет'; document.querySelector('.och-compose').requestSubmit(); return 1; })()`);
  assert.ok(await ed.until(`document.querySelectorAll('.och-msg.ai').length === 2 && !document.querySelector('.och-msg.live')`));
  assert.equal((await ed.ev(`window.__webCalls`)).length, 1, 'no search for a greeting');
});

// the welcome screen's prompt in "Chat" mode opens the chat with the question already asked
scenario('plain chat: started from the welcome screen prompt', async (ed, o) => {
  o.reply = () => ({ sse: [{ choices: [{ delta: { content: 'Hi from chat' } }] }] });
  await ed.ev(`(document.getElementById('homeBtn').click(), 1)`); await sleep(900);
  await ed.ev(`([...document.querySelectorAll('.wl-hero-modes button')][2].click(), 1)`); await sleep(200);
  assert.equal(await ed.ev(`document.querySelector('.wl-prompt button[type=submit]').textContent`), 'Send');
  await ed.ev(`(() => { const i = document.querySelector('.wl-prompt input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'hello'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.wl-prompt button[type=submit]').click(); return 1; })()`);
  assert.ok(await ed.until(`!document.getElementById('chatWorkspace').classList.contains('hidden') && /Hi from chat/.test(document.querySelector('.och-msg.ai')?.textContent || '')`), 'the chat opened and answered');
  assert.equal(await ed.ev(`document.querySelector('.och-bubble').textContent`), 'hello');
  assert.equal((await ed.items()).length, 0, 'nothing on the canvas');
});

// openconstructor code: the chat moves into the workspace, a new app shows in the live preview,
// the next request edits that app (not the page on the canvas), the preview width is adjustable
scenario('apps: Code workspace — chat + resizable live preview, edits stay on the app', async (ed, o) => {
  let n = 0;
  o.reply = body => /lead designer of a team/.test(body) ? 'no plan' : ++n === 1 ? block('Landing', '<section class="lp-x" style="width:100%;height:300px;background:#123">Page</section>', { full: true })
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

// / commands in the message box: the menu opens on "/", Enter on /app switches app mode (a chip shows it),
// and "/polish …" sends the request with the command's expert instruction attached
scenario('slash commands: menu, toggles and prompt commands', async (ed, o) => {
  o.reply = () => '{"action":"reply"}\nok';
  const type = v => ed.ev(`(() => { const ta = document.querySelector('#react-composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(v)}); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return 1; })()`);
  await type('/ap');
  assert.ok(await ed.until(`document.querySelectorAll('.slash-item').length === 1`), 'menu filtered to /app');
  await ed.ev(`(document.querySelector('#react-composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 1)`);
  assert.ok(await ed.until(`document.getElementById('appToggle').getAttribute('aria-pressed') === 'true'`), 'app mode on');
  assert.ok(await ed.until(`!!document.querySelector('.mode-chip.mode-app')`), 'app chip shown');
  await ed.ev(`(document.querySelector('.mode-chip.mode-app').click(), 1)`);
  assert.equal(await ed.ev(`document.getElementById('appToggle').getAttribute('aria-pressed')`), 'false');
  await ed.ask('/polish calmer colours'); await ed.idle();
  assert.match(ed.posts[0], /Command \/polish: Design pass/);
  assert.match(ed.posts[0], /Request: calmer colours/);
  // the provider's own usage numbers replace the estimate: 1234 in + 56 out, no "~"
  assert.ok(await ed.until(`(document.querySelector('.tok-chip b')?.textContent || '') === '1.3k'`), 'exact token count shown');
});

// on the canvas the editor lays a live WebGL canvas over the element's <canvas data-oc-model> (frames run no scripts)
scenario('3D: a live model is rendered over the element on the canvas', async (ed, o) => {
  o.reply = () => block('Mirror D', '<style>.dd{width:600px;height:500px;display:grid;place-items:center;background:#0b0b0c}.dd .obj{width:360px}</style>\n<div class="dd"><img class="obj" src="model:letter D chrome" alt="D"></div>');
  await ed.ask('3d letter D in mirror style that reacts to the cursor'); await ed.idle();
  assert.ok(await ed.until(`!!document.querySelector('.node .oc-live3d')`, 15000), 'live overlay mounted');
  const [w, h, vis] = await ed.ev(`(() => { const c = document.querySelector('.node .oc-live3d'); return [c.offsetWidth, c.offsetHeight, c.style.display]; })()`);
  assert.ok(w > 300 && h > 300 && vis === 'block', `overlay sized like the object (${w}×${h}, ${vis})`);
  assert.match((await ed.items())[0].code, /<canvas data-oc-model="letter D chrome"[^>]*class="obj"/);
});

// editing an element with a live 3D object: the AI sees it as <img src="model:…"> (its own form), not as the canvas
scenario('3D: an edit sends the live object back to the AI as model:', async (ed, o) => {
  o.reply = () => block('Glass D', '<style>.gd{display:grid;place-items:center;width:600px;height:500px;background:#111}.gd .obj{width:360px}</style>\n<div class="gd"><img class="obj" src="model:letter D glass" alt="D"></div>');
  await ed.ask('3d letter D glass'); await ed.idle();
  assert.ok(await ed.until(`JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').length > 0`, 15000));
  const before = ed.posts.length;
  o.reply = () => '{"action":"reply","reply":"ok"}\nok';
  await ed.ask('remove the background'); await ed.idle();
  assert.ok(await ed.until(`true`) && ed.posts.length > before, 'the edit was sent');
  const sent = ed.posts.slice(before).join('\n').replace(/\\/g, '');
  assert.match(sent, /<img src="model:letter D glass" class="obj"/);
  assert.ok(!/data-oc-model/.test(sent), 'no canvas markup sent');
  assert.ok(!/kept:\d/.test(sent), 'the still picture is not sent');
});

// a 3D object the AI gave no width must not collapse on the canvas (frames without scripts give <canvas> no size)
scenario('3D: a live model without a width keeps its size on the canvas', async (ed, o) => {
  o.reply = () => block('3D letter D', '<div class="d3"><img src="model:letter D chrome" alt="D"></div>');
  await ed.ask('3d letter D'); await ed.idle();
  assert.ok(await ed.until(`(document.querySelector('.node .oc-live3d')?.offsetWidth || 0) > 300`, 15000), 'the live object is visible');
  assert.ok(await ed.ev(`document.querySelector('.node').offsetWidth > 300`), 'the element is not an empty box');
});

// "Sign in with OpenRouter": the callback's code becomes the person's key (the key exchange is faked),
// the URL is cleaned and the models load with that key
const orSeen = { exchanged: null, modelsAuth: '' };
const orRoutes = [
  { match: u => u.includes('openrouter.ai/api/v1/auth/keys'), handle: rq => { orSeen.exchanged = JSON.parse(rq.postData || '{}'); return { body: JSON.stringify({ key: 'sk-or-v1-test' }) }; } },
  { match: u => u.includes('openrouter.ai/api/v1/models'), handle: rq => { orSeen.modelsAuth = rq.headers?.Authorization || rq.headers?.authorization || ''; return { body: JSON.stringify({ data: [{ id: 'deepseek/deepseek-chat', name: 'DeepSeek', pricing: { prompt: '0', completion: '0' } }] }) }; } },
];
scenario('OpenRouter: one-click sign-in turns the callback code into a key', async (ed) => {
  assert.ok(await ed.ev(`!!document.querySelector('#emptyStart [data-or-connect]')`), 'the button is on the empty canvas');
  await ed.ev(`(sessionStorage.setItem('oc-or-verifier', 'v-test'), 1)`);
  await ed.send('Page.navigate', { url: URL_ + '?or-connect=1&code=c-test' });
  assert.ok(await ed.until(`location.href.startsWith('http') && !location.search.includes('code=')`, 15000), 'the URL is cleaned');
  for (let i = 0; i < 80 && !orSeen.modelsAuth; i++) await sleep(150);
  assert.deepEqual(orSeen.exchanged, { code: 'c-test', code_verifier: 'v-test', code_challenge_method: 'S256' });
  assert.equal(orSeen.modelsAuth, 'Bearer sk-or-v1-test', 'models load with the new key');
}, { connect: false, routes: orRoutes });

// "make a site about…" while only a small element (a logo, a 3D word) is on the canvas: a whole page is built by the
// swarm, not an edit of that element (the typo is on purpose, like a real request)
scenario('swarm: "make a site" over a small element builds a page, not an edit', async (ed, o) => {
  o.reply = () => block('Glass word', '<div class="gw"><h1>OpenConstructor</h1></div>');
  await ed.ask('glass word OpenConstructor'); await ed.idle();
  let planned = false;
  o.reply = body => {
    const all = JSON.stringify(JSON.parse(body).messages);
    if (/lead designer of a team/.test(all)) { planned = true; return JSON.stringify({ name: 'AI', reply: 'ok', css: '.pg{background:#0b0b10;color:#eee}', sections: ['header', 'hero', 'features', 'footer'].map(kind => ({ kind, brief: kind })) }); }
    const n = +(all.match(/YOUR PART: section (\d+)/) || [])[1] || 1;
    return '```html\n<section class="p' + n + '"><h2>part ' + n + '</h2></section>\n```';
  };
  await ed.ask('сделай сайт об artifical intelenge'); await ed.idle(); await sleep(800);
  assert.ok(planned, 'the planner was asked for a page');
  const list = await ed.items();
  assert.equal(list.length, 2, 'the page is added next to the word');
  assert.ok(list.some(it => /part 4/.test(it.code)), 'all sections built');
});

// a hero with min-height:100vh used to grow with its own frame up to 5000 px; on the canvas vh = the page's screen height
scenario('canvas: 100vh means the screen height, not an endless frame', async (ed, o) => {
  o.reply = () => block('Hero', '<style>.vh{min-height:100vh;display:grid;place-items:center;background:#111}</style><section class="vh"><h1>Hero</h1></section>', { full: true });
  await ed.ask('a hero'); await ed.idle(); await sleep(800);
  const h = await ed.ev(`document.querySelector('.node iframe')?.offsetHeight || 0`);
  assert.ok(h >= 800 && h <= 1000, 'frame height ' + h);
});

// a big page is edited part by part: the model gets numbered blocks and sends only the changes (a full rewrite ran past the answer limit)
scenario('edit: a big page takes a patch — a new section in place, the rest untouched', async (ed, o) => {
  const filler = 'Real copy for the block. '.repeat(60);
  const sec = n => `<style>.s${n}{padding:40px 0}</style><section class="s${n} sec"><div class="wrap"><h2>Block ${n}</h2><p>${filler}</p></div></section>`;
  o.reply = () => block('AI site', `<style>.pg{background:#0b0b10;color:#eee}</style><div class="pg"><header class="s1"><b>AI</b></header>${[2, 3, 4].map(sec).join('\n')}<footer class="s5">© 2026</footer></div>`, { full: true });
  await ed.ask('a page'); await ed.idle();
  let asked = '';
  o.reply = body => { asked = JSON.stringify(JSON.parse(body).messages); return '{"action":"patch","name":"AI site","reply":"added charts"}\n```html\n<!-- after 3 -->\n<section class="ch sec"><h2>Charts block</h2></section>\n<!-- replace 4 -->\n<section class="s4 sec"><h2>Block four, new</h2></section>\n```'; };
  await ed.ask('add a section with charts after block 3'); await ed.idle(); await sleep(500);
  assert.match(asked, /<!-- part 3 -->/, 'the page went out with numbered parts');
  const list = await ed.items();
  assert.equal(list.length, 1, 'the page was edited, not duplicated');
  const code = list[0].code;
  assert.ok(code.indexOf('Block 3') < code.indexOf('Charts block') && code.indexOf('Charts block') < code.indexOf('Block four, new'), 'the new section sits after block 3');
  assert.ok(!/<h2>Block 4<\/h2>/.test(code) && /Block 2/.test(code) && /© 2026/.test(code), 'only the asked parts changed');
});

// free tiers on your own key answer "429 too many requests" to a burst of parallel agents: they queue, wait and retry
{
  const tries = {};
  scenario('swarm: agents that hit "too many requests" wait and still build the page', async (ed, o) => {
    o.reply = () => 'unused';
    await ed.ask('сделай сайт кофейни'); await ed.idle(); await ed.until(`!document.querySelector('.message.thinking:not(.folded)')`, 40000); await sleep(800);
    const list = await ed.items();
    assert.equal(list.length, 1, 'a page was built');
    assert.ok(/part 4/.test(list[0].code) && /part 1/.test(list[0].code), 'every section is there');
    assert.ok(Object.values(tries).some(n => n >= 3), 'agents were turned away and retried');
  }, { routes: [{ match: u => u.includes('api.groq.com') && u.includes('/chat/'), handle: rq => {
    const all = JSON.stringify(JSON.parse(rq.postData).messages);
    if (/lead designer of a team/.test(all)) return { body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ name: 'Cafe', reply: 'ok', css: '.pg{background:#111;color:#eee}', sections: ['header', 'hero', 'menu', 'footer'].map(kind => ({ kind, brief: kind })) }) }, finish_reason: 'stop' }] }) };
    const n = +(all.match(/YOUR PART: section (\d+)/) || [])[1] || 0;
    tries[n] = (tries[n] || 0) + 1;
    if (tries[n] <= 2) return { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached, too many requests' } }) };
    return { body: JSON.stringify({ choices: [{ message: { content: '```html\n<section class="p' + n + '"><h2>part ' + n + '</h2></section>\n```' }, finish_reason: 'stop' }] }) };
  } }] });
}

// the chat says what actually went wrong instead of only "could not apply"
scenario('errors: the real reason is shown under "could not apply"', async (ed) => {
  await ed.ask('a button'); await ed.until(`/right now/.test([...document.querySelectorAll('.message.assistant')].pop()?.textContent || '')`, 20000);
  const last = await ed.ev(`[...document.querySelectorAll('.message.assistant')].pop()?.textContent || ''`);
  assert.match(last, /Reason: Model is overloaded right now/);
}, { routes: [{ match: u => u.includes('api.groq.com') && u.includes('/chat/'), handle: () => ({ status: 400, body: JSON.stringify({ error: { message: 'Model is overloaded right now' } }) }) }] });

// "current AI models": the web is searched before writing and the planner + every agent get the fresh facts
{
  const seen = { planner: '', agent: '', searched: '' };
  scenario('web: a request about current AI models searches first and hands the facts to the swarm', async (ed) => {
    await ed.ask('сделай с нуля новый сайт похожий на llm leaderboard с текущими сильными моделями');
    await ed.until(`!document.querySelector('.message.thinking:not(.folded)')`, 40000); await sleep(800);
    assert.match(seen.searched, /leaderboard/i, 'searched the web');
    assert.match(seen.planner, /Claude Fable 5\.2/, 'the planner got the live model list');
    assert.match(seen.planner, /benchlm/i, 'the planner got the search results');
    assert.match(seen.agent, /FRESH FACTS/, 'the agents got the facts');
    assert.equal((await ed.items()).length, 1);
  }, { routes: [
    { match: u => u.includes('openrouter.ai/api/v1/models'), handle: () => ({ body: JSON.stringify({ data: [{ id: 'anthropic/claude-fable-5.2', name: 'Anthropic: Claude Fable 5.2', created: 1794700000 }] }) }) },
    { match: u => u.includes('/api/web'), handle: rq => { seen.searched += decodeURIComponent(rq.url) + ' '; return { body: JSON.stringify({ results: [{ title: 'LLM Leaderboard Nov 2026', url: 'https://benchlm.ai/', snippet: 'Claude Fable 5.2 leads' }], pages: [] }) }; } },
    { match: u => u.includes('api.groq.com') && u.includes('/chat/'), handle: rq => {
      const all = JSON.stringify(JSON.parse(rq.postData).messages);
      const say = content => ({ body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
      if (/You write web search queries/.test(all)) return say('["LLM leaderboard November 2026"]');
      if (/lead designer of a team/.test(all)) { seen.planner = all; return say(JSON.stringify({ name: 'Board', reply: 'ok', css: '.pg{background:#111;color:#eee}', sections: ['header', 'hero', 'table', 'footer'].map(kind => ({ kind, brief: kind })) })); }
      seen.agent = all; const n = +(all.match(/YOUR PART: section (\d+)/) || [])[1] || 1;
      return say('```html\n<section class="p' + n + '"><h2>part ' + n + '</h2></section>\n```');
    } },
  ] });
}

// art direction: the planner picks one, every agent gets its rules, the hero agent also the hand-made example
{
  const got = { planner: '', hero: '', other: '' };
  scenario('swarm: the art direction reaches every agent, the hero gets its example', async (ed) => {
    await ed.ask('сделай сайт архитектурного бюро'); await ed.until(`!document.querySelector('.message.thinking:not(.folded)')`, 40000); await sleep(800);
    assert.match(got.planner, /giant wordmark — the brand name/, 'the planner sees the directions');
    assert.match(got.hero, /ART DIRECTION — .{0,2}wordmark[\s\S]*EXAMPLE HERO/, 'the hero agent gets the rules and the example');
    assert.match(got.other, /ART DIRECTION — .{0,2}wordmark/); assert.doesNotMatch(got.other, /EXAMPLE HERO/);
    assert.match((await ed.items())[0].code, /--condensed/, 'the display fonts are in the page CSS');
  }, { routes: [{ match: u => u.includes('api.groq.com') && u.includes('/chat/'), handle: rq => {
    const all = JSON.stringify(JSON.parse(rq.postData).messages);
    const say = content => ({ body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
    if (/lead designer of a team/.test(all)) { got.planner = all; return say(JSON.stringify({ name: 'Norda', reply: 'ok', system: 'studio', direction: 'wordmark', sections: ['header', 'hero', 'works', 'footer'].map(kind => ({ kind, brief: kind })) })); }
    const n = +(all.match(/YOUR PART: section (\d+)/) || [])[1] || 1;
    if (/— hero:/.test(all)) got.hero = all; else if (/— works:/.test(all)) got.other = all;
    return say('```html\n<section class="s' + n + '"><h2>part ' + n + '</h2></section>\n```');
  } }] });
}

// switches the AI makes have to switch: CSS-only tabs (no scripts on these pages), the CSS is added by the studio
scenario('interactive: AI tabs switch in play mode without any JavaScript', async (ed, o) => {
  o.reply = () => block('Board', '<section style="padding:40px;background:#111;color:#eee"><div class="oc-tabs"><input type="radio" name="lb" id="lb-1" checked><label for="lb-1">All tasks</label><input type="radio" name="lb" id="lb-2"><label for="lb-2">Code</label><div class="oc-panels"><div><p>Overall ranking</p></div><div><p>Coding ranking</p></div></div></div><details class="oc-acc"><summary>How is it scored?</summary><p>Elo from blind votes.</p></details></section>', { full: true });
  await ed.ask('a leaderboard with filter tabs'); await ed.idle(); await sleep(1200);
  assert.match((await ed.items())[0].code, /\.oc-tabs>input/, 'the tab CSS was added');
  await ed.ev(`(document.getElementById('playToggle').click(), 1)`); await sleep(300);
  const shown = () => ed.ev(`(() => { const d = document.querySelector('.node iframe').contentDocument; return [...d.querySelectorAll('.oc-panels > div')].map(p => getComputedStyle(p).display); })()`);
  assert.deepEqual(await shown(), ['block', 'none'], 'the first tab is open');
  await ed.ev(`(document.querySelector('.node iframe').contentDocument.querySelector('label[for=lb-2]').click(), 1)`); await sleep(200);
  assert.deepEqual(await shown(), ['none', 'block'], 'clicking "Code" switches the panel');
  assert.equal(await ed.ev(`document.querySelector('.canvas').classList.contains('playing') && getComputedStyle(document.querySelector('.node iframe')).pointerEvents`), 'auto', 'clicks reach the page in play mode');
});

// icons and logos: icon:NAME and logo:BRAND become real inline SVG (no empty boxes)
scenario('icons: icon: and logo: pictures become inline SVG icons and company logos', async (ed, o) => {
  o.reply = () => block('Ranking', '<section style="padding:40px;background:#fff;color:#111"><div><img src="icon:trophy" width="20" alt=""> <img src="logo:anthropic" width="28" alt="Anthropic"> Claude</div><div><img src="logo:deepseek" alt="DeepSeek"> <img src="logo:stripe" alt="Stripe"> <img src="logo:Qqqx Labs" alt="Q"></div></section>', { full: true });
  await ed.ask('a ranking with logos'); await ed.idle(); await sleep(1500);
  const code = (await ed.items())[0].code;
  assert.doesNotMatch(code, /src="(icon|logo):/, 'every token resolved');
  assert.ok((code.match(/<svg\b/g) || []).length >= 5, 'five svgs');
  assert.match(code, /aria-label="Stripe"/);
  assert.match(code, />QL<\/text>/, 'monogram for an unknown brand');
});

// the stop button: the composer's send square turns into "stop" while the AI works and cancels the answer
scenario('stop: the stop button cancels the answer and leaves the canvas as it was', async (ed) => {
  await ed.ask('a pricing card'); await sleep(1200);
  assert.ok(await ed.ev(`!!document.querySelector('#react-composer .oc-stop')`), 'the send button turned into stop');
  await ed.ev(`(document.querySelector('#react-composer .oc-stop').parentElement.click(), 1)`);
  assert.ok(await ed.until(`/Stopped/.test([...document.querySelectorAll('.message.assistant')].pop()?.textContent || '')`, 8000), 'the chat says it stopped');
  assert.equal((await ed.items()).length, 0, 'nothing was added');
  assert.ok(await ed.until(`!document.querySelector('#react-composer .oc-stop')`, 3000), 'the send button is back');
}, { routes: [{ match: u => u.includes('api.groq.com') && u.includes('/chat/'), handle: () => new Promise(r => setTimeout(() => r({ body: JSON.stringify({ choices: [{ message: { content: block('Late', '<div>late</div>') }, finish_reason: 'stop' }] }) }), 8000)) }] });

// eyes: overlapping parts on the rendered page are found and sent back to the model once
scenario('layout: overlapping parts are seen on the canvas and fixed automatically', async (ed, o) => {
  const broken = '<section style="position:relative;padding:40px;background:#fff;color:#111;height:260px"><div style="position:relative"><select class="dev" style="width:400px;height:44px"><option>All models</option></select><label class="chk" style="position:absolute;left:10px;top:12px"><input type="checkbox" checked> Google</label></div><table style="margin-top:20px;width:600px"><tr><td>Gemini 4 Hydrogen</td><td>1049K</td></tr></table><svg class="chart" width="600" height="120" style="position:absolute;left:40px;top:100px" viewBox="0 0 600 120"><polyline points="0,100 200,40 400,60 600,10" fill="none" stroke="#36f"/><circle cx="200" cy="40" r="4"/><circle cx="400" cy="60" r="4"/></svg></section>';
  const fixed = '<section style="padding:40px;background:#fff;color:#111"><label class="chk"><input type="checkbox" checked> Google</label><select class="dev" style="display:block;margin-top:12px;width:400px;height:44px"><option>All models</option></select><svg class="chart" width="600" height="120" viewBox="0 0 600 120" style="display:block;margin-top:20px"><polyline points="0,100 200,40 400,60 600,10" fill="none" stroke="#36f"/><circle cx="200" cy="40" r="4"/><circle cx="400" cy="60" r="4"/></svg><table style="margin-top:20px;width:600px"><tr><td>Gemini 4 Hydrogen</td><td>1049K</td></tr></table></section>';
  let n = 0, asked = ''; const require_log = (k, b) => { const m = JSON.parse(b).messages; (globalThis.__calls ||= []).push(k + ' :: ' + m[0].content.slice(0, 60) + ' :: ' + m.at(-1).content.slice(-120)); };
  o.reply = body => { n++; require_log(n, body); if (n === 1) return block('Board', broken, { full: true }); asked = JSON.stringify(JSON.parse(body).messages); return block('Board', fixed, { full: true, action: 'update' }); };
  await ed.ask('a model board'); await ed.idle();
  assert.ok(await ed.until(`[...document.querySelectorAll('.message.user')].some(m => /overlapping/i.test(m.textContent))`, 15000), 'the automatic fix was asked');
  await ed.until(`!document.querySelector('.message.thinking:not(.folded)')`, 15000); await sleep(2500);
  assert.match(asked, /LAYOUT BUGS/); assert.match(asked, /label\.chk[^"]*Google[^"]*overlaps|overlaps[^"]*label\.chk/, 'names the label');
  assert.match(asked, /chart \/ drawing/, 'names the chart');
  const list = await ed.items();
  assert.equal(list.length, 1); assert.doesNotMatch(list[0].code, /position:absolute/, 'the fixed version is on the canvas');
  assert.equal(n, 2, 'exactly one automatic round: ' + JSON.stringify(globalThis.__calls));
});
