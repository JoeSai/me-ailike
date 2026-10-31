// 代码侦探 · 共享交互 v1。零依赖。CD.init(root) 可对动态插入的内容重新初始化。
(() => {
  const fine = matchMedia('(pointer: fine)').matches, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('cd-js');

  // [data-roll]：把文字包成两行，悬停时上滚（样式在 cd.css）
  function roll(root) {
    root.querySelectorAll('[data-roll]:not([data-rolled])').forEach(el => {
      const t = el.textContent; el.dataset.rolled = '1'; el.setAttribute('aria-label', t.trim());
      el.innerHTML = `<span class="cd-roll"><span aria-hidden="true"></span><span aria-hidden="true"></span></span>`;
      el.querySelectorAll('.cd-roll > span').forEach(s => (s.textContent = t));
    });
  }

  // [data-reveal]：进入视口时淡入，同组错开
  let io;
  function reveal(root) {
    const els = [...root.querySelectorAll('[data-reveal]:not(.in):not([data-seen])')];
    if (!('IntersectionObserver' in window) || calm) return els.forEach(e => e.classList.add('in'));
    io ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -5% 0px' });
    els.forEach((e, i) => { e.dataset.seen = '1'; e.style.setProperty('--rd', `${(i % 5) * 60}ms`); io.observe(e); });
  }

  // [data-peek="图片地址"]：悬停时一张小图跟着鼠标
  let peek;
  function peeks(root) {
    if (!fine || calm) return;
    peek ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'cd-peek' });
    root.querySelectorAll('[data-peek]:not([data-peeked])').forEach(el => {
      el.dataset.peeked = '1';
      el.addEventListener('pointerenter', () => { peek.style.backgroundImage = `url("${el.dataset.peek}")`; peek.classList.add('on'); });
      el.addEventListener('pointerleave', () => peek.classList.remove('on'));
    });
  }
  addEventListener('pointermove', e => {
    if (peek && peek.classList.contains('on')) { peek.style.left = Math.min(e.clientX + 170, innerWidth - 130) + 'px'; peek.style.top = e.clientY + 'px'; }
  }, { passive: true });

  // 光标圈：慢半拍跟随，碰到链接变大变红
  function cursor() {
    if (!fine || calm) return;
    const c = document.body.appendChild(document.createElement('div')); c.className = 'cd-cursor';
    let x = 0, y = 0, tx = 0, ty = 0, started = false;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; if (!started) { x = tx; y = ty; started = true; c.classList.add('on'); } }, { passive: true });
    addEventListener('pointerover', e => c.classList.toggle('big', !!e.target.closest('a, button, [role=button], .cd-row')));
    document.documentElement.addEventListener('mouseleave', () => c.classList.remove('on'));
    document.documentElement.addEventListener('mouseenter', () => started && c.classList.add('on'));
    (function tick() { x += (tx - x) * .18; y += (ty - y) * .18; c.style.transform = `translate(${x}px, ${y}px)`; requestAnimationFrame(tick); })();
  }

  // [data-magnet]：靠近时被吸过来一点
  function magnets(root) {
    if (!fine || calm) return;
    root.querySelectorAll('[data-magnet]:not([data-magnetized])').forEach(el => {
      el.dataset.magnetized = '1';
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`; });
      el.addEventListener('pointerleave', () => { el.style.transition = 'transform .4s cubic-bezier(.3,1.6,.5,1)'; el.style.transform = ''; setTimeout(() => (el.style.transition = ''), 400); });
    });
  }

  function init(root = document) { roll(root); reveal(root); peeks(root); magnets(root); }
  window.CD = { init };
  const start = () => { init(); cursor(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
