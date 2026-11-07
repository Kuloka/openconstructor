import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, parseScene, looseJSON } from '../../ai-parse.js';

test('header + html block → component', () => {
  const r = parseAnswer('{"action":"add","full":true,"name":"Hero"}\n```html\n<style>.a{}</style><div class="a">Hi</div>\n```');
  assert.equal(r.action, 'add'); assert.equal(r.name, 'Hero'); assert.equal(r.full, true);
  assert.match(r.code, /<div class="a">Hi<\/div>/);
});

test('cut-off answer without the closing fence still gives the code', () => {
  const r = parseAnswer('{"action":"update","name":"Card"}\n```html\n<div>half');
  assert.equal(r.action, 'update'); assert.equal(r.code, '<div>half');
});

test('chat reply with code inside is NOT a component', () => {
  const r = parseAnswer('{"action":"reply"}\n## Title\nUse this:\n```html\n<div>example</div>\n```');
  assert.equal(r.action, 'reply'); assert.match(r.reply, /## Title/); assert.equal(r.code, undefined);
});

test('old-style reply in the header only', () => {
  assert.deepEqual(parseAnswer('{"action":"reply","reply":"Hello!"}'), { action: 'reply', reply: 'Hello!' });
});

test('plain text is a reply, bare HTML is a component', () => {
  assert.equal(parseAnswer('Just text, no markup').action, 'reply');
  assert.equal(parseAnswer('<section><h1>x</h1></section>').action, 'add');
});

test('<think> blocks are ignored', () => {
  assert.equal(parseAnswer('<think>{"action":"add"}</think>{"action":"reply"}\nok').reply, 'ok');
});

test('raw line breaks inside JSON strings are tolerated', () => {
  assert.deepEqual(looseJSON('{"a":"line1\nline2"}'), { a: 'line1\nline2' });
});

test('3D scene', () => {
  const r = parseScene('{"action":"scene3d","name":"Cube"}\n```json\n{"objects":[{"shape":"box"}]}\n```');
  assert.equal(r.action, 'scene3d'); assert.equal(r.scene.objects.length, 1);
  assert.equal(parseScene('{"action":"add"}\n```html\n<div></div>\n```'), null);
});
