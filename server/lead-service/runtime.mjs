import { readiness } from './config.mjs';
import { createZohoAdapter, createHubAdapter } from './providers.mjs';
import { openEncryptedStore } from './store.mjs';
import { createLeadService } from './service.mjs';
import { createLeadHandler } from './http.mjs';
import { queueHealth } from './monitor.mjs';
import { validatePrivateLocation } from './paths.mjs';

// Composition boundary only. No listener, schedule, environment/credential read,
// provider request or disk write occurs merely by importing this module.
export async function createLeadRuntime(config, options = {}) {
  const crm = createZohoAdapter(config.zoho, options);
  const hub = createHubAdapter(config.hub, options.hubContract);
  const precheck = readiness(config, { key: options.key, crm, hub, store: true });
  const missing = [...precheck.missing];
  if (typeof options.resolveClientAddress !== 'function') missing.push('verified_client_address_resolver');
  const runtimeReady = precheck.ready && typeof options.resolveClientAddress === 'function';
  if (!runtimeReady) return {
    ready: false, missing,
    handler: createLeadHandler({ availability: { ready: false } }, config),
    async tick() { return { enabled: false }; }, async close() {},
  };
  const privateStateDirectory = await validatePrivateLocation(options.privateStateDirectory, options.publicRoot);
  const store = await openEncryptedStore(privateStateDirectory, options.key);
  const service = createLeadService(config, { store, key: options.key, crm, hub, now: options.now, verifyLifecycleReceipt: options.verifyLifecycleReceipt });
  let active; let closing = false;
  return {
    ready: true,
    handler: createLeadHandler(service, config, { key: options.key, now: options.now, resolveClientAddress: options.resolveClientAddress }),
    // Host invokes this through its approved worker/schedule. No hidden timer.
    tick() {
      if (closing) return Promise.reject(new Error('Runtime closing'));
      if (!active) active = service.drain().finally(() => { active = undefined; });
      return active;
    },
    health: () => queueHealth(store, options.now?.() ?? Date.now()),
    purgeExpired: service.purgeExpired,
    recordLifecycle: service.recordLifecycle,
    async close() { closing = true; try { await active; } finally { await store.close(); } },
  };
}
