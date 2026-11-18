// Hand-made visual effects for the start screen (the same ones as the desktop app, desktop/ui/fx.js):
//  field(canvas)  a grid of dots that parts around the cursor and breathes slowly → { stop() }
//  tilt(el)       a card leans toward the cursor; --mx/--my feed its spotlight → cleanup()
// Both stand still under prefers-reduced-motion and cost nothing while the page is hidden.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function field(cv){
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dots = [], mx = -9999, my = -9999, raf = 0, alive = true;
  const GAP = 30, R = 150;
  const size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (let y = GAP / 2; y < h + GAP; y += GAP) for (let x = GAP / 2; x < w + GAP; x += GAP) dots.push({ x, y, ox: 0, oy: 0 });
  };
  const move = e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
  const leave = () => { mx = my = -9999; };
  const frame = t => {
    raf = 0; if (!alive) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy);
      const push = dist < R ? (1 - dist / R) ** 2 * 26 : 0; // pushed away from the cursor, springing back
      d.ox += ((dist ? dx / dist * push : 0) - d.ox) * 0.12; d.oy += ((dist ? dy / dist * push : 0) - d.oy) * 0.12;
      const wave = Math.sin(d.x * 0.012 + t * 0.0006) * Math.cos(d.y * 0.014 - t * 0.0005); // a slow wave through the field
      const near = dist < R * 1.4 ? 1 - dist / (R * 1.4) : 0;
      ctx.globalAlpha = 0.07 + (wave + 1) * 0.03 + near * 0.55;
      ctx.fillStyle = near > 0.05 ? '#a99fff' : '#ffffff';
      ctx.beginPath(); ctx.arc(d.x + d.ox, d.y + d.oy, 0.8 + near * 1.3, 0, 6.283); ctx.fill();
    }
    if (!still() && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const wake = () => { if (alive && !raf && !document.hidden) raf = requestAnimationFrame(frame); };
  size();
  addEventListener('resize', size); addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', leave); document.addEventListener('visibilitychange', wake);
  wake();
  return { stop(){ alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); document.removeEventListener('visibilitychange', wake); } };
}

export function tilt(el, max = 6){
  const move = e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
    if (!still()) el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg)`;
  };
  const leave = () => { el.style.transform = ''; };
  el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
  return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
}
