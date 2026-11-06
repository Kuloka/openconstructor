<p align="center"><img src="src/logo.svg" width="72" alt="openconstructor logo"></p>

<h1 align="center">openconstructor</h1>

<p align="center">Build interfaces with words and blocks — an open-source, in-browser AI interface builder.</p>

---

Drop ready-made components onto one shared canvas, move them around freely, and ask an AI model to build or change anything on the page. When you're done, export a single self-contained HTML file.

## Features

- **Component catalog** — buttons, inputs, elements, full page sections and effects, all plain HTML + CSS.
- **Free-form canvas** — drag, pan, zoom, desktop / laptop / tablet / phone sizes, page backgrounds.
- **AI assistant** — bring your own key for OpenRouter, Google Gemini, Groq, Cerebras, Mistral, DeepSeek, OpenAI, Anthropic, xAI or Together. Keys stay in your browser and go only to the provider you choose.
- **VS Code–style layout** — resizable, movable, collapsible panels.
- **Safe previews** — every element renders in a sandboxed iframe with scripts and network requests disabled.
- **Export** — one HTML file you can host anywhere.
- Optional sign-in with Google, GitHub or email (Supabase).

## Quick start

```bash
git clone https://github.com/<your-username>/openconstructor.git
cd openconstructor
npm install
npm run dev
```

Open http://127.0.0.1:5173. Press `?` in the editor for a quick tour.

To use the AI assistant, click the gear icon and paste a key from any supported provider. Google Gemini and Groq are the quickest to set up.

## Configuration (optional)

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | enable accounts (Google, GitHub, email) |
| `VITE_DONATE_URL` | link for the "support" button |
| `VITE_CRYPTO_WALLETS` | `coin|network|address;…` — public wallet addresses for donations |

Without these, the app works fully, just without accounts.

## Build & deploy

```bash
npm run build   # output in dist/
```

`npm run deploy` builds and uploads to Cloudflare (config in `wrangler.jsonc`). `dist/` is a plain static site, so Netlify, Vercel or GitHub Pages work too.

## Stack

Vite · vanilla JS editor · React 19 for the welcome screen and chat input · Supabase Auth

## Contributing

Issues and pull requests are welcome. New catalog components go in `presets*.js`: self-contained HTML + CSS, a unique class prefix, no scripts.

## License

[MIT](LICENSE). Third-party code is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
