import { randomUUID } from 'node:crypto';
import { readiness } from './config.mjs';
import { LeadError, createChallenge, verifyChallenge, validateLead, hmac } from './validation.mjs';

export function createLeadService(config, dependencies) {
  config = structuredClone(config);
  const { store, crm, hub, now = Date.now, verifyLifecycleReceipt } = dependencies;
  const key = Buffer.isBuffer(dependencies.key) ? Buffer.from(dependencies.key) : dependencies.key;
  const availability = readiness(config, dependencies);
  const requireReady = () => { if (!availability.ready) throw new LeadError('unavailable', 503); };
  const hashKey = value => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new LeadError('invalid_idempotency_key');
    return hmac(key, 'idempotency', value.toLowerCase());
  };
  const publicStatus = (entry, token) => ({ status: entry.status === 'accepted' ? 'accepted' : entry.status === 'failed' ? 'failed' : entry.status === 'reconciliation_required' ? 'reconciliation_required' : 'queued', accepted: entry.status === 'accepted', duplicate: entry.keys[0] !== token });
  let draining;
  async function drain() {
    requireReady();
    if (draining) return draining;
    draining = (async () => {
      // A crash cannot turn a possibly accepted create into another blind create.
      await store.transaction(state => {
        for (const entry of state.entries) if (entry.status === 'sending') entry.status = crm.retrySafe === true ? 'queued' : 'reconciliation_required';
      });
      for (let count = 0; count < 20; count++) {
        const entry = await store.transaction(state => {
          const next = state.entries.find(item => item.status === 'queued' && (item.retryAt || 0) <= now());
          if (!next) return null;
          next.status = 'sending'; next.attempts++; return next;
        });
        if (!entry) break;
        let receipt; let failure;
        try { receipt = await crm.deliver({ ...entry.lead, createdAt: new Date(entry.createdAt).toISOString() }, entry.externalId); }
        catch (error) { failure = error?.kind || 'ambiguous'; }
        if (!failure && !(receipt?.verified === true && receipt.provider === 'zoho' && typeof receipt.id === 'string')) failure = 'ambiguous';
        await store.transaction(state => {
          const current = state.entries.find(item => item.id === entry.id);
          if (receipt?.verified === true && receipt.provider === 'zoho' && typeof receipt.id === 'string') {
            current.status = 'accepted'; current.crmId = receipt.id; current.acceptedAt = now();
            if (config.lifecycle.enabled) current.events.push({ event: config.lifecycle.eventMap.new_lead, stage: 'new_lead' });
          } else if (['ambiguous', 'transient'].includes(failure) && crm.retrySafe === true && current.attempts < 3) {
            current.status = 'queued'; current.retryAt = now() + Math.min(300_000, 30_000 * 2 ** current.attempts);
          } else current.status = ['ambiguous', 'transient'].includes(failure) ? 'reconciliation_required' : 'failed';
          current.lastOutcome = current.status; // No response body, exception or contact values in logs.
        });
      }
      if (config.hub.enabled && hub?.ready) {
        const snapshot = await store.snapshot();
        for (const entry of snapshot.entries.filter(item => item.status === 'accepted' && !item.hub?.confirmed && !item.hub?.reconciliationRequired)) {
          let receipt;
          try { receipt = await hub.deliver({ ...entry.lead, createdAt: new Date(entry.createdAt).toISOString() }, entry.externalId); } catch { /* Preserve CRM success; never resubmit CRM for HUB failure. */ }
          await store.transaction(state => {
            const current = state.entries.find(item => item.id === entry.id);
            current.hub = receipt?.verified === true ? { confirmed: true, id: receipt.id } : { confirmed: false, reconciliationRequired: true };
          });
        }
      }
    })().finally(() => { draining = undefined; });
    return draining;
  }
  return {
    availability,
    challenge() { requireReady(); return { challenge: createChallenge(key, now()), minAgeMs: config.challenge.minAgeMs }; },
    async intake(input, idempotencyKey) {
      requireReady(); const token = hashKey(idempotencyKey); const lead = validateLead(input, config, now());
      const payloadHash = hmac(key, 'payload', JSON.stringify(lead));
      const fingerprint = hmac(key, 'dedupe', JSON.stringify([lead.siteOrigin, lead.formId, lead.technicalTest, lead.customerName.toLowerCase(), lead.company.toLowerCase(), lead.email, lead.mobile, lead.requestedService.toLowerCase(), lead.projectName, lead.projectLocation.toLowerCase(), lead.projectDescription]));
      return store.transaction(state => {
        const existing = state.entries.find(entry => entry.keys.includes(token));
        if (existing) { if ((existing.keyHashes?.[token] || existing.payloadHash) !== payloadHash) throw new LeadError('idempotency_conflict', 409); return publicStatus(existing, token); }
        const challenge = verifyChallenge(input.challenge, key, config.challenge, now());
        if (state.consumedChallenges[challenge]) throw new LeadError('challenge_consumed', 409);
        const duplicate = state.entries.find(entry => entry.fingerprint === fingerprint && entry.createdAt >= now() - config.dedupeWindowMs);
        if (duplicate) {
          if (duplicate.keys.length >= 32) throw new LeadError('unavailable', 503);
          duplicate.keys.push(token); duplicate.keyHashes = { ...duplicate.keyHashes, [token]: payloadHash };
          state.consumedChallenges[challenge] = duplicate.id; return publicStatus(duplicate, token);
        }
        if (state.entries.length >= config.maxQueueEntries) throw new LeadError('unavailable', 503);
        const id = randomUUID(); state.consumedChallenges[challenge] = id;
        const entry = { id, externalId: `rta-${id}`, keys: [token], keyHashes: { [token]: payloadHash }, payloadHash, fingerprint, lead, createdAt: now(), status: 'queued', attempts: 0, events: [] };
        state.entries.push(entry); return publicStatus(entry, token);
      });
    },
    async status(idempotencyKey) {
      requireReady(); const token = hashKey(idempotencyKey); const state = await store.snapshot();
      const entry = state.entries.find(item => item.keys.includes(token)); if (!entry) throw new LeadError('not_found', 404); return publicStatus(entry, token);
    },
    drain,
    async recordLifecycle(receipt) {
      requireReady(); if (!config.lifecycle.enabled || typeof verifyLifecycleReceipt !== 'function') throw new LeadError('unavailable', 503);
      const verified = await verifyLifecycleReceipt(receipt); // Signature/replay/auth checks belong to the verified provider contract.
      if (verified?.verified !== true || !Object.hasOwn(config.lifecycle.eventMap, verified.stage) || typeof verified.crmId !== 'string') throw new LeadError('unverified_lifecycle');
      return store.transaction(state => {
        const entry = state.entries.find(item => item.status === 'accepted' && item.crmId === verified.crmId);
        if (!entry) throw new LeadError('not_found', 404);
        if (!entry.events.some(item => item.stage === verified.stage)) entry.events.push({ stage: verified.stage, event: config.lifecycle.eventMap[verified.stage] });
        return { recorded: true };
      });
    },
    async purgeExpired() {
      requireReady();
      // A batch may hold a receipt for a CRM/HUB write outside the store lock.
      // Defer the purge rather than deleting its journal row under that receipt.
      if (draining) return { removed: 0, deferred: true, deferredEntries: null, reason: 'delivery_in_progress' };
      return store.transaction(state => {
        const cutoff = now() - config.retentionDays * 86_400_000; const previous = state.entries.length;
        // A sending row can also survive a crash. Preserve its key and evidence
        // until recovery/reconciliation, even when no live batch is running.
        const deferredEntries = state.entries.filter(entry => entry.createdAt < cutoff && entry.status === 'sending').length;
        state.entries = state.entries.filter(entry => entry.createdAt >= cutoff || entry.status === 'sending');
        const retained = new Set(state.entries.map(entry => entry.id));
        state.consumedChallenges = Object.fromEntries(Object.entries(state.consumedChallenges).filter(([, id]) => retained.has(id)));
        return { removed: previous - state.entries.length, deferred: deferredEntries > 0, deferredEntries,
          ...(deferredEntries ? { reason: 'sending_entries_require_recovery' } : {}) };
      });
    },
  };
}
