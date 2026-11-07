// Reading AI answers: the JSON header + ```html block format, 3D scenes, chat replies (pure functions).
// Answer format: a one-line JSON header (no code) followed by the code in a ```html block.
// Code outside JSON can't break on escaping, and a missing closing fence (cut-off answer) is tolerated.
// Older JSON-with-"code" answers and bare HTML are still understood.
export function firstJSON(text){
  const a = text.indexOf('{'); if (a < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return { json: text.slice(a, i + 1), end: i + 1 };
  }
  return null;
}
// Models often put raw line breaks / tabs inside JSON strings; escape control characters that sit inside strings.
export function looseJSON(text){
  try { return JSON.parse(text); } catch {}
  let out = '', inStr = false, esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
      else if (ch === '\n') { out += '\\n'; continue; } else if (ch === '\r') continue; else if (ch === '\t') { out += '\\t'; continue; }
    } else if (ch === '"') inStr = true;
    out += ch;
  }
  return JSON.parse(out);
}
export const HTML_START = /<(style|div|section|header|main|button|form|nav|article|aside|footer|ul|h1|a)\b/i;
// A 3D answer: header {"action":"scene3d",…} then a ```json block with the scene (see scene3d.js)
export function parseScene(content){
  const raw = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const head = firstJSON(raw); if (!head) return null;
  let h; try { h = looseJSON(head.json); } catch { return null; }
  if (!h || !/^(scene3d|3d|model3d)$/i.test(String(h.action || ''))) return null;
  const rest = raw.slice(head.end);
  const fence = rest.match(/```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n```|$)/);
  const body = fence ? fence[1] : (firstJSON(rest)?.json || '');
  let scene; try { scene = looseJSON(body.replace(/```\s*$/, '').trim()); } catch { throw Error('The 3D scene could not be read'); }
  if (!scene || !Array.isArray(scene.objects) || !scene.objects.length) throw Error('The 3D scene is empty');
  return { ...h, action: 'scene3d', scene };
}
export function parseAnswer(content){
  const raw = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // a chat answer: {"action":"reply"} header, then free Markdown (which may contain code — it is not a component)
  if (raw.startsWith('{')) {
    const j = firstJSON(raw);
    if (j) { try { const h = looseJSON(j.json); if (/^(reply|answer|chat)$/i.test(String(h.action || ''))) return { action: 'reply', reply: raw.slice(j.end).trim() || String(h.reply || '') }; } catch {} }
  }
  const fence = raw.match(/```(?:html|HTML)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n```|$)/);
  if (fence && /<[a-z!]/i.test(fence[1])) {
    const before = raw.slice(0, fence.index);
    let head = {};
    try { const j = firstJSON(before); if (j) head = looseJSON(j.json); } catch {}
    return { action: 'add', ...head, code: fence[1].replace(/```\s*$/, '').trim() };
  }
  let text = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const bare = () => HTML_START.test(text) ? { action: 'add', name: 'New element', code: text.slice(text.search(HTML_START)) } : null;
  // JSON must start before any markup, otherwise the first "{" is CSS
  const j = text.search(HTML_START) >= 0 && text.indexOf('{') > text.search(HTML_START) ? null : firstJSON(text);
  if (!j) {
    // an old-style {"code":"…"} answer that was cut off: unescape what arrived
    const cut = text.match(/^\s*\{[\s\S]*?"code"\s*:\s*"([\s\S]*)$/);
    if (cut) { try { return { action: 'add', name: (text.match(/"name"\s*:\s*"([^"]*)"/) || [])[1] || 'New element', code: looseJSON('"' + cut[1].replace(/\\+$/, '').replace(/"\s*,\s*"(reply|name|full|action)"[\s\S]*$/, '') + '"') }; } catch {} }
    // no JSON at all: accept plain HTML/CSS, or plain text as a chat reply
    const b = bare(); if (b) return b;
    if (text && !/[{}<>]/.test(text)) return { action: 'reply', reply: text };
    throw Error('The model answered in an unexpected format');
  }
  text = j.json;
  let result;
  try { result = looseJSON(text); }
  catch (e) {
    // legacy format cut mid-string: salvage the "code" value as far as it goes
    const m = text.match(/"code"\s*:\s*"([\s\S]*)/);
    if (!m) throw e;
    result = { action: 'add', code: looseJSON('"' + m[1].replace(/"\s*[,}][\s\S]*$/, '').replace(/\\?$/, '') + '"') };
  }
  if (typeof result.code === 'string') {
    let code = result.code;
    for (let i = 0; i < 2 && /\\[nt"]/.test(code) && !/\n/.test(code.replace(/\\n/g, '')); i++) {
      code = code.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    code = code.replace(/>\s*(\\n)+\s*</g, '>\n<').replace(/^(\s*\\n)+|(\\n\s*)+$/g, '');
    result.code = code;
  }
  return result;
}
