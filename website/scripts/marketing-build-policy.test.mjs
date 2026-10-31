import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingOwnsContainer } from './marketing-build-policy.mjs';

const tracking = { enabled: true, manager: { type: 'gtm', containerId: 'GTM-PRV2VCLK' } };
const ready = () => ({ schemaVersion: 1, enabled: true, allowedHosts: ['rtacontractor.ae'], consent: {
  enabled: true, integrationReady: true, granularTagGatesVerified: true, urlAndReferrerPolicyVerified: true,
  coordinatedContainerVersion: 99, policyVersion: 1, maxAgeDays: 180, containerId: 'GTM-PRV2VCLK',
} });

test('disabled controller preserves the existing container ownership', () => {
  assert.equal(marketingOwnsContainer({ enabled: false, consent: { enabled: false, integrationReady: false } }, tracking, 'https://rtacontractor.ae'), false);
});
test('every readiness gate is required before conditional GTM ownership', () => {
  for (const key of ['enabled', 'integrationReady', 'granularTagGatesVerified', 'urlAndReferrerPolicyVerified']) {
    const config = ready(); config.consent[key] = false;
    assert.throws(() => marketingOwnsContainer(config, tracking, 'https://rtacontractor.ae'), /Incomplete consent activation/, key);
  }
  const config = ready(); config.enabled = false;
  assert.throws(() => marketingOwnsContainer(config, tracking, 'https://rtacontractor.ae'), /Incomplete consent activation/);
});
test('unverified versions, policy windows, hosts and container identity fail closed', () => {
  for (const mutate of [
    c => { c.consent.coordinatedContainerVersion = null; },
    c => { c.consent.policyVersion = 0; },
    c => { c.consent.maxAgeDays = 366; },
    c => { c.allowedHosts = ['other.example']; },
    c => { c.consent.containerId = 'GTM-OTHER123'; },
    c => { c.schemaVersion = 2; },
  ]) {
    const config = ready(); mutate(config);
    assert.throws(() => marketingOwnsContainer(config, tracking, 'https://rtacontractor.ae'), /Incomplete consent activation/);
  }
  assert.throws(() => marketingOwnsContainer(ready(), { ...tracking, enabled: false }, 'https://rtacontractor.ae'), /Incomplete consent activation/);
});
test('fully coordinated configuration delegates to the single controller', () => {
  assert.equal(marketingOwnsContainer(ready(), tracking, 'https://rtacontractor.ae'), true);
});
