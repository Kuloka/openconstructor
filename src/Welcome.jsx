import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import logoSvg from './logo.svg?raw';
import { templates } from './templates';
import { t as tr, LANGS, lang, setLang } from '../i18n.js';
import { loadTemplate, prefillPrompt, studio } from '../studio.js';
import { APP_EXAMPLES, appPreview } from '../apps.js';
import { openCode } from '../code.js';
import { go as goMode } from '../modes.js';
import { startChat } from '../chat.js';
import { pill } from '../pill.js';
import { startNew } from '../local-projects.js';
import { openAuth, user as authUser } from '../auth.js';
import { openDonate } from '../donate.js';
import { track } from '../track.js';
import { PROVIDERS } from '../providers.js';
import { reveal, tiltIn, countUp } from './home-fx.js';
import { swarmGlyph } from '../swarm-glyph.js';
import './welcome.css';

const Logo = ({ size = 28 }) => <span className="wl-logo" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
// the same mark, every pixel numbered (--d) so the CTA can ripple through it
const PIXEL_LOGO = (() => { let i = 0; return logoSvg.replace(/<rect /g, () => `<rect style="--d:${i++}" `); })();
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICO = d => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  build: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/>',
  code: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
};

const EXAMPLES = [
  'Coffee shop landing page with menu and reviews',
  'Sign-up form with social logins',
  'Product card with price and add-to-cart',
  'Dark analytics dashboard',
];
const HERO_MODES = [
  { id: 'build', label: 'Build', icon: ICO(ICONS.build),
    placeholder: 'Describe what to build… e.g. a coffee shop landing page', button: 'Build ✦', hint: 'A page on the canvas: edit any block, export HTML, React or Roblox.', examples: null },
  { id: 'code', label: 'Code', icon: ICO(ICONS.code),
    placeholder: 'Describe an app… e.g. an expense tracker', button: 'Make app ✦', hint: 'A working mini-app with logic: it runs right away, errors go back to the AI.', examples: ['Expense tracker with categories', 'Flashcards for learning words', 'Workout timer with rounds', 'Snake game'] },
  { id: 'chat', label: 'Chat', icon: ICO(ICONS.chat),
    placeholder: 'Ask anything…', button: 'Send', hint: 'A plain chat with any model — Claude, GPT, Gemini and others.', examples: ['Explain how CSS grid works', 'Ideas for a landing page headline', 'Write a short welcome email for new users', 'Fix this JavaScript error'] },
];

// ─── Template thumbnail: the same page as in the editor, scaled to the card ───
function tplDoc(t){
  const body = t.items.map(i => i.full
    ? `<div style="position:absolute;left:0;top:${i.y}px;width:${t.page.w}px">${i.code}</div>`
    : `<div style="position:absolute;left:${i.x}px;top:${i.y}px;padding:16px">${i.code}</div>`).join('');
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;overflow:hidden;background:${t.page.bg};color:#eee;font-family:system-ui}</style></head><body><div style="position:relative;width:${t.page.w}px;height:${t.page.h}px">${body}</div></body></html>`;
}
function Thumb({ t }){
  const box = useRef(null);
  const [scale, setScale] = useState(.2);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(Math.max(e.contentRect.width / t.page.w, e.contentRect.height / t.page.h)));
    ro.observe(box.current); return () => ro.disconnect();
  }, [t.page.w, t.page.h]);
  return <div className="wl-thumb" ref={box}><iframe title={t.name} sandbox="" tabIndex={-1} loading="lazy" srcDoc={tplDoc(t)} style={{ width: t.page.w, height: t.page.h, transform: `scale(${scale})` }} /></div>;
}

// ─── The stage: three AI cursors build a page on a canvas, on repeat. ───
// Whatever is typed into the hero prompt becomes the headline of the page being built, live.
const SHOWS = [
  { prompt: 'Coffee shop landing page with menu and reviews', brand: 'Bean & Co', slug: 'bean-co', badge: 'Fresh roast daily', title: 'Coffee worth waking up for', sub: 'Single-origin beans, roasted every morning two streets away.', cta: 'See the menu', accent: '#b07a45', cards: ['Espresso bar', 'Fresh pastries', '4.9 ★ reviews'] },
  { prompt: 'Landing page for a fitness app', brand: 'Pulse', slug: 'pulse', badge: 'New: sleep-aware plans', title: 'Train smarter, not longer', sub: 'Plans that adapt to your week, your sleep and your mood.', cta: 'Start free', accent: '#16a34a', cards: ['Adaptive plans', 'Live coaching', 'Progress charts'] },
  { prompt: 'Homepage for an analytics startup', brand: 'Metricly', slug: 'metricly', badge: '50+ integrations', title: 'Every number, one calm dashboard', sub: 'Connect your tools in minutes and see what actually moves.', cta: 'Book a demo', accent: '#6f60f2', cards: ['50+ sources', 'Real-time alerts', 'Team reports'] },
  { prompt: 'Portfolio for a product designer', brand: 'Mira Kova', slug: 'mira', badge: 'Open to projects', title: 'I design products people keep', sub: 'Ten years of apps, brands and systems for teams that ship.', cta: 'View work', accent: '#2563eb', cards: ['Case studies', 'Design systems', 'Say hello'] },
];
const AGENTS = [
  { name: 'Navbar', color: '#a79dff' },
  { name: 'Hero', color: '#60a5fa' },
  { name: 'Features', color: '#34d399' },
];
const OFF = [112, 120];
// where each cursor stands in each phase (% of the page): 0 reset · 1 plan · 2 outlines · 3 nav · 4 typing · 5 hero rest · 6–8 cards · 9 done
function cursorAt(a, ph, typedShare){
  if (ph < 2 || ph >= 9) return OFF;
  if (a === 0) return ph === 2 ? [22, 7] : [86, 7];
  if (a === 1) { if (ph <= 3) return [30, 24]; if (ph === 4) return [22 + 58 * typedShare, 34]; return [60, 52]; }
  return [[18, 74], [18, 74], [18, 74], [18, 74], [22, 80], [53, 80], [84, 80]][ph - 2] || [84, 80];
}
const CursorSvg = ({ color }) => <svg viewBox="0 0 16 20" width="18" height="22" aria-hidden="true"><path d="M1 1v15.5l4.2-4 2.9 6.6 2.9-1.3-2.9-6.4H14z" fill={color} stroke="#0a0a0b" strokeWidth="1.4" strokeLinejoin="round"/></svg>;

function Stage({ text }){
  const ref = useRef(null);
  const [show, setShow] = useState(0);
  const [ph, setPh] = useState(calm() ? 9 : 0);
  const [typed, setTyped] = useState(0);
  const [secs, setSecs] = useState(0);
  const custom = text.trim();
  const base = SHOWS[show];
  const s = { ...base, title: custom || tr(base.title), prompt: custom || tr(base.prompt), sub: tr(base.sub), badge: tr(base.badge), cta: tr(base.cta), cards: base.cards.map(c => tr(c)) };
  const titleShown = ph < 4 ? '' : ph === 4 ? s.title.slice(0, typed) : s.title;
  const share = s.title.length ? Math.min(1, typed / s.title.length) : 1;

  useEffect(() => {
    if (calm()) return;
    let alive = true, visible = true, wake = null;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && wake) { wake(); wake = null; } });
    io.observe(ref.current);
    const wait = ms => new Promise(r => setTimeout(r, ms)).then(() => visible ? 0 : new Promise(r => { wake = r; }));
    (async () => {
      let n = 0;
      while (alive) {
        setShow(n % SHOWS.length); setPh(0); setTyped(0); setSecs(0);
        const t0 = performance.now();
        const steps = [[1, 350], [2, 750], [3, 700]];
        for (const [p, ms] of steps) { await wait(ms); if (!alive) return; setPh(p); }
        await wait(500); if (!alive) return; setPh(4);
        const len = (ref.current?.dataset.len | 0) || 24;
        for (let i = 1; i <= len && alive; i++) { setTyped(i); await wait(i % 7 === 0 ? 70 : 34); }
        for (const p of [5, 6, 7, 8]) { await wait(p === 5 ? 500 : 420); if (!alive) return; setPh(p); }
        await wait(600); if (!alive) return;
        setSecs(((performance.now() - t0) / 1000)); setPh(9);
        await wait(4200); if (!alive) return;
        setPh(10); await wait(700); n++;
      }
    })();
    return () => { alive = false; io.disconnect(); };
  }, []);

  const st = i => ph >= i ? ' on' : ph >= 2 ? ' out' : '';
  const status = a => {
    const [from, to] = [[3, 3], [4, 5], [6, 8]][a];
    if (ph < 1) return ['', tr('waiting')];
    if (ph < 2) return ['', tr('planning')];
    if (ph > to) return ['done', tr('done')];
    if (ph >= from) return ['busy', tr('building…')];
    return ['', tr('planning')];
  };
  return (
    <div className={'wl-stage' + (ph === 10 || ph === 0 ? ' fade' : '')} ref={ref} data-len={s.title.length} aria-hidden="true" data-no-i18n="" style={{ '--pa': s.accent }}>
      <div className="st-bar">
        <span className="st-dots"><i /><i /><i /></span>
        <span className="st-url"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>openconstructor.pw/p/<b>{custom ? 'my-page' : s.slug}</b></span>
        <span className="st-team">{AGENTS.map(a => <i key={a.name} style={{ background: a.color }} />)}<em>{ph >= 2 && ph < 9 ? tr('3 agents building') : ph >= 9 ? tr('ready') : tr('planning')}</em></span>
      </div>
      <div className="st-body">
        <div className="st-canvas">
          <div className="st-page">
            <div className={'st-b st-nav' + st(3)} data-tag={tr('Navbar')}>
              <span className="st-brand"><i />{s.brand}</span>
              <span className="st-links"><i /><i /><i /></span>
              <span className="st-pill">{s.cta}</span>
            </div>
            <div className={'st-b st-hero' + (ph >= 4 ? ' on' : ph >= 2 ? ' out' : '') + (ph >= 5 ? ' full' : '')} data-tag={tr('Hero')}>
              <span className="st-badge">{s.badge}</span>
              <h4 className={ph === 4 ? 'typing' : ''}>{titleShown || ' '}</h4>
              <p>{s.sub}</p>
              <span className="st-btns"><b>{s.cta}</b><u>{tr('Learn more')}</u></span>
            </div>
            <div className={'st-b st-feat' + (ph >= 6 ? ' on' : ph >= 2 ? ' out' : '')} data-tag={tr('Features')}>
              {s.cards.map((c, i) => <div key={i} className={'st-card' + (ph >= 6 + i ? ' in' : '')}><i /><b>{c}</b><span /><span /></div>)}
            </div>
            <div className={'st-sel' + (ph === 9 ? ' on' : '')}><em>{tr('Hero')} · {tr('selected')}</em><i /><i /><i /><i /></div>
            {AGENTS.map((a, i) => { const [x, y] = cursorAt(i, ph, share); return (
              <div key={a.name} className="st-cur" style={{ transform: `translate(${x}cqw, ${y * .625}cqw)`, '--c': a.color }}><CursorSvg color={a.color} /><span>{tr(a.name)}</span></div>
            ); })}
          </div>
        </div>
        <aside className="st-side">
          <div className="st-msg">{s.prompt}</div>
          <small>{tr('AI team')}</small>
          {AGENTS.map((a, i) => { const [cls, label] = status(i); return (
            <div key={a.name} className={'st-agent ' + cls}><i style={{ background: a.color }} /><b>{tr(a.name)}</b><span>{label}</span></div>
          ); })}
          <div className={'st-done' + (ph === 9 ? ' on' : '')}>
            <b>✓ {tr('Page ready')}</b><span>{tr('3 sections')} · {secs.toFixed(1)} s</span>
            <em>{tr('Export HTML')} ↓</em>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Numbers that count up when they come into view ───
const STATS = [[535, '+', 'ready components'], [120, '+', 'AI providers'], [7, '', 'export formats'], [100, '%', 'in the browser, nothing to install']];
function Stats(){
  return (
    <section className="wl-stats" aria-label="In numbers">
      {STATS.map(([n, suf, label]) => <div key={label}><b><span data-count={n}>{n}</span>{suf}</b><span>{label}</span></div>)}
    </section>
  );
}

// ─── Three modes as a bento: each card plays what the mode does ───
const LOGO_FILES = import.meta.glob('./logos/*.svg', { query: '?raw', import: 'default', eager: true });
const orbLogo = name => !name ? '' : (LOGO_FILES[`./logos/${name}.svg`] || '').replace(/id="([^"]+)"/g, 'id="orb-$1"').replace(/url\(#/g, 'url(#orb-').replace(/href="#/g, 'href="#orb-');
function Modes({ close }){
  const open = m => close(() => goMode(m, { instant: true }));
  return (
    <section className="wl-section" id="wl-how">
      <small className="wl-eyebrow">three modes</small>
      <h2>One idea. <span className="wl-accent-text">Three ways to make it.</span></h2>
      <p className="wl-section-sub">Switch any time — the project, the models and your keys stay the same.</p>
      <div className="wl-bento">
        <button className="wl-mode wl-mode-build" onClick={() => open('build')}>
          <div className="bv-build" aria-hidden="true">
            <div className="bvb-page"><i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" /><i className="b5" /></div>
            <div className="bvb-lib"><i /><i /><i /><i /></div>
            <span className="bvb-cur"><CursorSvg color="#a79dff" /></span>
          </div>
          <div className="wl-mode-copy">
            <span className="wl-mode-ic" dangerouslySetInnerHTML={{ __html: ICO(ICONS.build) }} />
            <h3>Build</h3>
            <p>A page on a free canvas. Drop blocks from a library of 500+, ask the AI to change any of them, export clean code.</p>
            <span className="wl-mode-go">Open Build →</span>
          </div>
        </button>
        <button className="wl-mode wl-mode-code" onClick={() => open('code')}>
          <div className="bv-code" aria-hidden="true">
            <div className="bvc-src"><i style={{ '--w': '62%' }} /><i style={{ '--w': '80%', '--x': '12%' }} /><i style={{ '--w': '48%', '--x': '12%' }} /><i style={{ '--w': '70%', '--x': '24%' }} /><i style={{ '--w': '30%', '--x': '12%' }} /><i style={{ '--w': '20%' }} /></div>
            <div className="bvc-run"><small>count</small><span className="bvc-num"><b><em>0</em><em>1</em><em>2</em><em>3</em></b></span><i>+</i></div>
          </div>
          <div className="wl-mode-copy">
            <span className="wl-mode-ic" dangerouslySetInnerHTML={{ __html: ICO(ICONS.code) }} />
            <h3>Code</h3>
            <p>A working mini-app with real logic. It runs right away; errors go back to the AI and get fixed.</p>
            <span className="wl-mode-go">Open Code →</span>
          </div>
        </button>
        <button className="wl-mode wl-mode-chat" onClick={() => open('chat')}>
          <div className="bv-chat" aria-hidden="true">
            <p className="u">Ideas for a headline?</p>
            <p className="a"><i /><i /><i /></p>
            <div className="bvh-models" data-no-i18n="">{['claude-color', 'openai', 'gemini-color', 'deepseek-color', 'xai'].map(n => <span key={n} dangerouslySetInnerHTML={{ __html: orbLogo(n) }} />)}</div>
          </div>
          <div className="wl-mode-copy">
            <span className="wl-mode-ic" dangerouslySetInnerHTML={{ __html: ICO(ICONS.chat) }} />
            <h3>Chat</h3>
            <p>A plain chat with Claude, GPT, Gemini and 100+ others. It searches the web when it needs to.</p>
            <span className="wl-mode-go">Open Chat →</span>
          </div>
        </button>
      </div>
    </section>
  );
}

// ─── Mini-apps: each card runs a real app (scripts on, opaque origin, no network) ───
const APP_IDEAS = ['Expense tracker with categories', 'Flashcards for learning words', 'Workout timer with rounds', 'Snake game'];
function AppCard({ app, onOpen, onBuild }){
  return (
    <div className="wl-app">
      <div className="wl-app-stage">
        <span className="wl-app-live"><i />live</span>
        <iframe title={app.name} sandbox="allow-scripts" tabIndex={-1} srcDoc={appPreview(app.code)} loading="lazy" />
      </div>
      <div className="wl-app-info">
        <h3>{tr(app.name)}</h3>
        <div className="wl-app-btns">
          <button className="wl-btn primary" onClick={onOpen}>Open in Code</button>
          <button className="wl-btn ghost" onClick={onBuild} title={tr(app.prompt)}>Make with AI</button>
        </div>
      </div>
    </div>
  );
}
function AppsSection({ close }){
  const [idea, setIdea] = useState('');
  const build = text => { const v = text.trim(); if (!v) return; track('template'); close(() => openCode({ prompt: v })); };
  const open = id => { track('template'); close(() => startNew(tr(APP_EXAMPLES.find(a => a.id === id).name)).then(() => { studio.addApp(id); openCode(); })); };
  return (
    <section className="wl-section wl-apps" id="wl-apps">
      <small className="wl-eyebrow">mini-apps</small>
      <h2>Not just pages. <span className="wl-accent-text">Apps that work.</span></h2>
      <p className="wl-section-sub">Describe a calculator, quiz, tracker or tiny game — the AI writes the logic, you click ▶ play and it works. Publish it by link, free.</p>
      <form className="wl-prompt wl-apps-prompt" onSubmit={e => { e.preventDefault(); build(idea); }}>
        <span className="wl-prompt-caret">›</span>
        <input value={idea} onChange={e => setIdea(e.target.value)} placeholder="Describe an app… e.g. a budget tracker for a trip" aria-label="What app to build" />
        <button type="submit" className="wl-btn primary" disabled={!idea.trim()}>Build app</button>
      </form>
      <div className="wl-chips">{APP_IDEAS.map(x => <button key={x} onClick={() => build(tr(x))}>{x}</button>)}</div>
      <p className="wl-apps-try">↓ these are running right now — try them</p>
      <div className="wl-apps-grid">
        {APP_EXAMPLES.map(a => <AppCard key={a.id} app={a} onOpen={() => open(a.id)} onBuild={() => build(tr(a.prompt))} />)}
      </div>
    </section>
  );
}

// ─── Models: the 3D mark with the AI models circling it on three tilted orbits ───
const ORBIT_LOGOS = ['openai', 'claude-color', 'gemini-color', 'meta-color', 'mistral-color', 'deepseek-color', 'qwen-color', 'xai', 'kimi-color', 'nvidia-color', 'cohere-color', 'zai', 'minimax-color', 'groq', 'openrouter', 'perplexity-color', 'dotsstudio', 'gemma-color', 'huggingface-color', 'stepfun-color'];
const ORBIT_INFO = {
  // vendor, model family, services that serve it (ids from providers.js; the free / keyless ones first)
  openai: ['OpenAI', 'GPT · GPT-OSS', ['ovh', 'pollinations-open', 'groq', 'cerebras', 'openrouter', 'coarena', 'openai', 'vercel', 'requesty', 'aihubmix', 'sambanova', 'ollama', 'anyapi', 'airforce', 'regolo', 'scaleway', 'deepinfra', 'fireworks', 'poe', 'glama', 'nanogpt', 'edenai', 'digitalocean']],
  'claude-color': ['Anthropic', 'Claude', ['coarena', 'anthropic', 'openrouter', 'vercel', 'requesty', 'aihubmix', 'routeway', 'kilo', 'stdcompute', 'inferencenet', 'ai302', 'aimlapi', 'poe', 'glama', 'nanogpt', 'edenai', 'atlascloud', 'digitalocean']],
  'gemini-color': ['Google', 'Gemini', ['gemini', 'coarena', 'openrouter', 'vercel', 'requesty', 'aihubmix', 'vlmrun', 'cortecs', 'venice', 'poe', 'glama', 'nanogpt', 'edenai', 'atlascloud']],
  'meta-color': ['Meta', 'Llama', ['ovh', 'aihorde', 'groq', 'cerebras', 'anyapi', 'kiosapi', 'openrouter', 'together', 'huggingface', 'scaleway', 'deepinfra', 'arli', 'akashml', 'digitalocean', 'vultr']],
  'mistral-color': ['Mistral AI', 'Mistral · Codestral', ['llm7', 'mistral', 'openrouter', 'scaleway', 'requesty', 'aihubmix', 'codestral', 'glama', 'nanogpt', 'edenai']],
  'deepseek-color': ['DeepSeek', 'DeepSeek V4', ['gonka', 'dahl', 'unorouter', 'routeway', 'bazaarlink', 'orcarouter', 'freeinference', 'zro', 'coarena', 'deepseek', 'openrouter', 'together', 'siliconflow', 'avian', 'mancer', 'deepinfra', 'chutes', 'novita', 'ppio', 'huggingface', 'atlascloud', 'gmicloud', 'akashml', 'nanogpt', 'vultr', 'llm7']],
  'qwen-color': ['Alibaba', 'Qwen', ['ovh', 'freeai', 'aihorde', 'hetzner', 'llmtr', 'itera', 'regolo', 'moark', 'freeinference', 'modelscope', 'alibaba', 'groq', 'openrouter', 'siliconflow', 'together', 'scaleway', 'huggingface', 'arli', 'atlascloud', 'gmicloud', 'akashml', 'infermatic', 'vultr']],
  xai: ['xAI', 'Grok', ['coarena', 'xai', 'openrouter', 'vercel', 'aihubmix', 'poe', 'nanogpt']],
  'kimi-color': ['Moonshot AI', 'Kimi', ['pollinations', 'coarena', 'routeway', 'moonshot', 'groq', 'openrouter', 'together', 'ppio', 'cortecs']],
  'nvidia-color': ['NVIDIA', 'Nemotron', ['kilo', 'nvidia', 'requesty', 'aihubmix', 'llmtr', 'bazaarlink', 'llmkiwi', 'unorouter', 'openrouter', 'huggingface']],
  'cohere-color': ['Cohere', 'Command', ['cohere', 'unorouter', 'kilo', 'openrouter']],
  zai: ['Z.ai', 'GLM', ['llm7', 'gonka', 'dahl', 'zai', 'zhipu', 'nvidia', 'novai', 'kiosapi', 'orcarouter', 'itera', 'pollinations', 'aihubmix', 'siliconflow', 'friendli', 'sambanova', 'openrouter']],
  'minimax-color': ['MiniMax', 'MiniMax M3', ['gonka', 'dahl', 'nvidia', 'itera', 'llmkiwi', 'aihubmix', 'minimax', 'openrouter', 'llm7']],
  groq: ['Groq', 'open models on LPU chips', ['groq']],
  openrouter: ['OpenRouter', '300+ models in one key', ['openrouter']],
  'perplexity-color': ['Perplexity', 'Sonar', ['perplexity', 'openrouter']],
  dotsstudio: ['Dots Studio', 'Dots3-Note', ['kilo', 'openrouter']],
  'gemma-color': ['Google', 'Gemma', ['aihorde', 'gemini', 'nvidia', 'requesty', 'routeway', 'kiosapi', 'simplellm', 'regolo', 'ollama', 'sambanova', 'openrouter', 'huggingface']],
  'huggingface-color': ['Hugging Face', 'thousands of open models', ['huggingface']],
  'stepfun-color': ['StepFun', 'Step', ['nous', 'nvidia', 'stepfun', 'openrouter']],
};
const RINGS = [[.27, .13, .00012], [.39, .19, -.00008], [.5, .25, .00005]]; // rx, ry (share of the width), speed (rad/ms)
const TILT = -11 * Math.PI / 180;
function dotCloud(seed){
  let x = seed * 9301 + 49297; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 14 + Math.floor(rnd() * 12) }, () => { const a = rnd() * Math.PI * 2, r = 16 + rnd() * 34; return `<circle cx="${(60 + Math.cos(a) * r).toFixed(1)}" cy="${(60 + Math.sin(a) * r * .8).toFixed(1)}" r="${(0.7 + rnd() * 1.9).toFixed(1)}" fill-opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`; }).join('');
}
function OrbitHero(){
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current; if (!box) return;
    const nodes = [...box.querySelectorAll('.wl-orb-node')];
    const still = calm();
    let raf = 0, visible = true;
    const times = nodes.map(() => 0); let last = 0;
    const place = () => {
      const W = box.clientWidth, H = box.clientHeight, cx = W / 2, cy = H / 2;
      nodes.forEach((n, i) => {
        const [rx, ry, sp] = RINGS[i % 3], a = i * 2.39996 + times[i] * sp;
        const ex = Math.cos(a) * rx * W, ey = Math.sin(a) * ry * W;
        const x = cx + ex * Math.cos(TILT) - ey * Math.sin(TILT), y = cy + ex * Math.sin(TILT) + ey * Math.cos(TILT);
        const depth = (Math.sin(a) + 1) / 2; // 0 = far side (behind the mark), 1 = near side
        n.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${(0.72 + depth * 0.38).toFixed(3)})`;
        n.style.opacity = (0.35 + depth * 0.65).toFixed(2);
        n.style.zIndex = depth > 0.5 ? 3 : 1;
      });
    };
    // every logo keeps its own clock: the one under the pointer stops, the others keep circling
    const loop = t => { const dt = Math.min(50, t - (last || t)); last = t; nodes.forEach((n, i) => { if (!n.classList.contains('hot')) times[i] += dt; }); place(); raf = visible && !still ? requestAnimationFrame(loop) : 0; };
    const card = box.querySelector('.wl-orb-card');
    nodes.forEach(n => {
      n.addEventListener('pointerenter', () => {
        n.classList.add('hot');
        const [vendor, model, via] = ORBIT_INFO[n.dataset.logo] || ['', '', []];
        const all = via.map(id => PROVIDERS.find(p => p.id === id)).filter(Boolean), list = all.slice(0, 10), more = all.length - list.length;
        card.innerHTML = `<div class="wl-orb-card-top">${n.querySelector('.wl-orb-logo').outerHTML}<span>${vendor}</span></div><b>${model}</b><div class="wl-orb-card-row"><span>${tr('Available via')}</span><span class="wl-orb-via">${list.map(p => `<i title="${p.name}">${orbLogo(p.logo) || `<em>${p.name[0]}</em>`}</i>`).join('')}${more > 0 ? `<i class="wl-orb-more">+${more}</i>` : ''}</span></div><div class="wl-orb-card-row"><span>${tr('Providers')}</span><span>${all.map(p => p.name.replace(/ \(.*\)$/, '')).join(', ')}</span></div>`;
        const r = n.getBoundingClientRect(), b = box.getBoundingClientRect();
        const x = Math.min(b.width - 270, Math.max(0, r.left - b.left + r.width / 2 - 130)), y = r.top - b.top + 22;
        card.style.transform = `translate(${x}px, ${y - card.offsetHeight > 0 ? y - card.offsetHeight : r.bottom - b.top - 22}px)`;
        card.classList.add('on');
      });
      n.addEventListener('pointerleave', () => { n.classList.remove('hot'); card.classList.remove('on'); });
    });
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !still) { last = 0; raf = requestAnimationFrame(loop); } });
    io.observe(box); place(); if (!still) raf = requestAnimationFrame(loop);
    addEventListener('resize', place);
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('resize', place); };
  }, []);
  return (
    <div className="wl-orbit" ref={ref} aria-hidden="true" data-no-i18n="">
      <svg className="wl-orbit-rings" viewBox="-50 -50 100 100" preserveAspectRatio="none">
        {RINGS.map(([rx, ry], i) => <ellipse key={i} cx="0" cy="0" rx={rx * 100} ry={ry * 100} transform={`rotate(${TILT * 180 / Math.PI})`} />)}
      </svg>
      <img className="wl-orbit-mark" src="/hero-mark.webp" alt="" width="900" height="900" loading="lazy" />
      {ORBIT_LOGOS.map((name, i) => (
        <div key={name} className="wl-orb-node" data-logo={name}>
          <svg className="wl-orb-dots" viewBox="0 0 120 120" dangerouslySetInnerHTML={{ __html: dotCloud(i + 1) }} />
          <span className="wl-orb-logo" dangerouslySetInnerHTML={{ __html: orbLogo(name) }} />
        </div>
      ))}
      <div className="wl-orb-card" />
    </div>
  );
}
function Models(){
  return (
    <section className="wl-section wl-models">
      <div className="wl-models-copy">
        <small className="wl-eyebrow">models</small>
        <h2>Every model you like. <span className="wl-accent-text">Free to start.</span></h2>
        <p className="wl-section-sub">Use the built-in free AI right away, or plug in your own key — OpenRouter, Anthropic, OpenAI, Gemini, Groq, NVIDIA and 100 more, six without any key. Keys stay in your browser.</p>
        <ul className="wl-models-list">
          <li><b>Free AI</b><span>no key, no card</span></li>
          <li><b>100+ providers</b><span>hover a logo to see who serves it</span></li>
          <li><b>Your keys</b><span>never leave the browser</span></li>
        </ul>
        <a className="wl-btn ghost" href="/top-ai">{tr('Top AI models')} →</a>
      </div>
      <OrbitHero />
    </section>
  );
}

// ─── Export: the same block in four kinds of code ───
const CODE = {
  HTML: `<section class="hero">
  <span class="badge">Fresh roast daily</span>
  <h1>Coffee worth waking up for</h1>
  <p>Single-origin beans, roasted nearby.</p>
  <a class="btn" href="#menu">See the menu</a>
</section>
<style>
  .hero { display: grid; gap: 16px; padding: 96px 24px; }
  .btn { background: #b07a45; border-radius: 99px; }
</style>`,
  React: `export default function Hero() {
  return (
    <section className="hero">
      <span className="badge">Fresh roast daily</span>
      <h1>Coffee worth waking up for</h1>
      <p>Single-origin beans, roasted nearby.</p>
      <a className="btn" href="#menu">See the menu</a>
    </section>
  );
}`,
  Vue: `<template>
  <section class="hero">
    <span class="badge">{{ badge }}</span>
    <h1>{{ title }}</h1>
    <a class="btn" href="#menu">See the menu</a>
  </section>
</template>
<script setup>
const badge = 'Fresh roast daily'
const title = 'Coffee worth waking up for'
</script>`,
  Roblox: `local hero = Instance.new("Frame")
hero.Size = UDim2.fromScale(1, 0.6)
hero.BackgroundColor3 = Color3.fromRGB(24, 24, 27)

local title = Instance.new("TextLabel")
title.Text = "Coffee worth waking up for"
title.Font = Enum.Font.GothamBold
title.TextSize = 48
title.Parent = hero`,
};
const FILES = { HTML: 'hero.html', React: 'Hero.jsx', Vue: 'Hero.vue', Roblox: 'Hero.luau' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HL = /(\/\/.*|--.*)|("[^"\n]*"|'[^'\n]*')|(<\/?[a-zA-Z][\w-]*|\/?>)|\b(const|let|return|export|default|function|local|setup|new)\b|\b(\d+(?:\.\d+)?)\b/g;
function hl(src){
  let out = '', last = 0;
  src.replace(HL, (m, c, s, t, k, n, i) => { out += esc(src.slice(last, i)) + `<span class="${c ? 'c' : s ? 's' : t ? 't' : k ? 'k' : 'n'}">${esc(m)}</span>`; last = i + m.length; return m; });
  return out + esc(src.slice(last));
}
function Export(){
  const keys = Object.keys(CODE);
  const [cur, setCur] = useState(0);
  const [auto, setAuto] = useState(true);
  const ref = useRef(null);
  useEffect(() => {
    if (!auto || calm()) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(ref.current);
    const t = setInterval(() => { if (visible) setCur(c => (c + 1) % keys.length); }, 3600);
    return () => { clearInterval(t); io.disconnect(); };
  }, [auto]);
  const k = keys[cur];
  return (
    <section className="wl-section wl-export" ref={ref}>
      <small className="wl-eyebrow">export</small>
      <h2>Your code. <span className="wl-accent-text">No lock-in.</span></h2>
      <p className="wl-section-sub">One page, many targets: a single HTML file, React, Vue, Svelte, Tailwind — even Roblox and LÖVE game UI. Or publish by link in one click.</p>
      <div className="wl-code">
        <div className="wl-code-tabs" role="tablist">
          {keys.map((x, i) => <button key={x} role="tab" aria-selected={i === cur} className={i === cur ? 'on' : ''} onClick={() => { setAuto(false); setCur(i); }}>{x}</button>)}
          <span className="wl-code-file" data-no-i18n="">{FILES[k]}</span>
        </div>
        <pre key={k} data-no-i18n="">{CODE[k].split('\n').map((line, i) => <div key={i} style={{ '--i': i }}><em>{i + 1}</em><span dangerouslySetInnerHTML={{ __html: hl(line) || ' ' }} /></div>)}</pre>
        {auto && <i className="wl-code-timer" key={'t' + cur} />}
      </div>
    </section>
  );
}

// ─── Templates: two rows drifting in opposite directions ───
function Templates({ close }){
  const half = Math.ceil(templates.length / 2);
  const rows = [templates.slice(0, half), templates.slice(half)];
  const open = t => close(() => startNew(t.name).then(() => loadTemplate(t)));
  return (
    <section className="wl-section wl-tpls" id="wl-templates">
      <small className="wl-eyebrow">templates</small>
      <h2>Start from a ready-made page</h2>
      <p className="wl-section-sub">Open a template, select any block and ask the AI to make it yours.</p>
      <div className="wl-marquee">
        {rows.map((row, r) => (
          <div key={r} className={'wl-marquee-row' + (r ? ' rev' : '')}>
            <div className="wl-marquee-track">
              {[...row, ...row].map((t, i) => (
                <button key={t.id + i} className="wl-tpl" onClick={() => open(t)} tabIndex={i >= row.length ? -1 : 0} aria-hidden={i >= row.length || undefined}>
                  <Thumb t={t} />
                  <span className="wl-tpl-info"><b>{t.name}</b><span>{t.desc}</span></span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="wl-tpls-btns">
        <button className="wl-btn ghost" onClick={() => close(() => startNew())}>+ Blank page</button>
        <a className="wl-btn ghost" href="/gallery">Gallery: what people built</a>
      </div>
    </section>
  );
}

// the hero's second line keeps changing
const ROTATE = ['with words and blocks', 'with Claude, GPT and Gemini', 'from a screenshot', 'in a few minutes'];
function Rotator(){
  const [i, setI] = useState(0);
  useEffect(() => { if (calm()) return; const t = setInterval(() => setI(n => (n + 1) % ROTATE.length), 2800); return () => clearInterval(t); }, []);
  return <span className="wl-title-line wl-rot"><span key={i} className="wl-rot-word">{tr(ROTATE[i])}</span></span>;
}

export default function Welcome(){
  const shouldShow = () => location.hash === '#welcome' || !localStorage.getItem('oc-welcomed');
  const [open, setOpen] = useState(() => { try { return shouldShow(); } catch { return true; } });
  const [closing, setClosing] = useState(false);
  const [idea, setIdea] = useState('');
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => { if (!more) return; const off = e => { if (!moreRef.current?.contains(e.target)) setMore(false); }; document.addEventListener('pointerdown', off); return () => document.removeEventListener('pointerdown', off); }, [more]);
  const scroller = useRef(null), swarmRef = useRef(null);

  // minimal motion only: the swarm in the prompt, sections that rise in, numbers that count (no cursor lights, no tilting cards)
  useEffect(() => {
    if (!open || !scroller.current) return;
    if (swarmRef.current && !swarmRef.current.firstChild) swarmRef.current.append(swarmGlyph());
    const root = scroller.current;
    const fx = [reveal(root), tiltIn(root, root?.querySelector('.wl-stage')), countUp(root)];
    const onScroll = () => setScrolled(root.scrollTop > 8);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { fx.forEach(off => off()); root.removeEventListener('scroll', onScroll); };
  }, [open]);

  useEffect(() => {
    const reopen = e => { setClosing(false); setOpen(true); const to = e?.detail; setTimeout(() => { const el = to && document.getElementById(to); if (el) el.scrollIntoView(); else scroller.current?.scrollTo(0, 0); }, 60); };
    window.addEventListener('oc:welcome', reopen);
    return () => window.removeEventListener('oc:welcome', reopen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function close(after){
    try { localStorage.setItem('oc-welcomed', '1'); } catch {}
    track('editor', { once: true });
    if (location.hash === '#welcome') history.replaceState(null, '', location.pathname);
    // the chosen place opens at once underneath (the start screen sits above Chat and Code), then this fades away
    setClosing(true);
    after?.();
    setTimeout(() => { setOpen(false); setClosing(false); window.dispatchEvent(new CustomEvent('oc:welcome-closed')); }, 450);
  }
  const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const build = text => { const v = text.trim(); if (!v) return; close(() => prefillPrompt(v)); };
  const [heroMode, setHeroMode] = useState('build');
  const heroInput = useRef(null), heroModes = useRef(null), navModes = useRef(null);
  useEffect(() => { if (!open) return; pill(heroModes.current); pill(navModes.current, { hover: true }); }, [open]);
  const hm = HERO_MODES.find(m => m.id === heroMode);
  // Build → the editor's AI makes a page; Code → a working mini-app; Chat → a plain conversation, the question already sent
  const start = text => {
    const v = text.trim(); if (!v) return; track('template'); setIdea('');
    if (heroMode === 'code') close(() => openCode({ prompt: v }));
    else if (heroMode === 'chat') close(() => startChat(v));
    else build(v);
  };

  if (!open) return null;
  return (
    <div className={`wl${closing ? ' wl-out' : ''}`} ref={scroller} role="dialog" aria-label="Welcome to openconstructor">
      <div className="wl-bg" aria-hidden="true" />
      <header className={'wl-nav' + (scrolled ? ' scrolled' : '')}>
        <div className="wl-brand"><Logo size={22} /><span><i>open</i>constructor</span></div>
        <nav className="wl-modes" aria-label="Modes" ref={navModes}>
          <i className="pill-thumb" aria-hidden="true" />
          {['build', 'code', 'chat'].map(m => <button key={m} onClick={() => close(() => goMode(m, { instant: true }))}><span dangerouslySetInnerHTML={{ __html: ICO(ICONS[m]) }} />{tr(m[0].toUpperCase() + m.slice(1))}</button>)}
        </nav>
        <div className="wl-nav-end">
          <div className="wl-more" ref={moreRef}>
            <button className={'wl-more-btn' + (more ? ' on' : '')} onClick={() => setMore(v => !v)} aria-expanded={more}>{tr('More')}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
            {more && <div className="wl-more-menu" role="menu">
              <button role="menuitem" onClick={() => { setMore(false); go('wl-how'); }}>{tr('How it works')}</button>
              <button role="menuitem" onClick={() => { setMore(false); go('wl-templates'); }}>{tr('Templates')}</button>
              <a role="menuitem" href="/gallery">{tr('Gallery')}</a>
              <a role="menuitem" href="/top-ai">{tr('Top AI models')}</a>
              <a role="menuitem" href="/ai-models">{tr('AI models')}</a>
              <a role="menuitem" href="https://github.com/Kuloka/openconstructor" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>GitHub</a>
              <div className="wl-more-sep" />
              <div className="wl-more-h">{tr('Language')}</div>
              <div className="wl-more-langs" data-no-i18n="">{LANGS.map(l => <button key={l.code} className={l.code === lang ? 'on' : ''} onClick={() => setLang(l.code)}>{l.name}</button>)}</div>
            </div>}
          </div>
          {!authUser && <button className="wl-btn ghost" onClick={() => openAuth('signup')}>Sign up</button>}
        </div>
      </header>

      <section className="wl-hero">
        <div className="wl-badge"><span className="wl-dot" /><span>AI interface builder · public beta</span></div>
        <h1 className="wl-title">
          <span className="wl-title-line">Build interfaces</span>
          <Rotator />
        </h1>
        <p className="wl-sub">Describe it in one sentence — a team of AI agents builds it on a canvas in front of you. Then change any block and export clean code.</p>

        {/* one prompt, three modes: what happens on Enter depends on the switch above it */}
        <div className="wl-hero-modes" role="tablist" aria-label={tr('Mode')} ref={heroModes}>
          <i className="pill-thumb" aria-hidden="true" />
          {HERO_MODES.map(m => <button key={m.id} type="button" role="tab" aria-selected={heroMode === m.id} className={heroMode === m.id ? 'on' : ''} onClick={() => { setHeroMode(m.id); heroInput.current?.focus(); }}><span dangerouslySetInnerHTML={{ __html: m.icon }} />{tr(m.label)}</button>)}
        </div>
        <form className={'wl-prompt wl-prompt-' + heroMode} onSubmit={e => { e.preventDefault(); start(idea); }}>
          <span className="wl-prompt-swarm" ref={swarmRef} aria-hidden="true" />
          <input ref={heroInput} value={idea} onChange={e => setIdea(e.target.value)} placeholder={matchMedia('(max-width: 560px)').matches ? tr(hm.placeholder).replace(/….*$/, '…') : tr(hm.placeholder)} aria-label={tr(hm.placeholder)} />
          <button type="submit" className="wl-btn primary" disabled={!idea.trim()}>{tr(hm.button)}</button>
        </form>
        <p className="wl-mode-hint">{heroMode === 'build' && idea.trim() ? <><i className="wl-live-dot" />{tr('Watch the canvas below — your words are already on it')}</> : tr(hm.hint)}</p>
        <div className="wl-chips" key={heroMode}>
          {(hm.examples || EXAMPLES).map(x => <button key={x} onClick={() => start(tr(x))}>{tr(x)}</button>)}
        </div>
      </section>

      <div className="wl-stage-wrap"><Stage text={heroMode === 'build' ? idea : ''} /></div>

      <div className="wl-actions">
        <button className="wl-btn ghost" onClick={() => go('wl-templates')}>Browse templates</button>
        <button className="wl-link" onClick={() => close()}>Start from scratch →</button>
      </div>

      <Stats />
      <Modes close={close} />
      <AppsSection close={close} />
      <Models />
      <Export />
      <Templates close={close} />

      {/* the last word: one big, calm invitation instead of the page just ending */}
      <section className="wl-cta">
        <span className="wl-cta-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PIXEL_LOGO }} />
        <h2>Your next idea is <span className="wl-accent-text">one sentence away</span></h2>
        <p>Free, in the browser, no install. Pages, apps or just a chat — pick a mode and start.</p>
        <div className="wl-cta-btns">
          <button className="wl-btn primary wl-btn-lg" onClick={() => { scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => heroInput.current?.focus(), 500); }}>Start for free</button>
          <button className="wl-btn ghost wl-btn-lg" onClick={() => close(() => goMode('chat', { instant: true }))}>Open the chat</button>
        </div>
      </section>

      <nav className="wl-guides" aria-label="Guides">
        <span>guides</span>
        <a href="/gallery">Gallery: what people built</a>
        <a href="/roblox-ui-builder">Roblox UI builder (Luau)</a>
        <a href="/html-to-react-vue-svelte">Export to React, Vue &amp; Svelte</a>
        <a href="/ai-ui-generator">AI UI generator</a>
        <a href="/components">500+ components</a>
        <a href="/love2d-ui">LÖVE 2D UI</a>
        <a href="https://github.com/Kuloka/openconstructor" target="_blank" rel="noreferrer">GitHub</a>
      </nav>

      <footer className="wl-foot">
        <div className="wl-brand small"><Logo size={18} /><span><i>open</i>constructor</span></div>
        <span><button className="wl-donate" onClick={openDonate}>support the project</button> · <a href="/privacy">privacy</a> · <a href="/terms">terms</a> · icons: Lobe Icons</span>
      </footer>
    </div>
  );
}
