// Fresh facts before the AI writes (web-facts.js): which requests search, the live AI model list, query parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsWeb, aiModelsFacts, parseQueries, resultsNote, keywordQuery } from '../../web-facts.js';
import { parseAnswer } from '../../ai-parse.js';

test('needsWeb: current things and AI models search, ordinary pages do not', () => {
  assert.ok(needsWeb('сайт похожий на llm leaderboard с текущими сильными моделями'));
  assert.ok(needsWeb('latest iPhone prices'));
  assert.ok(needsWeb('новости крипты сегодня'));
  assert.ok(!needsWeb('сделай сайт кофейни с меню'));
  assert.ok(!needsWeb('make the button bigger'));
});

test('aiModelsFacts: newest models per company with dates, no :free duplicates', async () => {
  const data = [
    { id: 'anthropic/claude-fable-5.2', name: 'Anthropic: Claude Fable 5.2', created: 1794700000, context_length: 1000000, pricing: { prompt: '0.000003', completion: '0.000015' } },
    { id: 'anthropic/claude-fable-5.2:batch', name: 'dup', created: 1794700001 },
    { id: 'google/gemini-4-carbon', name: 'Google: Gemini 4 Carbon', created: 1794300000, context_length: 2000000 },
    { id: 'someone/tiny-1b:free', name: 'tiny', created: 1794800000 },
  ];
  const text = await aiModelsFacts(async () => ({ ok: true, json: async () => ({ data }) }));
  assert.match(text, /Claude Fable 5\.2 \(anthropic\/claude-fable-5\.2\) — released 2026-11-/);
  assert.match(text, /\$3 \/ \$15 per 1M/);
  assert.match(text, /Gemini 4 Carbon/);
  assert.doesNotMatch(text, /dup|tiny/);
});

test('parseQueries and resultsNote', () => {
  assert.deepEqual(parseQueries('<think>hm</think>["LLM leaderboard November 2026", "best AI models 2026", "x"]', 'q'), ['LLM leaderboard November 2026', 'best AI models 2026']);
  assert.deepEqual(parseQueries('no json here', 'the request'), [keywordQuery('the request')]);
  assert.match(resultsNote('q', { results: [{ title: 'T', url: 'https://a.b', snippet: 'S' }], pages: [] }), /1\. T — https:\/\/a\.b\n {3}S/);
});

test('a chat answer wrapped in a second JSON object shows only its text', () => {
  assert.equal(parseAnswer('{"action":"reply"}\n{"reply":"Привет! 👋"}').reply, 'Привет! 👋');
  assert.equal(parseAnswer('{"action":"reply"}\nобычный текст').reply, 'обычный текст');
});

test('keywordQuery: the topic of the request, not the whole sentence', () => {
  const nov = new Date(2026, 10, 16);
  assert.equal(keywordQuery('создай сайт про AI Llm leaderboard с графиками линейными и стрелочными', nov), 'AI Llm leaderboard November 2026');
  assert.equal(keywordQuery('make a landing page about the best coffee in Paris', nov), 'best coffee Paris November 2026');
});
