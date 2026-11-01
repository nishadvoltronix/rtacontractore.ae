import { createAttribution, safePageUrl, safeReferrer } from './attribution.js?v=ae024d1113f0';
import { createLeadClient } from './lead-client.js?v=694c4ab11c09';

export const CONSENT_EVENTS = Object.freeze({ update: 'rta_consent_update', analytics: 'rta_consent_analytics_granted', advertising: 'rta_consent_advertising_granted' });
const denied = () => ({ analytics: false, advertising: false });
const validChoice = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 2 && typeof value.analytics === 'boolean' && typeof value.advertising === 'boolean';

export function installMarketing(config, win = globalThis.window) {
  if (!win?.document) return { installed: false, reason: 'document_unavailable' };
  if (win.RTAMarketing?.owner === 'rta-marketing-v1') return win.RTAMarketing;
  config = structuredClone(config);
  const cfg = config?.consent || {};
  const enhancedEnabled = cfg.microsoftEnhancedConversionsEnabled === true;
  const deniedChoice = () => ({ ...denied(), ...(enhancedEnabled ? { microsoftEnhancedConversions: false } : {}) });
  const validPurposeChoice = choice => enhancedEnabled
    ? choice && typeof choice === 'object' && !Array.isArray(choice)
      && Object.keys(choice).length === 3
      && ['analytics', 'advertising', 'microsoftEnhancedConversions'].every(key => Object.hasOwn(choice, key) && typeof choice[key] === 'boolean')
      && (!choice.microsoftEnhancedConversions || choice.advertising)
    : validChoice(choice);
  const active = config?.schemaVersion === 1 && config.enabled === true && cfg.enabled === true
    && cfg.integrationReady === true && cfg.granularTagGatesVerified === true
    && cfg.urlAndReferrerPolicyVerified === true
    && Number.isInteger(cfg.coordinatedContainerVersion) && cfg.coordinatedContainerVersion > 0
    && config.allowedHosts?.includes(win.location.hostname) && /^GTM-[A-Z0-9]+$/.test(cfg.containerId || '')
    && Number.isInteger(cfg.policyVersion) && cfg.policyVersion > 0 && Number.isInteger(cfg.maxAgeDays) && cfg.maxAgeDays > 0 && cfg.maxAgeDays <= 365;
  let state = deniedChoice(); let known = false; let choiceAt = null; let loaded = false; let reloadRequired = false; let panel;
  const grantedThisPage = new Set();
  const listeners = new Set();
  const getState = () => ({ ...state, policyVersion: cfg.policyVersion || 1, known, recordedAt: known ? new Date(choiceAt).toISOString() : null, managed: active, reloadRequired });
  const attribution = createAttribution(config?.attribution || { enabled: false }, win, getState);
  let reason = active ? 'ready' : 'disabled_or_unverified_integration';
  // Retaining an old head/noscript loader during activation cannot provide a
  // consent gate. Fail visibly rather than pretending already-loaded tags stop.
  const preexisting = active && (win.document.querySelector('script[src*="googletagmanager.com/gtm.js"]') || [...win.document.querySelectorAll('noscript')].some(node => node.textContent.includes('googletagmanager.com/ns.html')));
  const managed = active && !preexisting;
  if (preexisting) reason = 'preexisting_gtm_loader';
  function commands(type, choice) {
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
    win.gtag('consent', type, { analytics_storage: choice.analytics ? 'granted' : 'denied', ad_storage: choice.advertising ? 'granted' : 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    win.uetq = win.uetq || [];
    win.uetq.push('consent', type, { ad_storage: choice.advertising ? 'granted' : 'denied' });
    win.clarity = win.clarity || function () { (win.clarity.q = win.clarity.q || []).push(arguments); };
    win.clarity('consentv2', { analytics_Storage: choice.analytics ? 'granted' : 'denied', ad_Storage: choice.advertising ? 'granted' : 'denied' });
    // A coordinated GTM consent template must consume this event with its
    // synchronous consent APIs before the subsequent grant events are handled.
    win.dataLayer.push({ event: CONSENT_EVENTS.update, rta_consent_analytics: choice.analytics ? 'granted' : 'denied', rta_consent_advertising: choice.advertising ? 'granted' : 'denied', rta_consent_policy_version: cfg.policyVersion });
  }
  function load() {
    if (loaded) return true;
    if (!state.analytics && !state.advertising) return false;
    // Known static paths and bounded approved query keys only. Do not send
    // inbound email/phone/free-text query parameters to default vendor page URLs.
    try {
      const hash = new URL(win.location.href).hash;
      const validAnchor = /^#[a-z][a-z0-9_-]{0,63}$/i.test(hash) && win.document.getElementById?.(hash.slice(1));
      const safe = safePageUrl(win.location.href, state, config.attribution.allowedLandingPaths, validAnchor ? [hash] : [], config.attribution.approvedAnalyticsUtmValues);
      if (safe !== win.location.href) win.history.replaceState(win.history.state, '', safe);
      win.dataLayer.push({ rta_page_location: safe.split('#')[0], rta_page_referrer: safeReferrer(win.document.referrer, config.allowedHosts) });
    } catch { reason = 'page_url_not_sanitized'; return false; }
    try {
      win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = win.document.createElement('script'); script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${cfg.containerId}`;
      win.document.head.append(script); loaded = true; return true;
    } catch { reason = 'container_injection_failed'; return false; }
  }
  function notify() { for (const callback of listeners) { try { callback(getState()); } catch { /* An observer cannot block privacy changes. */ } } }
  function apply(choice, timestamp = Date.now()) {
    const enhancedWithdrawal = enhancedEnabled && state.microsoftEnhancedConversions && !choice.microsoftEnhancedConversions;
    const withdrawal = loaded && ((state.analytics && !choice.analytics) || (state.advertising && !choice.advertising) || enhancedWithdrawal);
    state = { ...choice }; known = true; choiceAt = timestamp;
    // Purge any in-memory matching payload before calling vendor commands.
    if (enhancedWithdrawal) notify();
    let commandsApplied = true;
    try { commands('update', state); } catch { reason = 'consent_commands_failed'; commandsApplied = false; }
    try { if (!state.analytics && !state.advertising) attribution.clear(); else attribution.refresh(); } catch { /* Optional attribution cannot block withdrawal. */ }
    if (withdrawal) {
      reloadRequired = true;
      if (!enhancedWithdrawal) notify();
      // Commands cannot universally unload running vendors. Persisted denial
      // plus document reset restores the gate; do not promise retroactive erasure.
      try { win.location.reload(); } catch { reason = 'reload_required'; } return getState();
    }
    if ((state.analytics || state.advertising) && (!commandsApplied || !load())) return getState();
    for (const purpose of ['analytics', 'advertising']) if (state[purpose] && !grantedThisPage.has(purpose)) {
      grantedThisPage.add(purpose); win.dataLayer.push({ event: CONSENT_EVENTS[purpose] });
    }
    if (!enhancedWithdrawal) notify();
    if (panel) panel.hidden = true;
    return getState();
  }
  function setPreferences(choice) {
    if (!managed) return { ...getState(), managed: false, reason };
    if (!validPurposeChoice(choice)) throw new TypeError('Explicit boolean purpose choices required; Microsoft conversion matching also requires advertising');
    const copy = { analytics: choice.analytics, advertising: choice.advertising, ...(enhancedEnabled ? { microsoftEnhancedConversions: choice.microsoftEnhancedConversions } : {}) };
    const timestamp = Date.now();
    try { win.localStorage.setItem(cfg.storageKey, JSON.stringify({ version: cfg.policyVersion, at: timestamp, ...copy })); }
    catch {
      // Granting without a durable choice is refused. Withdrawal still applies
      // and reloads to a fresh denied default if storage is unavailable.
      if (state.analytics || state.advertising) return apply(deniedChoice());
      return { ...getState(), reason: 'choice_storage_unavailable' };
    }
    return apply(copy, timestamp);
  }
  function mount() {
    panel = win.document.querySelector('[data-rta-consent-ui]');
    if (!panel) return;
    panel.replaceChildren(); panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Privacy preferences');
    const heading = win.document.createElement('h2'); heading.textContent = 'Your privacy choices';
    const explanation = win.document.createElement('p'); explanation.textContent = enhancedEnabled
      ? 'Choose optional analytics and advertising measurement separately. Both start off. Microsoft conversion matching is a separate opt-in to share hashed email and phone numbers. Google advertising user-data sharing and personalisation remain off. Changing an active choice reloads this page; unsent form entries may be lost.'
      : 'Choose optional analytics and advertising measurement separately. Both start off. Advertising user-data sharing and personalisation remain off. Changing an active choice reloads this page; unsent form entries may be lost.';
    panel.append(heading, explanation);
    const inputs = {};
    const purposes = [['analytics', 'Analytics, including session insights'], ['advertising', 'Advertising measurement'], ...(enhancedEnabled ? [['microsoftEnhancedConversions', 'Share hashed email and phone numbers with Microsoft for conversion matching (requires advertising measurement)']] : [])];
    for (const [purpose, label] of purposes) {
      const row = win.document.createElement('label'); const input = win.document.createElement('input'); input.type = 'checkbox'; input.checked = state[purpose]; row.append(input, win.document.createTextNode(label)); panel.append(row); inputs[purpose] = input;
    }
    if (enhancedEnabled) {
      const syncMatchingChoice = () => { inputs.microsoftEnhancedConversions.disabled = !inputs.advertising.checked; if (!inputs.advertising.checked) inputs.microsoftEnhancedConversions.checked = false; };
      inputs.advertising.addEventListener('change', syncMatchingChoice); syncMatchingChoice();
    }
    for (const [label, action] of [['Save choices', () => setPreferences(Object.fromEntries(purposes.map(([purpose]) => [purpose, inputs[purpose].checked])))], ['Reject optional tracking', () => setPreferences(deniedChoice())], [enhancedEnabled ? 'Accept analytics and advertising' : 'Accept both purposes', () => setPreferences({ analytics: true, advertising: true, ...(enhancedEnabled ? { microsoftEnhancedConversions: false } : {}) })]]) {
      const button = win.document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', action); panel.append(button);
    }
    panel.hidden = known;
    for (const button of win.document.querySelectorAll('[data-rta-consent-open]')) { button.hidden = false; button.addEventListener('click', () => { panel.hidden = false; for (const [purpose] of purposes) inputs[purpose].checked = state[purpose]; if (enhancedEnabled) inputs.microsoftEnhancedConversions.disabled = !state.advertising; inputs.analytics.focus(); }); }
  }
  const api = {
    owner: 'rta-marketing-v1',
    getStatus: () => ({ managed, reason, loaded, reloadRequired, consentIntegrationReady: cfg.integrationReady === true }),
    consent: { getState: () => ({ ...getState(), managed }), setPreferences, rejectAll: () => setPreferences(deniedChoice()), openPreferences: () => { if (panel) panel.hidden = false; }, onChange: callback => { if (typeof callback !== 'function') throw new TypeError('Callback required'); listeners.add(callback); return () => listeners.delete(callback); } },
    attribution,
  };
  api.leads = createLeadClient({ ...config?.leadCapture, enabled: config?.enabled === true && config?.leadCapture?.enabled === true }, win, {
    getConsent: () => ({ analytics: state.analytics, advertising: state.advertising, known, policyVersion: cfg.policyVersion || 1, ...(known ? { recordedAt: new Date(choiceAt).toISOString() } : {}) }), getAttribution: attribution.get,
    onAccepted: event => { if (managed && (state.analytics || state.advertising)) win.dataLayer.push(event); },
  });
  win.RTAMarketing = api;
  if (managed) {
    try { commands('default', deniedChoice()); } catch { reason = 'consent_commands_failed'; return api; }
    let saved; try { saved = JSON.parse(win.localStorage.getItem(cfg.storageKey)); } catch { /* Defaults remain denied. */ }
    const choice = saved && { analytics: saved.analytics, advertising: saved.advertising, ...(enhancedEnabled ? { microsoftEnhancedConversions: saved.microsoftEnhancedConversions === undefined ? false : saved.microsoftEnhancedConversions } : {}) };
    if (validPurposeChoice(choice) && saved.version === cfg.policyVersion && Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at <= cfg.maxAgeDays * 86_400_000) apply(choice, saved.at);
    const actions = new Set(['request_quote', 'service_enquiry', 'company_profile_download']);
    win.document.addEventListener?.('click', event => {
      if ((!state.analytics && !state.advertising) || (event.button != null && event.button !== 0)) return;
      const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
      const element = target?.closest?.('[data-rta-action]'); const action = element?.getAttribute('data-rta-action');
      if (actions.has(action)) win.dataLayer.push({ event: action }); // Never copy arbitrary labels/URLs/attributes.
    });
    mount();
  }
  return api;
}

export function bootMarketing(win = globalThis.window) {
  const node = win?.document?.getElementById('rta-marketing-config');
  if (!node || node.type !== 'application/json') return { installed: false, reason: 'config_missing' };
  try { return installMarketing(JSON.parse(node.textContent), win); } catch { return { installed: false, reason: 'invalid_marketing_configuration' }; }
}
if (typeof window !== 'undefined') bootMarketing(window);
