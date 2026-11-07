// AI pictures: the free FLUX model behind the worker's /api/image (signed-in users; one picture
// counts as one free AI generation). Returns a Blob (JPEG) or throws with a readable message.
import { t } from './i18n.js';

export async function aiImage(prompt){
  const { supabase, openAuth } = await import('./auth.js');
  const { data } = (await supabase?.auth.getSession()) || {};
  const token = data?.session?.access_token;
  if (!token) { openAuth('signup'); throw Error(t('Sign in to generate images with the free AI.')); }
  const r = await fetch('/api/image', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
  const q = /^(\d+)\/(\d+)$/.exec(r.headers.get('X-OC-Quota') || '');
  if (q) window.dispatchEvent(new CustomEvent('oc-quota', { detail: { used: +q[1], limit: +q[2] } }));
  if (!r.ok) { let m = `HTTP ${r.status}`; try { m = (await r.json()).error?.message || m; } catch {} throw Error(m); }
  return r.blob();
}
// Ask what to draw (prefilled with a hint), or null when cancelled
export function askPicture(hint = ''){
  const v = prompt(t('Describe the picture (English works best):'), hint);
  return v && v.trim().length >= 3 ? v.trim() : null;
}
