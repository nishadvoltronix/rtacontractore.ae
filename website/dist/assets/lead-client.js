// No automatic form listener. The existing Zoho embed stays its sole provider.
export function createLeadClient(config, windowObject, { getConsent = () => ({ analytics: false, advertising: false, policyVersion: 1 }), getAttribution = () => ({}), onAccepted = () => {} } = {}) {
  const active = config?.enabled === true && config.providerSwitchVerified === true;
  let attempt; let acceptedEventEmitted = false; let definitelyRejected = false;
  const request = async (suffix, body, key) => {
    const endpoint = new URL(config.endpoint + suffix, windowObject.location.origin);
    if (endpoint.origin !== windowObject.location.origin || endpoint.pathname !== '/api/leads' + suffix || endpoint.search || endpoint.hash) throw new Error('Invalid same-origin lead endpoint');
    const response = await windowObject.fetch(endpoint.href, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body), credentials: 'same-origin', redirect: 'error' });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Lead service response unavailable');
    const receipt = await response.json();
    if (!response.ok) {
      const error = new Error('Lead service did not confirm this request');
      error.definitePrequeueRejection = [400, 403, 413, 415, 422].includes(response.status)
        && ['invalid_fields', 'invalid_json', 'invalid_consent', 'invalid_attribution', 'invalid_challenge', 'origin_rejected', 'body_too_large', 'json_required', 'spam_rejected'].includes(receipt?.error);
      throw error;
    }
    return receipt;
  };
  const accept = receipt => {
    if (!receipt || Object.keys(receipt).length !== 3 || typeof receipt.accepted !== 'boolean' || typeof receipt.duplicate !== 'boolean'
      || !['accepted', 'queued', 'failed', 'reconciliation_required'].includes(receipt.status)
      || receipt.accepted !== (receipt.status === 'accepted')) throw new Error('Unrecognized lead status');
    definitelyRejected = false;
    if (receipt?.accepted === true && receipt.status === 'accepted' && !acceptedEventEmitted) {
      acceptedEventEmitted = true;
      if (config.emitClientSuccess === true && !receipt.duplicate) onAccepted({ event: 'contact_form_success' });
    }
    return receipt;
  };
  return {
    enabled: active,
    async prepare() {
      if (!active) return { enabled: false };
      if (attempt) return { ready: true };
      const challenge = await request('/challenge', {});
      if (typeof challenge.challenge !== 'string' || challenge.challenge.length > 512) throw new Error('Lead challenge unavailable');
      attempt = { key: windowObject.crypto.randomUUID(), challenge: challenge.challenge, body: null };
      return { ready: true };
    },
    async submit(fields) {
      if (!active) return { enabled: false, accepted: false };
      if (!attempt) throw new Error('Prepare this form before submission');
      if (!attempt.body) attempt.body = { ...fields, challenge: attempt.challenge, consent: getConsent(), attribution: getAttribution() };
      // A network ambiguity retains the same body/key. Never switch to Zoho or
      // create a second provider attempt automatically after sending this one.
      try { return accept(await request('', attempt.body, attempt.key)); }
      catch (error) { definitelyRejected = error.definitePrequeueRejection === true; throw error; }
    },
    async status() {
      if (!active || !attempt) return { enabled: false, accepted: false };
      return accept(await request('/status', {}, attempt.key));
    },
    resetAfterConfirmedCompletion() { if (!acceptedEventEmitted) return false; attempt = undefined; acceptedEventEmitted = false; return true; },
    resetRejectedAttempt() { if (!definitelyRejected) return false; attempt = undefined; definitelyRejected = false; return true; },
  };
}
