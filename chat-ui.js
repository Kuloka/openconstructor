// Chat UI of the editor: typewriter text, chat messages (Markdown for longer answers) and the
// "thinking" panel with its steps, live streaming view and the shimmering ghost on the canvas.
import { t } from './i18n.js';
import { MD_RE, md } from './markdown.js';
import logoSvg from './src/logo.svg?raw';
import { liveBuild } from './live-build.js';

const $ = id => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let setState = () => {};
// the studio passes its status-bar setter
export const initChatUI = o => { setState = o.setState; };

export const toBottom = () => { const m = $('messages'); m.scrollTop = m.scrollHeight; };
// Typewriter: types `text` into `el` (about one second whatever the length). A newer call on the same
// element cancels the older one. Reduced motion: the text appears at once.
export function typeText(el, text, { speed = 16 } = {}){
  text = t(String(text ?? ''));
  const id = (el._typing = (el._typing || 0) + 1);
  if (reduceMotion()) { el.textContent = text; toBottom(); return Promise.resolve(); }
  const step = Math.max(1, Math.round(text.length / 70));
  return new Promise(done => {
    let i = 0; el.textContent = ''; el.classList.add('typing');
    const tick = () => {
      if (el._typing !== id) return done();
      i = Math.min(text.length, i + step); el.textContent = text.slice(0, i); toBottom();
      if (i < text.length) setTimeout(tick, speed); else { el.classList.remove('typing'); done(); }
    };
    tick();
  });
}
// Erase what's there, then type the new text — used when a label changes
export function retype(el, text){
  const id = (el._typing = (el._typing || 0) + 1);
  if (reduceMotion() || !el.textContent) return typeText(el, text);
  el.classList.add('typing');
  return new Promise(done => {
    const erase = () => {
      if (el._typing !== id) return done();
      const t = el.textContent; if (t.length) { el.textContent = t.slice(0, -2); setTimeout(erase, 12); } else typeText(el, text).then(done);
    };
    erase();
  });
}

export function message(text, role){
  const node = document.createElement('div'); node.className = 'message ' + role;
  $('messages').append(node);
  if (role !== 'assistant') { node.textContent = text; toBottom(); return node; }
  node.setAttribute('data-no-i18n', ''); text = t(String(text ?? ''));
  if (!MD_RE.test(text) && text.length < 280) { typeText(node, text); return node; }
  // longer answers: rendered Markdown, blocks fading in one after another
  node.classList.add('md'); node.innerHTML = md(text, t('copy'));
  if (!reduceMotion()) [...node.children].forEach((b, i) => { b.style.animation = `msg-in .3s ${Math.min(i, 14) * 70}ms both cubic-bezier(.2,.7,.2,1)`; });
  toBottom(); setTimeout(toBottom, Math.min(node.children.length, 15) * 70 + 320);
  return node;
}
$('messages').addEventListener('click', e => {
  const b = e.target.closest('.md-copy'); if (!b) return;
  navigator.clipboard?.writeText(b.nextElementSibling.textContent).then(() => { b.textContent = t('copied'); setTimeout(() => { b.textContent = t('copy'); }, 1200); });
});

// "Thinking" panel: a checklist that grows step by step, each label typed out; the title retypes
// "thinking" → "composing" when the answer arrives, and the real code is typed into a small window
// while it's placed. At the end it folds into "thought for 7s" (click to see the steps again).
// Returns end(): end() removes it (error), end.compose(name, code), end.answer(), end.finish().
export function thinking({ ghost = false } = {}){
  const node = document.createElement('div');
  node.className = 'message assistant thinking';
  node.innerHTML = `<button class="th-head" type="button" aria-expanded="true"><span class="oc-logo thinking-logo" aria-hidden="true">${logoSvg}</span><span class="th-title"></span><span class="th-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="th-time">0s</span></button><ol class="th-steps"></ol><div class="th-reason" hidden></div><div class="th-live" hidden></div><pre class="th-code" hidden><code></code></pre>`;
  $('messages').append(node); toBottom();
  const title = node.querySelector('.th-title'), list = node.querySelector('.th-steps'), time = node.querySelector('.th-time');
  const t0 = Date.now();
  let queue = Promise.resolve(), over = false, stepAt = t0;
  // Building something: a small browser window in the chat where the page is drawn live as the code
  // streams in (a blueprint until then), and a bigger one over the canvas (live-build.js)
  const lb = ghost ? liveBuild() : null;
  if (lb) list.after(lb.el);
  let ghostEl = null, gb = null;
  const cv = $('canvas')?.getBoundingClientRect();
  if (ghost && cv && cv.width > 360 && cv.height > 260) {
    ghostEl = document.createElement('div'); ghostEl.className = 'th-ghost'; ghostEl.setAttribute('aria-hidden', 'true');
    gb = liveBuild({ big: true }); ghostEl.append(gb.el);
    ghostEl.style.left = cv.left + cv.width / 2 + 'px'; ghostEl.style.top = cv.top + cv.height / 2 + 'px';
    ghostEl.style.width = Math.min(640, cv.width * .7) + 'px';
    document.body.append(ghostEl);
    $('canvasEmpty')?.style.setProperty('visibility', 'hidden');
  }
  const dropGhost = () => { const g = ghostEl; ghostEl = null; if (!g) return; $('canvasEmpty')?.style.removeProperty('visibility'); g.classList.add('out'); setTimeout(() => { gb?.destroy(); g.remove(); }, 260); };
  const build = code => { lb?.update(code); gb?.update(code); };
  // steps run one after another so each label finishes typing before the next starts
  const step = label => (queue = queue.then(() => {
    if (over) return;
    const prev = list.querySelector('li.run');
    if (prev) { prev.classList.replace('run', 'done'); const d = document.createElement('em'); d.className = 'th-took'; d.textContent = ((Date.now() - stepAt) / 1000).toFixed(1) + 's'; prev.append(d); }
    stepAt = Date.now();
    const li = document.createElement('li'); li.className = 'run';
    li.innerHTML = '<i class="th-mark" aria-hidden="true"></i><span></span>';
    list.append(li);
    return typeText(li.lastChild, label);
  }));
  typeText(title, 'thinking');
  setState('ai is thinking…', 'busy');
  // While waiting for the model: the usual stages of building a UI, paced by elapsed time
  const plan = [[0, 'reading your request'], [700, 'thinking it through'], [3500, 'planning the layout'], [8000, 'choosing colors and type'], [14000, 'writing the code']];
  const timers = plan.map(([at, label]) => setTimeout(() => step(label), at));
  const clock = setInterval(() => { time.textContent = Math.floor((Date.now() - t0) / 1000) + 's'; }, 250);
  const stopWaiting = () => { timers.forEach(clearTimeout); };

  const end = () => { over = true; stopWaiting(); clearInterval(clock); dropGhost(); node.remove(); };
  // Streaming: the model's reasoning and its answer show up live as they arrive
  const codeLines = code => String(code).replace(/>\s*</g, '>\n<').replace(/([;{}])(?=[^\n])/g, '$1\n').split('\n').map(l => l.trim()).filter(Boolean);
  let liveText = '', liveWhy = '', streamed = false, liveMode = '', liveRaf = 0;
  const paintLive = () => {
    liveRaf = 0; if (over) return;
    if (liveWhy.trim()) { const r = node.querySelector('.th-reason'); r.hidden = false; r.textContent = liveWhy.slice(-500); }
    const txt = liveText.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
    if (/^\s*\{[^}]*"action"\s*:\s*"(reply|answer|chat)"/i.test(txt)) {
      if (liveMode !== 'reply') { liveMode = 'reply'; retype(title, 'answering'); dropGhost(); if (lb) lb.el.hidden = true; step('writing the answer'); }
      const l = node.querySelector('.th-live'); l.hidden = false; l.textContent = txt.replace(/^\s*\{[^}]*\}\s*/, '').slice(-700);
    } else if (/```|<[a-z]/i.test(txt)) {
      if (liveMode !== 'code') { liveMode = 'code'; retype(title, 'composing'); ghostEl?.classList.add('build'); step('writing the code'); }
      const at = txt.indexOf('```');
      const code = at >= 0 ? txt.slice(txt.indexOf('\n', at) + 1) : txt.slice(Math.max(0, txt.search(/<[a-z]/i)));
      const pre = node.querySelector('.th-code'); pre.hidden = false;
      // with the live preview the code is just a 2-line ticker under it
      pre.firstChild.textContent = codeLines(code).slice(lb ? -2 : -8).join('\n');
      build(code);
    }
    toBottom();
  };
  end.live = (piece, why) => {
    if (over) return;
    if (!streamed) { streamed = true; stopWaiting(); }
    liveText += piece || ''; liveWhy += why || '';
    if (!liveRaf) liveRaf = requestAnimationFrame(paintLive);
  };
  end.liveReset = () => { liveText = ''; liveWhy = ''; liveMode = ''; };
  // The answer arrived with code: show it being written, then the caller places it
  end.compose = (name, code) => {
    stopWaiting();
    retype(title, 'composing'); ghostEl?.classList.add('build');
    setState('composing…', 'busy');
    step(`composing “${String(name || 'element').slice(0, 40)}”`);
    return (queue = queue.then(async () => {
      if (over) return;
      if (streamed) { lb?.done(code); gb?.done(code); return; } // already drawn live: show the finished page
      const pre = node.querySelector('.th-code'), out = pre.firstChild;
      pre.hidden = false;
      // for display only: one tag / CSS declaration per line, so compact code still "writes" line by line
      const lines = codeLines(code).slice(0, 600);
      if (reduceMotion()) { out.textContent = lines.slice(-(lb ? 2 : 8)).join('\n'); lb?.done(code); gb?.done(code); return; }
      // ~1.5s: the code "writes itself" and the preview draws along with it, section by section
      const per = Math.max(1, Math.ceil(lines.length / 50)), src = String(code);
      for (let i = 0; i < lines.length && !over; i += per) {
        out.textContent = lines.slice(Math.max(0, i + per - (lb ? 2 : 8)), i + per).join('\n');
        build(src.slice(0, Math.round(src.length * Math.min(1, (i + per) / lines.length))));
        pre.scrollTop = pre.scrollHeight; toBottom();
        await new Promise(r => setTimeout(r, 30));
      }
      lb?.done(code); gb?.done(code);
    }));
  };
  end.step = label => { stopWaiting(); return step(label); };
  end.answer = () => { stopWaiting(); dropGhost(); if (lb) lb.el.hidden = true; retype(title, 'answering'); return queue; };
  // Fold into a one-line summary that stays in the chat
  end.finish = (lastStep = 'done') => {
    stopWaiting();
    step(lastStep);
    return (queue = queue.then(() => {
      if (over) return;
      over = true; clearInterval(clock); dropGhost();
      list.querySelectorAll('li').forEach(li => li.className = 'done');
      const s = Math.max(1, Math.round((Date.now() - t0) / 1000));
      node.classList.add('folded');
      node.querySelectorAll('.th-code, .th-live').forEach(x => { x.hidden = true; });
      retype(title, `thought for ${s}s`); time.textContent = `${list.children.length} steps`;
      const head = node.querySelector('.th-head');
      head.setAttribute('aria-expanded', 'false');
      head.onclick = () => { const open = node.classList.toggle('folded'); head.setAttribute('aria-expanded', String(!open)); };
    }));
  };
  return end;
}
