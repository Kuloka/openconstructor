// /api/relay/<id>/… (worker.js relay): AI services without CORS are reached through the worker.
// Only listed services and two paths, only from the editor's own origin; the key passes through, cookies don't come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker.js';
import { PROVIDERS } from '../../providers.js';
import { readFileSync } from 'node:fs';

const call = (path, init = {}) => worker.fetch(new Request('https://openconstructor.pw' + path, init), {}, { waitUntil(){} });

test('relay: forwards the key and the body, streams the answer back without the service cookies', async () => {
  const real = globalThis.fetch; let seen = null;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; return new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'sid=1', 'Retry-After': '3' } }); };
  try {
    const r = await call('/api/relay/kilo/chat/completions', { method: 'POST', headers: { Origin: 'https://openconstructor.pw', Authorization: 'Bearer sk-test-12345678', 'Content-Type': 'application/json', Cookie: 'oc=secret' }, body: '{"model":"x"}' });
    assert.equal(r.status, 200);
    assert.equal(seen.url, 'https://api.kilo.ai/api/gateway/chat/completions');
    assert.equal(seen.init.headers.Authorization, 'Bearer sk-test-12345678');
    assert.equal(seen.init.headers.Cookie, undefined, 'our cookies never leave');
    assert.equal(seen.init.body, '{"model":"x"}');
    assert.equal(r.headers.get('Set-Cookie'), null);
    assert.equal(r.headers.get('Retry-After'), '3');
    assert.match(await r.text(), /"hi"/);
  } finally { globalThis.fetch = real; }
});

test('relay: other sites, unknown services, other paths and wrong methods are refused', async () => {
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  try {
    assert.equal((await call('/api/relay/kilo/chat/completions', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal((await call('/api/relay/nope/models')).status, 404);
    assert.equal((await call('/api/relay/kilo/files')).status, 404);
    assert.equal((await call('/api/relay/kilo/models', { method: 'POST', body: '{}' })).status, 405);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = real; }
});

test('every relay provider has a worker route, and every listed service has an http base', () => {
  const src = readFileSync(new URL('../../worker.js', import.meta.url), 'utf8');
  for (const p of PROVIDERS.filter(p => p.relay)) {
    assert.equal(p.base, '/api/relay/' + p.id, p.id);
    assert.match(src, new RegExp(`^  ${p.id}: 'https://`, 'm'), p.id + ' is missing in RELAY');
  }
  const ids = PROVIDERS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const p of PROVIDERS.filter(p => p.kind !== 'proxy' && !p.relay)) assert.match(p.base, /^https:\/\//, p.id);
});
