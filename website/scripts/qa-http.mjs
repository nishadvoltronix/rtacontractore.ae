import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';

// An ephemeral port keeps this suite independent of the user's existing preview.
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT:'0' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };
let stderr = '';
server.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
let origin;
const call = (pathname, method = 'GET') => new Promise((resolve, reject) => {
  const target = new URL(origin);
  // node:http preserves malformed and encoded paths for server-side validation.
  const req = request({ hostname:target.hostname, port:target.port, method, path:pathname }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks) }));
    response.on('error', reject);
  });
  req.setTimeout(10000, () => req.destroy(new Error(`Timed out: ${method} ${pathname}`)));
  req.on('error', reject);
  req.end();
});

try {
  origin = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Preview did not start. ${stderr}`)), 15000);
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}. ${stderr}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  check(new URL(origin).port !== '4173', 'Suite uses a separate port from the working preview');
  const home = await call('/');
  check(home.status === 200, 'Home returns 200');
  check(home.headers['content-type']?.startsWith('text/html'), 'Home has HTML MIME type');
  check(Number(home.headers['content-length']) === home.body.length, 'Home Content-Length matches its UTF-8 bytes');
  check(/<h1\b/i.test(home.body.toString()), 'Home content is returned in static HTML');
  const sitemap = await call('/sitemap.xml');
  check(sitemap.status === 200 && sitemap.headers['content-type'] === 'application/xml', 'Sitemap returns 200 and XML MIME type');
  const routes = [...sitemap.body.toString().matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  check(routes.length > 1 && new Set(routes).size === routes.length, 'Sitemap includes unique public routes');
  for (const route of routes) {
    const result = await call(route);
    check(result.status === 200, `Canonical route returns 200: ${route}`);
    check(!result.headers.location, `Canonical route does not redirect: ${route}`);
  }
  const redirects = [
    ['/index.html', '/'],
    ['/index.html?service=street-lighting', '/?service=street-lighting'],
    ['/services/street-lighting', '/services/street-lighting/'],
    ['/services/street-lighting?service=underground-cabling&lang=en', '/services/street-lighting/?service=underground-cabling&lang=en'],
    ['/services/street-lighting/index.html?service=street-lighting', '/services/street-lighting/?service=street-lighting'],
    ['/%69ndex.html', '/'],
    ['/%73ervices/street-lighting', '/services/street-lighting/'],
  ];
  for (const [from, to] of redirects) {
    const result = await call(from);
    check(result.status === 308, `Alias uses permanent 308: ${from}`);
    check(result.headers.location === to, `Alias preserves the intended local path and query: ${from}`);
    const destination = await call(to);
    check(destination.status === 200 && !destination.headers.location, `Alias resolves in one hop: ${from}`);
  }
  const query = await call('/?service=street-lighting');
  check(query.status === 200 && !query.headers.location, 'Valid enquiry selection query is preserved without redirect');
  check(query.body.equals(home.body), 'Query route retains the canonical home content');
  const robots = await call('/robots.txt');
  check(robots.status === 200 && robots.headers['content-type']?.startsWith('text/plain'), 'Robots returns plain text with status 200');
  const css = await call('/assets/style.css');
  check(css.status === 200 && css.headers['content-type']?.startsWith('text/css'), 'CSS asset returns its correct MIME type');
  check(!css.headers.location && css.body.length > 0, 'Assets are not redirected');
  const encodedCss = await call('/%61ssets/style.css');
  check(encodedCss.status === 200 && encodedCss.body.equals(css.body), 'Valid percent-encoded asset paths are served');
  const pdf = await call('/assets/documents/rta-approval-pq.pdf');
  check(pdf.status === 200 && pdf.headers['content-type'] === 'application/pdf', 'Certificate retains PDF MIME type');
  check(pdf.headers['content-disposition'] === 'inline' && pdf.body.subarray(0, 5).toString() === '%PDF-', 'Certificate opens inline and contains PDF bytes');
  for (const [pathname, get] of [['/', home], ['/assets/style.css', css], ['/assets/documents/rta-approval-pq.pdf', pdf]]) {
    const result = await call(pathname, 'HEAD');
    check(result.status === get.status && result.body.length === 0, `HEAD returns matching status without a body: ${pathname}`);
    check(result.headers['content-type'] === get.headers['content-type'] && result.headers['content-length'] === get.headers['content-length'], `HEAD preserves GET representation headers: ${pathname}`);
  }
  const largePdfHead = await call('/assets/documents/voltronix-prequalification.pdf', 'HEAD');
  check(largePdfHead.status === 200 && largePdfHead.body.length === 0 && largePdfHead.headers['content-disposition'] === 'inline', 'Large profile PDF supports inline HEAD without downloading its body');
  const aliasHead = await call('/index.html?service=street-lighting', 'HEAD');
  check(aliasHead.status === 308 && aliasHead.body.length === 0 && aliasHead.headers.location === '/?service=street-lighting', 'HEAD uses the same query-preserving canonical redirect');
  for (const pathname of ['/this-page-does-not-exist/', '/this-page-does-not-exist/index.html', '/services/not-a-service', '/assets/not-a-file.webp']) {
    const result = await call(pathname);
    check(result.status === 404 && !result.headers.location, `Unknown path returns a real 404 without redirect: ${pathname}`);
    check(/name="robots"\s+content="noindex,follow"/i.test(result.body.toString()), `Unknown path retains noindex custom 404 HTML: ${pathname}`);
  }
  const missingHead = await call('/this-page-does-not-exist/', 'HEAD');
  check(missingHead.status === 404 && missingHead.body.length === 0, 'HEAD missing route returns 404 without a body');
  for (const pathname of ['/%', '/%E0%A4%A', '/%00']) {
    const result = await call(pathname);
    check(result.status === 400 && !result.headers.location, `Malformed or invalid encoded pathname returns 400: ${pathname}`);
  }
  for (const pathname of ['/%2e%2e%2fpackage.json', '/..%5cpackage.json']) {
    const result = await call(pathname);
    check(result.status === 403 && !result.headers.location, `Traversal cannot leave the static root: ${pathname}`);
  }
  const unsupportedMethod = await call('/', 'POST');
  check(unsupportedMethod.status === 405 && unsupportedMethod.headers.allow === 'GET, HEAD', 'Read-only preview rejects unsupported methods');
  console.log(`HTTP checks: ${assertions}/${assertions} passed against isolated preview ${origin}.`);
} catch (error) {
  console.error(`HTTP check failed after ${assertions} assertions: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
}
