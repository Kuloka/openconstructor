import { test } from 'node:test';
import assert from 'node:assert/strict';
import { md, MD_RE } from '../../markdown.js';

test('headings, lists, bold, code, links', () => {
  const h = md('## Title\n- one\n- **two**\n\n1. first\n\nUse `x` and [MDN](https://developer.mozilla.org).');
  assert.match(h, /<h4>Title<\/h4>/);
  assert.match(h, /<ul><li>one<\/li><li><b>two<\/b><\/li><\/ul>/);
  assert.match(h, /<ol><li>first<\/li><\/ol>/);
  assert.match(h, /<code>x<\/code>/);
  assert.match(h, /<a href="https:\/\/developer\.mozilla\.org" target="_blank" rel="noopener noreferrer">MDN<\/a>/);
});

test('fenced code keeps its text, escaped, with a copy button', () => {
  const h = md('```js\nconst a = "<b>";\n```', 'copy');
  assert.match(h, /<pre><code>const a = &quot;&lt;b&gt;&quot;;<\/code><\/pre>/);
  assert.match(h, /class="md-copy">copy</);
});

test('model text cannot inject HTML or script links', () => {
  const h = md('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
  assert.ok(!h.includes('<img'));
  assert.ok(!h.includes('href="javascript'));
});

test('MD_RE tells markdown from plain text', () => {
  assert.ok(MD_RE.test('- item'));
  assert.ok(MD_RE.test('a **b** c'));
  assert.ok(!MD_RE.test('Done. The element is on the page.'));
});
