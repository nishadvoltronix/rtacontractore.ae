import { robotsDecision } from './qa-discovery.mjs';

const uncomment = html => html.replace(/<!--[\s\S]*?-->/g, '');
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));

// A matching first tag must not hide a later contradictory canonical or noindex.
// These checks supplement the existing content/URL comparisons in check.mjs.
export function headMetadataIssues(html, { indexable = true } = {}) {
  const heads = [...uncomment(html).matchAll(/<head\b[^>]*>([\s\S]*?)<\/head>/gi)];
  if (heads.length !== 1) return ['Expected exactly one complete HTML head.'];
  const head = heads[0][1];
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  const issues = [];
  const exactlyOne = (count, label) => { if (count !== 1) issues.push(`Expected exactly one ${label}; found ${count}.`); };
  exactlyOne([...head.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)].length, 'title');
  exactlyOne(links.filter(item => item.rel?.toLowerCase().split(/\s+/).includes('canonical')).length, 'canonical link');
  for (const name of ['description', 'robots', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    exactlyOne(meta.filter(item => item.name?.toLowerCase() === name).length, `${name} meta tag`);
  }
  for (const property of ['og:type', 'og:locale', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image']) {
    exactlyOne(meta.filter(item => item.property?.toLowerCase() === property).length, `${property} meta tag`);
  }
  if (indexable) {
    for (const item of meta.filter(item => ['robots', 'googlebot', 'bingbot'].includes(item.name?.toLowerCase()))) {
      if (/(?:^|[\s,;])(?:noindex|none)(?:$|[\s,;])/i.test(item.content || '')) issues.push(`${item.name} explicitly prevents indexing.`);
    }
  }
  return issues;
}

// Include lazy media and picture/video source elements, which are easy to omit
// when an asset checker only scans ordinary img/src and link/href attributes.
export function mediaAssetReferences(html) {
  const references = [];
  const issues = [];
  for (const match of uncomment(html).matchAll(/<(img|video|audio|source)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    for (const attribute of ['src', 'poster', 'data-src', 'data-poster']) {
      if (attrs[attribute]) references.push({ tag, attribute, url: attrs[attribute] });
    }
    for (const attribute of ['srcset', 'data-srcset']) {
      if (!attrs[attribute]) continue;
      const candidates = attrs[attribute].split(',').map(item => item.trim().match(/^(\S+)(?:\s+((?:\d+(?:\.\d+)?|\.\d+)[wx]))?$/));
      if (candidates.some(item => !item)) issues.push(`${tag} ${attribute} contains an invalid image candidate.`);
      const descriptors = [];
      for (const candidate of candidates.filter(Boolean)) {
        references.push({ tag, attribute, url: candidate[1] });
        const descriptor = candidate[2] || '1x';
        descriptors.push(descriptor);
        if (!(parseFloat(descriptor) > 0) || (descriptor.endsWith('w') && !/^\d+w$/.test(descriptor))) issues.push(`${tag} ${attribute} contains a non-positive or non-integer width descriptor.`);
      }
      if (new Set(descriptors).size !== descriptors.length) issues.push(`${tag} ${attribute} contains duplicate descriptors.`);
      if (new Set(descriptors.map(item => item.at(-1))).size > 1) issues.push(`${tag} ${attribute} mixes width and density descriptors.`);
    }
  }
  return { references, issues };
}

// The existing parser deliberately fails closed for unsupported REP syntax.
// This verifies the local policy only, not a live crawler or CDN/WAF response.
export function crawlerPolicyResults(robots, paths) {
  return ['Googlebot', 'Bingbot', 'OAI-SearchBot'].flatMap(agent => paths.map(path => ({
    agent, path, ...robotsDecision(robots, agent, path),
  })));
}
