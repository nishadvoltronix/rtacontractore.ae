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
