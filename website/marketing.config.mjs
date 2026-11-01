// Public configuration only. No provider credentials belong in this file.
export const marketingConfig = {
  schemaVersion: 1,
  enabled: false,
  allowedHosts: ['rtacontractor.ae', 'www.rtacontractor.ae'],
  consent: {
    enabled: false,
    integrationReady: false,
    // Separate visitor opt-in; advertising measurement alone never grants this.
    microsoftEnhancedConversionsEnabled: false,
    policyVersion: 1,
    maxAgeDays: 180,
    storageKey: 'rta-consent-v1',
    containerId: 'GTM-PRV2VCLK',
    coordinatedContainerVersion: null,
    // Enable only after every vendor tag/trigger and consent template is audited.
    granularTagGatesVerified: false,
    urlAndReferrerPolicyVerified: false,
  },
  attribution: {
    enabled: false, storageKey: 'rta-attribution-v1', maxAgeDays: 30,
    // Only verified public campaign values survive into vendor page URLs.
    // Other bounded attribution stays local/server-side, not analytics URLs.
    approvedAnalyticsUtmValues: { utm_source: ['google'], utm_medium: ['cpc'], utm_campaign: ['rta_street_lighting_dubai'], utm_id: ['24406641767'] },
    allowedLandingPaths: ['/', '/services/street-lighting/', '/services/underground-cabling/', '/services/high-mast-area-lighting/', '/services/led-solar-lighting/', '/services/lighting-maintenance/', '/services/electrical-infrastructure/', '/services/', '/about/', '/contact/', '/request-a-quote/', '/faqs/', '/knowledge/', '/cookies/', '/knowledge/street-lighting-quotation-checklist/', '/knowledge/lighting-handover-checklist/', '/knowledge/contractor-qualification-and-project-approvals/', '/privacy/', '/photography/', '/404.html'],
  },
  leadCapture: {
    enabled: false,
    endpoint: '/api/leads',
    emitClientSuccess: false,
    providerSwitchVerified: false,
  },
};
