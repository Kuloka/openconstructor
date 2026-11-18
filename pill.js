// Round segmented switch with a sliding thumb: one light "pill" glides under the chosen button (springy, measured
// from the real button, so labels of any width work). Used by every mode switch: Build · Code · Chat.
//   pill(el)                 the thumb sits under the button with aria-pressed / aria-selected = true or class "on"
//   pill(el, { hover: true }) a navigation row: the thumb follows the pointer and fades out when it leaves
// The thumb is el's first child <i class="pill-thumb">; React renders it itself, plain DOM gets one added.
export function pill(el, { hover = false } = {}){
  if (!el || el._pill) return;
  el._pill = true;
  el.classList.add('pill');
  if (hover) el.classList.add('pill-hover');
  let thumb = el.querySelector(':scope > .pill-thumb');
  if (!thumb) { thumb = document.createElement('i'); thumb.className = 'pill-thumb'; thumb.setAttribute('aria-hidden', 'true'); el.prepend(thumb); }
  const buttons = () => [...el.querySelectorAll(':scope > button, :scope > a')];
  const isOn = b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' || b.classList.contains('on');
  let placed = false, target = null;
  const place = b => {
    if (!b || !b.offsetWidth) { thumb.style.opacity = '0'; placed = false; return; }
    const jump = !placed; // the first time (or after hiding) it appears in place instead of flying in from the edge
    if (jump) thumb.style.transition = 'none';
    thumb.style.width = b.offsetWidth + 'px';
    thumb.style.height = b.offsetHeight + 'px';
    thumb.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
    thumb.style.opacity = '1';
    if (jump) { void thumb.offsetWidth; thumb.style.transition = ''; }
    placed = true;
  };
  const sync = () => place(hover ? target : buttons().find(isOn));
  if (hover) {
    el.addEventListener('pointerover', e => { const b = e.target.closest('button, a'); if (b && b.parentElement === el) { target = b; sync(); } });
    el.addEventListener('pointerleave', () => { target = null; thumb.style.opacity = '0'; setTimeout(() => { if (!target) placed = false; }, 200); });
  } else {
    new MutationObserver(sync).observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class'] });
  }
  new ResizeObserver(sync).observe(el);
  document.fonts?.ready.then(sync);
  sync();
}
