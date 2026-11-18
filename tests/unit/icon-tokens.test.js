// icon: and logo: pictures → inline SVG (icon-tokens.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIcons, lucideName, brandSlug } from '../../icon-tokens.js';

const nodes = { rocket: [['path', { d: 'M1 1' }]], 'chart-line': [['path', { d: 'M2 2' }]], 'circle-check': [['circle', { r: '9' }]], circle: [['circle', { r: '10' }]] };

test('lucideName: exact, aliases, flipped words, fallback', () => {
  assert.equal(lucideName(nodes, 'rocket'), 'rocket');
  assert.equal(lucideName(nodes, 'line-chart'), 'chart-line');
  assert.equal(lucideName(nodes, 'check_circle'), 'circle-check');
  assert.equal(lucideName(nodes, 'fa-rocket'), 'rocket');
  assert.equal(lucideName(nodes, 'no-such-thing'), 'circle');
  assert.equal(brandSlug('Google Cloud'), 'googlecloud'); assert.equal(brandSlug('dot.net'), 'dotdotnet');
});

test('resolveIcons: icons, own vendor logos, Simple Icons, monogram; attributes kept', async () => {
  const fetchFn = async url => /stripe\.svg$/.test(url) ? { ok: true, text: async () => '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Stripe</title><path d="M9 9"/></svg>' } : { ok: false, text: async () => '' };
  const html = '<span><img src="icon:rocket" width="20" class="ic" alt=""><img src="logo:OpenAI" alt="OpenAI"><img src="logo:stripe" alt="Stripe"><img src=\'logo:Nobody Corp\' alt="x"></span>';
  const out = await resolveIcons(html, { lucide: async () => nodes, vendor: n => /openai/i.test(n) ? '<svg viewBox="0 0 24 24"><path fill="#10a37f" d="M0 0"/></svg>' : '', fetchFn });
  assert.doesNotMatch(out, /icon:|logo:/);
  assert.match(out, /<svg[^>]*stroke="currentColor"[^>]*width="20" height="20" class="ic"[^>]*><path d="M1 1"\/><\/svg>/);
  assert.match(out, /#10a37f/, 'our colour vendor logo');
  assert.match(out, /fill="currentColor"[^>]*aria-label="Stripe"><path d="M9 9"/, 'Simple Icons logo, monochrome');
  assert.doesNotMatch(out, /<title>/);
  assert.match(out, />NC<\/text>/, 'unknown brand → monogram');
});
