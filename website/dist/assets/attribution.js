const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content'];
const REFERRERS = ['google.com', 'google.ae', 'bing.com', 'duckduckgo.com', 'search.yahoo.com', 'chatgpt.com', 'perplexity.ai', 'copilot.microsoft.com', 'linkedin.com', 'facebook.com', 'instagram.com'];
const clean = value => typeof value === 'string' && value.length <= 100 && /^[\p{L}\p{N} ._-]*$/u.test(value) ? value.trim() : undefined;
export function safeReferrer(referrer, siteHosts = []) {
  try {
    const url = new URL(referrer);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return '';
    return REFERRERS.includes(url.hostname.replace(/^www\./, '')) || siteHosts.includes(url.hostname) ? url.origin : '';
  } catch { return ''; }
}
export function safePageUrl(href, choices, allowedPaths, allowedHashes = [], approvedUtmValues = {}) {
  const url = new URL(href);
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('Only credential-free public HTTPS page URLs may be measured');
  if (!allowedPaths.includes(url.pathname)) throw new Error('Page path has not been reviewed for attribution');
  const captured = captureAttribution(href, '', choices, allowedPaths);
  const query = new URLSearchParams();
  for (const key of UTM) if (captured[key] && approvedUtmValues[key]?.includes(captured[key])) query.set(key, captured[key]);
  for (const key of ['gclid', 'msclkid']) if (captured[key]) query.set(key, captured[key]);
  url.search = query.toString();
  if (!allowedHashes.includes(url.hash)) url.hash = '';
  return url.href;
}
export function captureAttribution(location, referrer, choices, allowedPaths = []) {
  const result = {};
  if (!choices?.analytics && !choices?.advertising) return result;
  let url; try { url = new URL(location); } catch { return result; }
  for (const key of UTM) { const value = clean(url.searchParams.get(key)); if (value) result[key] = value; }
  if (choices.advertising) for (const key of ['gclid', 'msclkid']) {
    const value = url.searchParams.get(key); if (value && /^[A-Za-z0-9_-]{1,256}$/.test(value)) result[key] = value;
  }
  if (allowedPaths.includes(url.pathname)) result.landingPath = url.pathname;
  let host = ''; try { host = new URL(referrer).hostname; } catch { /* Missing referrer remains direct/unknown. */ }
  if (host === url.hostname) host = '';
  const knownHost = host.replace(/^www\./, '');
  if (REFERRERS.includes(knownHost)) result.referrerHost = knownHost;
  result.sourceGroup = result.utm_medium === 'cpc' || result.gclid || result.msclkid ? 'paid'
    : ['chatgpt.com', 'www.perplexity.ai', 'perplexity.ai', 'copilot.microsoft.com'].includes(host) ? 'ai_referral'
      : /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(host) ? 'organic_search'
        : /(^|\.)(linkedin\.com|facebook\.com|instagram\.com)$/.test(host) ? 'social_referral' : host ? 'referral' : 'direct';
  return result; // Never return full URLs, referrer paths, contact query parameters or page titles.
}

export function createAttribution(config, windowObject, getChoices) {
  let memory = {};
  const clear = () => { memory = {}; try { windowObject.sessionStorage.removeItem(config.storageKey); } catch { /* Optional storage. */ } };
  return {
    refresh() {
      const choices = getChoices();
      if (!config.enabled || (!choices.analytics && !choices.advertising)) { if (config.enabled) clear(); return {}; }
      let previous;
      try { previous = JSON.parse(windowObject.sessionStorage.getItem(config.storageKey)); } catch { /* Unavailable/malformed storage fails to a fresh bounded capture. */ }
      const current = captureAttribution(windowObject.location.href, windowObject.document.referrer, choices, config.allowedLandingPaths || []);
      const valid = previous?.v === 1 && Number.isFinite(previous.at) && previous.at <= Date.now()
        && Date.now() - previous.at <= config.maxAgeDays * 86_400_000;
      // Revalidate stored data; never trust arbitrary persisted keys or old IDs after withdrawal.
      const stored = valid ? captureAttribution(new URL('/?' + new URLSearchParams(previous.data), windowObject.location.origin).href, '', choices, config.allowedLandingPaths || []) : {};
      if (valid) {
        if (['direct', 'organic_search', 'ai_referral', 'social_referral', 'referral', 'paid', 'unknown'].includes(previous.data?.sourceGroup)) stored.sourceGroup = previous.data.sourceGroup;
        if (REFERRERS.includes(previous.data?.referrerHost)) stored.referrerHost = previous.data.referrerHost;
        if (config.allowedLandingPaths?.includes(previous.data?.landingPath)) stored.landingPath = previous.data.landingPath;
      }
      const newTouch = Object.keys(current).some(key => key.startsWith('utm_') || ['gclid', 'msclkid'].includes(key)) || current.sourceGroup !== 'direct';
      memory = valid && !newTouch ? stored : current;
      try { windowObject.sessionStorage.setItem(config.storageKey, JSON.stringify({ v: 1, at: valid && !newTouch ? previous.at : Date.now(), data: memory })); } catch { /* In-memory capture only; no network fallback. */ }
      return { ...memory };
    },
    get() { return { ...memory }; }, clear,
  };
}
