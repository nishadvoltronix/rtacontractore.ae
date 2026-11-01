import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base=new URL('./generated/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('asset-specifications.json',base),'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROME_PATH?{executablePath:process.env.QA_CHROME_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
const output=[];
try {
  for(const asset of manifest.assets) {
    const context=await browser.newContext({viewport:{width:asset.width,height:asset.height},deviceScaleFactor:1});
    const external=[];const errors=[];
    await context.route('**/*',route=>{external.push(new URL(route.request().url()).origin);return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const svg=await readFile(new URL(asset.name+'.svg',base),'utf8');
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block}</style></head><body>'+svg+'</body></html>');
    await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
    await page.screenshot({path:fileURLToPath(new URL(asset.name+'.png',base))});
    assert.equal(errors.length,0);assert.equal(external.length,0);
    output.push({name:asset.name,width:asset.width,height:asset.height,rendered:true,externalRequests:external.length});
    await context.close();
  }
} finally {await browser.close();}
await writeFile(new URL('render-checks.json',base),JSON.stringify({assets:output,reviewState:'Rendered; visual review required before publishing',socialAccountsChanged:false},null,2)+'\n');
console.log(JSON.stringify({rendered:output.length,externalRequests:0,socialAccountsChanged:false}));
