// Page background editor: solid / linear / radial / mesh gradients, an optional pattern layer,
// presets and raw CSS. Produces one CSS `background` value that the board and the export both use.

const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const DEFAULT_SPEC = { type: 'solid', c1: '#09090b', c2: '#3a1530', c3: '#0b2235', angle: 160, pattern: 'none', po: 0.08 };

export const PRESETS = [
  { name: 'Night', spec: { type: 'solid', c1: '#09090b' } },
  { name: 'Graphite', spec: { type: 'solid', c1: '#18181b' } },
  { name: 'Paper', spec: { type: 'solid', c1: '#fafafa' } },
  { name: 'Ember', spec: { type: 'radial', c1: '#0c0a09', c2: '#5a1d0c' } },
  { name: 'Amethyst', spec: { type: 'linear', c1: '#0b0a12', c2: '#1e1338', angle: 160 } },
  { name: 'Ocean', spec: { type: 'linear', c1: '#08090c', c2: '#0b2235', angle: 160 } },
  { name: 'Aurora', spec: { type: 'mesh', c1: '#07080d', c2: '#0f5b4e', c3: '#3b1e6e' } },
  { name: 'Sunset', spec: { type: 'mesh', c1: '#0d0809', c2: '#7a2a12', c3: '#5b1a4a' } },
  { name: 'Blueprint', spec: { type: 'solid', c1: '#0b1a33', pattern: 'grid', po: 0.12 } },
  { name: 'Dots', spec: { type: 'solid', c1: '#0c0a09', pattern: 'dots', po: 0.14 } },
  { name: 'Film', spec: { type: 'radial', c1: '#0a0a0a', c2: '#2a2a2a', pattern: 'noise', po: 0.10 } },
  { name: 'Mint', spec: { type: 'linear', c1: '#f4fbf8', c2: '#d7f2e6', angle: 180 } },
];

const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
export const luminance = hex => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };

export function toCSS(s){
  s = { ...DEFAULT_SPEC, ...s };
  const ink = luminance(s.c1) > .5 ? '0,0,0' : '255,255,255';
  const p = Math.max(0, Math.min(1, +s.po || 0));
  const pattern = {
    none: [],
    dots: [`radial-gradient(rgba(${ink},${p}) 1px, transparent 1.5px) 0 0 / 22px 22px`],
    grid: [`linear-gradient(rgba(${ink},${p}) 1px, transparent 1px) 0 0 / 40px 40px`, `linear-gradient(90deg, rgba(${ink},${p}) 1px, transparent 1px) 0 0 / 40px 40px`],
    lines: [`repeating-linear-gradient(135deg, rgba(${ink},${p}) 0 1px, transparent 1px 14px)`],
    noise: [`${NOISE} 0 0 / 160px 160px`],
  }[s.pattern] || [];
  const base = {
    solid: [s.c1],
    linear: [`linear-gradient(${+s.angle || 0}deg, ${s.c2} 0%, ${s.c1} 60%)`],
    radial: [`radial-gradient(120% 80% at 50% 0%, ${s.c2} 0%, ${s.c1} 62%)`],
    mesh: [`radial-gradient(60% 50% at 15% 10%, ${hexA(s.c2, .85)} 0%, transparent 60%)`, `radial-gradient(55% 45% at 85% 20%, ${hexA(s.c3, .8)} 0%, transparent 60%)`, `radial-gradient(70% 50% at 50% 100%, ${hexA(s.c2, .45)} 0%, transparent 65%)`, s.c1],
  }[s.type] || [s.c1];
  // Noise needs opacity: blend it via a translucent layer of the base color on top
  if (s.pattern === 'noise') pattern.unshift(`linear-gradient(${hexA(s.c1, 1 - p)}, ${hexA(s.c1, 1 - p)})`);
  return [...pattern, ...base].join(', ');
}

// UI: a popover anchored to the toolbar button. `get()` returns the current spec, `set(spec, css)` applies it.
export function mountBackgroundEditor(button, { get, set }){
  const panel = document.createElement('div');
  panel.className = 'bg-panel hidden'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Page background');
  document.body.append(panel);
  let spec = { ...DEFAULT_SPEC, ...get() };

  const field = (label, html) => `<label class="bg-field"><span>${label}</span>${html}</label>`;
  function draw(){
    const t = spec.type;
    panel.innerHTML = `
      <div class="bg-head">background<button class="btn icon" data-bg-close title="Close">×</button></div>
      <div class="bg-presets">${PRESETS.map((p, i) => `<button data-preset-bg="${i}" title="${p.name}" style="background:${toCSS(p.spec)}"></button>`).join('')}</div>
      <div class="bg-tabs" role="tablist">${['solid', 'linear', 'radial', 'mesh'].map(x => `<button role="tab" data-type="${x}" class="${x === t ? 'active' : ''}">${x}</button>`).join('')}</div>
      <div class="bg-row">
        ${field('base', `<input type="color" data-k="c1" value="${spec.c1}">`)}
        ${t !== 'solid' ? field('glow', `<input type="color" data-k="c2" value="${spec.c2}">`) : ''}
        ${t === 'mesh' ? field('accent', `<input type="color" data-k="c3" value="${spec.c3}">`) : ''}
      </div>
      ${t === 'linear' ? field(`angle <b>${spec.angle}°</b>`, `<input type="range" min="0" max="360" step="5" data-k="angle" value="${spec.angle}">`) : ''}
      <div class="bg-tabs small">${['none', 'dots', 'grid', 'lines', 'noise'].map(x => `<button data-pattern="${x}" class="${x === spec.pattern ? 'active' : ''}">${x}</button>`).join('')}</div>
      ${spec.pattern !== 'none' ? field(`pattern strength <b>${Math.round(spec.po * 100)}%</b>`, `<input type="range" min="0.02" max="0.4" step="0.01" data-k="po" value="${spec.po}">`) : ''}
      <details class="bg-css"><summary>css</summary><textarea spellcheck="false" data-css>${toCSS(spec)}</textarea><button class="btn block" data-apply-css>apply css</button></details>`;
  }
  function apply(next, redraw = true){ spec = { ...spec, ...next }; delete spec.css; set(spec, toCSS(spec)); if (redraw) draw(); else { const ta = panel.querySelector('[data-css]'); if (ta) ta.value = toCSS(spec); } }

  panel.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.bgClose !== undefined) return close();
    if (t.dataset.presetBg) return apply({ ...DEFAULT_SPEC, ...PRESETS[+t.dataset.presetBg].spec });
    if (t.dataset.type) return apply({ type: t.dataset.type });
    if (t.dataset.pattern) return apply({ pattern: t.dataset.pattern });
    if (t.dataset.applyCss !== undefined) { const css = panel.querySelector('[data-css]').value.trim(); if (css) { spec = { ...spec, css }; set(spec, css); } }
  });
  panel.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.type === 'range' ? +e.target.value : e.target.value;
    apply({ [k]: v }, false);
    const b = e.target.closest('.bg-field')?.querySelector('b'); if (b) b.textContent = k === 'angle' ? v + '°' : Math.round(v * 100) + '%';
  });

  function open(){
    spec = { ...DEFAULT_SPEC, ...get() }; draw(); panel.classList.remove('hidden');
    const r = button.getBoundingClientRect();
    panel.style.left = Math.min(r.left, innerWidth - panel.offsetWidth - 12) + 'px'; panel.style.top = r.bottom + 8 + 'px';
  }
  function close(){ panel.classList.add('hidden'); }
  button.addEventListener('click', () => panel.classList.contains('hidden') ? open() : close());
  addEventListener('pointerdown', e => { if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !button.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return { open, close };
}
