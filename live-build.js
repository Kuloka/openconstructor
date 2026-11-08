// "Watch it being built": a small browser window in the chat (and over the canvas) where the page the AI
// is writing is drawn live from the streamed HTML. Before any code arrives it shows a blueprint of a page
// assembling itself; then real sections appear one by one, the view follows the newest one, and a glowing
// "print head" runs along the bottom edge of what's drawn so far.
// The preview iframe is sandboxed without scripts; unfinished tags and media tokens are cleaned up first.
const PIX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const BASE = 'html,body{margin:0}*,*::before,*::after{animation:none!important;transition:none!important}img,video{background:linear-gradient(135deg,#ffffff1f,#ffffff08);color:transparent}';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The part of the streamed HTML that can be drawn right now, or null while the styles are still being written
export function drawable(code){
  let s = String(code || '');
  const lt = s.lastIndexOf('<'), gt = s.lastIndexOf('>');
  if (lt > gt) s = s.slice(0, lt); // an unfinished tag at the very end
  const open = s.toLowerCase().lastIndexOf('<style'), close = s.toLowerCase().lastIndexOf('</style>');
  if (open > close) return null; // inside <style>: wait until it's complete, unstyled markup looks broken
  s = s.replace(/(\bsrc\s*=\s*["'])(?:photo|art|attachment|kept):[^"']*/gi, '$1' + PIX)
    .replace(/url\(\s*(['"]?)(?:photo|art|attachment|kept):[^)'"]*\1\s*\)/gi, 'none')
    .replace(/<script[\s\S]*?(<\/script>|$)/gi, '');
  return /<(?!style\b)[a-z]/i.test(s.replace(/<style[\s\S]*?<\/style>/gi, '')) ? s : null;
}

export function liveBuild({ width = 1280, big = false } = {}){
  const el = document.createElement('div');
  el.className = 'lb' + (big ? ' lb-big' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="lb-bar"><i></i><i></i><i></i><span class="lb-label">blueprint</span></div>
    <div class="lb-view">
      <div class="lb-bp"><b class="bp-nav"></b><b class="bp-hero"><b class="bp-t1"></b><b class="bp-t2"></b><b class="bp-btn"></b></b><b class="bp-row"><b></b><b></b><b></b></b></div>
      <iframe sandbox="allow-same-origin" tabindex="-1" title="live preview"></iframe>
      <span class="lb-head"></span>
    </div>`;
  const view = el.querySelector('.lb-view'), frame = el.querySelector('iframe'), head = el.querySelector('.lb-head'), label = el.querySelector('.lb-label');
  let ready = false, pending = null, last = '', timer = 0, gone = false;
  frame.srcdoc = `<!doctype html><html><head><style>${BASE}</style></head><body></body></html>`;
  frame.onload = () => { ready = true; if (pending != null) paint(); };

  const fit = () => {
    const w = view.clientWidth || 300, k = w / width;
    frame.style.width = width + 'px';
    frame.style.height = Math.ceil(view.clientHeight / k) + 'px';
    frame.style.transform = `scale(${k})`;
    return k;
  };
  function paint(){
    timer = 0;
    if (gone || !ready || pending == null || pending === last) return;
    last = pending;
    const doc = frame.contentDocument; if (!doc?.body) return;
    doc.body.innerHTML = pending;
    el.classList.add('live');
    const k = fit();
    const sections = [...doc.body.children].filter(n => !/^(STYLE|SCRIPT|LINK)$/.test(n.tagName)).length;
    label.textContent = `building · ${sections} ${sections === 1 ? 'block' : 'blocks'}`;
    // follow the newest part; the print head sits on the bottom edge of what's drawn
    const total = doc.documentElement.scrollHeight, vh = view.clientHeight / k;
    const top = Math.max(0, total - vh);
    frame.contentWindow.scrollTo({ top, behavior: reduce() ? 'auto' : 'smooth' });
    head.style.top = Math.min(view.clientHeight - 2, (total - top) * k) + 'px';
  }
  return {
    el,
    // streamed code so far (throttled: the preview is re-drawn a few times a second)
    update(code){
      const s = drawable(code);
      if (s == null) { if (!el.classList.contains('live')) label.textContent = /<style/i.test(code) ? 'writing styles' : 'blueprint'; return; }
      pending = s;
      if (!timer) timer = setTimeout(paint, last ? 260 : 0);
    },
    // the finished code: draw it once more, complete, and stop the print head
    done(code){ if (code) { const s = drawable(code + '\n'); if (s) { pending = s; clearTimeout(timer); paint(); } } el.classList.add('done'); label.textContent = 'built'; },
    destroy(){ gone = true; clearTimeout(timer); el.remove(); },
  };
}
