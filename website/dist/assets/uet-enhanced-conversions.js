// Optional Microsoft PID adapter. No SDK loading, storage, dataLayer contact
// values or conversion events: the reviewed GTM tag remains the event owner.
const RTA_FORM = 'webform5653678000076526082';
const SAMPLE_DOMAINS = new Set(['example.com', 'example.net', 'example.org', 'contoso.com']);
const SAMPLE_PHONES = new Set(['+14250000000', '+142555512345']);

export function normalizeMicrosoftEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const clean = value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s/gu, '').toLowerCase();
  const parts = clean.split('@');
  if (parts.length !== 2) return null;
  const [sourceLocal, domain] = parts;
  if (!sourceLocal || sourceLocal.startsWith('.') || sourceLocal.endsWith('.') || sourceLocal.includes('..')
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(sourceLocal)
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)
    || SAMPLE_DOMAINS.has(domain) || domain.endsWith('.example')) return null;
  const local = sourceLocal.split('+')[0].replaceAll('.', '');
  return local ? `${local}@${domain}` : null;
}

export function normalizeMicrosoftPhone(value) {
  if (typeof value !== 'string' || value.length > 40 || /[^+0-9\s().-]/u.test(value)) return null;
  const clean = value.replace(/[\s().-]/gu, '').replace(/^00/, '+');
  // Require an explicit international prefix. Never guess a visitor's country.
  return /^\+[1-9]\d{6,14}$/.test(clean) && !SAMPLE_PHONES.has(clean) ? clean : null;
}

export function createMicrosoftEnhancedConversions(destination, win = globalThis.window) {
  const cfg = Object.freeze({ ...destination?.enhancedConversions });
  const enabled = destination?.enabled === true && /^[1-9]\d+$/.test(destination?.tagId || '')
    && cfg.enabled === true && cfg.baseTagVerified === true && cfg.goalVerified === true;
  const pending = new Map();
  let subscribed;
  let published = false;
  function baseReady() {
    try { return typeof win?.UET === 'function' && win.uetq instanceof win.UET && typeof win.uetq.push === 'function'; }
    catch { return false; }
  }
  function consent() {
    try {
      const api = win?.RTAMarketing?.consent;
      const state = api?.getState?.();
      return state?.managed === true && state.known === true && state.advertising === true
        && state.microsoftEnhancedConversions === true && state.reloadRequired !== true ? state : null;
    } catch { return null; }
  }
  function forget(id) {
    const record = pending.get(id);
    if (record) {
      record.cancelled = true; record.cancel?.(null);
      win.clearTimeout(record.timer); win.clearTimeout(record.confirmTimer); pending.delete(id);
    }
  }
  function clearAssigned() {
    if (published && baseReady()) {
      try { win.uetq.push('set', { pid: { em: '', ph: '' } }); } catch { /* Never interrupt privacy changes. */ }
    }
    published = false;
  }
  function clear() {
    for (const id of pending.keys()) forget(id);
    clearAssigned();
  }
  async function digest(value) {
    if (!value) return '';
    const bytes = new TextEncoder().encode(value);
    try {
      const hashed = await win.crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hashed)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } finally { bytes.fill(0); }
  }
  function capture(id, form, ttlMs) {
    if (!enabled) return false;
    clear(); // A superseding enquiry cannot inherit an earlier visitor's PID.
    try {
      const state = consent();
      if (!state || !baseReady() || form?.id !== RTA_FORM || form.tagName !== 'FORM'
        || typeof id !== 'string' || !id || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 30000
        || typeof win.setTimeout !== 'function' || typeof win.clearTimeout !== 'function'
        || typeof win.crypto?.subtle?.digest !== 'function') return false;
      const api = win.RTAMarketing.consent;
      if (subscribed !== api) {
        if (typeof api.onChange !== 'function') return false;
        api.onChange(() => clear());
        subscribed = api;
      }
      // Only these two approved fields are read, only after the purpose gate.
      const email = normalizeMicrosoftEmail(form.elements?.namedItem?.('Email')?.value);
      const phone = normalizeMicrosoftPhone(form.elements?.namedItem?.('Mobile')?.value);
      if (!email && !phone) return false;
      const record = { cancelled: false, claimed: false, policyVersion: state.policyVersion, recordedAt: state.recordedAt };
      record.cancellation = new Promise(resolve => { record.cancel = resolve; });
      record.hashes = Promise.all([digest(email), digest(phone)]).catch(() => null);
      record.timer = win.setTimeout(() => forget(id), ttlMs);
      pending.set(id, record);
      return true;
    } catch { forget(id); return false; }
  }
  async function confirm(id, emitConversion) {
    const record = pending.get(id);
    const complete = ready => {
      if (typeof emitConversion === 'function') {
        if (!ready) clearAssigned();
        emitConversion();
      }
    };
    if (!record || record.claimed) { complete(false); return false; }
    record.claimed = true;
    let assigned = false;
    try {
      // A slow/unavailable crypto implementation cannot hold the regular lead
      // event indefinitely. Revocation, expiry and supersession also unblock it.
      record.confirmTimer = win.setTimeout(() => forget(id), 250);
      const hashes = await Promise.race([record.hashes, record.cancellation]);
      const state = consent();
      if (record.cancelled || pending.get(id) !== record || !hashes || !state || !baseReady()
        || state.policyVersion !== record.policyVersion || state.recordedAt !== record.recordedAt
        || hashes.some(value => value !== '' && !/^[a-f0-9]{64}$/.test(value))) return false;
      published = true;
      win.uetq.push('set', { pid: { em: hashes[0], ph: hashes[1] } });
      assigned = true;
      return true;
    } catch { return false; }
    finally {
      forget(id);
      // PID assignment/clearing and the existing conversion callback are one
      // synchronous operation, so concurrent receipts cannot exchange identity.
      complete(assigned);
    }
  }
  return Object.freeze({ capture, confirm, forget, clear, clearAssigned });
}
