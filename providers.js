// one id per user message: the free AI counts a search + answer (or a retry) as one generation
export const aiTurn = { id: '' };
// the "stop" button: every model request of the current turn listens to this signal (studio.js runAI sets it)
export const aiCancel = { signal: null };
// AI providers. All are CORS-checked: requests go straight from the browser with the user's key.
// Once there is a server, this same module will be called through a proxy (keys will move to the server).
export const PROVIDERS = [
  { id: 'oc', name: 'openconstructor AI', logo: '', base: '/api', free: true, keyUrl: '', hint: '', note: 'no key needed — 3 free tries a day without an account, 20 a day when signed in', kind: 'proxy', publicModels: true },
  { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter', base: 'https://openrouter.ai/api/v1', free: true, keyUrl: 'https://openrouter.ai/keys', hint: 'sk-or-…', note: '300+ models in one key: Claude, GPT, Gemini and more — a dozen at no cost (Gemma 4, Nemotron), GPT-OSS from $0.02/M', publicModels: true },
  { id: 'coarena', name: 'Coarena', logo: 'coarena', base: 'https://coarena.ai/api/v1', free: true, keyUrl: 'https://coarena.ai/account/api/keys', hint: 'coa_…', note: 'one free key, 18 frontier models paid for by Coarena: Claude Opus 5.5 and Fable 5.2, GPT-6.1 Sol, Gemini 4, Grok 4.7, Kimi K3.1 Pro; 30 requests a minute, 2 at once', lanes: 2, prefer: ['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-6-1-sol'] },
  { id: 'ovh', name: 'OVHcloud AI', logo: 'ovh', base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', free: true, noKey: true, keyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/', hint: '', note: 'no key, no sign-up: GPT-OSS 120B, Qwen 3.5 397B, Llama 3.3 70B; EU servers, 2 requests a minute per model', rpm: 2, prefer: ['gpt-oss-120b', 'Qwen3.5-397B-A17B'] },
  { id: 'llm7', name: 'LLM7', logo: 'llm7', base: 'https://api.llm7.io/v1', free: true, noKey: true, optionalKey: true, keyUrl: 'https://token.llm7.io', hint: '', note: 'no key needed: GLM 5.3 Flash, MiMo V2.6 Flash, Gemma 4, GPT-OSS 20B, Codestral free; DeepSeek, Claude and Gemini only with a key and balance; small independent service', prefer: ['glm-5.3-flash'] },
  // relay: the service's API refuses browsers (no CORS) — calls go through our worker (/api/relay/<id>, worker.js RELAY)
  { id: 'kilo', name: 'Kilo Gateway', logo: 'kilocode', base: '/api/relay/kilo', relay: true, free: true, noKey: true, optionalKey: true, freeIf: /free/i, keyUrl: 'https://app.kilo.ai', hint: '', note: 'no key needed: a dozen free models — Nemotron 3.5 Super, ERNIE 5.5 Flash, North Mini Code, dots 3; a Kilo key unlocks Claude, GPT and 400+ more; ~200 requests an hour', prefer: ['nvidia/nemotron-3.5-super-vl:free', 'kilo-auto/free'] },
  { id: 'pollinations-open', name: 'Pollinations Open', logo: 'pollinations', base: 'https://text.pollinations.ai/openai', free: true, noKey: true, keyUrl: 'https://pollinations.ai', hint: '', note: 'no key, no sign-up: the open Pollinations text endpoint (GPT-OSS), rate-limited per visitor; good for short edits', prefer: ['openai-fast'] },
  { id: 'freeai', name: 'Free.ai', logo: 'fav-freeai', base: 'https://api.free.ai/v1', free: true, noKey: true, freeIf: /^qwen(7b|-coder)$/, keyUrl: 'https://free.ai', hint: '', note: 'no key, no sign-up: Qwen 3.6 35B on their own servers, answers in under a second', prefer: ['qwen7b'] },
  // AI Horde: volunteers' GPUs, anonymous key "0000000000"; slow and mostly role-play models, so those are hidden
  { id: 'aihorde', name: 'AI Horde', logo: 'fav-aihorde', base: 'https://oai.aihorde.net/v1', free: true, noKey: true, optionalKey: true, anonKey: '0000000000', hide: /uncensor|heretic|abliterat|dark|nsfw|lumimaid|stheno|drummer|behemoth|cydonia|vesper|nocturne|eclipse|0\.6b|rp\b/i, keyUrl: 'https://aihorde.net/register', hint: '', note: 'no key: open models run by volunteers (Qwen 3.8 Flash, Qwen 3, Gemma 4); slow — a queue of a few seconds to minutes; a free key moves you up the queue' },
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
  // free tiers found in the GitHub lists (2026-11-18: mvalentsev/awesome-free-ai-coding, amardeeplakshkar, freellmpool), CORS checked
  { id: 'nvidia', name: 'NVIDIA NIM', logo: 'nvidia-color', base: '/api/relay/nvidia', relay: true, free: true, keyUrl: 'https://build.nvidia.com/settings/api-keys', hint: 'nvapi-…', note: 'free developer key: Nemotron 3 Ultra, GLM 5.3 Flash, MiniMax M3.1 Flash, Gemma 4 and more; ~40 requests a minute', prefer: ['nvidia/nemotron-3-ultra', 'z-ai/glm-5.3-flash'] },
  { id: 'requesty', name: 'Requesty', logo: 'fav-requesty', base: 'https://router.requesty.ai/v1', free: true, freeIf: /free|nemotron|gemma-4|leanstral/i, keyUrl: 'https://app.requesty.ai/api-keys', hint: '', note: '768 models in one key; 200 free requests a day on Nemotron 3 Ultra, Gemma 4 31B, Leanstral (no card)' },
  { id: 'aihubmix', name: 'AIHubMix', logo: 'aihubmix-color', base: 'https://aihubmix.com/v1', free: true, freeIf: /free/i, keyUrl: 'https://aihubmix.com/token', hint: 'sk-…', note: '670 models; 40+ free routes: GLM 5.3, MiMo v2.6 Pro, MiniMax M3, Nemotron 3 Ultra' },
  { id: 'routeway', name: 'Routeway', logo: 'fav-routeway', base: 'https://api.routeway.ai/v1', free: true, freeIf: /:free/i, keyUrl: 'https://routeway.ai', hint: '', note: '286 models; free :free lane — DeepSeek V4.1 Flash, MiniMax M3.1 Flash, Gemma 4' },
  { id: 'unorouter', name: 'UnoRouter', logo: 'fav-unorouter', base: 'https://api.unorouter.com/v1', free: true, freeIf: /:free/i, keyUrl: 'https://unorouter.com', hint: '', note: '160+ free :free models (DeepSeek V4, GLM 5.2, Qwen 3.5 397B, Nemotron 3 Ultra); sign in with GitHub or Discord, ~1 request a minute per model' },
  { id: 'llmtr', name: 'LLMTR', logo: 'fav-llmtr', base: 'https://llmtr.com/v1', free: true, freeIf: /free/i, keyUrl: 'https://llmtr.com', hint: '', note: 'free models on a zero balance: Qwen 3.8 27B, Nemotron 3.5 Super' },
  { id: 'nous', name: 'Nous Portal', logo: 'nousresearch', base: 'https://inference-api.nousresearch.com/v1', free: true, freeIf: /:free/i, keyUrl: 'https://portal.nousresearch.com', hint: '', note: '410 models; $0 plan for :free ones — Solar Mini 4, Hy4 Flash, Step 3.7 Flash, LongCat 2.5' },
  { id: 'bazaarlink', name: 'BazaarLink', logo: 'fav-bazaarlink', base: 'https://api.bazaarlink.ai/v1', free: true, freeIf: /free/i, keyUrl: 'https://bazaarlink.ai', hint: 'sk-bl-…', note: 'shared free allowance on DeepSeek V4 Flash, Qwen 3.7 Flash, Nemotron 3.5 Lightning' },
  { id: 'orcarouter', name: 'OrcaRouter', logo: 'fav-orcarouter', base: 'https://api.orcarouter.ai/v1', free: true, freeIf: /free/i, keyUrl: 'https://orcarouter.ai', hint: '', note: 'free DeepSeek V4.1 Flash, GLM 5.3 Flash, Hy4 Preview; the account needs a GitHub link' },
  { id: 'infron', name: 'Infron', logo: 'fav-infron', base: 'https://llm.onerouter.pro/v1', free: true, freeIf: /:free/i, keyUrl: 'https://infron.ai', hint: '', note: '550 models; free Qwen 3.8 27B and DeepSeek V4 Flash after a $5 top-up' },
  { id: 'liquid', name: 'Liquid Inference', logo: 'liquid', base: 'https://router.inference.ai.exchange/v1', free: true, freeIf: /free/i, keyUrl: 'https://inference.ai.exchange', hint: '', note: '975 models; a free automatic route (liquid.free) and starting credit, no card' },
  { id: 'hetzner', name: 'Hetzner Inference', logo: 'fav-hetzner', base: 'https://inference.hetzner.com/api/v1', free: true, keyUrl: 'https://console.hetzner.com', hint: '', note: 'free while the experiment runs: Qwen 3.8 27B and Qwen 3.6 on EU hardware' },
  { id: 'itera', name: 'IteraCompute', logo: 'fav-itera', base: '/api/relay/itera', relay: true, free: true, keyUrl: 'https://iteracompute.com', hint: '', note: 'recurring free usage: Qwen 3.8 27B, GLM 5.3, MiniMax M2.7' },
  { id: 'freeinference', name: 'FreeInference', logo: 'fav-freeinference', base: '/api/relay/freeinference', relay: true, free: true, keyUrl: 'https://freeinference.org', hint: 'hyi-…', note: 'Harvard SEAS research service, free for every account: Qwen 3.6 35B, DeepSeek V4 Flash' },
  { id: 'ollama', name: 'Ollama Cloud', logo: 'ollama', base: '/api/relay/ollama', relay: true, free: true, keyUrl: 'https://ollama.com/settings/keys', hint: '', note: 'a starter allowance: GPT-OSS 120B, Kimi K2.7 Code, Gemma 4 31B' },
  { id: 'dahl', name: 'Dahl Inference', logo: 'fav-dahl', base: 'https://inference.dahl.global/v1', free: true, keyUrl: 'https://inference.dahl.global', hint: '', note: '100M tokens on sign-up: GLM 5.3 Flash, DeepSeek V4 Flash, MiniMax M2.7', prefer: ['zai-org/GLM-5.3-Flash'] },
  { id: 'regolo', name: 'Regolo AI', logo: 'fav-regolo', base: 'https://api.regolo.ai/v1', free: true, keyUrl: 'https://dashboard.regolo.ai', hint: '', note: 'a free month on a daily allowance, EU and zero retention: Qwen 3.8 27B, Gemma 4, GPT-OSS 120B' },
  { id: 'meganova', name: 'MegaNova', logo: 'fav-meganova', base: 'https://api.meganova.ai/v1', free: true, freeIf: /flash|mini|small/i, keyUrl: 'https://meganova.ai', hint: '', note: 'daily free quotas, no card' },
  { id: 'moark', name: 'Moark (Gitee AI)', logo: 'giteeai', base: 'https://api.moark.com/v1', free: true, keyUrl: 'https://moark.com', hint: '', note: '100 free calls a day across featured models: Qwen 4 Max, Hy4 Flash' },
  { id: 'kiosapi', name: 'Kiosapi', logo: 'fav-kiosapi', base: 'https://api.kiosapi.id/v1', free: true, freeIf: /flash|gemma|llama-3\.1-8b|qwen3-30b|sea-lion/i, keyUrl: 'https://kiosapi.id', hint: '', note: 'a daily allowance: GLM 4.7 Flash, Gemma 4 26B, Qwen 3 30B' },
  { id: 'novai', name: 'NovAI', logo: 'fav-novai', base: 'https://aiapi-pro.com/v1', free: true, freeIf: /flash/i, keyUrl: 'https://aiapi-pro.com', hint: '', note: 'recurring free GLM Flash models (text and vision)' },
  { id: 'llmkiwi', name: 'LLM.kiwi', logo: 'fav-llmkiwi', base: '/api/relay/llmkiwi', relay: true, free: true, keyUrl: 'https://llm.kiwi', hint: '', note: 'no-card free plan: Nemotron 3 Ultra, MiniMax M2.5, auto router' },
  { id: 'simplellm', name: 'SimpleLLM', logo: 'fav-simplellm', base: '/api/relay/simplellm', relay: true, free: true, freeIf: /gemma|llama-3\.1-8b/i, keyUrl: 'https://simplellm.eu', hint: '', note: 'zero-price Gemma 4 E4B and Llama 3.1 8B, EU' },
  { id: 'typhoon', name: 'OpenTyphoon', logo: 'fav-typhoon', base: 'https://api.opentyphoon.ai/v1', free: true, keyUrl: 'https://playground.opentyphoon.ai/api-key', hint: '', note: 'free research showcase from SCB 10X: Typhoon 2.5 30B (Thai and English)' },
  { id: 'sealion', name: 'SEA-LION', logo: 'fav-sealion', base: 'https://api.sea-lion.ai/v1', free: true, keyUrl: 'https://playground.sea-lion.ai', hint: '', note: 'AI Singapore: free key for Southeast Asian language models' },
  { id: 'agnes', name: 'Agnes AI', logo: 'agnesai', base: 'https://apihub.agnes-ai.com/v1', free: true, freeIf: /flash/i, keyUrl: 'https://agnes-ai.com', hint: '', note: 'Agnes 2.5 and 3.0 Flash at no cost' },
  { id: 'zro', name: 'Zro (MoonMath)', logo: 'fav-zro', base: 'https://zro.moonmath.ai/v1', free: true, freeIf: /flash/i, keyUrl: 'https://zro.moonmath.ai', hint: '', note: 'recurring free plan on Flash models: DeepSeek V4.1 Flash' },
  { id: 'anyapi', name: 'AnyAPI', logo: 'fav-anyapi', base: 'https://api.anyapi.ai/v1', free: true, keyUrl: 'https://anyapi.ai', hint: '', note: 'one key, no card: 20 requests a minute, 200 a day on Llama 3.3 70B, Qwen 3 Coder, GPT-OSS 120B, Gemma 4' },
  { id: 'airforce', name: 'Api.Airforce', logo: 'fav-airforce', base: 'https://api.airforce/v1', free: true, keyUrl: 'https://panel.api.airforce', hint: '', note: '13 free models for light use (GPT-OSS 120B, GLM 4.7 Flash, Gemma 3); pay as you go lifts the limits' },
  { id: 'inception', name: 'Inception (Mercury)', logo: 'inception', base: 'https://api.inceptionlabs.ai/v1', free: true, keyUrl: 'https://platform.inceptionlabs.ai', hint: '', note: 'diffusion LLMs, very fast: Mercury 3; free tokens on sign-up', prefer: ['mercury-3'] },
  { id: 'sarvam', name: 'Sarvam AI', logo: 'fav-sarvam', base: 'https://api.sarvam.ai/v1', free: true, keyUrl: 'https://dashboard.sarvam.ai', hint: '', note: '₹100 free credit that never expires: Sarvam 105B' },
  { id: 'tencent', name: 'Tencent TokenHub', logo: 'tencent-color', base: '/api/relay/tencent', relay: true, free: true, keyUrl: 'https://console.cloud.tencent.com', hint: '', note: '1M free tokens per model for a year (real-name check): Hunyuan Hy4 and more' },
  { id: 'siliconflow-cn', name: 'SiliconFlow China', logo: 'siliconcloud-color', base: 'https://api.siliconflow.cn/v1', free: true, freeIf: /[1-9]b/i, keyUrl: 'https://cloud.siliconflow.cn/account/ak', hint: 'sk-…', note: 'mainland endpoint: free small Qwen, GLM and DeepSeek distills (real-name check)' },
  { id: 'vlmrun', name: 'VLM Run Gateway', logo: 'fav-vlmrun', base: '/api/relay/vlmrun', relay: true, free: true, keyUrl: 'https://app.vlm.run/dashboard/settings/api-keys', hint: '', note: 'free key: Qwen 3.8 27B, Gemini 3.x Flash' },
  { id: 'longcat', name: 'LongCat (Meituan)', logo: 'longcat-color', base: 'https://api.longcat.chat/openai/v1', free: true, keyUrl: 'https://longcat.chat/platform/api_keys', hint: 'ak_…', note: 'LongCat models first-hand with a free daily token allowance' },
  { id: 'meldport', name: 'Meldport', logo: 'fav-meldport', base: '/api/relay/meldport', relay: true, free: true, freeIf: /:free/i, keyUrl: 'https://meldport.com', hint: '', note: 'free :free routes — GLM 5.3 Flash, GPT-6 Luna' },
  { id: 'router9', name: 'Router9', logo: 'fav-router9', base: '/api/relay/router9', relay: true, free: true, keyUrl: 'https://router9.com', hint: '', note: 'shared monthly free credit: GLM 5.3, Qwen 3.8 Flash, Qwen 3 235B' },
  { id: 'speka', name: 'Speka', logo: 'fav-speka', base: 'https://speka.me/v1', free: true, keyUrl: 'https://speka.me', hint: 'sk-sp…', note: '$1 of free usage every month: Gemma 4 31B, Mistral Large 4, Nemotron' },
  { id: 'onomeo', name: 'Onomeo', logo: 'fav-onomeo', base: 'https://onomeo.com/v1', free: true, keyUrl: 'https://onomeo.com', hint: '', note: 'a shared free allowance across its free models' },
  { id: 'septor', name: 'Septor Labs', logo: 'fav-septor', base: 'https://api.septorlabs.com/v1', free: true, keyUrl: 'https://septorlabs.com', hint: '', note: 'zero-price models with a shared daily allowance' },
  { id: 'nabh', name: 'Nabh Cloud', logo: 'fav-nabh', base: 'https://api.nabh.cloud/v1', free: true, keyUrl: 'https://nabh.cloud', hint: '', note: 'monthly free credits (India); the list also shows paid-plan models' },
  { id: 'lucidity', name: 'Lucidity', logo: 'fav-lucidity', base: 'https://composite.lucidity.sh/v1', free: true, freeIf: /:free/i, keyUrl: 'https://lucidity.sh', hint: '', note: '1,500 routes; free :free ones (Synth 2.5 and more)' },
  { id: 'blockrun', name: 'BlockRun', logo: 'fav-blockrun', base: '/api/relay/blockrun', relay: true, free: true, freeIf: /free/i, keyUrl: 'https://blockrun.ai', hint: '', note: 'a free capacity lane next to paid GPT, Claude and open models' },
  { id: 'codestral', name: 'Codestral (Mistral)', logo: 'mistral-color', base: 'https://codestral.mistral.ai/v1', free: true, keyUrl: 'https://console.mistral.ai/codestral', hint: '', note: 'a separate free key just for Codestral, the Mistral coding model', prefer: ['codestral-latest'] },
  { id: 'arli', name: 'Arli AI', logo: 'fav-arli', base: 'https://api.arliai.com/v1', free: true, keyUrl: 'https://www.arliai.com/account', hint: '', note: 'free plan with smaller open models, flat monthly plans for the big ones' },
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
  { id: 'moonshot', name: 'Moonshot (Kimi)', logo: 'kimi-color', base: 'https://api.moonshot.ai/v1', free: false, keyUrl: 'https://platform.moonshot.ai/console/api-keys', hint: 'sk-…', note: 'Kimi K3.1 first-hand, strong at long pages' },
  { id: 'minimax', name: 'MiniMax', logo: 'minimax-color', base: 'https://api.minimax.io/v1', free: false, keyUrl: 'https://www.minimax.io/platform', hint: '', note: 'MiniMax M3 first-hand' },
  { id: 'xiaomi', name: 'Xiaomi MiMo', logo: 'xiaomimimo', base: 'https://api.xiaomimimo.com/v1', free: false, keyUrl: 'https://platform.xiaomimimo.com', hint: '', note: 'MiMo v2.6 Pro and Flash first-hand' },
  { id: 'perplexity', name: 'Perplexity', logo: 'perplexity-color', base: 'https://api.perplexity.ai', free: false, keyUrl: 'https://www.perplexity.ai/settings/api', hint: 'pplx-…', note: 'Sonar models that search the web as they answer' },
  { id: 'ai21', name: 'AI21 Labs', logo: 'ai21', base: 'https://api.ai21.com/studio/v1', free: false, keyUrl: 'https://studio.ai21.com/account/api-key', hint: '', note: 'Jamba models, long context' },
  { id: 'upstage', name: 'Upstage', logo: 'upstage-color', base: 'https://api.upstage.ai/v1', free: false, keyUrl: 'https://console.upstage.ai/api-keys', hint: 'up_…', note: 'Solar Pro 4 and Mini 4' },
  { id: 'stepfun', name: 'StepFun', logo: 'stepfun-color', base: '/api/relay/stepfun', relay: true, free: false, keyUrl: 'https://platform.stepfun.ai', hint: '', note: 'Step 3.7 and Step 5 first-hand' },
  { id: 'baichuan', name: 'Baichuan', logo: 'baichuan-color', base: 'https://api.baichuan-ai.com/v1', free: false, keyUrl: 'https://platform.baichuan-ai.com', hint: 'sk-…', note: 'Baichuan models first-hand' },
  { id: 'zhipu', name: 'Zhipu (China)', logo: 'zhipu-color', base: 'https://open.bigmodel.cn/api/paas/v4', free: true, freeIf: /flash/i, keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', hint: '', note: 'the mainland GLM endpoint: Flash models free, flagship GLM pay as you go' },
  { id: 'volcengine', name: 'Volcengine Ark', logo: 'volcengine-color', base: 'https://ark.cn-beijing.volces.com/api/v3', free: false, keyUrl: 'https://console.volcengine.com/ark', hint: '', note: 'ByteDance Doubao and Seed models (China)' },
  { id: 'byteplus', name: 'BytePlus ModelArk', logo: 'bytedance-color', base: 'https://ark.ap-southeast.bytepluses.com/api/v3', free: false, keyUrl: 'https://console.byteplus.com/ark', hint: '', note: 'ByteDance Seed models outside China, free tokens on sign-up' },
  { id: 'baidu', name: 'Baidu Qianfan', logo: 'baidu-color', base: 'https://qianfan.baidubce.com/v2', free: false, keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list', hint: 'bce-v3/…', note: 'ERNIE models first-hand' },
  { id: 'infini', name: 'Infinigence', logo: 'infinigence-color', base: 'https://cloud.infini-ai.com/maas/v1', free: false, keyUrl: 'https://cloud.infini-ai.com', hint: 'sk-…', note: 'open models on Chinese GPUs' },
  { id: 'ppio', name: 'PPIO', logo: 'ppio-color', base: 'https://api.ppinfra.com/v3/openai', free: false, keyUrl: 'https://ppio.com/settings/key-management', hint: 'sk_…', note: 'cheap Kimi, Hy4, DeepSeek, Qwen' },
  { id: 'ai302', name: '302.AI', logo: 'ai302-color', base: 'https://api.302.ai/v1', free: false, keyUrl: 'https://302.ai', hint: 'sk-…', note: 'one key for most commercial models, pay per use' },
  { id: 'aimlapi', name: 'AI/ML API', logo: 'aimlapi', base: 'https://api.aimlapi.com/v1', free: false, keyUrl: 'https://aimlapi.com/app/keys', hint: '', note: '1,500 models in one key' },
  { id: 'featherless', name: 'Featherless', logo: 'featherless-color', base: 'https://api.featherless.ai/v1', free: false, keyUrl: 'https://featherless.ai/account/api-keys', hint: 'rc_…', note: 'flat monthly price for thousands of open models' },
  { id: 'baseten', name: 'Baseten', logo: 'baseten', base: 'https://inference.baseten.co/v1', free: false, keyUrl: 'https://app.baseten.co/settings/api_keys', hint: '', note: 'fast hosted open models: DeepSeek, Kimi, GLM' },
  { id: 'parasail', name: 'Parasail', logo: 'parasail', base: 'https://api.parasail.io/v1', free: false, keyUrl: 'https://www.saas.parasail.io', hint: '', note: 'cheap open models, trial credit' },
  { id: 'venice', name: 'Venice', logo: 'venice-color', base: 'https://api.venice.ai/api/v1', free: false, keyUrl: 'https://venice.ai/settings/api', hint: '', note: 'private (no logs) open and frontier models' },
  { id: 'nscale', name: 'Nscale', logo: 'fav-nscale', base: 'https://inference.api.nscale.com/v1', free: false, keyUrl: 'https://console.nscale.com', hint: '', note: 'EU-hosted open models, starting credit' },
  { id: 'cortecs', name: 'Cortecs', logo: 'fav-cortecs', base: 'https://api.cortecs.ai/v1', free: false, keyUrl: 'https://cortecs.ai', hint: '', note: 'EU router (GDPR): Kimi, Gemini 4, open models' },
  { id: 'inferencenet', name: 'Inference.net', logo: 'inference', base: 'https://api.inference.net/v1', free: false, keyUrl: 'https://inference.net/dashboard/api-keys', hint: '', note: 'Claude and open models, pay as you go' },
  { id: 'stdcompute', name: 'Standard Compute', logo: 'fav-stdcompute', base: 'https://api.stdcmpt.com/v1', free: false, keyUrl: 'https://stdcmpt.com', hint: '', note: 'flat-rate Claude, GPT and open models' },
  { id: 'mancer', name: 'Mancer', logo: 'fav-mancer', base: 'https://neuro.mancer.tech/oai/v1', free: false, keyUrl: 'https://mancer.tech', hint: '', note: 'cheap DeepSeek V4 Flash' },
  { id: 'friendli', name: 'FriendliAI', logo: 'friendli', base: '/api/relay/friendli', relay: true, free: false, keyUrl: 'https://friendli.ai/suite', hint: 'flp_…', note: 'GLM 5.3 and Flash, very fast serving' },
  { id: 'avian', name: 'Avian', logo: 'fav-avian', base: '/api/relay/avian', relay: true, free: false, keyUrl: 'https://avian.io', hint: '', note: 'DeepSeek V4 Pro and Flash at low prices' },
  { id: 'sambanova', name: 'SambaNova', logo: 'sambanova-color', base: '/api/relay/sambanova', relay: true, free: false, keyUrl: 'https://cloud.sambanova.ai/apis', hint: '', note: 'very fast GPT-OSS 120B, GLM 5.3, Gemma 4' },
  { id: 'hpcai', name: 'HPC-AI', logo: 'fav-hpcai', base: '/api/relay/hpcai', relay: true, free: false, keyUrl: 'https://hpc-ai.com', hint: '', note: '$2 credit on sign-up' },
  { id: 'reka', name: 'Reka', logo: 'reka', base: 'https://api.reka.ai/v1', free: false, keyUrl: 'https://platform.reka.ai/apikeys', hint: '', note: 'Reka Flash and Core first-hand' },
  { id: 'jamai', name: 'JamAI Base', logo: 'fav-jamai', base: 'https://api.jamaibase.com/api/v1', free: false, keyUrl: 'https://cloud.jamaibase.com', hint: '', note: 'open models, starting credit' },
  { id: 'plugsky', name: 'PlugSky', logo: 'fav-plugsky', base: '/api/relay/plugsky', relay: true, free: false, keyUrl: 'https://plugsky.com', hint: 'sk-live-…', note: 'its own Micro, Lite and Plus models' },
  { id: 'clod', name: 'CLōD', logo: 'fav-clod', base: '/api/relay/clod', relay: true, free: false, keyUrl: 'https://clod.io', hint: '', note: 'open and frontier models, pay as you go' },
  { id: 'poe', name: 'Poe', logo: 'poe-color', base: 'https://api.poe.com/v1', free: false, keyUrl: 'https://poe.com/api_key', hint: '', note: '300 bots and models (GPT, Claude, Gemini, Grok) on your Poe points' },
  { id: 'glama', name: 'Glama', logo: 'glama', base: 'https://glama.ai/api/gateway/openai/v1', free: false, keyUrl: 'https://glama.ai/settings/gateway/api-keys', hint: '', note: 'a gateway to 300 models at provider prices' },
  { id: 'nanogpt', name: 'NanoGPT', logo: 'fav-nanogpt', base: 'https://nano-gpt.com/api/v1', free: false, keyUrl: 'https://nano-gpt.com/api', hint: '', note: '600 models, pay per prompt, no subscription' },
  { id: 'edenai', name: 'Eden AI', logo: 'fav-edenai', base: 'https://api.edenai.run/v3/llm', free: false, keyUrl: 'https://app.edenai.run/admin/api-settings', hint: '', note: '1,300 model routes from every big vendor, EU regions' },
  { id: 'atlascloud', name: 'Atlas Cloud', logo: 'atlascloud', base: 'https://api.atlascloud.ai/v1', free: false, keyUrl: 'https://www.atlascloud.ai/console/api-keys', hint: '', note: '140+ models: DeepSeek, Qwen, Gemini, Claude' },
  { id: 'gmicloud', name: 'GMI Cloud', logo: 'gmicloud', base: 'https://api.gmi-serving.com/v1', free: false, keyUrl: 'https://console.gmicloud.ai', hint: '', note: 'open models on their own GPUs' },
  { id: 'akashml', name: 'AkashML', logo: 'akashchat-color', base: 'https://api.akashml.com/v1', free: false, keyUrl: 'https://akashml.com', hint: '', note: 'open models on the decentralised Akash network' },
  { id: 'infermatic', name: 'Infermatic', logo: 'infermatic-color', base: 'https://api.totalgpt.ai/v1', free: false, keyUrl: 'https://infermatic.ai', hint: '', note: 'flat monthly plan for open models' },
  { id: 'digitalocean', name: 'DigitalOcean', logo: 'digitalocean', base: 'https://inference.do-ai.run/v1', free: false, keyUrl: 'https://cloud.digitalocean.com/gen-ai/model-access-keys', hint: '', note: 'Gradient serverless inference: open models, OpenAI and Claude' },
  { id: 'vultr', name: 'Vultr', logo: 'fav-vultr', base: 'https://api.vultrinference.com/v1', free: false, keyUrl: 'https://my.vultr.com/inference/', hint: '', note: 'serverless open models in Vultr regions' },
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
  key = key || p.anonKey || '';
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
  if (p.hide) list = list.filter(m => !p.hide.test(m.id));
  if (!key) list = list.filter(m => !m.needKey);
  // keyless services with a mixed catalog (Kilo): without a key only the free models answer
  if (!key && p.noKey && p.freeIf) list = list.filter(m => p.freeIf.test(m.id));
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
    return { id: m.id, name: rest.length ? rest.join(': ') : clean, vendor: rest.length ? vendor : '', ctx: m.ctx, paid, price: paid && m.price?.every(v => v >= 0) ? m.price : null };
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
  key = key || p.anonKey || '';
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
  if (!r.ok) { const e = Error(await errorText(r)); e.status = r.status; e.retryAfter = +r.headers.get('retry-after') || 0; throw e; }
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

// Plain multi-turn chat (chat.js): the whole conversation goes as is, the answer streams through onDelta.
// `signal` stops it; the free AI accepts up to 50 messages, so only the latest 40 are sent.
export async function converse(p, key, model, system, history, onDelta, signal){
  // the editor's token counter stays out of it: the chat is its own place
  const prev = aiCancel.signal; aiCancel.signal = signal || null;
  const messages = history.slice(-40).map(m => ({ role: m.role, content: m.content }));
  try { return await once(p, key, model, system, messages, onDelta); }
  finally { aiCancel.signal = prev; }
}

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
