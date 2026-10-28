import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately supports only simple, ASCII prefix rules. Complex REP policies
// need a standards-compliant review; uncertainty must never become an allow.
export function robotsDecision(text, agent, path) {
  const groups = []; let current;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(); if (!line) continue;
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) return { status: 'NOT VERIFIED', reason: 'Unrecognized robots syntax' };
    const [, rawKey, value] = match; const key = rawKey.toLowerCase();
    if (key === 'user-agent') {
      if (!/^(?:\*|[a-z_-]+)$/i.test(value)) return { status: 'NOT VERIFIED', reason: 'Unsupported or empty user-agent product token' };
      if (!current || current.hasRules) { current = { agents: [], rules: [], hasRules: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(key)) {
      if (!current) return { status: 'NOT VERIFIED', reason: 'Rule outside a group' };
      current.hasRules = true; if (value) current.rules.push({ key, value });
    }
  }
  if (!groups.length) return { status: 'NOT VERIFIED', reason: 'No parsed user-agent group' };
  const exact = groups.filter(group => group.agents.includes(agent.toLowerCase()));
  const selected = exact.length ? exact : groups.filter(group => group.agents.includes('*'));
  const rules = selected.flatMap(group => group.rules);
  if (rules.some(rule => !rule.value.startsWith('/') || /[*$%]|[^\x20-\x7e]/.test(rule.value))) {
    return { status: 'NOT VERIFIED', reason: 'Relevant policy needs wildcard/encoding-aware REP parsing' };
  }
  const matches = rules.filter(rule => path.startsWith(rule.value)).sort((a, b) => b.value.length - a.value.length || (a.key === b.key ? 0 : a.key === 'allow' ? -1 : 1));
  return { status: matches[0]?.key === 'disallow' ? 'BLOCKED' : 'PASS', reason: matches[0] ? `${matches[0].key}: ${matches[0].value}` : 'No applicable restriction', group: exact.length ? agent : '*' };
}

const decode = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key,, value]) => [key.toLowerCase(), decode(value)]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
const hash = body => createHash('sha256').update(body).digest('hex');
export function primaryContentFacts(html) {
  const answer = [...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)].find(match => attributes(match[1]).class?.split(/\s+/).includes('service-answer'))?.[2] || '';
  const answerWords = decode(answer.replace(/<[^>]*>/g, ' ')).trim().split(/\s+/).filter(Boolean).length;
  const faq = html.match(/<div\s+class=["']faq-list["']\s*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const faqCount = [...faq.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)].filter(match => /<summary>[^<]+<\/summary>/i.test(match[1]) && /<p>[^<]+<\/p>/i.test(match[1])).length;
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ');
  return { answerWords, faqCount, staticCompanyName: /Voltronix Contracting LLC/i.test(text) };
}
const routePaths = ['/', '/services/street-lighting/', '/services/underground-cabling/', '/services/electrical-infrastructure/', '/services/high-mast-area-lighting/', '/services/led-solar-lighting/', '/services/lighting-maintenance/', '/privacy/', '/photography/'];
const agents = {
  ordinary: 'VOLTRONIX-Discovery-Audit/1.0 (local diagnostic; not a search crawler)',
  oaiLabelled: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot) VOLTRONIX-Discovery-Diagnostic/1.0 (not verified OpenAI egress)',
};

async function get(url, agent) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'user-agent': agent, accept: 'text/html,application/xml,text/plain,application/json' } });
    const reader = response.body?.getReader(); const chunks = []; let size = 0;
    if (reader) while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('Body exceeded 2 MB limit'); }
      chunks.push(Buffer.from(value));
    }
    return { url, status: response.status, contentType: response.headers.get('content-type'), location: response.headers.get('location'), robotsHeader: response.headers.get('x-robots-tag'), body: Buffer.concat(chunks).toString('utf8') };
  } catch (error) { return { url, error: error.name === 'TimeoutError' ? '12 second timeout' : error.message, body: '' }; }
}

async function main() {
  const options = {}; const args = process.argv.slice(2);
  while (args.length) { const key = args.shift(); if (!['--origin', '--output'].includes(key) || !args.length) throw new Error('Usage: node website/scripts/qa-discovery.mjs [--origin https://rtacontractor.ae] --output artifacts/discovery.json'); options[key.slice(2)] = args.shift(); }
  if (!options.output) throw new Error('--output is required');
  const origin = new URL(options.origin || 'https://rtacontractor.ae');
  if (origin.protocol !== 'https:' || origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Origin must be an HTTPS origin without credentials, port, path, query or fragment');
  const report = { startedAt: new Date().toISOString(), origin: origin.origin, scope: 'Read-only HTTP GETs from this local machine. OAI-labelled UA probes are NOT genuine OpenAI egress, crawler authentication, WAF/log verification, index coverage, or recommendation/citation evidence. No spoofed forwarded-IP headers. Redirects are recorded, never followed. Public headers/body signatures can differ by requester.', agents, checks: [], responses: [] };
  const record = (status, check, evidence) => report.checks.push({ status, check, evidence });
  const inspectResponse = (response, label) => {
    const { body, ...metadata } = response; report.responses.push({ label, ...metadata, bytes: Buffer.byteLength(body), sha256: hash(body) });
    const blocked = [401, 403, 429].includes(response.status) || /cf-chl-|<title>\s*(?:Just a moment|Attention Required)/i.test(body);
    record(blocked ? 'BLOCKED' : response.error ? 'NOT VERIFIED' : response.status === 200 ? 'PASS' : 'FAIL', `${label}: HTTP access`, response.error || `HTTP ${response.status}${blocked ? '; access/challenge indication' : ''}`);
    return !response.error && response.status === 200 && !blocked;
  };
  const canonicalUrls = routePaths.map(path => new URL(path, origin).href);
  for (const [agentName, agent] of Object.entries(agents)) {
    let rewrittenContactPages = 0;
    const [robots, sitemap] = await Promise.all([get(new URL('/robots.txt', origin).href, agent), get(new URL('/sitemap.xml', origin).href, agent)]);
    if (inspectResponse(robots, `${agentName} robots`)) {
      record(/text\/plain/i.test(robots.contentType || '') ? 'PASS' : 'FAIL', `${agentName}: robots MIME`, robots.contentType);
      for (const path of ['/', '/services/street-lighting/']) { const result = robotsDecision(robots.body, 'OAI-SearchBot', path); record(result.status, `${agentName}: OAI-SearchBot policy ${path}`, result); }
      record(new RegExp(`^Sitemap:\\s*${origin.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml\\s*$`, 'im').test(robots.body) ? 'PASS' : 'FAIL', `${agentName}: robots sitemap reference`, 'Expected public /sitemap.xml');
    }
    if (inspectResponse(sitemap, `${agentName} sitemap`)) {
      const listed = [...sitemap.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => decode(match[1].trim()));
      record(listed.length === 9 && new Set(listed).size === 9 && canonicalUrls.every(url => listed.includes(url)) ? 'PASS' : 'FAIL', `${agentName}: sitemap canonical set`, listed);
    }
    for (const path of routePaths) {
      const url = new URL(path, origin).href; const response = await get(url, agent); const label = `${agentName} ${path}`;
      if (!inspectResponse(response, label)) continue;
      const html = response.body; const meta = tags(html, 'meta'); const canonicals = tags(html, 'link').filter(tag => tag.rel === 'canonical');
      const directives = [response.robotsHeader || '', ...meta.filter(tag => ['robots', 'oai-searchbot', 'googlebot', 'bingbot'].includes(tag.name?.toLowerCase())).map(tag => tag.content || '')].join(',');
      record(/\b(noindex|none)\b/i.test(directives) ? 'BLOCKED' : 'PASS', `${label}: no explicit indexing block`, directives);
      record(canonicals.length === 1 && canonicals[0].href === url ? 'PASS' : 'FAIL', `${label}: canonical`, canonicals.map(tag => tag.href));
      record(/text\/html/i.test(response.contentType || '') && /<title>[^<]+<\/title>/i.test(html) && (html.match(/<h1\b/gi) || []).length === 1 && meta.some(tag => tag.name === 'description' && tag.content) ? 'PASS' : 'FAIL', `${label}: static metadata and heading`, 'HTML MIME, title, one H1, description');
      try {
        const graphs = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => { const value = JSON.parse(match[1]); return value['@graph'] || [value]; });
        const expected = ['GeneralContractor', 'WebSite', 'WebPage'];
        record(expected.every(type => graphs.some(node => node['@type'] === type)) && graphs.some(node => node['@type'] === 'WebPage' && node.url === url) ? 'PASS' : 'FAIL', `${label}: JSON-LD graph basics`, { types: graphs.map(node => node['@type']), note: 'Syntax and page/entity presence only; not external schema eligibility validation.' });
      } catch { record('FAIL', `${label}: JSON-LD graph basics`, 'Malformed JSON-LD'); }
      if (html.includes('/cdn-cgi/l/email-protection')) rewrittenContactPages++;
      const unknownRoutes = [...new Set(tags(html, 'a').map(tag => tag.href).filter(Boolean).flatMap(href => { try { const link = new URL(href, url); return link.origin === origin.origin && !link.pathname.startsWith('/assets/') && link.pathname !== '/cdn-cgi/l/email-protection' && !routePaths.includes(link.pathname) ? [link.pathname] : []; } catch { return [href]; } }))];
      record(unknownRoutes.length ? 'NOT VERIFIED' : 'PASS', `${label}: internal page targets`, unknownRoutes.length ? unknownRoutes : 'All internal non-asset targets belong to the nine inspected routes; fragment targets not checked here.');
      if (path === '/services/street-lighting/') {
        const facts = ['Conditionally Prequalified', 'A025-6513466', '5,000,000', '20 October 2029', 'road lighting', 'tunnel lighting'];
        record(facts.every(fact => html.toLowerCase().includes(fact.toLowerCase())) ? 'PASS' : 'FAIL', `${label}: documented qualification facts present`, { facts, note: 'Presence check, not certificate authentication or a comprehensive claim review.' });
        const content = primaryContentFacts(html);
        record(content.faqCount === 8 ? 'PASS' : 'FAIL', `${label}: static FAQ presence`, { faqCount: content.faqCount, expected: 8, scope: 'Actual faq-list disclosures with static summary and answer; navigation excluded' });
        record(content.answerWords >= 40 && content.answerWords <= 70 && content.staticCompanyName ? 'PASS' : 'FAIL', `${label}: static direct answer and company`, content);
      }
    }
    if (rewrittenContactPages) record('NOT VERIFIED', `${agentName}: Cloudflare email rewrite`, { pages: rewrittenContactPages, path: '/cdn-cgi/l/email-protection', note: 'Observed edge-injected contact target; contact behavior requires a browser test. Not classified as an unknown content page.' });
  }
  const redirects = [['/index.html', '/'], ['/services/street-lighting', '/services/street-lighting/'], ['/services/street-lighting?audit=discovery', '/services/street-lighting/?audit=discovery'], ['/services/street-lighting/index.html', '/services/street-lighting/'], ['/services/underground-cabling', '/services/underground-cabling/']];
  if (!origin.hostname.startsWith('www.')) redirects.push([`https://www.${origin.hostname}/`, '/']);
  for (const [from, target] of redirects) {
    const response = await get(new URL(from, origin).href, agents.ordinary); const { body, ...metadata } = response; report.responses.push({ label: 'redirect', ...metadata });
    let destination; try { destination = response.location ? new URL(response.location, response.url).href : null; } catch { destination = null; }
    record(response.error ? 'NOT VERIFIED' : [301, 308].includes(response.status) && destination === new URL(target, origin).href ? 'PASS' : 'FAIL', `Canonical redirect ${from}`, { status: response.status, location: response.location, error: response.error, expected: new URL(target, origin).href });
  }
  const manifest = await get('https://openai.com/searchbot.json', agents.ordinary);
  if (inspectResponse(manifest, 'OpenAI published searchbot IP manifest')) {
    try { const data = JSON.parse(manifest.body); record(Array.isArray(data.prefixes) && data.prefixes.length > 0 ? 'PASS' : 'FAIL', 'Published crawler IP manifest available', { creationTime: data.creationTime, prefixCount: data.prefixes?.length, sha256: hash(manifest.body), source: manifest.url, note: 'Fetched for review only; no addresses used or installed as an allowlist.' }); }
    catch { record('FAIL', 'Published crawler IP manifest available', 'Invalid JSON'); }
  }
  for (const item of ['Genuine OpenAI crawler access and WAF/origin access logs', 'Production firewall/CDN configuration', 'Search Console/Bing account ownership and index coverage', 'ChatGPT recommendation or citation inclusion', 'Current RTA portal qualification status']) record('NOT VERIFIED', item, 'Outside unauthenticated local-origin HTTP probing');
  report.finishedAt = new Date().toISOString(); report.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT VERIFIED'].map(status => [status, report.checks.filter(check => check.status === status).length]));
  await mkdir(dirname(resolve(options.output)), { recursive: true }); await writeFile(options.output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Discovery audit: ${JSON.stringify(report.counts)}; report ${options.output}`);
  if (report.counts.FAIL || report.counts.BLOCKED) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
