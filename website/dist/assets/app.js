(() => {
  document.documentElement.classList.replace('no-js', 'js');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const menus = [...(nav?.querySelectorAll('[data-nav-menu]') || [])];
  const closeMenus = except => menus.forEach(menu => { if (menu !== except) menu.open = false; });
  const setMenu = open => {
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (!open) closeMenus();
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  menus.forEach(menu => {
    const summary = menu.querySelector('summary');
    menu.addEventListener('toggle', () => { if (menu.open) closeMenus(menu); });
    summary?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault(); menu.open = true;
      const links = [...menu.querySelectorAll('a')];
      links[event.key === 'ArrowDown' ? 0 : links.length - 1]?.focus();
    });
    menu.addEventListener('focusout', () => {
      setTimeout(() => { if (!menu.contains(document.activeElement)) menu.open = false; }, 0);
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.site-header')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const menu = menus.find(item => item.open && item.contains(document.activeElement));
      if (menu) { menu.open = false; menu.querySelector('summary').focus(); event.preventDefault(); return; }
      if (toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); event.preventDefault(); }
      else closeMenus();
    }
    if (event.key === 'Tab' && toggle?.getAttribute('aria-expanded') === 'true') {
      const links = [...nav.querySelectorAll('a, summary')].filter(item => item.getClientRects().length > 0);
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); toggle.focus(); }
      else if (!event.shiftKey && document.activeElement === toggle) { event.preventDefault(); links[0]?.focus(); }
    }
  });
  window.matchMedia('(min-width: 960px)').addEventListener('change', () => setMenu(false));
  const search = document.querySelector('[data-faq-filter]');
  if (search) {
    const groups = [...document.querySelectorAll('[data-faq-group]')];
    const status = document.querySelector('[data-faq-count]');
    const empty = document.querySelector('[data-faq-empty]');
    document.querySelector('[data-faq-search]').hidden = false;
    const filter = () => {
      const query = search.value.trim().toLocaleLowerCase(); let count = 0;
      for (const group of groups) {
        let visible = 0;
        for (const question of group.querySelectorAll('[data-faq-item]')) {
          question.hidden = !question.textContent.toLocaleLowerCase().includes(query);
          if (!question.hidden) visible++;
        }
        group.hidden = visible === 0; count += visible;
      }
      status.textContent = `${count} ${count === 1 ? 'question' : 'questions'}${query ? ' match your search' : ' available'}.`;
      empty.hidden = count !== 0;
    };
    search.addEventListener('input', filter); filter();
  }
  const selectedService = document.querySelector('[data-enquiry-service]');
  if (selectedService) {
    const labels = { 'street-lighting': 'Street lighting', 'underground-cabling': 'Underground cabling', 'high-mast-area-lighting': 'High-mast & area lighting', 'led-solar-lighting': 'LED & solar lighting', 'lighting-maintenance': 'Lighting maintenance', 'electrical-infrastructure': 'Electrical infrastructure' };
    const label = labels[new URLSearchParams(location.search).get('service')];
    if (label) { selectedService.textContent = `Selected enquiry topic: ${label}. Include it in your project outline below.`; selectedService.hidden = false; }
  }
  const heroHeader = document.querySelector('.hero-header');
  if (heroHeader) {
    const hero = document.querySelector('.hero');
    const content = document.querySelector('.home-content');
    let headerFrame = 0;
    const updateHeader = () => {
      const contentAtHeader = content && content.getBoundingClientRect().top <= heroHeader.getBoundingClientRect().bottom;
      heroHeader.classList.toggle('is-scrolled', Boolean(contentAtHeader));
      headerFrame = 0;
    };
    const scheduleHeaderUpdate = () => {
      if (!headerFrame) headerFrame = requestAnimationFrame(updateHeader);
    };
    updateHeader();
    window.addEventListener('scroll', scheduleHeaderUpdate, { passive: true });
    window.addEventListener('resize', scheduleHeaderUpdate);
    window.addEventListener('pageshow', scheduleHeaderUpdate);
    if ('ResizeObserver' in window) {
      const headerObserver = new ResizeObserver(scheduleHeaderUpdate);
      headerObserver.observe(heroHeader);
      if (hero) headerObserver.observe(hero);
    }
    hero?.addEventListener('focusin', event => {
      if (content && content.getBoundingClientRect().top < event.target.getBoundingClientRect().bottom) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    });
  }
  const backgroundVideo = document.querySelector('[data-sector-video]');
  if (backgroundVideo) {
    const videoToggle = document.querySelector('[data-video-toggle]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    let userPaused = true;
    let videoFailed = false;
    backgroundVideo.muted = true;
    const updateVideoButton = () => {
      videoToggle.hidden = reducedMotion.matches || videoFailed;
      videoToggle.textContent = backgroundVideo.paused ? 'Play video' : 'Pause video';
    };
    const updateVideo = () => {
      if (!inView || document.hidden || reducedMotion.matches || userPaused || videoFailed) {
        backgroundVideo.pause();
      } else {
        if (!backgroundVideo.hasAttribute('src')) backgroundVideo.src = backgroundVideo.dataset.src;
        backgroundVideo.play().catch(updateVideoButton);
      }
      updateVideoButton();
    };
    backgroundVideo.addEventListener('playing', () => {
      backgroundVideo.classList.add('is-ready');
      updateVideoButton();
    });
    backgroundVideo.addEventListener('pause', updateVideoButton);
    backgroundVideo.addEventListener('error', () => {
      videoFailed = true;
      backgroundVideo.classList.remove('is-ready');
      updateVideoButton();
    });
    videoToggle.addEventListener('click', () => {
      userPaused = !backgroundVideo.paused;
      updateVideo();
    });
    reducedMotion.addEventListener('change', updateVideo);
    document.addEventListener('visibilitychange', updateVideo);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        updateVideo();
      }, { threshold: 0.01 }).observe(backgroundVideo.closest('.sectors'));
    } else {
      inView = true;
      updateVideo();
    }
  }
})();
