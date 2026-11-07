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
const scenario = (name, fn) => test(name, { skip: !!only && !name.includes(only) }, async () => {
  const opts = {};
  const ed = await editor(URL_, { reply: p => opts.reply(p), lang: 'en' });
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
