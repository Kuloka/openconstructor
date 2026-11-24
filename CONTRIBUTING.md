# Contributing to openconstructor

Thanks for wanting to help! openconstructor is a small project, so every fix, component and translation matters.

## Find something to do

- Issues labelled [**good first issue**](https://github.com/Kuloka/openconstructor/labels/good%20first%20issue) are small, well-described tasks: a good place to start.
- Have an idea or a question? Open a [Discussion](https://github.com/Kuloka/openconstructor/discussions).
- Found a bug? Open an issue with the steps to reproduce it and a screenshot.

## Run it locally

```bash
git clone https://github.com/Kuloka/openconstructor.git
cd openconstructor
npm install
npm run dev          # http://127.0.0.1:5173
```

The editor works without any setup. `/api` calls (free AI, publishing) go to the live server through the Vite proxy.

## Find your way around the code

Read **[PROJECT_MAP.txt](PROJECT_MAP.txt)** first. It is a map of every file and the important places inside them. It's in Russian, and an online translator handles it well.

The short version:

| Where | What |
|---|---|
| `studio.js` | the editor core: canvas, AI requests (`runAI`), export |
| `presets*.js` | the component catalog (plain HTML + CSS) |
| `exporters.js` | export to React / Vue / Svelte / Roblox Luau / .rbxmx / LÖVE |
| `worker.js` | the Cloudflare Worker: free AI proxy, publishing, `oc.db` |
| `locales/*.js` | UI translations (English text → translation) |
| `tests/` | `unit/` (fast) and `e2e/` (headless Chrome, the AI is faked) |

## Before you open a pull request

```bash
npm test            # unit tests, seconds
npm run test:e2e    # browser tests, ~10 minutes; ONLY=name runs a part
```

- Keep pull requests focused: one change per PR.
- New catalog components: self-contained HTML + CSS, a unique class prefix, no scripts. Game UI components should survive the Roblox export: solid colours or linear gradients, and every visible text in its own element.
- UI text is written in English in the code; add the Russian translation to `locales/ru.js` (other languages are welcome too).
- Never weaken the sandbox: user HTML runs in iframes without `allow-same-origin`, and apps have no network except `oc.db`.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
