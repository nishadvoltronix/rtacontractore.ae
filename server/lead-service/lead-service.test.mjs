import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, mkdir, stat, readdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { leadServiceConfig, readiness } from './config.mjs';
import { openEncryptedStore } from './store.mjs';
import { validateLead, createChallenge, verifyChallenge } from './validation.mjs';
import { createZohoAdapter, createHubAdapter, ProviderError } from './providers.mjs';
import { createLeadService } from './service.mjs';
import { createLeadHandler } from './http.mjs';
import { createLeadRuntime } from './runtime.mjs';
import { queueHealth } from './monitor.mjs';
import { validateHttpBinding, validatePrivateLocation } from './http-entry.mjs';

globalThis.fetch = () => { throw new Error('Live network forbidden by lead-service tests'); };
const key = Buffer.alloc(32, 7); // Deterministic fixture, never a deployment key.
class MemoryStore {
  state = { schemaVersion: 1, entries: [], consumedChallenges: {} }; chain = Promise.resolve();
  transaction(operation) { const run = this.chain.then(async () => { const next = structuredClone(this.state); const value = await operation(next); this.state = next; return structuredClone(value); }); this.chain = run.catch(() => {}); return run; }
  async snapshot() { await this.chain; return structuredClone(this.state); }
}
function environment(overrides = {}) {
  let time = 1_700_000_000_000; const calls = []; const store = new MemoryStore();
  const config = structuredClone(leadServiceConfig);
  Object.assign(config, { enabled: true, retentionPolicyVerified: true, clientAddressPolicyVerified: true, providerSwitchVerified: true });
  config.lifecycle.enabled = true;
  const crm = { ready: true, retrySafe: true, async deliver(lead, id) { calls.push({ lead, id }); return { verified: true, provider: 'zoho', id: '999999999999999' }; } };
  const dependencies = { key, store, crm, now: () => time, ...overrides };
  const service = createLeadService(config, dependencies);
  return { config, store, service, crm, calls, dependencies, advance: ms => { time += ms; }, body() { const challenge = service.challenge().challenge; time += 2000; return { firstName: 'Fixture', lastName: 'Person', company: 'Fixture Company', mobile: '+999000000000', email: 'fixture@example.invalid', requestedService: 'Street lighting', projectLocation: 'Fixture location', projectDescription: 'Local fixture project description', website: '', challenge, consent: { analytics: false, advertising: false, policyVersion: 1 }, attribution: { landingPath: '/' } }; } };
}
test('default configuration and unknown mappings fail closed without any delivery', async () => {
  const config = structuredClone(leadServiceConfig); const service = createLeadService(config, {});
  assert.equal(service.availability.ready, false);
  await assert.rejects(service.intake({}, randomUUID()), error => error.code === 'unavailable');
  assert.equal(createZohoAdapter(config.zoho).ready, false);
  assert.equal(createHubAdapter(config.hub).ready, false);
  assert(readiness({ ...config, enabled: true, maxBodyBytes: -1 }).missing.includes('bounded_service_limits'));
});
test('input validation rejects extra keys, honeypot, unsafe attribution and malformed contacts', () => {
  const e = environment(); const body = e.body();
  assert.equal(validateLead(body, e.config).email, 'fixture@example.invalid');
  for (const patch of [{ website: 'bot' }, { extra: true }, { mobile: 'not-a-phone' }, { email: 'injection\r\n@example.invalid' }, { projectDescription: 'x'.repeat(25) }, { attribution: { utm_source: 'person@example.invalid' } }, { attribution: { referrer: 'https://private.invalid/person' } }, { attribution: { gclid: 'abc' } }, { consent: { analytics: 'true', advertising: false, policyVersion: 1 } }]) assert.throws(() => validateLead({ ...body, ...patch }, e.config));
});
test('signed challenges reject alteration, premature submission and expiry', () => {
  const config = leadServiceConfig.challenge; const issued = 1_700_000_000_000; const token = createChallenge(key, issued);
  assert.equal(typeof verifyChallenge(token, key, config, issued + 2000), 'string');
  for (const [candidate, stamp] of [[token, issued], [token, issued + config.maxAgeMs + 1], [token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'), issued + 2000]]) assert.throws(() => verifyChallenge(candidate, key, config, stamp));
});
test('durable intake is queued, not a lead success; identical retries do not create twice', async () => {
  const e = environment(); const body = e.body(); const token = randomUUID();
  assert.deepEqual(await e.service.intake(body, token), { accepted: false, status: 'queued', duplicate: false });
  await Promise.all([e.service.intake(body, token), e.service.intake(body, token)]);
  await e.service.intake(body, token.toUpperCase());
  assert.equal(e.store.state.entries.length, 1); assert.equal(e.calls.length, 0); assert.equal(e.store.state.entries[0].events.length, 0);
  await assert.rejects(e.service.intake({ ...body, company: 'Different fixture' }, token), error => error.status === 409);
});
test('duplicate enquiry keys preserve their own retry payload hash and consume challenges', async () => {
  const e = environment(); const first = e.body(); const one = randomUUID(); await e.service.intake(first, one);
  const second = { ...e.body(), attribution: { utm_source: 'bing' } }; const two = randomUUID(); await e.service.intake(second, two); await e.service.intake(second, two);
  assert.equal(e.store.state.entries.length, 1); assert.equal(e.store.state.entries[0].keys.length, 2);
  assert.equal((await e.service.status(two)).duplicate, true); assert.equal((await e.service.status(one)).duplicate, false);
  await assert.rejects(e.service.intake(first, randomUUID()), error => error.code === 'challenge_consumed');
});

test('distinct named projects remain separate while the same project enquiry deduplicates', async () => {
  const e = environment();
  const first = { ...e.body(), projectName: 'Fixture Project A' };
  const second = { ...e.body(), projectName: 'Fixture Project B' };
  assert.equal((await e.service.intake(first, randomUUID())).duplicate, false);
  assert.equal((await e.service.intake(second, randomUUID())).duplicate, false);
  assert.deepEqual(e.store.state.entries.map(entry => entry.lead.projectName), ['Fixture Project A', 'Fixture Project B']);
  const repeated = { ...e.body(), projectName: 'Fixture Project A' };
  assert.equal((await e.service.intake(repeated, randomUUID())).duplicate, true);
  assert.equal(e.store.state.entries.length, 2);
  assert.deepEqual(e.store.state.entries.map(entry => entry.keys.length), [2, 1]);
});

test('server-owned origin, form and technical-test contexts never alias in a reused journal', async () => {
  const e = environment();
  await e.service.intake(e.body(), randomUUID());
  for (const patch of [{ siteOrigin: 'https://www.rtacontractor.ae' }, { formId: 'rta-server-enquiry-v2' }, { technicalTest: true }]) {
    const config = { ...structuredClone(e.config), ...patch };
    const service = createLeadService(config, e.dependencies);
    assert.equal((await service.intake(e.body(), randomUUID())).duplicate, false);
  }
  assert.equal(e.store.state.entries.length, 4);
  assert.equal((await e.service.intake(e.body(), randomUUID())).duplicate, true);
  assert.equal(e.store.state.entries.length, 4);
});
test('only verified CRM delivery promotes one accepted lead and one PII-free event', async () => {
  const e = environment(); const token = randomUUID(); await e.service.intake(e.body(), token);
  await Promise.all([e.service.drain(), e.service.drain()]); await e.service.drain();
  assert.deepEqual(await e.service.status(token), { accepted: true, status: 'accepted', duplicate: false }); assert.equal(e.calls.length, 1);
  assert.deepEqual(e.store.state.entries[0].events, [{ event: 'contact_form_success', stage: 'new_lead' }]);
  assert.doesNotMatch(JSON.stringify(await e.service.status(token)), /fixture|999|crmId|email|mobile/);
});
test('ambiguous upsert retries use the same external ID; no retry for an unsafe provider', async () => {
  const ids = []; let attempt = 0;
  const e = environment({ crm: { ready: true, retrySafe: true, async deliver(_, id) { ids.push(id); if (++attempt === 1) throw new ProviderError('ambiguous'); return { verified: true, provider: 'zoho', id: '999999999999999' }; } } });
  await e.service.intake(e.body(), randomUUID()); await e.service.drain(); assert.equal(e.store.state.entries[0].status, 'queued');
  e.advance(100_000); await e.service.drain(); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(e.store.state.entries[0].events.length, 1);
  let unsafeCalls = 0;
  const unsafe = environment({ crm: { ready: true, retrySafe: false, async deliver() { unsafeCalls++; throw new ProviderError('ambiguous'); } } });
  await unsafe.service.intake(unsafe.body(), randomUUID()); await unsafe.service.drain(); await unsafe.service.drain();
  assert.equal(unsafeCalls, 1); assert.equal(unsafe.store.state.entries[0].status, 'reconciliation_required');
});
test('crash recovery fails to reconciliation for non-idempotent creates', async () => {
  const e = environment({ crm: { ready: true, retrySafe: false, async deliver() { throw new Error('Must not blindly resend'); } } });
  await e.service.intake(e.body(), randomUUID()); e.store.state.entries[0].status = 'sending'; await e.service.drain();
  assert.equal(e.store.state.entries[0].status, 'reconciliation_required');
});
test('HUB failure never resubmits the already confirmed CRM record', async () => {
  const e = environment({ hub: { ready: true, retrySafe: true, async deliver() { throw new Error('Mock HUB unavailable'); } } });
  e.config.hub.enabled = true; e.service = createLeadService(e.config, e.dependencies); await e.service.intake(e.body(), randomUUID()); await e.service.drain(); await e.service.drain();
  assert.equal(e.calls.length, 1); assert.equal(e.store.state.entries[0].status, 'accepted'); assert.equal(e.store.state.entries[0].hub.reconciliationRequired, true);
});
test('lifecycle events require a trusted verifier and deduplicate the stage', async () => {
  const e = environment({ verifyLifecycleReceipt: async receipt => receipt === 'signed-fixture' ? { verified: true, crmId: '999999999999999', stage: 'qualified' } : { verified: false } });
  await e.service.intake(e.body(), randomUUID()); await e.service.drain();
  await assert.rejects(e.service.recordLifecycle({ verified: true, stage: 'won' }));
  await e.service.recordLifecycle('signed-fixture'); await e.service.recordLifecycle('signed-fixture');
  assert.deepEqual(e.store.state.entries[0].events.map(item => item.event), ['contact_form_success', 'qualified_lead']);
});
test('explicit retention purge removes PII and associated challenge indexes', async () => {
  const e = environment(); await e.service.intake(e.body(), randomUUID()); e.advance(8 * 86_400_000);
  assert.deepEqual(await e.service.purgeExpired(), { removed: 1, deferred: false, deferredEntries: 0 }); assert.equal(e.store.state.entries.length, 0); assert.deepEqual(e.store.state.consumedChallenges, {});
});

test('retention defers an in-flight receipt and requires an explicit follow-up purge', async () => {
  let finish; let announce;
  const started = new Promise(resolve => { announce = resolve; });
  const e = environment({ crm: { ready: true, retrySafe: true, deliver() { announce(); return new Promise(resolve => { finish = resolve; }); } } });
  const idempotencyKey = randomUUID();
  await e.service.intake(e.body(), idempotencyKey); e.advance(8 * 86_400_000);
  const draining = e.service.drain(); await started;
  assert.deepEqual(await e.service.purgeExpired(), { removed: 0, deferred: true, deferredEntries: null, reason: 'delivery_in_progress' });
  assert.equal(e.store.state.entries.length, 1); assert.equal(e.store.state.entries[0].status, 'sending');
  finish({ verified: true, provider: 'zoho', id: '999999999999999' }); await draining;
  assert.equal((await e.service.status(idempotencyKey)).accepted, true);
  assert.deepEqual(e.store.state.entries[0].events, [{ event: 'contact_form_success', stage: 'new_lead' }]);
  assert.deepEqual(await e.service.purgeExpired(), { removed: 1, deferred: false, deferredEntries: 0 });
  assert.equal(e.store.state.entries.length, 0);
});

test('retention reports and preserves expired sending evidence after a crash', async () => {
  const e = environment(); const idempotencyKey = randomUUID();
  await e.service.intake(e.body(), idempotencyKey); e.store.state.entries[0].status = 'sending'; e.advance(8 * 86_400_000);
  const challengeIndexes = Object.keys(e.store.state.consumedChallenges);
  assert.deepEqual(await e.service.purgeExpired(), { removed: 0, deferred: true, deferredEntries: 1, reason: 'sending_entries_require_recovery' });
  assert.equal(e.store.state.entries.length, 1); assert.deepEqual(Object.keys(e.store.state.consumedChallenges), challengeIndexes);
  assert.equal((await e.service.status(idempotencyKey)).status, 'queued');
});
function zohoFixture() {
  const fields = Object.keys(leadServiceConfig.zoho.fieldMap);
  return { enabled: true, apiOrigin: 'https://www.zohoapis.com', module: 'Leads', fieldMetadataVerified: true, uniqueFieldVerified: true, credentialsVerified: true, automationPolicyVerified: true, gclidWritabilityVerified: true, msclkidWritabilityVerified: true, externalIdField: 'Fixture_External_ID', staticFields: { Assign_Department: 'VOLTRONIX CONTRACTING LLC' }, fieldMap: Object.fromEntries(fields.map((field, index) => [field, `Fixture_Field_${index}`])) };
}
test('Zoho adapter uses verified unique-field upsert and parses record-level success only', async () => {
  const calls = []; const config = zohoFixture();
  const adapter = createZohoAdapter(config, { getAccessToken: async () => 'fixture-only-token', fetchImpl: async (url, init) => { calls.push({ url, init }); return { status: 201, json: async () => ({ data: [{ status: 'success', code: 'SUCCESS', action: 'insert', details: { id: '999999999999999' } }] }) }; } });
  assert.equal(adapter.ready, true); const e = environment(); const lead = validateLead(e.body(), e.config); const receipt = await adapter.deliver(lead, 'fixture-external-id');
  assert.equal(receipt.verified, true); const request = JSON.parse(calls[0].init.body);
  assert.deepEqual(request.duplicate_check_fields, ['Fixture_External_ID']); assert.deepEqual(request.trigger, []); assert.equal(request.data[0].Fixture_External_ID, 'fixture-external-id');
  assert.equal(calls[0].init.redirect, 'error'); assert.equal(createZohoAdapter({ ...config, uniqueFieldVerified: false }).ready, false);
  const invalid = createZohoAdapter(config, { getAccessToken: async () => 'fixture-only-token', fetchImpl: async () => ({ status: 200, json: async () => ({ success: true }) }) });
  await assert.rejects(invalid.deliver(lead, 'fixture-id'), error => error instanceof ProviderError);
});

test('possibly accepted malformed 2xx receipts retry one stable upsert key then require reconciliation', async () => {
  const records = new Map(); const submittedIds = [];
  const config = zohoFixture();
  const adapter = createZohoAdapter(config, {
    getAccessToken: async () => 'fixture-only-token',
    fetchImpl: async (_, init) => {
      const request = JSON.parse(init.body); const externalId = request.data[0].Fixture_External_ID;
      submittedIds.push(externalId); records.set(externalId, '999999999999999');
      // Simulates an accepted provider write followed by an unrecognized receipt.
      return { status: 200, json: async () => ({ received: true }) };
    },
  });
  const e = environment({ crm: adapter }); const idempotencyKey = randomUUID();
  await e.service.intake(e.body(), idempotencyKey);
  await e.service.drain(); assert.equal(e.store.state.entries[0].status, 'queued');
  e.advance(600_000); await e.service.drain();
  e.advance(600_000); await e.service.drain();
  assert.equal(submittedIds.length, 3); assert.equal(new Set(submittedIds).size, 1); assert.equal(records.size, 1);
  assert.equal(e.store.state.entries[0].status, 'reconciliation_required');
  assert.equal((await e.service.status(idempotencyKey)).accepted, false);
  assert.deepEqual(e.store.state.entries[0].events, []);
  for (const status of [202, 204]) {
    const pending = createZohoAdapter(config, { getAccessToken: async () => 'fixture-only-token', fetchImpl: async () => ({ status }) });
    await assert.rejects(pending.deliver({}, 'fixture-id'), error => error.kind === 'ambiguous');
  }
});
test('HUB adapter requires an actual verified contract, not a fabricated URL', async () => {
  assert.equal(createHubAdapter({ enabled: true, contractVerified: true }, { url: 'https://example.invalid' }).ready, false);
  const hub = createHubAdapter({ enabled: true, contractVerified: true }, { idempotentExternalId: true, deliver: async (_, id) => id, verifyReceipt: async (_, id) => ({ provider: 'hub', verified: true, id }) });
  assert.equal((await hub.deliver({}, 'fixture')).verified, true);
});
test('root-verified additive CRM mapping preserves customer Website and global status semantics', () => {
  const zoho = leadServiceConfig.zoho;
  const custom = new Set([zoho.externalIdField, ...Object.values(zoho.fieldMap).filter(field => field.startsWith('RTA_'))]);
  assert.equal(custom.size, 19); assert.equal(zoho.externalIdField, 'RTA_Submission_ID'); assert.equal(zoho.uniqueFieldVerified, true);
  assert.equal(zoho.enabled, false); assert.equal(zoho.credentialsVerified, false);
  assert.deepEqual(zoho.staticFields, { Assign_Department: 'VOLTRONIX CONTRACTING LLC' });
  assert(!Object.values(zoho.fieldMap).includes('Website')); assert(!Object.values(zoho.fieldMap).includes('Lead_Status')); assert(!Object.hasOwn(zoho.staticFields, 'Lead_Website'));
  const e = environment(); assert.throws(() => validateLead({ ...e.body(), siteOrigin: 'https://forged.invalid' }, e.config));
});

test('only advertising-consented click IDs reach verified writable custom CRM fields', async () => {
  const zoho = leadServiceConfig.zoho;
  assert.equal(zoho.fieldMap.gclid, 'RTA_GCLID'); assert.equal(zoho.fieldMap.msclkid, 'RTA_MSCLKID');
  assert.equal(zoho.gclidWritabilityVerified, true); assert.equal(zoho.msclkidWritabilityVerified, true);
  assert(!Object.values(zoho.fieldMap).includes('GCLID'));
  const config = { ...structuredClone(zoho), enabled: true, apiOrigin: 'https://www.zohoapis.com', credentialsVerified: true, automationPolicyVerified: true };
  const records = [];
  const dependencies = { getAccessToken: async () => 'fixture-only-token', fetchImpl: async (_, init) => { records.push(JSON.parse(init.body).data[0]); return { status: 201, json: async () => ({ data: [{ status: 'success', code: 'SUCCESS', action: 'insert', details: { id: '999999999999999' } }] }) }; } };
  const adapter = createZohoAdapter(config, dependencies); assert.equal(adapter.ready, true);
  for (const flag of ['gclidWritabilityVerified', 'msclkidWritabilityVerified']) assert.equal(createZohoAdapter({ ...config, [flag]: false }, dependencies).ready, false);
  const e = environment(); const body = e.body(); const now = 1_700_000_003_000;
  await adapter.deliver(validateLead(body, e.config, now), 'fixture-no-click');
  assert.equal(Object.hasOwn(records[0], 'RTA_GCLID'), false); assert.equal(Object.hasOwn(records[0], 'RTA_MSCLKID'), false);
  for (const field of ['gclid', 'msclkid']) {
    const attribution = { [field]: 'fixture_click-id_123' };
    for (const consent of [body.consent, { known: true, analytics: true, advertising: false, policyVersion: 1, recordedAt: new Date(now).toISOString() }]) {
      assert.throws(() => validateLead({ ...body, attribution, consent }, e.config, now), error => error.code === 'invalid_attribution');
    }
    assert.throws(() => validateLead({ ...body, attribution, consent: { ...body.consent, advertising: true } }, e.config, now), error => error.code === 'invalid_consent');
  }
  const granted = { ...body, attribution: { gclid: 'fixture_google-click_123', msclkid: 'fixture_microsoft-click_456' }, consent: { known: true, analytics: false, advertising: true, policyVersion: 1, recordedAt: new Date(now).toISOString() } };
  for (const field of ['gclid', 'msclkid']) {
    const longest = { ...granted, attribution: { [field]: 'a'.repeat(255) } };
    assert.equal(validateLead(longest, e.config, now).attribution[field].length, 255);
    assert.throws(() => validateLead({ ...longest, attribution: { [field]: 'a'.repeat(256) } }, e.config, now));
  }
  await adapter.deliver(validateLead(granted, e.config, now), 'fixture-advertising-clicks');
  assert.equal(records.length, 2); assert.equal(records[1].RTA_GCLID, granted.attribution.gclid); assert.equal(records[1].RTA_MSCLKID, granted.attribution.msclkid);
  assert.equal(Object.hasOwn(records[1], 'GCLID'), false); assert.equal(records[1].RTA_Consent_Advertising, true);
});
test('CRM receives explicit consent timestamp only when known and never resets lifecycle on upsert', async () => {
  const config = { ...structuredClone(leadServiceConfig.zoho), enabled: true, apiOrigin: 'https://www.zohoapis.com', credentialsVerified: true, automationPolicyVerified: true };
  const requests = [];
  const adapter = createZohoAdapter(config, { getAccessToken: async () => 'fixture-only-token', fetchImpl: async (_, init) => { requests.push(JSON.parse(init.body)); return { status: 201, json: async () => ({ data: [{ status: 'success', code: 'SUCCESS', action: 'insert', details: { id: '999999999999999' } }] }) }; } });
  assert(adapter.ready); const e = environment(); const body = e.body();
  await adapter.deliver(validateLead(body, e.config), 'fixture-unique');
  let record = requests.at(-1).data[0]; assert.equal(record.RTA_Consent_Policy, 'not-recorded'); assert.equal(record.RTA_Consent_Analytics, undefined); assert.equal(record.RTA_Consent_Timestamp, undefined);
  const recordedAt = new Date(1_700_000_000_000).toISOString(); body.consent = { known: true, analytics: true, advertising: false, policyVersion: 1, recordedAt };
  await adapter.deliver(validateLead(body, e.config, 1_700_000_003_000), 'fixture-unique');
  record = requests.at(-1).data[0]; assert.equal(record.RTA_Consent_Analytics, true); assert.equal(record.RTA_Consent_Advertising, false); assert.equal(record.RTA_Consent_Timestamp, recordedAt);
  assert.equal(record.RTA_Website_Origin, 'https://rtacontractor.ae'); assert.equal(record.RTA_Form_ID, 'rta-server-enquiry-v1'); assert.equal(record.RTA_Technical_Test, false); assert.equal(record.RTA_Lifecycle_Stage, undefined); assert.equal(record.Website, undefined); assert.equal(record.Created_Time, undefined);
  assert.throws(() => validateLead({ ...body, consent: { ...body.consent, recordedAt: 'not-a-date' } }, e.config), error => error.code === 'invalid_consent');
});
test('provider configuration cannot be downgraded after its verified snapshot', async () => {
  const config = zohoFixture(); let body;
  const adapter = createZohoAdapter(config, { getAccessToken: async () => 'fixture-only-token', fetchImpl: async (_, init) => { body = JSON.parse(init.body); return { status: 201, json: async () => ({ data: [{ status: 'success', code: 'SUCCESS', action: 'insert', details: { id: '999999999999999' } }] }) }; } });
  config.externalIdField = 'Email'; config.fieldMap.email = 'Description';
  const e = environment(); await adapter.deliver(validateLead(e.body(), e.config), 'fixture-id'); assert.deepEqual(body.duplicate_check_fields, ['Fixture_External_ID']);
});
test('unverified success is reconciliation-required, never an accepted conversion', async () => {
  const e = environment({ crm: { ready: true, retrySafe: false, deliver: async () => ({ accepted: true }) } }); await e.service.intake(e.body(), randomUUID()); await e.service.drain();
  assert.equal(e.store.state.entries[0].status, 'reconciliation_required'); assert.equal(e.store.state.entries[0].events.length, 0);
});
test('disabled runtime performs no disk, provider or listener setup; health summary contains no records', async () => {
  let credentialReads = 0;
  const runtime = await createLeadRuntime(leadServiceConfig, { getAccessToken() { credentialReads++; throw new Error('Must not read'); } });
  assert.equal(runtime.ready, false); assert.equal(credentialReads, 0); assert.deepEqual(await runtime.tick(), { enabled: false }); await runtime.close();
  const e = environment(); await e.service.intake(e.body(), randomUUID()); const health = await queueHealth(e.store, 1_700_000_100_000);
  assert.equal(health.counts.queued, 1); assert.doesNotMatch(JSON.stringify(health), /fixture|email|mobile|id|PRIVATE/);
});
test('opt-in HTTP entry requires an explicit port, literal loopback and private state outside the checkout', async () => {
  assert.throws(() => validateHttpBinding({})); assert.throws(() => validateHttpBinding({ enable: true, port: 0 }));
  assert.throws(() => validateHttpBinding({ enable: true, port: 41001, host: '0.0.0.0' }));
  assert.deepEqual(validateHttpBinding({ enable: true, port: 41001 }), { host: '127.0.0.1', port: 41001, workerIntervalMs: 15000 });
  await assert.rejects(validatePrivateLocation(path.resolve('website/dist/private-state')));
  await assert.rejects(validatePrivateLocation(path.resolve('server/private-state')));
  await assert.rejects(validatePrivateLocation(path.dirname(process.cwd())));
  await assert.rejects(openEncryptedStore(path.dirname(process.cwd()), key));
  const config = structuredClone(leadServiceConfig); Object.assign(config, { enabled: true, retentionPolicyVerified: true, clientAddressPolicyVerified: true, providerSwitchVerified: true });
  Object.assign(config.zoho, { enabled: true, apiOrigin: 'https://www.zohoapis.com', credentialsVerified: true, automationPolicyVerified: true });
  await assert.rejects(createLeadRuntime(config, { key, getAccessToken: async () => { throw new Error('Must not read token'); }, resolveClientAddress: () => 'fixture', privateStateDirectory: path.resolve('website/dist/private-state') }));
});

test('store rejects shared or non-private directories without writes or permission changes', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'rta-store-policy-fixture-'));
  assert.equal(path.dirname(path.resolve(fixture)), path.resolve(tmpdir()));
  assert(path.basename(fixture).startsWith('rta-store-policy-fixture-'));
  try {
    const shared = path.join(fixture, 'shared');
    await mkdir(shared, { mode: 0o700 });
    await writeFile(path.join(shared, 'unrelated.txt'), 'UNRELATED-FIXTURE');
    const before = await stat(shared);
    await assert.rejects(openEncryptedStore(shared, key), /dedicated/);
    assert.equal((await stat(shared)).mode, before.mode);
    assert.deepEqual(await readdir(shared), ['unrelated.txt']);
    assert.equal(await readFile(path.join(shared, 'unrelated.txt'), 'utf8'), 'UNRELATED-FIXTURE');
    if (process.platform !== 'win32') {
      const exposed = path.join(fixture, 'exposed');
      await mkdir(exposed, { mode: 0o755 }); await chmod(exposed, 0o755);
      const exposedBefore = await stat(exposed);
      await assert.rejects(openEncryptedStore(exposed, key), /already be private/);
      assert.equal((await stat(exposed)).mode, exposedBefore.mode);
      assert.deepEqual(await readdir(exposed), []);
    }
    const fresh = path.join(fixture, 'rta-private-state');
    const parentMode = (await stat(fixture)).mode;
    const store = await openEncryptedStore(fresh, key); await store.close();
    assert.equal((await stat(fixture)).mode, parentMode);
    assert.deepEqual(await readdir(fresh), []);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
test('encrypted journal persists no plaintext, rejects concurrent writers and authenticates data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rta-leads-fixture-'));
  assert(path.basename(directory).startsWith('rta-leads-fixture-'));
  try {
    const store = await openEncryptedStore(directory, key);
    await store.transaction(state => { state.entries.push({ lead: 'PRIVATE-FIXTURE-SENTINEL' }); });
    assert.doesNotMatch(await readFile(path.join(directory, 'queue.enc'), 'utf8'), /PRIVATE-FIXTURE/);
    await assert.rejects(openEncryptedStore(directory, key), error => error.code === 'EEXIST'); await store.close();
    const reopened = await openEncryptedStore(directory, key); assert.equal((await reopened.snapshot()).entries[0].lead, 'PRIVATE-FIXTURE-SENTINEL'); await reopened.close();
    const filename = path.join(directory, 'queue.enc'); const envelope = JSON.parse(await readFile(filename, 'utf8')); envelope.tag = Buffer.alloc(16).toString('base64'); await writeFile(filename, JSON.stringify(envelope));
    await assert.rejects(openEncryptedStore(directory, key), /unreadable/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
async function http(handler, { body = {}, headers = {}, method = 'POST', url = '/api/leads/challenge', raw } = {}) {
  const request = Readable.from([Buffer.from(raw || JSON.stringify(body))]); Object.assign(request, { method, url, socket: { remoteAddress: 'fixture-peer' }, headers: { origin: 'https://rtacontractor.ae', 'content-type': 'application/json', ...headers } });
  const response = { writeHead(status, fields) { this.status = status; this.headers = fields; }, end(data) { this.body = JSON.parse(data); } };
  await handler(request, response); return response;
}
test('HTTP boundary rejects origins, non-JSON, oversized/chunked bodies and query paths', async () => {
  const e = environment(); const handler = createLeadHandler(e.service, e.config, { key });
  assert.equal((await http(handler, { headers: { origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await http(handler, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await http(handler, { headers: { 'content-length': '999999' } })).status, 413);
  assert.equal((await http(handler, { raw: 'x'.repeat(e.config.maxBodyBytes + 1) })).status, 413);
  assert.equal((await http(handler, { url: '/api/leads?email=private' })).status, 404);
  assert.equal((await http(handler, { raw: 'not-json' })).status, 400);
});
test('HTTP rate limiting and sanitized errors do not leak upstream values', async () => {
  const e = environment(); e.config.rateLimit.requests = 2; const handler = createLeadHandler(e.service, e.config, { key });
  assert.equal((await http(handler)).status, 200); assert.equal((await http(handler)).status, 200); const limited = await http(handler); assert.equal(limited.status, 429);
  assert.doesNotMatch(JSON.stringify(limited.body), /fixture-peer|email|token|stack/);
});
