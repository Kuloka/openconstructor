// App data API (worker.js /api/db/<slug>): validation, limits, CORS, private records, and the oc.db door in the CSP
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLRewriter ??= class { on(){ return this; } transform(r){ return r; } }; // Cloudflare-only; forms rewriting is not under test here
const cached = new Set();
globalThis.caches = { default: { match: async r => cached.has(r.url) ? new Response('1') : null, put: async r => { cached.add(r.url); }, delete: async () => true } };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), body = init.body ? JSON.parse(init.body) : null;
  calls.push({ u, body });
  if (u.endsWith('/rpc/db_add')) return body.p_slug === 'gone-page' ? new Response('{"message":"page not found"}', { status: 400 }) : new Response(JSON.stringify({ id: 1, data: body.p_private ? {} : body.p_data, created_at: '2026-11-24T00:00:00Z' }), { status: 200 });
  if (u.endsWith('/rpc/db_list')) return new Response(JSON.stringify([{ id: 1, data: { name: 'Ann', score: 9 }, created_at: '2026-11-24T00:00:00Z' }]), { status: 200 });
  if (u.includes('/rest/v1/pages?')) return new Response(JSON.stringify([{ html: '<!doctype html><html><head><meta name="oc-app" content="1"></head><body><script>1</script></body></html>', title: 'T', paused: false }]), { status: 200 });
  return new Response('[]', { status: 200 });
};
const { default: worker } = await import('../../worker.js');
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon' };
let n = 0;
const call = (path, init = {}) => worker.fetch(new Request('https://openconstructor.pw' + path, { ...init, headers: { 'cf-connecting-ip': 'ip' + n++, ...(init.headers || {}) } }), env, { waitUntil() {} });
const post = (slug, body, ip) => call('/api/db/' + slug, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain', ...(ip ? { 'cf-connecting-ip': ip } : {}) } });

test('a record is saved through db_add and comes back; any origin may call (CORS)', async () => {
  const r = await post('my-page', { c: 'Scores', data: { name: 'Ann', score: 9 } });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual((await r.json()).row.data, { name: 'Ann', score: 9 });
  const c = calls.findLast(x => x.u.endsWith('/rpc/db_add'));
  assert.deepEqual(c.body, { p_slug: 'my-page', p_col: 'scores', p_data: { name: 'Ann', score: 9 }, p_private: false });
});

test('private records are stored as private and their data is not echoed back', async () => {
  const r = await post('my-page', { c: 'orders', data: { email: 'a@b.c' }, private: true });
  assert.deepEqual((await r.json()).row.data, {});
  assert.equal(calls.findLast(x => x.u.endsWith('/rpc/db_add')).body.p_private, true);
});

test('list asks db_list with a clamped limit', async () => {
  const r = await call('/api/db/my-page?c=scores&limit=9999');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).rows[0].data.name, 'Ann');
  assert.equal(calls.findLast(x => x.u.endsWith('/rpc/db_list')).body.p_limit, 200);
});

test('bad input is refused before the database', async () => {
  const before = calls.length;
  assert.equal((await post('my-page', { c: 'no spaces', data: {} })).status, 400);
  assert.equal((await post('my-page', { c: 'x', data: [1, 2] })).status, 400);
  assert.equal((await post('my-page', { c: 'x', data: { big: 'y'.repeat(8000) } })).status, 413);
  assert.equal((await post('BAD SLUG', { c: 'x', data: {} })).status, 404);
  assert.equal((await call('/api/db/my-page?c=../etc')).status, 400);
  assert.equal(calls.filter(x => x.u.includes('/rpc/')).length, calls.slice(0, before).filter(x => x.u.includes('/rpc/')).length);
});

test('one write per second per visitor and page; unknown pages are 404', async () => {
  assert.equal((await post('my-page', { c: 'x', data: { a: 1 } }, 'same-ip')).status, 201);
  assert.equal((await post('my-page', { c: 'x', data: { a: 2 } }, 'same-ip')).status, 429);
  assert.equal((await post('gone-page', { c: 'x', data: { a: 1 } })).status, 404);
});

test('preflight is answered', async () => {
  const r = await call('/api/db/my-page', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
});

test('a published app page gets its address for oc.db and network only to /api/db/', async () => {
  const r = await call('/p/my-page');
  assert.match(await r.text(), /<meta name="oc-slug" content="my-page">/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /connect-src https:\/\/openconstructor\.pw\/api\/db\/;/);
  assert.doesNotMatch(csp, /connect-src \*/);
});
