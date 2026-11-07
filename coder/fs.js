// The project folder. Chrome and Edge can read and write a folder on the user's disk (File System
// Access API) after one permission prompt. Other browsers get a read-only copy picked with
// <input webkitdirectory>; changes stay in memory and download as a .zip.

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.cache', 'coverage', '.venv', 'venv', '__pycache__', 'target', '.idea', '.turbo', '.parcel-cache', '.wrangler', 'vendor', 'Library', 'obj', 'bin']);
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|pdf|zip|gz|tgz|rar|7z|woff2?|ttf|otf|eot|mp[34]|wav|ogg|webm|mov|avi|exe|dll|so|dylib|bin|class|jar|wasm|pyc|o|a|lib|sqlite|db|rbxl|rbxm|blend|fbx|glb|gltf)$/i;
const MAX_FILES = 4000, MAX_TEXT = 400_000;

export const canWriteFolders = () => typeof window.showDirectoryPicker === 'function';

/** project: { name, root, writable, files: Map(path → entry) }
 *  entry:   { path, size, handle?, file?, base?, text?, binary } — `base` is what's on disk, `text` the working copy */
export function emptyProject(){ return { name: '', root: null, writable: false, files: new Map() }; }

async function walk(dir, prefix, files){
  for await (const [name, h] of dir.entries()) {
    if (files.size >= MAX_FILES) return;
    const path = prefix + name;
    if (h.kind === 'directory') { if (!SKIP_DIRS.has(name) && !name.startsWith('.git')) await walk(h, path + '/', files); continue; }
    let size = 0; try { size = (await h.getFile()).size; } catch {}
    files.set(path, { path, size, handle: h, binary: BINARY.test(name) || size > MAX_TEXT });
  }
}

/** Asks for a folder with read/write access (Chrome, Edge). */
export async function pickFolder(){
  const root = await window.showDirectoryPicker({ id: 'oc-code', mode: 'readwrite' });
  return loadFolder(root);
}
export async function loadFolder(root){
  const files = new Map();
  await walk(root, '', files);
  await saveRecent(root);
  return { name: root.name, root, writable: true, files };
}

/** Read-only fallback: the files from <input type=file webkitdirectory>. */
export function fromFileList(list){
  const files = new Map(); let name = 'project';
  for (const f of list) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    name = parts.length > 1 ? parts[0] : name;
    const rel = parts.length > 1 ? parts.slice(1) : parts;
    if (rel.slice(0, -1).some(p => SKIP_DIRS.has(p))) continue;
    if (files.size >= MAX_FILES) break;
    const path = rel.join('/');
    files.set(path, { path, size: f.size, file: f, binary: BINARY.test(f.name) || f.size > MAX_TEXT });
  }
  return { name, root: null, writable: false, files };
}

/** The working copy of a text file (loaded on first use). */
export async function readText(project, path){
  const e = project.files.get(path);
  if (!e) throw Error(`no such file: ${path}`);
  if (e.binary) throw Error(`${path} is binary or larger than 400 KB`);
  if (e.text == null) {
    const file = e.file || await e.handle.getFile();
    e.base = await file.text();
    e.text = e.base;
  }
  return e.text;
}

async function fileHandle(project, path, create){
  const parts = path.split('/'); let dir = project.root;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create });
  return dir.getFileHandle(parts.at(-1), { create });
}

/** Writes the working copy of `path` to disk (or just marks it saved in read-only mode). */
export async function writeToDisk(project, path){
  const e = project.files.get(path);
  if (!e) throw Error(`no such file: ${path}`);
  if (project.writable) {
    if (!e.handle) e.handle = await fileHandle(project, path, true);
    const w = await e.handle.createWritable();
    await w.write(e.text ?? ''); await w.close();
    e.base = e.text;
  }
  // read-only copy: `base` stays the original, so the file still goes into the .zip
  e.size = new Blob([e.text ?? '']).size;
}

/** A file that doesn't exist yet: lives in memory until written. */
export function addFile(project, path, text = ''){
  const e = { path, size: text.length, text, base: null, binary: false };
  project.files.set(path, e);
  return e;
}

/** Files whose working copy differs from disk. */
export const changedFiles = project => [...project.files.values()].filter(e => e.text != null && e.text !== e.base);

/** Read-only mode: download every changed file as a .zip that keeps the folder structure. */
export async function downloadChanges(project){
  const { zipSync, strToU8 } = await import('fflate');
  const out = {};
  for (const e of [...project.files.values()].filter(x => x.text != null && (x.text !== x.base || x.base === null))) out[e.path] = strToU8(e.text);
  const blob = new Blob([zipSync(out)], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${project.name || 'project'}-changes.zip` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ── The last folder, to reopen with one click (Chrome keeps the handle, asks again for access) ── */
function idb(){
  return new Promise(resolve => {
    try { const r = indexedDB.open('oc-code', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); } catch { resolve(null); }
  });
}
async function saveRecent(root){
  const d = await idb(); if (!d) return;
  d.transaction('kv', 'readwrite').objectStore('kv').put(root, 'recent');
}
export async function recentFolder(){
  const d = await idb(); if (!d) return null;
  return new Promise(resolve => { const g = d.transaction('kv').objectStore('kv').get('recent'); g.onsuccess = () => resolve(g.result || null); g.onerror = () => resolve(null); });
}
/** Asks the browser to allow access to the remembered folder again (needs a click). */
export async function reopen(root){
  const mode = { mode: 'readwrite' };
  if ((await root.queryPermission(mode)) !== 'granted' && (await root.requestPermission(mode)) !== 'granted') throw Error('access to the folder was not allowed');
  return loadFolder(root);
}
