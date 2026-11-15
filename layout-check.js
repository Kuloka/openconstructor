// Eyes for the AI: after an answer is on the canvas, the rendered page is checked for parts that overlap
// (text on text, a control on a control, a chart laid over a table…) — the model writes blind and can't see
// that. studio.js sends what was found back to the model once, as a concrete fix request.
// findOverlaps(document) → ["<label.chk> “Google” overlaps <select.dev> “All models”", …]

const short = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const describe = el => {
  const tag = el.tagName.toLowerCase(), cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  const text = tag === 'select' ? el.options?.[el.selectedIndex]?.text : tag === 'input' || tag === 'textarea' ? el.placeholder || el.value || el.type : tag === 'svg' ? 'chart / drawing' : el.textContent;
  return `<${tag}${cls}> “${short(text)}”`;
};

// the box a part really paints: the text itself for text, the element for controls and charts
function boxOf(doc, el, kind){
  if (kind !== 'text') return el.getBoundingClientRect();
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  // a text rect is the font's full content area (accent room above, descender room below): with tight
  // line-heights it reaches into the next line although the letters don't — trim it to the letters
  const fs = parseFloat(doc.defaultView.getComputedStyle(el).fontSize) || 16, up = fs * 0.16, down = fs * 0.2;
  for (const n of el.childNodes) {
    if (n.nodeType !== 3 || !n.textContent.trim()) continue;
    const range = doc.createRange(); range.selectNodeContents(n);
    for (const q of range.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      const top = q.height > fs * 0.8 ? q.top + up : q.top, bottom = q.height > fs * 0.8 ? q.bottom - down : q.bottom;
      l = Math.min(l, q.left); t = Math.min(t, top); r = Math.max(r, q.right); b = Math.max(b, bottom);
    }
  }
  return l === Infinity ? null : { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
}

export function findOverlaps(doc, max = 8){
  const win = doc.defaultView, root = doc.body; if (!win || !root) return [];
  const hidden = new Map();
  const isHidden = el => {
    if (!el || el.nodeType !== 1 || el === root) return false;
    if (hidden.has(el)) return hidden.get(el);
    const cs = win.getComputedStyle(el);
    const h = cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.35 || el.getAttribute('aria-hidden') === 'true' || isHidden(el.parentElement);
    hidden.set(el, h); return h;
  };
  const parts = [];
  for (const el of root.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (/^(script|style|template|option|br|head|title|meta|link)$/.test(tag)) continue;
    if (tag !== 'svg' && el.closest('svg')) continue;
    let kind = '';
    if (/^(input|select|textarea|button)$/.test(tag)) kind = el.type === 'hidden' ? '' : 'control';
    else if (tag === 'svg') kind = el.querySelectorAll('polyline, polygon, path, rect, circle, line').length >= 3 && el.getBoundingClientRect().width > 120 ? 'chart' : '';
    else if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) kind = 'text';
    if (!kind || isHidden(el)) continue;
    // invisible radios / checkboxes behind custom labels (the CSS-only tabs) are not something you see
    if (kind === 'control' && tag === 'input' && /^(radio|checkbox)$/.test(el.type) && +win.getComputedStyle(el).opacity < 0.35) continue;
    const box = boxOf(doc, el, kind);
    if (!box || box.width < 4 || box.height < 4) continue;
    parts.push({ el, kind, box, area: box.width * box.height });
  }
  const found = [], seen = new Set();
  for (let i = 0; i < parts.length && found.length < max; i++) {
    for (let j = i + 1; j < parts.length && found.length < max; j++) {
      const a = parts[i], b = parts[j];
      if (a.kind === 'chart' && b.kind === 'chart') continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left), h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (w <= 2 || h <= 2) continue;
      const inter = w * h, small = Math.min(a.area, b.area);
      if (inter < 40 || inter < small * 0.25) continue;
      const key = describe(a.el) + '|' + describe(b.el); if (seen.has(key)) continue; seen.add(key);
      found.push(`${describe(a.el)} overlaps ${describe(b.el)}`);
    }
  }
  return found;
}

export const LAYOUT_FIX = list => `LAYOUT BUGS seen in the browser on the rendered page — these parts are drawn ON TOP of each other:
${list.map(s => '- ' + s).join('\n')}
Find the cause (position:absolute/fixed pulling things out of the flow, negative margins, fixed heights that are too small, a chart <svg> placed over the table instead of in its own block, inputs and labels stacked in the same grid cell, line-height/height too small for the text) and fix it so nothing overlaps: every chart in its own block with its own height, every control in its own row or column. Keep every other part — texts, colours, sizes, layout — exactly as it is.`;
