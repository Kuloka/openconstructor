// Site-quality eval: the real editor in headless Chrome, the free AI answered by the same Workers AI model
// (gpt-oss-120b) through scripts/eval/ai-worker.js — no quotas. Saves page HTML + desktop/mobile screenshots
// and simple automatic checks to scripts/eval/out/<label>/.
//   1) npx wrangler dev -c scripts/eval/wrangler.eval.jsonc     (AI on 127.0.0.1:8799)
//   2) npm run dev                                              (editor on 127.0.0.1:5173)
//   3) node scripts/eval/run.mjs <label> [ONLY=substring] [N=parallel]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// .env.eval in the project root (git-ignored): EVAL_KEY=…, optional EVAL_URL / EVAL_MODEL
if (existsSync('.env.eval')) for (const line of readFileSync('.env.eval', 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
if (process.env.EVAL_KEY?.startsWith('AIza')) { process.env.EVAL_URL ||= 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; process.env.EVAL_MODEL ||= 'gemini-2.5-flash'; }
if (process.env.EVAL_KEY?.startsWith('sk-or-')) { process.env.EVAL_URL ||= 'https://openrouter.ai/api/v1/chat/completions'; process.env.EVAL_MODEL ||= 'openai/gpt-oss-120b:free'; }
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editor, sleep } from '../../tests/e2e/lib.mjs';

const AI = process.env.EVAL_AI || 'http://127.0.0.1:8799/';
const URL_ = process.env.OC_URL || 'http://127.0.0.1:5173/';
const label = process.argv[2] || 'run-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = resolve('scripts/eval/out', label);
mkdirSync(OUT, { recursive: true });

export const PROMPTS = [
  ['coffee', 'Сделай сайт для кофейни «Зерно» в Казани: меню с ценами, часы работы, адрес, бронь столика'],
  ['saas', 'Landing page for a SaaS that turns customer calls into CRM notes automatically'],
  ['portfolio', 'Сайт-портфолио для фотографа свадеб, Мария Ковалёва'],
  ['dental', 'Сайт стоматологической клиники: услуги, цены, врачи, запись на приём'],
  ['fitness', 'Website for a boutique fitness studio with class schedule and membership pricing'],
  ['agency', 'Лендинг для дизайн-студии, которая делает брендинг для стартапов'],
  ['shop', 'Интернет-магазин керамической посуды ручной работы'],
  ['app', 'Landing page for a mobile budgeting app for students'],
  ['school', 'Сайт онлайн-школы английского языка для детей'],
  ['realestate', 'Сайт агентства недвижимости в Сочи: квартиры у моря'],
];

const only = process.env.ONLY || '';
const todo = PROMPTS.filter(([id]) => !only || only.split(',').includes(id));

const aiRoute = {
  match: u => /\/api\/ai(\?|$)/.test(u),
  handle: async rq => {
    const d = JSON.parse(rq.postData || '{}');
    // EVAL_KEY (+ EVAL_URL, EVAL_MODEL): any OpenAI-compatible API instead of the local Workers AI worker
    const KEY = process.env.EVAL_KEY;
    // free tiers answer 429 (per-minute limit) and 503 (overloaded) a lot: back off and retry,
    // then fall back to the next model in EVAL_FALLBACK (comma-separated)
    const models = [process.env.EVAL_MODEL || 'openai/gpt-oss-120b', ...(process.env.EVAL_FALLBACK || (process.env.EVAL_KEY?.startsWith('AIza') ? 'gemini-2.5-flash-lite,gemini-2.0-flash' : '')).split(',').filter(Boolean)];
    let r;
    if (!KEY) r = await fetch(AI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: d.messages, max_tokens: Math.min(d.max_tokens || 8000, 8000) }) });
    else outer: for (const model of models) for (let i = 0; i < 4; i++) {
      r = await fetch(process.env.EVAL_URL || 'https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ model, messages: d.messages, max_tokens: Math.min(d.max_tokens || 8000, 8000), ...(/gpt-oss|gemini-2\.5/.test(model) ? { reasoning_effort: 'low' } : {}) }) }).catch(() => null);
      if (r?.ok) { if (model !== models[0]) stats.fallback = (stats.fallback || 0) + 1; break outer; }
      if (r && ![429, 500, 502, 503, 504].includes(r.status)) break outer;
      stats.retries = (stats.retries || 0) + 1;
      await sleep([3000, 8000, 20000, 30000][i]);
    }
    if (!r) return { status: 502, body: JSON.stringify({ error: { message: 'eval: upstream unreachable' } }) };
    const j = await r.json();
    stats.calls++; stats.in += j.usage?.prompt_tokens || 0; stats.out += j.usage?.completion_tokens || 0;
    if (!r.ok) return { status: 502, body: JSON.stringify(j) };
    const text = j.choices?.[0]?.message?.content || '';
    if (!d.stream) return { body: JSON.stringify(j) };
    const chunk = o => 'data: ' + JSON.stringify(o) + '\n\n';
    return { type: 'text/event-stream', body: chunk({ choices: [{ delta: { content: text }, finish_reason: null }] }) + chunk({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: j.usage }) + 'data: [DONE]\n\n' };
  },
};
let stats = { calls: 0, in: 0, out: 0 };

// automatic checks on the exported page, run inside Chrome at a given width
const CHECKS = `(() => {
  const lum = c => { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\\(.*, 0\\)|transparent/.test(b)) return b; } return 'rgb(255,255,255)'; };
  let lowContrast = 0, texts = 0;
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,li,button,span,td')) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity === 0 || getComputedStyle(el).backgroundImage !== 'none') continue;
    texts++; const a = lum(s.color), b = lum(bgOf(el)); if (a == null || b == null) continue;
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); if (ratio < 3) lowContrast++;
  }
  const W = document.documentElement.clientWidth;
  const overflow = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 2 && getComputedStyle(e).position !== 'fixed'; }).length;
  const imgs = [...document.images]; const broken = imgs.filter(i => i.complete && !i.naturalWidth).length;
  const fonts = new Set([...document.querySelectorAll('h1,h2,p,a,button')].map(e => getComputedStyle(e).fontFamily.split(',')[0].trim())).size;
  const sizes = new Set([...document.querySelectorAll('body *')].map(e => getComputedStyle(e).fontSize)).size;
  return { height: document.documentElement.scrollHeight, sections: document.querySelectorAll('section,header,footer').length, texts, lowContrast, overflow, images: imgs.length, broken, fonts, fontSizes: sizes };
})()`;

async function shoot(ed, file, width, name){
  await ed.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await ed.send('Page.navigate', { url: pathToFileURL(file).href }); await sleep(3500);
  // scroll through once so scroll-driven reveals settle, then back up
  await ed.ev(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); return 1; })()`); await sleep(800);
  const checks = await ed.ev(CHECKS);
  const h = Math.min(checks.height, width < 600 ? 9000 : 7000);
  await ed.send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile: width < 600 });
  // scroll-timeline animations depend on the viewport: with the whole page in view everything is revealed
  await sleep(1200);
  const shot = await ed.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(shot.result.data, 'base64'));
  return checks;
}

async function one([id, prompt]){
  const t0 = Date.now(); const before = { ...stats };
  const ed = await editor(URL_, { connect: false, routes: [aiRoute], lang: 'ru', port: 9300 + Math.floor(Math.random() * 600) });
  try {
    await ed.ask(prompt);
    await sleep(3000);
    const ok = await ed.until(`!document.querySelector('.message.thinking:not(.folded)') && JSON.parse(localStorage.getItem('form-canvas-v3') || '[]').some(x => x.full)`, 420000);
    await sleep(4000); // photos resolve after the answer
    const html = await ed.ev(`window.__oc.studio.html()`);
    const file = join(OUT, `${id}.html`); writeFileSync(file, html || '');
    const desktop = html ? await shoot(ed, file, 1440, id) : null;
    const mobile = html ? await shoot(ed, file, 390, id + '-mobile') : null;
    const row = { id, prompt, ok, sec: Math.round((Date.now() - t0) / 1000), calls: stats.calls - before.calls, bytes: (html || '').length, desktop, mobile: mobile && { overflow: mobile.overflow, lowContrast: mobile.lowContrast }, errors: ed.errors.slice(0, 3) };
    console.log(JSON.stringify(row));
    return row;
  } catch (err) { console.log(JSON.stringify({ id, error: String(err.message || err) })); return { id, error: String(err.message || err) }; }
  finally { ed.close(); }
}

// free API tiers allow ~10 requests a minute and one swarm page already fires ~8 at once: one page at a time
const N = +process.env.N || (process.env.EVAL_KEY ? 1 : 3), rows = [];
for (let i = 0; i < todo.length; i += N) rows.push(...await Promise.all(todo.slice(i, i + N).map(one)));
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ label, at: new Date().toISOString(), stats, rows }, null, 2));
console.log(`\n${label}: ${rows.length} pages, ${stats.calls} AI calls, ${stats.in} in / ${stats.out} out tokens → ${OUT}`);
process.exit(0);
