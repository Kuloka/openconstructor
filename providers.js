// one id per user message: the free AI counts a search + answer (or a retry) as one generation
export const aiTurn = { id: '' };
// the "stop" button: every model request of the current turn listens to this signal (studio.js runAI sets it)
export const aiCancel = { signal: null };
// AI providers. All are CORS-checked: requests go straight from the browser with the user's key.
// Once there is a server, this same module will be called through a proxy (keys will move to the server).
export const PROVIDERS = [
  { id: 'oc', name: 'openconstructor AI', logo: '', base: '/api', free: true, keyUrl: '', hint: '', note: 'no key needed — 3 free tries a day without an account, 20 a day when signed in', kind: 'proxy', publicModels: true },
  { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter', base: 'https://openrouter.ai/api/v1', free: true, keyUrl: 'https://openrouter.ai/keys', hint: 'sk-or-…', note: '300+ models in one key: Claude, GPT, Gemini and more — a dozen at no cost (Gemma 4, Nemotron), GPT-OSS from $0.02/M', publicModels: true },
  { id: 'ovh', name: 'OVHcloud AI', logo: 'ovh', base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', free: true, noKey: true, keyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/', hint: '', note: 'no key, no sign-up: GPT-OSS 120B, Qwen 3.5 397B, Llama 3.3 70B; EU servers, 2 requests a minute per model', prefer: ['gpt-oss-120b', 'Qwen3.5-397B-A17B'] },
  { id: 'llm7', name: 'LLM7', logo: 'llm7', base: 'https://api.llm7.io/v1', free: true, noKey: true, optionalKey: true, keyUrl: 'https://token.llm7.io', hint: '', note: 'no key needed: DeepSeek V4 Flash, GLM 5.3 Flash, MiniMax M2.7, Codestral free; with a key and balance also Claude, Gemini, DeepSeek Pro; small independent service', prefer: ['DeepSeek-V4-Flash-0731'] },
  { id: 'gemini', name: 'Google Gemini', logo: 'gemini-color', base: 'https://generativelanguage.googleapis.com/v1beta/openai', free: true, keyUrl: 'https://aistudio.google.com/apikey', hint: 'AIza…', note: 'no-cost tier with Flash models, strong at layout', prefer: ['gemini-2.5-flash', 'gemini-flash-latest'] },
  { id: 'groq', name: 'Groq', logo: 'groq', base: 'https://api.groq.com/openai/v1', free: true, keyUrl: 'https://console.groq.com/keys', hint: 'gsk_…', note: 'no-cost plan with GPT-OSS 120B (fast) and Qwen 3.8 27B (best design, ~1 page a minute)', prefer: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'] },
  { id: 'cerebras', name: 'Cerebras', logo: 'cerebras-color', base: 'https://api.cerebras.ai/v1', free: true, keyUrl: 'https://cloud.cerebras.ai', hint: 'csk-…', note: 'fastest GPT-OSS; $5 trial credit (card required), then pay as you go', prefer: ['gpt-oss-120b'] },
  { id: 'mistral', name: 'Mistral', logo: 'mistral-color', base: 'https://api.mistral.ai/v1', free: true, keyUrl: 'https://console.mistral.ai/api-keys', hint: '', note: 'free tier for experimentation' },
  { id: 'zai', name: 'Z.ai (GLM)', logo: 'zai', base: 'https://api.z.ai/api/paas/v4', free: true, freeIf: /flash/i, keyUrl: 'https://z.ai/manage-apikey/apikey-list', hint: '', note: 'GLM Flash models at no cost; GLM flagship models pay as you go', prefer: ['glm-4.5-flash'] },
  { id: 'siliconflow', name: 'SiliconFlow', logo: 'siliconcloud-color', base: 'https://api.siliconflow.com/v1', free: true, freeIf: /[1-9]b/i, keyUrl: 'https://cloud.siliconflow.com/account/ak', hint: 'sk-…', note: 'open models (Qwen, DeepSeek, GLM); a set of smaller ones free' },
  { id: 'cohere', name: 'Cohere', logo: 'cohere-color', base: 'https://api.cohere.ai/compatibility/v1', free: true, keyUrl: 'https://dashboard.cohere.com/api-keys', hint: '', note: 'free trial key (rate-limited, non-commercial): Command models' },
  { id: 'huggingface', name: 'Hugging Face', logo: 'huggingface-color', base: 'https://router.huggingface.co/v1', free: false, keyUrl: 'https://huggingface.co/settings/tokens', hint: 'hf_…', note: 'thousands of open models via Inference Providers; small free monthly credit' },
  { id: 'pollinations', name: 'Pollinations', logo: 'pollinations', base: 'https://gen.pollinations.ai/v1', free: true, keyUrl: 'https://enter.pollinations.ai/keys', hint: '', note: 'free key with a daily free allowance: GLM 5.3, GPT-6 Sol and Luna, Kimi K3.1 Pro, DeepSeek V4.1 Flash; Claude, Gemini and Grok spend paid credit', prefer: ['z-ai/glm-5.3', 'moonshotai/kimi-k3.1-pro'] },
  { id: 'vercel', name: 'Vercel AI Gateway', logo: 'vercel', base: 'https://ai-gateway.vercel.sh/v1', free: true, keyUrl: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys', hint: '', note: '$5 of free credit every month on a Vercel account: 500+ models in one key — Claude, GPT, Gemini, Grok, DeepSeek' },
  { id: 'scaleway', name: 'Scaleway', logo: 'scaleway', base: 'https://api.scaleway.ai/v1', free: true, keyUrl: 'https://console.scaleway.com/iam/api-keys', hint: '', note: 'first 1M tokens free, EU servers (Paris): Qwen, Llama, Mistral, DeepSeek, GPT-OSS' },
  { id: 'alibaba', name: 'Alibaba Model Studio', logo: 'bailian-color', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', free: true, keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key', hint: 'sk-…', note: 'the Qwen family first-hand; new accounts get a free token quota per model (Singapore region)' },
  { id: 'aion', name: 'Aion Labs', logo: 'aionlabs-color', base: 'https://api.aionlabs.ai/v1', free: true, keyUrl: 'https://www.aionlabs.ai/app/api-keys/', hint: '', note: 'free forever, no card: Aion 3.0 models; 20K tokens a day — enough for small edits' },
  { id: 'gonka', name: 'Gonka', logo: 'gonka', base: 'https://proxy.gonkabroker.com/v1', free: true, keyUrl: 'https://app.gonkabroker.com/signup', hint: '', lanes: 1, note: 'free tokens after sign-up (phone number) for the model chosen in the Gonka dashboard — MiniMax M2.7 by default; DeepSeek V4 Flash and GLM 5.3 Flash too', prefer: ['MiniMaxAI/MiniMax-M2.7', 'deepseek-ai/DeepSeek-V4-Flash-0731'] },
  { id: 'modelscope', name: 'ModelScope', logo: 'modelscope-color', base: 'https://api-inference.modelscope.cn/v1', free: true, keyUrl: 'https://modelscope.cn/my/myaccesstoken', hint: 'ms-…', note: '2,000 free requests a day of Qwen 3.5; needs an Alibaba Cloud account with real-name check (mainland China)' },
  { id: 'deepseek', name: 'DeepSeek', logo: 'deepseek-color', base: 'https://api.deepseek.com', free: false, keyUrl: 'https://platform.deepseek.com/api_keys', hint: 'sk-…', note: 'very low cost, strong at code' },
  { id: 'openai', name: 'OpenAI', logo: 'openai', base: 'https://api.openai.com/v1', free: false, keyUrl: 'https://platform.openai.com/api-keys', hint: 'sk-…', note: 'GPT models' },
  { id: 'anthropic', name: 'Anthropic', logo: 'claude-color', base: 'https://api.anthropic.com/v1', free: false, keyUrl: 'https://console.anthropic.com/settings/keys', hint: 'sk-ant-…', note: 'Claude, the strongest at layout', kind: 'anthropic' },
  { id: 'xai', name: 'xAI', logo: 'xai', base: 'https://api.x.ai/v1', free: false, keyUrl: 'https://console.x.ai', hint: 'xai-…', note: 'Grok models' },
  { id: 'together', name: 'Together AI', logo: 'together-color', base: 'https://api.together.xyz/v1', free: false, keyUrl: 'https://api.together.ai/settings/api-keys', hint: '', note: 'open models: Llama, Qwen, DeepSeek' },
  { id: 'deepinfra', name: 'DeepInfra', logo: 'deepinfra-color', base: 'https://api.deepinfra.com/v1/openai', free: false, keyUrl: 'https://deepinfra.com/dash/api_keys', hint: '', note: 'open models at some of the lowest prices: DeepSeek, Qwen, GLM, Kimi, Llama' },
  { id: 'fireworks', name: 'Fireworks AI', logo: 'fireworks-color', base: 'https://api.fireworks.ai/inference/v1', free: false, keyUrl: 'https://app.fireworks.ai/settings/users/api-keys', hint: 'fw_…', note: 'fast open models (GLM, Kimi, DeepSeek, Qwen); a small credit to try' },
  { id: 'nebius', name: 'Nebius Token Factory', logo: 'nebius', base: 'https://api.tokenfactory.nebius.com/v1', free: false, keyUrl: 'https://tokenfactory.nebius.com/', hint: '', note: 'open models on EU servers, trial credit on sign-up' },
  { id: 'novita', name: 'Novita AI', logo: 'novita-color', base: 'https://api.novita.ai/v3/openai', free: false, keyUrl: 'https://novita.ai/settings/key-management', hint: 'sk_…', note: 'cheap open models, trial credit on sign-up' },
  { id: 'chutes', name: 'Chutes', logo: 'chutes', base: 'https://llm.chutes.ai/v1', free: false, keyUrl: 'https://chutes.ai/app/api', hint: 'cpk_…', note: 'decentralised GPUs (Bittensor): open models for cents' },
  { id: 'hyperbolic', name: 'Hyperbolic', logo: 'hyperbolic-color', base: 'https://api.hyperbolic.xyz/v1', free: false, keyUrl: 'https://app.hyperbolic.xyz/settings', hint: '', note: 'open models pay as you go, small trial credit' },
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
  const url = `${p.base}/models${p.kind === 'anthropic' ? '?limit=100' : ''}`;
  // some services (LLM7) don't let the browser send a key to /models (CORS): the list is public there, ask without it
  let r;
  try { r = await fetch(url, { headers }); }
  catch (e) { if (!headers.Authorization) throw e; r = await fetch(url); }
  if (!r.ok) throw Error(await errorText(r));
  const data = await r.json();
  // prices come per token (OpenRouter, Vercel) or per 1M tokens (LLM7, Chutes): tiny numbers are per token
  const perM = v => { const n = +(v?.usd ?? v); return !Number.isFinite(n) ? NaN : n > 0 && n < 0.001 ? n * 1e6 : n; };
  let list = (data.data || data.models || [])
    // services that list images, video, speech and embeddings too (Vercel "type", Pollinations "category")
    .filter(m => (!m.type || m.type === 'language' || m.type === 'chat' || m.type === 'model') && (!m.category || m.category === 'text') && m.community !== true)
    .map(m => {
      const pr = m.pricing || m.price;
      const price = !pr || pr.currency === 'pollen' ? null : pr.prompt != null ? [perM(pr.prompt), perM(pr.completion)] : pr.input != null ? [perM(pr.input), perM(pr.output)] : null;
      return {
        id: String(m.id || m.name).replace(/^models\//, ''),
        name: m.display_name || m.name || m.id,
        ctx: +(m.context_length || m.context_window?.tokens || m.context_window || m.max_context_length || m.inputTokenLimit || 0) || 0,
        out: m.architecture?.output_modalities,
        price: price && price.every(Number.isFinite) ? price : null,
        // tiered services: LLM7 "turbo" (free) vs "pro" (key + balance); Pollinations paid_only (paid credit) vs daily free allowance
        tiered: 'tier' in m || 'paid_only' in m, needKey: m.usage_based_only === true || m.tier === 'pro' || m.paid_only === true,
      };
    });
  list = list.filter(m => m.id && !NOT_CHAT.test(m.id) && !/^BAAI\/|bge-|e5-|-embedding|stable-diffusion|sdxl|flux/i.test(m.id));
  // without a key the key-only models would just answer "Missing API key"
  if (!key) list = list.filter(m => !m.needKey);
  // Paid models are shown too; skip router meta-models and variable-price entries (negative price)
  if (p.id === 'openrouter') list = list.filter(m => (!m.out || m.out.includes('text')) && !m.id.startsWith('openrouter/') && !(m.price && (m.price[0] < 0 || m.price[1] < 0)));
  if (p.id === 'gemini') list = list.filter(m => /gemini|gemma/i.test(m.id));
  if (p.id === 'openai') list = list.filter(m => /^(gpt|o\d|chatgpt)/i.test(m.id));
  if (p.id === 'ovh') list = list.filter(m => !/^nvr-|bge|e5-|stable-diffusion|sdxl|flux/i.test(m.id));
  return list.map(m => {
    const clean = String(m.name).replace(/\s*\(free\)\s*/i, '').replace(/^models\//, '').trim();
    const [vendor, ...rest] = clean.split(': ');
    // a service with only some models free (freeIf): the rest cost money even when the API sends no prices
    const paid = m.tiered ? m.needKey : !!(m.price && (m.price[0] > 0 || m.price[1] > 0)) || !!(p.freeIf && !p.freeIf.test(m.id));
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
// token usage as the API reports it: OpenAI-style { prompt_tokens, completion_tokens } or Anthropic { input_tokens, output_tokens }
const usageOf = u => u && (u.prompt_tokens != null || u.completion_tokens != null) ? { in: +u.prompt_tokens || 0, out: +u.completion_tokens || 0 }
  : u && (u.input_tokens != null || u.output_tokens != null) ? { in: (+u.input_tokens || 0) + (+u.cache_read_input_tokens || 0) + (+u.cache_creation_input_tokens || 0), out: +u.output_tokens || 0 } : null;
async function readOpenAIStream(r, onDelta){
  let text = '', cut = false, usage = null;
  await readSSE(r, e => {
    if (e.error) throw Error(e.error.message || 'stream error');
    if (e.usage) usage = usageOf(e.usage) || usage;
    const ch = e.choices?.[0]; if (!ch) return;
    const piece = ch.delta?.content || '', why = ch.delta?.reasoning || ch.delta?.reasoning_content || '';
    if (piece) text += piece;
    if (piece || why) onDelta?.(piece, why);
    if (ch.finish_reason === 'length') cut = true;
  });
  return { text, cut, usage };
}

// One request. Returns { text, cut } — `cut` is true when the model stopped because it hit the length limit.
// `images` are data: URLs (screenshots). Each API wants them in its own message format.
// With onDelta(text, reasoning) the answer is streamed piece by piece (the free AI too).
async function once(p, key, model, system, messages, onDelta){
  if (p.kind === 'proxy') {
    // signed out works too: the server gives a few free tries a day, then asks to sign in (error code "signin")
    const token = await sessionToken();
    const r = await fetch('/api/ai', { method: 'POST', signal: aiCancel.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(aiTurn.id ? { 'X-OC-Turn': aiTurn.id } : {}) }, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], ...(onDelta ? { stream: true } : {}) }) });
    if (token) readQuota(r);
    if (!r.ok) {
      let d = null; try { d = await r.clone().json(); } catch {}
      const e = Error(d?.error?.message || await errorText(r));
      e.status = r.status; // 401 sign in, 429 daily limit, 503 not configured / busy
      e.code = d?.error?.code || (!token && (r.status === 401 || r.status === 429) ? 'signin' : '');
      throw e;
    }
    if (isSSE(r)) return readOpenAIStream(r, onDelta);
    const d = await r.json();
    const ch = d.choices?.[0];
    return { text: ch?.message?.content || '', cut: ch?.finish_reason === 'length', usage: usageOf(d.usage) };
  }
  if (p.kind === 'anthropic') {
    const r = await fetch(`${p.base}/messages`, { method: 'POST', signal: aiCancel.signal, headers: anthropicHeaders(key), body: JSON.stringify({ model, max_tokens: 8000, system, messages, ...(onDelta ? { stream: true } : {}) }) });
    if (!r.ok) throw Error(await errorText(r));
    if (onDelta && isSSE(r)) {
      let text = '', cut = false, inT = 0, outT = 0;
      await readSSE(r, e => {
        if (e.type === 'error') throw Error(e.error?.message || 'stream error');
        if (e.type === 'message_start') { const u = usageOf(e.message?.usage); if (u) { inT = u.in; outT = u.out; } }
        if (e.type === 'message_delta' && e.usage) { if (e.usage.output_tokens != null) outT = +e.usage.output_tokens || outT; if (e.usage.input_tokens) inT = +e.usage.input_tokens; }
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') { text += e.delta.text; onDelta(e.delta.text, ''); }
        else if (e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta') onDelta('', e.delta.thinking || '');
        else if (e.type === 'message_delta' && e.delta?.stop_reason === 'max_tokens') cut = true;
      });
      return { text, cut, usage: inT || outT ? { in: inT, out: outT } : null };
    }
    const d = await r.json();
    return { text: (d.content || []).map(c => c.text || '').join(''), cut: d.stop_reason === 'max_tokens', usage: usageOf(d.usage) };
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  if (p.id === 'openrouter') headers['X-Title'] = 'openconstructor';
  // OpenRouter reserves credit for max_tokens, so cap it; reasoning models get a modest effort so thinking doesn't eat the answer
  const extra = p.id === 'openrouter' ? { max_tokens: 12000 } : {};
  if (/gpt-oss|^o\d|reason/i.test(model)) extra.reasoning_effort = 'low';
  if (onDelta) { extra.stream = true; extra.stream_options = { include_usage: true }; } // the real token counts arrive in the last chunk
  if (!key) delete headers.Authorization;
  let r = await fetch(`${p.base}/chat/completions`, { method: 'POST', signal: aiCancel.signal, headers, body: JSON.stringify({ model, ...extra, messages: [{ role: 'system', content: system }, ...messages] }) });
  // some providers reject reasoning_effort or stream_options — retry once without them
  if (!r.ok && (r.status === 400 || r.status === 422) && (extra.reasoning_effort || extra.stream_options)) { delete extra.reasoning_effort; delete extra.stream_options; r = await fetch(`${p.base}/chat/completions`, { method: 'POST', signal: aiCancel.signal, headers, body: JSON.stringify({ model, ...extra, messages: [{ role: 'system', content: system }, ...messages] }) }); }
  if (!r.ok) { const e = Error(await errorText(r)); e.status = r.status; throw e; }
  if (isSSE(r)) return readOpenAIStream(r, onDelta);
  const d = await r.json();
  const ch = d.choices?.[0], c = ch?.message?.content;
  return { text: Array.isArray(c) ? c.map(x => x.text || '').join('') : (c || ''), cut: ch?.finish_reason === 'length', usage: usageOf(d.usage) };
}

// Token counter (an estimate, ~3.6 characters a token): `turn` is the current request, `session` everything since the page opened.
// The composer shows it live while the agents write ('oc:tokens' events, at most every 80 ms).
export const tokens = { turnIn: 0, turnOut: 0, session: 0, live: 0, approx: false };
const est = s => Math.ceil(String(s || '').length / 3.6);
let tokTimer = 0;
const tokEmit = () => { if (tokTimer || typeof CustomEvent === 'undefined') return; tokTimer = setTimeout(() => { tokTimer = 0; globalThis.dispatchEvent?.(new CustomEvent('oc:tokens', { detail: { ...tokens } })); }, 80); };
const tokAdd = (i, o) => { tokens.turnIn += i; tokens.turnOut += o; tokens.session += i + o; tokEmit(); };
export function tokensTurn(){ tokens.turnIn = 0; tokens.turnOut = 0; tokens.approx = false; tokEmit(); }
const tokLive = d => { tokens.live = Math.max(0, tokens.live + d); tokEmit(); };

// Full answer: if the model is cut off by its output limit, ask it to continue (up to 3 times) and glue the parts.
export async function chat(p, key, model, system, user, images = [], onDelta = null){
  tokLive(1);
  try { return await chatAll(p, key, model, system, user, images, onDelta); } finally { tokLive(-1); }
}
async function chatAll(p, key, model, system, user, images, onDelta){
  const outer = onDelta;
  let streamed = 0;
  onDelta = (piece, why) => { const n = est((piece || '') + (why || '')); streamed += n; tokAdd(0, n); outer?.(piece, why); };
  if (p.kind === 'proxy' && images.length) throw Error('Screenshots need a vision model — connect Gemini or OpenAI with your own key');
  const content = !images.length ? user
    : p.kind === 'anthropic' ? [...images.map(url => { const [, type, data] = url.match(/^data:([^;]+);base64,(.*)$/) || []; return { type: 'image', source: { type: 'base64', media_type: type, data } }; }), { type: 'text', text: user }]
    : [{ type: 'text', text: user }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
  const messages = [{ role: 'user', content }];
  let out = '';
  for (let i = 0; i < 4; i++) {
    const inEst = est(system) + messages.reduce((n, x) => n + est(typeof x.content === 'string' ? x.content : user), 0) + images.length * 800;
    tokAdd(inEst, 0);
    streamed = 0;
    const { text, cut, usage } = await once(p, key, model, system, messages, outer ? onDelta : null);
    // the provider's own numbers replace the estimate; without them the estimate stays and the counter shows "~"
    if (usage && (usage.in || usage.out)) tokAdd(usage.in - inEst, (usage.out || (streamed || est(text))) - streamed);
    else { if (!streamed) tokAdd(0, est(text)); tokens.approx = true; tokEmit(); }
    out += text;
    if (!cut || !text) break;
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'You were cut off. Continue EXACTLY where you stopped — no repetition, no preamble, no code fence reopening.' });
  }
  return out;
}
