# openconstructor desktop

Pick the AI agent you already use and it builds the page with openconstructor's tools.
No API keys: each agent runs on its own sign-in, so it uses your existing plan.

| agent | how it starts | sign-in |
| --- | --- | --- |
| Claude Code | `npx -y @agentclientprotocol/claude-agent-acp` | your Claude Code login |
| Codex | `npx -y @agentclientprotocol/codex-acp` | your Codex / ChatGPT login |
| Gemini CLI | `gemini --acp` | Google, Gemini API key or Vertex AI (chosen in the app) |

The app talks to the agent over the [Agent Client Protocol](https://agentclientprotocol.com) (`acp.cjs`) and
hands it openconstructor's MCP server (`../cli/mcp.mjs`): the catalog of 735 sections, live 3D, photos,
screenshots and export. The page the agent builds lives in the project folder (`index.html` +
`openconstructor.json`) and shows live in the preview next to the chat.

**Windows:** double-click `desktop\start.cmd` (installs Electron on the first run), or from the project root
`npm.cmd run desktop`. In PowerShell write `npm.cmd`, not `npm`: plain `npm` is blocked when script execution
is off.

**macOS / Linux:**

```bash
cd desktop
npm install
npm start
```

If the app opens as plain Node (`ipcMain` is undefined), the shell has `ELECTRON_RUN_AS_NODE=1` set (VS Code
terminals do): run `env -u ELECTRON_RUN_AS_NODE npm start`, or unset it first.

Checks without clicking: `OC_SHOT=shot.png OC_CONNECT=codex npm start` connects the agent, saves the window
and quits (`OC_PROMPT`, `OC_WAIT`, `OC_CONNECT_WAIT` for more).
