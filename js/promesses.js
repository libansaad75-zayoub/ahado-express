// Bande parcours: intro on scroll, then pointer-controlled marker.
// The marker position is written to CSS variables so motion stays on transform.
export function initPromesses() {
  const sec = document.querySelector('.promesses');
  if (!sec) return;
  const route = sec.querySelector('.route');
  const svg = sec.querySelector('.routesvg');
  const path = sec.querySelector('.routesvg .path');
  const marker = sec.querySelector('.moto-marker');
  if (!route || !svg || !path || !marker) return;

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let total = path.getTotalLength();
  let introDone = false;
  let raf = 0;
  let scrub = false;
  let target = 0;
  let current = 0;
  let pointerRaf = 0;

  const isRtl = () => document.body.dir === 'rtl';
  const startFrac = () => (isRtl() ? 1 : 0);
  const endFrac = () => (isRtl() ? 0 : 1);

  function place(frac) {
    const safeFrac = Math.max(0, Math.min(1, frac));
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const pt = path.getPointAtLength(total * safeFrac);
    marker.style.setProperty('--moto-x', `${(pt.x / 1180) * rect.width}px`);
    marker.style.setProperty('--moto-y', `${(pt.y / 240) * rect.height}px`);
  }

  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function intro() {
    if (introDone) return;
    introDone = true;
    sec.classList.add('in');
    if (reduce) {
      current = endFrac();
      place(current);
      return;
    }

    const from = startFrac();
    const to = endFrac();
    const duration = 1650;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / duration);
      current = from + (to - from) * easeOutCubic(p);
      place(current);
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intro();
        io.disconnect();
      }
    });
  }, { threshold: 0.28 });

  place(startFrac());
  io.observe(sec);

  function loop() {
    current += (target - current) * (reduce ? 1 : 0.18);
    place(current);
    if (scrub) pointerRaf = requestAnimationFrame(loop);
  }

  function fracFromPointer(event) {
    const rect = route.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return isRtl() ? 1 - x : x;
  }

  route.addEventListener('pointerenter', (event) => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(pointerRaf);
    target = fracFromPointer(event);
    scrub = true;
    loop();
  });
  route.addEventListener('pointermove', (event) => {
    target = fracFromPointer(event);
  });
  route.addEventListener('pointerleave', () => {
    scrub = false;
    cancelAnimationFrame(pointerRaf);
  });

  function recompute() {
    total = path.getTotalLength();
    current = scrub ? current : (introDone ? endFrac() : startFrac());
    place(current);
  }

  window.addEventListener('resize', recompute);
  window.addEventListener('ahado:langchange', recompute);
}
