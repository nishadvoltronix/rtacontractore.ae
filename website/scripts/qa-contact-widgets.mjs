import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalContext, localArtifacts, localQAOrigin, mariesWidgetScriptURL } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = localQAOrigin(process.env.QA_BASE_URL || 'http://127.0.0.1:4173');
const output = await localArtifacts(root, process.env.QA_ARTIFACTS_DIR, 'artifacts/contact-widget-regressions');
const executablePath = process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const blockedRequests = [];
const errors = [];
const results = [];
const viewports = [1440, 390, 320];
const height = 900;
const startedAt = new Date().toISOString();

// A deterministic provider boundary: it renders a dialog, but never contacts the
// provider, requests microphone access, creates an iframe or starts a session.
const widgetMock = `(() => {
  const widget = document.createElement('div');
  widget.id = 'talk2maries-widget';
  const shadow = widget.attachShadow({ mode: 'open' });
  shadow.innerHTML = \`<style>
    :host { position:fixed; right:20px; bottom:96px; width:58px; height:58px; z-index:2147483000; }
    [hidden] { display:none !important; }
    .launcher-button { width:58px; height:58px; border-radius:50%; }
    .panel { position:fixed; right:20px; bottom:96px; box-sizing:border-box; width:min(380px,calc(100vw - 40px)); height:260px; padding:20px; background:white; border:1px solid #aaa; }
  </style><div class="launcher"><button class="launcher-button" type="button" aria-label="Talk to Maries: AI voice assistant">Maries</button></div>
  <section class="panel" role="dialog" aria-label="Maries assistant test panel" hidden><p>Assistant ready</p><button type="button" data-mock-close>Close assistant</button></section>\`;
  const panel = shadow.querySelector('.panel');
  const launcher = shadow.querySelector('.launcher');
  const api = {
    open() { panel.hidden = false; launcher.hidden = true; },
    close() { panel.hidden = true; launcher.hidden = false; },
    getState() { return { open: !panel.hidden, state: 'Ready', duration: 0, destroyed: false }; },
    destroy() { widget.remove(); }
  };
  shadow.querySelector('.launcher-button').addEventListener('click', () => api.open());
  shadow.querySelector('[data-mock-close]').addEventListener('click', () => api.close());
  window.Talk2MariesWidget = api;
  document.body.append(widget);
})();`;

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function scenario(browser, width, options, run) {
  const context = await createLocalContext(browser, base, { viewport: { width, height }, reducedMotion: 'reduce' }, blockedRequests);
  const page = await context.newPage();
  const provider = gate();
  let requests = 0;
  let injected = false;
  page.on('pageerror', error => errors.push({ width, message: error.message }));
  await page.route(url => url.href === base.href, async route => {
    const response = await route.fetch({ maxRedirects: 0, timeout: 15_000 });
    try {
      if (response.status() !== 200) throw new Error(`Local homepage returned ${response.status()}`);
      const original = await response.text();
      // Cloudflare email protection adds a script before the intended script in
      // this template in production. The loader must still pick the provider.
      const html = original.replace(/(<template\b[^>]*\bid="ai-assistant-embed"[^>]*>)/, '$1<script>/* Harmless CDN-injected script. */</script>');
      injected = html !== original;
      await route.fulfill({ response, body: html });
    } finally { await response.dispose(); }
  });
  await page.route(url => url.href === mariesWidgetScriptURL, async route => {
    requests += 1;
    const attempt = requests;
    await provider.promise;
    if (options.failFirst && attempt === 1) await route.abort('failed');
    else await route.fulfill({ status: 200, contentType: 'application/javascript', body: widgetMock });
  });
  if (!options.delayed) provider.release();
  try {
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    expect(injected, 'the local response simulates the CDN script insertion').toBe(true);
    await expect.poll(() => requests, { message: 'the real widget is selected even after a CDN script is inserted' }).toBe(1);
    await run({ page, context, release: provider.release, requests: () => requests });
  } finally {
    provider.release();
    await context.close();
  }
}

async function remainsOnPage(page, context) {
  expect(page.url(), 'assistant interactions keep the current page').toBe(base.href);
  expect(context.pages(), 'assistant interactions never open another tab').toHaveLength(1);
}

async function initialButton(page, width) {
  const button = page.locator('.assistant-contact');
  await expect(button).toBeVisible();
  expect(await button.evaluate(element => element.tagName)).toBe('BUTTON');
  await expect(button).toHaveAttribute('type', 'button');
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  expect(await button.getAttribute('href')).toBeNull();
  const bounds = await button.boundingBox();
  expect(Math.abs(width - bounds.x - bounds.width - 20), 'assistant stays 20px from the right').toBeLessThanOrEqual(1);
  expect(Math.abs(height - bounds.y - bounds.height - 96), 'assistant stays 96px above the bottom').toBeLessThanOrEqual(1);
}

async function fitsViewport(locator, width) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
}

async function check(name, run) {
  try {
    await run();
    results.push({ status: 'pass', name });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ status: 'fail', name, details: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const width of viewports) {
    await check(`${width}px: immediate button, delayed popup, CDN insertion and placement`, () => scenario(browser, width, { delayed: true }, async ({ page, context, release }) => {
      await initialButton(page, width);
      const loading = page.locator('#assistant-loading-panel');
      await expect(loading).toBeHidden();
      await page.locator('.assistant-contact').click();
      await expect(loading).toBeVisible();
      await expect(loading.locator('[data-assistant-status]')).not.toBeEmpty();
      await fitsViewport(loading, width);
      await remainsOnPage(page, context);
      release();
      const panel = page.locator('#talk2maries-widget .panel');
      await expect(panel).toBeVisible();
      await expect(loading).toBeHidden();
      await fitsViewport(panel, width);
      await panel.locator('[data-mock-close]').click();
      await expect(panel).toBeHidden();
      await expect(page.locator('#talk2maries-widget .launcher-button')).toBeVisible();
      await remainsOnPage(page, context);
      const whatsapp = page.locator('.floating-contact');
      await expect(whatsapp).toBeVisible({ timeout: 6000 });
      const bounds = await whatsapp.boundingBox();
      const offset = width <= 768 ? 16 : 20;
      expect(Math.abs(bounds.x - offset), 'WhatsApp left spacing').toBeLessThanOrEqual(1);
      expect(Math.abs(height - bounds.y - bounds.height - offset), 'WhatsApp bottom spacing').toBeLessThanOrEqual(1);
      expect(bounds.width).toBe(60);
      expect(bounds.height).toBe(60);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'no horizontal page overflow').toBe(false);
    }));

    await check(`${width}px: closing during loading cancels the queued popup`, () => scenario(browser, width, { delayed: true }, async ({ page, context, release }) => {
      await page.locator('.assistant-contact').click();
      const loading = page.locator('#assistant-loading-panel');
      await expect(loading).toBeVisible();
      await loading.locator('[data-assistant-close]').click();
      await expect(loading).toBeHidden();
      release();
      await expect(page.locator('#talk2maries-widget .launcher-button')).toBeVisible();
      await expect(page.locator('#talk2maries-widget .panel')).toBeHidden();
      await remainsOnPage(page, context);
    }));

    await check(`${width}px: ready assistant opens only when clicked`, () => scenario(browser, width, {}, async ({ page, context }) => {
      const button = page.locator('#talk2maries-widget .launcher-button');
      const panel = page.locator('#talk2maries-widget .panel');
      await expect(button).toBeVisible();
      await expect(panel).toBeHidden();
      await expect(page.locator('#assistant-loading-panel')).toBeHidden();
      await button.click();
      await expect(panel).toBeVisible();
      await fitsViewport(panel, width);
      await remainsOnPage(page, context);
    }));

    await check(`${width}px: failed provider offers an in-page retry`, () => scenario(browser, width, { delayed: true, failFirst: true }, async ({ page, context, release, requests }) => {
      await page.locator('.assistant-contact').click();
      const loading = page.locator('#assistant-loading-panel');
      await expect(loading).toBeVisible();
      release();
      const retry = loading.locator('[data-assistant-retry]');
      await expect(retry).toBeVisible();
      await remainsOnPage(page, context);
      await retry.click();
      await expect(page.locator('#talk2maries-widget .panel')).toBeVisible();
      expect(requests(), 'retry loads the provider again').toBe(2);
      await expect(loading).toBeHidden();
      await remainsOnPage(page, context);
    }));
  }
} catch (error) {
  results.push({ status: 'fail', name: 'Runner completes', details: error.stack });
} finally { await browser?.close(); }

await check('No uncaught browser errors', async () => expect(errors).toEqual([]));
await check('No external requests, redirects or WebSockets', async () => expect(blockedRequests).toEqual([]));
const counts = { pass: results.filter(result => result.status === 'pass').length, fail: results.filter(result => result.status === 'fail').length };
await writeFile(path.join(output, 'results.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), base: base.href, viewports, height, counts, results, errors, blockedRequests, limits: ['Provider rendering is mocked; this suite checks site loading, popup and retry behavior without contacting the assistant, CRM or WhatsApp.'] }, null, 2) + '\n');
console.log(JSON.stringify({ counts, output }, null, 2));
process.exitCode = counts.fail ? 1 : 0;
