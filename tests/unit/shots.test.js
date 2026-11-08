// Page pictures keyed by the page's content hash (worker.js /api/shot, /api/og)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map(), meta = new Map();
const SYNC = {
  get: async (k, type) => store.has(k) ? (type === 'arrayBuffer' ? store.get(k).buffer : store.get(k)) : null,
  getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: meta.get(k) ?? null }),
  put: async (k, v, o) => { store.set(k, v); meta.set(k, o?.metadata); },
  delete: async k => { store.delete(k); meta.delete(k); },
};
let uid = 'u1';
globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => true } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: uid }), { status: 200 });
  if (u.includes('/rest/v1/pages')) return new Response(JSON.stringify([{ owner: uid }]), { status: 200 });
  return realFetch(url);
};
const { default: worker } = await import('../../worker.js');
const env = { SYNC, SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon' };
const ctx = { waitUntil() {} };
const call = (path, init) => worker.fetch(new Request('https://openconstructor.pw' + path, init), env, ctx);
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3])], { type: 'image/jpeg' });

test('pictures carry the page hash: HEAD/ETag, 304, immutable hashed address, old address redirects', async () => {
  const form = new FormData();
  form.append('og', jpeg(), 'og.jpg'); form.append('full', jpeg(), 'full.jpg'); form.append('hash', '0123456789abcdef');
  const put = await call('/api/shot/my-page', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: form });
  assert.equal(put.status, 200);
  assert.equal(store.get('shothash:my-page'), '0123456789abcdef');

  const head = await call('/api/shot/my-page', { method: 'HEAD' });
  assert.equal(head.headers.get('ETag'), '"0123456789abcdef"');

  const same = await call('/api/shot/my-page', { headers: { 'If-None-Match': '"0123456789abcdef"' } });
  assert.equal(same.status, 304);

  const pinned = await call('/api/og/my-page/0123456789abcdef');
  assert.equal(pinned.status, 200);
  assert.match(pinned.headers.get('Cache-Control'), /immutable/);

  const old = await call('/api/og/my-page/ffffffffffffffff');
  assert.equal(old.status, 302);
  assert.equal(old.headers.get('Location'), 'https://openconstructor.pw/api/og/my-page/0123456789abcdef');
});

test('pictures are stored by content: a page with the same HTML reuses them, only within the account', async () => {
  const link = () => { const f = new FormData(); f.append('hash', '0123456789abcdef'); return f; };
  const reuse = await call('/api/shot/renamed-page', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: link() });
  assert.equal(reuse.status, 200);
  assert.equal((await reuse.json()).reused, true);
  const pic = await call('/api/shot/renamed-page/0123456789abcdef');
  assert.equal(pic.status, 200);
  assert.deepEqual([...new Uint8Array(await pic.arrayBuffer())], [0xff, 0xd8, 1, 2, 3]);
  // unknown hash: the editor has to make the pictures
  const none = new FormData(); none.append('hash', 'aaaaaaaaaaaaaaaa');
  assert.equal((await call('/api/shot/renamed-page', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: none })).status, 404);
  // another account can't borrow them
  uid = 'u2';
  assert.equal((await call('/api/shot/other-page', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: link() })).status, 404);
  uid = 'u1';
});
