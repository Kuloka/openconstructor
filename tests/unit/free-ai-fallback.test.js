// The free AI keeps answering when one upstream is gone: a 404 (retired model) falls through to the next backend
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => true } };
const hits = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); hits.push(u);
  if (u.includes('generativelanguage.googleapis.com')) return new Response('{"error":{"message":"model not found"}}', { status: 404 });
  if (u.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }), { status: 200 });
  return new Response('{}', { status: 200 });
};
const { default: worker } = await import('../../worker.js');
const kv = new Map();
const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'a', SYNC: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) } };

test('a 404 from the first backend does not take the free AI down', async () => {
  const r = await worker.fetch(new Request('https://openconstructor.pw/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'say ok' }], max_tokens: 20 }) }), env, { waitUntil() {} });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.choices[0].message.content, 'ok');
  assert.ok(hits.some(u => u.includes('generativelanguage')), 'Gemini was tried first');
  assert.ok(hits.some(u => u.includes('api.groq.com')), 'then the next backend answered');
});
