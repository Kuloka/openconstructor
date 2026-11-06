// Voluntary support. Donations are optional and unlock nothing.
// Configured in .env.local: VITE_DONATE_URL=... and/or VITE_CRYPTO_WALLETS=coin|network|address;...
import QRCode from 'qrcode';

const URL_ = (import.meta.env.VITE_DONATE_URL || '').trim();
const safeUrl = /^https:\/\//.test(URL_) ? URL_ : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Public receiving addresses only — never put a seed phrase or private key here.
const wallets = (import.meta.env.VITE_CRYPTO_WALLETS || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
  const [coin, network, address] = s.split('|').map(x => (x || '').trim());
  return { coin, network, address };
}).filter(w => w.coin && w.network && /^[A-Za-z0-9:_-]{20,120}$/.test(w.address));
const hasAny = safeUrl || wallets.length;

const cryptoHTML = wallets.map((w, i) => `<div class="wallet">
  <img class="wallet-qr" data-qr="${i}" alt="${esc(w.coin)} address QR code" width="96" height="96">
  <div class="wallet-info">
    <div class="wallet-coin">${esc(w.coin)} <span>${esc(w.network)}</span></div>
    <code class="wallet-addr">${esc(w.address)}</code>
    <button type="button" class="btn wallet-copy" data-copy="${i}">copy address</button>
    <div class="wallet-warn">Send ${esc(w.coin)} on ${esc(w.network)} only — transfers on other networks may be lost.</div>
  </div>
</div>`).join('');

const modal = document.createElement('div');
modal.className = 'modal hidden'; modal.id = 'donateModal';
modal.innerHTML = `<div class="modal-card donate-card">
  <div class="modal-head"><h2>support the project</h2><button class="btn icon" data-close="donateModal">×</button></div>
  <div class="donate-mark oc-logo" aria-hidden="true"></div>
  <p class="donate-lead">openconstructor is built by an independent developer.</p>
  <p class="muted">If it saves you time, you can support its development. Contributions keep the servers and AI running.</p>
  ${safeUrl ? `<a class="btn primary block donate-go" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">support with a card ↗</a>` : ''}
  ${wallets.length ? `<div class="auth-or">${safeUrl ? 'or with crypto' : 'crypto'}</div><div class="wallets">${cryptoHTML}</div>` : ''}
  ${hasAny ? '' : `<div class="auth-off">No support options configured yet. Add <code>VITE_DONATE_URL=https://…</code> and/or <code>VITE_CRYPTO_WALLETS=USDT|TRC-20|Txxx</code> to <b>.env.local</b> and restart <code>npm run dev</code>.</div>`}
  <p class="auth-legal">Donations are voluntary gifts: they don't unlock features and aren't refundable.</p>
</div>`;
document.body.append(modal);
modal.querySelector('[data-close]').onclick = () => modal.classList.add('hidden');
modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };

// QR codes are generated locally on first open
let qrDone = false;
async function drawQR(){
  if (qrDone) return; qrDone = true;
  for (const img of modal.querySelectorAll('[data-qr]')) {
    try { img.src = await QRCode.toDataURL(wallets[+img.dataset.qr].address, { margin: 1, width: 192, color: { dark: '#0c0a09', light: '#ffffff' } }); } catch {}
  }
}
modal.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const addr = wallets[+b.dataset.copy].address;
  try { await navigator.clipboard.writeText(addr); b.textContent = 'copied ✓'; }
  catch { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'selected — press Ctrl+C'; }
  setTimeout(() => b.textContent = 'copy address', 1800);
});

export const openDonate = () => { modal.classList.remove('hidden'); drawQR(); };

// Title bar button, next to the account
const btn = document.createElement('button');
btn.className = 'btn donate-btn'; btn.title = 'Support the project';
btn.textContent = 'support';
btn.onclick = openDonate;
document.querySelector('.tb-right').prepend(btn);

// One gentle note in the chat after the 10th successful generation — shown once
window.addEventListener('oc:generated', () => {
  let n = 0;
  try { n = +localStorage.getItem('oc-gen-count') || 0; localStorage.setItem('oc-gen-count', ++n); } catch {}
  if (n !== 10) return;
  const box = document.getElementById('messages'); if (!box) return;
  const m = document.createElement('div');
  m.className = 'message assistant donate-note';
  m.innerHTML = 'You have built 10 elements with openconstructor. If it helps your work, you can <button type="button">support the project</button>.';
  m.querySelector('button').onclick = openDonate;
  box.append(m); box.scrollTop = box.scrollHeight;
});
