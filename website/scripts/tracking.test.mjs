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
const accepted = () => ({ success: true, actionsubmit: 'Splash Message', actionvalue: 'Thank you' });
const config = () => structuredClone(trackingConfig);
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

test('provider validation rejects UI success, unknown contracts, errors and wrong endpoints', async () => {
  const cases = [
    [response({ actionsubmit: 'Splash Message', actionvalue: 'Thank you' }), 'explicit_acceptance_missing'],
    [response({ ...accepted(), success: 'true' }), 'explicit_acceptance_missing'],
    [response({ ...accepted(), success: false }), 'explicit_acceptance_missing'],
    [response({ ...accepted(), invalidCaptcha: 'true' }), 'provider_error'],
    [response({ ...accepted(), errors: ['rejected'] }), 'provider_error'],
    [response({ ...accepted(), actionsubmit: 'error_msg' }), 'unknown_response_action'],
    [response({ ...accepted(), actionsubmit: 'unknown' }), 'unknown_response_action'],
    [response({ ...accepted(), status: 'failed' }), 'provider_status_not_accepted'],
    [response(accepted(), { status: 500, ok: false }), 'http_not_accepted'],
    [response(accepted(), { type: 'opaque' }), 'http_not_accepted'],
    [response(accepted(), { url: 'https://crm.zoho.com/other-endpoint' }), 'unexpected_response_endpoint'],
    [response(accepted(), { url: 'https://crm.zoho.com.evil.example/crm/WebToLeadForm' }), 'unexpected_response_endpoint'],
    [response(accepted(), { headers: { get: () => 'text/html' } }), 'json_response_required'],
    [response([accepted()]), 'object_response_required'],
    [response(accepted(), { clone: () => { throw new Error('body consumed'); } }), 'unreadable_provider_response'],
  ];
  for (const [candidate, reason] of cases) {
    assert.deepEqual(await validateZohoWebformResponse(candidate, trackingConfig.form.endpoint), { accepted: false, reason });
  }
});

test('only a correlated explicit provider acceptance emits once; no receipt/PII leaks', async () => {
  const win = environment(); const { api } = installTracking(config(), win);
  assert.equal(api.beginFormAttempt('another-form'), null);
  const attemptId = api.beginFormAttempt(trackingConfig.form.formId);
  const original = accepted(); original.email = 'PRIVATE@example.com'; original.record_id = 'PRIVATE-RECORD';
  const candidate = response(original);
  const receipt = { provider: 'zoho_webform', attemptId, response: candidate };
  const outcomes = await Promise.all([api.confirmProviderReceipt(receipt), api.confirmProviderReceipt(receipt)]);
  assert.equal(outcomes.filter(x => x.emitted).length, 1);
  assert.deepEqual(win.dataLayer.slice(1), [{ event: 'contact_form_success' }]);
  assert.equal((await api.confirmProviderReceipt(receipt)).emitted, false);
  assert.equal((await api.confirmProviderReceipt({ ...receipt, provider: 'unverified' })).emitted, false);
  assert.equal((await api.confirmProviderReceipt({ ...receipt, attemptId: 'unknown' })).emitted, false);
  assert.doesNotMatch(JSON.stringify(win.dataLayer), /PRIVATE|record_id|rta-/);
  assert.deepEqual(original, { ...accepted(), email: 'PRIVATE@example.com', record_id: 'PRIVATE-RECORD' });
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
  // A local acceptance fixture verifies the predicate, not Zoho's real schema.
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
