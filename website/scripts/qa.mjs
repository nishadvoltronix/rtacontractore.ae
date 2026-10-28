import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localQAOrigin, localArtifacts, createLocalContext, localLinkResponse, zohoFormScriptURL } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = await localArtifacts(root, process.env.QA_ARTIFACTS_DIR, 'artifacts');
const baseURL = localQAOrigin(process.env.QA_BASE_URL || 'http://127.0.0.1:4173');
const executablePath = process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];
const browserErrors = [];
const internalLinks = new Set();
const pageIds = new Map();
const blockedRequests = [];

function check(condition, name, details = '') {
  results.push({ status: condition ? 'pass' : 'fail', name, ...(details ? { details } : {}) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${details && !condition ? ` — ${details}` : ''}`);
}

function localURL(href, relativeTo = baseURL.href) {
  try {
    const url = new URL(href, relativeTo);
    return url.origin === baseURL.origin && ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

async function loadImages(page) {
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; });
  });
  await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 15_000 });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await document.fonts.ready;
    // Chrome may defer painting offscreen decoded images until their first intersection.
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight) {
      scrollTo({ top, behavior: 'instant' });
      await nextFrame();
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await nextFrame();
  });
}

async function inspectPage(page, pathname, viewportName, AxeBuilder) {
  const response = await page.goto(new URL(pathname, baseURL).href, { waitUntil: 'networkidle' });
  check(response?.status() === 200, `${viewportName} ${pathname}: page returns 200`, String(response?.status()));
  await loadImages(page);
  const inspection = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const images = [...document.images].map(image => ({
      src: image.currentSrc || image.src,
      loaded: image.complete && image.naturalWidth > 0,
      hasAlt: image.hasAttribute('alt'),
    }));
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.body.querySelectorAll('*')].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0
        && (rect.right > viewportWidth + 2 || rect.left < -2);
    }).slice(0, 8).map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''}`);
    return {
      title: document.title.trim(),
      description: meta?.content.trim(),
      canonical: canonical?.href,
      h1s: [...document.querySelectorAll('h1')].map(heading => heading.textContent.trim()),
      images,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > viewportWidth + 2,
      offenders,
      hrefs: [...document.querySelectorAll('a[href]')].map(anchor => anchor.href),
      ids: [...document.querySelectorAll('[id]')].map(element => element.id),
    };
  });
  check(inspection.title.length >= 15, `${viewportName} ${pathname}: meaningful title`, inspection.title);
  check(Boolean(inspection.description && inspection.description.length >= 50), `${viewportName} ${pathname}: SEO description`, inspection.description || 'Missing description');
  check(inspection.h1s.length === 1 && inspection.h1s[0].length > 5, `${viewportName} ${pathname}: exactly one descriptive H1`, JSON.stringify(inspection.h1s));
  check(Boolean(inspection.canonical?.startsWith('https://')), `${viewportName} ${pathname}: HTTPS canonical URL`, inspection.canonical || 'Missing canonical');
  check(!inspection.overflow, `${viewportName} ${pathname}: no horizontal overflow`, inspection.offenders.join(', '));
  check(inspection.images.length > 0 && inspection.images.every(image => image.loaded), `${viewportName} ${pathname}: all images loaded`, JSON.stringify(inspection.images.filter(image => !image.loaded)));
  check(inspection.images.every(image => image.hasAlt), `${viewportName} ${pathname}: all images have alt attributes`);
  check(inspection.images.every(image => localURL(image.src) || image.src.startsWith('data:')), `${viewportName} ${pathname}: images served locally`, JSON.stringify(inspection.images.filter(image => !localURL(image.src) && !image.src.startsWith('data:'))));
  inspection.hrefs.forEach(href => { if (localURL(href)) internalLinks.add(href); });
  pageIds.set(new URL(page.url()).pathname, new Set(inspection.ids));
  if (AxeBuilder) {
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violations = accessibility.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
    check(violations.length === 0, `${viewportName} ${pathname}: no serious or critical accessibility violations`, JSON.stringify(violations.map(violation => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map(node => node.target) }))));
  }
  const name = pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z\d-]+/gi, '-') || 'home';
  await page.screenshot({ path: path.join(artifacts, `${name}-${viewportName}.png`), fullPage: true, animations: 'disabled' });
  return inspection;
}

async function inspectInteractions(page) {
  await page.goto(baseURL.href, { waitUntil: 'networkidle' });
  const menuToggle = page.locator('[data-menu-toggle]');
  const nav = page.locator('[data-nav]');
  check(await menuToggle.count() === 1 && await menuToggle.isVisible(), 'mobile navigation: menu control is available');
  if (await menuToggle.count()) {
    await menuToggle.click();
    check(await menuToggle.getAttribute('aria-expanded') === 'true' && await nav.isVisible(), 'mobile navigation: opens and exposes expanded state');
    await menuToggle.click();
    check(await menuToggle.getAttribute('aria-expanded') === 'false', 'mobile navigation: closes and exposes collapsed state');
  }

  const faq = page.locator('#faq .faq-list details').first();
  check(await faq.count() > 0, 'FAQ: native disclosure is available');
  if (await faq.count()) {
    const wasOpen = await faq.evaluate(element => element.open);
    await faq.locator('summary').click();
    check(await faq.evaluate(element => element.open) !== wasOpen, 'FAQ: summary toggles the answer');
  }

  const script = page.locator('#contact .zoho-form-embed script#formScript5653678000076526082');
  check(await script.count() === 1 && await page.locator('#formScript5653678000076526082').count() === 1, 'Zoho form: embed installed once in contact section');
  if (await script.count() === 1) {
    check(await script.getAttribute('src') === zohoFormScriptURL, 'Zoho form: exact supplied embed URL');
    check(await script.evaluate(element => !element.hasAttribute('async') && !element.hasAttribute('defer')), 'Zoho form: embed retains synchronous loading');
  }
  check(await page.locator('#quote-form, #quote-result').count() === 0, 'Zoho form: legacy enquiry preparation removed');
  check(await page.locator('#contact .contact-form a[href="mailto:info@voltronix.ae"]').first().isVisible(), 'Zoho form: direct email fallback visible');
  check(await page.locator('#contact .contact-form a[href="/privacy/"]').first().isVisible(), 'Zoho form: privacy notice linked');
  await page.screenshot({ path: path.join(artifacts, 'zoho-embed-fallback-mobile.png'), fullPage: true, animations: 'disabled' });
}

await mkdir(artifacts, { recursive: true });
let browser;
try {
  let AxeBuilder;
  try {
    ({ default: AxeBuilder } = await import('@axe-core/playwright'));
  } catch {
    check(false, 'accessibility: @axe-core/playwright is installed', 'Install the development dependency to run required accessibility checks.');
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await createLocalContext(browser, baseURL, { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }, blockedRequests);
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  // Inspect the embed and fallback links without submitting or opening contact applications.
  await context.addInitScript(() => {
    window.open = () => null;
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]');
      if (anchor && /^(mailto:|tel:)|(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(anchor.href)) event.preventDefault();
    }, true);
  });
  const home = await inspectPage(page, '/', 'desktop', AxeBuilder);
  const servicePaths = [...new Set(home.hrefs.map(href => localURL(href)?.pathname).filter(pathname => pathname && /^\/services\/[^/]+\/?$/.test(pathname)))].sort();
  check(servicePaths.length === 6, 'navigation: six distinct service detail pages', JSON.stringify(servicePaths));
  const secondaryPaths = [...servicePaths, '/privacy/', '/photography/'];
  const titles = [home.title];
  const descriptions = [home.description];
  for (const pathname of secondaryPaths) {
    const inspection = await inspectPage(page, pathname, 'desktop', AxeBuilder);
    titles.push(inspection.title);
    descriptions.push(inspection.description);
  }
  check(new Set(titles).size === titles.length, 'SEO: every page has a unique title');
  check(new Set(descriptions).size === descriptions.length, 'SEO: every page has a unique meta description');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const pathname of ['/', ...secondaryPaths]) await inspectPage(page, pathname, 'mobile', AxeBuilder);
  await inspectInteractions(page);

  const checkedURLs = new Map();
  for (const href of internalLinks) {
    const url = localURL(href);
    if (!url) continue;
    const fragment = url.hash;
    url.hash = '';
    if (!checkedURLs.has(url.href)) {
      const response = await localLinkResponse(context, url.href, baseURL);
      checkedURLs.set(url.href, response.status());
      check(response.status() === 200, `internal link: ${url.pathname}${url.search} returns 200`, String(response.status()));
      await response.dispose();
    }
    if (fragment && fragment !== '#' && pageIds.has(url.pathname)) {
      check(pageIds.get(url.pathname).has(decodeURIComponent(fragment.slice(1))), `internal anchor: ${url.pathname}${fragment} exists`);
    }
  }
  check(browserErrors.length === 0, 'browser: no JavaScript or console errors', [...new Set(browserErrors)].join('\n'));
  check(blockedRequests.length === 0, 'browser: no external requests, unexpected redirects or WebSockets', JSON.stringify(blockedRequests));
} catch (error) {
  check(false, 'QA runner completed', error.stack || String(error));
} finally {
  if (browser) await browser.close();
  const report = { baseURL: baseURL.href, checkedAt: new Date().toISOString(), passed: results.filter(result => result.status === 'pass').length, failed: results.filter(result => result.status === 'fail').length, blockedRequests, results, limits: ['Zoho embed is stubbed locally; checks cover script placement and fallback links, not live CRM rendering or delivery. No enquiry is submitted.'] };
  await writeFile(path.join(artifacts, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nQA complete: ${report.passed} passed, ${report.failed} failed. Report and screenshots: ${artifacts}`);
  process.exitCode = report.failed ? 1 : 0;
}
