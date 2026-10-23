(() => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const setMenu = open => {
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    if (event.key === 'Tab' && toggle?.getAttribute('aria-expanded') === 'true') {
      const links = [...nav.querySelectorAll('a'), toggle];
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); toggle.focus(); }
      else if (!event.shiftKey && document.activeElement === toggle) { event.preventDefault(); links[0].focus(); }
    }
  });
  window.matchMedia('(min-width: 1101px)').addEventListener('change', event => { if(event.matches) setMenu(false); });
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
  const form = document.getElementById('quote-form');
  if(!form) return;
  const service = form.elements.service;
  const selection = new URLSearchParams(location.search).get('service');
  if (selection && [...service.options].some(option => option.value === selection)) service.value = selection;
  let enquiry = '';
  form.addEventListener('submit', event => {
    event.preventDefault();
    if(!form.reportValidity()) return;
    const data = new FormData(form);
    const name=String(data.get('name')).trim(), email=String(data.get('email')).trim(), message=String(data.get('message')).trim();
    if(!name || message.length<10) {
      const field = !name ? form.elements.name : form.elements.message;
      field.setCustomValidity(!name ? 'Please enter your name.' : 'Please add at least 10 characters about your project.');
      field.reportValidity();
      field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});
      return;
    }
    const label=service.options[service.selectedIndex].text;
    enquiry=`Hello VOLTRONIX,\n\nI would like to discuss a project.\n\nName: ${name}\nEmail: ${email}\nPhone: ${String(data.get('phone')).trim() || 'Not provided'}\nService: ${label}\n\nProject details:\n${message}\n\nPlease contact me to discuss the next steps.`;
    document.getElementById('quote-preview').textContent=enquiry;
    document.getElementById('send-email').href=`mailto:${form.dataset.email}?subject=${encodeURIComponent(`Project enquiry — ${label}`)}&body=${encodeURIComponent(enquiry)}`;
    document.getElementById('send-whatsapp').href=`https://wa.me/${form.dataset.whatsapp}?text=${encodeURIComponent(enquiry)}`;
    const result=document.getElementById('quote-result');
    result.hidden=false;
    document.getElementById('copy-status').textContent='';
    result.focus({preventScroll:true});
    result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  });
  form.addEventListener('input',()=>{document.getElementById('quote-result').hidden=true;});
  document.getElementById('copy-enquiry').addEventListener('click',async()=>{
    try {
      await navigator.clipboard.writeText(enquiry);
      document.getElementById('copy-status').textContent='Enquiry copied. Paste it into your preferred email or messaging app.';
    } catch {
      const range=document.createRange();range.selectNodeContents(document.getElementById('quote-preview'));
      const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);
      document.getElementById('copy-status').textContent='Text selected. Use your device’s Copy command to copy the enquiry.';
    }
  });
  form.querySelector('button[type="submit"]').disabled=false;
})();
