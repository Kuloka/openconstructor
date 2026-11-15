// Fresh facts for the AI before it writes (studio.js runAI → buildSwarm and the single answer).
// Models remember an old world (GPT-4o, Claude 3.7…): requests about anything current get a web search up front,
// and requests about AI models also get the live model list from OpenRouter (names, release dates, context, prices).

// asks about something that changes: news, "latest", ratings, prices, a year, AI models…
export const NEEDS_WEB = /текущ|актуальн|последн|новейш|свеж|сейчас|сегодня|нынешн|в этом году|новост|рейтинг|лидерборд|топ[- ]?\d|курс|погод|20(2[5-9]|3\d)|latest|current|newest|recent|today|this year|news|ranking|leaderboard|top \d|price of|weather|state of the art|sota/i;
export const AI_TOPIC = /\bllm|нейросет|языков\w* модел|модел\w* (ии|ai)|(ии|ai)[- ]модел|\bai models?\b|chatbot|чат-?бот|gpt|claude|gemini|openai|anthropic|deepseek|qwen|mistral|grok|leaderboard|лидерборд|benchmark|бенчмарк/i;
export const needsWeb = text => NEEDS_WEB.test(text) || AI_TOPIC.test(text);

// big labs first; one family per vendor shows its newest few models
const VENDORS = ['openai', 'anthropic', 'google', 'x-ai', 'meta', 'meta-llama', 'deepseek', 'qwen', 'mistralai', 'moonshotai', 'z-ai', 'minimax', 'amazon', 'cohere', 'nvidia', 'xiaomi', 'baidu', 'tencent'];
let modelsCache = null;
export async function aiModelsFacts(fetchFn = fetch){
  if (modelsCache) return modelsCache;
  const r = await fetchFn('https://openrouter.ai/api/v1/models'); if (!r.ok) throw Error('HTTP ' + r.status);
  const all = (await r.json()).data || [];
  const fresh = all.filter(m => !/:(free|batch|beta|extended|thinking|online)$/.test(m.id) && !/^openrouter\//.test(m.id) && m.created).sort((a, b) => b.created - a.created);
  const lines = [];
  for (const v of VENDORS) {
    const mine = fresh.filter(m => m.id.startsWith(v + '/')).slice(0, 4);
    for (const m of mine) {
      const p = m.pricing ? [+m.pricing.prompt * 1e6, +m.pricing.completion * 1e6] : null;
      lines.push(`- ${m.name} (${m.id}) — released ${new Date(m.created * 1000).toISOString().slice(0, 10)}${m.context_length ? `, ${Math.round(m.context_length / 1000)}K context` : ''}${p && p[0] >= 0 ? `, $${+p[0].toFixed(2)} / $${+p[1].toFixed(2)} per 1M tokens in/out` : ''}`);
    }
  }
  modelsCache = lines.length ? `Current AI models (live list from OpenRouter, newest first per company — these are today's real model names; anything older you remember is outdated):\n${lines.join('\n')}` : '';
  return modelsCache;
}

// one search answer from /api/web → a block of text for the prompt
export const resultsNote = (q, d) => `Web results for "${q}" (searched ${new Date().toISOString().slice(0, 10)}):\n` + ((d.results || []).slice(0, 6).map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.snippet}`).join('\n') || 'nothing found') + (d.pages || []).map(pg => `\n\nPage ${pg.url}${pg.title ? ' — ' + pg.title : ''}:\n${pg.text}`).join('');

// the queries: the model writes them (it knows what to look for); the request itself when that fails
export function parseQueries(text, fallback){
  const raw = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const m = raw.match(/\[[\s\S]*?\]/);
  try { const list = JSON.parse(m[0]).map(s => String(s).trim()).filter(s => s.length > 2).slice(0, 2); if (list.length) return list; } catch {}
  return [String(fallback).slice(0, 150)];
}
export const QUERY_PROMPT = `You write web search queries. Reply with ONLY a JSON array of 1–2 short English search queries (3–8 words) that find today's facts the request needs — include the month and year when freshness matters. Today is ${new Date().toISOString().slice(0, 10)}.`;
