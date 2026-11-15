// openconstructor desktop: pick the AI agent you already use — Claude Code, Codex, Gemini CLI — and it builds the
// page with openconstructor's tools. The agent runs on its own sign-in (no API keys here) and talks ACP to us
// (acp.cjs); we hand it openconstructor's MCP server (../cli/mcp.mjs: the catalog of 735 sections, 3D, photos,
// screenshots, export), and the page it builds in the project folder shows live in the preview next to the chat.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AcpAgent } = require('./acp.cjs');
const { account } = require('./account.cjs');

// the visual editor and the code workspace: the website itself, embedded (OC_WEB_URL=http://127.0.0.1:5173/ for a dev server)
const WEB = process.env.OC_WEB_URL || 'https://openconstructor.pw/';

const CLI = path.join(__dirname, '..', 'cli', 'bin.mjs');
const ICON = path.join(__dirname, '..', 'public', 'icon-512.png');

/* ── Agents: each starts in ACP mode with the person's own sign-in ── */
const AGENTS = [
  { id: 'claude', name: 'Claude Code', by: 'Anthropic', note: 'Your Claude plan, signed in through Claude Code', command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp'], needs: null, install: 'npm i -g @anthropic-ai/claude-code, then run claude once to sign in' },
  { id: 'codex', name: 'Codex', by: 'OpenAI', note: 'Your ChatGPT plan, signed in through Codex', command: 'npx', args: ['-y', '@agentclientprotocol/codex-acp'], needs: 'codex', install: 'npm i -g @openai/codex, then run codex once to sign in' },
  { id: 'gemini', name: 'Gemini CLI', by: 'Google', note: 'Your Google account', command: 'gemini', args: ['--acp'], needs: 'gemini', install: 'npm i -g @google/gemini-cli' },
];
const onPath = cmd => { try { return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }).status === 0; } catch { return false; } };

/* ── Settings: the project folder ── */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
const loadSettings = () => { try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; } settings.folder ||= path.join(app.getPath('documents'), 'openconstructor', 'my-site'); fs.mkdirSync(settings.folder, { recursive: true }); };
const saveSettings = () => { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); };

/* ── Live preview: the folder's index.html on 127.0.0.1, reloading itself when the agent changes it ── */
let previewUrl = '', clients = new Set(), watcher = null;
const RELOAD = `<script>new EventSource('/__oc/live').onmessage=()=>location.reload()</script>`;
const EMPTY = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0a0a0b;color:#8e8e98;font:14px/1.6 system-ui;display:grid;place-items:center;text-align:center}b{color:#f2f2f3;font-size:16px;font-weight:600}</style><div><b>The page appears here</b><br>Pick an agent and describe what to build.</div>`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
function startPreview(){
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/__oc/live') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write(': hi\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
      const file = path.resolve(settings.folder, '.' + decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
      if (!file.startsWith(path.resolve(settings.folder) + path.sep)) { res.writeHead(403); res.end(); return; }
      if (u.pathname === '/' || u.pathname === '/index.html') {
        let html = EMPTY; try { html = fs.readFileSync(file, 'utf8'); } catch {}
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html.includes('</body>') ? html.replace('</body>', RELOAD + '</body>') : html + RELOAD); return;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => { previewUrl = `http://127.0.0.1:${server.address().port}/`; resolve(); });
  });
}
function watchFolder(){
  watcher?.close();
  let t = 0;
  try {
    watcher = fs.watch(settings.folder, (_e, name) => {
      if (name && !/\.(html|css|js|json|png|jpe?g|webp|svg)$/i.test(name)) return;
      clearTimeout(t); t = setTimeout(() => { for (const r of clients) r.write('data: reload\n\n'); send('page-changed', { name }); }, 150);
    });
  } catch {}
}

/* ── The agent session ── */
let win = null, agent = null, agentId = null, primed = false;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const permissions = new Map(); let permId = 0;

// what the agent is told once per session, before the person's first message
const GUIDE = `You are working inside openconstructor desktop. The person sees a live preview of index.html in the project folder.
Build web pages with the "openconstructor" MCP tools: search_components → page_add_section (catalog items or your own HTML) → screenshot (also at width 390) → page_update_section to fix. Keep every section's class names unique. <img src="model:torus glass #7b6cf6"> is a live 3D object, src="photo:espresso coffee cup" a stock photo.
Answer briefly in the person's language. Their request:`;

async function connect(id){
  const def = AGENTS.find(a => a.id === id); if (!def) throw new Error('unknown agent');
  agent?.stop(); agent = null; agentId = id; primed = false;
  const a = new AcpAgent({
    command: def.command, args: def.args, cwd: settings.folder,
    handlers: {
      onUpdate: update => send('update', update),
      onExit: (code, tail) => { if (agent === a) { agent = null; send('agent-exit', { code, tail }); } },
      onPermission: params => {
        // openconstructor's own tools are safe to run: they only touch the project folder
        const allow = (params.options || []).find(o => o.kind === 'allow_once') || (params.options || []).find(o => /allow/.test(o.kind));
        if (allow && /openconstructor/i.test(JSON.stringify(params.toolCall || {}))) return Promise.resolve(allow.optionId);
        const requestId = ++permId;
        send('permission', { requestId, toolCall: params.toolCall, options: params.options });
        return new Promise(resolve => permissions.set(requestId, resolve));
      },
    },
  });
  agent = a;
  const info = await a.start();
  return { info, ...(await openSession(a)) };
}
async function openSession(a){
  const mcp = { name: 'openconstructor', command: process.execPath, args: [CLI, 'mcp', settings.folder], env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }] };
  try { await a.newSession({ cwd: settings.folder, mcpServers: [mcp] }); return { ready: true }; }
  catch (err) {
    // not signed in yet: the agent lists how it can sign in (a browser login, an API key from env…)
    if (err.code === -32000 || /auth/i.test(err.message)) return { ready: false, authMethods: a.info?.authMethods || [] };
    throw err;
  }
}

ipcMain.handle('agents', () => AGENTS.map(a => ({ id: a.id, name: a.name, by: a.by, note: a.note, install: a.install, available: a.needs ? onPath(a.needs) : onPath('npx') })));
ipcMain.handle('state', () => ({ folder: settings.folder, previewUrl, agentId: agent ? agentId : null }));
ipcMain.handle('connect', async (_e, id) => { try { return await connect(id); } catch (err) { agent?.stop(); agent = null; return { error: String(err.message || err), tail: '' }; } });
ipcMain.handle('authenticate', async (_e, methodId) => { try { await agent.authenticate(methodId); return await openSession(agent); } catch (err) { return { error: String(err.message || err) }; } });
ipcMain.handle('prompt', async (_e, text) => {
  if (!agent?.sessionId) return { error: 'Connect an agent first.' };
  const body = primed ? text : `${GUIDE}\n${text}`; primed = true;
  try { return await agent.prompt(body); } catch (err) { return { error: String(err.message || err) }; }
});
ipcMain.handle('cancel', () => { agent?.cancel(); for (const r of permissions.values()) r(null); permissions.clear(); });
ipcMain.handle('permission-answer', (_e, requestId, optionId) => { permissions.get(requestId)?.(optionId); permissions.delete(requestId); });
ipcMain.handle('choose-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.folder });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.folder = r.filePaths[0]; saveSettings(); watchFolder();
  for (const c of clients) c.write('data: reload\n\n');
  agent?.stop(); agent = null; // a new folder = a new session
  return settings.folder;
});
ipcMain.handle('open-folder', () => shell.openPath(settings.folder));
// the account (account.cjs) and the embedded website
const authCall = fn => async (...a) => { try { return await fn(...a); } catch (err) { return { error: String(err.message || err) }; } };
ipcMain.handle('auth-session', authCall(() => account.session()));
ipcMain.handle('auth-signin', authCall((_e, email, password) => account.signIn(email, password)));
ipcMain.handle('auth-signup', authCall((_e, email, password) => account.signUp(email, password)));
ipcMain.handle('auth-verify', authCall((_e, email, code) => account.verify(email, code)));
ipcMain.handle('auth-signout', () => { account.signOut(); return true; });
ipcMain.handle('web', authCall(async () => ({ url: WEB, storageKey: account.storageKey, session: await account.session() })));
ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('open-in-browser', () => shell.openExternal(previewUrl));

// screenshot runs: an off-screen window counts as covered on Windows, and Chromium would stop painting it
if (process.env.OC_SHOT) { app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); app.commandLine.appendSwitch('disable-renderer-backgrounding'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); }
app.whenReady().then(async () => {
  loadSettings(); saveSettings();
  await startPreview(); watchFolder();
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 600, backgroundColor: '#08080a', title: 'openconstructor', icon: ICON, autoHideMenuBar: true,
    // screenshot runs (OC_SHOT) live far off the screen, never take focus, and keep animating
    ...(process.env.OC_SHOT ? { x: -20000, y: 0, skipTaskbar: true, focusable: false } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, backgroundThrottling: !process.env.OC_SHOT },
  });
  // links from the page and the chat open in the person's browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // the embedded website: no Node, its own storage; its new windows open in the person's browser
  win.webContents.on('will-attach-webview', (_e, prefs) => { delete prefs.preload; prefs.nodeIntegration = false; prefs.contextIsolation = true; });
  app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'webview') wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; }); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  // for checks without clicking: OC_SHOT=file.png [OC_CONNECT=gemini] [OC_PROMPT="…"] [OC_WAIT=ms] saves the window and quits
  if (process.env.OC_SHOT) win.webContents.once('did-finish-load', async () => {
    const js = s => win.webContents.executeJavaScript(s).catch(e => console.error('shot:', e.message));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(+process.env.OC_START_WAIT || 1500);
    if (process.env.OC_SCREEN) { await js(`window.__go && window.__go(${JSON.stringify(process.env.OC_SCREEN)})`); await wait(+process.env.OC_SCREEN_WAIT || 1800); }
    if (process.env.OC_JS) { await js(process.env.OC_JS); await wait(+process.env.OC_JS_WAIT || 6000); }
    if (process.env.OC_CONNECT) { await js(`document.querySelector('[data-agent="${process.env.OC_CONNECT}"]').click()`); await wait(+process.env.OC_CONNECT_WAIT || 20000); }
    if (process.env.OC_PROMPT) { await js(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(process.env.OC_PROMPT)}; document.getElementById('composer').requestSubmit(); })()`); }
    await wait(+process.env.OC_WAIT || 500);
    const img = await win.capturePage(); fs.writeFileSync(process.env.OC_SHOT, img.toPNG());
    console.log('log:', await js(`[document.getElementById('log').innerText.slice(-1500), '--conn: ' + document.getElementById('conn').innerText].join(String.fromCharCode(10))`));
    app.quit();
  });
});
app.on('window-all-closed', () => { agent?.stop(); app.quit(); });
