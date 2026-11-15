# openconstructor code (terminal)

Describe an app in your terminal. It is written to a folder as `index.html`, `style.css` and `app.js`
and opens in your browser with live reload. When the app throws an error in the browser, the error
comes back to the terminal and goes straight to the AI to fix (auto-fix, at most 2 tries in a row).

```bash
npx openconstructor                 # in the current folder
npx openconstructor my-timer -p "a pomodoro timer with stats"
```

No account and no key needed: it uses the free openconstructor AI (a few requests a day).
For unlimited use, set one of these before starting:

| variable | provider |
| --- | --- |
| `GROQ_API_KEY` | Groq (free plan) |
| `GEMINI_API_KEY` | Google Gemini (free tier) |
| `OPENROUTER_API_KEY` | OpenRouter |
| `CEREBRAS_API_KEY` | Cerebras |
| `OPENAI_API_KEY` | OpenAI |
| `OC_API_KEY` + `OC_BASE_URL` | any OpenAI-compatible API |

`OC_MODEL` picks the model.

## What happens in the terminal

- a live build line while the AI writes: which file and how many lines so far
- after each change: `+added −removed` per file
- `console.log` from the app shows up as `app ›` lines
- errors show the file, the line number and the failing line

## Commands

| | |
| --- | --- |
| `/open` | open the preview in the browser |
| `/fix` | send the last error to the AI |
| `/auto` | turn auto-fix on or off |
| `/undo` | go back one version (every version is kept in `.openconstructor/history`) |
| `/files` | the files and their size |
| `/model` | which AI is used |
| `/exit` | quit |

Edit the files by hand whenever you like: the browser reloads, and the next request works on your version.

The preview server listens on `127.0.0.1` only. MIT license.

## MCP server: openconstructor as a tool for AI agents

```bash
npx openconstructor mcp [folder]
```

Runs openconstructor as an [MCP](https://modelcontextprotocol.io) server over stdio. Your agent
(Claude Code, Claude Desktop, Cursor or any MCP client) uses it to build web pages from the catalog of
735 hand-made sections and components. The agent is the AI here, so no key and no quota are needed.

**Claude Code:**

```bash
claude mcp add openconstructor -- npx -y openconstructor mcp
```

**Claude Desktop, Cursor and others** (`claude_desktop_config.json`, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "openconstructor": { "command": "npx", "args": ["-y", "openconstructor", "mcp", "/path/to/site"] }
  }
}
```

| tool | what it does |
| --- | --- |
| `search_components`, `list_categories`, `get_component` | find ready sections (hero, pricing, FAQ, dashboards, game UI…) and components, read their HTML+CSS |
| `page_new`, `page_set`, `page_get` | start a page, set its name and background, see its sections |
| `page_add_section`, `page_update_section`, `page_move_section`, `page_remove_section` | assemble the page from catalog items or your own HTML |
| `preview` | local preview with live reload (`open: true` opens the browser) |
| `screenshot` | PNG of the page from headless Chrome or Edge, so the agent checks its own work (width 390 = phone) |
| `export` | one HTML file, a React component, a Vue SFC or a Svelte component |

Inside any HTML, `<img src="model:knot chrome #7b6cf6">` becomes a live real-time 3D object and
`<img src="photo:coffee shop interior">` becomes a free stock photo. The page is kept in the folder
as `openconstructor.json` and `index.html`, which is rebuilt after every change.
