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
  const revealed = new Map();
  let headingProgress = 0;
  let mode = 'static';
  let top = 0;
  let viewHeight = 0;
  let intro = 0;
  let step = 0;
  let titleOffset = 0;
  let titleFont = 0;
  let introFont = 0;
  let titleHeight = 0;
  let frame = 0;
  let layoutFrame = 0;
  let displayedCount = -1;
  let scrollDistance = 0;
  let skippedDistance = 0;
  let previousY = scrollY;
  let returnUntil = 0;
  let touchY = 0;

  const clearReturnIntent = () => { returnUntil = 0; };
  const setScrollHeight = () => section.style.setProperty('--works-scroll-height', `${viewHeight + scrollDistance - skippedDistance}px`);

  const reveal = (card, progress) => {
    // A downward pass can reveal more content; scrolling back never hides it.
    const retained = Math.max(revealed.get(card) || 0, clamp(progress));
    revealed.set(card, retained);
    const value = ease(retained);
    card.style.setProperty('--work-opacity', value.toFixed(3));
    card.style.setProperty('--work-offset', `${((1 - value) * 36).toFixed(2)}px`);
    card.style.setProperty('--work-scale', (.97 + value * .03).toFixed(3));
    card.style.pointerEvents = value > .9 ? '' : 'none';
    return value > .95;
  };

  const update = () => {
    frame = 0;
    if (mode === 'static') return;
    let bounds = section.getBoundingClientRect();
    // Rearm the sequence out of sight, only after returning fully above it.
    // A focused service stays available even when keyboard navigation moves it.
    if (bounds.top >= innerHeight && !grid.contains(document.activeElement)) {
      revealed.clear();
      headingProgress = 0;
      if (mode === 'pinned' && skippedDistance) {
        skippedDistance = 0;
        setScrollHeight();
      }
    }
    let distance = top - bounds.top;
    if (mode === 'pinned' && performance.now() < returnUntil && scrollY < previousY - .5 && distance > 1) {
      // Remove the already-travelled spacer on an intentional upward scroll.
      // Matching the scroll correction to the removed height keeps the visible
      // stage (or content below it) in place without intercepting wheel/touch.
      const removed = Math.min(distance, scrollDistance - skippedDistance);
      if (removed > 1) {
        const nextY = scrollY - removed;
        skippedDistance += removed;
        setScrollHeight();
        scrollTo({ top: nextY, behavior: 'instant' });
        bounds = section.getBoundingClientRect();
        distance = top - bounds.top;
      }
    }
    previousY = scrollY;
    if (mode === 'pinned') distance += skippedDistance;
    let count = 0;
    if (mode === 'pinned') {
      // Leave a short title-only hold before it settles into the grid heading.
      headingProgress = Math.max(headingProgress, clamp((distance - viewHeight * .14) / (intro - viewHeight * .14)));
      const settle = ease(headingProgress);
      // Render the glyphs at their real display size instead of enlarging a composited texture.
      const fontSize = Math.round(titleFont + (introFont - titleFont) * (1 - settle));
      title.style.fontSize = `${fontSize}px`;
      title.style.top = `${Math.round((1 - settle) * titleOffset + (titleHeight - fontSize * 1.08) / 2)}px`;
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
        if (reveal(card, entry / (stagger * .8))) count++;
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
    clearReturnIntent();
    section.classList.remove('is-pinned', 'is-flow');
    section.style.removeProperty('--works-scroll-height');
    title.style.removeProperty('font-size');
    title.style.removeProperty('top');
    cards.forEach(card => {
      ['--work-opacity', '--work-offset', '--work-scale'].forEach(property => card.style.removeProperty(property));
      card.style.removeProperty('pointer-events');
    });
    controls.hidden = true;
    mode = 'static';
    if (!motion.matches) {
      skippedDistance = 0;
      cards.forEach(card => revealed.set(card, 1));
      headingProgress = 1;
      return;
    }

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
      // Keep the grid heading settled when returning from a flow/static layout.
      if ([...revealed.values()].some(progress => progress > 0)) headingProgress = 1;
      intro = viewHeight * .68;
      step = Math.max(150, viewHeight * .28);
      scrollDistance = intro + cards.length * step + viewHeight * .28;
      skippedDistance = Math.min(skippedDistance, scrollDistance);
      setScrollHeight();
      titleOffset = viewHeight / 2 - (heading.offsetTop + heading.offsetHeight / 2);
      titleFont = parseFloat(getComputedStyle(heading).fontSize);
      titleHeight = heading.getBoundingClientRect().height;
      const text = document.createRange();
      text.selectNodeContents(title);
      introFont = titleFont * Math.min(2.45, (heading.clientWidth - 32) / text.getBoundingClientRect().width);
    } else {
      mode = 'flow';
      skippedDistance = 0;
      section.classList.remove('is-pinned');
      section.classList.add('is-flow');
      controls.hidden = true;
    }
    displayedCount = -1;
    previousY = scrollY;
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
        scrollTo({ top: start + Math.max(0, intro + (index + .8) * step - skippedDistance), behavior: 'instant' });
        update();
      }
    } else {
      reveal(card, 1);
      const bounds = card.getBoundingClientRect();
      if (bounds.top < top + 16 || bounds.bottom > innerHeight - 16) card.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  // Listen for intent only: native scrolling, anchors and Home/End stay in charge.
  addEventListener('wheel', event => {
    if (event.ctrlKey || !event.deltaY) return;
    returnUntil = event.deltaY < 0 ? performance.now() + 700 : 0;
  }, { passive: true });
  addEventListener('touchstart', event => {
    clearReturnIntent();
    touchY = event.touches[0]?.clientY || 0;
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (event.touches.length !== 1) { clearReturnIntent(); return; }
    const nextY = event.touches[0].clientY;
    if (nextY !== touchY) returnUntil = nextY > touchY ? performance.now() + 700 : 0;
    touchY = nextY;
  }, { passive: true });
  addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.isContentEditable || event.target.closest?.('input, textarea, select, [role="textbox"]')) return;
    const upward = ['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey);
    returnUntil = upward ? performance.now() + 700 : 0;
  });
  document.addEventListener('click', clearReturnIntent, true);
  document.addEventListener('focusin', clearReturnIntent, true);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', scheduleLayout);
  addEventListener('pageshow', scheduleLayout);
  motion.addEventListener('change', scheduleLayout);
  document.fonts?.ready.then(scheduleLayout);
  layout();
})();
