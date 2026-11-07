// Icon picker: ~1600 Lucide icons (ISC licence), searchable by name and tags. The icon data loads
// only when the window opens. pickIcon() resolves to an SVG string (stroke = currentColor) or null.
import './icons.css';

let data = null, loading = null; // data: { nodes, tags } once loaded
const load = () => loading ||= Promise.all([import('lucide-static/icon-nodes.json'), import('lucide-static/tags.json')])
  .then(([n, t]) => { data = { nodes: n.default || n, tags: t.default || t }; return data; });

const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
/** The SVG markup of one icon. */
export function iconSvg(nodes, name, size = 24, stroke = 2){
  const inner = (nodes[name] || []).map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'iconsModal';
modal.innerHTML = `<div class="modal-card wide ic-card" role="dialog" aria-labelledby="icTitle">
  <div class="modal-head"><h2 id="icTitle">icons</h2><button class="btn icon" type="button" data-ic-close aria-label="Close">×</button></div>
  <div class="ic-bar"><div class="search-wrap ic-search"><span>/</span><input id="icSearch" placeholder="search icons: heart, cart, arrow, user…" aria-label="Search icons" spellcheck="false"></div>
    <label class="ic-opt">stroke <input type="range" id="icStroke" min="1" max="3" step="0.25" value="2"></label></div>
  <div class="ic-grid" id="icGrid"><div class="ic-empty">loading icons…</div></div>
  <p class="ic-foot"><span id="icCount"></span><span>Lucide icons · ISC licence</span></p>
</div>`;
document.body.append(modal);
const $ = s => modal.querySelector(s);
let resolver = null;
function close(value = null){ modal.classList.add('hidden'); resolver?.(value); resolver = null; }
$('[data-ic-close]').onclick = () => close();
modal.addEventListener('mousedown', e => { if (e.target === modal) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) { e.stopPropagation(); close(); } }, true);

const POPULAR = ['heart', 'star', 'shopping-cart', 'user', 'search', 'menu', 'x', 'check', 'arrow-right', 'arrow-left', 'chevron-down', 'plus', 'minus', 'home', 'settings', 'bell', 'mail', 'phone', 'map-pin', 'calendar', 'clock', 'camera', 'image', 'play', 'pause', 'download', 'upload', 'share-2', 'lock', 'unlock', 'eye', 'trash-2', 'edit', 'copy', 'link', 'globe', 'sun', 'moon', 'cloud', 'zap', 'gift', 'tag', 'credit-card', 'wallet', 'truck', 'package', 'coffee', 'music', 'video', 'message-circle', 'send', 'thumbs-up', 'award', 'trophy', 'rocket', 'sparkles', 'shield-check', 'bar-chart-3', 'trending-up', 'users', 'log-in', 'log-out', 'filter', 'grid-3x3', 'list', 'layers', 'code', 'terminal', 'github', 'twitter', 'instagram', 'youtube', 'facebook', 'linkedin'];
function matches(q){
  const { nodes, tags } = data;
  if (!q) return POPULAR.filter(n => nodes[n]).concat(Object.keys(nodes).filter(n => !POPULAR.includes(n)));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const score = n => {
    const hay = [n, ...(tags[n] || [])].join(' ');
    if (!words.every(w => hay.includes(w))) return -1;
    return (n === q ? 100 : 0) + (n.startsWith(words[0]) ? 50 : 0) + (n.includes(words[0]) ? 20 : 0);
  };
  return Object.keys(nodes).map(n => [n, score(n)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function render(){
  if (!data?.nodes) return;
  const list = matches($('#icSearch').value.trim());
  const shown = list.slice(0, 240), stroke = +$('#icStroke').value;
  $('#icGrid').innerHTML = shown.length ? shown.map(n => `<button type="button" class="ic-cell" data-icon="${n}" title="${n}">${iconSvg(data.nodes, n, 22, stroke)}<span>${n}</span></button>`).join('') : '<div class="ic-empty">nothing found</div>';
  $('#icCount').textContent = list.length > shown.length ? `${shown.length} of ${list.length}` : `${list.length}`;
}
let t = 0;
$('#icSearch').oninput = () => { clearTimeout(t); t = setTimeout(render, 120); };
$('#icStroke').oninput = render;
$('#icGrid').onclick = e => {
  const b = e.target.closest('[data-icon]'); if (!b) return;
  close(iconSvg(data.nodes, b.dataset.icon, 24, +$('#icStroke').value));
};
$('#icSearch').onkeydown = e => { if (e.key === 'Enter') $('#icGrid [data-icon]')?.click(); };

/** Opens the picker; resolves to an SVG string, or null if closed. */
export async function pickIcon(){
  resolver?.(null);
  modal.classList.remove('hidden');
  $('#icSearch').value = '';
  setTimeout(() => $('#icSearch').focus(), 30);
  try { await load(); } catch { $('#icGrid').innerHTML = '<div class="ic-empty">icons could not be loaded</div>'; }
  render();
  return new Promise(r => { resolver = r; });
}
