(() => {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const pending = new Set();
  const running = new Map();
  let observer;
  let navigating = false;
  let resizeFrame = 0;
  let headerInset = 0;
  const bottomInset = 32;
  // Blocks enter the usable viewport below the sticky header. There is no
  // percentage threshold: even a card taller than the viewport can be revealed.
  function updateHeaderInset() {
    const header = document.querySelector('header');
    headerInset = Math.max(0, Math.ceil(header?.getBoundingClientRect().height || 0));
    headerInset = Math.min(headerInset, Math.max(0, innerHeight - bottomInset - 80));
  }
  function inZone(element) {
    if (!element.isConnected || !element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > headerInset && rect.top < innerHeight - bottomInset;
  }
  function finish(element) {
    const timer = running.get(element);
    if (timer !== undefined) clearTimeout(timer);
    running.delete(element);
    element.classList.remove('reveal-running');
  }
  function reveal(element) {
    if (seen.has(element) || !element.isConnected || !element.getClientRects().length) return;
    // Stop observing BEFORE transform starts. Scroll and animation cannot
    // retrigger each other, including when the card sits on a viewport edge.
    seen.add(element);
    pending.delete(element);
    observer.unobserve(element);
    if (preference.matches) return;
    element.classList.add('reveal-running');
    const delay = Number(element.dataset.revealDelay) || 0;
    running.set(element, setTimeout(() => finish(element), 850 + delay));
    element.addEventListener('animationend', function onEnd(event) {
      if (event.target !== element || event.animationName !== 'armani-reveal') return;
      element.removeEventListener('animationend', onEnd);
      finish(element);
    });
  }
  function buildObserver() {
    observer?.disconnect(); updateHeaderInset();
    observer = new IntersectionObserver(entries => {
      if (navigating) return;
      entries.forEach(entry => {
        if (entry.isIntersecting && inZone(entry.target)) reveal(entry.target);
      });
    }, { root: null, rootMargin: `-${headerInset}px 0px -${bottomInset}px 0px`, threshold: 0 });
    pending.forEach(element => observer.observe(element));
  }
  function observeGroup(selector, effect = 'fade-up', stagger = 100) {
    document.querySelectorAll(selector).forEach((element, index) => {
      if (seen.has(element) || pending.has(element)) return;
      element.dataset.reveal = effect;
      const delay = Math.min(index * stagger, 240);
      element.dataset.revealDelay = String(delay);
      element.style.setProperty('--reveal-delay', `${delay}ms`);
      pending.add(element); observer.observe(element);
    });
  }
  function scan() {
    pending.forEach(element => {
      if (!element.isConnected) { observer.unobserve(element); pending.delete(element); }
    });
    running.forEach((timer, element) => { if (!element.isConnected) finish(element); });
    observeGroup('.hero > *');
    observeGroup('#estate .heading, #estate .estate');
    observeGroup('#garage .heading', 'fade-up', 0);
    observeGroup('#cars .car');
    observeGroup('#outfits .car');
    observeGroup('#team .heading', 'fade-up', 0);
    observeGroup('#team .person');
    observeGroup('#ranking .heading', 'scale-right', 0);
    // Reveal rows, not both rows and their parent: avoids multiplied opacity.
    observeGroup('#ranking .toprow', 'scale-right');
    observeGroup('#community > *');
    observeGroup('#rules .heading', 'fade-up', 0);
    observeGroup('#rules details');
    observeGroup('.join', 'fade-up', 0);
  }
  function revealVisible() {
    if (navigating) return;
    pending.forEach(element => { if (inZone(element)) reveal(element); });
  }
  buildObserver(); scan();
  document.addEventListener('armani:ranking-change', () => { scan(); revealVisible(); });
  document.addEventListener('armani:gallery-change', () => {
    requestAnimationFrame(() => { scan(); revealVisible(); });
  });
  document.addEventListener('armani:navigation-start', () => { navigating = true; });
  document.addEventListener('armani:navigation-end', () => {
    navigating = false; scan(); revealVisible();
  });
  // Recalculate the trigger zone after responsive header wrapping or resize.
  function resized() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { buildObserver(); revealVisible(); });
  }
  window.addEventListener('resize', resized, {passive:true});
  if ('ResizeObserver' in window) {
    const header = document.querySelector('header');
    if (header) new ResizeObserver(resized).observe(header);
  }
  preference.addEventListener('change', () => {
    if (preference.matches) [...running.keys()].forEach(finish);
    revealVisible();
  });
})();
