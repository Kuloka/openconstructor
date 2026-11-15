// Part-by-part page edits (page-patch.js): splitting a page into blocks and applying the model's changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { topNodes, splitPage, numbered, parseOps, applyPatch } from '../../page-patch.js';

const PAGE = `<style>.pg{color:#fff}</style><div class="pg"><style>.s1{padding:20px 0}</style><header class="s1"><div class="wrap"><a href="#">AI</a><img src="x.png" alt=""></div></header>
<section class="s2 sec"><div class="wrap"><h1>Hero</h1><svg viewBox="0 0 2 2"><path d="M0 0L2 2"></path><circle r="1"/></svg></div></section>
<style>.s3 b{color:red}</style><section class="s3 sec"><p>Models <b>&gt; 3</b></p></section>
<footer class="s4"><p>© 2026</p></footer></div>`;

test('topNodes: balanced top level, svg children, styles, unbalanced → null', () => {
  assert.deepEqual(topNodes('<style>a>b{}</style><div><br><img src="a"></div><p>x</p>').map(n => n.tag), ['style', 'div', 'p']);
  assert.equal(topNodes('<section><div>cut'), null);
  assert.equal(topNodes('</div>'), null);
});

test('splitPage: goes inside the wrapper, keeps each block with its style', () => {
  const sp = splitPage(PAGE);
  assert.equal(sp.parts.length, 4);
  assert.match(sp.head, /^<style>\.pg[\s\S]*<div class="pg">$/);
  assert.equal(sp.tail, '</div>');
  assert.match(sp.parts[0], /^<style>\.s1[\s\S]*<\/header>$/);
  assert.match(sp.parts[2], /^<style>\.s3[\s\S]*<\/section>$/);
  assert.equal(splitPage('<div class="card"><p>a</p></div>'), null); // not a page
  assert.match(numbered(sp), /<!-- part 3 -->\n<style>\.s3/);
});

test('applyPatch: replace, insert after, insert at the top, remove, css', () => {
  const sp = splitPage(PAGE);
  const r = applyPatch(sp, `<!-- replace 2 -->
<section class="s2 sec"><h1>New hero</h1></section>
<!-- after 3 -->
<style>.ch{height:4px}</style><section class="ch sec"><p>Charts</p></section>
<!-- remove 4 -->
<!-- css -->
<style>.pg{--accent:#0ff}</style>`);
  assert.equal(r.applied, 4);
  assert.match(r.code, /New hero/);
  assert.doesNotMatch(r.code, /<h1>Hero<\/h1>/);
  assert.doesNotMatch(r.code, /© 2026/);
  assert.ok(r.code.indexOf('Models') < r.code.indexOf('Charts'));
  assert.match(r.code, /<div class="pg">\n<style>\.pg\{--accent:#0ff\}/);
  assert.ok(r.code.endsWith('</div>'));
  assert.equal(splitPage(r.code).parts.length, 4);
  const top = applyPatch(sp, '<!-- after 0 --><div class="banner">Sale</div>');
  assert.ok(top.code.indexOf('Sale') < top.code.indexOf('<header'));
});

test('applyPatch: a cut-off last block is dropped, a useless answer gives null', () => {
  const sp = splitPage(PAGE);
  const r = applyPatch(sp, '<!-- replace 1 --><header class="s1"><b>Brand</b></header>\n<!-- after 2 --><section class="x"><div>cut off');
  assert.equal(r.applied, 1);
  assert.doesNotMatch(r.code, /cut off/);
  assert.equal(applyPatch(sp, '<!-- replace 9 --><section>x</section>'), null);
  assert.equal(applyPatch(sp, 'no markers'), null);
  assert.deepEqual(parseOps('<!-- Replace part 2 --><p>a</p>').map(o => [o.op, o.n]), [['replace', 2]]);
});
