// Editing a big page part by part (pure functions, unit-tested in tests/unit/page-patch.test.js).
// A whole page rewritten by the model runs past the answer limit (cut off → "could not apply") and takes minutes.
// Instead the model sees the page with <!-- part N --> markers and answers with only the changes:
//   <!-- replace N --> new code of part N   <!-- after N --> a new block after part N (0 = at the top)
//   <!-- before N --> a new block before N   <!-- remove N -->   <!-- css --> page-wide <style> overrides
const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;

// Top-level nodes of an HTML string as [{ tag, from, to }] (text between them is skipped); null when unbalanced.
export function topNodes(html){
  const out = []; let depth = 0, start = -1, open = '';
  const re = new RegExp(TAG.source, 'g'); let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [, close, tag, , self] = m, t = tag.toLowerCase();
    if (!close && (t === 'style' || t === 'script')) {
      const end = html.toLowerCase().indexOf('</' + t, re.lastIndex); if (end < 0) return null;
      const stop = html.indexOf('>', end) + 1;
      if (depth === 0) out.push({ tag: t, from: m.index, to: stop });
      re.lastIndex = stop; continue;
    }
    if (close) {
      if (depth === 0) return null;
      if (--depth === 0) { out.push({ tag: open, from: start, to: re.lastIndex }); start = -1; }
      continue;
    }
    if (self || VOID.test(t)) { if (depth === 0) out.push({ tag: t, from: m.index, to: re.lastIndex }); continue; }
    if (depth === 0) { start = m.index; open = t; }
    depth++;
  }
  return depth === 0 ? out : null;
}

// { head, parts, tail }: the page's own styles + wrappers, the blocks inside (each with the <style> right before it), the closing tags.
export function splitPage(code){
  code = String(code);
  let head = '', tail = '', body = code;
  for (let level = 0; level < 3; level++) {
    const nodes = topNodes(body); if (!nodes) return null;
    const els = nodes.filter(n => n.tag !== 'style');
    if (els.length !== 1 || !/^(div|main|article)$/.test(els[0].tag)) break;
    const el = els[0], inner = body.slice(el.from, el.to), openEnd = inner.indexOf('>') + 1, closeAt = inner.lastIndexOf('</');
    head += body.slice(0, el.from) + inner.slice(0, openEnd);
    tail = inner.slice(closeAt) + body.slice(el.to) + tail;
    body = inner.slice(openEnd, closeAt);
  }
  const nodes = topNodes(body); if (!nodes) return null;
  const parts = []; let from = null;
  for (const n of nodes) {
    if (from === null) from = n.from;
    if (n.tag !== 'style') { parts.push(body.slice(from, n.to).trim()); from = null; }
  }
  if (parts.length < 3) return null;
  // styles after the last block stay with it
  if (from !== null) parts[parts.length - 1] += '\n' + body.slice(from).trim();
  return { head, parts, tail };
}

export const numbered = sp => sp.head + '\n' + sp.parts.map((p, i) => `<!-- part ${i + 1} -->\n${p}`).join('\n') + '\n' + sp.tail;

const MARK = /<!--\s*(replace|after|before|remove|css)\s*(?:part\s*)?(\d*)\s*-->/gi;
export function parseOps(text){
  const s = String(text), marks = [...s.matchAll(MARK)];
  return marks.map((m, i) => ({ op: m[1].toLowerCase(), n: m[2] === '' ? null : +m[2], code: s.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : s.length).replace(/<!--\s*part\s*\d+\s*-->/gi, '').trim() }));
}
// a block is usable when it is balanced and holds at least one element (a cut-off last block is dropped)
const complete = code => { const n = topNodes(code); return !!n && n.some(x => x.tag !== 'style'); };

// The page with the changes applied → { code, applied } or null when nothing in the answer could be used.
export function applyPatch(sp, text){
  const ops = parseOps(text); if (!ops.length) return null;
  const parts = sp.parts.map(c => ({ c, before: [], after: [] }));
  const top = []; let css = '', applied = 0;
  for (const o of ops) {
    if (o.op === 'css') { const s = o.code.replace(/<\/?style[^>]*>/gi, '').trim(); if (s && !/</.test(s)) { css += s + '\n'; applied++; } continue; }
    if (o.n === null) continue;
    if (o.op === 'after' && o.n === 0) { if (complete(o.code)) { top.push(o.code); applied++; } continue; }
    const p = parts[o.n - 1]; if (!p) continue;
    if (o.op === 'remove') { p.c = ''; applied++; continue; }
    if (!complete(o.code)) continue;
    if (o.op === 'replace') p.c = o.code; else p[o.op].push(o.code);
    applied++;
  }
  if (!applied) return null;
  const body = [...top, ...parts.flatMap(p => [...p.before, p.c, ...p.after])].filter(Boolean);
  return { code: sp.head + (css ? `\n<style>${css}</style>` : '') + '\n' + body.join('\n') + '\n' + sp.tail, applied };
}

export const PATCH_RULES = `The Current element is a big page, shown with <!-- part N --> markers before its blocks. Do NOT return the whole page — answer with only the changes:
line 1: {"action":"patch","name":"short page name","reply":"short reply to the user"}
then ONE \`\`\`html block that holds only the changed blocks, each starting with a marker line:
<!-- replace N --> then the complete new code of part N (its own <style> if it has one, then the element)
<!-- after N --> then a NEW block (optional <style> + one section) to insert after part N; <!-- after 0 --> puts it at the very top
<!-- remove N -->
<!-- css --> then one <style> with page-wide overrides (colours, fonts, CSS variables) when the change is about the whole page
Several markers in one answer are fine. New blocks reuse the page's CSS variables, ready classes and look, and give their own new classes a unique prefix. Do not repeat parts that stay the same.`;
