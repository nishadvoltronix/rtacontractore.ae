// Public configuration only. No credentials, personal information or API secrets.
// Destination IDs describe the existing GTM setup; this adapter loads no vendors.
export const trackingConfig = {
  schemaVersion: 1,
  enabled: true,
  allowedHosts: ['rtacontractor.ae', 'www.rtacontractor.ae'],
  manager: { type: 'gtm', containerId: 'GTM-PRV2VCLK' },
  managedDestinations: {
    googleAnalytics: { managedBy: 'gtm', measurementId: 'G-8C46B5LDG5' },
    googleAds: { managedBy: 'gtm', destinationId: 'AW-11457374723' },
    clarity: { managedBy: 'gtm', projectId: 'z6fmpmv4i3' },
  },
  form: {
    provider: 'zoho_webform',
    formId: 'webform5653678000076526082',
    endpoint: 'https://crm.zoho.com/crm/WebToLeadForm',
    mode: 'explicit-response-only',
    // Exact server acknowledgment verified against one authorized CRM test.
    // Changes to this receipt require a new provider/CRM verification.
    acceptanceProfile: {
      name: 'rta-zoho-splash-ack-v1',
      actionsubmit: 'Splash Message',
      actionvalue: 'Thank you for your response.',
    },
    observeFetch: true,
    submitTtlMs: 10000,
  },
  assistant: { enabled: true },
  // Placeholders are disabled. Adding an ID here never installs a vendor tag.
  // Any future destination requires a separately reviewed GTM integration.
  optionalDestinations: {
    microsoftUet: { enabled: false, tagId: '187284886' },
    meta: { enabled: false, pixelId: null },
    linkedIn: { enabled: false, partnerId: null },
  },
};
