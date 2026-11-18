import test from 'node:test';
import assert from 'node:assert/strict';
import { wireControls, wirePage } from '../../interactive-kit.js';

const PAGE = `<style>.hero button{padding:12px}.btn-primary{background:#c60}button:hover{opacity:.9}.button{x:1}input[type=button]{y:1}</style>
<header><nav><a href="#">Home</a><a href="#">Menu</a><a href="#">Prices</a><a href="https://ig.com/x">Instagram</a><a href="#about">About</a></nav></header>
<section class="hero" id="hero"><h1>Warm coffee</h1><button class="btn-primary">Order now</button><a href="#" class="ghost">Learn more</a><button aria-label="next">→</button></section>
<section id="about"><h2>Our story</h2></section>
<section id="menu"><h2>Menu</h2><a href="javascript:void(0)">Buy beans</a></section>
<section id="plans"><h2>Pricing</h2><button>Choose plan</button></section>
<footer><a href="#">Privacy</a></footer>`;

test('dead links go to the matching section by their text', () => {
  const s = wireControls(PAGE);
  assert.match(s, /<a href="#menu">Menu<\/a>/);
  assert.match(s, /<a href="#plans">Prices<\/a>/);
  assert.match(s, /<a href="#top">Home<\/a>/);
  assert.match(s, /href="https:\/\/ig\.com\/x"/, 'real links stay');
  assert.match(s, /<a href="#about">About<\/a>/, 'working anchors stay');
  assert.match(s, /<a href="#about" class="ghost">Learn more<\/a>/, '"Learn more" goes to the next section');
  assert.doesNotMatch(s, /href="#"|javascript:/);
});

test('action buttons without a form open a real pop-up form; buttons keep their look', () => {
  const s = wireControls(PAGE);
  assert.match(s, /<a href="#oc-f-\d" role="button" class="oc-btn btn-primary">Order now<\/a>/);
  assert.match(s, /<div class="oc-modal" id="oc-f-\d" role="dialog" aria-label="Order now">.*<form method="post">.*name="request" value="Order now".*<button type="submit">Send<\/button><\/form><\/div>/);
  assert.match(s, /<button aria-label="next">→<\/button>/, 'icon-only buttons are left alone');
  assert.match(s, /\.hero :is\(button,a:where\(\.oc-btn\)\)\{/);
  assert.match(s, /:is\(button,a:where\(\.oc-btn\)\):hover\{/);
  assert.match(s, /\.button\{x:1\}input\[type=button\]\{y:1\}/, 'class names and attribute values untouched');
  assert.match(s, /role="button" class="oc-btn">Choose plan<\/a>/);
});

test('actions go to the page form when there is one; buttons inside forms stay', () => {
  const page = `<section id="top-hero"><h1>Hi</h1><button>Book a table</button></section><section id="booking"><h2>Visit</h2><form><input name="n"><button>Send</button></form></section>`;
  const s = wireControls(page);
  assert.match(s, /<a href="#booking" role="button" class="oc-btn">Book a table<\/a>/);
  assert.match(s, /<form><input name="n"><button>Send<\/button><\/form>/);
  assert.doesNotMatch(s, /oc-modal/);
});

test('Russian pages get Russian form labels; idempotent; CSS added once', () => {
  const page = '<!doctype html><html><head><title>x</title></head><body><h1>Кофейня у дома</h1><button>Записаться</button></body></html>';
  const once = wirePage(page), twice = wirePage(once);
  assert.equal(once, twice);
  assert.match(once, /Отправить/);
  assert.match(once, /<style>[^<]*\.oc-modal:target[^<]*<\/style><\/head>/);
  assert.ok(once.startsWith('<!doctype html>'));
  assert.equal(once.split('.oc-modal:target').length, 2);
});

test('pages with scripts (mini-apps) are not touched', () => {
  const page = '<button id="go">Start</button><script>go.onclick=()=>1</script>';
  assert.equal(wirePage(page), page);
});

test('phone numbers and e-mails call and write, wherever the model pointed them', () => {
  const s = wireControls('<section id="order"><h2>Contact</h2><a href="#order">+7 495 120-14-08</a> <a href="#">hello@zerno.coffee</a> <a href="tel:+100">+1 00</a> <a href="#order">Call us</a></section>');
  assert.match(s, /<a href="tel:\+74951201408">\+7 495 120-14-08<\/a>/);
  assert.match(s, /<a href="mailto:hello@zerno\.coffee">hello@zerno\.coffee<\/a>/);
  assert.match(s, /<a href="tel:\+100">/, 'real tel: links stay');
  assert.match(s, /<a href="#order">Call us<\/a>/, 'ordinary working links stay');
});
