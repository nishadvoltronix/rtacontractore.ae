import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../site.config.mjs';
import { services } from '../services.mjs';
import { streetLightingContent } from '../street-lighting-content.mjs';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const origin = new URL(site.url).origin;
const routes = ['/', ...services.map(service => `/services/${service.slug}/`), '/privacy/', '/photography/'];
const failures = [];
let assertions = 0;
const assetReferences = new Set();
const internalReferences = new Set();
const pageData = new Map();

function check(condition, message) {
  assertions++;
  if (!condition) failures.push(message);
}
function decode(value = '') {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}
function localURL(reference, route = '/') {
  try {
    const url = new URL(reference, new URL(route, site.url));
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}
function localPath(url) {
  const pathname = decodeURIComponent(url.pathname);
  const file = path.resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
  if (file !== dist && !file.startsWith(dist + path.sep)) throw new Error(`Path escapes output directory: ${pathname}`);
  return file;
}
async function existsAndHasContent(file) {
  try { const info = await stat(file); return info.isFile() && info.size > 0; }
  catch { return false; }
}
async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}

try {
  check(new URL(site.url).protocol === 'https:', 'Site URL must use HTTPS.');
  const files = await htmlFiles(dist);
  check(files.length === routes.length + 1, `Expected ${routes.length} indexable HTML pages plus 404; found ${files.length}.`);
  for (const route of [...routes, '/404.html']) {
    const html = await readFile(localPath(new URL(route, site.url)), 'utf8');
    const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());
    const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
    const description = meta.find(item => item.name === 'description')?.content;
    const canonical = links.find(item => item.rel === 'canonical')?.href;
    const robots = meta.find(item => item.name === 'robots')?.content || '';
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    const expectedCanonical = new URL(route, site.url).href;
    check(/^<!doctype html>/i.test(html.trimStart()), `${route}: missing HTML5 doctype.`);
    check(/<html\b[^>]*\blang="en(?:-[A-Z]{2})?"/i.test(html), `${route}: missing English language declaration.`);
    check(meta.some(item => item.charset?.toLowerCase() === 'utf-8'), `${route}: missing UTF-8 charset.`);
    check(meta.some(item => item.name === 'viewport' && item.content?.includes('width=device-width')), `${route}: missing responsive viewport.`);
    check(title.length >= 15 && title.length <= 85, `${route}: missing or excessively long title (${title.length} characters).`);
    check(description?.length >= 50 && description.length <= 190, `${route}: missing or excessively long description (${description?.length || 0} characters).`);
    check((html.match(/<h1\b/gi) || []).length === 1, `${route}: must contain exactly one H1.`);
    check(canonical === expectedCanonical, `${route}: canonical does not match configured site URL.`);
    check(route === '/404.html' ? /\bnoindex\b/.test(robots) : /\bindex\b/.test(robots) && !/\bnoindex\b/.test(robots), `${route}: incorrect indexing directive.`);
    check(new Set(ids).size === ids.length, `${route}: duplicate HTML IDs.`);
    for (const [property, expected] of [['og:title', title], ['og:description', description], ['og:url', expectedCanonical]]) {
      check(meta.some(item => item.property === property && item.content === expected), `${route}: ${property} does not match page metadata.`);
    }
    check(meta.some(item => item.name === 'twitter:card' && item.content === 'summary_large_image'), `${route}: missing large social preview card.`);
    const socialImage = meta.find(item => item.property === 'og:image')?.content;
    check(Boolean(socialImage && localURL(socialImage)), `${route}: social image must resolve to the configured site.`);
    if (socialImage) assetReferences.add(socialImage);
    const schemaBlocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    check(schemaBlocks.length > 0, `${route}: missing structured data.`);
    const schemaTypes = new Set();
    for (const block of schemaBlocks) {
      try {
        const schema = JSON.parse(block[1]);
        check(schema['@context'] === 'https://schema.org', `${route}: incorrect schema context.`);
        const nodes = schema['@graph'] || [schema];
        const ids = nodes.map(node => node['@id']);
        check(ids.every(Boolean) && new Set(ids).size === ids.length, `${route}: graph nodes need unique entity IDs.`);
        const webPage = nodes.find(node => node['@type'] === 'WebPage');
        check(webPage?.url === expectedCanonical && webPage?.name === title && webPage?.description === description, `${route}: WebPage must match visible page metadata.`);
        const references = value => {
          if (!value || typeof value !== 'object') return;
          if (Object.keys(value).length === 1 && value['@id']) check(ids.includes(value['@id']), `${route}: dangling schema reference ${value['@id']}.`);
          Object.values(value).forEach(references);
        };
        nodes.forEach(references);
        nodes.forEach(node => {
          [].concat(node['@type'] || []).forEach(type => schemaTypes.add(type));
          for (const property of ['logo', 'image']) {
            if (typeof node[property] === 'string' && localURL(node[property])) assetReferences.add(node[property]);
          }
          if (node['@type'] === 'GeneralContractor') {
            check(node.name === site.legalName && node.telephone === site.phoneLink && node.email === site.email, `${route}: business structured data has inconsistent contact information.`);
            check(node.address?.streetAddress === site.streetAddress && node.address?.postOfficeBoxNumber === site.postOfficeBoxNumber && !node.address?.postalCode, `${route}: address must use shared NAP and keep P.O. Box distinct from postal code.`);
            check(!node.sameAs?.some(url => url.includes('pinterest.com/voltronixs')), `${route}: separate switchgear entity must not be conflated with contracting LLC.`);
            check(node.image === node.logo, `${route}: representative road imagery must not be used as company evidence.`);
          }
          if (node['@type'] === 'Service') {
            check(node.url === expectedCanonical, `${route}: Service schema URL does not match its canonical.`);
            check(webPage?.mainEntity?.['@id'] === node['@id'] && node.mainEntityOfPage?.['@id'] === webPage?.['@id'], `${route}: service and page must be connected.`);
          }
          if (node['@type'] === 'BreadcrumbList') check(node.itemListElement?.at(-1)?.item === expectedCanonical, `${route}: breadcrumb schema does not end at the current page.`);
        });
      } catch (error) { check(false, `${route}: invalid structured data JSON: ${error.message}`); }
    }
    check(schemaTypes.has('GeneralContractor') && schemaTypes.has('WebSite') && schemaTypes.has('WebPage'), `${route}: missing business, website or webpage structured data.`);
    if (route.startsWith('/services/')) {
      const service = services.find(service => route === `/services/${service.slug}/`);
      check(schemaTypes.has('BreadcrumbList'), `${route}: missing breadcrumb structured data.`);
      check(schemaTypes.has('Service') === service.verifiedService, `${route}: Service schema must be limited to evidence-backed categories.`);
    }
    for (const match of html.matchAll(/<(img|script|link|a)\b[^>]*>/gi)) {
      const tag = match[1].toLowerCase();
      const attrs = attributes(match[0]);
      const reference = attrs.src || attrs.href;
      if (reference && localURL(reference, route) && !(tag === 'link' && attrs.rel === 'canonical')) {
        const absolute = new URL(reference, new URL(route, site.url)).href;
        (tag === 'a' ? internalReferences : assetReferences).add(absolute);
      }
      const responsiveSet = attrs.srcset || attrs.imagesrcset;
      if (responsiveSet) {
        const candidates = responsiveSet.split(',').map(candidate => candidate.trim().match(/^(\S+)\s+(\d+)w$/));
        check(candidates.every(Boolean), `${route}: invalid responsive image width descriptors.`);
        const widths = candidates.filter(Boolean).map(candidate => Number(candidate[2]));
        check(new Set(widths).size === widths.length && widths.every(width => width > 0), `${route}: responsive image widths must be unique and positive.`);
        check(Boolean(attrs.sizes || attrs.imagesizes), `${route}: responsive image is missing its sizes attribute.`);
        for (const candidate of candidates.filter(Boolean)) {
          const url = localURL(candidate[1], route);
          check(Boolean(url), `${route}: responsive image candidate must be hosted locally: ${candidate[1]}`);
          if (url) assetReferences.add(url.href);
        }
      }
      if (tag === 'img') {
        check(Object.hasOwn(attrs, 'alt'), `${route}: image ${attrs.src} is missing alt text.`);
        check(Number(attrs.width) > 0 && Number(attrs.height) > 0, `${route}: image ${attrs.src} is missing intrinsic dimensions.`);
        check(Boolean(localURL(attrs.src, route)), `${route}: image ${attrs.src} is not hosted locally.`);
        if (attrs.src?.startsWith('/assets/images/')) check(Boolean(responsiveSet), `${route}: editorial photo is missing responsive image candidates.`);
      }
    }
    pageData.set(route, { title, description, ids: new Set(ids) });
    console.log(`Checked ${route}: metadata, HTML, structured data, and image attributes.`);
  }
  const indexable = routes.map(route => pageData.get(route));
  const primary = await readFile(path.join(dist, 'services/street-lighting/index.html'), 'utf8');
  const answer = decode(primary.match(/class="service-answer">([^<]+)/)?.[1] || '');
  check(answer.split(/\s+/).length >= 40 && answer.split(/\s+/).length <= 70, 'Primary service answer must contain 40–70 words of static HTML.');
  for (const fact of ['Conditionally Prequalified', 'A025-6513466', 'AED 5,000,000', '20 October 2029', 'tunnel lighting is excluded']) check(primary.includes(fact), `Qualification evidence is missing: ${fact}`);
  check(primary.includes('href="/assets/documents/rta-approval-pq.pdf"'), 'Primary service must link the actual qualification PDF.');
  check(!/RTA approved/i.test(pageData.get('/services/street-lighting/').title), 'Conditional qualification must not become a blanket approval title.');
  for (const faq of streetLightingContent.faqs) check(primary.includes(faq.question.replaceAll('&', '&amp;').replaceAll("'",'&#39;')), 'Buyer FAQ must be present in static HTML: ' + faq.question);
  check(new Set(indexable.map(page => page.title)).size === routes.length, 'Indexable pages must have unique titles.');
  check(new Set(indexable.map(page => page.description)).size === routes.length, 'Indexable pages must have unique meta descriptions.');

  const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decode(match[1]));
  check(sitemap.includes('http://www.sitemaps.org/schemas/sitemap/0.9'), 'Sitemap is missing the standard XML namespace.');
  check(locations.length === routes.length && new Set(locations).size === routes.length, 'Sitemap must list each indexable page exactly once.');
  for (const route of routes) check(locations.includes(new URL(route, site.url).href), `Sitemap is missing ${route}.`);
  check(!locations.some(location => location.endsWith('/404.html')), 'Sitemap must exclude the 404 page.');
  const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
  check(/User-agent:\s*\*/i.test(robots), 'robots.txt is missing the general crawler group.');
  check(!/^Disallow:\s*\/\s*$/im.test(robots), 'robots.txt blocks the entire website.');
  check(robots.includes(`Sitemap: ${new URL('/sitemap.xml', site.url).href}`), 'robots.txt does not point to the configured sitemap.');
  const css = await readFile(path.join(dist, 'assets/style.css'), 'utf8');
  for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    if (localURL(match[1], '/assets/style.css')) assetReferences.add(new URL(match[1], new URL('/assets/style.css', site.url)).href);
  }
  for (const reference of assetReferences) {
    const url = localURL(reference);
    check(await existsAndHasContent(localPath(url)), `Local asset does not exist or is empty: ${url.pathname}`);
  }
  for (const reference of internalReferences) {
    const url = localURL(reference);
    check(await existsAndHasContent(localPath(url)), `Internal link target does not exist: ${url.pathname}`);
    if (url.hash && pageData.has(url.pathname)) check(pageData.get(url.pathname).ids.has(decodeURIComponent(url.hash.slice(1))), `Internal fragment does not exist: ${url.pathname}${url.hash}`);
  }
  const clientSyntax = spawnSync(process.execPath, ['--check', path.join(dist, 'assets/app.js')], { encoding: 'utf8' });
  check(clientSyntax.status === 0, `Client JavaScript syntax error: ${clientSyntax.stderr || ''}`);
} catch (error) {
  check(false, error.stack || String(error));
}

failures.forEach(message => console.error(`FAIL ${message}`));
console.log(`\nStatic checks: ${assertions - failures.length}/${assertions} passed across ${routes.length} pages + 404. ${assetReferences.size} local asset references verified.`);
process.exitCode = failures.length ? 1 : 0;
