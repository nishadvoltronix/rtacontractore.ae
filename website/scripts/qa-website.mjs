import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexableRoutes } from '../page-content.mjs';
import { localQAOrigin, localArtifacts, createLocalContext, zohoFormScriptURL } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = localQAOrigin(process.env.QA_BASE_URL || 'http://127.0.0.1:4173').origin;
const output = await localArtifacts(root, process.env.QA_ARTIFACTS_DIR, 'artifacts/website-modernization');
await mkdir(output, { recursive: true });
const results = []; const errors = []; const blocked = []; const accessibility = [];
const check = (value, name, detail) => results.push({ status: value ? 'PASS' : 'FAIL', name, ...(detail ? { detail } : {}) });
// Synthetic layout fixture only: no values are submitted or sent to Zoho.
const form = `<form id="webform5653678000076526082" onsubmit="event.preventDefault()" class="qa-provider-form" aria-label="Mocked Zoho enquiry form"><div style="display:grid;gap:16px"><label>Last name <input name="Last Name" required style="width:100%;min-height:44px;border:1px solid #777;padding:10px"></label><label>Email <input name="Email" type="email" required style="width:100%;min-height:44px;border:1px solid #777;padding:10px"></label><label>Mobile <input name="Mobile" type="tel" required style="width:100%;min-height:44px;border:1px solid #777;padding:10px"></label><label>Project name <input name="LEADCF9" required style="width:100%;min-height:44px;border:1px solid #777;padding:10px"></label><label>Product / service interest <textarea name="LEADCF12" required style="width:100%;min-height:90px;border:1px solid #777;padding:10px"></textarea></label><button type="submit" style="background:#b51f27;color:#fff;padding:14px;min-height:48px;border:0">Send enquiry (local mock)</button></div></form>`;
const capture = new Set(['/', '/services/', '/request-a-quote/', '/faqs/', '/knowledge/street-lighting-quotation-checklist/', '/services/street-lighting/']);
const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await createLocalContext(browser, base, { viewport: { width, height: 900 }, reducedMotion: 'reduce' }, blocked);
    await context.route(zohoFormScriptURL, route => route.fulfill({ contentType: 'application/javascript', body: `document.write(${JSON.stringify(form)})` }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ width, message: error.message }));
    for (const route of indexableRoutes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const facts = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main#main').length,
        scripts: [...document.scripts].map(s => s.src),
        forms: document.querySelectorAll('#webform5653678000076526082').length,
        videoHasSrc: Boolean(document.querySelector('[data-sector-video]')?.getAttribute('src')),
        disabledController: window.RTAMarketing?.consent?.getState?.(),
      }));
      check(!facts.overflow, `${width} ${route}: no horizontal overflow`);
      check(facts.h1 === 1 && facts.main === 1, `${width} ${route}: one H1 and main landmark`);
      check(facts.scripts.filter(src => src.includes('googletagmanager.com/gtm.js')).length === 1, `${width} ${route}: one GTM loader`);
      check(facts.forms === (['/', '/contact/', '/request-a-quote/'].includes(route) ? 1 : 0), `${width} ${route}: expected single provider form`);
      if (route === '/') check(!facts.videoHasSrc, `${width}: background video is opt-in`);
      if (width !== 320) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        const violations = axe.violations.filter(v => ['critical','serious'].includes(v.impact));
        accessibility.push({ width, route, violations: violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) });
        check(violations.length === 0, `${width} ${route}: no serious/critical accessibility violations`, violations);
      }
      if (capture.has(route) && width !== 320) {
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
            scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 70));
          }
          await Promise.all([...document.images].map(img => Promise.race([img.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))])));
          scrollTo(0, 0);
        });
        check(await page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0)), `${width} ${route}: requested images decode after scrolling`);
        await page.screenshot({ path: path.join(output, `${width}-${route === '/' ? 'home' : route.replaceAll('/','-').replace(/^-|-$/g,'')}.png`), fullPage: true });
      }
    }
    await page.goto(base + '/');
    if (width < 960) {
      const toggle = page.locator('[data-menu-toggle]');
      await toggle.click(); check(await toggle.getAttribute('aria-expanded') === 'true', `${width}: mobile menu opens`);
    }
    const menu = page.locator('[data-nav-menu]').first(); const summary = menu.locator('summary');
    await summary.focus(); await summary.press('ArrowDown');
    check(await menu.getAttribute('open') !== null && await menu.locator('a').first().evaluate(e => e === document.activeElement), `${width}: menu keyboard entry`);
    await page.keyboard.press('Escape');
    check(await menu.getAttribute('open') === null && await summary.evaluate(e => e === document.activeElement), `${width}: Escape closes menu and returns focus`);
    if (width < 960) { await page.keyboard.press('Escape'); check(await page.locator('[data-menu-toggle]').getAttribute('aria-expanded') === 'false', `${width}: Escape closes mobile navigation`); }
    await page.goto(base + '/faqs/');
    const all = await page.locator('[data-faq-item]').count();
    await page.locator('[data-faq-filter]').fill('cabling');
    const matches = await page.locator('[data-faq-item]:visible').count();
    check(matches > 0 && matches < all, `${width}: FAQ search filters visible questions`);
    await page.locator('[data-faq-filter]').fill('zzzz-no-match');
    check(await page.locator('[data-faq-empty]').isVisible(), `${width}: FAQ empty state`);
    await page.locator('[data-faq-filter]').fill('');
    check(await page.locator('[data-faq-item]:visible').count() === all, `${width}: FAQ clear restores questions`);
    await page.goto(base + '/request-a-quote/?service=street-lighting');
    check((await page.locator('[data-enquiry-service]').textContent()).includes('Street lighting'), `${width}: allowlisted service context`);
    await page.goto(base + '/request-a-quote/?service=PRIVATE-unrecognized');
    check(await page.locator('[data-enquiry-service]').isHidden(), `${width}: unknown service value not reflected`);
    await context.close();
  }
  for (const width of [1440, 390]) {
    const context = await createLocalContext(browser, base, { viewport: { width, height: 900 }, javaScriptEnabled: false }, blocked);
    const page = await context.newPage();
    for (const route of ['/', '/services/', '/request-a-quote/', '/knowledge/', '/faqs/']) {
      await page.goto(base + route);
      check(await page.locator('[data-nav]').isVisible(), `${width} ${route}: no-JS navigation remains available`);
      check(await page.locator('main h1').isVisible(), `${width} ${route}: no-JS content remains available`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${route}: no-JS no overflow`);
    }
    await context.close();
  }
} catch (error) {
  errors.push({ suite: 'browser-interactions', message: error.message });
  check(false, 'Browser suite completed', error.message);
} finally {
  await browser.close();
}
check(errors.length === 0, 'No page JavaScript errors', errors);
check(blocked.length === 0, 'No unexpected remote requests escaped the exact local mocks', blocked);
const summary = { passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length,
  results, errors, blocked, accessibility, providerForm: 'Synthetic layout fixture only; no live enquiry or provider delivery test', localOnly: true };
await writeFile(path.join(output, 'results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, errors: errors.length, blocked: blocked.length, output }));
if (summary.failed) process.exitCode = 1;
