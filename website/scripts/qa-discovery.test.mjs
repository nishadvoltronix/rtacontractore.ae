import assert from 'node:assert/strict';
import { test } from 'node:test';
import { robotsDecision, primaryContentFacts } from './qa-discovery.mjs';

const decision = (policy, path = '/') => robotsDecision(policy, 'OAI-SearchBot', path).status;
test('wildcard allowance and blocking are distinguished', () => {
  assert.equal(decision('User-agent: *\nAllow: /'), 'PASS');
  assert.equal(decision('User-agent: *\nDisallow: /'), 'BLOCKED');
  assert.equal(decision('User-agent: *\nDisallow:'), 'PASS');
});
test('specific groups override wildcard and merge matching groups case-insensitively', () => {
  assert.equal(decision('User-agent: *\nDisallow: /\nUser-agent: oai-searchbot\nAllow: /'), 'PASS');
  assert.equal(decision('User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nDisallow: /'), 'BLOCKED');
  assert.equal(decision('User-agent: OAI-SearchBot\nDisallow: /\nUser-agent: oai-searchbot\nAllow: /public', '/public/test'), 'PASS');
});
test('longest prefix wins and allow wins equal-length ties', () => {
  assert.equal(decision('User-agent: *\nDisallow: /\nAllow: /public\nDisallow: /public/private', '/public/private/a'), 'BLOCKED');
  assert.equal(decision('User-agent: *\nDisallow: /\nAllow: /'), 'PASS');
});
test('comments, multiple agents, BOM and unrelated GPTBot policy are handled', () => {
  assert.equal(decision('\uFEFFUser-agent: Other\nUser-agent: OAI-SearchBot\nAllow: / # public\nUser-agent: GPTBot\nDisallow: /'), 'PASS');
  assert.equal(decision('User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /'), 'PASS');
});
test('unsupported or malformed relevant syntax remains unverified', () => {
  for (const value of ['/*', '/page$', '/%2F', '/café', 'relative']) assert.equal(decision(`User-agent: *\nDisallow: ${value}`), 'NOT VERIFIED');
  assert.equal(decision('Disallow: /'), 'NOT VERIFIED');
  assert.equal(decision('<html>error</html>'), 'NOT VERIFIED');
  assert.equal(decision(''), 'NOT VERIFIED');
  assert.equal(decision('User-agent:\nDisallow: /'), 'NOT VERIFIED');
  assert.equal(decision('User-agent: OAI-SearchBot/1.4\nDisallow: /'), 'NOT VERIFIED');
  assert.equal(decision('User-agent: GPTBot\nDisallow: /*\nUser-agent: *\nAllow: /'), 'PASS');
});
test('primary content checks exclude navigation disclosures and JSON-LD-only company names', () => {
  const disclosure = '<details><summary>Question?</summary><p>Answer.</p></details>';
  const html = `<nav>${disclosure}</nav><script type="application/ld+json">{"name":"Voltronix Contracting LLC"}</script><p class="service-answer">${'word '.repeat(56)}</p><div class="faq-list">${disclosure.repeat(8)}</div>`;
  assert.deepEqual(primaryContentFacts(html), { answerWords: 56, faqCount: 8, staticCompanyName: false });
  assert.deepEqual(primaryContentFacts(html + '<p>Voltronix Contracting LLC</p>'), { answerWords: 56, faqCount: 8, staticCompanyName: true });
  assert.equal(primaryContentFacts(disclosure.repeat(8)).faqCount, 0);
});
