<p align="center"><img src="src/logo.svg" width="72" alt="openconstructor logo"></p>

<h1 align="center">openconstructor</h1>

<p align="center">Build interfaces with words and blocks — an open-source, in-browser AI interface builder.</p>

<p align="center"><a href="https://openconstructor.pw"><b>openconstructor.pw</b></a> — try it live</p>

---

Drop ready-made components onto one shared canvas, move them around freely, and ask an AI model to build or change anything on the page. When you're done, export a single self-contained HTML file.

## Features

- **Component catalog** — 200 components in 13 sections (AI & Chat, Dashboard, Commerce, Auth, Landing…), all plain HTML + CSS. Animated ones play on hover.
- **Free-form canvas** — drag, pan, zoom, desktop / laptop / tablet / phone sizes.
- **Background editor** — solid, linear, radial and mesh gradients, dot / grid / line / noise patterns, or raw CSS.
- **⚗ Fusion** — right-click an element → *fuse with…* → click another: the AI breeds a new component that does the first one's job in the second one's visual style.
- **AI assistant** — 20 free generations a day when signed in (GPT-OSS 120B via a small server proxy), or bring your own key for OpenRouter, Google Gemini, Groq, Cerebras, Mistral, DeepSeek, OpenAI, Anthropic, xAI or Together — those keys stay in your browser and go only to the provider you choose. Paste a screenshot to rebuild it with a vision model.
- **Real photos & attachments** — the AI fills sites with stock photos (CC0, found by what should be in the picture) instead of grey boxes; press **+** or paste/drop to attach your logo, product photos or a text file to a request.
- **3D models** — ask for a 3D object or scene: the AI describes it as data (shapes, materials, lights, motion) and a built-in Three.js renderer draws it — animated on the canvas, orbit it in ▶ play, download it as **.glb** for Blender, Unity, Godot or Roblox Studio.
- **Edit without code** — double-click to edit text in place, restyle any part, swap in your own image, tune every animation (speed, direction, repeats).
- **Multi-select** — Shift-click or Shift-drag a box, move together, align & distribute; smart guides while dragging.
- **Screens & prototypes** — menu → shop → inventory: several screens in one project, link any button to `#screen` and it opens that screen in ▶ play, in the published page and in the Roblox export.
- **Roblox Studio sync** — install the [plugin](public/roblox/openconstructor-sync.lua), press *Export → Sync to Roblox Studio*, paste the code in Studio: the UI lands in StarterGui with named buttons. *Live* mode re-syncs on every change, and your own button scripts are kept.
- **Game UI for Roblox** — 25 HUD components and 5 full screens (simulator, tycoon shop, shooter, obby, mobile RPG), Roblox safe-zone overlay, any page size from all four edges.
- **Publish & share** — one-click public link, community gallery with **remix**, embed code, cloud projects, version history.
- **VS Code–style layout** — resizable, movable, collapsible panels.
- **Safe previews** — every element renders in a sandboxed iframe with scripts and network requests disabled.
- **Export anywhere** — HTML, React, Vue, Svelte, plus **Roblox** (Luau LocalScript in pixel or scale mode, or a drag-and-drop **.rbxmx model** with named buttons and click handlers) and **LÖVE 2D (Lua)**: the rendered layout is converted into native UI code. AI-assisted ports to Flutter, SwiftUI, Jetpack Compose and Tailwind.
- Optional sign-in with Google, GitHub or email (Supabase).

## Quick start

```bash
git clone https://github.com/Kuloka/openconstructor.git
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
