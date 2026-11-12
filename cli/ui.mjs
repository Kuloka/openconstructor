// How openconstructor code looks in the terminal. It follows the website (studio.css / code.css / chat-ui.js):
// near-black panels with #262626 lines, one coral accent (#ff5a36), uppercase panel labels, the folded-C
// logo, the tiny folded C + retyped mood words + step checklist while the AI works, the change list
// "● index.html HTML +32 −0" with the language bar, and the status bar with the green "ready" dot.
// Plain ANSI escapes, 24-bit colour, half-block characters (two pixels per character cell).

import readlineMod from 'node:readline';

const tty = !!process.stdout.isTTY;
// FORCE_COLOR wins over NO_COLOR (some editors set NO_COLOR for every terminal they open)
export const color = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : tty && !process.env.NO_COLOR;
export const animate = tty && !process.env.OC_NO_ANIM && !process.env.CI;
const w = s => process.stdout.write(s);
const BSL = String.fromCharCode(92); // a backslash: "\" + Enter starts a new line in the input
const ESC = '\x1b[';

/* ── The site's tokens (studio.css :root, code.css) ── */
const T = {
  panel: [17, 17, 17], panel2: [23, 23, 23], border: [38, 38, 38], border2: [54, 54, 54],
  text: [242, 242, 242], text2: [196, 196, 196], muted: [142, 142, 142], subtle: [94, 94, 94],
  accent: [255, 90, 54], accentLight: [255, 122, 92], accentDeep: [196, 61, 31], accentDim: [48, 20, 14],
  ok: [110, 231, 183], err: [248, 113, 113], errSoft: [255, 180, 174], add: [63, 185, 80], del: [248, 81, 73],
  html: [227, 76, 38], css: [126, 87, 194], js: [241, 224, 90],
};
const fg = rgb => s => color ? `${ESC}38;2;${rgb.join(';')}m${s}${ESC}39m` : String(s);
const bg = rgb => s => color ? `${ESC}48;2;${rgb.join(';')}m${s}${ESC}49m` : String(s);
export const c = {
  acc: fg(T.accent), light: fg(T.accentLight), deep: fg(T.accentDeep),
  text: fg(T.text), text2: fg(T.text2), muted: fg(T.muted), grey: fg(T.subtle), line: fg(T.border2),
  green: fg(T.add), red: fg(T.del), ok: fg(T.ok), err: fg(T.err), yellow: fg(T.accent), blue: fg(T.text2),
  bold: s => color ? `${ESC}1m${s}${ESC}22m` : String(s),
  link: s => color ? `${ESC}4m${fg(T.text2)(s)}${ESC}24m` : String(s),
};
export const FILE_COLORS = { css: fg(T.css), html: fg(T.html), js: fg(T.js) };
const LANG = { html: 'HTML', css: 'CSS', js: 'JavaScript' };

/* ── Text helpers that ignore colour codes ── */
const strip = s => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const len = s => [...strip(s)].length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - len(s)));
function cut(s, n){
  if (len(s) <= n) return s;
  let out = '', vis = 0;
  for (const part of String(s).split(/(\x1b\[[0-9;?]*[A-Za-z])/)) {
    if (part.startsWith('\x1b')) { out += part; continue; }
    for (const ch of part) { if (vis >= n - 1) return out + '…' + (color ? `${ESC}0m` : ''); out += ch; vis++; }
  }
  return out;
}
function wrap(text, n){
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (len(line) + len(word) + (line ? 1 : 0) > n) { if (line) lines.push(line); line = word.length > n ? word.slice(0, n - 1) + '…' : word; }
      else line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  return lines;
}
export const cols = () => Math.max(40, Math.min(process.stdout.columns || 80, 96));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hide = () => tty && w(`${ESC}?25l`), show = () => tty && w(`${ESC}?25h`);
process.on('exit', show);

/* ── Pixels: two per character cell (▀ = top pixel as the text colour, bottom pixel as the background) ── */
export function pixelLines(grid){
  const lines = [];
  for (let r = 0; r < grid.length; r += 2) {
    let line = '';
    for (let q = 0; q < grid[r].length; q++) {
      const a = grid[r][q], b = grid[r + 1]?.[q];
      if (!color) { line += a || b ? '#' : ' '; continue; }
      if (a && b) line += `${ESC}38;2;${a.join(';')}m${ESC}48;2;${b.join(';')}m▀${ESC}0m`;
      else if (a) line += `${ESC}38;2;${a.join(';')}m▀${ESC}0m`;
      else if (b) line += `${ESC}38;2;${b.join(';')}m▄${ESC}0m`;
      else line += ' ';
    }
    lines.push(line);
  }
  return lines;
}

/* ── The logo, as in src/logo.svg: the folded C, white planes, dimmer folds, the coral square in the middle ── */
const LOGO = [
  '.....WWWWWWWWWWWW.',
  '....FFWWWWWWWWWW..',
  '...FFFWWWWWWWWW...',
  '..FFFFWWWWWWWW....',
  '.FFFFFWWWWWWW.....',
  '.FFFFFWWWWWW......',
  'CCCCCC............',
  'CCCCCC............',
  'CCCCCC............',
  'CCCCCC............',
  'CCCCCC............',
  'CCCCCC............',
  '.FFFFFWWWWWW......',
  '.FFFFFWWWWWWW.....',
  '..FFFFWWWWWWWW....',
  '...FFFWWWWWWWWW...',
  '....FFWWWWWWWWWW..',
  '.....WWWWWWWWWWWW.',
];
const FACE = { W: T.text, F: [176, 176, 176], C: T.accent };
export const cubePixels = () => LOGO.map(row => [...row].map(ch => FACE[ch] || null));

/* ── A tiny folded C for the "thinking" header (chat-ui.js LOGO_THINK): planes fold in one by one, then glow ── */
const SPARK = (() => {
  const MINI = ['.WWWW', 'FW...', 'C....', 'C....', 'FW...', '.WWWW'];
  // which plane each pixel belongs to: 0 top bar, 1 upper fold, 2 square, 3 lower fold, 4 bottom bar
  const plane = (r, q) => r === 0 || (r === 1 && q === 1) ? 0 : r === 1 ? 1 : r < 4 ? 2 : r === 4 && q === 0 ? 3 : 4;
  const frame = (upto, lit) => pixelLines(MINI.map((row, r) => [...row].map((ch, q) => {
    if (ch === '.' || plane(r, q) > upto) return null;
    if (ch === 'C') return T.accent;
    return ch === 'F' ? (lit ? [210, 210, 210] : [150, 150, 150]) : (lit ? [255, 255, 255] : T.text2);
  })));
  return [frame(0), frame(1), frame(2), frame(3), frame(4), frame(4, 1)];
})();
const MOODS = ['thinking', 'vibing', 'coding', 'sketching', 'tinkering', 'composing', 'assembling', 'brewing', 'crafting', 'polishing'];

/* ── Panels: square corners and #262626 lines, the label in uppercase like "AI ASSISTANT" ── */
function panel(label, body, { tone = fg(T.border), right = '', width = cols() - 2 } = {}){
  const inner = width - 4;
  const head = label ? `${tone('┌─')} ${label} ` : tone('┌─');
  const tail = right ? ` ${right} ${tone('─┐')}` : tone('─┐');
  const lines = [head + tone('─'.repeat(Math.max(1, width - len(head) - len(tail)))) + tail];
  for (const l of body) lines.push(`${tone('│')} ${pad(cut(l, inner), inner)} ${tone('│')}`);
  lines.push(tone('└' + '─'.repeat(width - 2) + '┘'));
  return lines.map(l => ' ' + l);
}
// the "code" badge from the code workspace header: accent text on a dim accent background
const badge = s => color ? bg(T.accentDim)(fg(T.accent)(c.bold(` ${s} `))) : `[${s}]`;
// an idea chip: "1  Snake game" with the number in the accent
const chip = s => {
  const [, num = '', text = s] = s.match(/^(\d+\s+)?(.*)$/) || [];
  return color ? bg(T.panel2)(' ' + c.acc(c.bold(num)) + fg(T.text2)(text) + ' ') : `[ ${s} ]`;
};

/* ── Start: the C folds in, then the header and the status line ── */
export async function intro({ version, info }){
  const width = cols() - 2, withCube = width >= 66;
  const full = cubePixels();
  const status = info.map(([k, v]) => `${c.grey(k)} ${v}`).join(c.grey('   '));
  const text = [
    '', '',
    `${c.muted('open')}${c.bold(c.text('constructor'))} ${badge('code')}  ${c.grey('v' + version)}`,
    '',
    c.text2('Describe an app in plain words: the AI writes'),
    c.text2('the interface and the logic, and it runs in your'),
    c.text2('browser. Errors go straight back to the AI.'),
    '', '',
  ];
  const render = (grid, shown) => {
    const cube = withCube ? pixelLines(grid) : [];
    const rows = withCube ? Math.max(cube.length, text.length) : 5;
    const out = [];
    for (let i = 0; i < rows; i++) {
      const left = withCube ? '  ' + pad(cube[i] || '', 18) + '    ' : '  ';
      const t = withCube ? text[i] : text[i + 2];
      out.push(left + (i < shown ? t || '' : ''));
    }
    out.push('');
    out.push('  ' + (shown >= text.length ? `${c.ok('●')} ${c.muted('ready')}${c.grey('   ')}${status}` : ''));
    return out.map(l => cut(l, cols() - 1));
  };
  if (!animate) { console.log('\n' + render(full, text.length).join('\n')); return; }
  hide(); w('\n');
  let height = 0;
  const paint = lines => { if (height) w(`${ESC}${height}A\r`); w(lines.map(l => `${ESC}2K${l}`).join('\n') + '\n'); height = lines.length; };
  // the C folds in from top to bottom, each new pixel lit for a frame
  const order = [];
  full.forEach((row, r) => row.forEach((p, q) => { if (p) order.push([r, q, r * 7 + (LOGO[r][q] === 'F' ? 0 : LOGO[r][q] === 'C' ? 30 : 10) + Math.random() * 10]); }));
  order.sort((a, b) => a[2] - b[2]);
  const grid = full.map(row => row.map(() => null));
  const FRAMES = 14, per = Math.ceil(order.length / FRAMES);
  for (let f = 0; f <= FRAMES; f++) {
    for (const [r, q] of order.slice((f - 1) * per, f * per)) if (f > 0) grid[r][q] = full[r][q];
    for (const [r, q] of order.slice(f * per, (f + 1) * per)) grid[r][q] = [255, 255, 255];
    paint(render(grid, 0));
    await sleep(32);
  }
  for (const [r, q] of order) grid[r][q] = full[r][q];
  for (let s = 1; s <= text.length; s++) { paint(render(grid, s)); await sleep(40); }
  show();
}

/* ── Empty state, as in the code workspace: >_ with a blinking cursor, the question and idea chips ── */
export function emptyState(ideas){
  console.log('');
  console.log(`  ${c.acc(c.bold('>'))}${c.acc('_')}  ${c.bold(c.text('What app should we build?'))}`);
  console.log(`     ${c.muted('Type it below, or start from one of these:')}`);
  let line = '     ';
  const max = cols() - 4;
  for (const x of ideas) {
    const ch = chip(x);
    if (len(line) + len(ch) + 1 > max) { console.log(line); line = '     '; }
    line += ch + ' ';
  }
  console.log(line);
}

/* ── While the AI works: the chat's thinking panel. Spark + mood word typed out + time, then a step
   checklist (● done with its time, ○ running), then a small window with the code as it streams in ── */
const PLAN = [[0, 'reading your request'], [700, 'thinking it through'], [3500, 'planning the layout'], [8000, 'choosing colors and type']];
export function builder(mode){
  const t0 = Date.now();
  let state = { text: '', thinking: true }, tick = 0, height = 0, timer = null;
  let mood = mode === 'fixing' ? 'fixing' : MOODS[0], typed = 0, moodAt = t0, moodI = 0, planI = 0;
  const steps = [];
  const stepTo = labelText => {
    if (steps.at(-1)?.label === labelText) return;
    const now = Date.now(); const prev = steps.at(-1); if (prev && !prev.took) prev.took = (now - prev.at) / 1000;
    steps.push({ label: labelText, at: now });
  };
  if (mode === 'fixing') stepTo('reading the error'); else stepTo(PLAN[0][1]);
  const lines = () => {
    const now = Date.now(), s = ((now - t0) / 1000).toFixed(0) + 's';
    // mood words retype every 2.2s, like the chat header
    if (mode !== 'fixing' && now - moodAt > 2200) { moodAt = now; moodI = (moodI + 1) % MOODS.length; mood = MOODS[moodI]; typed = 0; }
    typed = Math.min(mood.length, typed + 1);
    const m = meter(state.text);
    // the planned steps only move forward, one at a time
    if (!m && mode !== 'fixing') while (planI + 1 < PLAN.length && now - t0 >= PLAN[planI + 1][0]) stepTo(PLAN[++planI][1]);
    if (m) stepTo(`writing ${{ css: 'style.css', html: 'index.html', js: 'app.js' }[m.now]}`);
    const spark = SPARK[(f => f < SPARK.length ? f : SPARK.length * 2 - 2 - f)(Math.floor(tick / 6) % (SPARK.length * 2 - 2))];
    const name = state.text.match(/"name"\s*:\s*"([^"]{1,60})"/)?.[1];
    const head = `${c.acc(c.bold(mood.slice(0, typed)))}${typed < mood.length || tick % 10 < 5 ? c.acc('▍') : ' '}${name ? c.text2('  ' + name) : ''}`;
    const out = [
      `  ${spark[0]}`,
      `  ${spark[1]}  ${head}${' '.repeat(Math.max(1, cols() - 12 - len(head) - s.length))}${c.grey(s)}`,
      `  ${spark[2]}`,
    ];
    for (const st of steps.slice(-5)) {
      const done = !!st.took, cur = st === steps.at(-1);
      const count = cur && m && /^writing /.test(st.label) ? c.grey(`  ${m[m.now]} lines`) : '';
      out.push(`      ${done ? c.acc('●') : tick % 8 < 4 ? c.acc('○') : c.grey('○')} ${done ? c.grey(st.label) : c.text2(st.label)}${count}${done ? c.grey(`  ${st.took.toFixed(1)}s`) : ''}`);
    }
    // the last lines of code, as they arrive
    if (m) {
      const code = state.text.split(/```(?:html)?[^\n]*\n/)[1] || '';
      const tail = code.split('\n').filter(l => l.trim()).slice(-3);
      for (const l of tail) out.push(`        ${c.line('│')} ${c.grey(l.trim())}`);
    }
    return out;
  };
  const draw = () => {
    if (!animate) return;
    tick++;
    const n = cols() - 1, out = lines().map(l => cut(l, n));
    // back to the first line of the last frame, redraw, and wipe whatever the last frame had below
    w((height > 1 ? `${ESC}${height - 1}A` : '') + '\r' + out.map(l => `${ESC}2K${l}`).join('\n') + `${ESC}0J`);
    height = out.length;
  };
  const clear = () => { if (!height) return; w((height > 1 ? `${ESC}${height - 1}A` : '') + `\r${ESC}0J`); height = 0; };
  if (animate) { hide(); timer = setInterval(draw, 70); draw(); } else console.log(`  ${c.acc('●')} ${c.muted(mode === 'fixing' ? 'fixing…' : 'thinking…')}`);
  return {
    update(text, thinking){ state = { text, thinking }; },
    log(line){ clear(); console.log(line); if (animate) draw(); },
    // folds into one line, like "thought for 7s" in the chat
    stop({ folded = true } = {}){
      clearInterval(timer); clear(); show();
      const sec = (Date.now() - t0) / 1000;
      if (folded) console.log(`  ${c.acc('■')} ${c.muted(`${mode === 'fixing' ? 'fixed' : 'thought'} for ${sec.toFixed(0)}s`)}`);
      return sec;
    },
  };
}
// How many lines of each file the streaming answer holds so far
export function meter(text){
  const code = text.split(/```(?:html)?[^\n]*\n/)[1]; if (code == null) return null;
  const n = s => s ? s.split('\n').length : 0;
  const st = code.match(/<style[^>]*>([\s\S]*?)(<\/style>|$)/i), sc = code.match(/<script[^>]*>([\s\S]*?)(<\/script>|$)/i);
  const body = code.replace(/<style[^>]*>[\s\S]*?(<\/style>|$)/i, '').replace(/<script[^>]*>[\s\S]*$/i, '');
  return { css: n(st?.[1]?.trim()), html: st && /<\/style>/i.test(code) ? n(body.trim()) : 0, js: n(sc?.[1]?.trim()), now: sc ? 'js' : st && /<\/style>/i.test(code) ? 'html' : 'css' };
}

/* ── After a change: the reply, then the file list from the code workspace and its language bar ── */
export function resultCard({ name, reply, files, seconds, foot }){
  const width = cols() - 2, inner = width - 4;
  const order = ['html', 'css', 'js'].map(id => files.find(f => f.id === id)).filter(Boolean);
  const total = order.reduce((n, f) => n + f.lines, 0) || 1;
  const body = [...wrap(reply, inner).map(l => c.text(l)), ''];
  for (const f of order) {
    const diff = f.add || f.del ? `${c.green('+' + f.add)}${c.red('−' + f.del)}` : c.grey('—');
    body.push(`${FILE_COLORS[f.id]('●')} ${c.text(pad(f.name, 12))}${c.muted(pad(LANG[f.id], 12))}${pad(diff, 12)}${c.grey(f.lines + ' lines')}`);
  }
  // the thin language bar: ▀ in each language's colour, one cell per share
  const BAR = 18;
  let bar = '';
  for (const f of order) bar += FILE_COLORS[f.id]('▀'.repeat(Math.max(1, Math.round(f.lines / total * BAR))));
  body.push('', `${bar}  ${c.muted(order.map(f => `${LANG[f.id]} ${f.lines}`).join(' · '))} ${c.grey('— ' + total + ' lines')}`);
  console.log(panel(c.acc(c.bold(name)), body, { width, right: c.grey(seconds.toFixed(1) + 's') }).join('\n'));
  if (foot) console.log('  ' + foot);
}
// The error bar from the preview: red dot, the message, the failing line, what happens next
export function errorCard({ message, file, line, src, foot }){
  const width = cols() - 2, inner = width - 4;
  const body = wrap(message, inner - 2).map((l, i) => (i ? '  ' : c.err('● ')) + c.bold(fg(T.errSoft)(l)));
  if (src) body.push(`  ${c.grey((file && line ? `${file}:${line}` : '') + '  ')}${c.muted(src)}`);
  if (foot) body.push('', '  ' + foot);
  console.log(panel(fg(T.err)('ERROR'), body, { width, tone: fg([90, 38, 38]) }).join('\n'));
}
export function note(text, tone = c.muted){ console.log('  ' + tone(text)); }
// The status bar along the bottom of the editor: ● ready · what is connected · hints
export function hintBar(items){ console.log(`  ${c.ok('●')} ${c.muted('ready')}${c.grey('   ')}` + items.map(([k, v]) => v ? `${c.acc(k)} ${c.grey(v)}` : c.grey(k)).join(c.grey(' · '))); }
export function askedLine(text){ console.log(`${c.acc('›')} ${c.text(text)}`); }
export function appLog(kind, text){ return `  ${c.grey('app ›')} ${kind === 'warn' || kind === 'error' ? c.acc(text) : c.muted(text)}`; }

/* ── The input: a framed box like the site's chat composer (orange frame, grey placeholder),
   with a hint row under it. Own line editor (raw keys), because readline wipes everything below
   the cursor on each key. Long text wraps inside the box; "\" + Enter starts a new line. ── */
export function inputBox({ placeholder, hint, status, onSubmit, onCtrlC }){
  const history = []; let hi = -1, saved = '';
  let buf = '', pos = 0, active = false, height = 0, curRow = 0;
  const PFX = 4; // "│ › "
  const layout = () => {
    const width = cols() - 2, textW = width - PFX - 2;
    const rows = []; let start = 0;
    // wrap each logical line into rows; remember where each row starts in buf
    for (const part of buf.split('\n')) {
      const chars = [...part];
      if (!chars.length) rows.push({ start, text: '' });
      for (let i = 0; i < chars.length; i += textW) rows.push({ start: start + i, text: chars.slice(i, i + textW).join('') });
      start += chars.length + 1;
    }
    // where the cursor is: the last row that starts at or before it
    let r = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].start <= pos) r = i;
    let col = pos - rows[r].start;
    if (col > textW) { col = textW; }
    return { width, textW, rows, r, col };
  };
  const draw = () => {
    if (!active) return;
    const { width, textW, rows, r, col } = layout();
    const tone = fg(T.accent), inner = width - 2;
    const lines = [' ' + tone('╭' + '─'.repeat(inner) + '╮')];
    rows.forEach((row, i) => {
      const body = !buf && i === 0 ? c.grey(typeof placeholder === 'function' ? placeholder() : placeholder) : c.text(row.text);
      lines.push(' ' + tone('│') + ' ' + (i === 0 ? c.acc(c.bold('›')) : ' ') + ' ' + pad(cut(body, textW), textW) + ' ' + tone('│'));
    });
    lines.push(' ' + tone('╰' + '─'.repeat(inner) + '╯'));
    const left = '  ' + hint(), right = status();
    lines.push(len(left) + len(right) + 2 > width ? cut(left, width) : left + ' '.repeat(width - len(left) - len(right)) + right);
    let s = (curRow ? `${ESC}${curRow}A` : '') + '\r' + lines.map(l => `${ESC}2K${l}`).join('\n') + `${ESC}0J`;
    // put the cursor back inside the box
    const target = 1 + r, up = lines.length - 1 - target;
    s += (up ? `${ESC}${up}A` : '') + '\r' + `${ESC}${1 + PFX + col}C`;
    w(s); height = lines.length; curRow = target;
  };
  const erase = () => { if (!height) return; w((curRow ? `${ESC}${curRow}A` : '') + `\r${ESC}0J`); height = 0; curRow = 0; };
  const insert = s => { const a = [...buf]; a.splice(pos, 0, ...s); buf = a.join(''); pos += [...s].length; };
  const submit = () => {
    const text = buf.trim();
    if (text) { history.unshift(buf); if (history.length > 200) history.pop(); }
    buf = ''; pos = 0; hi = -1;
    erase(); active = false;
    if (!text) return api.show();
    // the sent message stays above, like a chat bubble: › text on a slightly lighter row
    const width = cols() - 2;
    for (const [i, l] of text.split('\n').entries()) console.log(' ' + (color ? bg(T.panel2)(pad(` ${i ? ' ' : c.acc('›')} ${c.text(l)}`, width)) : `> ${l}`));
    onSubmit(text);
  };
  const onKey = (str, key = {}) => {
    if (key.ctrl && key.name === 'c') return onCtrlC();
    if (!active) return;
    const n = key.name;
    if (n === 'return' || n === 'enter') {
      if (buf.endsWith(BSL) && pos === [...buf].length) { buf = buf.slice(0, -1); pos--; insert('\n'); return draw(); }
      if (key.meta || key.shift) { insert('\n'); return draw(); }
      return submit();
    }
    if (n === 'backspace') { if (pos > 0) { const a = [...buf]; a.splice(pos - 1, 1); buf = a.join(''); pos--; } }
    else if (n === 'delete') { const a = [...buf]; a.splice(pos, 1); buf = a.join(''); }
    else if (n === 'left') pos = Math.max(0, pos - 1);
    else if (n === 'right') pos = Math.min([...buf].length, pos + 1);
    else if (n === 'home' || (key.ctrl && n === 'a')) pos = 0;
    else if (n === 'end' || (key.ctrl && n === 'e')) pos = [...buf].length;
    else if (key.ctrl && n === 'u') { buf = ''; pos = 0; }
    else if (key.ctrl && n === 'w') { const a = [...buf]; let i = pos; while (i > 0 && a[i - 1] === ' ') i--; while (i > 0 && a[i - 1] !== ' ') i--; a.splice(i, pos - i); buf = a.join(''); pos = i; }
    else if (n === 'up' || n === 'down') {
      if (!history.length) return;
      if (hi === -1) saved = buf;
      hi = n === 'up' ? Math.min(history.length - 1, hi + 1) : Math.max(-1, hi - 1);
      buf = hi === -1 ? saved : history[hi]; pos = [...buf].length;
    }
    else if (n === 'escape') { buf = ''; pos = 0; }
    else if (n === 'tab') return;
    else if (str && !key.ctrl && !key.meta && str >= ' ') insert(str.replace(/\r\n?/g, '\n'));
    else return;
    draw();
  };
  const api = {
    start(){
      readlineMod.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.on('keypress', onKey);
      process.stdout.on('resize', () => { if (active) { erase(); draw(); } });
      api.show();
    },
    show(){ active = true; show(); w('\n'); height = 0; curRow = 0; draw(); },
    hide(){ erase(); active = false; },
    // prints above the box without disturbing what is being typed
    print(line){ const was = active; if (was) erase(); console.log(line); if (was) draw(); },
    refresh(){ if (active) draw(); },
  };
  return api;
}
