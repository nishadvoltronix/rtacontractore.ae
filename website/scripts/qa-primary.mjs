import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localQAOrigin, localArtifacts, createLocalContext, zohoFormScriptURL } from './qa-local-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = await localArtifacts(root, process.env.QA_ARTIFACTS_DIR, 'artifacts/primary-interactions');
const base = localQAOrigin(process.env.QA_BASE_URL || 'http://127.0.0.1:4173').origin;
const executablePath = process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const route = '/services/street-lighting/';
const targets = ['street-lighting-scope', 'rta-prequalification', 'electrical-project-evidence', 'project-brief', 'street-lighting-questions'];
const results = [];
const errors = [];
const blockedRequests = [];
const startedAt = new Date().toISOString();
const check = (condition, label, detail = null) => results.push({status: condition ? 'PASS' : 'FAIL', label, detail});
await mkdir(output, {recursive:true});
let browser;
try {
  browser = await chromium.launch({executablePath,headless:true});
  for (const width of [1440,390,320]) for (const javaScriptEnabled of [true,false]) {
    const label = `${width}px ${javaScriptEnabled ? 'JS' : 'no-JS'}`;
    const context = await createLocalContext(browser, base, {viewport:{width,height:900},javaScriptEnabled,reducedMotion:'reduce'}, blockedRequests);
    // Do not invoke communication applications or send messages.
    await context.addInitScript(() => {
      window.open = () => null;
      document.addEventListener('click', event => {
        const anchor = event.target.closest?.('a[href]');
        if (anchor && /^(mailto:|tel:)|(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(anchor.href)) event.preventDefault();
      }, true);
    });
    const page = await context.newPage();
    page.on('pageerror',e => errors.push({label,error:e.message}));
    page.on('console',m => {if(m.type()==='error') errors.push({label,error:m.text()});});
    await page.goto(base+route,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const nav = page.getByRole('navigation',{name:'On this page'});
    check(await nav.count() === 1, `${label}: named page navigation`);
    check(await nav.locator('a').count() === 5, `${label}: five page links`);
    check(await nav.isVisible(), `${label}: page navigation visible`);
    const initial = await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth, main:document.querySelector('main').textContent, h1:document.querySelectorAll('h1').length}));
    check(!initial.overflow,`${label}: no horizontal overflow`);
    check(initial.h1 === 1,`${label}: single primary heading`);
    for(const fact of ['Conditionally Prequalified','A025-6513466','AED 5,000,000','20 October 2029','tunnel lighting is excluded','Current RTA portal status has not been independently checked.']) check(initial.main.includes(fact),`${label}: qualification fact: ${fact}`);
    for(let i=0;i<targets.length;i++) {
      await page.locator('.qualification-link').focus();
      for(let j=0;j<=i;j++) await page.keyboard.press('Tab');
      const focus = await page.evaluate(()=>({href:document.activeElement.getAttribute('href'),outline:getComputedStyle(document.activeElement).outlineStyle,width:parseFloat(getComputedStyle(document.activeElement).outlineWidth),height:document.activeElement.getBoundingClientRect().height}));
      check(focus.href === '#'+targets[i],`${label}: keyboard tab reaches ${targets[i]}`,focus);
      check(focus.outline !== 'none' && focus.width >= 2,`${label}: keyboard focus visible for ${targets[i]}`,focus);
      check(focus.height >= 44,`${label}: ${targets[i]} link height >=44px`,focus.height);
      await page.keyboard.press('Enter');
      await page.waitForURL(url=>url.hash === '#'+targets[i]);
      await page.waitForTimeout(250);
      const location = await page.evaluate(id=>{
        const target=document.getElementById(id), header=document.querySelector('header'), heading=target.querySelector('h2');
        return {hash:location.hash, targetTop:target.getBoundingClientRect().top,headingTop:heading.getBoundingClientRect().top,headingBottom:heading.getBoundingClientRect().bottom,headerBottom:header.getBoundingClientRect().bottom,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};
      },targets[i]);
      check(location.hash === '#'+targets[i],`${label}: native Enter activates ${targets[i]}`,location);
      check(location.headingTop >= location.headerBottom-1 && location.headingTop < location.viewport,`${label}: ${targets[i]} heading visible below header`,location);
      check(!location.overflow,`${label}: no overflow after ${targets[i]} activation`);
    }
    await nav.scrollIntoViewIfNeeded();
    await nav.screenshot({path:path.join(output,`page-nav-${width}-${javaScriptEnabled?'js':'no-js'}.png`)});
    await page.screenshot({path:path.join(output,`nav-context-${width}-${javaScriptEnabled?'js':'no-js'}.png`),animations:'disabled'});
    for(const selector of ['.header-cta','#primary-nav > a:last-child','.service-hero .btn-primary','.service-closing .btn-primary']) check(await page.locator(selector).getAttribute('href') === '/?service=street-lighting#contact',`${label}: ${selector} retains street-lighting context`);
    const wa = new URL(await page.locator('.floating-contact').getAttribute('href'));
    check(/street lighting/i.test(wa.searchParams.get('text') || ''),`${label}: floating WhatsApp includes street lighting`,wa.searchParams.get('text'));
    if(javaScriptEnabled) {
      await page.goto(base+route,{waitUntil:'networkidle'});
      if(width===1440) await page.locator('.header-cta').click();
      else if(width===390) {
        await page.locator('[data-menu-toggle]').click();
        await page.locator('#primary-nav > a:last-child').click();
      } else await page.locator('.service-hero .btn-primary').click();
      await page.waitForURL(url=>url.pathname==='/' && url.searchParams.get('service')==='street-lighting' && url.hash==='#contact');
      check(await page.locator('#contact .contact-form').isVisible(),`${label}: actual CTA reaches contact section`);
    }
    for(const fallbackRoute of ['/','/services/underground-cabling/']) {
      await page.goto(base+fallbackRoute,{waitUntil:'networkidle'});
      check(await page.locator('.header-cta').getAttribute('href') === '/#contact',`${label}: ${fallbackRoute} generic header retained`);
      check(await page.locator('#primary-nav > a:last-child').getAttribute('href') === '/#contact',`${label}: ${fallbackRoute} generic Contact retained`);
      check(new URL(await page.locator('.floating-contact').getAttribute('href')).searchParams.get('text') === 'Hello VOLTRONIX, I would like to discuss a lighting or infrastructure project.',`${label}: ${fallbackRoute} generic WhatsApp retained`);
      if(fallbackRoute === '/') {
        const script = page.locator('#contact .zoho-form-embed script#formScript5653678000076526082');
        check(await script.count() === 1 && await page.locator('#formScript5653678000076526082').count() === 1,`${label}: Zoho embed installed once in contact section`);
        if(await script.count() === 1) {
          check(await script.getAttribute('src') === zohoFormScriptURL,`${label}: exact supplied Zoho embed URL`);
          check(await script.evaluate(element => !element.hasAttribute('async') && !element.hasAttribute('defer')),`${label}: Zoho embed retains synchronous loading`);
        }
        check(await page.locator('#quote-form, #quote-result').count() === 0,`${label}: legacy enquiry preparation removed`);
        check(await page.locator('#contact .contact-form a[href="mailto:info@voltronix.ae"]').first().isVisible(),`${label}: direct email fallback visible`);
        check(await page.locator('#contact .contact-form a[href="/privacy/"]').first().isVisible(),`${label}: privacy notice linked`);
      }
    }
    await context.close();
  }
} catch(error) {check(false,'Runner completed without exception',error.stack);} finally {await browser?.close();}
check(errors.length === 0,'No browser or console errors',errors);
check(blockedRequests.length === 0,'No external requests, unexpected redirects or WebSockets',blockedRequests);
const report = {startedAt,finishedAt:new Date().toISOString(),base,route,browser:'Installed Chrome, Playwright',viewports:[1440,390,320],height:900,javaScript:[true,false],sentMessages:false,counts:{pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length},errors,blockedRequests,results,limits:['Local preview only; no production delivery or real received-lead measurement.','No external contact links were activated or messages sent.','Zoho embed is stubbed locally; checks cover script placement and fallback links, not live CRM rendering, field preselection or delivery.','No-JavaScript checks cover native page links and static contact destinations.']};
await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,failures:results.filter(r=>r.status==='FAIL'),output},null,2));
process.exitCode=report.counts.fail?1:0;
