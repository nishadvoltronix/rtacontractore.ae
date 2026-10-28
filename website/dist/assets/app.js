(() => {
  // Keep WhatsApp's delay; the assistant launcher is visible in the initial HTML.
  const whatsappContact = document.querySelector('.floating-contact');
  const assistantContact = document.querySelector('.assistant-contact');
  const assistantEmbed = document.getElementById('ai-assistant-embed');
  if (whatsappContact) window.setTimeout(() => { whatsappContact.hidden = false; }, 4000);
  const source = assistantEmbed?.content.querySelector('script');
  if (source) {
    const script = document.createElement('script');
    for (const { name, value } of source.attributes) script.setAttribute(name, value);
    script.addEventListener('load', () => {
      const widget = document.getElementById('talk2maries-widget');
      const api = window.Talk2MariesWidget;
      if (!widget?.shadowRoot || !api?.open) return;
      widget.hidden = true;
      // v1 auto-anchors beside WhatsApp even with bottom-right configured.
      // Keep its panel and label on the right while retaining its viewport sizing.
      const alignment = document.createElement('style');
      alignment.textContent = `
        :host { left: auto !important; right: 20px !important; }
        .panel { left: auto !important; right: 20px !important; max-width: calc(100vw - 40px); }
        .launcher-label { left: auto !important; right: 69px !important; }
        @media (max-width: 540px) {
          .panel { right: 8px !important; max-width: calc(100vw - 16px); }
        }
      `;
      widget.shadowRoot.append(alignment);
      const showAssistant = () => {
        widget.hidden = false;
        if (assistantContact) assistantContact.hidden = true;
      };
      // Reveal the styled launcher only; the visitor opens the popup by clicking it.
      // Keep the fallback link until the provider's fixed layout is ready.
      const stylesheet = widget.shadowRoot.querySelector('link[rel="stylesheet"]');
      if (stylesheet && !stylesheet.sheet) stylesheet.addEventListener('load', showAssistant, { once: true });
      else showAssistant();
    }, { once: true });
    // The direct assistant link remains available if the provider script fails.
    document.body.append(script);
  }
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const pqMenu = nav?.querySelector('[data-pq-menu]');
  const pqToggle = pqMenu?.querySelector('summary');
  let pqCloseTimer;
  let pqOpenedByHover = false;
  const closePq = () => {
    clearTimeout(pqCloseTimer);
    pqOpenedByHover = false;
    if (pqMenu) pqMenu.open = false;
  };
  const setMenu = open => {
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (!open) closePq();
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pqMenu?.open) {
      closePq();
      pqToggle.focus();
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    if (event.key === 'Tab' && toggle?.getAttribute('aria-expanded') === 'true') {
      const links = [...nav.querySelectorAll('a, summary')].filter(item => item.getClientRects().length > 0);
      links.push(toggle);
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); toggle.focus(); }
      else if (!event.shiftKey && document.activeElement === toggle) { event.preventDefault(); links[0].focus(); }
    }
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', () => setMenu(false));
  if (pqMenu) {
    const hoverMenu = matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
    pqMenu.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !hoverMenu.matches) return;
      clearTimeout(pqCloseTimer);
      if (!pqMenu.open) {
        pqOpenedByHover = true;
        pqMenu.open = true;
      }
    });
    pqMenu.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'mouse' || !hoverMenu.matches) return;
      pqCloseTimer = setTimeout(() => {
        if (!pqMenu.matches(':hover') && !pqMenu.contains(document.activeElement)) closePq();
      }, 180);
    });
    // Clicking a menu just opened by hover should keep its document links open.
    pqToggle.addEventListener('click', event => {
      if (event.detail > 0 && pqOpenedByHover && hoverMenu.matches) {
        event.preventDefault();
        pqOpenedByHover = false;
      }
    });
    pqMenu.addEventListener('toggle', () => { if (!pqMenu.open) closePq(); });
    hoverMenu.addEventListener('change', closePq);
    document.addEventListener('click', event => {
      if (!pqMenu.contains(event.target)) closePq();
    });
    pqMenu.addEventListener('focusout', event => {
      if (event.relatedTarget) {
        if (!pqMenu.contains(event.relatedTarget)) closePq();
      } else {
        // Wait for native Tab navigation to finish before inspecting focus.
        setTimeout(() => { if (!pqMenu.contains(document.activeElement)) closePq(); }, 0);
      }
    });
    pqToggle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      pqMenu.open = true;
      const links = pqMenu.querySelectorAll('a');
      links[event.key === 'ArrowDown' ? 0 : links.length - 1].focus();
    });
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
  const aboutSection = document.querySelector('.about-shell > .about');
  if (aboutSection) {
    const aboutShell = aboutSection.parentElement;
    const followingSections = aboutSection.nextElementSibling;
    const stickyMotion = window.matchMedia('(min-height: 551px) and (prefers-reduced-motion: no-preference)');
    let stickyTop = 0;
    const headerBottom = () => heroHeader?.getBoundingClientRect().bottom || 0;
    const updateAboutLayout = () => {
      // Tall layouts scroll through all their content before the bottom edge pins.
      stickyTop = Math.min(headerBottom(), window.innerHeight - aboutSection.offsetHeight);
      aboutSection.style.setProperty('--about-stick-top', `${stickyTop}px`);
      aboutSection.classList.toggle('is-sticky', stickyMotion.matches);
    };
    window.addEventListener('resize', updateAboutLayout);
    window.addEventListener('pageshow', updateAboutLayout);
    stickyMotion.addEventListener('change', updateAboutLayout);
    if ('ResizeObserver' in window) {
      const aboutObserver = new ResizeObserver(updateAboutLayout);
      aboutObserver.observe(aboutSection);
      if (heroHeader) aboutObserver.observe(heroHeader);
    }
    aboutSection.addEventListener('focusin', event => {
      const target = event.target.getBoundingClientRect();
      const visibleBottom = Math.min(window.innerHeight, followingSections.getBoundingClientRect().top);
      if (target.top >= headerBottom() + 16 && target.bottom <= visibleBottom) return;
      const naturalStart = window.scrollY + aboutShell.getBoundingClientRect().top;
      const localTop = target.top - aboutSection.getBoundingClientRect().top;
      let revealAt = naturalStart + localTop - headerBottom() - 16;
      if (aboutSection.classList.contains('is-sticky')) revealAt = Math.min(revealAt, naturalStart - stickyTop);
      window.scrollTo({ top: Math.max(0, revealAt), behavior: 'instant' });
    });
    updateAboutLayout();
  }
  const backgroundVideo = document.querySelector('[data-sector-video]');
  if (backgroundVideo) {
    const videoToggle = document.querySelector('[data-video-toggle]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    let userPaused = false;
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
  const partners = document.querySelector('[data-partners]');
  if (partners) {
    const viewport = partners.querySelector('[data-partners-window]');
    const track = partners.querySelector('[data-partners-track]');
    const group = partners.querySelector('[data-partners-group]');
    const button = partners.querySelector('[data-partners-toggle]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let userPaused = false;
    let hovered = false;
    let inView = false;
    const updatePlayback = () => {
      track.style.animationPlayState = inView && !document.hidden && !userPaused && !hovered ? 'running' : 'paused';
      button.textContent = userPaused ? 'Play slider' : 'Pause slider';
    };
    const updateLayout = () => {
      const animate = !reducedMotion.matches && group.scrollWidth > viewport.clientWidth;
      if (animate && !partners.classList.contains('is-animated')) viewport.scrollLeft = 0;
      partners.classList.toggle('is-animated', animate);
      viewport.tabIndex = animate ? -1 : 0;
      button.hidden = !animate;
      updatePlayback();
    };
    button.addEventListener('click', () => {
      userPaused = !userPaused;
      updatePlayback();
    });
    viewport.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') { hovered = true; updatePlayback(); }
    });
    viewport.addEventListener('pointerleave', () => { hovered = false; updatePlayback(); });
    reducedMotion.addEventListener('change', updateLayout);
    document.addEventListener('visibilitychange', updatePlayback);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        updatePlayback();
      }, { threshold: 0.1 }).observe(viewport);
    } else inView = true;
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(updateLayout);
      observer.observe(viewport);
      observer.observe(group);
    } else window.addEventListener('resize', updateLayout);
    updateLayout();
  }
})();
