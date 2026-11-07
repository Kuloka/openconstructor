// Brand kit: name, colours, font, corners, tone and logo of the project. Read from a website
// (worker /api/brand) or set by hand; the AI then builds every block in this style (studio.js).
// Kept in the project's page settings, so it travels with the project.
import { studio } from './studio.js';
import { t } from './i18n.js';
import './brand.css';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = [['primary', 'main colour'], ['accent', 'accent'], ['background', 'background'], ['text', 'text']];
const FONTS = ['Inter', 'Manrope', 'DM Sans', 'Poppins', 'Montserrat', 'Space Grotesk', 'Playfair Display', 'Merriweather', 'JetBrains Mono'];

const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'brandModal';
modal.innerHTML = `<div class="modal-card wide br-card" role="dialog" aria-labelledby="brTitle">
  <div class="modal-head"><h2 id="brTitle">brand kit</h2><button class="btn icon" type="button" data-br="close" aria-label="Close">×</button></div>
  <p class="muted">The AI builds every new block in this style — no more generic “AI look”. Paste your website to fill it in, or set it by hand.</p>
  <form class="br-from" id="brFrom"><input id="brUrl" placeholder="your-site.com" spellcheck="false" aria-label="Website address"><button class="btn primary" type="submit" id="brFetch">read from website</button></form>
  <div class="br-msg" id="brMsg"></div>
  <div class="br-grid">
    <label class="field">Name<input id="brName" maxlength="60" placeholder="Brand name"></label>
    <label class="field">Font<input id="brFont" list="brFonts" maxlength="60" placeholder="Inter"><datalist id="brFonts">${FONTS.map(f => `<option value="${f}">`).join('')}</datalist></label>
    ${COLORS.map(([k, label]) => `<label class="field br-color">${label}<span><input type="color" data-color="${k}"><input data-hex="${k}" maxlength="7" spellcheck="false"></span></label>`).join('')}
    <label class="field">Corners <b id="brRadiusV"></b><input type="range" id="brRadius" min="0" max="32" step="1"></label>
    <label class="field br-logo">Logo<span><img id="brLogoImg" alt=""><button class="btn" type="button" data-br="logo">upload…</button><button class="btn" type="button" data-br="nologo">remove</button></span></label>
    <label class="field br-wide">Tone of voice<input id="brTone" maxlength="160" placeholder="friendly, confident, no jargon"></label>
  </div>
  <div class="br-preview" id="brPreview"></div>
  <div class="modal-actions"><label class="br-on"><input type="checkbox" id="brOn" checked> use for the AI</label><span class="sp"></span><button class="btn" type="button" data-br="clear">clear</button><button class="btn primary" type="button" data-br="save">save</button></div>
</div>`;
document.body.append(modal);
const $ = s => modal.querySelector(s);
const logoInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
document.body.append(logoInput);
let draft = {};

const blank = () => ({ name: '', primary: '#e4572e', accent: '', background: '#ffffff', text: '#18181b', font: '', radius: 12, tone: '', logo: '', on: true });
function fill(b){
  draft = { ...blank(), ...b };
  $('#brName').value = draft.name; $('#brFont').value = draft.font; $('#brTone').value = draft.tone;
  $('#brRadius').value = draft.radius ?? 12; $('#brOn').checked = draft.on !== false;
  for (const [k] of COLORS) { $(`[data-color="${k}"]`).value = draft[k] || '#000000'; $(`[data-hex="${k}"]`).value = draft[k] || ''; }
  preview();
}
function read(){
  draft.name = $('#brName').value.trim(); draft.font = $('#brFont').value.trim(); draft.tone = $('#brTone').value.trim();
  draft.radius = +$('#brRadius').value; draft.on = $('#brOn').checked;
  for (const [k] of COLORS) { const v = $(`[data-hex="${k}"]`).value.trim(); draft[k] = /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : (k === 'accent' ? '' : draft[k]); }
}
function preview(){
  read();
  const b = draft, r = b.radius ?? 12;
  $('#brRadiusV').textContent = r + 'px';
  $('#brLogoImg').src = b.logo || ''; $('#brLogoImg').hidden = !b.logo;
  $('#brPreview').innerHTML = `<div style="background:${esc(b.background)};color:${esc(b.text)};font-family:${esc(b.font ? `'${b.font}', ` : '')}system-ui,sans-serif;border-radius:${r}px">
    <div class="bp-head">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<b>${esc(b.name || t('Your brand'))}</b></div>
    <p>${esc(b.tone ? t('Tone') + ': ' + b.tone : t('A short line of text in your style.'))}</p>
    <span class="bp-btn" style="background:${esc(b.primary)};border-radius:${r}px">${esc(t('Main button'))}</span>${b.accent ? `<span class="bp-btn" style="background:${esc(b.accent)};border-radius:${r}px">${esc(t('Accent'))}</span>` : ''}
  </div>`;
}
modal.addEventListener('input', e => {
  const c = e.target.dataset.color; if (c) $(`[data-hex="${c}"]`).value = e.target.value;
  const h = e.target.dataset.hex; if (h && /^#[0-9a-f]{6}$/i.test(e.target.value)) $(`[data-color="${h}"]`).value = e.target.value;
  preview();
});
const msg = (text, kind = '') => { $('#brMsg').textContent = text; $('#brMsg').className = 'br-msg ' + kind; };
$('#brFrom').onsubmit = async e => {
  e.preventDefault();
  const url = $('#brUrl').value.trim(); if (!url) return;
  $('#brFetch').disabled = true; msg(t('reading the website…'));
  try {
    const r = await fetch('/api/brand?url=' + encodeURIComponent(url));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
    fill({ ...draft, name: d.name || draft.name, primary: d.primary, accent: d.accent || '', background: d.background, text: d.text, font: d.font || draft.font, radius: d.radius ?? draft.radius, logo: d.logo || draft.logo, source: d.source });
    msg(t('Done — check the colours and fix anything that looks off.'), 'ok');
  } catch (err) { msg(`${t("Couldn't read the website")}: ${err.message}`, 'err'); }
  finally { $('#brFetch').disabled = false; }
};
logoInput.onchange = () => {
  const f = logoInput.files[0]; logoInput.value = ''; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    draft.logo = c.toDataURL('image/png'); preview();
  };
  img.src = url;
};
modal.addEventListener('click', e => {
  if (e.target === modal) return close();
  const a = e.target.closest('[data-br]')?.dataset.br; if (!a) return;
  if (a === 'close') close();
  else if (a === 'logo') logoInput.click();
  else if (a === 'nologo') { draft.logo = ''; preview(); }
  else if (a === 'clear') { if (confirm(t('Clear the brand kit of this project?'))) { studio.setPage({ brand: null }); close(); studio.status('brand kit cleared', 'ok'); } }
  else if (a === 'save') { read(); studio.setPage({ brand: { ...draft } }); close(); studio.status(draft.on ? 'brand kit saved — the AI will use it' : 'brand kit saved (off for the AI)', 'ok'); mark(); }
});
function close(){ modal.classList.add('hidden'); }
export function openBrand(){ fill(studio.page().brand || {}); msg(''); modal.classList.remove('hidden'); }

// Toolbar button next to "theme"; its dot shows the brand colour
const btn = document.createElement('button');
btn.type = 'button'; btn.className = 'theme-btn br-btn'; btn.id = 'brandBtn'; btn.title = 'Brand kit: colours, font and logo the AI follows';
btn.innerHTML = '<i class="br-dot"></i>brand';
btn.onclick = openBrand;
function mark(){ const b = studio.page().brand; btn.querySelector('.br-dot').style.background = b?.on !== false && b?.primary ? b.primary : ''; btn.classList.toggle('on', !!(b && b.on !== false)); }
function mount(){
  const anchor = document.getElementById('themeBtn');
  if (!anchor) return setTimeout(mount, 300);
  anchor.after(btn); mark();
}
mount();
window.addEventListener('oc:changed', mark);
