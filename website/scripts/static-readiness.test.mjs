import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { headMetadataIssues, mediaAssetReferences, crawlerPolicyResults } from './static-readiness.mjs';

const home = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const addToHead = markup => home.replace('</head>', `${markup}</head>`);

test('current generated head is unambiguous', () => {
  assert.deepEqual(headMetadataIssues(home), []);
});

test('a valid first canonical cannot hide a conflicting second canonical', () => {
  assert.ok(headMetadataIssues(addToHead('<link rel="canonical" href="https://wrong.example/">')).some(issue => issue.includes('canonical link; found 2')));
});

test('duplicate titles, descriptions, robots and social metadata are rejected', () => {
  for (const markup of ['<title>Another title</title>', '<meta name="description" content="Another description">', '<meta name="robots" content="noindex">', '<meta property="og:url" content="https://wrong.example/">', '<meta name="twitter:image" content="/missing.webp">']) {
    assert.ok(headMetadataIssues(addToHead(markup)).length > 0, markup);
  }
});

test('crawler-specific noindex is rejected while the dedicated 404 may be noindex', async () => {
  for (const name of ['Googlebot', 'BINGBOT']) assert.ok(headMetadataIssues(addToHead(`<meta name="${name}" content="NOINDEX,follow">`)).some(issue => issue.includes('prevents indexing')));
  const missing = await readFile(new URL('../dist/404.html', import.meta.url), 'utf8');
  assert.deepEqual(headMetadataIssues(missing, { indexable: false }), []);
  assert.ok(headMetadataIssues(missing).some(issue => issue.includes('prevents indexing')));
});

test('commented-out metadata does not count as a second live tag', () => {
  assert.deepEqual(headMetadataIssues(addToHead('<!-- <meta name="robots" content="noindex"><link rel="canonical" href="/old/"> -->')), []);
});

test('lazy video, poster, source and density images all become asset references', () => {
  const media = mediaAssetReferences('<video data-src="/clip.mp4?x=1&amp;y=2" poster="/poster.webp"><source src="/clip.webm"></video><picture><source srcset="/one.avif 1x, /two.avif 2x"></picture><img data-src="/lazy.webp" data-srcset="/small.webp 640w, /large.webp 1280w">');
  assert.deepEqual(media.issues, []);
  assert.deepEqual(media.references.map(item => item.url).sort(), ['/clip.mp4?x=1&y=2', '/clip.webm', '/poster.webp', '/one.avif', '/two.avif', '/lazy.webp', '/small.webp', '/large.webp'].sort());
});

test('invalid, duplicate and mixed source candidates fail validation', () => {
  for (const srcset of ['/a.webp 0w', '/a.webp 1.5w', '/a.webp 2q', '/a.webp 1x, /b.webp 1x', '/a.webp 640w, /b.webp 2x']) assert.ok(mediaAssetReferences(`<source srcset="${srcset}">`).issues.length > 0, srcset);
});

test('search crawler policy checks detect a specific service block', () => {
  const results = crawlerPolicyResults('User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nDisallow: /services/', ['/', '/services/street-lighting/']);
  assert.equal(results.find(item => item.agent === 'OAI-SearchBot' && item.path.startsWith('/services/')).status, 'BLOCKED');
  assert.equal(results.filter(item => item.agent !== 'OAI-SearchBot').every(item => item.status === 'PASS'), true);
});

test('unsupported crawler policy cannot silently pass local readiness', () => {
  assert.equal(crawlerPolicyResults('User-agent: *\nDisallow: /services/*', ['/services/street-lighting/']).every(item => item.status === 'NOT VERIFIED'), true);
});
