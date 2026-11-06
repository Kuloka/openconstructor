// AI providers. All are CORS-checked: requests go straight from the browser with the user's key.
// Once there is a server, this same module will be called through a proxy (keys will move to the server).
export const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter', base: 'https://openrouter.ai/api/v1', free: true, keyUrl: 'https://openrouter.ai/keys', hint: 'sk-or-…', note: 'many models, including free ones', publicModels: true },
  { id: 'gemini', name: 'Google Gemini', logo: 'gemini-color', base: 'https://generativelanguage.googleapis.com/v1beta/openai', free: true, keyUrl: 'https://aistudio.google.com/apikey', hint: 'AIza…', note: 'free tier, strong Flash models' },
  { id: 'groq', name: 'Groq', logo: 'groq', base: 'https://api.groq.com/openai/v1', free: true, keyUrl: 'https://console.groq.com/keys', hint: 'gsk_…', note: 'generous free tier, very fast' },
  { id: 'cerebras', name: 'Cerebras', logo: 'cerebras-color', base: 'https://api.cerebras.ai/v1', free: true, keyUrl: 'https://cloud.cerebras.ai', hint: 'csk-…', note: 'free tier, fast generation' },
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

export async function listModels(p, key){
  const headers = p.kind === 'anthropic' ? anthropicHeaders(key) : key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetch(`${p.base}/models${p.kind === 'anthropic' ? '?limit=100' : ''}`, { headers });
  if (!r.ok) throw Error(await errorText(r));
  const data = await r.json();
  let list = (data.data || data.models || []).map(m => ({
    id: String(m.id || m.name).replace(/^models\//, ''),
    name: m.display_name || m.name || m.id,
    ctx: m.context_length || m.context_window || m.max_context_length || m.inputTokenLimit || 0,
    out: m.architecture?.output_modalities,
  }));
  list = list.filter(m => m.id && !NOT_CHAT.test(m.id));
  if (p.id === 'openrouter') list = list.filter(m => m.id.endsWith(':free') && (!m.out || m.out.includes('text')));
  if (p.id === 'gemini') list = list.filter(m => /gemini|gemma/i.test(m.id));
  if (p.id === 'openai') list = list.filter(m => /^(gpt|o\d|chatgpt)/i.test(m.id));
  return list.map(m => {
    const clean = String(m.name).replace(/\s*\(free\)\s*/i, '').replace(/^models\//, '').trim();
    const [vendor, ...rest] = clean.split(': ');
    return { id: m.id, name: rest.length ? rest.join(': ') : clean, vendor: rest.length ? vendor : '', ctx: m.ctx };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function chat(p, key, model, system, user){
  if (p.kind === 'anthropic') {
    const r = await fetch(`${p.base}/messages`, { method: 'POST', headers: anthropicHeaders(key), body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }) });
    if (!r.ok) throw Error(await errorText(r));
    const d = await r.json();
    return (d.content || []).map(c => c.text || '').join('');
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  if (p.id === 'openrouter') headers['X-Title'] = 'openconstructor';
  const r = await fetch(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  if (!r.ok) throw Error(await errorText(r));
  const d = await r.json();
  const c = d.choices?.[0]?.message?.content;
  return Array.isArray(c) ? c.map(x => x.text || '').join('') : c;
}
