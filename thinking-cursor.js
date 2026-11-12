// While the AI works and the chat is not on screen, a small pill with the logo
// follows the mouse: what the AI is doing ("thinking", "coding"…) and for how long.
// It reads the live "thinking" message in the chat, so it never disagrees with it.
import { LOGO_THINK } from './chat-ui.js';

const pill = document.createElement('div');
pill.className = 'th-cursor';
pill.setAttribute('aria-hidden', 'true');
pill.innerHTML = `${LOGO_THINK}<span class="th-cursor-text"></span><span class="th-cursor-time"></span>`;
document.body.append(pill);
const text = pill.querySelector('.th-cursor-text'), time = pill.querySelector('.th-cursor-time');

let x = -1, y = -1, shown = false, raf = 0;
const chat = () => document.getElementById('chatPanel');
const chatVisible = () => { const c = chat(); if (!c) return false; const r = c.getBoundingClientRect(); return r.width > 40 && r.height > 40 && c.offsetParent !== null; };
const working = () => document.querySelector('#messages .message.thinking:not(.folded)');

function place(){
  raf = 0;
  const w = pill.offsetWidth, h = pill.offsetHeight;
  const px = Math.min(innerWidth - w - 8, x + 16), py = Math.min(innerHeight - h - 8, y + 18);
  pill.style.transform = `translate(${Math.max(8, px)}px, ${Math.max(8, py)}px)`;
}
addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; x = e.clientX; y = e.clientY; if (shown && !raf) raf = requestAnimationFrame(place); }, { passive: true });

setInterval(() => {
  const node = working();
  const want = !!node && x >= 0 && !chatVisible() && !document.body.classList.contains('mobile');
  if (want) {
    text.textContent = node.querySelector('.th-title')?.textContent.trim() || 'thinking';
    time.textContent = node.querySelector('.th-time')?.textContent || '';
    if (!shown) place();
  }
  if (want !== shown) { shown = want; pill.classList.toggle('on', want); }
}, 200);
