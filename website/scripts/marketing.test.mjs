import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingConfig } from '../marketing.config.mjs';
import { installMarketing, CONSENT_EVENTS } from '../dist/assets/consent.js';
import { captureAttribution, safePageUrl, safeReferrer, createAttribution } from '../dist/assets/attribution.js';
import { createLeadClient } from '../dist/assets/lead-client.js';
globalThis.fetch = () => { throw new Error('Live network forbidden by marketing tests'); };

function environment({ stored, storageThrows = false, existingLoader = false } = {}) {
  const memory = new Map(stored ? [[marketingConfig.consent.storageKey, JSON.stringify(stored)]] : []);
  const calls = { reads: 0, writes: 0, scripts: [], reloads: 0, fetches: 0 };
  const storage = { getItem(key) { calls.reads++; if (storageThrows) throw new Error('Unavailable'); return memory.get(key) || null; }, setItem(key, value) { calls.writes++; if (storageThrows) throw new Error('Unavailable'); memory.set(key, value); }, removeItem(key) { memory.delete(key); } };
  const win = { location: { hostname: 'rtacontractor.ae', origin: 'https://rtacontractor.ae', href: 'https://rtacontractor.ae/', reload() { calls.reloads++; } }, localStorage: storage, sessionStorage: storage,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    fetch() { calls.fetches++; throw new Error('No provider network allowed'); },
    document: { referrer: '', getElementById() { return null; }, querySelector(selector) { return existingLoader && selector.startsWith('script') ? {} : null; }, querySelectorAll() { return []; }, createElement(tag) { return { tagName: tag }; }, head: { append(script) { calls.scripts.push(script); } } } };
  win.history = { state: null, replaceState(_, __, value) { win.location.href = value; } };
  return { win, calls, memory };
}
function activeConfig() { const config = structuredClone(marketingConfig); config.enabled = true; Object.assign(config.consent, { enabled: true, integrationReady: true, granularTagGatesVerified: true, urlAndReferrerPolicyVerified: true, coordinatedContainerVersion: 5 }); return config; }
const events = win => (win.dataLayer || []).filter(item => item?.event).map(item => item.event);

test('disabled marketing configuration is inert and does not pretend to gate existing tracking', async () => {
  const { win, calls } = environment(); const api = installMarketing(marketingConfig, win);
  assert.equal(api.getStatus().managed, false); assert.equal(calls.reads + calls.writes + calls.fetches + calls.scripts.length, 0);
  assert.equal(api.consent.getState().known, false); assert.equal((await api.leads.submit({})).enabled, false);
  assert.deepEqual(api.consent.rejectAll().managed, false); assert.equal(win.dataLayer, undefined);
});
test('active coordinated controller begins denied with zero vendor loaders', () => {
  const { win, calls } = environment(); const api = installMarketing(activeConfig(), win);
  assert.equal(api.getStatus().managed, true); assert.equal(calls.scripts.length, 0);
  assert.deepEqual(events(win), [CONSENT_EVENTS.update]); assert.equal(win.dataLayer.at(-1).rta_consent_analytics, 'denied');
  const command = [...win.dataLayer[0]]; assert.equal(command[1], 'default'); assert.equal(command[2].ad_user_data, 'denied'); assert.equal(command[2].ad_personalization, 'denied');
});
test('analytics and advertising grant independently, once each, with one GTM loader', () => {
  const { win, calls } = environment(); const api = installMarketing(activeConfig(), win);
  api.consent.setPreferences({ analytics: true, advertising: false });
  assert.equal(calls.scripts.length, 1); assert(events(win).includes(CONSENT_EVENTS.analytics)); assert(!events(win).includes(CONSENT_EVENTS.advertising));
  api.consent.setPreferences({ analytics: true, advertising: true }); api.consent.setPreferences({ analytics: true, advertising: true });
  assert.equal(calls.scripts.length, 1); assert.equal(events(win).filter(event => event === CONSENT_EVENTS.analytics).length, 1); assert.equal(events(win).filter(event => event === CONSENT_EVENTS.advertising).length, 1);
  assert.equal(calls.scripts[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-PRV2VCLK');
  const updates = win.dataLayer.filter(item => item?.[0] === 'consent'); assert(updates.every(item => item[2].ad_user_data === 'denied' && item[2].ad_personalization === 'denied'));
});
test('withdrawal persists denial, updates state and resets document without claiming vendor unload', () => {
  const { win, calls, memory } = environment(); const api = installMarketing(activeConfig(), win); api.consent.setPreferences({ analytics: true, advertising: true });
  const result = api.consent.rejectAll(); assert.equal(result.reloadRequired, true); assert.equal(calls.reloads, 1);
  assert.equal(JSON.parse(memory.get(marketingConfig.consent.storageKey)).analytics, false); assert.equal(api.consent.getState().advertising, false);
});
test('broken provider command and observer cannot prevent persisted withdrawal and reload', () => {
  const { win, calls, memory } = environment(); const api = installMarketing(activeConfig(), win); api.consent.setPreferences({ analytics: true, advertising: true });
  api.consent.onChange(() => { throw new Error('Fixture observer failure'); }); win.clarity = () => { throw new Error('Fixture SDK failure'); };
  api.consent.rejectAll(); assert.equal(calls.reloads, 1); assert.equal(JSON.parse(memory.get(marketingConfig.consent.storageKey)).advertising, false);
});
test('invalid, expired, unavailable and stale-policy choices never enable tags', () => {
  for (const stored of [{ version: 0, at: Date.now(), analytics: true, advertising: true }, { version: 1, at: Date.now() + 100000, analytics: true, advertising: true }, { version: 1, at: 0, analytics: true, advertising: true }, { version: 1, at: Date.now(), analytics: 'true', advertising: true }]) {
    const { win, calls } = environment({ stored }); installMarketing(activeConfig(), win); assert.equal(calls.scripts.length, 0);
  }
  const { win, calls } = environment({ storageThrows: true }); const api = installMarketing(activeConfig(), win); assert.equal(api.consent.setPreferences({ analytics: true, advertising: true }).reason, 'choice_storage_unavailable'); assert.equal(calls.scripts.length, 0);
});
test('configuration is pinned; host mismatch, incomplete integration and prior loaders are not managed', () => {
  const config = activeConfig(); const first = environment(); const api = installMarketing(config, first.win); config.consent.containerId = 'GTM-OTHER'; api.consent.setPreferences({ analytics: true, advertising: false }); assert(first.calls.scripts[0].src.includes('GTM-PRV2VCLK'));
  for (const patch of [{ integrationReady: false }, { granularTagGatesVerified: false }, { urlAndReferrerPolicyVerified: false }, { coordinatedContainerVersion: null }]) { const c = activeConfig(); Object.assign(c.consent, patch); assert.equal(installMarketing(c, environment().win).getStatus().managed, false); }
  const old = environment({ existingLoader: true }); assert.equal(installMarketing(activeConfig(), old.win).getStatus().reason, 'preexisting_gtm_loader'); assert.equal(old.calls.scripts.length, 0);
  const foreign = environment(); foreign.win.location.hostname = 'foreign.invalid'; assert.equal(installMarketing(activeConfig(), foreign.win).getStatus().managed, false);
});
test('consent input requires actual booleans; repeated boot retains one owner', () => {
  const { win } = environment(); const api = installMarketing(activeConfig(), win); assert.equal(installMarketing(activeConfig(), win), api);
  for (const choice of [{ analytics: 'true', advertising: false }, { analytics: true }, { analytics: true, advertising: true, extra: true }, null]) assert.throws(() => api.consent.setPreferences(choice));
});
test('attribution is bounded, consent-aware and excludes arbitrary URLs/contact values', () => {
  const url = 'https://rtacontractor.ae/contact/?utm_source=google&utm_medium=cpc&email=PRIVATE@example.invalid&gclid=abc_123&msclkid=xyz-123&utm_term=person@example.invalid';
  assert.deepEqual(captureAttribution(url, '', { analytics: false, advertising: false }, ['/contact/']), {});
  const analytics = captureAttribution(url, 'https://private.invalid/PRIVATE?email=PRIVATE', { analytics: true, advertising: false }, ['/contact/']);
  assert.equal(analytics.gclid, undefined); assert.equal(analytics.utm_term, undefined); assert.equal(analytics.sourceGroup, 'paid'); assert.equal(analytics.landingPath, '/contact/');
  const ads = captureAttribution(url, '', { analytics: false, advertising: true }, ['/contact/']); assert.equal(ads.gclid, 'abc_123');
  assert.doesNotMatch(JSON.stringify(analytics), /PRIVATE|@|https:|referrer/);
  assert.equal(safePageUrl(url + '#PRIVATE', { analytics: true, advertising: false }, ['/contact/']), 'https://rtacontractor.ae/contact/');
  assert.throws(() => safePageUrl('https://rtacontractor.ae/PRIVATE@example.invalid', { analytics: true }, ['/']));
  assert.equal(safeReferrer('https://chatgpt.com/PRIVATE?email=PRIVATE'), 'https://chatgpt.com');
  assert.equal(safeReferrer('https://PRIVATE.invalid/customer?email=PRIVATE'), '');
});
test('vendor page/referrer metadata rejects URL credentials, HTTP and non-default ports', () => {
  for (const href of ['https://fixture-user:fixture-password@rtacontractor.ae/', 'http://rtacontractor.ae/', 'https://rtacontractor.ae:3100/']) assert.throws(() => safePageUrl(href, { analytics: true }, ['/']));
  assert.equal(safePageUrl('https://rtacontractor.ae:443/', { analytics: true }, ['/']), 'https://rtacontractor.ae/');
  for (const referrer of ['https://fixture-user:fixture-password@google.com/', 'http://google.com/', 'https://google.com:3100/']) assert.equal(safeReferrer(referrer), '');
  assert.equal(safeReferrer('https://google.com:443/search?q=PRIVATE'), 'https://google.com');
});
test('pre-tag URL cleaning strips private parameters and unknown anchors before provider load', () => {
  const { win, calls } = environment(); win.location.href = 'https://rtacontractor.ae/?email=PRIVATE%40example.invalid&utm_source=google#PRIVATE';
  const api = installMarketing(activeConfig(), win); api.consent.setPreferences({ analytics: true, advertising: false });
  assert.equal(win.location.href, 'https://rtacontractor.ae/?utm_source=google'); assert.equal(calls.scripts.length, 1);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|@/);
});
test('last non-direct referral survives internal navigation without exposing referrer paths', () => {
  const { win } = environment(); win.document.referrer = 'https://chatgpt.com/PRIVATE?email=PRIVATE';
  const config = { ...marketingConfig.attribution, enabled: true };
  const attribution = createAttribution(config, win, () => ({ analytics: true, advertising: false })); assert.equal(attribution.refresh().sourceGroup, 'ai_referral');
  win.location.href = 'https://rtacontractor.ae/contact/'; win.document.referrer = 'https://rtacontractor.ae/';
  const next = attribution.refresh(); assert.equal(next.sourceGroup, 'ai_referral'); assert.equal(next.referrerHost, 'chatgpt.com'); assert.equal(next.landingPath, '/'); assert.doesNotMatch(JSON.stringify(next), /PRIVATE|email|https:/);
});
test('unreviewed path refuses the container rather than sending an unknown page URL', () => {
  const { win, calls } = environment(); win.location.href = 'https://rtacontractor.ae/PRIVATE@example.invalid'; const api = installMarketing(activeConfig(), win);
  api.consent.setPreferences({ analytics: true, advertising: false }); assert.equal(calls.scripts.length, 0); assert.equal(api.getStatus().reason, 'page_url_not_sanitized'); assert(!events(win).includes(CONSENT_EVENTS.analytics));
});
test('new CTA events are allowlisted, purpose-gated and event-only', () => {
  const { win } = environment(); let click;
  win.document.addEventListener = (_, callback) => { click = callback; };
  const api = installMarketing(activeConfig(), win);
  const event = action => ({ button: 0, target: { nodeType: 1, closest: () => ({ getAttribute: () => action }) } });
  click(event('request_quote')); assert(!events(win).includes('request_quote'));
  api.consent.setPreferences({ analytics: true, advertising: false }); click(event('request_quote')); click(event('PRIVATE@example.invalid'));
  assert.deepEqual(win.dataLayer.filter(item => item?.event === 'request_quote'), [{ event: 'request_quote' }]); assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|@/);
});
test('lead client disabled path does not call providers or intercept the Zoho form', async () => {
  const { win, calls } = environment(); const client = createLeadClient(marketingConfig.leadCapture, win);
  assert.equal((await client.prepare()).enabled, false); assert.equal((await client.submit({ email: 'PRIVATE' })).accepted, false); assert.equal(calls.fetches, 0);
});
test('lead client keeps the same key/body after network ambiguity and emits only accepted status once', async () => {
  const { win } = environment(); const calls = []; const emitted = []; let posts = 0;
  win.fetch = async (url, init) => { calls.push({ url, init }); if (url.endsWith('/challenge')) return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ challenge: 'fixture-challenge' }) }; if (url.endsWith('/status')) return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: true, status: 'accepted', duplicate: false }) }; if (++posts === 1) throw new Error('Mock ambiguous network'); return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: false, status: 'queued', duplicate: false }) }; };
  const client = createLeadClient({ ...marketingConfig.leadCapture, enabled: true, providerSwitchVerified: true, emitClientSuccess: true }, win, { onAccepted: event => emitted.push(event) });
  await client.prepare(); await assert.rejects(client.submit({ customerName: 'PRIVATE-FIXTURE' })); await client.submit({ customerName: 'Changed retry' }); assert.equal(emitted.length, 0);
  assert.equal(calls[1].init.body, calls[2].init.body); assert.equal(calls[1].init.headers['Idempotency-Key'], calls[2].init.headers['Idempotency-Key']);
  await client.status(); await client.status(); assert.deepEqual(emitted, [{ event: 'contact_form_success' }]); assert.doesNotMatch(JSON.stringify(emitted), /PRIVATE|customerName|challenge/);
});
test('manual validation recovery is allowed only before queueing, never after an ambiguous/queued request', async () => {
  const { win } = environment(); let posts = 0;
  win.fetch = async url => url.endsWith('/challenge') ? { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ challenge: 'fixture-challenge' }) }
    : ++posts === 1 ? { ok: false, status: 400, headers: { get: () => 'application/json' }, json: async () => ({ accepted: false, error: 'invalid_fields' }) }
      : { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: false, status: 'queued', duplicate: false }) };
  const client = createLeadClient({ ...marketingConfig.leadCapture, enabled: true, providerSwitchVerified: true }, win);
  await client.prepare(); await assert.rejects(client.submit({ lastName: '' }));
  // Even if the same attempt is later accepted for queueing, no stale error flag
  // may allow a second provider/key after an uncertain delivery boundary.
  await client.submit({ lastName: 'Changed fixture' }); assert.equal(client.resetRejectedAttempt(), false);
});
test('accepted server duplicate aliases do not count another browser conversion', async () => {
  const { win } = environment(); const emitted = [];
  win.fetch = async url => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => url.endsWith('/challenge') ? { challenge: 'fixture-challenge' } : { accepted: true, status: 'accepted', duplicate: true } });
  const client = createLeadClient({ ...marketingConfig.leadCapture, enabled: true, providerSwitchVerified: true, emitClientSuccess: true }, win, { onAccepted: event => emitted.push(event) });
  await client.prepare(); assert.equal((await client.submit({ lastName: 'Fixture' })).accepted, true); await client.status(); assert.deepEqual(emitted, []);
});

function enhancedConsentConfig() {
  const config = activeConfig();
  config.consent.microsoftEnhancedConversionsEnabled = true;
  return config;
}

test('Microsoft matching is disabled by default and cannot be granted through the two-purpose contract', () => {
  assert.equal(marketingConfig.consent.microsoftEnhancedConversionsEnabled, false);
  const { win } = environment(); const api = installMarketing(activeConfig(), win);
  assert.equal(Object.hasOwn(api.consent.getState(), 'microsoftEnhancedConversions'), false);
  api.consent.setPreferences({ analytics: true, advertising: true });
  assert.equal(Object.hasOwn(api.consent.getState(), 'microsoftEnhancedConversions'), false);
  assert.throws(() => api.consent.setPreferences({ analytics: true, advertising: true, microsoftEnhancedConversions: true }));
});

test('legacy consent restores measurement choices without opting into Microsoft matching', () => {
  const { win, calls } = environment({ stored: { version: 1, at: Date.now(), analytics: true, advertising: true } });
  const api = installMarketing(enhancedConsentConfig(), win);
  assert.equal(api.consent.getState().known, true);
  assert.equal(api.consent.getState().advertising, true);
  assert.equal(api.consent.getState().microsoftEnhancedConversions, false);
  assert.equal(calls.scripts.length, 1);
});

test('Microsoft matching requires its own explicit boolean choice and advertising permission', () => {
  const { win, memory } = environment(); const api = installMarketing(enhancedConsentConfig(), win);
  assert.equal(api.consent.getState().known, false);
  assert.equal(api.consent.getState().microsoftEnhancedConversions, false);
  for (const choice of [
    { analytics: false, advertising: true },
    { analytics: false, advertising: true, microsoftEnhancedConversions: 'true' },
    { analytics: true, advertising: false, microsoftEnhancedConversions: true },
    { analytics: false, advertising: true, microsoftEnhancedConversions: true, extra: true },
  ]) assert.throws(() => api.consent.setPreferences(choice));
  const result = api.consent.setPreferences({ analytics: false, advertising: true, microsoftEnhancedConversions: true });
  assert.equal(result.microsoftEnhancedConversions, true);
  const saved = JSON.parse(memory.get(marketingConfig.consent.storageKey));
  assert.equal(saved.microsoftEnhancedConversions, true);
  const next = environment({ stored: saved });
  assert.equal(installMarketing(enhancedConsentConfig(), next.win).consent.getState().microsoftEnhancedConversions, true);
  const commands = win.dataLayer.filter(item => item?.[0] === 'consent');
  assert(commands.every(item => item[2].ad_user_data === 'denied' && item[2].ad_personalization === 'denied'));
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /\bpid\b|\bem\b|\bph\b/);
});

test('Microsoft matching withdrawal immediately notifies before vendor commands and reload', () => {
  const { win, calls, memory } = environment(); const api = installMarketing(enhancedConsentConfig(), win);
  api.consent.setPreferences({ analytics: true, advertising: true, microsoftEnhancedConversions: true });
  const order = [];
  api.consent.onChange(state => order.push(['notify', state.microsoftEnhancedConversions]));
  win.uetq.push = () => { order.push(['vendor']); throw new Error('Mock vendor failure'); };
  win.location.reload = () => { order.push(['reload']); calls.reloads++; };
  const result = api.consent.setPreferences({ analytics: true, advertising: true, microsoftEnhancedConversions: false });
  assert.equal(result.microsoftEnhancedConversions, false); assert.equal(result.reloadRequired, true);
  assert.deepEqual(order, [['notify', false], ['vendor'], ['reload']]);
  assert.equal(calls.reloads, 1);
  assert.equal(JSON.parse(memory.get(marketingConfig.consent.storageKey)).microsoftEnhancedConversions, false);
});

test('reject, expired choices and invalid saved advertising combinations never retain Microsoft matching', () => {
  for (const stored of [
    { version: 1, at: 0, analytics: true, advertising: true, microsoftEnhancedConversions: true },
    { version: 1, at: Date.now(), analytics: true, advertising: false, microsoftEnhancedConversions: true },
    { version: 1, at: Date.now(), analytics: true, advertising: true, microsoftEnhancedConversions: 'true' },
  ]) {
    const { win } = environment({ stored }); const api = installMarketing(enhancedConsentConfig(), win);
    assert.equal(api.consent.getState().known, false);
    assert.equal(api.consent.getState().microsoftEnhancedConversions, false);
  }
  const { win } = environment(); const api = installMarketing(enhancedConsentConfig(), win);
  api.consent.setPreferences({ analytics: false, advertising: true, microsoftEnhancedConversions: true });
  const result = api.consent.rejectAll();
  assert.equal(result.analytics, false); assert.equal(result.advertising, false);
  assert.equal(result.microsoftEnhancedConversions, false);
});

test('consent panel offers Microsoft matching separately and its two-measurement shortcut does not grant it', () => {
  const { win } = environment();
  const elements = [];
  const element = tag => ({ tagName: tag, children: [], handlers: {}, append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; }, setAttribute() {}, addEventListener(event, fn) { this.handlers[event] = fn; }, focus() {} });
  const panel = element('section');
  win.document.querySelector = selector => selector === '[data-rta-consent-ui]' ? panel : null;
  win.document.createElement = tag => { const node = element(tag); elements.push(node); return node; };
  win.document.createTextNode = text => ({ textContent: text });
  const api = installMarketing(enhancedConsentConfig(), win);
  const labels = elements.filter(node => node.tagName === 'label');
  assert.equal(labels.length, 3);
  assert.match(labels[2].children[1].textContent, /hashed email and phone numbers with Microsoft/);
  const matching = labels[2].children[0];
  assert.equal(matching.checked, false); assert.equal(matching.disabled, true);
  const acceptMeasurement = elements.find(node => node.textContent === 'Accept analytics and advertising');
  acceptMeasurement.handlers.click();
  assert.equal(api.consent.getState().advertising, true);
  assert.equal(api.consent.getState().microsoftEnhancedConversions, false);
});
