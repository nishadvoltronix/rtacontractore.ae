import { marketingConfig } from '../../website/marketing.config.mjs';
// Server-only example. Activation requires verified credentials, contracts,
// retention policy, proxy/origin configuration and an approved provider switch.
export const leadServiceConfig = {
  enabled: false,
  siteOrigin: 'https://rtacontractor.ae',
  formId: 'rta-server-enquiry-v1', // A future server-owned form, not the preserved Zoho embed.
  technicalTest: false,
  origins: ['https://rtacontractor.ae', 'https://www.rtacontractor.ae'],
  maxBodyBytes: 16_384,
  rateLimit: { requests: 6, windowMs: 60_000 },
  maxQueueEntries: 1000,
  dedupeWindowMs: 86_400_000,
  retentionDays: 7,
  retentionPolicyVerified: false,
  clientAddressPolicyVerified: false,
  providerSwitchVerified: false,
  challenge: { minAgeMs: 1500, maxAgeMs: 1_800_000 },
  allowedLandingPaths: [...marketingConfig.attribution.allowedLandingPaths],
  zoho: {
    enabled: false,
    apiOrigin: null,
    module: 'Leads',
    fieldMap: {
      firstName: 'First_Name', lastName: 'Last_Name', company: 'Company', email: 'Email', mobile: 'Mobile',
      requestedService: 'Product_Service_Interest', projectLocation: 'Project_Location', projectDescription: 'Description', projectName: 'Project_Name',
      siteOrigin: 'RTA_Website_Origin', formId: 'RTA_Form_ID',
      utm_source: 'RTA_UTM_Source', utm_medium: 'RTA_UTM_Medium', utm_campaign: 'RTA_UTM_Campaign', utm_id: 'RTA_UTM_Campaign_ID', utm_term: 'RTA_UTM_Term', utm_content: 'RTA_UTM_Content',
      gclid: 'RTA_GCLID', msclkid: 'RTA_MSCLKID',
      landingPath: 'RTA_Landing_Path', referrerHost: 'RTA_Referrer_Host',
      consentAnalytics: 'RTA_Consent_Analytics', consentAdvertising: 'RTA_Consent_Advertising', consentTimestamp: 'RTA_Consent_Timestamp', consentPolicy: 'RTA_Consent_Policy',
      technicalTest: 'RTA_Technical_Test', lifecycleStage: 'RTA_Lifecycle_Stage',
    },
    fieldMetadataVerified: true,
    externalIdField: 'RTA_Submission_ID',
    uniqueFieldVerified: true,
    credentialsVerified: false,
    gclidWritabilityVerified: true,
    msclkidWritabilityVerified: true,
    metadataEvidence: '2026-11-01 Dubai: native connector created/read back 19 additive non-mandatory fields; 116 total; previous 97/global Lead Status preserved. RTA_Submission_ID text100 unique, case-insensitive. RTA_GCLID and RTA_MSCLKID text255, field_read_only:false, api_create:true and api_update:true. Standard GCLID is field_read_only:true, api_create:true and api_update:false; excluded from retryable upsert.',
    automationPolicyVerified: false,
    staticFields: { Assign_Department: 'VOLTRONIX CONTRACTING LLC' },
  },
  hub: { enabled: false, contractVerified: false },
  lifecycle: { enabled: false, eventMap: { new_lead: 'contact_form_success', qualified: 'qualified_lead', site_visit: 'site_visit_booked', proposal: 'quotation_submitted', won: 'closed_won_project' } },
};

export function readiness(config, dependencies = {}) {
  const missing = [];
  if (config?.enabled !== true) missing.push('service_disabled');
  for (const key of ['retentionPolicyVerified', 'clientAddressPolicyVerified', 'providerSwitchVerified']) if (config?.[key] !== true) missing.push(key);
  if (!Array.isArray(config?.origins) || !config.origins.length || config.origins.some(value => {
    try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value || url.username || url.password; } catch { return true; }
  })) missing.push('exact_https_origins');
  if (!config?.origins?.includes(config.siteOrigin)) missing.push('server_owned_site_origin');
  if (typeof config?.formId !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(config.formId) || typeof config.technicalTest !== 'boolean') missing.push('server_owned_form_identity');
  if (!Buffer.isBuffer(dependencies.key) || dependencies.key.length !== 32) missing.push('server_encryption_key');
  if (!Number.isInteger(config?.maxBodyBytes) || config.maxBodyBytes < 1024 || config.maxBodyBytes > 65_536
    || !Number.isInteger(config?.maxQueueEntries) || config.maxQueueEntries < 1 || config.maxQueueEntries > 10_000
    || !Number.isInteger(config?.retentionDays) || config.retentionDays < 1 || config.retentionDays > 90
    || !Number.isInteger(config?.rateLimit?.requests) || config.rateLimit.requests < 1 || config.rateLimit.requests > 100
    || !Number.isInteger(config?.rateLimit?.windowMs) || config.rateLimit.windowMs < 1000 || config.rateLimit.windowMs > 3_600_000
    || !Number.isInteger(config?.challenge?.minAgeMs) || config.challenge.minAgeMs < 1000
    || !Number.isInteger(config?.challenge?.maxAgeMs) || config.challenge.maxAgeMs > 3_600_000 || config.challenge.maxAgeMs <= config.challenge.minAgeMs
    || !Number.isInteger(config?.dedupeWindowMs) || config.dedupeWindowMs < 1000 || config.dedupeWindowMs > 604_800_000
    || !Array.isArray(config.allowedLandingPaths)) missing.push('bounded_service_limits');
  if (!config?.hub || !config?.lifecycle) missing.push('feature_configuration');
  if (config?.lifecycle?.enabled && (!config.lifecycle.eventMap?.new_lead || !Object.values(config.lifecycle.eventMap).every(name => /^[a-z][a-z0-9_]{1,39}$/.test(name)))) missing.push('lifecycle_event_allowlist');
  if (!dependencies.store || !dependencies.crm?.ready) missing.push('durable_store_and_verified_crm_adapter');
  if (config?.hub?.enabled && !dependencies.hub?.ready) missing.push('verified_hub_contract');
  return Object.freeze({ ready: missing.length === 0, missing });
}
