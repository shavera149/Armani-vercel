(() => {
  'use strict';
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window)) return;
  const STAGGER_MS = 120;
  const elements = new Set();
  const running = new Set();
  let navigating = false;

  function finish(element) {
    element.classList.remove('reveal-running');
    running.delete(element);
  }
  function reveal(element) {
    if (motionPreference.matches || !element.getClientRects().length) return;
    finish(element);
    // Restart even when the same menu item is selected again.
    void element.offsetWidth;
    element.classList.add('reveal-running');
    running.add(element);
  }
  function isVisible(element) {
    if (!element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    return rect.bottom > headerBottom && rect.top < innerHeight;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !navigating) reveal(entry.target);
    }
  }, { threshold: 0.08 });

  function observeGroup(selector, effect = 'fade-up', stagger = STAGGER_MS) {
    document.querySelectorAll(selector).forEach((element, index) => {
      if (elements.has(element)) return;
      element.dataset.reveal = effect;
      element.style.setProperty('--reveal-delay', `${index * stagger}ms`);
      elements.add(element);
      element.addEventListener('animationend', (event) => {
        if (event.target === element && event.animationName === 'armani-reveal') finish(element);
      });
      observer.observe(element);
    });
  }

  observeGroup('#team .heading', 'fade-up', 0);
  observeGroup('#team .person');
  observeGroup('#ranking .heading', 'scale-right', 0);
  observeGroup('#ranking .leaderboard-panel', 'scale-right', 0);
  observeGroup('#ranking .toprow', 'scale-right');
  observeGroup('.hero > *');
  observeGroup('#estate .heading, #estate .estate');
  observeGroup('#garage .heading', 'fade-up', 0);
  observeGroup('#cars .car');
  observeGroup('#outfits .car');
  observeGroup('#community > *');
  observeGroup('#rules .heading', 'fade-up', 0);
  observeGroup('#rules .rules-list', 'fade-up', 0);
  observeGroup('#rules details');
  observeGroup('.join', 'fade-up', 0);

  document.addEventListener('armani:ranking-change', () => {
    elements.forEach(element => {if(!element.isConnected){observer.unobserve(element);elements.delete(element);running.delete(element);}});
    observeGroup('#ranking .toprow', 'scale-right');
  });

  // Delay menu-driven reveal until the scroll settles, including nearby panels.
  document.addEventListener('armani:navigation-start', () => {
    navigating = true;
    [...running].forEach(finish);
  });
  document.addEventListener('armani:navigation-end', () => {
    navigating = false;
    elements.forEach(element => { if (isVisible(element)) reveal(element); });
  });
  document.addEventListener('armani:gallery-change', (event) => {
    requestAnimationFrame(() => {
      elements.forEach(element => {
        if (event.detail.panel.contains(element) && isVisible(element)) reveal(element);
      });
    });
  });
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches) [...running].forEach(finish);
  });
})();
