import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import SpotlightCard from './components/reactbits/SpotlightCard';
import logoSvg from './logo.svg?raw';
import { templates } from './templates';
import { t as tr, LANGS, lang, setLang } from '../i18n.js';
import { loadTemplate, prefillPrompt, studio } from '../studio.js';
import { APP_EXAMPLES, appPreview } from '../apps.js';
import { openCode } from '../code.js';
import { startNew } from '../local-projects.js';
import { openAuth, user as authUser } from '../auth.js';
import { openDonate } from '../donate.js';
import { track } from '../track.js';
import './welcome.css';

const Logo = ({ size = 28 }) => <span className="wl-logo" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: logoSvg }} />;

const EXAMPLES = [
  'Coffee shop landing page with menu and reviews',
  'Sign-up form with social logins',
  'Product card with price and add-to-cart',
  'Dark analytics dashboard',
];

const STEPS = [
  { n: '01', title: 'Drop in blocks', text: 'Pick buttons, inputs, cards, sections and effects from the library. Place them anywhere on the page.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/></svg> },
  { n: '02', title: 'Ask AI', text: 'Describe what you need — “build a landing page” or “make this button green”. The AI builds or edits the selected block.', icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.8L20 10l-6.1 2.2L12 18l-1.9-5.8L4 10l6.1-2.2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".6"/></svg> },
  { n: '03', title: 'Ship the code', text: 'Export a single file of clean HTML and CSS that runs anywhere. No lock-in.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/></svg> },
];

// Template thumbnail: the same page as in the editor, scaled down to the card width
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
  return <div className="wl-thumb" ref={box}><iframe title={t.name} sandbox="" tabIndex={-1} srcDoc={tplDoc(t)} style={{ width: t.page.w, height: t.page.h, transform: `scale(${scale})` }} /></div>;
}

// Mini-apps: each card runs a real app (scripts on, opaque origin, no network)
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
      <div className="wl-apps-glow" aria-hidden="true" />
      <small className="wl-eyebrow">new · mini-apps</small>
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

// Hero demo: a small editor window that plays the core loop on repeat — a request in the chat,
// the AI's steps, a real template assembling on the canvas block by block, the reply.
const DEMO_BLOCKS = ['Navbar', 'Hero', 'Pricing', 'Features', 'Footer', 'Card', 'Chat app', 'Metric'];
function HeroDemo(){
  const t = templates[0];
  return (
    <div className="wl-demo" aria-hidden="true">
      <div className="wl-demo-bar"><i /><i /><i /><span>~/startup-landing.html</span><em>export ↓</em></div>
      <div className="wl-demo-body">
        <aside className="wl-demo-lib">
          <small>components</small>
          {DEMO_BLOCKS.map((n, i) => <span key={n} data-no-i18n="" style={{ '--i': i }}><b />{n}</span>)}
        </aside>
        <div className="wl-demo-canvas">
          <div className="wl-demo-page"><Thumb t={t} /><div className="wl-demo-curtain" /><div className="wl-demo-sel" /></div>
        </div>
        <aside className="wl-demo-chat">
          <small>ai assistant</small>
          <p className="u">Build a startup landing page: hero, features and a call to action</p>
          <ol>
            <li>reading your request</li>
            <li>planning the layout</li>
            <li>writing the code</li>
          </ol>
          <p className="a">Done. 3 sections are on the page — select any block to change it.</p>
          <div className="wl-demo-input">describe what to build or change…</div>
        </aside>
      </div>
    </div>
  );
}

export default function Welcome(){
  const shouldShow = () => location.hash === '#welcome' || !localStorage.getItem('oc-welcomed');
  const [open, setOpen] = useState(() => { try { return shouldShow(); } catch { return true; } });
  const [closing, setClosing] = useState(false);
  const [idea, setIdea] = useState('');
  const scroller = useRef(null);

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
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); after?.(); window.dispatchEvent(new CustomEvent('oc:welcome-closed')); }, 450);
  }
  const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const build = text => { const v = text.trim(); if (!v) return; close(() => prefillPrompt(v)); };

  if (!open) return null;
  return (
    <div className={`wl${closing ? ' wl-out' : ''}`} ref={scroller} role="dialog" aria-label="Welcome to openconstructor">
      <header className="wl-nav">
        <div className="wl-brand"><Logo size={22} /><span><i>open</i>constructor</span></div>
        <nav>
          <button className="wl-nav-code" onClick={() => close(() => openCode())}>Code <em className="wl-new">new</em></button>
          <button onClick={() => go('wl-how')}>How it works</button>
          <button onClick={() => go('wl-templates')}>Templates</button>
          <a className="wl-gh" href="/gallery">Gallery</a>
          <a className="wl-gh" href="https://github.com/Kuloka/openconstructor" target="_blank" rel="noreferrer" title="Source code on GitHub"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>GitHub</a>
        </nav>
        <select className="wl-lang" data-no-i18n="" aria-label="Language" value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
        {!authUser && <button className="wl-btn ghost" onClick={() => openAuth('signup')}>Sign up</button>}
        <button className="wl-btn primary" onClick={() => close()}>Open editor</button>
      </header>

      <section className="wl-hero">
        <svg className="wl-mark" viewBox="4 4 40 40" aria-hidden="true"><polygon className="m1" points="17,6 42,6 31,17 17,17"/><polygon className="m2" points="6,17 17,6 17,17"/><rect className="m3" x="6" y="18.5" width="11" height="11"/><polygon className="m4" points="6,31 17,31 17,42"/><polygon className="m5" points="17,31 31,31 42,42 17,42"/></svg>
        <div className="wl-badge"><span className="wl-dot" /><span>AI interface builder · public beta</span></div>
        <h1 className="wl-title">
          <span className="wl-title-line">Build interfaces</span>
          <span className="wl-title-line wl-accent-text">with words and blocks</span>
        </h1>
        <p className="wl-sub">A library of polished components, a free-form canvas and an AI assistant that lays out pages from a description. Export clean HTML and CSS.</p>

        <form className="wl-prompt" onSubmit={e => { e.preventDefault(); build(idea); }}>
          <span className="wl-prompt-caret">›</span>
          <input value={idea} onChange={e => setIdea(e.target.value)} placeholder="Describe what to build… e.g. a coffee shop landing page" aria-label="What to build" />
          <button type="submit" className="wl-btn primary" disabled={!idea.trim()}>Build ✦</button>
        </form>
        <div className="wl-chips">
          {EXAMPLES.map(x => <button key={x} onClick={() => build(tr(x))}>{x}</button>)}
        </div>

        <div className="wl-actions">
          <button className="wl-btn ghost" onClick={() => go('wl-templates')}>Browse templates</button>
          <button className="wl-link" onClick={() => close()}>Start from scratch →</button>
        </div>
      </section>

      <HeroDemo />

      <AppsSection close={close} />

      <section className="wl-section" id="wl-how">
        <small className="wl-eyebrow">how it works</small>
        <h2>From idea to layout in three steps</h2>
        <div className="wl-steps">
          {STEPS.map(s => (
            <SpotlightCard key={s.n} className="wl-card" spotlightColor="rgba(255, 90, 54,0.2)">
              <div className="wl-step-top"><span className="wl-step-ic">{s.icon}</span><span className="wl-step-n">{s.n}</span></div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      <section className="wl-section" id="wl-templates">
        <small className="wl-eyebrow">templates</small>
        <h2>Start from a ready-made page</h2>
        <p className="wl-section-sub">Open a template, select any block and ask the AI to make it yours.</p>
        <div className="wl-templates">
          {templates.map(t => (
            <button key={t.id} className="wl-tpl" onClick={() => close(() => startNew(t.name).then(() => loadTemplate(t)))}>
              <SpotlightCard className="wl-card wl-tpl-card" spotlightColor="rgba(255, 90, 54,0.18)">
                <Thumb t={t} />
                <div className="wl-tpl-info"><h3>{t.name}</h3><p>{t.desc}</p></div>
                <span className="wl-tpl-open">Open →</span>
              </SpotlightCard>
            </button>
          ))}
          <button className="wl-tpl" onClick={() => close(() => startNew())}>
            <SpotlightCard className="wl-card wl-tpl-card wl-tpl-blank" spotlightColor="rgba(255,255,255,0.12)">
              <div className="wl-thumb wl-thumb-blank"><span>+</span></div>
              <div className="wl-tpl-info"><h3>Blank page</h3><p>Build it yourself from components or with the AI</p></div>
              <span className="wl-tpl-open">Open →</span>
            </SpotlightCard>
          </button>
        </div>
      </section>

      <nav className="wl-guides" aria-label="Guides">
        <span>guides</span>
        <a href="/gallery">Gallery: what people built</a>
        <a href="/roblox-ui-builder">Roblox UI builder (Luau)</a>
        <a href="/html-to-react-vue-svelte">Export to React, Vue &amp; Svelte</a>
        <a href="/ai-ui-generator">AI UI generator</a>
        <a href="/components">320+ components</a>
        <a href="/love2d-ui">LÖVE 2D UI</a>
        <a href="https://github.com/Kuloka/openconstructor" target="_blank" rel="noreferrer">GitHub</a>
      </nav>

      <footer className="wl-foot">
        <div className="wl-brand small"><Logo size={18} /><span><i>open</i>constructor</span></div>
        <span><button className="wl-donate" onClick={openDonate}>support the project</button> · <a href="/privacy">privacy</a> · <a href="/terms">terms</a> · effects: React Bits, Magic UI · icons: Lobe Icons</span>
      </footer>
    </div>
  );
}
