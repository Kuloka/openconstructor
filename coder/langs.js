// File extension → language name (shown on edits) and the editor's syntax highlighting.
// Highlighters load only when a file of that language is opened.
const legacy = (mod, name) => async () => {
  const [{ StreamLanguage }, m] = await Promise.all([import('@codemirror/language'), mod()]);
  return StreamLanguage.define(m[name]);
};

const L = {
  js:   ['JavaScript', async () => (await import('@codemirror/lang-javascript')).javascript()],
  jsx:  ['JavaScript (JSX)', async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true })],
  ts:   ['TypeScript', async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true })],
  tsx:  ['TypeScript (TSX)', async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true })],
  html: ['HTML', async () => (await import('@codemirror/lang-html')).html()],
  vue:  ['Vue', async () => (await import('@codemirror/lang-html')).html()],
  svelte: ['Svelte', async () => (await import('@codemirror/lang-html')).html()],
  css:  ['CSS', async () => (await import('@codemirror/lang-css')).css()],
  scss: ['SCSS', async () => (await import('@codemirror/lang-css')).css()],
  json: ['JSON', async () => (await import('@codemirror/lang-json')).json()],
  md:   ['Markdown', async () => (await import('@codemirror/lang-markdown')).markdown()],
  py:   ['Python', async () => (await import('@codemirror/lang-python')).python()],
  rs:   ['Rust', async () => (await import('@codemirror/lang-rust')).rust()],
  c:    ['C', async () => (await import('@codemirror/lang-cpp')).cpp()],
  h:    ['C header', async () => (await import('@codemirror/lang-cpp')).cpp()],
  cpp:  ['C++', async () => (await import('@codemirror/lang-cpp')).cpp()],
  hpp:  ['C++ header', async () => (await import('@codemirror/lang-cpp')).cpp()],
  java: ['Java', async () => (await import('@codemirror/lang-java')).java()],
  php:  ['PHP', async () => (await import('@codemirror/lang-php')).php()],
  sql:  ['SQL', async () => (await import('@codemirror/lang-sql')).sql()],
  xml:  ['XML', async () => (await import('@codemirror/lang-xml')).xml()],
  svg:  ['SVG', async () => (await import('@codemirror/lang-xml')).xml()],
  rbxmx: ['Roblox model (XML)', async () => (await import('@codemirror/lang-xml')).xml()],
  lua:  ['Lua', legacy(() => import('@codemirror/legacy-modes/mode/lua'), 'lua')],
  luau: ['Luau', legacy(() => import('@codemirror/legacy-modes/mode/lua'), 'lua')],
  go:   ['Go', legacy(() => import('@codemirror/legacy-modes/mode/go'), 'go')],
  rb:   ['Ruby', legacy(() => import('@codemirror/legacy-modes/mode/ruby'), 'ruby')],
  sh:   ['Shell', legacy(() => import('@codemirror/legacy-modes/mode/shell'), 'shell')],
  bash: ['Shell', legacy(() => import('@codemirror/legacy-modes/mode/shell'), 'shell')],
  ps1:  ['PowerShell', legacy(() => import('@codemirror/legacy-modes/mode/powershell'), 'powerShell')],
  yml:  ['YAML', legacy(() => import('@codemirror/legacy-modes/mode/yaml'), 'yaml')],
  yaml: ['YAML', legacy(() => import('@codemirror/legacy-modes/mode/yaml'), 'yaml')],
  toml: ['TOML', legacy(() => import('@codemirror/legacy-modes/mode/toml'), 'toml')],
  swift: ['Swift', legacy(() => import('@codemirror/legacy-modes/mode/swift'), 'swift')],
  kt:   ['Kotlin', legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'kotlin')],
  cs:   ['C#', legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'csharp')],
  dart: ['Dart', legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'dart')],
  gd:   ['GDScript', legacy(() => import('@codemirror/legacy-modes/mode/python'), 'python')],
  dockerfile: ['Dockerfile', legacy(() => import('@codemirror/legacy-modes/mode/dockerfile'), 'dockerFile')],
};
const NAMES = { dockerfile: 'dockerfile', makefile: null, '.env': null, '.gitignore': null };

const extOf = path => {
  const base = path.split('/').pop().toLowerCase();
  if (base in NAMES) return NAMES[base];
  const m = base.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : null;
};

/** "TypeScript", "Lua"… or "Text" */
export const langName = path => L[extOf(path)]?.[0] || (path.toLowerCase().endsWith('.txt') ? 'Text' : extOf(path) ? extOf(path).toUpperCase() : 'Text');
/** The editor extension for this file, or null for plain text. */
export async function langExtension(path){
  const l = L[extOf(path)];
  try { return l ? await l[1]() : null; } catch { return null; }
}
/** Short label for the fence in prompts: ```ts */
export const fenceLang = path => extOf(path) || '';
