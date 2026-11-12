// The terminal version (cli/bin.mjs) against a fake OpenAI-compatible AI:
// it writes the three files, serves them with the error reporter, and an error from the browser
// is sent back to the AI on its own (auto-fix), with the failing line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BROKEN = `{"name":"Counter","reply":"A click counter."}
\`\`\`html
<style>
.ct{padding:20px}
</style>
<div class="ct"><b class="ct-n">0</b><button class="ct-b">+1</button></div>
<script>
(() => {
  const root = document.querySelector('.ct');
  root.querySelector('.nope').textContent = '1';
})();
</script>
\`\`\``;
const FIXED = BROKEN.replace(".nope').textContent = '1'", ".ct-n').textContent = '0'").replace('A click counter.', 'Fixed the selector.');

test('cli: builds the app into files, then fixes a browser error by itself', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-cli-'));
  const posts = [];
  const ai = http.createServer((req, res) => {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      posts.push(JSON.parse(body));
      const text = posts.length === 1 ? BROKEN : FIXED;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < text.length; i += 40) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 40) } }] }) + '\n\n');
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise(r => ai.listen(0, '127.0.0.1', r));
  const port = 4900 + Math.floor(Math.random() * 400);
  const cli = spawn(process.execPath, [path.resolve('cli/bin.mjs'), dir, '-p', 'a click counter', '--no-open', '--port', String(port)], {
    env: { ...process.env, OC_API_KEY: 'test', OC_BASE_URL: `http://127.0.0.1:${ai.address().port}/v1`, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let log = ''; cli.stdout.on('data', d => log += d); cli.stderr.on('data', d => log += d);
  try {
    for (let i = 0; i < 50 && !fs.existsSync(path.join(dir, 'app.js')); i++) await sleep(100);
    assert.match(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), /\.nope/);
    assert.match(fs.readFileSync(path.join(dir, 'style.css'), 'utf8'), /\.ct\{padding:20px\}/);
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(page, /<title>Counter<\/title>/);
    assert.match(page, /__oc\/log/, 'error reporter injected into the served page');
    assert.ok(!fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes('__oc/log'), 'but not into the file on disk');
    // the files can't be read outside the folder
    assert.equal((await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc/passwd`)).status, 403);
    // what the browser sends when the script fails on line 3 of app.js
    await fetch(`http://127.0.0.1:${port}/__oc/log`, { method: 'POST', body: JSON.stringify({ t: 'error', m: "Cannot set properties of null (setting 'textContent')", f: 'app.js', l: 3 }) });
    for (let i = 0; i < 50 && !/\.ct-n'\)\.textContent = '0'/.test(fs.readFileSync(path.join(dir, 'app.js'), 'utf8')); i++) await sleep(100);
    assert.equal(posts.length, 2, 'the fix went to the AI without a command');
    const fixMsg = posts[1].messages.at(-1).content;
    assert.match(fixMsg, /has a bug while it runs/);
    assert.match(fixMsg, /app\.js, line 3: root\.querySelector\('\.nope'\)/);
    assert.match(log, /Fixed the selector/);
    // the version before the fix is kept for /undo
    assert.equal(fs.readdirSync(path.join(dir, '.openconstructor', 'history')).length, 1);
  } finally {
    cli.kill(); ai.close(); await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
