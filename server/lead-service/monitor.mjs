import { pathToFileURL } from 'node:url';
import { leadServiceConfig, readiness } from './config.mjs';

export async function queueHealth(store, now = Date.now()) {
  const state = await store.snapshot();
  const counts = { queued: 0, sending: 0, accepted: 0, failed: 0, reconciliation_required: 0 };
  let oldestPendingMs = 0;
  for (const entry of state.entries) {
    if (Object.hasOwn(counts, entry.status)) counts[entry.status]++;
    if (['queued', 'sending', 'reconciliation_required'].includes(entry.status)) oldestPendingMs = Math.max(oldestPendingMs, now - entry.createdAt);
  }
  return { counts, oldestPendingMinutes: Math.max(0, Math.floor(oldestPendingMs / 60_000)), alertsConfigured: false };
}
// Configuration report only; never reads secrets, decrypts a live queue, sends
// notifications, connects providers or installs a schedule by itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ mode: 'configuration-only', ...readiness(leadServiceConfig), notificationsEnabled: false, schedulesInstalled: false }, null, 2));
}
