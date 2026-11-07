// AI providers. All are CORS-checked: requests go straight from the browser with the user's key.
// Once there is a server, this same module will be called through a proxy (keys will move to the server).
export const PROVIDERS = [
  { id: 'oc', name: 'openconstructor AI', logo: '', base: '/api', free: true, keyUrl: '', hint: '', note: 'no key needed — 20 free generations a day when signed in', kind: 'proxy', publicModels: true },
  { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter', base: 'https://openrouter.ai/api/v1', free: true, keyUrl: 'https://openrouter.ai/keys', hint: 'sk-or-…', note: '300+ models in one key: Claude, GPT, Gemini and more — a dozen at no cost (Gemma 4, Nemotron), GPT-OSS from $0.02/M', publicModels: true },
  { id: 'gemini', name: 'Google Gemini', logo: 'gemini-color', base: 'https://generativelanguage.googleapis.com/v1beta/openai', free: true, keyUrl: 'https://aistudio.google.com/apikey', hint: 'AIza…', note: 'no-cost tier with Flash models, strong at layout', prefer: ['gemini-2.5-flash', 'gemini-flash-latest'] },
  { id: 'groq', name: 'Groq', logo: 'groq', base: 'https://api.groq.com/openai/v1', free: true, keyUrl: 'https://console.groq.com/keys', hint: 'gsk_…', note: 'no-cost plan with GPT-OSS 120B and Llama, very fast (about 1K requests a day)', prefer: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] },
  { id: 'cerebras', name: 'Cerebras', logo: 'cerebras-color', base: 'https://api.cerebras.ai/v1', free: true, keyUrl: 'https://cloud.cerebras.ai', hint: 'csk-…', note: 'fastest GPT-OSS; $5 trial credit (card required), then pay as you go', prefer: ['gpt-oss-120b'] },
  { id: 'mistral', name: 'Mistral', logo: 'mistral-color', base: 'https://api.mistral.ai/v1', free: true, keyUrl: 'https://console.mistral.ai/api-keys', hint: '', note: 'free tier for experimentation' },
  { id: 'deepseek', name: 'DeepSeek', logo: 'deepseek-color', base: 'https://api.deepseek.com', free: false, keyUrl: 'https://platform.deepseek.com/api_keys', hint: 'sk-…', note: 'very low cost, strong at code' },
  { id: 'openai', name: 'OpenAI', logo: 'openai', base: 'https://api.openai.com/v1', free: false, keyUrl: 'https://platform.openai.com/api-keys', hint: 'sk-…', note: 'GPT models' },
  { id: 'anthropic', name: 'Anthropic', logo: 'claude-color', base: 'https://api.anthropic.com/v1', free: false, keyUrl: 'https://console.anthropic.com/settings/keys', hint: 'sk-ant-…', note: 'Claude, the strongest at layout', kind: 'anthropic' },
  { id: 'xai', name: 'xAI', logo: 'xai', base: 'https://api.x.ai/v1', free: false, keyUrl: 'https://console.x.ai', hint: 'xai-…', note: 'Grok models' },
  { id: 'together', name: 'Together AI', logo: 'together-color', base: 'https://api.together.xyz/v1', free: false, keyUrl: 'https://api.together.ai/settings/api-keys', hint: '', note: 'open models: Llama, Qwen, DeepSeek' },
];
export const byId = id => PROVIDERS.find(p => p.id === id);

// Hide models that cannot reply with text in chat
const NOT_CHAT = /embed|whisper|tts|audio|image|dall-e|moderation|guard|transcrib|realtime|search|davinci|babbage|sora|veo|imagen|rerank|ocr|lyria|live|computer-use|aqa/i;

const anthropicHeaders = key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' });
async function errorText(r){ try { const d = await r.json(); return d.error?.message || d.error || d.message || `HTTP ${r.status}`; } catch { return `HTTP ${r.status}`; } }

// The server picks the actual model (Gemini Flash, GPT-OSS on Groq or Llama on Cloudflare) — one entry is enough
const PROXY_MODELS = [
  { id: 'auto', name: 'Free AI', vendor: 'openconstructor', note: 'no key needed' },
];

// Supabase access token of the signed-in user (for the free openconstructor AI), or null
async function sessionToken(){
  const { supabase } = await import('./auth.js');
  const { data } = (await supabase?.auth.getSession()) || {};
  return data?.session?.access_token || null;
}

const quotaEvent = (used, limit) => { try { window.dispatchEvent(new CustomEvent('oc-quota', { detail: { used, limit } })); } catch {} };
function readQuota(r){
  const m = /^(\d+)\/(\d+)$/.exec(r.headers.get('X-OC-Quota') || '');
  if (m) quotaEvent(+m[1], +m[2]);
}

// Free openconstructor AI usage for today: { used, limit }, or null when signed out / unavailable.
export async function freeQuota(){
  const token = await sessionToken();
  if (!token) return null;
  try {
    const r = await fetch('/api/ai/quota', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const q = await r.json();
    quotaEvent(q.used, q.limit);
    return q;
  } catch { return null; }
}

export async function listModels(p, key){
  if (p.kind === 'proxy') return PROXY_MODELS.map(m => ({ ...m, ctx: 0, paid: false, price: null }));
  const headers = p.kind === 'anthropic' ? anthropicHeaders(key) : key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetch(`${p.base}/models${p.kind === 'anthropic' ? '?limit=100' : ''}`, { headers });
  if (!r.ok) throw Error(await errorText(r));
  const data = await r.json();
  let list = (data.data || data.models || []).map(m => ({
    id: String(m.id || m.name).replace(/^models\//, ''),
    name: m.display_name || m.name || m.id,
    ctx: m.context_length || m.context_window || m.max_context_length || m.inputTokenLimit || 0,
    out: m.architecture?.output_modalities,
    // OpenRouter returns prices in $ per token; convert to $ per 1M tokens [input, output]
    price: m.pricing ? [+m.pricing.prompt * 1e6, +m.pricing.completion * 1e6] : null,
  }));
  list = list.filter(m => m.id && !NOT_CHAT.test(m.id));
  // Paid models are shown too; skip router meta-models and variable-price entries (negative price)
  if (p.id === 'openrouter') list = list.filter(m => (!m.out || m.out.includes('text')) && !m.id.startsWith('openrouter/') && !(m.price && (m.price[0] < 0 || m.price[1] < 0)));
  if (p.id === 'gemini') list = list.filter(m => /gemini|gemma/i.test(m.id));
  if (p.id === 'openai') list = list.filter(m => /^(gpt|o\d|chatgpt)/i.test(m.id));
  return list.map(m => {
    const clean = String(m.name).replace(/\s*\(free\)\s*/i, '').replace(/^models\//, '').trim();
    const [vendor, ...rest] = clean.split(': ');
    const paid = !!(m.price && (m.price[0] > 0 || m.price[1] > 0));
    return { id: m.id, name: rest.length ? rest.join(': ') : clean, vendor: rest.length ? vendor : '', ctx: m.ctx, paid, price: paid ? m.price : null };
  }).sort((a, b) => (a.paid - b.paid) || a.name.localeCompare(b.name));
}

// Server-sent events: calls onEvent(json) for every `data:` line until [DONE]
async function readSSE(r, onEvent){
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (d === '[DONE]') return;
      let j; try { j = JSON.parse(d); } catch { continue; }
      onEvent(j);
    }
  }
}
const isSSE = r => /event-stream/i.test(r.headers.get('content-type') || '');

// One request. Returns { text, cut } — `cut` is true when the model stopped because it hit the length limit.
// `images` are data: URLs (screenshots). Each API wants them in its own message format.
// With onDelta(text, reasoning) the answer is streamed piece by piece (not for the proxy).
async function once(p, key, model, system, messages, onDelta){
  if (p.kind === 'proxy') {
    const token = await sessionToken();
    if (!token) throw Error('Sign in to use the free openconstructor AI');
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }) });
    readQuota(r);
    if (!r.ok) {
      const e = Error(await errorText(r));
      e.status = r.status; // 401 sign in, 429 daily limit, 503 not configured / busy
      throw e;
    }
    const d = await r.json();
    const ch = d.choices?.[0];
    return { text: ch?.message?.content || '', cut: ch?.finish_reason === 'length' };
  }
  if (p.kind === 'anthropic') {
    const r = await fetch(`${p.base}/messages`, { method: 'POST', headers: anthropicHeaders(key), body: JSON.stringify({ model, max_tokens: 8000, system, messages, ...(onDelta ? { stream: true } : {}) }) });
    if (!r.ok) throw Error(await errorText(r));
    if (onDelta && isSSE(r)) {
      let text = '', cut = false;
      await readSSE(r, e => {
        if (e.type === 'error') throw Error(e.error?.message || 'stream error');
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') { text += e.delta.text; onDelta(e.delta.text, ''); }
        else if (e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta') onDelta('', e.delta.thinking || '');
        else if (e.type === 'message_delta' && e.delta?.stop_reason === 'max_tokens') cut = true;
      });
      return { text, cut };
    }
    const d = await r.json();
    return { text: (d.content || []).map(c => c.text || '').join(''), cut: d.stop_reason === 'max_tokens' };
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  if (p.id === 'openrouter') headers['X-Title'] = 'openconstructor';
  // OpenRouter reserves credit for max_tokens, so cap it; reasoning models get a modest effort so thinking doesn't eat the answer
  const extra = p.id === 'openrouter' ? { max_tokens: 12000 } : {};
  if (/gpt-oss|^o\d|reason/i.test(model)) extra.reasoning_effort = 'low';
  if (onDelta) extra.stream = true;
  let r = await fetch(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, ...extra, messages: [{ role: 'system', content: system }, ...messages] }) });
  // some providers reject reasoning_effort for some models — retry once without it
  if (!r.ok && r.status === 400 && extra.reasoning_effort) { delete extra.reasoning_effort; r = await fetch(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, ...extra, messages: [{ role: 'system', content: system }, ...messages] }) }); }
  if (!r.ok) throw Error(await errorText(r));
  if (isSSE(r)) {
    let text = '', cut = false;
    await readSSE(r, e => {
      if (e.error) throw Error(e.error.message || 'stream error');
      const ch = e.choices?.[0]; if (!ch) return;
      const piece = ch.delta?.content || '', why = ch.delta?.reasoning || ch.delta?.reasoning_content || '';
      if (piece) text += piece;
      if (piece || why) onDelta?.(piece, why);
      if (ch.finish_reason === 'length') cut = true;
    });
    return { text, cut };
  }
  const d = await r.json();
  const ch = d.choices?.[0], c = ch?.message?.content;
  return { text: Array.isArray(c) ? c.map(x => x.text || '').join('') : (c || ''), cut: ch?.finish_reason === 'length' };
}

// Full answer: if the model is cut off by its output limit, ask it to continue (up to 3 times) and glue the parts.
export async function chat(p, key, model, system, user, images = [], onDelta = null){
  if (p.kind === 'proxy' && images.length) throw Error('Screenshots need a vision model — connect Gemini or OpenAI with your own key');
  const content = !images.length ? user
    : p.kind === 'anthropic' ? [...images.map(url => { const [, type, data] = url.match(/^data:([^;]+);base64,(.*)$/) || []; return { type: 'image', source: { type: 'base64', media_type: type, data } }; }), { type: 'text', text: user }]
    : [{ type: 'text', text: user }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
  const messages = [{ role: 'user', content }];
  let out = '';
  for (let i = 0; i < 4; i++) {
    const { text, cut } = await once(p, key, model, system, messages, onDelta && p.kind !== 'proxy' ? onDelta : null);
    out += text;
    if (!cut || !text) break;
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'You were cut off. Continue EXACTLY where you stopped — no repetition, no preamble, no code fence reopening.' });
  }
  return out;
}
