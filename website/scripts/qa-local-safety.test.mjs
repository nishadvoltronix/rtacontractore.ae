import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { localQAOrigin, localArtifacts, localRequestURL, createLocalContext, localLinkResponse } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('browser targets are literal loopback origins, with no paths or credentials', () => {
  assert.equal(localQAOrigin('http://127.0.0.1:4173').origin, 'http://127.0.0.1:4173');
  assert.equal(localQAOrigin('https://[::1]:8443/').origin, 'https://[::1]:8443');
  for (const value of ['https://rtacontractor.ae', 'http://localhost:4173', 'http://127.0.0.1.example.com', 'http://192.0.2.10', 'file:///tmp/site', 'http://user:password@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1/?query=1', 'http://127.0.0.1/#part']) {
    assert.throws(() => localQAOrigin(value), /QA_BASE_URL/);
  }
});

test('request policy requires the exact allowed origin and preserves local queries', () => {
  const base = 'http://127.0.0.1:4173';
  assert.equal(localRequestURL('/?service=street-lighting#contact', base).href, `${base}/?service=street-lighting#contact`);
  for (const value of ['http://127.0.0.1:4174/', 'https://127.0.0.1:4173/', '//rtacontractor.ae/', 'https://example.com/', 'data:text/plain,test', 'http://user:password@127.0.0.1:4173/']) {
    assert.throws(() => localRequestURL(value, base), /blocked a request/);
  }
});

test('artifact validation prevents output escape, files and junctions without creating output', async () => {
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  const scratch = await mkdtemp(path.join(root, 'artifacts', 'qa-safety-unit-'));
  try {
    const output = path.join(scratch, 'new', 'report');
    assert.equal(await localArtifacts(root, output), output);
    for (const value of ['../outside', 'website/dist', 'artifacts/../../outside', 'artifacts-other']) {
      await assert.rejects(localArtifacts(root, value), /must stay inside/);
    }
    const existingFile = path.join(scratch, 'file');
    await writeFile(existingFile, 'test');
    await assert.rejects(localArtifacts(root, existingFile), /real directories/);
    const target = path.join(scratch, 'target');
    await mkdir(target);
    const linked = path.join(scratch, 'linked');
    await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(localArtifacts(root, path.join(linked, 'report')), /real directories/);
  } finally {
    assert.ok(scratch.startsWith(path.join(root, 'artifacts') + path.sep));
    await rm(scratch, { recursive: true, force: true });
  }
});

test('API link checks never follow redirects even to another loopback origin', async () => {
  let otherHits = 0;
  const other = createServer((_req, res) => { otherHits++; res.end('must not be reached'); });
  const local = createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: `http://127.0.0.1:${other.address().port}/` }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('local'); }
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await listen(other); await listen(local);
  const context = { request: await playwrightRequest.newContext() };
  try {
    const base = `http://127.0.0.1:${local.address().port}`;
    const normal = await localLinkResponse(context, '/', base);
    assert.equal(normal.status(), 200); await normal.dispose();
    const redirect = await localLinkResponse(context, '/redirect', base);
    assert.equal(redirect.status(), 302); await redirect.dispose();
    assert.equal(otherHits, 0);
    await assert.rejects(localLinkResponse(context, `http://127.0.0.1:${other.address().port}/`, base), /blocked a request/);
    assert.equal(otherHits, 0);
  } finally { await context.request.dispose(); await close(local); await close(other); }
});

test('browser guard blocks external fetches, redirect chains and WebSockets before connection', async () => {
  let handler, websocketHandler, contextOptions;
  const blocked = [];
  const browser = { newContext: async options => {
    contextOptions = options;
    return { route: async (_pattern, callback) => { handler = callback; }, routeWebSocket: async (_pattern, callback) => { websocketHandler = callback; } };
  } };
  await createLocalContext(browser, 'http://127.0.0.1:4173', { serviceWorkers: 'allow' }, blocked);
  assert.equal(contextOptions.serviceWorkers, 'block');
  const calls = [];
  const route = (url, status = 200, location) => ({
    request: () => ({ url: () => url }),
    fetch: async options => {
      calls.push(['fetch', options]);
      return { status: () => status, headers: () => location ? { location } : {}, dispose: async () => calls.push(['dispose']) };
    },
    abort: async () => calls.push(['abort']),
    fulfill: async () => calls.push(['fulfill']),
  });
  await handler(route('https://example.com/?private=never-record'));
  assert.deepEqual(calls.splice(0), [['abort']]);
  assert.equal(blocked[0].url, 'https://example.com/');
  await handler(route('http://127.0.0.1:4173/redirect', 302, 'https://example.com/'));
  assert.deepEqual(calls.map(call => call[0]), ['fetch', 'abort', 'dispose']);
  assert.equal(calls[0][1].maxRedirects, 0); calls.length = 0;
  await handler(route('http://127.0.0.1:4173/asset'));
  assert.deepEqual(calls.map(call => call[0]), ['fetch', 'fulfill', 'dispose']);
  let websocketClosed = false;
  websocketHandler({ url: () => 'wss://example.com/?private=not-recorded', close: () => { websocketClosed = true; } });
  assert.equal(websocketClosed, true);
  assert.equal(blocked.length, 3);
  assert.equal(blocked.some(item => item.url.includes('private')), false);
});

test('actual browser interception prevents direct and redirected connections to another loopback origin', async () => {
  let otherHits = 0;
  const other = createServer((_req, res) => { otherHits++; res.end('must not be reached'); });
  const local = createServer((req, res) => {
    const otherOrigin = `http://127.0.0.1:${other.address().port}`;
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: `${otherOrigin}/redirect-target` }); res.end();
    } else if (req.url === '/okay.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><title>Local safety fixtures</title><img id="other" src="${otherOrigin}/direct?private=omit"><img id="redirect" src="/redirect"><img id="local" src="/okay.svg">`);
    }
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  let browser;
  await listen(other); await listen(local);
  try {
    browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const base = `http://127.0.0.1:${local.address().port}`;
    const blocked = [];
    const context = await createLocalContext(browser, base, {}, blocked);
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#local').evaluate(image => image.complete && image.naturalWidth > 0), true);
    assert.equal(otherHits, 0, 'Neither direct external-origin nor redirected request reaches the other server');
    assert.equal(blocked.length, 2);
    assert.ok(blocked.some(item => item.reason === 'External request blocked before connection'));
    assert.ok(blocked.some(item => item.reason === 'Redirect blocked during canonical-page browser QA'));
    assert.equal(blocked.some(item => item.url.includes('private')), false);
    await context.close();
  } finally { await browser?.close(); await close(local); await close(other); }
});
