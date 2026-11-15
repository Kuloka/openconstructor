// Model lists (providers.js listModels): a /models endpoint that refuses the key in the browser, LLM7's free/paid tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listModels, byId } from '../../providers.js';

const LLM7 = { data: [
  { id: 'DeepSeek-V4-Flash-0731', tier: 'turbo', usage_based_only: false, pricing: { input: 0.02, output: 0.04 }, context_window: { tokens: 400000 } },
  { id: 'claude-haiku-4-5', tier: 'pro', usage_based_only: true, pricing: { input: 0.04, output: 0.2 }, context_window: { tokens: 200000 } },
] };

test('LLM7 without a key: only the free turbo models, marked free, context read', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => LLM7 });
  const list = await listModels(byId('llm7'), '');
  assert.deepEqual(list.map(m => [m.id, m.paid, m.ctx]), [['DeepSeek-V4-Flash-0731', false, 400000]]);
});

test('LLM7 with a key: CORS refuses the key on /models → asked again without it; pro models listed as paid with prices', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push(!!opts.headers?.Authorization); if (opts.headers?.Authorization) throw new TypeError('Failed to fetch'); return { ok: true, json: async () => LLM7 }; };
  const list = await listModels(byId('llm7'), 'k+e/y=');
  assert.deepEqual(calls, [true, false]);
  const pro = list.find(m => m.id === 'claude-haiku-4-5');
  assert.equal(pro.paid, true); assert.deepEqual(pro.price, [0.04, 0.2]);
  assert.equal(list.find(m => m.id === 'DeepSeek-V4-Flash-0731').paid, false);
});
