import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalContext, localArtifacts, localQAOrigin, mariesWidgetScriptURL, salesIQScriptURL } from './qa-local-safety.mjs';

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

// Only the documented launcher and popup geometry is simulated. No SalesIQ
// connection, visitor session, real iframe or chat message is created.
function salesIQMock(modern = false) { return `(() => {
  const modern = ${modern};
  const style = document.createElement('style');
  style.textContent = '.zsiq_fixedlayout { position:fixed; top:calc(-1 * var(--salesiq-test-scroll, 0px)); width:100%; }';
  document.head.append(style);
  const container = document.createElement('div');
  if (modern) {
    container.dataset.id = 'zsalesiq';
    container.className = 'zsiq_theme1';
  }
  const launcher = document.createElement(modern ? 'div' : 'button');
  launcher.className = modern ? 'zsiq-float' : 'zsiq_floatmain';
  if (modern) launcher.id = 'zsiq_float';
  if (!modern) launcher.type = 'button';
  function restoreLauncher() {
    if (modern && !launcher.querySelector('[data-salesiq-test-keyboard]')) {
      launcher.innerHTML = '<span data-salesiq-test-keyboard role="button" tabindex="0" style="display:grid;place-items:center;width:100%;height:100%">Zoho chat</span>';
    } else if (!modern) launcher.textContent = 'Zoho chat';
  }
  restoreLauncher();
  launcher.style.cssText = 'position:fixed;right:10px;bottom:10px;width:' + (modern ? 55 : 60) + 'px;height:' + (modern ? 55 : 60) + 'px;z-index:2147482000';
  const panel = document.createElement('section');
  if (modern) panel.id = 'zsiq_chat_wrap';
  else panel.className = 'zls-sptwndw';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Zoho local test chat');
  const panelGeometry = 'position:fixed;right:5px;bottom:' + (modern ? 75 : 15) + 'px;width:' + (modern ? 361 : 391) + 'px;height:' + (modern ? 640 : 663) + 'px;';
  panel.style.cssText = panelGeometry + 'background:white;z-index:2147482000;display:none';
  panel.innerHTML = '<p>Local chat preview</p><button type="button" data-zoho-close>Close Zoho chat</button>';
  const framePlaceholder = document.createElement('div');
  framePlaceholder.id = modern ? 'siq_chatwindow' : 'siqiframe';
  framePlaceholder.style.cssText = panelGeometry + 'pointer-events:none;display:none';
  const timing = window.__salesIQTimingForTest = { animations: 0, invitation: 0, click: 0 };
  let onOpen;
  function open() {
    if (!modern) launcher.style.display = 'none';
    panel.style.display = 'block';
    framePlaceholder.style.display = 'block';
    if (modern) window.setTimeout(() => {
      launcher.querySelector('[data-salesiq-test-keyboard]')?.remove();
      timing.animations += 1;
    }, 100);
    onOpen?.();
  }
  function close() { launcher.style.display = 'block'; panel.style.display = 'none'; framePlaceholder.style.display = 'none'; restoreLauncher(); }
  launcher.addEventListener('click', () => { timing.click = performance.now(); open(); });
  if (modern) launcher.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
  panel.querySelector('[data-zoho-close]').addEventListener('click', close);
  container.append(launcher, panel, framePlaceholder);
  document.body.append(container);
  window.$zoho.salesiq.floatwindow = {
    open(callback) { onOpen = callback; },
    visible(value) { if (value === 'hide') close(); else if (value === 'show') open(); }
  };
  window.__openSalesIQInvitationForTest = () => { timing.invitation = performance.now(); open(); };
  // The ready handler must also close an account-level invitation already open.
  open();
  window.$zoho.salesiq.ready();
})();`; }

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
  if (options.salesIQ) {
    await page.route(url => url.href === salesIQScriptURL, route => route.fulfill({
      status: 200, contentType: 'application/javascript', body: salesIQMock(options.salesIQ === 'modern'),
    }));
  }
  if (!options.delayed) provider.release();
  try {
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    expect(injected, 'the local response simulates the CDN script insertion').toBe(true);
    await expect.poll(() => requests, { message: 'the real widget is selected even after a CDN script is inserted' }).toBe(1);
    await run({ page, context, release: provider.release, requests: () => requests });
  } finally {
    provider.release();
    // Finish local favicon and released mock-script requests before teardown so
    // cancellation cannot be mistaken for a blocked external request.
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); }
    finally { await context.close(); }
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

async function assistantPosition(page, width, { right = 20, bottom = 96 } = {}) {
  const button = page.locator('.assistant-contact');
  await expect(button).toBeVisible();
  await expect.poll(async () => {
    const bounds = await button.boundingBox();
    return bounds && Math.max(Math.abs(width - bounds.x - bounds.width - right), Math.abs(height - bounds.y - bounds.height - bottom));
  }, { message: 'the assistant adapts to the available space around Zoho' }).toBeLessThanOrEqual(1);
  const buttonBounds = await button.boundingBox();
  const anchorBounds = await page.locator('#maries-widget-anchor').boundingBox();
  expect(anchorBounds).not.toBeNull();
  expect(Math.abs(anchorBounds.x - buttonBounds.x), 'the provider anchor follows the initial launcher horizontally').toBeLessThanOrEqual(1);
  expect(Math.abs(anchorBounds.y - buttonBounds.y - 72), 'the provider anchor retains its launcher offset').toBeLessThanOrEqual(1);
  await fitsViewport(button, width);
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(file);
  }
  return files;
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
  await check('Every generated page includes the exact SalesIQ embed once', async () => {
    const files = await htmlFiles(path.join(root, 'website/dist'));
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const html = await readFile(file, 'utf8');
      const embeds = html.match(/<script\b[^>]*\bid=["']zsiqscript["'][^>]*>/g) || [];
      expect(embeds, `${path.relative(root, file)} has one SalesIQ script`).toHaveLength(1);
      expect(embeds[0]).toContain(`src="${salesIQScriptURL}"`);
      expect(embeds[0]).toMatch(/\bdefer\b/);
    }
  });
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
  for (const modern of [false, true]) {
    const collapsed = modern ? { right: 8.5, bottom: 79 } : { right: 11, bottom: 84 };
    const expanded = modern ? { right: 380, bottom: 79 } : { right: 410, bottom: 96 };
    await check(`${modern ? 'Modern' : 'Legacy'} SalesIQ waits for a click and fits beside AI across viewport changes`, () => scenario(browser, 1440, { delayed: true, salesIQ: modern ? 'modern' : 'legacy' }, async ({ page, context }) => {
      const zohoButton = page.locator(modern ? '#zsiq_float.zsiq-float' : '.zsiq_floatmain');
      const zohoPanel = page.locator(modern ? '#zsiq_chat_wrap' : '.zls-sptwndw');
      const framePlaceholder = page.locator(modern ? '#siq_chatwindow' : '#siqiframe');
      await expect(zohoButton).toBeVisible();
      await expect(zohoPanel).toBeHidden();
      if (modern) {
        await expect.poll(() => page.evaluate(() => window.__salesIQTimingForTest.animations)).toBeGreaterThan(0);
        await expect(zohoButton.locator('[data-salesiq-test-keyboard]'), 'the native keyboard launcher is restored after the initial animation').toBeVisible();
      }
      await assistantPosition(page, 1440, collapsed);
      const aiBounds = await page.locator('.assistant-contact').boundingBox();
      const zohoBounds = await zohoButton.boundingBox();
      expect(Math.abs(zohoBounds.y - aiBounds.y - aiBounds.height - 14), '14px gap above the Zoho launcher').toBeLessThanOrEqual(1);

      const animations = await page.evaluate(() => window.__salesIQTimingForTest.animations);
      await page.evaluate(() => window.__openSalesIQInvitationForTest());
      if (modern) {
        await expect.poll(() => page.evaluate(() => window.__salesIQTimingForTest.animations)).toBeGreaterThan(animations);
        await expect(zohoButton.locator('[data-salesiq-test-keyboard]'), 'the delayed minimize restores the keyboard launcher after another invitation').toBeVisible();
      }
      await expect(zohoPanel, 'an automatic invitation stays closed before the visitor clicks').toBeHidden();
      await expect(framePlaceholder).toBeHidden();
      await expect(zohoButton).toBeVisible();
      await assistantPosition(page, 1440, collapsed);
      await zohoButton.evaluate(button => button.click());
      await expect(zohoPanel, 'a synthetic click does not count as visitor intent').toBeHidden();

      await zohoButton.click();
      await expect(zohoPanel).toBeVisible();
      // Finish the invitation cleanup while still on desktop before testing
      // resize restoration; a pending cleanup may intentionally close mobile UI.
      await page.evaluate(() => new Promise(resolve => window.setTimeout(resolve, 220)));
      await expect(zohoPanel).toBeVisible();
      if (modern) await expect(zohoButton).toBeVisible();
      else await expect(zohoButton).toBeHidden();
      await assistantPosition(page, 1440, expanded);
      const openAI = await page.locator('.assistant-contact').boundingBox();
      const openZoho = await zohoPanel.boundingBox();
      expect(Math.abs(openZoho.x - openAI.x - openAI.width - 14), '14px gap beside the open Zoho window').toBeLessThanOrEqual(1);
      await remainsOnPage(page, context);

      for (const width of [1024, 390]) {
        await page.setViewportSize({ width, height });
        await expect(zohoButton).toBeHidden();
        await expect(zohoPanel).toBeHidden();
        await expect(framePlaceholder).toBeHidden();
        if (modern) await expect(page.locator('[data-id="zsalesiq"]')).toBeHidden();
        await assistantPosition(page, width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Zoho does not create horizontal overflow on mobile').toBe(false);
      }

      await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(650);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => {
        document.body.style.setProperty('--salesiq-test-scroll', `${scrollY}px`);
        document.body.classList.add('zsiq_fixedlayout');
      });
      await expect(page.locator('body')).not.toHaveClass(/zsiq_fixedlayout/);
      await expect.poll(() => page.evaluate(() => scrollY), { message: 'removing the hidden mobile chat scroll lock preserves the visitor position' }).toBe(650);

      await page.setViewportSize({ width: 1440, height });
      await expect(zohoPanel).toBeVisible();
      await assistantPosition(page, 1440, expanded);
      await zohoPanel.locator('[data-zoho-close]').click();
      await expect(zohoPanel).toBeHidden();
      await expect(zohoButton).toBeVisible();
      await assistantPosition(page, 1440, collapsed);
      await page.setViewportSize({ width: 1024, height });
      await expect(zohoButton).toBeHidden();
      await assistantPosition(page, 1024);
      await page.evaluate(() => window.__openSalesIQInvitationForTest());
      await page.setViewportSize({ width: 1440, height });
      await expect(zohoButton).toBeVisible();
      await expect(zohoPanel, 'an invitation attempted on mobile remains closed after resizing back').toBeHidden();
      await assistantPosition(page, 1440, collapsed);
      await remainsOnPage(page, context);
    }));
  }
  await check('Modern SalesIQ opens when the first interaction is Enter or Space', async () => {
    for (const key of ['Enter', 'Space']) {
      await scenario(browser, 1440, { delayed: true, salesIQ: 'modern' }, async ({ page, context }) => {
        const button = page.locator('#zsiq_float.zsiq-float [data-salesiq-test-keyboard]');
        const panel = page.locator('#zsiq_chat_wrap');
        await expect(button).toBeVisible();
        await expect(panel).toBeHidden();
        await button.focus();
        await expect(button).toBeFocused();
        await page.keyboard.press(key);
        await expect(panel, `${key} opens chat without a preceding mouse click`).toBeVisible();
        await assistantPosition(page, 1440, { right: 380, bottom: 79 });
        await remainsOnPage(page, context);
      });
    }
  });
  await check('A pending invitation cleanup does not close a visitor-opened modern chat', () => scenario(browser, 1440, { delayed: true, salesIQ: 'modern' }, async ({ page, context }) => {
    const button = page.locator('#zsiq_float.zsiq-float');
    const panel = page.locator('#zsiq_chat_wrap');
    await expect(button).toBeVisible();
    await page.evaluate(() => window.__openSalesIQInvitationForTest());
    // Bypass only Playwright's stability wait to click inside the 160ms native
    // animation cleanup window, while still dispatching a trusted mouse event.
    await button.click({ force: true });
    const elapsed = await page.evaluate(() => window.__salesIQTimingForTest.click - window.__salesIQTimingForTest.invitation);
    expect(elapsed, 'the visitor clicks before the queued cleanup can run').toBeLessThan(160);
    await expect(panel).toBeVisible();
    await page.evaluate(() => new Promise(resolve => window.setTimeout(resolve, 220)));
    await expect(panel, 'the guarded delayed cleanup leaves requested chat open').toBeVisible();
    await remainsOnPage(page, context);
  }));
} catch (error) {
  results.push({ status: 'fail', name: 'Runner completes', details: error.stack });
} finally { await browser?.close(); }

await check('No uncaught browser errors', async () => expect(errors).toEqual([]));
await check('No external requests, redirects or WebSockets', async () => expect(blockedRequests).toEqual([]));
const counts = { pass: results.filter(result => result.status === 'pass').length, fail: results.filter(result => result.status === 'fail').length };
await writeFile(path.join(output, 'results.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), base: base.href, viewports, height, counts, results, errors, blockedRequests, limits: ['Provider rendering is mocked; this suite checks site loading, popup and retry behavior without contacting the assistant, CRM or WhatsApp.'] }, null, 2) + '\n');
console.log(JSON.stringify({ counts, output }, null, 2));
process.exitCode = counts.fail ? 1 : 0;
