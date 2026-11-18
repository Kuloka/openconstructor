// A small Agent Client Protocol (ACP, https://agentclientprotocol.com) client: we are the editor, the agent
// (Gemini CLI, Codex, Claude Code…) runs as a child process and talks JSON-RPC 2.0, one message per line, over
// stdio. The agent uses its own sign-in (the person's subscription), so openconstructor needs no API keys.
//
// new AcpAgent({ command, args, cwd, env, handlers }) → .start() → .newSession({ cwd, mcpServers }) → .prompt(text)
// handlers: onUpdate(update), onPermission(params) → Promise<optionId|null>, onExit(code, stderrTail)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL_VERSION = 1;

class AcpAgent {
  constructor({ command, args = [], cwd, env = {}, handlers = {} }){
    Object.assign(this, { command, args, cwd, env, handlers });
    this.nextId = 1; this.waiting = new Map(); this.buf = ''; this.stderr = ''; this.sessionId = null; this.root = cwd;
  }

  start(){
    // Windows: CLIs installed by npm are .cmd shims, which only start through the shell
    const env = { ...process.env, ...this.env };
    delete env.ELECTRON_RUN_AS_NODE; // set when the app itself was started from an Electron-based editor
    if (process.platform === 'win32') {
      const q = a => /^[\w@\/.:=-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '\\"')}"`;
      this.proc = spawn([this.command, ...this.args].map(q).join(' '), { cwd: this.cwd, env, shell: true, windowsHide: true });
    } else this.proc = spawn(this.command, this.args, { cwd: this.cwd, env, windowsHide: true });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => this.read(chunk));
    this.proc.stderr.on('data', d => { this.stderr = (this.stderr + d).slice(-4000); });
    this.proc.on('error', err => this.fail(err));
    this.proc.on('exit', code => { this.fail(new Error(`the agent stopped (exit ${code})`)); this.handlers.onExit?.(code, this.stderr.trim().split('\n').slice(-6).join('\n')); });
    return this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      clientInfo: { name: 'openconstructor', title: 'openconstructor', version: '0.1.0' },
    }).then(r => (this.info = r));
  }

  read(chunk){
    this.buf += chunk; let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; } // agents sometimes log to stdout
      if (msg.id != null && !msg.method) { // a response to us
        const w = this.waiting.get(msg.id); if (!w) continue; this.waiting.delete(msg.id);
        if (msg.error) { const e = new Error(msg.error.message || 'agent error'); e.code = msg.error.code; e.data = msg.error.data; w.reject(e); } else w.resolve(msg.result);
      } else if (msg.method) this.incoming(msg);
    }
  }

  send(obj){ if (this.proc?.stdin.writable) this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...obj }) + '\n'); }
  request(method, params){ return new Promise((resolve, reject) => { const id = this.nextId++; this.waiting.set(id, { resolve, reject }); this.send({ id, method, params }); }); }
  notify(method, params){ this.send({ method, params }); }
  fail(err){ for (const w of this.waiting.values()) w.reject(err); this.waiting.clear(); }

  // requests and notifications from the agent
  async incoming({ id, method, params = {} }){
    const reply = result => id != null && this.send({ id, result });
    const error = (code, message) => id != null && this.send({ id, error: { code, message } });
    try {
      if (method === 'session/update') return this.handlers.onUpdate?.(params.update || {});
      if (method === 'session/request_permission') {
        const optionId = await this.handlers.onPermission?.(params);
        return reply({ outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' } });
      }
      if (method === 'fs/read_text_file') {
        const file = this.inside(params.path);
        let text = fs.readFileSync(file, 'utf8');
        if (params.line || params.limit) { const lines = text.split('\n'); const from = Math.max(0, (params.line || 1) - 1); text = lines.slice(from, params.limit ? from + params.limit : undefined).join('\n'); }
        return reply({ content: text });
      }
      if (method === 'fs/write_text_file') {
        const file = this.inside(params.path);
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, params.content ?? '');
        return reply(null);
      }
      return error(-32601, `Method not found: ${method}`);
    } catch (e) { return error(-32603, String(e.message || e)); }
  }

  // the agent may only read and write inside the project folder
  inside(p){
    const file = path.resolve(this.root, String(p || ''));
    if (file !== this.root && !file.startsWith(this.root + path.sep)) throw new Error('outside the project folder');
    return file;
  }

  newSession({ cwd, mcpServers = [] }){ this.root = cwd; return this.request('session/new', { cwd, mcpServers }).then(r => { this.sessionId = r.sessionId; return r; }); }
  authenticate(methodId){ return this.request('authenticate', { methodId }); }
  prompt(text){ return this.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text }] }); }
  cancel(){ if (this.sessionId) this.notify('session/cancel', { sessionId: this.sessionId }); }
  stop(){ try { this.proc?.kill(); } catch {} }
}

module.exports = { AcpAgent, PROTOCOL_VERSION };
