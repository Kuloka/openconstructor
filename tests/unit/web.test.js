// The AI's web access (worker.js /api/web): search results, page text, private addresses refused
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => true } };
const ddg = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvite.dev%2Fblog%2Fannouncing-vite6&amp;rut=x">Vite 6.0 is <b>out</b>!</a>
<a class="result__snippet" href="#">Vite 6 was released on <b>Nov 26</b>.</a>`;
const page = '<html><head><title>Announcing Vite 6</title><script>bad()</script></head><body><nav>menu</nav><h1>Vite 6.0 is out!</h1><p>Released &amp; ready.</p></body></html>';
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://html.duckduckgo.com')) return new Response(ddg, { status: 200 });
  if (u.startsWith('https://vite.dev')) return new Response(page, { status: 200, headers: { 'Content-Type': 'text/html' } });
  return new Response('nope', { status: 404 });
};
const { default: worker } = await import('../../worker.js');
let n = 0;
const call = path => worker.fetch(new Request('https://openconstructor.pw' + path, { headers: { 'cf-connecting-ip': 'ip' + n++ } }), {}, { waitUntil() {} });

test('search returns titles, real links (not the DuckDuckGo redirect) and the text of the top page', async () => {
  const j = await (await call('/api/web?q=vite%206')).json();
  assert.equal(j.results[0].title, 'Vite 6.0 is out!');
  assert.equal(j.results[0].url, 'https://vite.dev/blog/announcing-vite6');
  assert.match(j.results[0].snippet, /Nov 26/);
  assert.equal(j.pages[0].title, 'Announcing Vite 6');
  assert.match(j.pages[0].text, /Released & ready/);
  assert.doesNotMatch(j.pages[0].text, /bad\(\)|menu/);
});

test('private and local addresses are refused', async () => {
  for (const u of ['http://127.0.0.1/', 'http://localhost:8787/', 'http://192.168.1.1/', 'file:///etc/passwd'])
    assert.equal((await call('/api/web?url=' + encodeURIComponent(u))).status, 400, u);
});
