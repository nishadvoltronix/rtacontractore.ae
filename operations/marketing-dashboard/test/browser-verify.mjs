import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {PRESETS,PRESET_LABELS,periodRange,rangeLabel,availableDays} from '../lib/model.mjs';
const output=resolve(process.env.RTA_DASHBOARD_QA_OUTPUT??'artifacts/marketing-dashboard');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
const page=await context.newPage(),errors=[],blocked=[],checks=[];
let reviewedSnapshot;
page.on('response',async response=>{if(/\/snapshot\.[a-f0-9]+\.json$/.test(new URL(response.url()).pathname))reviewedSnapshot=await response.json();});
const check=(condition,description)=>{assert.ok(condition,description);checks.push(description);};
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)){blocked.push(url.origin);return route.abort();}
  return route.continue();
});
const choosePeriod=async label=>{await page.getByRole('button',{name:'Period',exact:true}).click();await page.getByRole('menuitemradio',{name:label,exact:true}).click();};
const screenshot=async name=>{await page.screenshot({path:resolve(output,name),fullPage:true});};
try {
  await page.goto(process.env.RTA_DASHBOARD_URL??'http://127.0.0.1:57729/',{waitUntil:'networkidle'});
  check((await page.title())==='RTA marketing performance','Dashboard title and bundle load');
  check((await page.getByText('Unavailable',{exact:true}).count())>=4,'Missing KPI values remain explicit Unavailable');
  for(const preset of PRESETS.filter(p=>p!=='custom')){
    await choosePeriod(PRESET_LABELS[preset]);
    check((await page.getByRole('region',{name:'Reporting period',exact:true}).innerText()).includes(rangeLabel(periodRange(preset))),`Calendar preset ${PRESET_LABELS[preset]} updates the actual reporting range`);
  }
  await choosePeriod('Custom');
  const customDays=availableDays(reviewedSnapshot?.queries??{});
  check(await page.getByRole('button',{name:'Covered custom range',exact:true}).isDisabled()===!customDays.length,'Custom calendar availability follows verified source date coverage');
  if(!customDays.length)check((await page.locator('main').innerText()).includes('No dated performance observations are loaded'),'Custom coverage limitation is visible');
  else check((await page.getByRole('region',{name:'Reporting period',exact:true}).innerText()).includes(rangeLabel({startDate:customDays[0],endDate:customDays.at(-1)})),'Custom fallback selects actual available source dates');
  await page.getByRole('button',{name:'Reset period',exact:true}).click();
  check((await page.getByRole('region',{name:'Reporting period',exact:true}).innerText()).includes('Last 7 days'),'Reset restores the authored date preset');
  await screenshot('overview-desktop.png');
  const views=[['Search & AI','search-desktop.png','Native AI performance'],['Paid advertising','paid-desktop.png','Reported campaign spend'],['Pipeline','pipeline-desktop.png','RTA lifecycle stages'],['Connections','connections-desktop.png','Connection readiness']];
  for(const [name,file,evidence] of views){
    await page.getByRole('tab',{name,exact:true}).click();
    check((await page.locator('main').innerText()).includes(evidence),`${name} renders its authored evidence components`);
    check((await page.locator('main').innerText()).includes(name==='Connections'?'Automatic report refresh is not connected':'Unavailable'),`${name} states its actual reporting limitation`);
    await screenshot(file);
  }
  check(await page.getByRole('region',{name:'Reporting period',exact:true}).count()===0,'Connection audit is independent of performance-date filters');
  const table=page.getByRole('table',{name:'Connection readiness',exact:true});
  check((await table.innerText()).includes('Fields verified; capture service disabled'),'Verified CRM readiness is visible without invented lead counts');
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  check((await table.innerText()).includes('Ownership and data unverified'),'Remaining source coverage is available through pagination');
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Website visitors actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'View data source',exact:true}).click();
  const source=page.getByRole('complementary',{name:'Data source for Website visitors'});
  check(await source.isVisible(),'Source inspector opens for the selected KPI');
  check((await source.innerText()).includes('No results'),'Source preview preserves an empty performance dataset');
  await source.getByRole('tab',{name:'Evidence flow',exact:true}).click();
  check((await source.innerText()).includes('No successful report request'),'Evidence flow discloses missing successful reporting access');
  await screenshot('source-inspector-desktop.png');
  await source.getByRole('button',{name:'Close data source',exact:true}).click();
  await page.getByRole('button',{name:'More',exact:true}).click();
  const menu=page.getByRole('menu',{name:'More',exact:true});
  for(const label of ['Spaces Page','PDF','Markdown','Document','Presentation','Spreadsheet','Jupyter Notebook','Google Docs','Google Slides'])check(await menu.getByRole('menuitem',{name:label,exact:true}).count()===1,`Export menu includes verified ${label} destination`);
  check(await menu.getByRole('menuitem',{name:'HTML / Site',exact:true}).count()===0,'Current HTML surface is not offered as a duplicate export');
  await screenshot('export-menu-desktop.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await screenshot('overview-mobile.png');
  for(const name of ['Overview','Search & AI','Paid advertising','Pipeline','Connections']){
    await page.getByRole('tab',{name,exact:true}).click();
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    check(width.scroll<=width.viewport+1,`${name} has no document-level horizontal overflow on mobile`);
    if(name==='Connections')await screenshot('connections-mobile.png');
    if(name==='Paid advertising')await screenshot('paid-mobile.png');
  }
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await choosePeriod('Yesterday');
  await page.getByRole('button',{name:'Reset period',exact:true}).click();
  check((await page.getByRole('region',{name:'Reporting period',exact:true}).innerText()).includes('Last 7 days'),'Mobile period and reset controls remain usable');
  for(const label of ['Period','Reset period']){const box=await page.getByRole('button',{name:label,exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=391,`${label} is fully visible without horizontal scrolling on mobile`);}
  await page.emulateMedia({colorScheme:'dark'});
  await screenshot('overview-mobile-dark.png');
  check(errors.length===0,'No uncaught runtime errors in any authored view');
  check(blocked.length===0,'Dashboard requests no external providers in the isolated browser');
  await writeFile(resolve(output,'browser-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),url:page.url().split('?')[0],checks,passed:checks.length,errors,blocked,scope:'Actual reviewed dashboard, including any loaded native source snapshots. No synthetic performance rows. Native chart acceptance is covered separately. Export destinations inspected; no export or publication executed.'},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,errors,blocked,output}));
} finally {await browser.close();}
