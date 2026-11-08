// Funnel counters: how many times a day something happens (editor opened, AI request sent, page published…).
// No personal data — only the event name and the day (supabase/events.sql). Fails silently before that SQL is run.
const EVENTS = new Set(['visit', 'editor', 'ai_send', 'ai_ok', 'ai_fail', 'ai_limit', 'signup_prompt', 'signup_click', 'signin',
  'publish', 'share', 'export', 'gallery', 'remix', 'template']);

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
