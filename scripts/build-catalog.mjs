// Builds cli/catalog.json.gz for the MCP server (cli/mcp.mjs) from the editor's catalog (presets.js).
// Run after changing presets: node scripts/build-catalog.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import { presets } from '../presets.js';

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const seen = new Map();
const items = presets.map(p => {
  let id = slug(p.name); const n = (seen.get(id) || 0) + 1; seen.set(id, n); if (n > 1) id += '-' + n;
  // the words a person would see on it: visible text without styles, scripts and tags
  const words = p.code.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  return { id, name: p.name, category: p.category, kind: p.full ? 'section' : 'component', ...(p.hidden ? { sample: true } : {}), words, code: p.code };
});
const out = new URL('../cli/catalog.json.gz', import.meta.url);
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ built: new Date().toISOString().slice(0, 10), items }), { level: 9 }));
console.log(`${items.length} items → cli/catalog.json.gz (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
