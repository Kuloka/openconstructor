// The MCP server (cli/mcp.mjs): JSON-RPC handshake, catalog search, page editing, media tokens and exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _test as mcp } from '../../cli/mcp.mjs';

const out = [];
const write = process.stdout.write.bind(process.stdout);
async function rpc(method, params = {}){
  out.length = 0;
  process.stdout.write = s => { out.push(String(s)); return true; };
  try { await mcp.handle({ jsonrpc: '2.0', id: 1, method, params }); } finally { process.stdout.write = write; }
  return JSON.parse(out.join('')).result;
}
const call = (name, args = {}) => rpc('tools/call', { name, arguments: args });

test('handshake and tool list', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.equal(init.serverInfo.name, 'openconstructor');
  const { tools } = await rpc('tools/list');
  for (const t of ['search_components', 'get_component', 'page_add_section', 'screenshot', 'export']) assert.ok(tools.some(x => x.name === t), t);
});

test('catalog search finds sections by words', () => {
  const r = mcp.search({ query: 'pricing', kind: 'section', limit: 5 });
  assert.ok(r.length > 0 && r.every(x => x.kind === 'section'));
  assert.ok(r.some(x => /pric/i.test(x.name)));
});

test('build a page, move, remove, export', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-'));
  mcp.setDir(dir);
  await call('page_new', { name: 'Test page', background: '#ffffff' });
  const hero = mcp.search({ query: 'hero', kind: 'section', limit: 1 })[0].id;
  const a = await call('page_add_section', { component_id: hero });
  assert.ok(!a.isError);
  await call('page_add_section', { html: '<div class="t3"><img src="model:torus glass #7b6cf6" width="200"><img src="photo:mountains"></div>', name: 'Media', position: 0 });
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<canvas data-oc-model="torus glass #7b6cf6"/);
  assert.match(html, /oc3d\.js/);
  assert.match(html, /api\/photo\?q=mountains/);
  assert.match(html, /color:#18181b/); // light page → dark text
  const page = (await call('page_get')).structuredContent;
  assert.deepEqual(page.sections.map(s => s.name), ['Media', page.sections[1].name]);
  await call('page_move_section', { id: page.sections[0].id, position: 5 });
  assert.equal((await call('page_get')).structuredContent.sections[1].name, 'Media');
  const bad = await call('page_remove_section', { id: 'nope' });
  assert.equal(bad.isError, true);
  for (const format of ['react', 'vue', 'svelte']) {
    const r = await call('export', { format });
    assert.ok(fs.existsSync(r.structuredContent.file), format);
  }
  assert.match(fs.readFileSync(path.join(dir, 'page.jsx'), 'utf8'), /export default function TestPage\(\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});
