// Ctrl+K command palette: search actions, catalog components and templates; Enter runs the top one.
import { studio, loadTemplate } from './studio.js';
import { templates } from './src/templates.js';
import { startNew, localProjects } from './local-projects.js';
import { t } from './i18n.js';
import './palette.css';

const click = sel => () => document.querySelector(sel)?.click();
// Actions are the editor's own buttons, so the palette always does exactly what the button does
const ACTIONS = [
  ['Export…', 'export ↓', click('#export'), 'export download html react vue svelte'],
  ['Publish…', 'publish', click('#publish'), 'share link'],
  ['Undo', 'Ctrl+Z', click('#undo')],
  ['Redo', 'Ctrl+Y', click('#redo')],
  ['Add icon…', '', () => studio.addIcon(), 'icons symbol'],
  ['AI picture…', '✦', () => studio.addAIPicture(), 'image photo generate draw flux illustration'],
  ['Brand kit…', '', () => import('./brand.js').then(m => m.openBrand()), 'brand colours logo font style'],
  ['Make the selected block better', '✦', () => studio.selectedId() ? studio.improve() : studio.status('select a block first', 'warn'), 'improve design review polish'],
  ['Add your own HTML/CSS', '', click('#addCode'), 'custom code'],
  ['3 variants for the next request: on / off', '⧉ ×3', click('#variantsToggle'), 'variants options'],
  ['New project', '', () => startNew(), 'blank empty'],
  ['Projects', '', () => localProjects.open(), 'open switch'],
  ['Templates and examples', '', click('#homeBtn'), 'home welcome'],
  ['Play mode', 'P', click('#playToggle'), 'test try interact'],
  ['Preview on phone, tablet and desktop', '', click('#devicePreview'), 'devices responsive'],
  ['Page theme', '', click('#themeBtn'), 'colors palette font corners'],
  ['Version history', '', click('#historyBtn'), 'restore versions'],
  ['Fit to screen', 'Ctrl+0', click('#zoomFit'), 'zoom'],
  ['Build from a screenshot', '', click('#shotButton'), 'image picture'],
  ['New chat', '', click('#newChat'), 'ai conversation'],
  ['AI providers and keys', '', click('#settingsButton'), 'settings models api key'],
  ['Quick tour', '?', click('#helpButton'), 'help'],
  ['Community gallery ↗', '', () => window.open('/gallery', '_blank'), 'gallery examples'],
  ['Clear page', '', click('[data-cmd="clear"]'), 'delete all'],
];

function entries(){
  const out = ACTIONS.map(([label, hint, run, words = '']) => ({ group: 'actions', label, hint, run, words }));
  for (const tp of templates) out.push({ group: 'templates', label: tp.name, hint: t('template'), words: tp.desc || '', run: () => startNew(tp.name).then(() => loadTemplate(tp)) });
  for (const c of studio.catalog()) out.push({ group: 'components', label: c.name, hint: c.category, words: c.category, run: c.add });
  return out;
}

const box = document.createElement('div');
box.className = 'pal hidden'; box.id = 'palette';
box.innerHTML = `<div class="pal-card" role="dialog" aria-label="Command palette"><div class="pal-input"><span>›</span><input id="palInput" placeholder="type a command, component or template…" spellcheck="false" autocomplete="off" aria-label="Command"></div><ul class="pal-list" id="palList" role="listbox"></ul><div class="pal-foot"><span>↑↓ move · Enter run · Esc close</span><span>Ctrl+K</span></div></div>`;
document.body.append(box);
const input = box.querySelector('#palInput'), list = box.querySelector('#palList');
let all = [], shown = [], active = 0;

const tr = s => t(s) || s;
function rank(q){
  if (!q) return all.filter(e => e.group === 'actions').concat(all.filter(e => e.group === 'templates'));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return all.map(e => {
    const label = tr(e.label).toLowerCase(), hay = `${label} ${e.label.toLowerCase()} ${tr(e.hint || '').toLowerCase()} ${e.words.toLowerCase()}`;
    if (!words.every(w => hay.includes(w))) return null;
    const score = (label.startsWith(words[0]) ? 30 : 0) + (label.includes(words[0]) ? 10 : 0) + (e.group === 'actions' ? 5 : e.group === 'templates' ? 3 : 0);
    return [e, score];
  }).filter(Boolean).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function render(){
  shown = rank(input.value.trim()).slice(0, 60);
  active = Math.min(active, Math.max(0, shown.length - 1));
  let group = '';
  list.innerHTML = shown.map((e, i) => {
    const head = e.group !== group ? `<li class="pal-group">${tr(e.group)}</li>` : '';
    group = e.group;
    return `${head}<li class="pal-item${i === active ? ' on' : ''}" data-i="${i}" role="option"><span>${esc(tr(e.label))}</span><em>${esc(tr(e.hint || ''))}</em></li>`;
  }).join('') || `<li class="pal-empty">${tr('nothing found')}</li>`;
  list.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function open(){ all = entries(); input.value = ''; active = 0; box.classList.remove('hidden'); render(); input.focus(); }
function close(){ box.classList.add('hidden'); }
function run(i){ const e = shown[i]; if (!e) return; close(); setTimeout(() => e.run(), 0); }

input.addEventListener('input', () => { active = 0; render(); });
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); render(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
  else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  else if (e.key === 'Escape') { e.preventDefault(); close(); }
});
list.addEventListener('mousemove', e => { const li = e.target.closest('.pal-item'); if (li && +li.dataset.i !== active) { active = +li.dataset.i; list.querySelectorAll('.pal-item').forEach(x => x.classList.toggle('on', +x.dataset.i === active)); } });
list.addEventListener('click', e => { const li = e.target.closest('.pal-item'); if (li) run(+li.dataset.i); });
box.addEventListener('mousedown', e => { if (e.target === box) close(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    if (document.querySelector('.wl')) return; // the welcome screen is open
    e.preventDefault(); box.classList.contains('hidden') ? open() : close();
  }
});

export const palette = { open, close };
