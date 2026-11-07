// Small, safe Markdown for chat answers: everything is escaped first, then **bold**, `code`, lists, headings, links and fenced code.
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MD_RE = /```|^\s*([-*•]|\d+[.)]|#{1,4})\s|\*\*|`[^`]+`|\[[^\]]+\]\(https?:/m;
function mdInline(s){
  return escapeHTML(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s.,!?)]|$)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function md(src, copyLabel = 'copy'){
  const parts = String(src).replace(/\r/g, '').split(/```([\w+-]*)[ \t]*\n?([\s\S]*?)(?:```|$)/);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    let list = '', para = [];
    const flush = () => { if (para.length) out += `<p>${para.join('<br>')}</p>`; para = []; };
    const closeList = () => { if (list) out += `</${list}>`; list = ''; };
    for (const line of parts[i].split('\n')) {
      let m;
      if (!line.trim()) { flush(); closeList(); }
      else if ((m = line.match(/^\s*#{1,4}\s+(.*)/))) { flush(); closeList(); out += `<h4>${mdInline(m[1])}</h4>`; }
      else if ((m = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)/))) {
        flush(); const kind = m[1] ? 'ul' : 'ol';
        if (list !== kind) { closeList(); out += `<${kind}>`; list = kind; }
        out += `<li>${mdInline(m[3])}</li>`;
      } else { closeList(); para.push(mdInline(line)); }
    }
    flush(); closeList();
    if (parts[i + 2] != null && parts[i + 2].trim()) out += `<div class="md-pre"><button type="button" class="md-copy">${copyLabel}</button><pre><code>${escapeHTML(parts[i + 2].replace(/\n$/, ''))}</code></pre></div>`;
  }
  return out;
}
