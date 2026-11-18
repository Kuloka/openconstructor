// One-click OpenRouter: "Sign in with OpenRouter" instead of copying an API key.
// OAuth with PKCE (https://openrouter.ai/docs/use-cases/oauth-pkce): we send the person to openrouter.ai/auth,
// they sign in and allow openconstructor, OpenRouter sends them back with ?code=…, and the browser trades the
// code for the person's own API key. The key goes straight from OpenRouter to this browser (never to our
// server) and is stored like a pasted key. Usage is billed to their OpenRouter account; free models cost nothing.

const VERIFIER = 'oc-or-verifier';
const MARK = 'or-connect'; // our own flag on the callback URL, so a stray ?code= from elsewhere is ignored

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Leave for OpenRouter. The page comes back to the same address with ?or-connect=1&code=…
export async function startOpenRouter(){
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(VERIFIER, verifier); } catch {}
  const back = new URL(location.href);
  back.search = ''; back.hash = ''; back.searchParams.set(MARK, '1');
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(back.toString())}&code_challenge=${challenge}&code_challenge_method=S256`;
}

// Coming back from OpenRouter: skip the welcome screen (it reads oc-welcomed on first render), the editor is the point
if (new URLSearchParams(location.search).has(MARK)) { try { localStorage.setItem('oc-welcomed', '1'); } catch {} }

// On the callback: the code → the person's API key. Returns the key, or null when this page load isn't a callback.
export async function finishOpenRouter(){
  const params = new URLSearchParams(location.search);
  if (!params.has(MARK)) return null;
  const code = params.get('code');
  let verifier = null;
  try { verifier = sessionStorage.getItem(VERIFIER); sessionStorage.removeItem(VERIFIER); } catch {}
  params.delete(MARK); params.delete('code');
  history.replaceState(history.state, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
  if (!code) throw new Error('OpenRouter did not finish the sign-in. Try again.');
  if (!verifier) throw new Error('The sign-in started in another tab or expired. Click "Sign in with OpenRouter" again.');
  const r = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!r.ok) throw new Error(`OpenRouter refused the sign-in (${r.status}). Try again.`);
  const d = await r.json().catch(() => ({}));
  if (!d.key) throw new Error('OpenRouter sent no key back. Try again.');
  return d.key;
}
