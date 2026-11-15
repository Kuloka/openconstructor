// Controls that work without JavaScript (pages are HTML + CSS only: scripts are off on the canvas and in exports).
// The model writes only the markup; withInteractive() adds the CSS when the page uses it (studio.js, after the answer).
//   tabs / filters / segmented switches:  hidden radios + labels; the checked one shows its panel (:has)
//   accordions / FAQ: <details class="oc-acc"><summary>…</summary>…</details>
//   on/off toggles: <label class="oc-toggle"><input type="checkbox"><i></i> text</label>
const N = 8;
const panels = Array.from({ length: N }, (_, i) => `.oc-tabs:has(>input:nth-of-type(${i + 1}):checked)>.oc-panels>:nth-child(${i + 1})`).join(',');
export const INTERACTIVE_CSS = `.oc-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.oc-tabs>input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.oc-tabs>label{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border:1px solid var(--line,#ffffff26);border-radius:99px;color:var(--muted,inherit);font:inherit;font-size:13px;cursor:pointer;user-select:none;transition:background .2s,color .2s,border-color .2s}
.oc-tabs>label:hover{color:var(--text,inherit);border-color:var(--text,currentColor)}
.oc-tabs>input:checked+label{background:var(--text,#fff);border-color:var(--text,#fff);color:var(--bg,#000)}
.oc-tabs>input:focus-visible+label{outline:2px solid var(--accent,currentColor);outline-offset:2px}
.oc-tabs>.oc-panels{flex-basis:100%;margin-top:18px}
.oc-tabs>.oc-panels>*{display:none}
${panels}{display:block;animation:oc-tab-in .35s ease both}
@keyframes oc-tab-in{from{opacity:0;transform:translateY(6px)}}
.oc-acc{border-bottom:1px solid var(--line,#ffffff26)}
.oc-acc>summary{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;cursor:pointer;list-style:none;font-weight:600}
.oc-acc>summary::-webkit-details-marker{display:none}
.oc-acc>summary::after{content:"+";font-size:1.4em;line-height:1;transition:transform .25s}
.oc-acc[open]>summary::after{transform:rotate(45deg)}
.oc-acc>:not(summary){margin:0 0 18px;color:var(--muted,inherit);animation:oc-tab-in .3s ease both}
.oc-toggle{display:inline-flex;align-items:center;gap:10px;cursor:pointer}
.oc-toggle>input{position:absolute;opacity:0;width:1px;height:1px}
.oc-toggle>i{position:relative;width:42px;height:24px;border-radius:99px;background:var(--line,#ffffff33);transition:background .2s}
.oc-toggle>i::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .25s}
.oc-toggle>input:checked+i{background:var(--accent,#5b5bf6)}
.oc-toggle>input:checked+i::after{transform:translateX(18px)}
@media (prefers-reduced-motion:reduce){.oc-tabs *,.oc-acc *{animation:none!important}}`;

// what the model reads (the main prompt and the section agents)
export const INTERACTIVE_DOC = `Interactive controls WITHOUT JavaScript (scripts never run on these pages — a <button> that should switch, filter or open something does NOTHING; use these patterns, their CSS is added automatically):
- Tabs, filters, segmented switches ("All · Code · Math", monthly/yearly prices, menu categories): <div class="oc-tabs"><input type="radio" name="UNIQUE" id="UNIQUE-1" checked><label for="UNIQUE-1">All</label><input type="radio" name="UNIQUE" id="UNIQUE-2"><label for="UNIQUE-2">Code</label><div class="oc-panels"><div>…content for All…</div><div>…content for Code…</div></div></div> — radios and labels alternate as direct children, then ONE .oc-panels with one child per tab in the same order (up to 8); every panel holds real, different content; ids/names unique on the page.
- FAQ / accordions: <details class="oc-acc"><summary>Question</summary><p>Answer</p></details>.
- On/off switches: <label class="oc-toggle"><input type="checkbox"><i></i> Label</label>.
- Navigation buttons and links go to a section of the page: <a href="#pricing" class="btn">…</a> with id="pricing" on that section. Never leave a button that does nothing.`;

export function withInteractive(code){
  const s = String(code);
  if (!/class=["'][^"']*\boc-(tabs|acc|toggle)\b/.test(s) || s.includes('.oc-tabs>input')) return s;
  return `<style>${INTERACTIVE_CSS}</style>` + s;
}
