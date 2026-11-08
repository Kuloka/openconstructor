// Funnel counters: how many times a day something happens (editor opened, AI request sent, page published…).
// No personal data — only the event name and the day (supabase/events.sql). Fails silently before that SQL is run.
const EVENTS = new Set(['visit', 'editor', 'ai_send', 'ai_ok', 'ai_fail', 'ai_limit', 'signup_prompt', 'signup_click', 'signin',
  'publish', 'share', 'export', 'gallery', 'remix', 'template',
  // why an AI request failed
  'fail_busy', 'fail_format', 'fail_long', 'fail_auth', 'fail_network', 'fail_other']);

// Sort an AI error into a few reasons, so the funnel shows what to fix first
export function failReason(e){
  const msg = String(e?.message || e || '');
  if (e?.status === 413 || /too long|too large|context/i.test(msg)) return 'fail_long';
  if (e?.status === 429 || e?.status === 503 || /busy|limit|quota|overloaded|rate/i.test(msg)) return 'fail_busy';
  if (e?.status === 401 || e?.status === 403 || /sign in|session|api key|unauthor/i.test(msg)) return 'fail_auth';
  if (/failed to fetch|network|load failed|unreachable|timeout|aborted/i.test(msg)) return 'fail_network';
  if (/format|invalid code|empty model response|garbled|parse|json/i.test(msg)) return 'fail_format';
  return 'fail_other';
}

let client = null;
const sb = async () => client || (client = (await import('./auth.js')).supabase);

// once: count at most one per browser per day (daily visitors instead of page loads)
export async function track(e, { once = false } = {}){
  if (!EVENTS.has(e)) return;
  try {
    if (once) {
      const k = `oc-t:${e}:${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
    }
    const s = await sb();
    if (s) await s.rpc('track_event', { e });
  } catch {}
}
