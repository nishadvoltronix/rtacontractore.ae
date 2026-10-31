// Prevent a partially enabled controller from leaving an unconditional GTM loader
// in the generated HTML. Flags are review gates, not proof of vendor behavior.
export function marketingOwnsContainer(config, tracking, siteUrl) {
  const consent = config?.consent || {};
  const requested = config?.enabled === true || consent.enabled === true || consent.integrationReady === true;
  if (!requested) return false;
  const host = new URL(siteUrl).hostname;
  const ready = config.schemaVersion === 1 && config.enabled === true && consent.enabled === true
    && consent.integrationReady === true && consent.granularTagGatesVerified === true
    && consent.urlAndReferrerPolicyVerified === true
    && Number.isInteger(consent.coordinatedContainerVersion) && consent.coordinatedContainerVersion > 0
    && Number.isInteger(consent.policyVersion) && consent.policyVersion > 0
    && Number.isInteger(consent.maxAgeDays) && consent.maxAgeDays > 0 && consent.maxAgeDays <= 365
    && Array.isArray(config.allowedHosts) && config.allowedHosts.includes(host)
    && /^GTM-[A-Z0-9]+$/.test(consent.containerId || '')
    && tracking?.enabled === true && tracking.manager?.type === 'gtm'
    && consent.containerId === tracking.manager.containerId;
  if (!ready) throw new Error('Incomplete consent activation: verify coordinated GTM, URL/referrer policy, identity and all readiness gates before building.');
  return true;
}
