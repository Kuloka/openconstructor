// Mini-apps: elements with working JavaScript (calculators, quizzes, trackers, timers, small games).
// An app element is an item with `app: true`. Its frame runs scripts but has an opaque origin
// (sandbox without allow-same-origin) and no network (CSP connect-src falls back to 'none'),
// so an app can't read openconstructor.pw cookies or storage and can't send data anywhere.
// Published pages that contain an app get the same rules from worker.js (APP_HEADERS).

export const APP_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:">`;

// localStorage throws on an opaque origin: give apps an in-memory stand-in so they don't crash
export const APP_SHIM = `<script>(function(){try{localStorage.getItem('oc')}catch(e){var m={},s={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};['localStorage','sessionStorage'].forEach(function(n){try{Object.defineProperty(window,n,{value:s,configurable:true})}catch(x){}})}})();</script>`;

// Script errors are reported to the editor. This sits in <head>: the app's own script runs before anything placed after it.
// Also reports "silent" bugs: NaN / undefined / [object Object] showing up on screen after the app renders or a click.
export const APP_ERR = `<script>(function(){var sent={};function fail(m,l){m=String(m||'script error').slice(0,200);if(sent[m])return;sent[m]=1;parent.postMessage({ocApp:1,error:m,line:+l||0},'*')}addEventListener('error',function(e){fail(e.message,e.lineno)});addEventListener('unhandledrejection',function(e){fail(e.reason&&e.reason.message||e.reason)});var t=0;function look(){clearTimeout(t);t=setTimeout(function(){var s=document.body&&document.body.innerText||'',m=s.match(/(^|[^\\w])(NaN|undefined|\\[object Object\\])([^\\w]|$)/);if(m)fail('the screen shows "'+m[2]+'" (a value is missing or not a number)')},400)}addEventListener('load',look);addEventListener('click',look,true);addEventListener('input',look,true);addEventListener('keyup',look,true)})();</script>`;
// Inside the canvas frame: report the size to the editor
const REPORT = `<script>(function(){var r=document.getElementById('__root');function send(){var b=r.getBoundingClientRect();parent.postMessage({ocApp:1,w:Math.ceil(Math.max(b.width,r.scrollWidth)),h:Math.ceil(Math.max(b.height,r.scrollHeight))},'*')}new ResizeObserver(send).observe(r);addEventListener('load',send);send()})();</script>`;

// The canvas document for an app element (same box rules as studio.js nodeDoc)
export function appDoc(code, { full, w, pad, color, theme = '' }){
  const root = full ? `width:${w}px;padding:0` : `width:max-content;max-width:${w - 2 * pad}px;padding:${pad}px`;
  return `<!doctype html><html><head>${APP_CSP}<meta name="color-scheme" content="dark">${APP_SHIM}${APP_ERR}<style>:root{color-scheme:dark}html,body{margin:0;background:transparent;color:${color};font-family:system-ui;overflow:hidden}button{white-space:nowrap}#__root{display:inline-block;box-sizing:border-box;${root}}</style>${theme ? `<style>${theme}</style>` : ''}</head><body><div id="__root">${code}</div>${REPORT}</body></html>`;
}

// A standalone preview (welcome cards, variant pickers): the app centered on a dark card
export function appPreview(code, bg = '#0c0a09'){
  return `<!doctype html><html><head>${APP_CSP}${APP_SHIM}<style>:root{color-scheme:dark}html,body{margin:0;height:100%;overflow:hidden;background:${bg};color:#eee;font-family:system-ui}body{display:grid;place-items:center}</style></head><body><div>${code}</div></body></html>`;
}

// Marks an exported/published page as containing apps (worker.js turns scripts on for it)
export function withAppHead(html){
  if (/<meta name="oc-app"/.test(html)) return html;
  return html.replace(/<head>/i, `<head><meta name="oc-app" content="1">${APP_SHIM}`);
}

// What the AI is told in app mode (replaces the "no JavaScript" rule)
export const APP_RULES = `- APP MODE: build a WORKING mini-app, not a static mock-up — a calculator, converter, quiz, tracker, planner, timer, generator, list, small game or tool that really does its job. Same answer format: the header, then ONE \`\`\`html block with exactly three parts in this order: <style>…</style>, the markup, <script>…</script>.
  · Thinking: plan in a few short sentences only. NEVER write or rehearse the code in your reasoning — the code goes only into the answer, once.
  · Skeleton to follow (replace xx with your own 2-3 letter prefix and use it for EVERY class):
    <style>
    .xx-app{--bg:#111318;--panel:#1a1d24;--line:#ffffff1a;--text:#f2f4f7;--muted:#9aa3af;--accent:#e8875c;width:min(100%,400px);box-sizing:border-box;padding:20px;border-radius:16px;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}
    .xx-app *{box-sizing:border-box;font:inherit}
    </style>
    <div class="xx-app">…</div>
    <script>
    (() => {
      const root = document.querySelector('.xx-app');
      const $ = s => root.querySelector(s);
      const state = { … };
      function render(){ … }
      root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; … render(); });
      render();
    })();
    </script>
  · Code rules (each one prevents a common bug):
    – one state object and one render() that updates the screen from it; after every change call render();
    – attach events in the script (addEventListener on root with data-act / data-id attributes, or on elements found with $). NEVER onclick="…" attributes in the markup: functions inside the script are not global, such buttons do nothing;
    – look elements up only inside root, by class or data- attribute (no ids, no document.getElementById); every selector the script uses must exist in the markup you wrote;
    – numbers from inputs: parseFloat(String(v).replace(',', '.')), then guard NaN, empty input and division by zero — show a readable message in the UI, never NaN, undefined or Infinity;
    – calculators: keep the current value, the previous value and the pending operator in state and compute in a function; round results to 10 significant digits; support chained operations, one decimal point, clear, backspace, percent, sign change and the keyboard (digits, operators, Enter, Backspace, Escape);
    – text typed by the user goes in with textContent, never glued into innerHTML;
    – save data in localStorage under one unique key inside try/catch and load it at start;
    – plain modern JavaScript: const/let, arrow functions, ===, semicolons. No frameworks, imports, external files, CDNs; no fetch/XHR/WebSocket (the network is blocked); no alert/confirm/prompt (blocked) — messages and confirmations are shown inside the UI;
    – finish everything: no TODOs, no "…" placeholders, no empty handlers, every button does its job. Before you end, check that every { ( [ and quote is closed and that the answer ends with })(); </script> and the closing \`\`\`.
  · Design rules:
    – a card or app shell on --bg with 16-20px padding and radius 16px; inner panels on --panel with a 1px --line border; controls radius 10-12px; spacing only from 4/8/12/16/24px; layout with flex/grid and gap (never absolute positioning for layout);
    – type scale: labels 12px in --muted, body 14-15px, values 20-24px, the main number or result 32-44px weight 700 with font-variant-numeric:tabular-nums; long numbers must not break the layout (overflow:hidden with text-overflow, or shrink the font);
    – ONE accent colour for the primary action and active states, everything else neutral; text contrast at least 4.5:1; on a light page use a light palette (--bg:#ffffff;--panel:#f4f5f7;--line:#0000001a;--text:#16181d;--muted:#6b7280);
    – buttons and inputs at least 40px tall, cursor:pointer, visible :hover, :active (transform:scale(.97)) and :focus-visible (2px accent outline) states, transition .15s; keypads are display:grid with equal columns and gap 8px, the operator and equals keys in the accent;
    – width:min(100%,400px) for a widget (480px at most) and it must still look right at 320px; "full": false. Use "full": true only for a dashboard-style app: width:100% with a centred max-width container;
    – start with realistic sample data so it looks alive at once; empty states get a short hint; numbers through Intl.NumberFormat, dates readable;
    – no emoji anywhere (not in texts, buttons or as icons) — icons are inline SVG with stroke="currentColor" or plain CSS shapes.
  · Format: CSS one rule per line, JS one statement per line with 2-space indentation, no comments. Aim for 120-220 lines in total so the answer is finished within the limit.
  · When updating an app, return the WHOLE app (style, markup and script) with the change applied and everything else working as before.
  · "reply": one short line — what the app does and that ▶ play (or the published page) lets you use it.`;

// Ready-made apps: the welcome screen shows them running; "open" puts one on the canvas
// Readable layout for the built-in examples below (trusted code: no regex or template literals in them)
function tidy(src, css){
  let out = '', depth = 0, par = 0, q = '';
  const nl = () => { out = out.replace(/[ \t]+$/, ''); if (!out.endsWith('\n')) out += '\n'; out += '  '.repeat(Math.max(0, depth)); };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { out += ch; if (ch === '\\') out += src[++i]; else if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '(' || ch === '[') par++; else if (ch === ')' || ch === ']') par--;
    if (par) { out += ch; continue; }
    if (css) { out += ch; if (ch === '{') depth++; else if (ch === '}' && --depth === 0) nl(); continue; }
    if (ch === '{') { depth++; out += '{'; nl(); }
    else if (ch === '}') { depth--; nl(); out += '}'; if (!/[,;)]/.test(src[i + 1] || ';')) nl(); }
    else if (ch === ';') { out += ';'; if (src[i + 1] !== '}') nl(); }
    else out += ch;
  }
  return out.trim();
}
function formatApp(code){
  const css = (code.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '', js = (code.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  const html = code.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/, '').trim().replace(/></g, '>\n<');
  const body = js.match(/^\(\(\)=>\{([\s\S]*)\}\)\(\);?$/);
  const script = body ? '(() => {\n' + tidy(body[1]).split('\n').map(l => '  ' + l).join('\n') + '\n})();' : js;
  return `<style>\n${tidy(css, true)}\n</style>\n${html}\n<script>\n${script}\n</script>`;
}
const RAW_EXAMPLES = [
  {
    id: 'tip', name: 'Tip & split calculator', prompt: 'A tip and bill-splitting calculator: bill, tip %, number of people, total per person',
    code: `<style>.tp-app{width:340px;max-width:100%;box-sizing:border-box;padding:22px;border-radius:22px;background:linear-gradient(160deg,#1c1714,#120f0d);border:1px solid #ffffff14;color:#f4ece7;font:15px/1.4 system-ui;box-shadow:0 30px 60px -30px #000}.tp-app h3{margin:0 0 14px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#a8958a}.tp-f{display:grid;gap:6px;margin-bottom:14px}.tp-f label{font-size:12px;color:#a8958a}.tp-f input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid #ffffff1a;background:#0b0908;color:inherit;font:600 18px system-ui;outline:none;transition:border-color .2s}.tp-f input:focus{border-color:#e8875c}.tp-chips{display:flex;gap:6px}.tp-chips button{flex:1;padding:9px 0;border-radius:10px;border:1px solid #ffffff1a;background:#0b0908;color:#d9c9bf;font:600 14px system-ui;cursor:pointer;transition:all .18s}.tp-chips button:hover{border-color:#e8875c88}.tp-chips button.on{background:#e8875c;border-color:#e8875c;color:#1a0f0a}.tp-res{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}.tp-res div{padding:14px;border-radius:14px;background:#e8875c14;border:1px solid #e8875c33}.tp-res small{display:block;font-size:11px;color:#c9a48f;text-transform:uppercase;letter-spacing:.1em}.tp-res b{display:block;margin-top:4px;font-size:24px;transition:transform .2s}.tp-res b.pop{transform:scale(1.08)}</style>
<div class="tp-app"><h3>Split the bill</h3><div class="tp-f"><label>Bill</label><input class="tp-bill" inputmode="decimal" value="86.40"></div><div class="tp-f"><label>Tip</label><div class="tp-chips"><button>10%</button><button class="on">15%</button><button>20%</button><button>25%</button></div></div><div class="tp-f"><label>People</label><input class="tp-ppl" inputmode="numeric" value="3"></div><div class="tp-res"><div><small>Tip / person</small><b class="tp-t">—</b></div><div><small>Total / person</small><b class="tp-p">—</b></div></div></div>
<script>(()=>{const r=document.querySelector('.tp-app'),$=s=>r.querySelector(s),f=new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'});let tip=15;const calc=()=>{const b=parseFloat($('.tp-bill').value.replace(',','.'))||0,p=Math.max(1,parseInt($('.tp-ppl').value)||1),t=b*tip/100;[[$('.tp-t'),t/p],[$('.tp-p'),(b+t)/p]].forEach(([el,v])=>{el.textContent=f.format(v);el.classList.add('pop');setTimeout(()=>el.classList.remove('pop'),180)})};r.querySelectorAll('.tp-chips button').forEach(b=>b.onclick=()=>{r.querySelectorAll('.tp-chips button').forEach(x=>x.classList.toggle('on',x===b));tip=parseInt(b.textContent);calc()});r.querySelectorAll('input').forEach(i=>i.oninput=calc);calc()})();</script>`,
  },
  {
    id: 'habits', name: 'Habit tracker', prompt: 'A habit tracker: my habits for the week, tick the days, streaks and progress',
    code: `<style>.hb-app{width:360px;max-width:100%;box-sizing:border-box;padding:20px;border-radius:22px;background:#101418;border:1px solid #ffffff12;color:#e8eef3;font:14px/1.4 system-ui;box-shadow:0 30px 60px -30px #000}.hb-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}.hb-top h3{margin:0;font-size:18px}.hb-top span{font-size:12px;color:#7c8b97}.hb-bar{height:6px;border-radius:9px;background:#ffffff10;overflow:hidden;margin-bottom:16px}.hb-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#34d399,#22d3ee);transition:width .35s}.hb-row{display:grid;grid-template-columns:1fr repeat(7,26px);gap:5px;align-items:center;margin-bottom:8px}.hb-row.hd{font-size:10px;color:#6b7a86;text-align:center}.hb-row.hd span:first-child{text-align:left}.hb-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hb-name em{font-style:normal;font-size:10px;color:#34d399;margin-left:6px;padding:1px 5px;border:1px solid #34d39955;border-radius:5px}.hb-d{width:26px;height:26px;border-radius:8px;border:1px solid #ffffff18;background:#0a0d10;cursor:pointer;transition:all .18s}.hb-d:hover{border-color:#34d39988}.hb-d.on{background:#34d399;border-color:#34d399;box-shadow:0 0 14px #34d39966}.hb-add{display:flex;gap:6px;margin-top:12px}.hb-add input{flex:1;min-width:0;padding:9px 11px;border-radius:10px;border:1px solid #ffffff18;background:#0a0d10;color:inherit;font:inherit;outline:none}.hb-add input:focus{border-color:#34d399}.hb-add button{padding:0 14px;border-radius:10px;border:0;background:#34d399;color:#06281c;font:700 13px system-ui;cursor:pointer}</style>
<div class="hb-app"><div class="hb-top"><h3>This week</h3><span class="hb-pct">0%</span></div><div class="hb-bar"><i></i></div><div class="hb-row hd"><span>habit</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="hb-list"></div><form class="hb-add"><input placeholder="New habit…" maxlength="24"><button>Add</button></form></div>
<script>(()=>{const r=document.querySelector('.hb-app'),K='oc-hb-v1';let d;try{d=JSON.parse(localStorage.getItem(K))}catch(e){}d=d||[{n:'Read 20 min',w:[1,1,0,1,1,0,0]},{n:'Workout',w:[1,0,1,0,1,0,0]},{n:'No phone in bed',w:[0,1,1,1,0,0,0]}];const save=()=>{try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}},streak=w=>{let s=0;for(const v of w){s=v?s+1:0}return s},draw=()=>{const L=r.querySelector('.hb-list');L.innerHTML='';let on=0;d.forEach((h,i)=>{const row=document.createElement('div');row.className='hb-row';const s=streak(h.w);row.innerHTML='<span class="hb-name"></span>'+h.w.map((v,j)=>'<button class="hb-d'+(v?' on':'')+'" data-i="'+i+'" data-j="'+j+'" aria-label="day '+(j+1)+'"></button>').join('');row.firstChild.textContent=h.n;if(s>1)row.firstChild.insertAdjacentHTML('beforeend','<em>'+s+'d</em>');L.append(row);on+=h.w.filter(Boolean).length});const p=d.length?Math.round(on/(d.length*7)*100):0;r.querySelector('.hb-pct').textContent=p+'% done';r.querySelector('.hb-bar i').style.width=p+'%'};r.querySelector('.hb-list').onclick=e=>{const b=e.target.closest('.hb-d');if(!b)return;const h=d[b.dataset.i];h.w[b.dataset.j]=h.w[b.dataset.j]?0:1;save();draw()};r.querySelector('.hb-add').onsubmit=e=>{e.preventDefault();const i=e.target.querySelector('input'),v=i.value.trim();if(!v)return;d.push({n:v,w:[0,0,0,0,0,0,0]});i.value='';save();draw()};draw()})();</script>`,
  },
  {
    id: 'focus', name: 'Focus timer', prompt: 'A pomodoro focus timer with a progress ring, work and break modes and a session counter',
    code: `<style>.fo-app{width:320px;max-width:100%;box-sizing:border-box;padding:22px;border-radius:24px;background:radial-gradient(120% 90% at 50% 0%,#2a1b3d,#120d1a 70%);border:1px solid #ffffff14;color:#efe9f7;font:14px/1.4 system-ui;text-align:center;box-shadow:0 30px 60px -30px #000}.fo-modes{display:inline-flex;padding:4px;border-radius:12px;background:#ffffff0d;margin-bottom:16px}.fo-modes button{padding:7px 14px;border:0;border-radius:9px;background:none;color:#b7a9c9;font:600 13px system-ui;cursor:pointer;transition:all .2s}.fo-modes button.on{background:#a78bfa;color:#1b1029}.fo-ring{position:relative;width:200px;height:200px;margin:0 auto 16px}.fo-ring svg{transform:rotate(-90deg)}.fo-ring circle{fill:none;stroke-width:10}.fo-bg{stroke:#ffffff10}.fo-fg{stroke:url(#fo-g);stroke-linecap:round;transition:stroke-dashoffset .5s linear}.fo-time{position:absolute;inset:0;display:grid;place-content:center}.fo-time b{font:700 44px/1 ui-monospace,monospace;letter-spacing:-.02em}.fo-time small{color:#a594bd;margin-top:6px}.fo-btns{display:flex;gap:8px;justify-content:center}.fo-btns button{padding:11px 20px;border-radius:12px;border:1px solid #ffffff1c;background:#ffffff0a;color:inherit;font:700 14px system-ui;cursor:pointer;transition:transform .15s}.fo-btns button:active{transform:scale(.96)}.fo-btns .fo-go{background:#a78bfa;border-color:#a78bfa;color:#1b1029;min-width:110px}.fo-dots{margin-top:14px;color:#a594bd;font-size:12px}</style>
<div class="fo-app"><div class="fo-modes"><button class="on" data-m="25">Focus</button><button data-m="5">Break</button></div><div class="fo-ring"><svg viewBox="0 0 200 200" width="200" height="200"><defs><linearGradient id="fo-g"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f0abfc"/></linearGradient></defs><circle class="fo-bg" cx="100" cy="100" r="88"/><circle class="fo-fg" cx="100" cy="100" r="88"/></svg><div class="fo-time"><b>25:00</b><small>stay with it</small></div></div><div class="fo-btns"><button class="fo-go">Start</button><button class="fo-rs">Reset</button></div><div class="fo-dots">sessions today: <span>0</span></div></div>
<script>(()=>{const r=document.querySelector('.fo-app'),$=s=>r.querySelector(s),C=2*Math.PI*88,fg=$('.fo-fg');fg.style.strokeDasharray=C;let total=1500,left=1500,t=null,n=0;const draw=()=>{$('.fo-time b').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');fg.style.strokeDashoffset=C*(1-left/total)},stop=()=>{clearInterval(t);t=null;$('.fo-go').textContent='Start'},set=m=>{stop();total=left=m*60;draw()};$('.fo-go').onclick=()=>{if(t)return stop();$('.fo-go').textContent='Pause';t=setInterval(()=>{left--;if(left<=0){stop();if(total===1500){n++;$('.fo-dots span').textContent=n}left=total;$('.fo-time small').textContent='done! take a breath'}draw()},1000)};$('.fo-rs').onclick=()=>set(total/60);r.querySelectorAll('.fo-modes button').forEach(b=>b.onclick=()=>{r.querySelectorAll('.fo-modes button').forEach(x=>x.classList.toggle('on',x===b));$('.fo-time small').textContent=b.dataset.m==='25'?'stay with it':'stretch, drink water';set(+b.dataset.m)});draw()})();</script>`,
  },
  {
    id: 'quiz', name: 'Personality quiz', prompt: 'A short quiz "Which coffee are you?" with 3 questions, animated answers and a result card',
    code: `<style>.qz-app{width:350px;max-width:100%;box-sizing:border-box;padding:22px;border-radius:22px;background:linear-gradient(170deg,#fff7ed,#ffedd5);color:#3b2314;font:14px/1.45 system-ui;box-shadow:0 30px 60px -30px #000}.qz-step{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b4693a;margin-bottom:6px}.qz-q{margin:0 0 14px;font-size:19px;line-height:1.25}.qz-a{display:grid;gap:8px}.qz-a button{text-align:left;padding:12px 14px;border-radius:14px;border:1px solid #f0c8a6;background:#fffaf5;color:inherit;font:600 14px system-ui;cursor:pointer;transition:transform .15s,background .15s,border-color .15s}.qz-a button:hover{transform:translateX(4px);border-color:#e8875c;background:#fff}.qz-res{text-align:center;animation:qz-in .35s ease-out}.qz-res .e{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#3b2314;color:#fff7ed;font:700 20px ui-monospace,monospace}.qz-res h3{margin:6px 0 4px;font-size:22px}.qz-res p{margin:0 0 14px;color:#7a4a2c}.qz-res button{padding:10px 18px;border-radius:12px;border:0;background:#3b2314;color:#fff7ed;font:700 13px system-ui;cursor:pointer}.qz-dots{display:flex;gap:5px;margin-top:14px}.qz-dots i{flex:1;height:4px;border-radius:4px;background:#f0c8a6;transition:background .3s}.qz-dots i.on{background:#e8875c}@keyframes qz-in{from{opacity:0;transform:scale(.95)}}</style>
<div class="qz-app"><div class="qz-body"></div><div class="qz-dots"><i></i><i></i><i></i></div></div>
<script>(()=>{const r=document.querySelector('.qz-app'),Q=[['Your ideal morning?',[['Slow, with a book',0],['Out the door in 5 min',1],['Brunch with friends',2]]],['Pick a weekend plan',[['Cozy café corner',0],['A new hiking trail',1],['A party till late',2]]],['Your work style?',[['Deep and calm',0],['Fast and focused',1],['Ideas and people',2]]]],R=[['FW','Flat white','Smooth, thoughtful and quietly brilliant.'],['DE','Double espresso','Short, strong, always on the move.'],['CL','Caramel latte','Warm, sweet and the life of the room.']];let i=0,s=[0,0,0];const b=r.querySelector('.qz-body'),dots=()=>r.querySelectorAll('.qz-dots i').forEach((d,k)=>d.classList.toggle('on',k<i)),show=()=>{dots();if(i>=Q.length){const w=s.indexOf(Math.max(...s)),x=R[w];b.innerHTML='<div class="qz-res"><div class="e">'+x[0]+'</div><div class="qz-step">you are a</div><h3>'+x[1]+'</h3><p>'+x[2]+'</p><button>Try again</button></div>';b.querySelector('button').onclick=()=>{i=0;s=[0,0,0];show()};return}const q=Q[i];b.innerHTML='<div class="qz-step">question '+(i+1)+' of '+Q.length+'</div><h3 class="qz-q"></h3><div class="qz-a"></div>';b.querySelector('.qz-q').textContent=q[0];q[1].forEach(([t,v])=>{const o=document.createElement('button');o.textContent=t;o.onclick=()=>{s[v]++;i++;show()};b.querySelector('.qz-a').append(o)})};show()})();</script>`,
  },
];
export const APP_EXAMPLES = RAW_EXAMPLES.map(x => ({ ...x, code: formatApp(x.code) }));
// One finished example closest to the request: small free models follow a sample far better than rules alone
export function appReference(text){
  const id = /quiz|test|survey|poll|квиз|викторин|тест|опрос/i.test(text) ? 'quiz'
    : /timer|clock|stopwatch|pomodoro|countdown|таймер|секундомер|отсч[её]т/i.test(text) ? 'focus'
    : /track|habit|todo|to-do|list|task|plan|note|трекер|привыч|список|задач|план|заметк/i.test(text) ? 'habits' : 'tip';
  return '\n\nReference app — the expected level of structure, polish and working logic. Do NOT copy its content, colours or layout; build what the request asks, in the language of the request:\n```html\n' + APP_EXAMPLES.find(x => x.id === id).code + '\n```';
}
