import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export class LeadError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
export const hmac = (key, purpose, value) => createHmac('sha256', key).update(purpose + '\0' + value).digest('hex');
const text = (value, max, required = true) => {
  if (typeof value !== 'string') { if (!required && value === undefined) return ''; throw new LeadError('invalid_fields'); }
  const result = value.normalize('NFKC').trim();
  if ((!result && required) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new LeadError('invalid_fields');
  return result;
};
export function validateLead(input, config, now = Date.now()) {
  const keys = ['firstName', 'lastName', 'company', 'mobile', 'email', 'requestedService', 'projectLocation', 'projectDescription', 'projectName', 'attribution', 'consent', 'website', 'challenge'];
  if (!object(input) || Object.keys(input).some(key => !keys.includes(key))) throw new LeadError('invalid_fields');
  if (typeof input.website !== 'string' || input.website.length > 0) throw new LeadError('spam_rejected', 422);
  const mobile = text(input.mobile, 32).replace(/[\s().-]/g, '');
  const email = text(input.email, 254).toLowerCase();
  if (!/^\+?[0-9]{7,15}$/.test(mobile) || !/^[^\s@\r\n]{1,64}@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email)) throw new LeadError('invalid_fields');
  const projectDescription = text(input.projectDescription, 2000);
  if ((projectDescription.match(/https?:\/\//gi) || []).length > 2 || /(.)\1{19}/u.test(projectDescription)) throw new LeadError('spam_rejected', 422);
  const attribution = {};
  if (input.attribution !== undefined) {
    if (!object(input.attribution)) throw new LeadError('invalid_attribution');
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content'];
    const allowed = [...utms, 'gclid', 'msclkid', 'landingPath', 'sourceGroup', 'referrerHost'];
    if (Object.keys(input.attribution).some(key => !allowed.includes(key))) throw new LeadError('invalid_attribution');
    for (const key of utms) if (input.attribution[key] !== undefined) {
      const value = text(input.attribution[key], 100, false);
      if (!/^[\p{L}\p{N} ._-]*$/u.test(value)) throw new LeadError('invalid_attribution');
      attribution[key] = value;
    }
    for (const key of ['gclid', 'msclkid']) if (input.attribution[key] !== undefined) {
      const value = text(input.attribution[key], 255, false); if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new LeadError('invalid_attribution'); attribution[key] = value;
    }
    if (input.attribution.landingPath !== undefined) {
      if (!config.allowedLandingPaths.includes(input.attribution.landingPath)) throw new LeadError('invalid_attribution'); attribution.landingPath = input.attribution.landingPath;
    }
    const groups = ['direct', 'organic_search', 'ai_referral', 'social_referral', 'referral', 'paid', 'unknown'];
    if (input.attribution.sourceGroup !== undefined) { if (!groups.includes(input.attribution.sourceGroup)) throw new LeadError('invalid_attribution'); attribution.sourceGroup = input.attribution.sourceGroup; }
    if (input.attribution.referrerHost !== undefined) {
      const allowedHosts = ['google.com', 'google.ae', 'bing.com', 'duckduckgo.com', 'search.yahoo.com', 'chatgpt.com', 'perplexity.ai', 'copilot.microsoft.com', 'linkedin.com', 'facebook.com', 'instagram.com'];
      if (!allowedHosts.includes(input.attribution.referrerHost)) throw new LeadError('invalid_attribution'); attribution.referrerHost = input.attribution.referrerHost;
    }
  }
  const consent = input.consent;
  if (!object(consent) || Object.keys(consent).some(key => !['analytics', 'advertising', 'policyVersion', 'known', 'recordedAt'].includes(key))
    || typeof consent.analytics !== 'boolean' || typeof consent.advertising !== 'boolean' || !Number.isInteger(consent.policyVersion) || consent.policyVersion < 1) throw new LeadError('invalid_consent');
  if (consent.known !== undefined && typeof consent.known !== 'boolean') throw new LeadError('invalid_consent');
  const known = consent.known === true;
  if (known && (typeof consent.recordedAt !== 'string' || !Number.isFinite(Date.parse(consent.recordedAt)) || new Date(consent.recordedAt).toISOString() !== consent.recordedAt || Date.parse(consent.recordedAt) > now || now - Date.parse(consent.recordedAt) > 365 * 86_400_000)) throw new LeadError('invalid_consent');
  if (!known && (consent.analytics || consent.advertising || consent.recordedAt != null)) throw new LeadError('invalid_consent');
  if (!consent.advertising && (attribution.gclid || attribution.msclkid)) throw new LeadError('invalid_attribution');
  const firstName = text(input.firstName, 80, false); const lastName = text(input.lastName, 120);
  return { firstName, lastName, customerName: [firstName, lastName].filter(Boolean).join(' '), siteOrigin: config.siteOrigin, formId: config.formId, technicalTest: config.technicalTest, company: text(input.company, 160), mobile, email,
    requestedService: text(input.requestedService, 120), projectLocation: text(input.projectLocation, 160), projectDescription,
    projectName: text(input.projectName, 160, false),
    attribution, consent: { analytics: consent.analytics, advertising: consent.advertising, policyVersion: consent.policyVersion, known, ...(known ? { recordedAt: consent.recordedAt } : {}) } };
}
export function createChallenge(key, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ v: 1, issuedAt: now, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return body + '.' + hmac(key, 'challenge', body);
}
export function verifyChallenge(token, key, config, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 512 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) throw new LeadError('invalid_challenge');
  const [body, signature] = token.split('.');
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hmac(key, 'challenge', body), 'hex'))) throw new LeadError('invalid_challenge');
  let data; try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new LeadError('invalid_challenge'); }
  const age = now - data.issuedAt;
  if (!object(data) || data.v !== 1 || !/^[a-f0-9]{32}$/.test(data.nonce) || !Number.isSafeInteger(data.issuedAt) || age < config.minAgeMs || age > config.maxAgeMs) throw new LeadError('invalid_challenge');
  return hmac(key, 'used-challenge', token);
}
