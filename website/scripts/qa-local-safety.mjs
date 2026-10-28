import { lstat } from 'node:fs/promises';
import path from 'node:path';

export const zohoFormScriptURL = 'https://crm.zoho.com/crm/WebFormServeServlet?rid=4a995d1dee720c5b6831db70b39b0a532c0dfc50bc1af0df096e4a0bb393b1700dc07123d2c4b2bbd7afcb451e94fffagid8975efd73106954c9ab7e9dd572d0dd16b145d6266d7b3f5fc81726240eb8ef4&script=$sYG';
export const mariesWidgetScriptURL = 'https://talk2maries.com/widget/v1/voice-widget.js?v=1.0.1';

// Literal loopback addresses avoid DNS resolution or a production URL supplied
// accidentally through a shell's saved QA_BASE_URL.
export function localQAOrigin(value = 'http://127.0.0.1:4173') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('QA_BASE_URL must be an HTTP(S) origin using literal 127.0.0.1 or [::1], without credentials, path, query or fragment.');
  }
  return url;
}

export async function localArtifacts(root, value, fallback = 'artifacts') {
  const artifactRoot = path.resolve(root, 'artifacts');
  const output = path.resolve(root, value || fallback);
  const relative = path.relative(artifactRoot, output);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('QA_ARTIFACTS_DIR must stay inside the project ignored artifacts/ directory.');
  }
  // Reject existing symlink/junction components before creating any output.
  let current = artifactRoot;
  for (const component of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (component) current = path.join(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('QA artifact path must contain only real directories, not links or files.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return output;
}

export function localRequestURL(value, baseURL) {
  const base = localQAOrigin(baseURL);
  const url = new URL(value, base);
  if (url.origin !== base.origin || url.username || url.password) {
    throw new Error('Local QA blocked a request outside its exact loopback origin.');
  }
  return url;
}

function safeRequestLabel(value) {
  try {
    const url = new URL(value);
    // Prepared enquiries can contain personal data in queries; never record it.
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return '(unparseable request URL)'; }
}

export async function createLocalContext(browser, baseURL, options, blockedRequests) {
  const origin = localQAOrigin(baseURL);
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const record = reason => blockedRequests.push({ url: safeRequestLabel(request.url()), reason });
    // Stub this exact embed locally without connecting to Zoho. These suites
    // verify placement and fallback links, not live CRM rendering or delivery.
    if (request.url() === zohoFormScriptURL && request.method() === 'GET' && request.resourceType() === 'script') {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* Zoho embed intentionally stubbed for local QA. */' });
      return;
    }
    // General layout suites use the local fallback, without loading the live
    // assistant or initiating its bootstrap request or a voice conversation.
    if (request.url() === mariesWidgetScriptURL && request.method() === 'GET' && request.resourceType() === 'script') {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* Maries widget intentionally stubbed for local QA. */' });
      return;
    }
    try {
      localRequestURL(request.url(), origin);
    } catch {
      record('External request blocked before connection');
      await route.abort('blockedbyclient');
      return;
    }
    // Playwright routing alone does not guarantee re-interception of each
    // redirect. Canonical-page browser QA therefore refuses all redirects.
    // Actual redirect assertions run in the separate Node/Nginx HTTP suites.
    let response;
    try {
      response = await route.fetch({ maxRedirects: 0, timeout: 15_000 });
      if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
        record('Redirect blocked during canonical-page browser QA');
        await route.abort('blockedbyclient');
      } else {
        await route.fulfill({ response });
      }
    } catch {
      record('Local resource request failed or its page closed');
      await route.abort('failed').catch(() => {});
    } finally { await response?.dispose().catch(() => {}); }
  });
  await context.routeWebSocket('**/*', socket => {
    blockedRequests.push({ url: safeRequestLabel(socket.url()), reason: 'WebSockets are not required by static-site QA and were blocked before connection' });
    socket.close({ code: 1008, reason: 'Local static-site QA only' });
  });
  return context;
}

export async function localLinkResponse(context, value, baseURL) {
  const url = localRequestURL(value, baseURL);
  return context.request.get(url.href, { maxRedirects: 0, timeout: 15_000 });
}
