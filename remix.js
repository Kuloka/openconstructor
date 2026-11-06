// Remix: /?remix=<slug> opens a published gallery page's editable project in the
// editor (stored in pages.source by publish.js, see supabase/remix.sql).
// The new project is named "<name>-remix"; publish.js credits the original via
// `remixed_from` while the project keeps that name.
import { supabase } from './auth.js';
import { studio } from './studio.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const REMIX_KEY = 'oc-remixed-from';
const slug = new URLSearchParams(location.search).get('remix');

function cleanUrl(){
  const params = new URLSearchParams(location.search);
  params.delete('remix');
  const qs = params.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

// Keep the welcome screen out of the way. This runs before Welcome first renders
// (it reads `oc-welcomed`), and the CSS covers the case where it's already open.
function hideWelcome(){
  try { localStorage.setItem('oc-welcomed', '1'); } catch {}
  const style = document.createElement('style');
  style.textContent = '.oc-remix .wl{display:none!important}';
  document.head.append(style);
  document.documentElement.classList.add('oc-remix');
  // Once it's really closed (or was never open) let the home button show it again
  const release = () => document.documentElement.classList.remove('oc-remix');
  window.addEventListener('oc:welcome-closed', release, { once: true });
  setTimeout(() => {
    if (document.querySelector('.wl')) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else release();
  }, 0);
}

async function remix(){
  cleanUrl();
  if (!SLUG_RE.test(slug)) { studio.status("that remix link isn't valid", 'error'); return; }
  if (!supabase) { studio.status('remixing needs the community gallery, which is not configured on this build', 'error'); return; }
  hideWelcome();
  studio.status(`loading /p/${slug} for remixing…`, 'busy');

  const { data, error } = await supabase.from('pages').select('title, source')
    .eq('slug', slug).eq('listed', true).eq('hidden', false).maybeSingle();
  if (error) {
    const old = error.code === '42703' || /source/i.test(error.message || '');
    studio.status(old ? `/p/${slug} can't be remixed yet — remixing isn't enabled on the server` : `couldn't load /p/${slug}: ${error.message}`, 'error');
    return;
  }
  if (!data) { studio.status(`/p/${slug} isn't in the community gallery, so it can't be remixed`, 'error'); return; }
  const src = data.source;
  if (!src || !Array.isArray(src.items) || !src.items.length) {
    studio.status(`"${data.title || slug}" was published before remixing existed, so its editable version isn't available`, 'error');
    return;
  }
  if (studio.items().length && !confirm(`Open "${data.title || slug}" for remixing? It replaces what's on your canvas now (Ctrl+Z undoes it).`)) {
    studio.status('remix cancelled — your canvas is unchanged');
    return;
  }

  const base = String(src.name || data.title || slug).trim().slice(0, 60) || slug;
  const name = /-remix$/.test(base) ? base : `${base}-remix`;
  studio.load({ items: src.items, page: src.page && typeof src.page === 'object' ? src.page : undefined, name });
  try { localStorage.setItem(REMIX_KEY, JSON.stringify({ slug, name: studio.name() })); } catch {}
  studio.status(`Remixing "${data.title || slug}" — publish your version when ready`, 'ok');
}

if (slug !== null) remix();
