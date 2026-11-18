// Start-screen motion (our own, no effect libraries):
//   reveal(root)  sections, cards and headings rise in as they scroll into view, cards one after another
//   tiltIn(el)    the hero stage lies back in 3D and settles flat as you scroll (scroll-linked)
//   countUp(root) the numbers band counts up once
// Everything stops on reduced motion; returns a cleanup function.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const REVEAL = '.wl-section > .wl-eyebrow, .wl-section > h2, .wl-section > .wl-section-sub, .wl-section .wl-prompt, .wl-section .wl-chips, .wl-app, .wl-bento > *, .wl-stats > *, .wl-models-copy > *, .wl-orbit, .wl-code, .wl-marquee, .wl-tpls-btns, .wl-cta > *, .wl-guides';
export function reveal(root){
  if (!root) return () => {};
  const els = [...root.querySelectorAll(REVEAL)];
  if (calm() || !('IntersectionObserver' in window)) return () => {};
  // siblings that arrive together come in one after another
  const groups = new Map();
  for (const el of els) { const k = el.parentElement; const i = groups.get(k) || 0; groups.set(k, i + 1); el.style.setProperty('--rd', Math.min(i, 8) * 70 + 'ms'); el.classList.add('wl-rv'); }
  const io = new IntersectionObserver(list => {
    for (const e of list) if (e.isIntersecting) { e.target.classList.add('wl-in'); io.unobserve(e.target); }
  }, { root, rootMargin: '0px 0px -8% 0px', threshold: .08 });
  els.forEach(el => io.observe(el));
  return () => io.disconnect();
}

export function tiltIn(root, el){
  if (!root || !el || calm()) return () => {};
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = el.getBoundingClientRect(), vh = root.clientHeight || innerHeight;
    // 0 while the demo's top is at the bottom of the screen, 1 once it reaches 35% from the top
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * .65)));
    const e = 1 - Math.pow(1 - p, 3);
    el.style.transform = `perspective(1400px) rotateX(${(1 - e) * 22}deg) scale(${.92 + e * .08}) translateY(${(1 - e) * 40}px)`;
    el.style.opacity = String(.35 + e * .65);
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(update); };
  root.addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
  update();
  return () => { root.removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
}

// countUp(root)  numbers in [data-count] run from 0 to their value the first time they are seen
export function countUp(root){
  const els = [...(root?.querySelectorAll('[data-count]') || [])];
  if (!els.length || calm() || !('IntersectionObserver' in window)) return () => {};
  const raf = new Set();
  els.forEach(el => { if (+el.dataset.count) el.textContent = '0'; });
  const io = new IntersectionObserver(list => {
    for (const e of list) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1400;
      const step = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 4)))); if (p < 1) { const id = requestAnimationFrame(step); raf.add(id); } };
      requestAnimationFrame(step);
    }
  }, { root, threshold: .6 });
  els.forEach(el => io.observe(el));
  return () => { io.disconnect(); raf.forEach(cancelAnimationFrame); };
}
