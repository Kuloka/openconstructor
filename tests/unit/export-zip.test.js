import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zip, extractImages, staticSite, reactApp } from '../../export-zip.js';
import { toReact } from '../../exporters.js';

// Reads the central directory of a stored zip: [{ name, data }]
async function unzip(blob){
  const b = new Uint8Array(await blob.arrayBuffer()), v = new DataView(b.buffer), dec = new TextDecoder();
  let end = b.length - 22; while (v.getUint32(end, true) !== 0x06054b50) end--;
  const count = v.getUint16(end + 10, true); let at = v.getUint32(end + 16, true); const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const size = v.getUint32(at + 20, true), nl = v.getUint16(at + 28, true), off = v.getUint32(at + 42, true);
    const name = dec.decode(b.subarray(at + 46, at + 46 + nl));
    const local = off + 30 + v.getUint16(off + 26, true);
    out.push({ name, data: b.subarray(local, local + size) });
    at += 46 + nl;
  }
  return out;
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('zip round-trips names and contents', async () => {
  const files = await unzip(zip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.txt', data: 'мир' }]));
  assert.deepEqual(files.map(f => f.name), ['a.txt', 'dir/b.txt']);
  assert.equal(new TextDecoder().decode(files[1].data), 'мир');
});

test('embedded pictures become files, the same picture once', () => {
  const files = [];
  const out = extractImages(`<img src="${PNG}"><div style="background:url(${PNG})">`, 'assets', files);
  assert.equal(files.length, 1); assert.equal(files[0].name, 'assets/img-1.png');
  assert.equal(out, '<img src="assets/img-1.png"><div style="background:url(assets/img-1.png)">');
});

test('static site and React app have the expected files', async () => {
  const site = await unzip(staticSite({ html: `<img src="${PNG}">`, title: 'My Site' }).blob);
  assert.deepEqual(site.map(f => f.name).sort(), ['README.md', 'assets/img-1.png', 'index.html']);
  const items = [{ id: 'a', name: 'Hero', x: 0, y: 0, full: true, code: `<img src="${PNG}">` }];
  const app = await unzip(reactApp({ items, page: { w: 1440, h: 900, bg: '#fff' }, title: 'My Site', reactSource: toReact }).blob);
  const names = app.map(f => f.name);
  for (const n of ['package.json', 'vite.config.js', 'index.html', 'src/main.jsx', 'src/App.jsx', 'public/assets/img-1.png']) assert.ok(names.includes(n), n);
  const appJsx = new TextDecoder().decode(app.find(f => f.name === 'src/App.jsx').data);
  assert.ok(appJsx.includes('/assets/img-1.png') && !appJsx.includes('base64'));
});
