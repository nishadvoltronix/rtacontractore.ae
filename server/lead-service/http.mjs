import { LeadError, hmac } from './validation.mjs';

// Importable handler only: this module never starts a service or binds a port.
export function createLeadHandler(service, config, { key, now = Date.now, resolveClientAddress = request => request.socket?.remoteAddress || 'unknown' } = {}) {
  const rates = new Map();
  const reply = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(body));
  };
  return async (request, response) => {
    try {
      if (!service.availability.ready) throw new LeadError('unavailable', 503);
      if (request.method !== 'POST' || !['/api/leads', '/api/leads/challenge', '/api/leads/status'].includes(request.url)) throw new LeadError('not_found', 404);
      if (!config.origins.includes(request.headers.origin) || request.headers['sec-fetch-site'] === 'cross-site') throw new LeadError('origin_rejected', 403);
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) throw new LeadError('json_required', 415);
      const stamp = now();
      for (const [identity, rate] of rates) if (rate.until <= stamp) rates.delete(identity);
      const identity = hmac(key, 'rate', String(resolveClientAddress(request)));
      if (!rates.has(identity) && rates.size >= 10_000) throw new LeadError('rate_limited', 429);
      const rate = rates.get(identity) || { count: 0, until: stamp + config.rateLimit.windowMs };
      if (++rate.count > config.rateLimit.requests) throw new LeadError('rate_limited', 429); rates.set(identity, rate);
      const declared = request.headers['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > config.maxBodyBytes)) throw new LeadError('body_too_large', 413);
      let bytes = 0; const chunks = [];
      for await (const chunk of request) { bytes += chunk.length; if (bytes > config.maxBodyBytes) throw new LeadError('body_too_large', 413); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LeadError('invalid_json'); }
      if (request.url !== '/api/leads' && (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) throw new LeadError('invalid_fields');
      if (request.url === '/api/leads/challenge') return reply(response, 200, service.challenge());
      const receipt = request.url === '/api/leads/status' ? await service.status(request.headers['idempotency-key']) : await service.intake(body, request.headers['idempotency-key']);
      reply(response, receipt.accepted ? 200 : 202, receipt);
    } catch (error) {
      // Never serialize upstream exceptions, submitted fields, URLs or tokens.
      reply(response, error instanceof LeadError ? error.status : 503, { accepted: false, error: error instanceof LeadError ? error.code : 'unavailable' });
    }
  };
}
