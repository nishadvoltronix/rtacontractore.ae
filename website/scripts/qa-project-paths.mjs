import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localQAOrigin, localArtifacts, createLocalContext } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = await localArtifacts(root, process.env.QA_ARTIFACTS_DIR, 'artifacts/project-entry-paths');
const base = localQAOrigin(process.env.QA_BASE_URL || 'http://127.0.0.1:4173').origin;
await mkdir(output, { recursive: true });
const results = []; const errors = []; const blocked = [];
const check = (value, name, detail) => results.push({ status: value ? 'PASS' : 'FAIL', name, ...(detail ? { detail } : {}) });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [1440, 960, 390, 320]) for (const javaScriptEnabled of [true, false]) {
    const label = `${width} ${javaScriptEnabled ? 'JS' : 'no-JS'}`;
    const context = await createLocalContext(browser, base, { viewport: { width, height: 800 }, javaScriptEnabled, reducedMotion: 'reduce' }, blocked);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const section = page.locator('#rta-works'); const cards = section.locator('.resource-card');
    check(await cards.count() === 3, `${label}: three buyer starting points`);
    const destinations = await cards.evaluateAll(items => items.map(item => item.getAttribute('href')));
    check(JSON.stringify(destinations) === JSON.stringify(['/services/street-lighting/', '/services/underground-cabling/', '/request-a-quote/']), `${label}: supported scopes and quotation destination`);
    const text = await section.textContent();
    check(!/Earth Works|Footpath Works|Signboards|Hardscape|Bollards|Road Maintenance/.test(text), `${label}: unrelated work categories are not advertised`);
    check(await page.locator('script[src*="works-scroll.js"]').count() === 0, `${label}: no reveal controller required to access content`);
    check(await section.evaluate(element => getComputedStyle(element).position !== 'sticky'), `${label}: normal document flow`);
    for (let i = 0; i < await cards.count(); i++) {
      await cards.nth(i).focus();
      const visible = await cards.nth(i).evaluate(element => {
        const r = element.getBoundingClientRect(); const style = getComputedStyle(element);
        const header = document.querySelector('header').getBoundingClientRect();
        return { opacity: style.opacity, outline: style.outlineStyle, width: parseFloat(style.outlineWidth),
          top: r.top, bottom: r.bottom, header: Math.max(0, header.bottom), viewport: innerHeight };
      });
      check(visible.opacity === '1' && visible.outline !== 'none' && visible.width >= 2, `${label}: starting point ${i+1} is visible with keyboard focus`);
      check(visible.bottom > visible.header && visible.top < visible.viewport, `${label}: starting point ${i+1} remains reachable without scroll choreography`, visible);
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
    check(await page.locator('[data-sector-video]').evaluate(video => !video.getAttribute('src')), `${label}: decorative video not downloaded automatically`);
    const response = await page.goto(base + '/__missing-project-page__');
    check(response.status() === 404 && await page.locator('meta[name="robots"]').getAttribute('content') === 'noindex,follow', `${label}: missing page returns404 and noindex`);
    check(await page.locator('.error-actions a[href="/services/"]').isVisible(), `${label}:404 offers a useful recovery path`);
    await context.close();
  }
} catch (error) { check(false, 'Project-path suite completed', error.message); }
finally { await browser.close(); }
check(errors.length === 0, 'No page errors', errors);
check(blocked.length === 0, 'No unexpected provider requests', blocked);
const report = { passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results, errors, blocked, localOnly: true };
await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, output }));
if (report.failed) process.exitCode = 1;
