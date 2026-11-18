import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// logos are inlined into the page: a <style> inside one restyles the whole app (it once filled every icon), scripts must never get in
test('provider logos carry no global styles, scripts or event handlers', () => {
  const dir = new URL('../../src/logos/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const s = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(s, /<style|<script|<foreignObject|\son[a-z]+=/i, f);
  }
});

test('every provider has a logo file', async () => {
  const { PROVIDERS } = await import('../../providers.js');
  const have = new Set(readdirSync(new URL('../../src/logos/', import.meta.url)).map(f => f.replace('.svg', '')));
  const missing = PROVIDERS.filter(p => p.id !== 'oc' && !have.has(p.logo)).map(p => p.id);
  assert.deepEqual(missing, []);
});
