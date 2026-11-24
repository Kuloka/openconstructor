// GitHub stars: a "★ Star" button with the live count (editor top bar, start screen), and ONE quiet ask at a
// good moment — after the 2nd successful generation (4th for guests, who first get the "save to cloud" card). Never again after it is answered or dismissed.
import { t } from './i18n.js';

export const REPO_URL = 'https://github.com/Kuloka/openconstructor';
const API = 'https://api.github.com/repos/Kuloka/openconstructor';
const CACHE = 'oc-gh-stars', ASKED = 'oc-star-asked', GOOD = 'oc-gen-ok';
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const GH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>';

let count = null;
const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
function paint(){ document.querySelectorAll('.gh-count').forEach(el => { el.textContent = count == null ? '' : fmt(count); el.hidden = count == null; }); }
async function loadCount(){
  try { const c = JSON.parse(get(CACHE) || 'null'); if (c && Date.now() - c.at < 3600e3) { count = c.n; return paint(); } } catch {}
  try {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const n = (await r.json()).stargazers_count;
    if (Number.isFinite(n)) { count = n; set(CACHE, JSON.stringify({ n, at: Date.now() })); paint(); }
  } catch {}
}

// the button (also rendered by the start screen itself with the same classes)
export function starButton(extra = ''){
  const a = document.createElement('a');
  a.className = 'gh-star ' + extra; a.href = REPO_URL; a.target = '_blank'; a.rel = 'noopener';
  a.title = t('openconstructor is open source — a star on GitHub helps it grow');
  a.innerHTML = `${GH}<span>${t('Star')}</span><span class="gh-count" hidden></span>`;
  a.addEventListener('click', () => set(ASKED, '1'));
  return a;
}
document.querySelector('.tb-right')?.prepend(starButton('in-editor'));
// the start screen (React) renders its own .gh-star; fill its count when it appears
new MutationObserver(() => { if (count != null && document.querySelector('.gh-count[hidden]')) paint(); }).observe(document.body, { childList: true, subtree: true });
loadCount();

// the one ask
function ask(){
  // never on top of another notice (the "saved only in this browser" card): try again after the next good generation
  if (get(ASKED) || document.querySelector('.star-ask, .local-nudge')) return;
  set(ASKED, '1');
  const card = document.createElement('div');
  card.className = 'star-ask'; card.setAttribute('role', 'status');
  card.innerHTML = `<div class="star-ask-t"><b>${t('Enjoying openconstructor?')}</b><span>${t('It is free and open source. A star on GitHub helps other people find it.')}</span></div>
    <div class="star-ask-b"><a class="btn primary" href="${REPO_URL}" target="_blank" rel="noopener">${GH} ${t('Star on GitHub')}</a><button type="button" class="btn" data-later>${t('not now')}</button></div>`;
  card.addEventListener('click', e => { if (e.target.closest('a, [data-later]')) card.remove(); });
  document.body.append(card);
}
window.addEventListener('oc:generated', () => {
  const n = (+get(GOOD) || 0) + 1; set(GOOD, String(n));
  // guests first see the "save to cloud" card on their 2nd generation (projects.js), so the star waits until the 4th
  import('./auth.js').then(({ user }) => { if (n >= (user ? 2 : 4)) setTimeout(ask, 3000); }).catch(() => {});
});
