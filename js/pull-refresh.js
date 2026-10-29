/* Pull down from the top of the screen to refresh the app (phones and tablets). */
(function () {
  const TH = 72, MAX = 120;
  let startY = 0, startX = 0, pull = 0, active = false, busy = false;
  const ind = document.createElement('div');
  ind.id = 'ptr';
  ind.innerHTML = '<div class="ptr-ball"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg></div>';
  const css = document.createElement('style');
  css.textContent = '#ptr{position:fixed;left:50%;top:0;z-index:9998;pointer-events:none;transform:translate(-50%,-60px);transition:transform .25s cubic-bezier(.2,.8,.2,1),opacity .2s;opacity:0}'
    + '#ptr.drag{transition:none}#ptr .ptr-ball{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--card,var(--surface,#1B3459));color:var(--primary,var(--royal,#F5B942));box-shadow:0 8px 22px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14)}'
    + '#ptr svg{width:20px;height:20px}#ptr.ready svg{color:var(--primary,var(--royal,#F5B942))}#ptr.busy svg{animation:ptrspin .8s linear infinite}@keyframes ptrspin{to{transform:rotate(360deg)}}';
  document.head.appendChild(css);
  const mount = () => document.body && !ind.isConnected && document.body.appendChild(ind);
  const blocked = (t) => {
    if (typeof window.ptrBlocked === 'function' && window.ptrBlocked()) return true;
    if (busy || window.scrollY > 0 || document.scrollingElement && document.scrollingElement.scrollTop > 0) return true;
    // not while a window, the scanner, a form field or a scrolled list is in use
    if (document.querySelector('.modal-overlay, .modal-bg, #noti-root, .scan-overlay, .scanner-overlay, .gal-viewer, .np-full')) return true;
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return true;
    for (let el = t; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop > 0) return true;
      if (el.id === 'chat-list' || el.classList && el.classList.contains('matrix')) return true;
    }
    return false;
  };
  const show = (d) => {
    ind.classList.add('drag'); ind.style.opacity = Math.min(1, d / TH);
    ind.style.transform = `translate(-50%, ${Math.min(d, MAX) * .6 - 10}px) rotate(${d * 3}deg)`;
    ind.classList.toggle('ready', d >= TH);
  };
  const hide = () => { ind.classList.remove('drag', 'ready'); ind.style.opacity = 0; ind.style.transform = 'translate(-50%,-60px)'; };
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return; mount();
    active = !blocked(e.target); pull = 0;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || window.scrollY > 0) { if (pull) hide(); pull = 0; return; }
    pull = dy * .55; show(pull);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (!active) return; active = false;
    if (pull >= TH) {
      busy = true; ind.classList.remove('drag'); ind.classList.add('busy'); ind.style.opacity = 1; ind.style.transform = 'translate(-50%, 34px)';
      setTimeout(() => location.reload(), 350);
    } else hide();
    pull = 0;
  }, { passive: true });
  addEventListener('touchcancel', () => { active = false; pull = 0; hide(); }, { passive: true });
})();
