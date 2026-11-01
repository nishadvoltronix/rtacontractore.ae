import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingConfig } from '../tracking.config.mjs';
import { EVENTS, installTracking, bootTrackingFromDocument, validateZohoWebformResponse } from '../dist/assets/tracking.js';

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    const items = this.listeners.get(type) || [];
    items.push(callback); this.listeners.set(type, items);
  }
  dispatch(type, detail = {}) {
    for (const callback of this.listeners.get(type) || []) callback(detail);
  }
}
function environment(hostname = 'rtacontractor.ae') {
  const win = new Target();
  win.document = new Target();
  win.document.getElementById = () => null;
  win.location = { hostname, href: `https://${hostname}/` };
  win.dataLayer = [{ event: 'existing' }];
  let random = 0;
  win.crypto = { randomUUID: () => `test-${++random}` };
  return win;
}
function response(body, overrides = {}) {
  return {
    url: trackingConfig.form.endpoint,
    status: 200,
    ok: true,
    type: 'cors',
    headers: { get: () => 'application/json; charset=UTF-8' },
    clone: () => ({ json: async () => structuredClone(body) }),
    ...overrides,
  };
}
// Sanitized literal captured from the authorized 2026-11-01 provider/CRM test.
const accepted = () => ({ actionvalue: 'Thank you for your response.', actionsubmit: 'Splash Message' });
const strictAccepted = () => ({ success: true, actionsubmit: 'Splash Message', actionvalue: 'Thank you' });
const config = () => structuredClone(trackingConfig);
const profileOptions = () => ({ formId: trackingConfig.form.formId, acceptanceProfile: structuredClone(trackingConfig.form.acceptanceProfile) });
function click(win, href, button = 0) {
  const anchor = { getAttribute: () => href };
  win.document.dispatch('click', { button, target: { nodeType: 1, closest: () => anchor } });
}
function submit(win, id = trackingConfig.form.formId, tagName = 'FORM') {
  win.document.dispatch('submit', { target: { id, tagName } });
}
const drain = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('one owner preserves the existing data layer and refuses a legacy bridge', () => {
  const win = environment();
  const layer = win.dataLayer;
  const installed = installTracking(config(), win);
  assert.equal(installed.installed, true);
  assert.equal(win.dataLayer, layer);
  assert.equal(win.__rtaGtmEventsInstalled, true);
  assert.equal(installTracking(config(), win).api, installed.api);
  click(win, 'tel:+97148240002');
  assert.deepEqual(layer, [{ event: 'existing' }, { event: 'telephone_click' }]);
  const legacy = environment(); legacy.__rtaGtmEventsInstalled = true;
  assert.equal(installTracking(config(), legacy).reason, 'existing_bridge_owns_tracking');
  assert.equal(legacy.RTATracking, undefined);
  assert.equal(legacy.document.listeners.size, 0);
});

test('host and configuration checks fail closed without claiming the guard', () => {
  for (const host of ['other.example', 'rtacontractor.ae.evil.example', 'localhost']) {
    const win = environment(host);
    assert.equal(installTracking(config(), win).reason, 'host_not_allowed');
    assert.equal(win.__rtaGtmEventsInstalled, undefined);
  }
  const disabled = config(); disabled.enabled = false;
  const win = environment();
  assert.equal(installTracking(disabled, win).installed, false);
  assert.equal(win.__rtaGtmEventsInstalled, undefined);
  assert.equal(installTracking(config(), environment('www.rtacontractor.ae')).installed, true);
});

test('contact intent is allowlisted and no clicked address enters analytics', () => {
  const win = environment(); const { api } = installTracking(config(), win);
  click(win, 'mailto:someone@example.com?subject=private');
  click(win, 'https://wa.me/971502420957?text=private');
  click(win, 'https://api.whatsapp.com/send?phone=private');
  click(win, 'https://web.whatsapp.com/send?text=private');
  click(win, 'https://notwa.me/private');
  click(win, 'javascript:alert(1)');
  click(win, 'tel:+97148240002', 2);
  assert.equal(api.trackIntent(EVENTS.lead), false);
  assert.deepEqual(win.dataLayer.slice(1), [
    { event: 'email_click' }, { event: 'whatsapp_click' },
    { event: 'whatsapp_click' }, { event: 'whatsapp_click' },
  ]);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /someone|private|971/);
});

test('DOM splash, submit and assistant opening never produce a form lead', () => {
  const win = environment(); installTracking(config(), win);
  win.document.dispatch('submit', { target: { id: trackingConfig.form.formId } });
  win.document.dispatch('change', { target: { id: 'wf_splash', textContent: 'Thank you' } });
  win.dispatch('talk2maries:open', { detail: { state: 'Connecting', duration: 0 } });
  win.dispatch('talk2maries:ready', { detail: { state: 'Ready', duration: 0 } });
  assert.equal(win.dataLayer.filter(x => x.event === EVENTS.lead).length, 0);
  assert.deepEqual(win.dataLayer[1], { event: 'ai_engagement', interaction_type: 'open', assistant_state: 'Connecting', duration_seconds: 0 });
});

test('AI state updates are engagement only, sanitized and not repeated each second', () => {
  const win = environment(); const { api } = installTracking(config(), win);
  win.dispatch('talk2maries:open', { detail: { state: 'Ready', duration: 0 } });
  for (let duration = 1; duration <= 3; duration++) {
    win.dispatch('talk2maries:state', { detail: { state: 'Listening', duration, transcript: 'PRIVATE' } });
  }
  win.dispatch('talk2maries:state', { detail: { state: 'Ended', duration: 4 } });
  win.dispatch('talk2maries:close'); win.dispatch('talk2maries:closed');
  assert.deepEqual(win.dataLayer.slice(1).map(x => x.interaction_type), ['open', 'voice_started', 'voice_ended']);
  assert.equal(api.trackAIEngagement('lead', { email: 'private@example.com' }), false);
  api.trackAIEngagement('error', { state: 'unknown', duration: Infinity, transcript: 'PRIVATE' });
  assert.deepEqual(win.dataLayer.at(-1), { event: 'ai_engagement', interaction_type: 'error' });
  assert.equal(win.dataLayer.some(x => x.event === EVENTS.lead), false);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|private@/);
});

test('default strict boolean validator rejects UI success, unknown contracts, errors and wrong endpoints', async () => {
  const cases = [
    [response(accepted()), 'explicit_acceptance_missing'],
    [response({ ...strictAccepted(), success: 'true' }), 'explicit_acceptance_missing'],
    [response({ ...strictAccepted(), success: false }), 'explicit_acceptance_missing'],
    [response({ ...strictAccepted(), invalidCaptcha: 'true' }), 'provider_error'],
    [response({ ...strictAccepted(), errors: ['rejected'] }), 'provider_error'],
    [response({ ...strictAccepted(), actionsubmit: 'error_msg' }), 'unknown_response_action'],
    [response({ ...strictAccepted(), actionsubmit: 'unknown' }), 'unknown_response_action'],
    [response({ ...strictAccepted(), status: 'failed' }), 'provider_status_not_accepted'],
    [response(strictAccepted(), { status: 500, ok: false }), 'http_not_accepted'],
    [response(strictAccepted(), { type: 'opaque' }), 'http_not_accepted'],
    [response(strictAccepted(), { url: 'https://crm.zoho.com/other-endpoint' }), 'unexpected_response_endpoint'],
    [response(strictAccepted(), { url: 'https://crm.zoho.com.evil.example/crm/WebToLeadForm' }), 'unexpected_response_endpoint'],
    [response(strictAccepted(), { headers: { get: () => 'text/html' } }), 'json_response_required'],
    [response([strictAccepted()]), 'object_response_required'],
    [response(strictAccepted(), { clone: () => { throw new Error('body consumed'); } }), 'unreadable_provider_response'],
  ];
  for (const [candidate, reason] of cases) {
    assert.deepEqual(await validateZohoWebformResponse(candidate, trackingConfig.form.endpoint), { accepted: false, reason });
  }
  assert.deepEqual(await validateZohoWebformResponse(response(strictAccepted()), trackingConfig.form.endpoint),
    { accepted: true, reason: 'provider_accepted' });
});

test('verified RTA acknowledgment accepts only the observed exact two-key receipt', async () => {
  const endpoint = trackingConfig.form.endpoint;
  const validate = candidate => validateZohoWebformResponse(candidate, endpoint, profileOptions());
  assert.deepEqual(await validate(response(accepted())), { accepted: true, reason: 'provider_acknowledged' });
  // JSON member order does not change the two-key schema.
  assert.equal((await validate(response({ actionsubmit: 'Splash Message', actionvalue: 'Thank you for your response.' }))).accepted, true);
  for (const body of [
    { ...accepted(), success: true }, strictAccepted(),
    { ...accepted(), invalidCaptcha: false }, { ...accepted(), invalidCaptcha: 'true' },
    { ...accepted(), error: '' }, { ...accepted(), errors: [] }, { ...accepted(), status: 'success' },
    { ...accepted(), email: 'PRIVATE@example.com' },
    { actionvalue: 'Thank you for your response.' }, { actionsubmit: 'Splash Message' }, {},
  ]) assert.equal((await validate(response(body))).reason, 'unexpected_acknowledgment_schema');
  for (const body of [
    { ...accepted(), actionvalue: 'Thank you' }, { ...accepted(), actionvalue: 'Thank you for your response. ' },
    { ...accepted(), actionvalue: '<p>Thank you for your response.</p>' },
    { ...accepted(), actionvalue: 'Unable to submit' }, { ...accepted(), actionvalue: null },
    { ...accepted(), actionsubmit: 'redirect_url' }, { ...accepted(), actionsubmit: 'splash message' },
  ]) assert.equal((await validate(response(body))).reason, 'unexpected_acknowledgment_value');
  for (const body of [null, 'Thank you for your response.', [accepted()], 1]) {
    assert.equal((await validate(response(body))).reason, 'object_response_required');
  }
  const inherited = Object.create({ actionvalue: accepted().actionvalue }); inherited.actionsubmit = 'Splash Message';
  assert.equal((await validate(response(inherited, { clone: () => ({ json: async () => inherited }) }))).accepted, false);
  const hiddenExtra = { ...accepted() }; Object.defineProperty(hiddenExtra, 'error', { value: 'rejected' });
  const symbolExtra = { ...accepted(), [Symbol('extra')]: 'PRIVATE' };
  const accessor = { actionsubmit: 'Splash Message' }; let valueReads = 0;
  Object.defineProperty(accessor, 'actionvalue', { get() { valueReads++; return accepted().actionvalue; } });
  for (const body of [hiddenExtra, symbolExtra, accessor]) {
    assert.equal((await validate(response(body, { clone: () => ({ json: async () => body }) }))).accepted, false);
  }
  assert.equal(valueReads, 0);
  for (const overrides of [
    { status: 400, ok: false }, { status: 500, ok: false }, { status: 200, ok: false },
    { status: 0, type: 'opaque' }, { headers: { get: () => 'text/html' } },
    { headers: { get: () => 'application/problem+json' } },
    { headers: { get: () => '' } }, { url: endpoint + '?unexpected=1' }, { url: endpoint + '#unexpected' },
    { url: endpoint.replace('https:', 'http:') }, { url: endpoint.replace('/crm/', '/other/') },
  ]) assert.equal((await validate(response(accepted(), overrides))).accepted, false);
  assert.equal((await validate(response(accepted(), { clone: () => ({ json: async () => { throw new SyntaxError('Invalid JSON'); } }) }))).accepted, false);
});

test('acknowledgment profile is pinned to the RTA form and endpoint; unknown profiles fail closed', async () => {
  for (const profile of [null, false, {}, 'rta-zoho-splash-ack-v1',
    { ...profileOptions().acceptanceProfile, name: 'unknown' },
    { ...profileOptions().acceptanceProfile, actionvalue: 'Another message' },
    { ...profileOptions().acceptanceProfile, extra: true },
  ]) {
    const cfg = config(); cfg.form.acceptanceProfile = profile;
    const win = environment(); const native = () => Promise.resolve(response(accepted())); win.fetch = native;
    const { api } = installTracking(cfg, win);
    assert.equal(api.beginFormAttempt(cfg.form.formId), null);
    assert.equal(api.getStatus().formAcceptanceProfile.ready, false);
    assert.equal(api.getStatus().automaticFormResponseObservation, false);
    assert.equal(win.fetch, native);
    assert.equal((await validateZohoWebformResponse(response(accepted()), cfg.form.endpoint,
      { formId: cfg.form.formId, acceptanceProfile: profile })).accepted, false);
  }
  for (const options of [{ ...profileOptions(), formId: 'another-form' },
    { acceptanceProfile: profileOptions().acceptanceProfile }]) {
    assert.equal((await validateZohoWebformResponse(response(accepted()), trackingConfig.form.endpoint, options)).accepted, false);
  }
  assert.equal((await validateZohoWebformResponse(response(accepted()), trackingConfig.form.endpoint + '?changed=1', profileOptions())).accepted, false);
  for (const field of ['formId', 'endpoint']) {
    const cfg = config(); cfg.form[field] += '-changed'; const win = environment();
    win.fetch = () => Promise.resolve(response(accepted()));
    const { api } = installTracking(cfg, win);
    assert.equal(api.beginFormAttempt(cfg.form.formId), null);
    assert.equal(api.getStatus().formAcceptanceProfile.ready, false);
    assert.equal(api.getStatus().automaticFormResponseObservation, false);
  }
  const cfg = config(); delete cfg.form.acceptanceProfile;
  const { api } = installTracking(cfg, environment());
  assert.equal(api.getStatus().formAcceptanceProfile.name, 'strict-success-boolean');
  const attemptId = api.beginFormAttempt(cfg.form.formId);
  assert.equal((await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId, response: response(strictAccepted()) })).emitted, true);
});

test('verified values remain pinned while response JSON or caller configuration changes', async () => {
  const options = profileOptions(); const json = deferred();
  const verdict = validateZohoWebformResponse(response(null, { clone: () => ({ json: () => json.promise }) }),
    trackingConfig.form.endpoint, options);
  options.acceptanceProfile.actionvalue = 'Changed unverified message';
  options.acceptanceProfile.actionsubmit = 'redirect_url';
  json.resolve({ actionvalue: options.acceptanceProfile.actionvalue, actionsubmit: options.acceptanceProfile.actionsubmit });
  assert.equal((await verdict).accepted, false);

  const cfg = config(); const win = environment(); let nextBody = strictAccepted();
  win.fetch = () => Promise.resolve(response(nextBody));
  const { api } = installTracking(cfg, win);
  delete cfg.form.acceptanceProfile;
  cfg.form.formId = 'another-form'; cfg.form.endpoint += '?changed=1';
  cfg.form.mode = 'disabled'; cfg.form.observeFetch = false;
  assert.equal(api.beginFormAttempt('another-form'), null);
  submit(win); await win.fetch(trackingConfig.form.endpoint, { method: 'POST' }); await drain();
  assert.equal(win.dataLayer.length, 1); // No downgrade to strict success:true.
  nextBody = accepted();
  submit(win); await win.fetch(trackingConfig.form.endpoint, { method: 'POST' }); await drain();
  assert.deepEqual(win.dataLayer.slice(1), [{ event: 'contact_form_success' }]);
  assert.equal(api.getStatus().formAcceptanceProfile.name, 'rta-zoho-splash-ack-v1');
});

test('only a correlated exact provider acknowledgment emits once; no receipt/PII leaks', async () => {
  const win = environment(); const { api } = installTracking(config(), win);
  assert.deepEqual(api.getStatus().formAcceptanceProfile, { name: 'rta-zoho-splash-ack-v1', ready: true,
    reason: 'verified_exact_ack_required', boundary: 'provider_acknowledgment' });
  assert.equal(api.beginFormAttempt('another-form'), null);
  const attemptId = api.beginFormAttempt(trackingConfig.form.formId);
  const original = accepted();
  const candidate = response(original);
  const receipt = { provider: 'zoho_webform', attemptId, response: candidate, email: 'PRIVATE@example.com', record_id: 'PRIVATE-RECORD' };
  const outcomes = await Promise.all([api.confirmProviderReceipt(receipt), api.confirmProviderReceipt(receipt)]);
  assert.equal(outcomes.filter(x => x.emitted).length, 1);
  assert.deepEqual(win.dataLayer.slice(1), [{ event: 'contact_form_success' }]);
  assert.equal((await api.confirmProviderReceipt(receipt)).emitted, false);
  assert.equal((await api.confirmProviderReceipt({ ...receipt, provider: 'unverified' })).emitted, false);
  assert.equal((await api.confirmProviderReceipt({ ...receipt, attemptId: 'unknown' })).emitted, false);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|record_id|rta-/);
  assert.deepEqual(original, accepted());
});

test('a failed response cannot be reclassified; a genuine new retry gets a new attempt', async () => {
  const win = environment(); const { api } = installTracking(config(), win);
  const first = api.beginFormAttempt(trackingConfig.form.formId);
  assert.equal((await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId: first, response: response({ success: false }) })).emitted, false);
  assert.equal((await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId: first, response: response(accepted()) })).emitted, false);
  const retry = api.beginFormAttempt(trackingConfig.form.formId);
  assert.notEqual(first, retry);
  assert.equal((await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId: retry, response: response(accepted()) })).emitted, true);
});

test('configuration boot is explicit and installs no scripts, fetches or storage', () => {
  const win = environment();
  win.fetch = () => { throw new Error('No network calls allowed'); };
  win.document.createElement = () => { throw new Error('No vendor loaders allowed'); };
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('No persistent storage allowed'); } });
  assert.equal(bootTrackingFromDocument(win).reason, 'config_node_missing');
  win.document.getElementById = id => id === 'rta-tracking-config'
    ? { type: 'application/json', textContent: JSON.stringify(config()) } : null;
  assert.equal(bootTrackingFromDocument(win).installed, true);
  assert.equal(win.RTATracking.getStatus().vendorLoading, 'gtm-only');
  for (const destination of Object.values(trackingConfig.optionalDestinations)) assert.equal(destination.enabled, false);
});

test('automatic observer correlates exact form POST and preserves promise, this and argument identity', async () => {
  const win = environment(); const pending = deferred(); const calls = [];
  win.fetch = function (...args) { calls.push({ receiver: this, args }); return pending.promise; };
  const { api } = installTracking(config(), win);
  assert.equal(api.getStatus().automaticFormResponseObservation, true);
  submit(win);
  const init = { method: 'POST' }; const receiver = { nativeContext: true };
  const returned = win.fetch.call(receiver, trackingConfig.form.endpoint, init);
  assert.equal(returned, pending.promise);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, receiver);
  assert.equal(calls[0].args[0], trackingConfig.form.endpoint);
  assert.equal(calls[0].args[1], init);
  // Exact sanitized receipt from the authorized native test; no request PII.
  const actualResponse = new Response(JSON.stringify(accepted()), { headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(actualResponse, 'url', { value: trackingConfig.form.endpoint });
  pending.resolve(actualResponse);
  assert.equal(await returned, actualResponse);
  await drain();
  assert.deepEqual(win.dataLayer.slice(1), [{ event: 'contact_form_success' }]);
  assert.equal(actualResponse.bodyUsed, false);
  assert.deepEqual(await actualResponse.json(), accepted());
});

test('unrelated requests and method overrides do not consume a captured attempt', async () => {
  const win = environment(); win.URL = URL; win.Request = Request;
  const nativePromises = [];
  win.fetch = () => { const promise = Promise.resolve(response(accepted())); nativePromises.push(promise); return promise; };
  installTracking(config(), win);
  const beforeSubmit = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  assert.equal(beforeSubmit, nativePromises.at(-1));
  await drain(); assert.equal(win.dataLayer.length, 1);
  submit(win, 'another-form');
  win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  await drain(); assert.equal(win.dataLayer.length, 1);
  submit(win);
  for (const [input, init] of [
    ['/assets/app.js', undefined],
    [trackingConfig.form.endpoint, { method: 'GET' }],
    [trackingConfig.form.endpoint + '?different=1', { method: 'POST' }],
    ['https://crm.zoho.com.evil.example/crm/WebToLeadForm', { method: 'POST' }],
    [new Request(trackingConfig.form.endpoint, { method: 'POST' }), { method: 'GET' }],
  ]) assert.equal(win.fetch(input, init), nativePromises.at(-1));
  await drain(); assert.equal(win.dataLayer.length, 1);
  assert.equal(win.fetch(new Request(trackingConfig.form.endpoint, { method: 'POST' })), nativePromises.at(-1));
  await drain();
  assert.deepEqual(win.dataLayer.slice(1), [{ event: 'contact_form_success' }]);
});

test('validation with no POST and an expired submit never emit or create a request', async () => {
  const win = environment(); let time = 100; let calls = 0;
  win.performance = { now: () => time };
  win.fetch = () => { calls++; return Promise.resolve(response(accepted())); };
  installTracking(config(), win);
  submit(win);
  await drain();
  assert.equal(calls, 0);
  assert.equal(win.dataLayer.length, 1);
  time += trackingConfig.form.submitTtlMs + 1;
  win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  await drain();
  assert.equal(calls, 1);
  assert.equal(win.dataLayer.length, 1);
  submit(win);
  win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  await drain();
  assert.equal(win.dataLayer.filter(x => x.event === EVENTS.lead).length, 1);
});

test('a network rejection propagates unchanged; retry needs another captured submit', async () => {
  const win = environment(); const first = deferred(); const second = deferred(); const third = deferred();
  const queue = [first, second, third]; win.fetch = () => queue.shift().promise;
  installTracking(config(), win);
  submit(win);
  const failed = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  const error = new TypeError('Network failed'); first.reject(error);
  await assert.rejects(failed, candidate => candidate === error);
  await drain(); assert.equal(win.dataLayer.length, 1);
  const unarmed = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  assert.equal(unarmed, second.promise); second.resolve(response(accepted()));
  await unarmed; await drain(); assert.equal(win.dataLayer.length, 1);
  submit(win);
  const retry = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  assert.equal(retry, third.promise); third.resolve(response(accepted()));
  await retry; await drain();
  assert.equal(win.dataLayer.filter(x => x.event === EVENTS.lead).length, 1);
});

test('one captured submit cannot observe two concurrent requests or callbacks', async () => {
  const win = environment(); const pending = deferred(); let calls = 0;
  win.fetch = () => { calls++; return pending.promise; };
  installTracking(config(), win); submit(win);
  const a = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  const b = win.fetch(trackingConfig.form.endpoint, { method: 'POST' });
  assert.equal(a, b); assert.equal(a, pending.promise); assert.equal(calls, 2);
  pending.resolve(response(accepted())); await a; await drain();
  assert.equal(win.dataLayer.filter(x => x.event === EVENTS.lead).length, 1);
});

test('observer ignores malformed success and does not read request/form PII', async () => {
  const win = environment(); let bodyReads = 0; let headerReads = 0;
  const pending = deferred(); win.fetch = () => pending.promise;
  installTracking(config(), win);
  const form = { id: trackingConfig.form.formId, tagName: 'FORM' };
  Object.defineProperty(form, 'elements', { get() { throw new Error('Form fields must not be read'); } });
  win.document.dispatch('submit', { target: form });
  const init = { method: 'POST' };
  Object.defineProperty(init, 'body', { get() { bodyReads++; throw new Error('Private request body'); } });
  Object.defineProperty(init, 'headers', { get() { headerReads++; throw new Error('Private headers'); } });
  const returned = win.fetch(trackingConfig.form.endpoint, init);
  const badResponse = response({ actionsubmit: 'Splash Message', actionvalue: 'Thank you PRIVATE@example.com' });
  pending.resolve(badResponse); assert.equal(await returned, badResponse); await drain();
  assert.equal(bodyReads, 0); assert.equal(headerReads, 0);
  assert.equal(win.dataLayer.length, 1);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|example.com|actionvalue/);
});

test('observer failures cannot replace fulfillment or native synchronous exceptions', async () => {
  const win = environment(); const badResponse = response(accepted(), { clone: () => { throw new Error('Clone failed'); } });
  const nativePromise = Promise.resolve(badResponse); win.fetch = () => nativePromise;
  installTracking(config(), win); submit(win);
  assert.equal(win.fetch(trackingConfig.form.endpoint, { method: 'POST' }), nativePromise);
  assert.equal(await nativePromise, badResponse); await drain();
  assert.equal(win.dataLayer.length, 1);
  const sync = environment(); const error = new TypeError('Native synchronous failure');
  sync.fetch = () => { throw error; }; installTracking(config(), sync); submit(sync);
  assert.throws(() => sync.fetch(trackingConfig.form.endpoint, { method: 'POST' }), candidate => candidate === error);
  const target = {};
  Object.defineProperty(target, 'id', { get() { throw new Error('Unavailable target metadata'); } });
  assert.doesNotThrow(() => win.document.dispatch('submit', { target }));
});

test('unsupported or disabled fetch observation has an explicit status', () => {
  const absent = environment();
  assert.equal(installTracking(config(), absent).api.getStatus().formResponseObserver.reason, 'fetch_unavailable');
  const inaccessible = environment();
  Object.defineProperty(inaccessible, 'fetch', { get() { throw new Error('Fetch inaccessible'); } });
  assert.equal(installTracking(config(), inaccessible).api.getStatus().formResponseObserver.reason, 'fetch_unavailable');
  const readonly = environment(); const original = () => Promise.resolve(response(accepted()));
  Object.defineProperty(readonly, 'fetch', { value: original, writable: false });
  const readonlyStatus = installTracking(config(), readonly).api.getStatus();
  assert.equal(readonlyStatus.automaticFormResponseObservation, false);
  assert.equal(readonlyStatus.formResponseObserver.reason, 'fetch_not_replaceable');
  assert.equal(readonly.fetch, original);
  const disabled = environment(); disabled.fetch = original; const cfg = config(); cfg.form.observeFetch = false;
  assert.equal(installTracking(cfg, disabled).api.getStatus().formResponseObserver.reason, 'disabled');
  assert.equal(disabled.fetch, original);
  const nonPromise = environment(); nonPromise.fetch = () => 42;
  const api = installTracking(config(), nonPromise).api; submit(nonPromise);
  assert.equal(nonPromise.fetch(trackingConfig.form.endpoint, { method: 'POST' }), 42);
  assert.equal(api.getStatus().automaticFormResponseObservation, false);
  assert.equal(api.getStatus().formResponseObserver.reason, 'unsupported_fetch_result');
});
