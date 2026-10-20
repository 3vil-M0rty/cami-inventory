// Desktop only: the card under the mouse tilts slightly in 3D, following the pointer, and settles back
// when the mouse leaves it. One listener for the whole app (projects, inventory, orders, chantiers).
// Off on touch screens, small screens and « reduce motion » systems.

const CARDS = '.project-card, .item-card, .orders-page .order-card, .ch-card';
const MAX_DEG = 6;         // tilt of a ~360 px wide card; wider cards (order rows) tilt less
const EASE = 'cubic-bezier(.2, .7, .2, 1)';
const OTHER = 'box-shadow .2s, border-color .2s, background-color .2s'; // keep the cards' own hover transitions

export function initCardTilt() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const desktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)');
  let card = null; let raf = 0; let x = 0; let y = 0;

  const release = () => {
    if (!card) return;
    card.style.transition = `transform .5s ${EASE}, ${OTHER}`;
    card.style.transform = '';
    card = null;
  };

  const paint = () => {
    raf = 0;
    if (!card || !card.isConnected) { card = null; return; }
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = Math.min(Math.max((x - r.left) / r.width, 0), 1) - 0.5;  // −0.5 … 0.5
    const py = Math.min(Math.max((y - r.top) / r.height, 0), 1) - 0.5;
    const max = MAX_DEG * Math.min(1, 360 / r.width);
    card.style.transition = `transform .15s ease-out, ${OTHER}`;
    card.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-2px)`;
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !desktop.matches) { release(); return; }
    const el = e.target instanceof Element ? e.target.closest(CARDS) : null;
    if (el !== card) release();
    if (!el) return;
    card = el; x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) release(); }); // mouse left the window
  window.addEventListener('blur', release);
  window.addEventListener('scroll', release, { passive: true, capture: true });
}
