export class ProviderError extends Error {
  constructor(kind = 'ambiguous') { super('Provider delivery not confirmed'); this.kind = kind; }
}
const apiName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value);
const knownZohoOrigins = new Set(['https://www.zohoapis.com', 'https://www.zohoapis.eu', 'https://www.zohoapis.in', 'https://www.zohoapis.com.au', 'https://www.zohoapis.jp', 'https://www.zohoapis.ca', 'https://www.zohoapis.com.cn', 'https://www.zohoapis.sa']);
const leadFields = new Set(['firstName', 'lastName', 'customerName', 'siteOrigin', 'formId', 'company', 'mobile', 'email', 'requestedService', 'projectLocation', 'projectDescription', 'projectName', 'createdAt', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'landingPath', 'referrerHost', 'gclid', 'msclkid', 'consentAnalytics', 'consentAdvertising', 'consentTimestamp', 'consentPolicy', 'technicalTest', 'lifecycleStage']);
async function bounded(operation, milliseconds = 8000) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(new ProviderError('ambiguous')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

// Requires a verified user-defined unique/external field. Email is deliberately
// not the retry key: different genuine enquiries can share an email address.
export function createZohoAdapter(config, { getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  config = structuredClone(config || {});
  const map = config?.fieldMap || {};
  const ready = config?.enabled === true && knownZohoOrigins.has(config.apiOrigin)
    && config.fieldMetadataVerified === true && config.uniqueFieldVerified === true && config.credentialsVerified === true && config.automationPolicyVerified === true
    && apiName(config.module) && apiName(config.externalIdField)
    && [...leadFields].filter(key => !['customerName', 'createdAt', 'projectName', 'lifecycleStage', 'gclid', 'msclkid'].includes(key)).every(key => apiName(map[key]))
    && Object.entries(map).every(([key, value]) => leadFields.has(key) && apiName(value))
    && new Set(Object.values(map)).size === Object.values(map).length
    && !Object.values(map).includes(config.externalIdField)
    && config.staticFields?.Assign_Department === 'VOLTRONIX CONTRACTING LLC'
    && (!map.gclid || config.gclidWritabilityVerified === true) && (!map.msclkid || config.msclkidWritabilityVerified === true)
    && Object.entries(config.staticFields || {}).every(([field, value]) => apiName(field) && !Object.values(map).includes(field) && field !== config.externalIdField && typeof value === 'string' && value.length <= 200 && !/[\r\n]/.test(value))
    && typeof getAccessToken === 'function' && typeof fetchImpl === 'function';
  return {
    ready, retrySafe: ready,
    async deliver(lead, externalId) {
      if (!ready) throw new ProviderError('disabled');
      const token = await bounded(getAccessToken);
      if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new ProviderError('credentials');
      const source = { ...lead, ...lead.attribution,
        consentAnalytics: lead.consent?.known ? lead.consent.analytics : undefined,
        consentAdvertising: lead.consent?.known ? lead.consent.advertising : undefined,
        consentTimestamp: lead.consent?.known ? lead.consent.recordedAt : undefined,
        consentPolicy: lead.consent?.known ? `rta-policy-${lead.consent.policyVersion}` : 'not-recorded',
      };
      // Do not reset lifecycle stage on an ambiguous upsert retry. Its verified
      // mapping is reserved for a separate authenticated lifecycle contract.
      delete source.lifecycleStage;
      const record = { ...config.staticFields, ...Object.fromEntries(Object.entries(map).filter(([key]) => source[key] !== undefined).map(([key, field]) => [field, source[key]])) };
      record[config.externalIdField] = externalId;
      let response;
      try {
        response = await fetchImpl(`${config.apiOrigin}/crm/v8/${config.module}/upsert`, {
          method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: [record], duplicate_check_fields: [config.externalIdField], trigger: [] }),
          signal: AbortSignal.timeout(8000), redirect: 'error',
        });
      } catch { throw new ProviderError('ambiguous'); }
      if (response.status === 429 || response.status >= 500) throw new ProviderError('transient');
      if (![200, 201, 207].includes(response.status)) throw new ProviderError(response.status >= 200 && response.status < 300 ? 'ambiguous' : 'rejected');
      let body; try { body = await response.json(); } catch { throw new ProviderError('ambiguous'); }
      const item = body?.data?.[0];
      if (!Array.isArray(body?.data) || body.data.length !== 1 || item?.status !== 'success' || item.code !== 'SUCCESS'
        || !['insert', 'update'].includes(item.action) || !/^[0-9]{10,30}$/.test(item.details?.id || '')) throw new ProviderError('ambiguous');
      return { verified: true, provider: 'zoho', id: item.details.id };
    },
  };
}

// No HUB endpoint, authentication, schema or acknowledgment is invented.
// The owner must provide a verified adapter with stable external-id semantics.
export function createHubAdapter(config, contract) {
  config = structuredClone(config || {});
  const ready = config?.enabled === true && config.contractVerified === true
    && contract?.idempotentExternalId === true && typeof contract.deliver === 'function' && typeof contract.verifyReceipt === 'function';
  const deliver = contract?.deliver?.bind(contract); const verifyReceipt = contract?.verifyReceipt?.bind(contract);
  return {
    ready, retrySafe: ready,
    async deliver(lead, externalId) {
      if (!ready) throw new ProviderError('disabled');
      const response = await bounded(() => deliver(lead, externalId, { signal: AbortSignal.timeout(8000) }));
      const receipt = await bounded(() => verifyReceipt(response, externalId));
      if (receipt?.verified !== true || receipt.provider !== 'hub' || typeof receipt.id !== 'string') throw new ProviderError('ambiguous');
      return receipt;
    },
  };
}
