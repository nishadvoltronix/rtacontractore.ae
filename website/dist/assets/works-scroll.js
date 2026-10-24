(() => {
  const section = document.querySelector('[data-works-scroll]');
  if (!section) return;
  const stage = section.querySelector('.rta-works-stage');
  const inner = section.querySelector('.rta-works-inner');
  const heading = section.querySelector('.rta-works-heading');
  const title = heading.querySelector('h2');
  const grid = section.querySelector('.rta-works-grid');
  const cards = [...grid.children];
  const controls = section.querySelector('.rta-works-controls');
  const counter = section.querySelector('[data-works-count]');
  const motion = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 551px)');
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => value * value * (3 - 2 * value);
  const forced = new Set();
  let mode = 'static';
  let top = 0;
  let viewHeight = 0;
  let intro = 0;
  let step = 0;
  let titleOffset = 0;
  let titleScale = 1;
  let frame = 0;
  let layoutFrame = 0;
  let displayedCount = -1;

  const reveal = (card, progress) => {
    const value = ease(clamp(progress));
    card.style.setProperty('--work-opacity', value.toFixed(3));
    card.style.setProperty('--work-offset', `${((1 - value) * 36).toFixed(2)}px`);
    card.style.setProperty('--work-scale', (.97 + value * .03).toFixed(3));
    card.style.pointerEvents = value > .9 ? '' : 'none';
    return value > .95;
  };

  const update = () => {
    frame = 0;
    if (mode === 'static') return;
    const bounds = section.getBoundingClientRect();
    const distance = top - bounds.top;
    let count = 0;
    if (mode === 'pinned') {
      // Leave a short title-only hold before it settles into the grid heading.
      const settle = ease(clamp((distance - viewHeight * .14) / (intro - viewHeight * .14)));
      title.style.transform = `translate3d(0,${((1 - settle) * titleOffset).toFixed(2)}px,0) scale(${(1 + (titleScale - 1) * (1 - settle)).toFixed(3)})`;
      cards.forEach((card, index) => {
        if (reveal(card, (distance - intro - index * step) / (step * .72))) count++;
      });
    } else {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const gridTop = grid.getBoundingClientRect().top;
      const firstRow = cards[0].offsetTop;
      const offsets = cards.map(card => card.offsetTop);
      const rowGaps = offsets.filter((_, index) => index % columns === 0).slice(1).map((offset, index) => offset - offsets[index * columns]);
      // Finish each row before the next starts, even in a short, wide viewport.
      const stagger = Math.min(120, innerHeight * .16, Math.min(...rowGaps) / columns);
      cards.forEach((card, index) => {
        const cardTop = gridTop + offsets[index] - firstRow;
        const entry = innerHeight * .85 - cardTop - (index % columns) * stagger;
        if (reveal(card, forced.has(card) ? 1 : entry / (stagger * .8))) count++;
      });
    }
    if (count !== displayedCount) {
      displayedCount = count;
      counter.textContent = String(count).padStart(2, '0');
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  const layout = () => {
    layoutFrame = 0;
    section.classList.remove('is-pinned', 'is-flow');
    section.style.removeProperty('--works-scroll-height');
    title.style.removeProperty('transform');
    cards.forEach(card => {
      ['--work-opacity', '--work-offset', '--work-scale'].forEach(property => card.style.removeProperty(property));
      card.style.removeProperty('pointer-events');
    });
    controls.hidden = true;
    mode = 'static';
    if (!motion.matches) return;

    top = document.querySelector('.header')?.getBoundingClientRect().height || 0;
    viewHeight = innerHeight - top;
    section.style.setProperty('--works-top', `${top}px`);
    section.style.setProperty('--works-view-height', `${viewHeight}px`);
    // Measure the final grid first. Pin only when every card fits below the header.
    section.classList.add('is-pinned');
    controls.hidden = false;
    const needed = heading.offsetHeight + grid.offsetHeight + controls.offsetHeight + 28 + 28 + 48;
    if (innerWidth > 900 && needed <= viewHeight) {
      mode = 'pinned';
      intro = viewHeight * .68;
      step = Math.max(150, viewHeight * .28);
      const distance = intro + cards.length * step + viewHeight * .28;
      section.style.setProperty('--works-scroll-height', `${viewHeight + distance}px`);
      titleOffset = viewHeight / 2 - (heading.offsetTop + heading.offsetHeight / 2);
      titleScale = Math.min(2.45, (inner.clientWidth - 100) / title.scrollWidth);
    } else {
      mode = 'flow';
      section.classList.remove('is-pinned');
      section.classList.add('is-flow');
      controls.hidden = true;
    }
    displayedCount = -1;
    update();
  };
  const scheduleLayout = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(layout); };

  grid.addEventListener('focusin', event => {
    const card = event.target.closest('.rta-works-grid > li');
    if (!card || mode === 'static') return;
    if (mode === 'pinned') {
      const index = cards.indexOf(card);
      const cardBounds = card.getBoundingClientRect();
      if (Number(card.style.getPropertyValue('--work-opacity')) < .99 || cardBounds.top < top || cardBounds.bottom > innerHeight) {
        const start = scrollY + section.getBoundingClientRect().top - top;
        scrollTo({ top: start + intro + (index + .8) * step, behavior: 'instant' });
        update();
      }
    } else {
      forced.add(card);
      reveal(card, 1);
      const bounds = card.getBoundingClientRect();
      if (bounds.top < top + 16 || bounds.bottom > innerHeight - 16) card.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', scheduleLayout);
  addEventListener('pageshow', scheduleLayout);
  motion.addEventListener('change', scheduleLayout);
  document.fonts?.ready.then(scheduleLayout);
  layout();
})();
