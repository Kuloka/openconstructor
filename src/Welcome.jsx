import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Aurora from './components/reactbits/Aurora';
import BlurText from './components/reactbits/BlurText';
import ShinyText from './components/reactbits/ShinyText';
import GradientText from './components/reactbits/GradientText';
import SpotlightCard from './components/reactbits/SpotlightCard';
import logoSvg from './logo.svg?raw';
import { templates } from './templates';
import { loadTemplate, clearPage, prefillPrompt } from '../studio.js';
import { openAuth, user as authUser } from '../auth.js';
import { openDonate } from '../donate.js';
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
  { n: '02', title: 'Ask the AI', text: 'Describe what you need — “build a landing page” or “make this button green”. The AI builds or edits the selected block.', icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.8L20 10l-6.1 2.2L12 18l-1.9-5.8L4 10l6.1-2.2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".6"/></svg> },
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
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / t.page.w));
    ro.observe(box.current); return () => ro.disconnect();
  }, [t.page.w]);
  return <div className="wl-thumb" ref={box}><iframe title={t.name} sandbox="" tabIndex={-1} srcDoc={tplDoc(t)} style={{ width: t.page.w, height: t.page.h, transform: `scale(${scale})` }} /></div>;
}

export default function Welcome(){
  const shouldShow = () => location.hash === '#welcome' || !localStorage.getItem('oc-welcomed');
  const [open, setOpen] = useState(() => { try { return shouldShow(); } catch { return true; } });
  const [closing, setClosing] = useState(false);
  const [idea, setIdea] = useState('');
  const scroller = useRef(null);

  useEffect(() => {
    const reopen = () => { setClosing(false); setOpen(true); requestAnimationFrame(() => scroller.current?.scrollTo(0, 0)); };
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
    if (location.hash === '#welcome') history.replaceState(null, '', location.pathname);
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); after?.(); window.dispatchEvent(new CustomEvent('oc:welcome-closed')); }, 450);
  }
  const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const build = text => { const v = text.trim(); if (!v) return; close(() => prefillPrompt(v)); };

  if (!open) return null;
  return (
    <div className={`wl${closing ? ' wl-out' : ''}`} ref={scroller} role="dialog" aria-label="Welcome to openconstructor">
      <div className="wl-aurora" aria-hidden="true">
        <Aurora colorStops={['#7a1f0c', '#e4572e', '#3a1006']} amplitude={1.1} blend={0.65} speed={0.35} height={0.5} glow={0.6} />
      </div>

      <header className="wl-nav">
        <div className="wl-brand"><Logo size={22} /><span><i>open</i>constructor</span></div>
        <nav>
          <button onClick={() => go('wl-how')}>How it works</button>
          <button onClick={() => go('wl-templates')}>Templates</button>
          <a className="wl-gh" href="https://github.com/Kuloka/openconstructor" target="_blank" rel="noreferrer" title="Source code on GitHub"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>GitHub</a>
        </nav>
        {!authUser && <button className="wl-btn ghost" onClick={() => openAuth('signup')}>Sign up</button>}
        <button className="wl-btn primary" onClick={() => close()}>Open editor</button>
      </header>

      <section className="wl-hero">
        <div className="wl-badge"><span className="wl-dot" /><ShinyText text="AI interface builder · public beta" speed={3} color="#a89c97" shineColor="#ffc2a8" /></div>
        <h1 className="wl-title">
          <BlurText text="Build interfaces" animateBy="words" direction="top" delay={140} className="wl-title-line" />
          <GradientText colors={['#e4572e', '#ffb08f', '#e4572e', '#c2410c']} animationSpeed={6} className="wl-title-grad">with words and blocks</GradientText>
        </h1>
        <p className="wl-sub">A library of polished components, a free-form canvas and an AI assistant that lays out pages from a description. Export clean HTML and CSS.</p>

        <form className="wl-prompt" onSubmit={e => { e.preventDefault(); build(idea); }}>
          <span className="wl-prompt-caret">›</span>
          <input value={idea} onChange={e => setIdea(e.target.value)} placeholder="Describe what to build… e.g. a coffee shop landing page" aria-label="What to build" />
          <button type="submit" className="wl-btn primary" disabled={!idea.trim()}>Build ✦</button>
        </form>
        <div className="wl-chips">
          {EXAMPLES.map(x => <button key={x} onClick={() => build(x)}>{x}</button>)}
        </div>

        <div className="wl-actions">
          <button className="wl-btn primary lg" onClick={() => go('wl-templates')}>Browse templates</button>
          <button className="wl-btn ghost lg" onClick={() => close()}>Start from scratch →</button>
        </div>
      </section>

      <section className="wl-section" id="wl-how">
        <small className="wl-eyebrow">how it works</small>
        <h2>From idea to layout in three steps</h2>
        <div className="wl-steps">
          {STEPS.map(s => (
            <SpotlightCard key={s.n} className="wl-card" spotlightColor="rgba(228,87,46,0.2)">
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
            <button key={t.id} className="wl-tpl" onClick={() => close(() => loadTemplate(t))}>
              <SpotlightCard className="wl-card wl-tpl-card" spotlightColor="rgba(228,87,46,0.18)">
                <Thumb t={t} />
                <div className="wl-tpl-info"><h3>{t.name}</h3><p>{t.desc}</p></div>
                <span className="wl-tpl-open">Open →</span>
              </SpotlightCard>
            </button>
          ))}
          <button className="wl-tpl" onClick={() => close(clearPage)}>
            <SpotlightCard className="wl-card wl-tpl-card wl-tpl-blank" spotlightColor="rgba(255,255,255,0.12)">
              <div className="wl-thumb wl-thumb-blank"><span>+</span></div>
              <div className="wl-tpl-info"><h3>Blank page</h3><p>Build it yourself from components or with the AI</p></div>
              <span className="wl-tpl-open">Open →</span>
            </SpotlightCard>
          </button>
        </div>
      </section>

      <footer className="wl-foot">
        <div className="wl-brand small"><Logo size={18} /><span><i>open</i>constructor</span></div>
        <span><button className="wl-donate" onClick={openDonate}>support the project</button> · effects: React Bits, Magic UI · icons: Lobe Icons</span>
      </footer>
    </div>
  );
}
