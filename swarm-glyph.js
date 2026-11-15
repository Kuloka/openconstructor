// The "AI is thinking" glyph: a swarm of dots circling, gathering to the centre and spreading out again
// (the swarm of agents building the page). Drawn on a tiny <canvas> in the text colour of its container
// (CSS: color: var(--ai)). One animation loop serves every glyph on screen; a glyph that leaves the page
// drops out of the loop by itself, and so does one that stays hidden (display:none, a folded panel) for 2 s.
// swarmGlyph({ dots }) → a <canvas class="swarm-glyph"> (18 dots by default; more for big ones). Under reduced motion the swarm is drawn once, still.

const live = new Set();
let raf = 0;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function swarmGlyph({ dots = 18 } = {}){
  const cv = document.createElement('canvas');
  cv.className = 'swarm-glyph';
  cv.setAttribute('aria-hidden', 'true');
  let seed = (Math.random() * 1e6) | 0;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  cv._dots = Array.from({ length: dots }, () => ({ a: rnd() * 6.283, r: 0.45 + rnd() * 0.55, s: 0.6 + rnd() * 1.2, z: rnd() }));
  cv._t0 = performance.now();
  live.add(cv);
  if (!raf) raf = requestAnimationFrame(loop);
  return cv;
}

function draw(cv, t){
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(cv).color;
  const gather = (Math.sin((t - cv._t0) / 900) + 1) / 2, R = Math.min(w, h) / 2, moving = !still();
  for (const p of cv._dots) {
    if (moving) p.a += 0.012 * p.s * (1.4 - gather);
    const r = R * (0.12 + p.r * 0.86 * (0.35 + 0.65 * (1 - gather)));
    ctx.globalAlpha = 0.55 + p.z * 0.45;
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(p.a) * r, h / 2 + Math.sin(p.a) * r * 0.92, R > 20 ? 0.8 + p.z * 1.8 + R * 0.006 : Math.max(0.8, R * (0.1 + p.z * 0.07)) /* ~1–1.4 px at 16 px; big swarms keep fine dots */, 0, 6.283);
    ctx.fill();
  }
}

function loop(t){
  raf = 0;
  let unseen = false;
  for (const cv of live) {
    if (!cv.isConnected) { live.delete(cv); continue; }
    // hidden (a folded "thought for 7s" panel): skip the work; hidden for 2 s = done, leave the loop for good
    if (cv.offsetParent === null || !cv.clientWidth) { cv._hid ??= t; if (t - cv._hid > 2000) live.delete(cv); else unseen = true; continue; }
    cv._hid = null;
    draw(cv, t);
    if (still()) cv._drawn = true;
  }
  // moving: every frame; still (reduced motion): only until each glyph has been drawn once
  if (!live.size) return;
  if (!still()) raf = requestAnimationFrame(loop);
  else if (unseen || [...live].some(cv => !cv._drawn)) setTimeout(() => { if (!raf) raf = requestAnimationFrame(loop); }, 400);
}
