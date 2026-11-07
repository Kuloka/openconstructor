/* Readable text in AI answers
   Models sometimes give a block a white background and forget the text color, so the text inherits
   the light default: white on white. The code is rendered once in a hidden frame; every text whose
   contrast with the background really under it is below 1.8:1 gets a dark or light color. */
export const rgbOf = s => { const m = String(s).match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+%?))?/); if (!m) return null; const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]; return [+m[1], +m[2], +m[3], a]; };
export const lumOf = ([r, g, b]) => { const f = c => (c /= 255) <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
export const contrast = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
// The color behind an element: the nearest solid background going up; a gradient counts as the average
// of its colors; a photo (url) means "can't tell" and the text is left alone.
function backdrop(el, win, pageRGB){
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const cs = win.getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      if (/url\(/.test(cs.backgroundImage)) return null;
      const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => rgbOf(m[0])).filter(c => c && c[3] > .4);
      if (stops.length) return [0, 1, 2].map(i => stops.reduce((s, c) => s + c[i], 0) / stops.length);
    }
    const bg = rgbOf(cs.backgroundColor);
    if (bg && bg[3] >= .5) return bg;
  }
  return pageRGB;
}
export function fixContrast(code, full, { light, w, h, nodeDoc }){
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none`;
    let done = false;
    const finish = out => { if (done) return; done = true; frame.remove(); resolve(out); };
    setTimeout(() => finish(code), 3000);
    frame.onload = () => {
      try {
        const doc = frame.contentDocument, win = frame.contentWindow, root = doc?.getElementById('__root');
        if (!root) return; // the empty first load, before srcdoc
        const pageRGB = light ? [250, 250, 250] : [12, 10, 9];
        const all = [...root.querySelectorAll('*')], marks = new Map();
        all.forEach((el, i) => {
          if (/^(STYLE|SCRIPT|SVG|PATH|IMG|BR|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName) || el.closest('svg')) return;
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) return;
          const cs = win.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const fill = rgbOf(cs.webkitTextFillColor);
          if (fill && fill[3] === 0) return; // gradient text (background-clip:text)
          const ink = rgbOf(cs.color), bg = backdrop(el, win, pageRGB);
          if (!ink || ink[3] < .3 || !bg) return;
          if (contrast(ink, bg) < 1.8) marks.set(i, lumOf(bg) > .4 ? 'd' : 'l');
        });
        if (!marks.size) return finish(code);
        // Same parse in a template, so the marks land on the same elements in the source code
        const tpl = document.createElement('template'); tpl.innerHTML = code;
        const copy = [...tpl.content.querySelectorAll('*')];
        if (copy.length !== all.length || copy.some((el, i) => el.tagName !== all[i].tagName)) return finish(code);
        marks.forEach((v, i) => copy[i].setAttribute('data-oc-ink', v));
        finish(tpl.innerHTML + (code.includes('[data-oc-ink=d]') ? '' : '<style>[data-oc-ink=d]{color:#18181b!important}[data-oc-ink=l]{color:#fafafa!important}</style>'));
      } catch { finish(code); }
    };
    frame.srcdoc = nodeDoc({ code, full });
    document.body.append(frame);
  });
}
