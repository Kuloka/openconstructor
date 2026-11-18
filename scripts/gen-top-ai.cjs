// builds public/top-ai.html from numbers copied off public leaderboards on Nov 18, 2026
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..') + '/';
let uid = 0;
const logo = name => {
  const f = ROOT + 'src/logos/' + name + '.svg';
  if (!name || !fs.existsSync(f)) return '';
  const p = 'l' + (++uid) + '-';
  let s = fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '').trim();
  s = s.replace(/id="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#/g, `url(#${p}`).replace(/href="#/g, `href="#${p}`);
  s = s.replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="20" height="20" aria-hidden="true">`);
  return `<span class="lg">${s}</span>`;
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const V = { // maker → logo
  Anthropic: 'claude-color', OpenAI: 'openai', Google: 'gemini-color', Meta: 'meta-color', Alibaba: 'qwen-color', Moonshot: 'kimi-color', Kimi: 'kimi-color',
  DeepSeek: 'deepseek-color', Tencent: 'hunyuan-color', 'Z.ai': 'zai', StepFun: 'stepfun-color', Xiaomi: 'xiaomimimo', SpaceXAI: 'xai',
};
const P = { // provider id → [name, logo]
  anthropic: ['Anthropic', 'claude-color'], openai: ['OpenAI', 'openai'], gemini: ['Google AI Studio', 'gemini-color'], openrouter: ['OpenRouter', 'openrouter'],
  alibaba: ['Alibaba Model Studio', 'bailian-color'], moonshot: ['Moonshot', 'kimi-color'], deepseek: ['DeepSeek', 'deepseek-color'], zai: ['Z.ai', 'zai'],
  baseten: ['Baseten', 'baseten'], deepinfra: ['DeepInfra', 'deepinfra-color'], gmicloud: ['GMI Cloud', 'gmicloud'], xai: ['xAI', 'xai'],
};
const via = ids => ids.map(id => `<span class="pv" title="${P[id][0]}">${logo(P[id][1])}</span>`).join('');

// combined table: WebDev Arena order, other sources alongside (— = not in that top list)
const MODELS = [
  ['Claude Fable 5.2', 'Anthropic', 1824, null, 65, null, ['anthropic', 'openrouter']],
  ['Claude Opus 5.5', 'Anthropic', 1818, 1507, 59, 7, ['anthropic', 'openrouter']],
  ['GPT-6.2 Astra', 'OpenAI', 1781, null, 62, null, ['openai', 'openrouter']],
  ['Claude Sonnet 5.5', 'Anthropic', 1773, null, 55, null, ['anthropic', 'openrouter']],
  ['Gemini 4 Carbon', 'Google', 1769, 1526, 60, null, ['gemini', 'openrouter']],
  ['GPT-6.2 Sol', 'OpenAI', 1757, null, 57, null, ['openai', 'openrouter']],
  ['Qwen4-Max', 'Alibaba', 1750, null, 43, null, ['alibaba', 'openrouter']],
  ['GPT-6.1 Sol', 'OpenAI', 1744, null, null, null, ['openai', 'openrouter']],
  ['Muse Wonder', 'Meta', 1723, 1511, 50, null, []],
  ['Gemini 4 Hydrogen', 'Google', 1703, 1490, 54, null, ['gemini', 'openrouter']],
  ['Kimi K3.1 Pro', 'Moonshot', 1684, null, 46, null, ['moonshot', 'baseten', 'openrouter']],
];
const n = v => v == null ? '<span class="na">—</span>' : v;
const rowsM = MODELS.map((m, i) => `<tr><td class="rk">${i + 1}</td><td><span class="nm">${logo(V[m[1]])}<b>${esc(m[0])}</b></span><small>${esc(m[1])}</small></td><td class="num score">${m[2]}</td><td class="num">${n(m[3])}</td><td class="num">${n(m[4])}</td><td class="num">${m[5] ? '#' + m[5] : n(null)}</td><td>${m[6].length ? via(m[6]) : '<span class="na">no public API in our list</span>'}</td></tr>`).join('\n    ');

const table = (rows, head) => `<div class="tbl"><table>\n    <tr>${head.map(h => `<th${/^(Score|Index|Tokens|Change|Cost|Time)/.test(h) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr>\n    ${rows.join('\n    ')}\n  </table></div>`;
const arena = [['Gemini 4 Carbon', 'Google', 1526, 1], ['Gemini 4 Argon', 'Google', 1522, 1], ['Muse Wonder', 'Meta', 1511], ['Claude Opus 5.5', 'Anthropic', 1507], ['Claude Fable 5', 'Anthropic', 1504], ['Claude Opus 4.6', 'Anthropic', 1503], ['Claude Fable 5.1', 'Anthropic', 1502], ['Claude Opus 4.7', 'Anthropic', 1501], ['Gemini 3.8 Flash', 'Google', 1497, 1], ['Muse Spark 1.3', 'Meta', 1497]]
  .map((m, i) => `<tr><td class="rk">${i + 1}</td><td><span class="nm">${logo(V[m[1]])}<b>${m[0]}</b>${m[3] ? ' <em class="pre">preliminary</em>' : ''}</span></td><td>${m[1]}</td><td class="num">${m[2]}</td></tr>`);
const aa = [['Claude Fable 5.2 Max', 'Anthropic', 65, '$26.54', '41.1'], ['GPT-6.2 Astra Max', 'OpenAI', 62, '$4.00', '12.9'], ['Gemini 4 Carbon High', 'Google', 60, '$7.76', '34.5'], ['Claude Opus 5.5 Max', 'Anthropic', 59, '$10.04', '24.6'], ['GPT-6.2 Sol Max', 'OpenAI', 57, '$1.01', '8.0'], ['Claude Sonnet 5.5 Max', 'Anthropic', 55, '$10.02', '32.2'], ['Gemini 4 Hydrogen Xhigh', 'Google', 54, '$3.16', '15.0'], ['GPT-6.1 Terra Max', 'OpenAI', 51, '$0.96', '14.5'], ['Gemini 4 Argon High', 'Google', 50, '$4.97', '29.3'], ['Kimi K3.1 Pro', 'Kimi', 46, '$3.68', '38.4']]
  .map((m, i) => `<tr><td class="rk">${i + 1}</td><td><span class="nm">${logo(V[m[1]])}<b>${m[0]}</b></span></td><td class="num score">${m[2]}</td><td class="num">${m[3]}</td><td class="num">${m[4]} min</td></tr>`);
const orr = [['DeepSeek V4.1 Flash 1017', 'DeepSeek', '61.9T', '+15%'], ['Hy4 Flash', 'Tencent', '22.8T', 'new'], ['DeepSeek V4.1 Flash', 'DeepSeek', '15.9T', '−6%'], ['Hy4', 'Tencent', '14.3T', '−24%'], ['GLM 5.3 Flash', 'Z.ai', '11.5T', '+2%'], ['GPT-6 Luna', 'OpenAI', '8.38T', '+19%'], ['Claude Opus 5.5', 'Anthropic', '7.53T', '+11%'], ['Step 5 Preview', 'StepFun', '6.57T', '−5%'], ['MiMo-V2.6-Flash', 'Xiaomi', '4.11T', '+44%'], ['GLM 5.3', 'Z.ai', '3.62T', '−1%']]
  .map((m, i) => `<tr><td class="rk">${i + 1}</td><td><span class="nm">${logo(V[m[1]])}<b>${m[0]}</b></span></td><td>${m[1]}</td><td class="num">${m[2]}</td><td class="num">${m[3]}</td></tr>`);
const hosts = [
  ['Kimi K3.1 Pro', 'PrimaLabs — $2.94 / 9.9 min', 'Lithos AI (Ultra) — 4.3 min / $6.32', 'Baseten — $3.26 / 7.1 min'],
  ['DeepSeek V4.1 Flash 1017', 'DeepInfra — $0.19 / 18.0 min', 'Baseten (Fast) — 2.6 min / $2.32', 'GMI Cloud — $0.30 / 10.8 min'],
  ['GLM-5.3', 'Multiverse Computing — $1.48 / 18.8 min', 'Supernova (FP4, Fast) — 5.1 min / $13.49', 'Bitdeer AI — 6.9 min / $3.59'],
].map(h => `<tr><td><b>${h[0]}</b></td><td>${h[1]}</td><td>${h[2]}</td><td>${h[3]}</td></tr>`);

const FREE = [['ovh', 'OVHcloud AI Endpoints'], ['llm7', 'LLM7'], ['kilo', 'Kilo Gateway'], ['pollinations-open', 'Pollinations'], ['freeai', 'Free.ai'], ['aihorde', 'AI Horde']];
const FREEKEY = [['groq', 'Groq'], ['cerebras', 'Cerebras'], ['gemini', 'Google AI Studio'], ['openrouter', 'OpenRouter (:free models)'], ['nvidia', 'NVIDIA NIM'], ['mistral', 'Mistral'], ['codestral', 'Codestral'], ['zai', 'Z.ai (GLM Flash)']];
const provSrc = fs.readFileSync(ROOT + 'providers.js', 'utf8');
const plogo = id => (provSrc.match(new RegExp(`id: '${id}'[^\\n]*?logo: '([^']*)'`)) || [])[1];
const chips = list => list.map(([id, name]) => `<span class="chip">${logo(plogo(id)) || ''}${esc(name)}</span>`).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Top AI models and providers — November 2026 · openconstructor</title>
<link rel="canonical" href="https://openconstructor.pw/top-ai">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4">
<meta name="description" content="The best AI models and providers in November 2026, put together from open leaderboards: Arena (text and WebDev), Artificial Analysis and OpenRouter usage. With sources and dates.">
<meta name="theme-color" content="#0a0a0a">
<meta property="og:title" content="Top AI models and providers — November 2026">
<meta property="og:description" content="Four open leaderboards in one place: which models build the best websites, which are smartest, which people actually use, and where to run them.">
<meta property="og:url" content="https://openconstructor.pw/top-ai">
<meta property="og:image" content="https://openconstructor.pw/og-2.png">
<link rel="stylesheet" href="/pages.css">
<style>
  main.wide { max-width: 1120px; }
  .top { max-width: 1120px; }
  .tbl { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .tbl table { min-width: 720px; font-size: 14px; }
  .tbl th { position: sticky; top: 0; background: #1a1a1a; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
  .tbl tr:last-child td { border-bottom: 0; }
  .tbl td small { display: block; margin-left: 28px; color: var(--muted); font-size: 12px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rk { color: var(--muted); font: 600 13px ui-monospace, Consolas, monospace; }
  .score { color: var(--head); font-weight: 600; }
  .na { color: #555; }
  .nm { display: inline-flex; align-items: center; gap: 8px; }
  .lg { display: inline-grid; place-items: center; width: 20px; height: 20px; flex: none; color: var(--head); }
  .lg svg { display: block; width: 20px; height: 20px; border-radius: 4px; }
  .pv { display: inline-grid; place-items: center; width: 28px; height: 28px; margin-right: 4px; border: 1px solid var(--line); border-radius: 7px; background: #111; }
  .pre { color: var(--muted); font-size: 11px; font-style: normal; }
  .picks { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 18px 0; }
  .picks div { padding: 16px 18px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .picks em { color: var(--muted); font: 600 11px ui-monospace, Consolas, monospace; font-style: normal; letter-spacing: .08em; text-transform: uppercase; }
  .picks b { display: flex; align-items: center; gap: 8px; margin: 6px 0 4px; color: var(--head); font-size: 16px; }
  .picks p { margin: 0; font-size: 13.5px; line-height: 1.55; }
  .picks a { color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 18px; }
  .chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--head); font-size: 14px; }
  .src { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(440px, 100%), 1fr)); gap: 0 20px; }
  .grid2 > section { min-width: 0; }
  @media (max-width: 520px) { .grid2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header class="top">
  <a class="home" href="/"><img src="/favicon.svg" alt="" width="24" height="24"><span><i>open</i>constructor</span></a>
  <nav aria-label="Guides">
    <a href="/gallery">Gallery</a>
    <a href="/top-ai" aria-current="page">Top AI</a>
    <a href="/ai-models">AI models tested</a>
    <a href="/components">Components</a>
    <a href="/changelog">What's new</a>
  </nav>
</header>
<main class="wide">
  <div class="kicker">Updated November 18, 2026 · from open leaderboards</div>
  <h1>Top AI models and providers</h1>
  <p class="lead">We don't vote here. This page puts four public leaderboards side by side: people's blind votes on <a href="https://arena.ai/leaderboard/text">Arena</a>, its <a href="https://arena.ai/leaderboard/webdev">WebDev</a> board for building websites, the <a href="https://artificialanalysis.ai/leaderboards/models">Artificial Analysis</a> intelligence index, and what developers actually spend tokens on, from <a href="https://openrouter.ai/rankings">OpenRouter</a>. Every number links to where it came from.</p>

  <div class="picks">
    <div><em>Builds the best sites</em><b>${logo('claude-color')}Claude Fable 5.2</b><p>#1 on WebDev Arena, 1824. <a href="https://arena.ai/leaderboard/webdev">source</a></p></div>
    <div><em>People like it most</em><b>${logo('gemini-color')}Gemini 4 Carbon</b><p>#1 on the Arena text board, 1526 (preliminary). <a href="https://arena.ai/leaderboard/text">source</a></p></div>
    <div><em>Smartest</em><b>${logo('claude-color')}Claude Fable 5.2</b><p>65 on the Artificial Analysis index. <a href="https://artificialanalysis.ai/leaderboards/models">source</a></p></div>
    <div><em>Most used</em><b>${logo('deepseek-color')}DeepSeek V4.1 Flash</b><p>61.9T tokens a week on OpenRouter. <a href="https://openrouter.ai/rankings">source</a></p></div>
    <div><em>Best open weights</em><b>${logo('kimi-color')}Kimi K3.1 Pro</b><p>Index 46, the top open model. <a href="https://artificialanalysis.ai/leaderboards/models">source</a></p></div>
  </div>

  <h2>Top models for building websites</h2>
  <p>Ordered by WebDev Arena, because that is the job openconstructor gives them. The other columns show the same model on the other boards; a dash means it is not in that board's top list. Each model is listed once, at its best setting.</p>
  ${table([rowsM], ['#', 'Model', 'WebDev Arena', 'Arena text', 'AA index', 'OpenRouter', 'Use it via'])}
  <p class="src">Sources: <a href="https://arena.ai/leaderboard/webdev">WebDev Arena</a> (Nov 18) · <a href="https://arena.ai/leaderboard/text">Arena text</a> (Nov 11, 9.1M votes) · <a href="https://artificialanalysis.ai/leaderboards/models">Artificial Analysis</a> · <a href="https://openrouter.ai/rankings">OpenRouter</a> (week to Nov 17). "Use it via" lists the first-party API and the services in openconstructor that serve it.</p>

  <div class="grid2">
    <section>
      <h2>Arena — blind votes</h2>
      <p>Two anonymous answers, people pick the better one. Elo-style score.</p>
      ${table(arena, ['#', 'Model', 'Maker', 'Score'])}
      <p class="src"><a href="https://arena.ai/leaderboard/text">arena.ai/leaderboard/text</a> · updated Nov 11, 2026</p>
    </section>
    <section>
      <h2>Artificial Analysis — intelligence</h2>
      <p>A fixed set of hard evals. Cost and time are per full run.</p>
      ${table(aa, ['#', 'Model', 'Index', 'Cost', 'Time'])}
      <p class="src"><a href="https://artificialanalysis.ai/leaderboards/models">artificialanalysis.ai</a> · copied Nov 18, 2026</p>
    </section>
  </div>

  <h2>What people actually use</h2>
  <p>Tokens processed on OpenRouter in a week. Cheap, fast models win here — real apps send a lot of small requests.</p>
  ${table(orr, ['#', 'Model', 'Maker', 'Tokens', 'Change'])}
  <p class="src"><a href="https://openrouter.ai/rankings">openrouter.ai/rankings</a> · 7 days to Nov 17, 2026</p>

  <h2>Top providers</h2>
  <h3>Free, without any key</h3>
  <p>Work in openconstructor straight away, no sign-up. Slower and smaller models than the top of the boards — <a href="/ai-models">our tests</a> show which ones build decent pages.</p>
  <div class="chips">${chips(FREE)}</div>
  <h3>Free with a key</h3>
  <p>A free account and an API key; daily or per-minute limits.</p>
  <div class="chips">${chips(FREEKEY)}</div>
  <h3>Cheapest and fastest hosts for open models</h3>
  <p>Open models run on many clouds at different prices. Artificial Analysis runs the same eval on each host; cost and time are for that full run.</p>
  ${table(hosts, ['Model', 'Cheapest', 'Fastest', 'Good balance'])}
  <p class="src"><a href="https://artificialanalysis.ai/leaderboards/providers">artificialanalysis.ai/leaderboards/providers</a> · copied Nov 18, 2026</p>

  <h2>How this page is made</h2>
  <p>Numbers are copied by hand from the four public pages on the dates shown and are not adjusted. Boards change every few days, so check the source before a big decision. "Preliminary" means Arena has too few votes yet for a stable score. Model names are the makers' own; settings such as "High" or "Max" are folded into one row per model. Something wrong or out of date? Tell us on the <a href="/changelog">changelog</a> page.</p>
  <p><a href="/">Try the top models in openconstructor →</a></p>
</main>
</body>
</html>
`;
fs.writeFileSync(ROOT + 'public/top-ai.html', html);
console.log('ok', html.length);
