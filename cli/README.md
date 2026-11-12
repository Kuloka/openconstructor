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
