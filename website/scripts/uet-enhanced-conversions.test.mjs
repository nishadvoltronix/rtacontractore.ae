import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createMicrosoftEnhancedConversions, normalizeMicrosoftEmail, normalizeMicrosoftPhone } from '../dist/assets/uet-enhanced-conversions.js';
import { installTracking } from '../dist/assets/tracking.js';
import { trackingConfig } from '../tracking.config.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const destination = () => ({ enabled: true, tagId: '187284886', enhancedConversions: { enabled: true, baseTagVerified: true, goalVerified: true } });
class Target {
  listeners = new Map();
  addEventListener(type, callback) { this.listeners.set(type, [...(this.listeners.get(type) || []), callback]); }
  dispatch(type, event) { for (const callback of this.listeners.get(type) || []) callback(event); }
}
function fixture() {
  const log = []; const timers = new Map(); const listeners = []; const eventPids = [];
  let currentPid = null;
  let timerId = 0;
  let state = { managed: true, known: true, advertising: true, microsoftEnhancedConversions: true, policyVersion: 2, recordedAt: '2026-11-01T12:00:00Z', reloadRequired: false };
  class UET { push(...command) { log.push({ kind: 'uet', command }); if (command[1]?.pid) currentPid = { ...command[1].pid }; } }
  const win = new Target();
  Object.assign(win, {
    UET, uetq: new UET(), crypto: webcrypto,
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    RTAMarketing: { consent: { getState: () => ({ ...state }), onChange: callback => listeners.push(callback) } },
    document: new Target(), location: { hostname: 'rtacontractor.ae', href: 'https://rtacontractor.ae/' },
    dataLayer: { push: payload => { log.push({ kind: 'dataLayer', payload }); eventPids.push(currentPid && { ...currentPid }); } },
  });
  const values = { Email: 'En.quiry+scope@voltronix.ae', Mobile: '+971 (50) 123-4567' };
  const form = { id: trackingConfig.form.formId, tagName: 'FORM', elements: { namedItem: name => ({ value: values[name] }) } };
  return { win, log, timers, form, values, eventPids,
    setConsent: patch => { state = { ...state, ...patch }; for (const callback of listeners) callback({ ...state }); },
    expire: ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback(); } },
  };
}
const pidCommands = log => log.filter(item => item.kind === 'uet' && item.command[1]?.pid?.em);
const receipt = (accepted = true) => ({
  url: trackingConfig.form.endpoint, ok: true, status: 200, type: 'cors', headers: { get: () => 'application/json;charset=UTF-8' },
  clone: () => ({ json: async () => accepted
    ? { actionsubmit: 'Splash Message', actionvalue: 'Thank you for your response.' }
    : { actionsubmit: 'Splash Message', actionvalue: 'Please complete the CAPTCHA.' } }),
});
const drain = () => new Promise(resolve => setImmediate(resolve));

test('Microsoft normalization rejects placeholders and requires an international phone prefix', () => {
  assert.equal(normalizeMicrosoftEmail(' Én.quiry+scope@VOLTRONIX.AE '), 'enquiry@voltronix.ae');
  assert.equal(normalizeMicrosoftPhone('+971 (50) 123-4567'), '+971501234567');
  assert.equal(normalizeMicrosoftPhone('00971 50 1234567'), '+971501234567');
  for (const input of ['contoso@example.com', 'demo@contoso.com', 'no-at-sign', 'x@y', '.x@voltronix.ae', 'x\n@voltronix.ae']) assert.equal(normalizeMicrosoftEmail(input), null);
  for (const input of ['+14250000000', '+142555512345', '0501234567', '+971501234567 ext2', '+012345678', '']) assert.equal(normalizeMicrosoftPhone(input), null);
});

test('disabled/readiness and unknown or incomplete consent gates never read form contact values', () => {
  for (const mutate of [
    d => { d.enabled = false; }, d => { d.enhancedConversions.enabled = false; },
    d => { d.enhancedConversions.baseTagVerified = false; }, d => { d.enhancedConversions.goalVerified = false; },
  ]) {
    const f = fixture(); const d = destination(); mutate(d);
    Object.defineProperty(f.form, 'elements', { get() { throw new Error('Contact fields must not be read'); } });
    assert.equal(createMicrosoftEnhancedConversions(d, f.win).capture('a', f.form, 10000), false);
    assert.deepEqual(f.log, []);
  }
  for (const denied of [{ known: false }, { managed: false }, { advertising: false }, { microsoftEnhancedConversions: false }, { microsoftEnhancedConversions: undefined }, { reloadRequired: true }]) {
    const f = fixture(); f.setConsent(denied);
    let reads = 0; Object.defineProperty(f.form, 'elements', { get() { reads++; throw new Error('Unexpected contact read'); } });
    assert.equal(createMicrosoftEnhancedConversions(destination(), f.win).capture('a', f.form, 10000), false);
    assert.equal(reads, 0); assert.deepEqual(f.log, []);
  }
});

test('a consent-created queue alone cannot enable PID capture', () => {
  const f = fixture(); f.win.uetq = [];
  let reads = 0; Object.defineProperty(f.form, 'elements', { get() { reads++; return {}; } });
  assert.equal(createMicrosoftEnhancedConversions(destination(), f.win).capture('a', f.form, 10000), false);
  assert.equal(reads, 0);
});

test('only captured submission values are SHA-256 hashed; repeat confirmation sends once', async () => {
  const f = fixture(); const api = createMicrosoftEnhancedConversions(destination(), f.win);
  assert.equal(api.capture('a', f.form, 10000), true);
  f.values.Email = 'changed@voltronix.ae'; f.values.Mobile = '';
  assert.equal(await api.confirm('a'), true);
  assert.equal(await api.confirm('a'), false);
  assert.deepEqual(f.log, [{ kind: 'uet', command: ['set', { pid: { em: sha('enquiry@voltronix.ae'), ph: sha('+971501234567') } }] }]);
  assert.equal(f.timers.size, 0);
});

test('missing/invalid phone is explicitly empty and sample values are never sent', async () => {
  const f = fixture(); f.values.Mobile = '+14250000000';
  const api = createMicrosoftEnhancedConversions(destination(), f.win);
  api.capture('a', f.form, 10000); assert.equal(await api.confirm('a'), true);
  assert.equal(f.log[0].command[1].pid.ph, '');
  f.values.Email = 'contoso@example.com';
  assert.equal(api.capture('b', f.form, 10000), false);
  assert.equal(pidCommands(f.log).length, 1);
  assert.deepEqual(f.log.at(-1).command, ['set', { pid: { em: '', ph: '' } }]);
});

test('rejection, expiry and a new attempt purge pending identifiers', async () => {
  const f = fixture(); const api = createMicrosoftEnhancedConversions(destination(), f.win);
  api.capture('rejected', f.form, 10000); api.forget('rejected');
  assert.equal(await api.confirm('rejected'), false);
  api.capture('expired', f.form, 10000); f.expire(10000);
  assert.equal(await api.confirm('expired'), false);
  api.capture('old', f.form, 10000); api.capture('new', f.form, 10000);
  assert.equal(await api.confirm('old'), false);
  assert.equal(await api.confirm('new'), true);
  assert.equal(pidCommands(f.log).length, 1); assert.equal(f.timers.size, 0);
});

test('withdrawal during hashing unblocks confirmation immediately and never publishes PID', async () => {
  const f = fixture(); f.win.crypto = { subtle: { digest: () => new Promise(() => {}) } };
  const api = createMicrosoftEnhancedConversions(destination(), f.win);
  api.capture('a', f.form, 10000); const confirmation = api.confirm('a');
  f.setConsent({ microsoftEnhancedConversions: false });
  assert.equal(await confirmation, false); assert.deepEqual(f.log, []); assert.equal(f.timers.size, 0);
});

test('slow hashing times out without blocking the regular conversion', async () => {
  const f = fixture(); f.win.crypto = { subtle: { digest: () => new Promise(() => {}) } };
  const api = createMicrosoftEnhancedConversions(destination(), f.win);
  api.capture('a', f.form, 10000); const confirmation = api.confirm('a'); f.expire(250);
  assert.equal(await confirmation, false); assert.deepEqual(f.log, []); assert.equal(f.timers.size, 0);
});

test('withdrawal clears already assigned PID, including a subsequent regrant', async () => {
  const f = fixture(); const api = createMicrosoftEnhancedConversions(destination(), f.win);
  api.capture('a', f.form, 10000); await api.confirm('a');
  f.setConsent({ microsoftEnhancedConversions: false });
  assert.deepEqual(f.log.at(-1).command, ['set', { pid: { em: '', ph: '' } }]);
  f.setConsent({ microsoftEnhancedConversions: true });
  assert.equal(await api.confirm('a'), false); assert.equal(pidCommands(f.log).length, 1);
});

test('validated form integration orders PID before the sole GTM event and preserves native fetch', async () => {
  for (const accepted of [true, false]) {
    const f = fixture();
    // Deterministic in-memory crypto; no provider SDK or external request.
    f.win.crypto = { randomUUID: () => 'test', subtle: { digest: async (_algorithm, bytes) => createHash('sha256').update(bytes).digest().buffer } };
    let nativePromise;
    f.win.fetch = () => (nativePromise = Promise.resolve(receipt(accepted)));
    const config = structuredClone(trackingConfig); config.optionalDestinations.microsoftUet = destination();
    const { api } = installTracking(config, f.win);
    f.win.document.dispatch('submit', { target: f.form });
    const result = f.win.fetch(config.form.endpoint, { method: 'POST' });
    assert.equal(result, nativePromise); await result; await drain();
    if (accepted) {
      assert.equal(f.log.length, 2); assert.equal(f.log[0].kind, 'uet');
      assert.deepEqual(f.log[1], { kind: 'dataLayer', payload: { event: 'contact_form_success' } });
      const unknown = await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId: 'unknown', response: receipt() });
      assert.equal(unknown.emitted, false); assert.equal(f.log.length, 2);
    } else assert.deepEqual(f.log, []);
    assert.equal(JSON.stringify(f.log.filter(item => item.kind === 'dataLayer')).includes('pid'), false);
    assert.equal(JSON.stringify(f.log).includes('En.quiry'), false);
    assert.equal(f.timers.size, 0);
  }
});

test('out-of-order receipts and uncaptured submissions never inherit another enquiry PID', async () => {
  const f = fixture();
  f.win.crypto = { randomUUID: () => 'test', subtle: { digest: async (_algorithm, bytes) => createHash('sha256').update(bytes).digest().buffer } };
  const resolveRequests = [];
  f.win.fetch = () => new Promise(resolve => resolveRequests.push(resolve));
  const config = structuredClone(trackingConfig); config.optionalDestinations.microsoftUet = destination();
  const { api } = installTracking(config, f.win);
  f.win.document.dispatch('submit', { target: f.form });
  const a = f.win.fetch(config.form.endpoint, { method: 'POST' });
  f.values.Email = 'second@voltronix.ae'; f.values.Mobile = '';
  f.win.document.dispatch('submit', { target: f.form });
  const b = f.win.fetch(config.form.endpoint, { method: 'POST' });
  resolveRequests[1](receipt()); await b; await drain();
  resolveRequests[0](receipt()); await a; await drain();
  const uncaptured = api.beginFormAttempt(config.form.formId);
  await api.confirmProviderReceipt({ provider: 'zoho_webform', attemptId: uncaptured, response: receipt() });
  assert.deepEqual(f.eventPids, [
    { em: sha('second@voltronix.ae'), ph: '' },
    { em: '', ph: '' }, { em: '', ph: '' },
  ]);
  assert.equal(f.log.filter(item => item.kind === 'dataLayer').length, 3);
  assert.equal(pidCommands(f.log).length, 1); assert.equal(f.timers.size, 0);
});
