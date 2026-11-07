// The coding agent. Works in steps: each model reply is ONE action (look at a folder, read files,
// search, edit or create a file, finish or ask). The page runs the action and sends back the result
// until the model says it's done. Edits go into the working copy right away (so later reads see
// them) and are reported as changes the user accepts or rejects.
import { diffLines } from 'diff';
import { readText, addFile } from './fs.js';
import { langName, fenceLang } from './langs.js';

const MAX_STEPS = 30, MAX_READ = 18_000, MAX_RESULT = 24_000;

export const SYSTEM = lang => `You are openconstructor code, a careful senior engineer working inside the user's project folder in their browser. You can read, search and edit files. You cannot run commands, install packages or execute code — say so if the task needs it, and tell the user what to run.

Work in small steps. EVERY reply is exactly ONE step in this format and nothing else:
line 1 — a one-line JSON header: {"thought":"what you do now, one short sentence","action":"…", …}
then, only for "edit" and "write", the content described below.

Actions:
- {"action":"list","path":"src"} — files in a folder ("" for the whole project).
- {"action":"read","paths":["src/app.ts","package.json"]} — up to 6 files; you get them with line numbers.
- {"action":"search","query":"useState","glob":"*.tsx"} — text search (or /regex/i); glob is optional.
- {"action":"edit","path":"src/app.ts"} — then one or more blocks:
<<<<<<< SEARCH
exact lines copied from the file (without the line numbers)
=======
the new lines
>>>>>>> REPLACE
- {"action":"write","path":"src/new-file.ts"} — then the COMPLETE file in ONE fenced code block. Use it for new files or rewriting a small file completely.
- {"action":"done","summary":"what you changed and why, 1-4 short sentences"} — when the task is finished.
- {"action":"ask","question":"…"} — only when you truly cannot continue without the user's answer.

Rules:
- Look before you change: read a file before editing it. Never invent file contents.
- SEARCH must match the current file exactly, including indentation; keep each block small and unique. Several blocks per edit are fine.
- Keep changes minimal and in the project's existing style, conventions and libraries. Don't reformat untouched code.
- Paths are relative to the project root, with forward slashes.
- If something fails, the result tells you why — fix it (usually: read the file again).
- Write "thought", "summary" and "question" in the language the user writes in; if unclear, in ${lang}. Code and comments follow the project's language.`;

/* ── Reply parsing ── */
function parse(reply){
  const text = String(reply || '').replace(/\r\n/g, '\n');
  const line = text.split('\n').find(l => /^\s*\{.*\}\s*$/.test(l));
  let head = null;
  if (line) { try { head = JSON.parse(line.trim()); } catch {} }
  if (!head) { const m = text.match(/\{[\s\S]*?"action"[\s\S]*?\}/); if (m) { try { head = JSON.parse(m[0]); } catch {} } }
  if (!head || typeof head.action !== 'string') throw Error('could not find the JSON header with "action"');
  const blocks = [...text.matchAll(/<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g)].map(m => ({ find: m[1], replace: m[2] }));
  const fence = text.match(/```[^\n]*\n([\s\S]*?)\n```/);
  return { head, blocks, content: fence ? fence[1] : null };
}

/* ── Tools ── */
const numbered = (text, from = 1) => text.split('\n').map((l, i) => `${String(i + from).padStart(4)}| ${l}`).join('\n');
const globRe = g => new RegExp('(^|/)' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '$', 'i');

export function tree(project, prefix = '', limit = 400){
  const paths = [...project.files.keys()].filter(p => p.startsWith(prefix)).sort();
  const lines = paths.slice(0, limit).map(p => { const e = project.files.get(p); return `${p}${e.binary ? ' (binary)' : ''} ${e.size > 1024 ? Math.round(e.size / 1024) + 'KB' : e.size + 'B'}`; });
  if (paths.length > limit) lines.push(`… and ${paths.length - limit} more`);
  return lines.join('\n') || '(no files)';
}

async function read(project, paths){
  const out = [];
  for (const p of (paths || []).slice(0, 6)) {
    try {
      let t = await readText(project, p);
      const cut = t.length > MAX_READ;
      if (cut) t = t.slice(0, MAX_READ);
      out.push(`=== ${p} (${langName(p)}, ${t.split('\n').length} lines${cut ? ', truncated' : ''}) ===\n${numbered(t)}`);
    } catch (e) { out.push(`=== ${p} === ERROR: ${e.message}`); }
  }
  return out.join('\n\n');
}

async function search(project, query, glob){
  let re;
  const m = String(query || '').match(/^\/(.+)\/([a-z]*)$/);
  try { re = m ? new RegExp(m[1], m[2].replace('g', '')) : new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  catch (e) { return `bad pattern: ${e.message}`; }
  const g = glob ? globRe(glob) : null, hits = [];
  for (const e of project.files.values()) {
    if (e.binary || (g && !g.test(e.path))) continue;
    let t; try { t = await readText(project, e.path); } catch { continue; }
    t.split('\n').forEach((l, i) => { if (hits.length < 80 && re.test(l)) hits.push(`${e.path}:${i + 1}: ${l.trim().slice(0, 200)}`); });
    if (hits.length >= 80) break;
  }
  return hits.length ? hits.join('\n') + (hits.length >= 80 ? '\n… more matches, narrow the search' : '') : 'no matches';
}

export function countLines(before, after){
  let added = 0, removed = 0;
  for (const part of diffLines(before || '', after || '')) {
    const n = part.count ?? part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0);
    if (part.added) added += n; else if (part.removed) removed += n;
  }
  return { added, removed };
}

// Finds `find` in `text`: exactly first, then ignoring trailing spaces on each line
function locate(text, find){
  let i = text.indexOf(find);
  if (i >= 0) return [i, find.length];
  const norm = s => s.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  const lines = text.split('\n'), want = norm(find).split('\n');
  for (let s = 0; s + want.length <= lines.length; s++) {
    if (want.every((w, k) => lines[s + k].replace(/\s+$/, '') === w)) {
      const start = lines.slice(0, s).join('\n').length + (s ? 1 : 0);
      const len = lines.slice(s, s + want.length).join('\n').length;
      return [start, len];
    }
  }
  return null;
}

let nextId = 1;
function change(project, path, before, after, isNew){
  return { id: nextId++, path, before, after, isNew, lang: langName(path), ...countLines(before, after), status: 'pending' };
}

async function edit(project, path, blocks){
  if (!blocks.length) throw Error('no SEARCH/REPLACE blocks after the header');
  const exists = project.files.has(path);
  if (!exists && blocks.every(b => !b.find.trim())) {
    const after = blocks.map(b => b.replace).join('\n');
    addFile(project, path, after);
    return change(project, path, '', after, true);
  }
  const before = await readText(project, path);
  let text = before;
  for (const [n, b] of blocks.entries()) {
    const at = locate(text, b.find);
    if (!at) throw Error(`SEARCH block ${n + 1} was not found in ${path}. Read the file again and copy the lines exactly.`);
    text = text.slice(0, at[0]) + b.replace + text.slice(at[0] + at[1]);
  }
  if (text === before) throw Error('the edit changes nothing');
  project.files.get(path).text = text;
  return change(project, path, before, text, false);
}

async function write(project, path, content){
  if (content == null) throw Error('no fenced code block with the file content');
  const exists = project.files.has(path);
  const before = exists ? await readText(project, path).catch(() => '') : '';
  if (exists) project.files.get(path).text = content; else addFile(project, path, content);
  return change(project, path, before, content, !exists);
}

/**
 * Runs one request to the end.
 * callModel(system, transcript) → reply text; onStep(step) for the checklist; onChange(change) for edits.
 * Returns { summary, question? }.
 */
export async function runAgent({ project, request, history = [], openPath, lang = 'English', callModel, onStep, onChange, signal }){
  const intro = [
    `Project folder: "${project.name}" (${project.files.size} files${project.writable ? '' : ', read-only copy'}).`,
    `Files:\n${tree(project)}`,
    openPath ? `The user has ${openPath} open in the editor.` : '',
    history.length ? `Earlier in this conversation:\n${history.map(h => `User: ${h.request}\nYou did: ${h.summary}`).join('\n')}` : '',
    `User request:\n${request}`,
  ].filter(Boolean).join('\n\n');
  const turns = [];
  let badReplies = 0;
  const transcript = () => intro + turns.map((t, i) => `\n\n--- step ${i + 1} ---\nYour reply:\n${t.reply}\n\nResult:\n${t.result}`).join('') + '\n\nNext step (one JSON header line first):';

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw Error('stopped');
    const reply = await callModel(SYSTEM(lang), transcript());
    if (signal?.aborted) throw Error('stopped');
    let parsed;
    try { parsed = parse(reply); badReplies = 0; }
    catch (e) {
      if (++badReplies > 2) throw Error('the model keeps answering in the wrong format — try another model');
      turns.push({ reply: String(reply).slice(0, 2000), result: `ERROR: ${e.message}. Reply again: first line is the JSON header.` });
      continue;
    }
    const { head, blocks, content } = parsed, thought = String(head.thought || '').slice(0, 200);
    let result;
    try {
      switch (head.action) {
        case 'list': {
          const p = String(head.path || '').replace(/^\.?\/?/, '').replace(/\/?$/, head.path ? '/' : '');
          onStep({ kind: 'list', label: thought || `looking at ${p || 'the project'}`, detail: p || '/' });
          result = tree(project, p, 300);
          break;
        }
        case 'read': {
          const paths = [].concat(head.paths || head.path || []).map(String);
          onStep({ kind: 'read', label: thought || 'reading files', detail: paths.join(', ') });
          result = await read(project, paths);
          break;
        }
        case 'search': {
          onStep({ kind: 'search', label: thought || 'searching', detail: `“${head.query}”${head.glob ? ' in ' + head.glob : ''}` });
          result = await search(project, head.query, head.glob);
          break;
        }
        case 'edit': case 'write': {
          const path = String(head.path || '').replace(/^\.?\//, '');
          if (!path) throw Error('"path" is missing');
          const c = head.action === 'edit' ? await edit(project, path, blocks) : await write(project, path, content);
          onStep({ kind: 'edit', label: thought || `editing ${path}`, detail: path, change: c });
          onChange(c);
          result = `OK: ${path} ${c.isNew ? 'created' : 'updated'} (+${c.added} −${c.removed}). The user reviews it later; carry on.`;
          break;
        }
        case 'done':
          onStep({ kind: 'done', label: 'done' });
          return { summary: String(head.summary || thought || 'Done.') };
        case 'ask':
          onStep({ kind: 'ask', label: 'question for you' });
          return { summary: String(head.question || thought), question: true };
        default:
          throw Error(`unknown action "${head.action}"`);
      }
    } catch (e) {
      if (e.message === 'stopped') throw e;
      onStep({ kind: 'error', label: e.message.slice(0, 140) });
      result = `ERROR: ${e.message}`;
    }
    turns.push({ reply: String(reply).slice(0, 8000), result: String(result).slice(0, MAX_RESULT) });
    // keep the prompt bounded: old file contents are summarised once they're far behind
    for (let i = 0; i < turns.length - 6; i++) if (turns[i].result.length > 600) turns[i].result = turns[i].result.slice(0, 600) + '\n… (older result shortened; read again if needed)';
  }
  return { summary: 'Stopped after the step limit. Ask me to continue if the task isn\'t finished.' };
}

export { fenceLang };
