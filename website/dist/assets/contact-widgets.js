(() => {
  const launcher = document.querySelector('.assistant-contact');
  const panel = document.getElementById('assistant-loading-panel');
  const status = panel?.querySelector('[data-assistant-status]');
  const retry = panel?.querySelector('[data-assistant-retry]');
  const close = panel?.querySelector('[data-assistant-close]');
  // Cloudflare may insert other scripts into templates. Select only our embed.
  const source = document.getElementById('ai-assistant-embed')?.content.querySelector('script[data-maries-widget]');
  const whatsapp = document.querySelector('.floating-contact');
  if (whatsapp) window.setTimeout(() => { whatsapp.hidden = false; }, 4000);
  if (!launcher || !panel || !status || !retry || !close) return;

  const anchor = document.getElementById('maries-widget-anchor');
  const zohoButton = '.zsiq_floatmain,#zsiq_float.zsiq-float';
  const zohoPanel = '.zls-sptwndw,#siqiframe,#zsiq_chat_wrap,#siq_chatwindow';
  const zohoUI = `${zohoButton},${zohoPanel},[data-id="zsalesiq"]`;
  const compact = window.matchMedia('(max-width: 1024px)');
  let layoutFrame;
  let pagePosition = { left: window.scrollX, top: window.scrollY };
  const observed = new Set();
  const resize = new ResizeObserver(scheduleLayout);
  let zohoRequested = false;
  let zohoConfigured = false;
  let zohoHideTimer;

  function configureZoho() {
    const api = window.$zoho?.salesiq;
    if (zohoConfigured || typeof api?.floatwindow?.open !== 'function' || typeof api.floatwindow.visible !== 'function') return;
    zohoConfigured = true;
    const minimizeInvitation = () => {
      clearTimeout(zohoHideTimer);
      api.floatwindow.visible('hide');
      // Modern SalesIQ removes the chat icon 100ms after opening. Restore its
      // native, keyboard-focusable launcher after that animation has finished.
      zohoHideTimer = window.setTimeout(() => {
        if (!zohoRequested || compact.matches) api.floatwindow.visible('hide');
      }, 160);
    };
    // Account-level invitations must respect the visitor's choice to open chat.
    api.floatwindow.open(() => {
      if (!zohoRequested || compact.matches) minimizeInvitation();
      scheduleLayout();
    });
    minimizeInvitation();
  }
  function requestZoho(event) {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.isTrusted && event.target instanceof Element && event.target.closest(zohoButton)) {
      zohoRequested = true;
      document.documentElement.setAttribute('data-salesiq-opened', '');
    }
  }
  for (const event of ['click', 'keydown']) document.addEventListener(event, requestZoho, true);
  window.addEventListener('salesiq:ready', configureZoho);
  if (document.documentElement.hasAttribute('data-salesiq-ready')) configureZoho();

  function visibleRect(element) {
    if (!element?.isConnected) return null;
    if (element.checkVisibility && !element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
      || rect.width < 20 || rect.height < 20 || rect.bottom <= 0 || rect.top >= innerHeight
      || rect.right <= 0 || rect.left >= innerWidth) return null;
    return rect;
  }

  function position(element, values) {
    if (!element) return;
    for (const [property, value] of Object.entries(values)) {
      if (element.style[property] !== value) element.style[property] = value;
    }
  }

  function layoutContacts() {
    layoutFrame = null;
    // A hidden SalesIQ panel must not keep the mobile page locked in place.
    if (compact.matches && document.body.classList.contains('zsiq_fixedlayout')) {
      document.body.classList.remove('zsiq_fixedlayout');
      window.scrollTo({ ...pagePosition, behavior: 'instant' });
    }
    const targets = new Set(document.querySelectorAll(zohoUI));
    for (const element of observed) {
      if (!targets.has(element)) { resize.unobserve(element); observed.delete(element); }
    }
    for (const element of targets) {
      if (!observed.has(element)) { observed.add(element); resize.observe(element); }
    }
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const safeBottom = anchor ? parseFloat(getComputedStyle(anchor).paddingBottom) || 0 : 0;
    const minimumBottom = innerHeight - top - height + safeBottom + 8;
    let x = left + width - 78;
    let bottom = Math.max(96 + safeBottom, minimumBottom);
    if (!compact.matches) {
      const chatButton = [...document.querySelectorAll(zohoButton)].map(visibleRect).find(Boolean);
      if (chatButton) {
        x = chatButton.left + (chatButton.width - 58) / 2;
        bottom = Math.max(innerHeight - chatButton.top + 14, minimumBottom);
      }
      const chatPanel = [...document.querySelectorAll(zohoPanel)]
        .map(visibleRect).find(rect => rect?.width > 220);
      if (chatPanel) x = Math.min(x, chatPanel.left - 72);
    }
    x = Math.max(left + 8, Math.min(x, left + width - 66));
    bottom = Math.min(bottom, innerHeight - top - 74);
    // Maries observes this anchor and keeps its native launcher and popup aligned.
    position(anchor, { left: `${Math.round(x)}px`, right: 'auto', bottom: `${Math.round(bottom - 72)}px` });
    position(launcher, { left: `${Math.round(x)}px`, right: 'auto', bottom: `${Math.round(bottom)}px` });
    const panelWidth = Math.min(380, width - 16);
    const panelX = Math.max(left + 8, Math.min(x + 58 - panelWidth, left + width - panelWidth - 8));
    const panelBottom = Math.max(minimumBottom, Math.min(bottom, innerHeight - top - Math.min(360, height - safeBottom - 20) - 12));
    position(panel, { left: `${Math.round(panelX)}px`, right: 'auto', bottom: `${Math.round(panelBottom)}px`, maxHeight: `${Math.max(1, innerHeight - panelBottom - top - 12)}px` });
  }

  function scheduleLayout() {
    if (layoutFrame == null) layoutFrame = requestAnimationFrame(layoutContacts);
  }
  const relevant = node => node instanceof Element && (node.matches(zohoUI) || node.querySelector(zohoUI));
  new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes'
      ? record.target === document.body || record.target.closest(zohoUI)
      : [...record.addedNodes, ...record.removedNodes].some(relevant))) scheduleLayout();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('zsiq_fixedlayout')) pagePosition = { left: window.scrollX, top: window.scrollY };
  }, { passive: true });
  for (const event of ['resize', 'orientationchange', 'pageshow', 'talk2maries:ready']) window.addEventListener(event, scheduleLayout);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.visualViewport?.addEventListener('scroll', scheduleLayout);
  document.addEventListener('transitionend', event => { if (event.target instanceof Element && event.target.closest(zohoUI)) scheduleLayout(); });
  layoutContacts();

  let requested = false;
  let loading = false;
  let ready = false;
  let attempt = 0;
  let timer;
  let loader;

  function showLoading() {
    panel.hidden = false;
    panel.setAttribute('aria-busy', 'true');
    launcher.setAttribute('aria-expanded', 'true');
    status.textContent = 'Opening your AI assistant...';
    retry.hidden = true;
  }

  function closeLoading() {
    requested = false;
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus({ preventScroll: true });
  }

  function loadWidget() {
    if (ready || loading) return;
    loading = true;
    const current = ++attempt;
    if (requested) showLoading();

    const failed = () => {
      if (current !== attempt) return;
      clearTimeout(timer);
      loading = false;
      if (requested) {
        panel.hidden = false;
        panel.setAttribute('aria-busy', 'false');
        status.textContent = 'The assistant could not load. Please try again.';
        retry.hidden = false;
      }
    };

    const prepareWidget = () => {
      if (current !== attempt) return;
      const widget = document.getElementById('talk2maries-widget');
      const api = window.Talk2MariesWidget;
      if (!widget?.shadowRoot || typeof api?.open !== 'function') return failed();
      widget.hidden = true;

      const showWidget = () => {
        if (current !== attempt) return;
        clearTimeout(timer);
        loading = false;
        ready = true;
        widget.hidden = false;
        launcher.hidden = true;
        panel.hidden = true;
        // Clicking during loading opens the embedded popup as soon as it is ready.
        if (requested) api.open();
      };

      let stylesheet = widget.shadowRoot.querySelector('link[rel="stylesheet"]');
      if (stylesheet && !stylesheet.sheet) {
        if (current > 1) {
          const replacement = stylesheet.cloneNode();
          stylesheet.replaceWith(replacement);
          stylesheet = replacement;
        }
        stylesheet.addEventListener('load', showWidget, { once: true });
        stylesheet.addEventListener('error', failed, { once: true });
      } else showWidget();
    };

    timer = window.setTimeout(failed, 15000);
    if (window.Talk2MariesWidget && document.getElementById('talk2maries-widget')) {
      prepareWidget();
      return;
    }
    if (!source) return failed();
    loader?.remove();
    loader = document.createElement('script');
    for (const { name, value } of source.attributes) loader.setAttribute(name, value);
    loader.addEventListener('load', prepareWidget, { once: true });
    loader.addEventListener('error', failed, { once: true });
    document.body.append(loader);
  }

  launcher.addEventListener('click', () => {
    requested = true;
    if (ready) {
      window.Talk2MariesWidget.open();
      return;
    }
    showLoading();
    close.focus({ preventScroll: true });
    loadWidget();
  });
  close.addEventListener('click', closeLoading);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLoading();
    }
  });
  retry.addEventListener('click', loadWidget);
  window.addEventListener('talk2maries:close', () => { requested = false; });
  loadWidget();
})();
