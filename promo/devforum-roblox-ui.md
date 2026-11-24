<!--
DevForum post. Category: Resources → Community Resources. Tags: ui, gui, plugin, open-source.
Attach: promo/roblox-export.gif right under the first paragraph (19 s, 0.75 MB: catalog → HUD → Select → export to Luau).
Before posting: check that the links work, and replace the GIF with a fresh capture if the UI changed.
-->

# openconstructor: describe a game UI in words, get a ScreenGui in Studio (free, open source)

Hi DevForum! I've been building **openconstructor**, a free, open-source UI builder that runs in the browser. You describe a menu in plain words, an AI lays it out on a canvas, and you bring it into Studio as real GUI instances: Frames, TextLabels, TextButtons, UICorner, UIStroke and UIGradient. You get no screenshots and no ImageLabel of a mock-up.

[GIF: promo/roblox-export.gif — Game UI parts from the catalog → a HUD on a 1280×720 screen with safe zones → Select the shop title and recolour it → Export → the generated Luau]

I made it because UI is usually the part of a game that gets done last and looks it. Placing 40 frames by hand to get a decent shop is slow, and pasting AI-written Luau that builds a UI blind rarely lines up. Here you see the layout first, change what you want, and export only when it looks right.

## How it works

1. Open **openconstructor.pw**. You can start without an account.
2. Pick a screen size: phone landscape 844×390, 1080p, tablet, and so on. Turn on **Roblox zones** to see where the top bar, the mobile thumbstick and the jump button will cover your UI.
3. Describe what you need: *"a shop menu with 6 items, prices in coins, tabs for Weapons / Pets / Boosts, a close button"*. Or start from a template.
4. To change one thing, press **Select** (or V), click the part and type what to change, e.g. *"make this button green and bigger"*. The AI rewrites only that part.
5. Export to Studio (see below).

## Getting it into Studio

You have three ways, all free:

- **Luau script.** A LocalScript that builds the whole ScreenGui when it runs. Two modes:
  - *Pixel*: pixel offsets plus a UIScale that fits the screen;
  - *Scale*: `UDim2.fromScale`, `TextScaled` and a `UIAspectRatioConstraint`, so it adapts to any device.
- **.rbxmx model.** Drag it into StarterGui and you get the instances directly. It includes a `Buttons` LocalScript with an empty handler for every button. Your game logic goes there.
- **Studio plugin with live sync.** Export → *Sync to Roblox Studio* gives you a code. Paste it into the openconstructor plugin, and the UI lands in StarterGui. Turn on **Live**, and every time you press Sync on the website, Studio updates. If you edited the `Buttons` script, re-syncing keeps your version.
  Plugin source: `https://openconstructor.pw/roblox/openconstructor-sync.lua`. Install it by putting the file into your Plugins folder. Studio will ask to allow HTTP to openconstructor.pw.

Multi-screen projects export too (main menu, shop, settings…). Each screen becomes its own Frame, and the script has a `show("Shop")` helper to switch between them.

## The AI part

- A free built-in AI works right away, without a key or account. It has a small daily limit.
- Or connect your own: OpenRouter in one click, or paste a key for Anthropic, OpenAI, Gemini, Groq, DeepSeek and 100+ other providers. Keys stay in your browser.
- It checks its own layout after each answer and fixes overlapping parts before you see them.

## What doesn't carry over (yet)

I'd rather you know this before trying it:

- **Images** aren't uploaded for you. Roblox needs asset IDs, so upload the image yourself and set it on an ImageLabel.
- **Animations and hover effects** from the canvas don't become Tweens. You get the final look; motion is up to you.
- **Fonts** become Gotham (regular or bold by weight), or Code for monospace text. Swap the FontFace afterwards if you want something else.
- **Complex CSS** (blur, shadows, masks) is simplified. Solid colors, linear gradients, corners and strokes convert well.
- Button **logic** is yours: the export gives you the handlers, not the game code.

## Links

- Editor: https://openconstructor.pw
- Source (MIT): https://github.com/Kuloka/openconstructor
- Bugs and ideas: GitHub issues, or reply here

It's a solo project, so feedback from people who actually ship Roblox UI is the most useful thing I can get. What broke on export? Which UI do you build most often (shops, inventories, HUDs, lobby menus)? Which screen sizes do you test on? I'll read every reply.
