// Visual effects for the desktop app, all hand-made (no libraries):
//  field(canvas)      the background: a grid of dots that parts around the cursor and breathes slowly
//  tilt(el)           a card leans toward the cursor; --mx/--my feed its spotlight and border glow
//  burst(x, y)        lavender sparks from a point (sign-in success)
//  buildLogo(svg)     the pixel cursor assembling, pixel by pixel
//  letters(el, text)  a word fading in letter by letter
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CURSOR = ['o.......', 'oo......', 'ofo.....', 'offo....', 'offfo...', 'offffo..', 'offfffo.', 'offfoooo', 'ofoofo..', 'oo.ofo..', 'o...ofo.', '....ofo.', '.....oo.'];

export function field(cv){
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, dots = [], mx = -9999, my = -9999, raf = 0, paused = false;
  const GAP = 30, R = 150;
  const size = () => {
    dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (let y = GAP / 2; y < h + GAP; y += GAP) for (let x = GAP / 2; x < w + GAP; x += GAP) dots.push({ x, y, ox: 0, oy: 0 });
  };
  addEventListener('resize', size); size();
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
  document.addEventListener('pointerleave', () => { mx = my = -9999; });
  const frame = t => {
    raf = 0; if (paused) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy);
      // pushed away from the cursor, springing back; a slow wave through the whole field
      const push = dist < R ? (1 - dist / R) ** 2 * 26 : 0;
      const tx = dist ? dx / dist * push : 0, ty = dist ? dy / dist * push : 0;
      d.ox += (tx - d.ox) * 0.12; d.oy += (ty - d.oy) * 0.12;
      const wave = Math.sin(d.x * 0.012 + t * 0.0006) * Math.cos(d.y * 0.014 - t * 0.0005);
      const near = dist < R * 1.4 ? 1 - dist / (R * 1.4) : 0;
      ctx.globalAlpha = 0.08 + (wave + 1) * 0.035 + near * 0.55;
      ctx.fillStyle = near > 0.05 ? '#a99fff' : '#ffffff';
      ctx.beginPath(); ctx.arc(d.x + d.ox, d.y + d.oy, 0.8 + near * 1.3, 0, 6.283); ctx.fill();
    }
    if (!still()) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { pause(on){ paused = on; if (!on && !raf) raf = requestAnimationFrame(frame); } };
}

export function tilt(el, max = 7){
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
    if (!still()) el.style.transform = `rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateZ(0)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}

export function burst(x, y, n = 70){
  if (still()) return;
  const cv = document.getElementById('burst'), ctx = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ps = Array.from({ length: n }, () => { const a = Math.random() * 6.283, v = 2 + Math.random() * 7; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, r: 1 + Math.random() * 2.4, c: Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.5 ? '#9d92ff' : '#6f60f2' }; });
  const step = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of ps) {
      if (p.life <= 0) continue; alive++;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy = p.vy * 0.94 + 0.08; p.life -= 0.018;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    if (alive) requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  requestAnimationFrame(step);
}

export function buildLogo(svg){
  const P = 6, S = 4.8;
  svg.innerHTML = CURSOR.flatMap((row, y) => [...row].map((c, x) => c === '.' ? '' :
    `<rect class="${c}" x="${x * P}" y="${y * P}" width="${S}" height="${S}" rx="1.05" style="animation-delay:${(y * 55 + x * 18 + Math.random() * 40).toFixed(0)}ms"/>`)).join('');
}

export function letters(el, parts){
  let i = 0;
  el.innerHTML = parts.map(([text, cls]) => [...text].map(ch => `<span class="${cls || ''}" style="animation-delay:${(i++) * 34}ms">${ch}</span>`).join('')).join('');
}
