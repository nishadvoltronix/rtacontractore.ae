// Application events only. GTM remains the sole Google/Clarity vendor loader.
export const EVENTS = Object.freeze({
  telephone: 'telephone_click',
  email: 'email_click',
  whatsapp: 'whatsapp_click',
  lead: 'contact_form_success',
  assistant: 'ai_engagement',
});

const OWNER = 'rta-source-tracking-v1';
const GUARD = '__rtaGtmEventsInstalled';
const INTENTS = new Set([EVENTS.telephone, EVENTS.email, EVENTS.whatsapp]);
const AI_KINDS = new Set(['open', 'voice_started', 'voice_ended', 'error']);
const AI_STATES = new Set(['Ready', 'Connecting', 'Listening', 'Thinking', 'Speaking', 'Responding', 'Ended', 'Error']);
const ACTIVE_AI_STATES = new Set(['Listening', 'Thinking', 'Speaking', 'Responding']);
const ACCEPTED_ZOHO_ACTIONS = new Set(['Splash Message', 'redirect_url', 'parent_redirect', 'thankyou_page']);
const ERROR_FIELDS = ['invalidCaptcha', 'error', 'errors', 'errorCode', 'error_code', 'errorMsg', 'error_msg'];
const MAX_ATTEMPTS = 256;
const RTA_FORM_ID = 'webform5653678000076526082';
const ZOHO_ENDPOINT = 'https://crm.zoho.com/crm/WebToLeadForm';
const RTA_ACK_PROFILE = 'rta-zoho-splash-ack-v1';
const RTA_ACK_MESSAGE = 'Thank you for your response.';

const result = (accepted, reason) => Object.freeze({ accepted, reason });
const plainObject = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const falseFlag = value => value === undefined || value === null || value === false
  || value === '' || value === 0 || value === 'false' || value === '0';
const exactKeys = (object, keys) => {
  const actual = Reflect.ownKeys(object);
  return actual.length === keys.length && keys.every(key => actual.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(object, key), 'value'));
};

function acceptanceProfileStatus(formId, endpoint, profile) {
  if (profile === undefined) {
    return { name: 'strict-success-boolean', ready: true, reason: 'explicit_success_required', boundary: 'provider_acceptance' };
  }
  if (!plainObject(profile) || profile.name !== RTA_ACK_PROFILE) {
    return { name: 'unsupported', ready: false, reason: 'unsupported_acceptance_profile', boundary: 'none' };
  }
  const ready = formId === RTA_FORM_ID && endpoint === ZOHO_ENDPOINT
    && exactKeys(profile, ['name', 'actionsubmit', 'actionvalue'])
    && profile.actionsubmit === 'Splash Message' && profile.actionvalue === RTA_ACK_MESSAGE;
  return { name: RTA_ACK_PROFILE, ready, reason: ready ? 'verified_exact_ack_required' : 'invalid_acceptance_profile',
    boundary: ready ? 'provider_acknowledgment' : 'none' };
}

// This is intentionally stricter than the vendor's UI code. A displayed splash,
// redirect, wfa_post_submit callback or HTTP 200 does not establish acceptance.
// A configured exact acknowledgment is limited to the verified RTA form receipt;
// without a profile the generic strict-success-boolean rule applies. Neither
// contract promises future CRM storage, qualification or human follow-up.
export async function validateZohoWebformResponse(response, endpoint, options = {}) {
  try {
    const acceptance = acceptanceProfileStatus(options.formId, endpoint, options.acceptanceProfile);
    if (!acceptance.ready) return result(false, acceptance.reason);
    const actual = new URL(response?.url);
    const expected = new URL(endpoint);
    if (actual.href !== expected.href
      || actual.username || actual.password || expected.protocol !== 'https:') {
      return result(false, 'unexpected_response_endpoint');
    }
    if (response.ok !== true || !Number.isInteger(response.status)
      || response.status < 200 || response.status >= 300 || response.type === 'opaque') {
      return result(false, 'http_not_accepted');
    }
    const contentType = response.headers?.get('content-type') || '';
    const jsonContentType = acceptance.name === RTA_ACK_PROFILE
      ? /^application\/json(?:\s*;|\s*$)/i : /^application\/(?:[\w.+-]+\+)?json(?:\s*;|\s*$)/i;
    if (!jsonContentType.test(contentType)) {
      return result(false, 'json_response_required');
    }
    // Never consume or replace the application's Response/body.
    const body = await response.clone().json();
    if (!plainObject(body)) return result(false, 'object_response_required');
    if (acceptance.name === RTA_ACK_PROFILE) {
      if (!exactKeys(body, ['actionsubmit', 'actionvalue'])) return result(false, 'unexpected_acknowledgment_schema');
      // The verified values cannot change while clone().json() is pending.
      if (body.actionsubmit !== 'Splash Message'
        || body.actionvalue !== RTA_ACK_MESSAGE) return result(false, 'unexpected_acknowledgment_value');
      return result(true, 'provider_acknowledged');
    }
    if (body.success !== true) return result(false, 'explicit_acceptance_missing');
    if (!ACCEPTED_ZOHO_ACTIONS.has(body.actionsubmit)) return result(false, 'unknown_response_action');
    if (ERROR_FIELDS.some(key => !falseFlag(body[key]))) return result(false, 'provider_error');
    if (body.status !== undefined && !['success', 'accepted'].includes(body.status)) {
      return result(false, 'provider_status_not_accepted');
    }
    return result(true, 'provider_accepted');
  } catch {
    return result(false, 'unreadable_provider_response');
  }
}

export function installTracking(config, windowObject = globalThis.window) {
  if (!windowObject?.document) return { installed: false, reason: 'document_unavailable' };
  if (windowObject.RTATracking?.owner === OWNER) {
    return { installed: true, reason: 'already_installed', api: windowObject.RTATracking };
  }
  if (config?.schemaVersion !== 1 || config.enabled !== true || !Array.isArray(config.allowedHosts)) {
    return { installed: false, reason: 'disabled_or_invalid_config' };
  }
  const host = String(windowObject.location?.hostname || '').toLowerCase();
  if (!config.allowedHosts.includes(host)) return { installed: false, reason: 'host_not_allowed' };
  // The previous GTM Custom HTML bridge uses this exact guard. If it already ran,
  // do not attach another click/form owner. A page reload after correct script
  // ordering is required; do not clear the guard to force installation.
  if (windowObject[GUARD]) return { installed: false, reason: 'existing_bridge_owns_tracking' };
  if (windowObject.RTATracking !== undefined) return { installed: false, reason: 'api_name_already_used' };
  const documentObject = windowObject.document;
  if (typeof documentObject.addEventListener !== 'function' || typeof windowObject.addEventListener !== 'function') {
    return { installed: false, reason: 'event_target_unavailable' };
  }
  if (windowObject.dataLayer === undefined) windowObject.dataLayer = [];
  if (typeof windowObject.dataLayer?.push !== 'function') return { installed: false, reason: 'invalid_data_layer' };

  const attempts = new Map();
  const formAcceptance = Object.freeze(acceptanceProfileStatus(config.form?.formId, config.form?.endpoint, config.form?.acceptanceProfile));
  // Snapshot the reviewed form binding. Later caller mutations cannot downgrade
  // a configured exact-ack profile to the generic default or change its scope.
  const form = Object.freeze({
    provider: config.form?.provider, formId: config.form?.formId, endpoint: config.form?.endpoint,
    mode: config.form?.mode, observeFetch: config.form?.observeFetch, submitTtlMs: config.form?.submitTtlMs,
    acceptanceProfile: config.form?.acceptanceProfile === undefined ? undefined
      : formAcceptance.ready ? Object.freeze({ name: RTA_ACK_PROFILE, actionsubmit: 'Splash Message', actionvalue: RTA_ACK_MESSAGE }) : null,
  });
  let sequence = 0;
  let aiStarted = false;
  let aiEnded = false;
  let aiErrored = false;
  let lastDuration = 0;
  let armedAttempt = null;
  let observerStatus = { enabled: form.observeFetch === true, installed: false, reason: 'disabled' };
  const push = payload => {
    try { windowObject.dataLayer.push(payload); return true; }
    catch { return false; } // Measurement must never break the enquiry UI.
  };

  function trackIntent(eventName) {
    return INTENTS.has(eventName) && push({ event: eventName });
  }

  function trackAIEngagement(kind, details = {}) {
    if (config.assistant?.enabled !== true || !AI_KINDS.has(kind)) return false;
    const payload = { event: EVENTS.assistant, interaction_type: kind };
    if (AI_STATES.has(details?.state)) payload.assistant_state = details.state;
    if (Number.isFinite(details?.duration) && details.duration >= 0 && details.duration <= 86400) {
      payload.duration_seconds = Math.floor(details.duration);
    }
    // No message text, transcript, contact details, URLs or arbitrary fields.
    return push(payload);
  }

  function beginFormAttempt(formId) {
    if (form.provider !== 'zoho_webform' || form.mode !== 'explicit-response-only'
      || !formAcceptance.ready || typeof formId !== 'string' || formId !== form.formId) return null;
    const random = windowObject.crypto?.randomUUID?.() || String(++sequence);
    const attemptId = `rta-${++sequence}-${random}`;
    attempts.set(attemptId, 'pending');
    if (attempts.size > MAX_ATTEMPTS) attempts.delete(attempts.keys().next().value);
    return attemptId;
  }

  async function confirmProviderReceipt(receipt) {
    if (receipt?.provider !== 'zoho_webform' || typeof receipt.attemptId !== 'string') {
      return { accepted: false, emitted: false, reason: 'unsupported_receipt' };
    }
    if (attempts.get(receipt.attemptId) !== 'pending') {
      return { accepted: false, emitted: false, reason: 'unknown_or_consumed_attempt' };
    }
    // Claim before awaiting to prevent simultaneous callbacks double-counting.
    attempts.set(receipt.attemptId, 'verifying');
    const verdict = await validateZohoWebformResponse(receipt.response, form.endpoint, {
      formId: form.formId, acceptanceProfile: form.acceptanceProfile,
    });
    if (!verdict.accepted) {
      attempts.set(receipt.attemptId, 'rejected');
      return { ...verdict, emitted: false };
    }
    // Attempt tokens and provider response data remain in memory, never analytics.
    const emitted = push({ event: EVENTS.lead });
    attempts.set(receipt.attemptId, emitted ? 'accepted' : 'rejected');
    return { ...verdict, emitted };
  }

  function installFormResponseObserver() {
    if (form.observeFetch !== true) return;
    const ttl = form.submitTtlMs;
    const setUnavailable = reason => { observerStatus = { enabled: true, installed: false, reason }; };
    if (form.provider !== 'zoho_webform' || form.mode !== 'explicit-response-only'
      || typeof form.formId !== 'string' || !Number.isInteger(ttl) || ttl < 1 || ttl > 30000) {
      setUnavailable('invalid_form_observer_config'); return;
    }
    if (!formAcceptance.ready) { setUnavailable(formAcceptance.reason); return; }
    let endpoint;
    try {
      endpoint = new URL(form.endpoint);
      if (endpoint.href !== ZOHO_ENDPOINT) throw new Error('Unsupported endpoint');
    } catch { setUnavailable('unsupported_form_endpoint'); return; }
    let originalFetch;
    try { originalFetch = windowObject.fetch; }
    catch { setUnavailable('fetch_unavailable'); return; }
    if (typeof originalFetch !== 'function') { setUnavailable('fetch_unavailable'); return; }
    const now = () => windowObject.performance?.now?.() ?? Date.now();

    // Read URL/method metadata only. Never inspect FormData, request bodies,
    // headers, contact fields, credentials, provider tokens or response text.
    function matchesRequest(input, init) {
      let href;
      let method = 'GET';
      if (typeof input === 'string') href = new URL(input, windowObject.location.href).href;
      else if (typeof windowObject.URL === 'function' && input instanceof windowObject.URL) href = input.href;
      else if (typeof windowObject.Request === 'function' && input instanceof windowObject.Request) {
        href = input.url; method = input.method;
      } else return false;
      if (init != null) {
        if (typeof init !== 'object') return false;
        const descriptor = Object.getOwnPropertyDescriptor(init, 'method');
        // Avoid invoking a method getter twice or guessing inherited overrides.
        if (!descriptor && 'method' in init) return false;
        if (descriptor && !('value' in descriptor)) return false;
        if (descriptor?.value !== undefined) {
          if (typeof descriptor.value !== 'string') return false;
          method = descriptor.value;
        }
      }
      return href === endpoint.href && typeof method === 'string' && method.toUpperCase() === 'POST';
    }

    const submit = event => {
      try {
        if (!observerStatus.installed) return;
        const target = event.target;
        if (target?.id !== form.formId || String(target.tagName || '').toLowerCase() !== 'form') return;
        if (armedAttempt) attempts.set(armedAttempt.id, 'superseded');
        const id = beginFormAttempt(target.id);
        if (id) armedAttempt = { id, expiresAt: now() + ttl };
      } catch { /* An observer cannot interfere with native form handling. */ }
    };

    // This is not async: returning the original promise is part of the contract.
    function observedFetch(...args) {
      const promise = Reflect.apply(originalFetch, this, args);
      try {
        if (!armedAttempt) return promise;
        if (now() > armedAttempt.expiresAt) {
          attempts.set(armedAttempt.id, 'expired'); armedAttempt = null; return promise;
        }
        if (!matchesRequest(args[0], args[1])) return promise;
        const attemptId = armedAttempt.id;
        armedAttempt = null; // At most one request claims each captured submit.
        if (typeof promise?.then !== 'function') {
          attempts.set(attemptId, 'unsupported_fetch_result');
          observerStatus = { enabled: true, installed: false, reason: 'unsupported_fetch_result', submitTtlMs: ttl };
          return promise;
        }
        const sidechain = promise.then(response => {
          // Clone inspection starts before returning control to later .then
          // handlers, but its completion never delays or replaces their promise.
          try {
            void confirmProviderReceipt({ provider: 'zoho_webform', attemptId, response }).catch(() => {});
          } catch { /* Observer failures cannot change application behavior. */ }
        }, () => { attempts.set(attemptId, 'network_rejected'); });
        sidechain?.catch?.(() => {});
      } catch { /* Metadata/observation failures leave native fetch unchanged. */ }
      return promise;
    }
    try {
      windowObject.fetch = observedFetch;
      if (windowObject.fetch !== observedFetch) { setUnavailable('fetch_not_replaceable'); return; }
    } catch { setUnavailable('fetch_not_replaceable'); return; }
    documentObject.addEventListener('submit', submit, true);
    observerStatus = { enabled: true, installed: true, reason: 'observing_exact_form_posts', submitTtlMs: ttl };
  }

  const click = event => {
    if (event.button != null && event.button !== 0) return;
    let target = event.target;
    if (target?.nodeType !== 1) target = target?.parentElement;
    const anchor = target?.closest?.('a[href]');
    if (!anchor) return;
    try {
      const url = new URL(anchor.getAttribute('href'), windowObject.location.href);
      if (url.protocol === 'tel:') trackIntent(EVENTS.telephone);
      else if (url.protocol === 'mailto:') trackIntent(EVENTS.email);
      else if (['http:', 'https:'].includes(url.protocol)
        && ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname.toLowerCase())) {
        trackIntent(EVENTS.whatsapp);
      }
    } catch { /* Invalid URLs have no measurement effect. */ }
  };

  const aiOpen = event => {
    aiStarted = false; aiEnded = false; aiErrored = false; lastDuration = 0;
    trackAIEngagement('open', event.detail);
  };
  const finishAI = details => {
    if (!aiStarted || aiEnded) return;
    aiEnded = true;
    trackAIEngagement('voice_ended', { state: 'Ended', duration: lastDuration, ...details });
  };
  const aiState = event => {
    const details = event.detail || {};
    if (Number.isFinite(details.duration) && details.duration >= 0 && details.duration <= 86400) {
      lastDuration = Math.floor(details.duration);
    }
    if (ACTIVE_AI_STATES.has(details.state) && !aiStarted) {
      aiStarted = true;
      trackAIEngagement('voice_started', details);
    } else if (details.state === 'Ended') finishAI(details);
    else if (details.state === 'Error' && !aiErrored) {
      aiErrored = true;
      trackAIEngagement('error', details);
    }
  };
  const aiClose = () => finishAI();

  const api = Object.freeze({
    owner: OWNER,
    trackIntent,
    trackAIEngagement,
    beginFormAttempt,
    confirmProviderReceipt,
    getStatus: () => Object.freeze({
      owner: OWNER,
      installed: true,
      formMode: 'explicit-response-only',
      formAcceptanceProfile: Object.freeze({ ...formAcceptance }),
      automaticFormResponseObservation: observerStatus.installed,
      formResponseObserver: Object.freeze({ ...observerStatus }),
      vendorLoading: 'gtm-only',
    }),
  });
  // A deferred/module source script must claim this before GTM's DOM Ready tag.
  // No splash observer is installed: visibility is not a provider receipt.
  windowObject[GUARD] = true;
  windowObject.RTATracking = api;
  documentObject.addEventListener('click', click, true);
  installFormResponseObserver();
  if (config.assistant?.enabled === true) {
    windowObject.addEventListener('talk2maries:open', aiOpen);
    windowObject.addEventListener('talk2maries:state', aiState);
    windowObject.addEventListener('talk2maries:close', aiClose);
    windowObject.addEventListener('talk2maries:closed', aiClose);
  }
  return { installed: true, reason: 'installed', api };
}

export function bootTrackingFromDocument(windowObject = globalThis.window) {
  const node = windowObject?.document?.getElementById?.('rta-tracking-config');
  if (!node || node.type !== 'application/json') return { installed: false, reason: 'config_node_missing' };
  try { return installTracking(JSON.parse(node.textContent), windowObject); }
  catch { return { installed: false, reason: 'invalid_config_json' }; }
}

if (typeof window !== 'undefined') bootTrackingFromDocument(window);
