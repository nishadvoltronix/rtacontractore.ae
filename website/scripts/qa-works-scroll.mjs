import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts/works-scroll');
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const expectedNames = ['Road Maintenance', 'Road Works', 'Earth Works', 'Footpath Works', 'Signboards', 'Infrastructure Works', 'Hardscape & Softscape', 'Bollards & Fencing'];
const results = [];
const errors = [];
const scriptDisabledPages = new WeakSet();
let browser;

function check(condition, name, details) {
  results.push({ status: condition ? 'pass' : 'fail', name, ...(details ? { details } : {}) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${!condition && details ? `: ${JSON.stringify(details)}` : ''}`);
}

async function settled(page) {
  if (scriptDisabledPages.has(page)) { await page.waitForTimeout(100); return; }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function scroll(page, top) {
  await page.evaluate(value => scrollTo({ top: value, behavior: 'instant' }), top);
  await settled(page);
}

async function leaveAboveSection(page) {
  const state = await inspect(page);
  await scroll(page, Math.max(0, state.y + state.section.top - state.height - 4));
}

function sameOpacities(before, after) {
  return after.cards.every((card, index) => Math.abs(card.opacity - before.cards[index].opacity) < 0.002);
}

async function inspect(page) {
  return page.evaluate(() => {
    const section = document.querySelector('#rta-works');
    const header = document.querySelector('.hero-header');
    const title = section.querySelector('h2');
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const appearance = element => {
      let opacity = 1;
      let visible = true;
      for (let node = element; node && node !== section.parentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        visible &&= style.visibility !== 'hidden' && style.display !== 'none';
      }
      return { opacity, visible: visible && opacity >= 0.98 };
    };
    return {
      y: scrollY, height: innerHeight, width: innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      header: rect(header), section: rect(section), title: { ...rect(title), size: parseFloat(getComputedStyle(title).fontSize), ...appearance(title) },
      pinned: section.classList.contains('is-pinned'), flow: section.classList.contains('is-flow'),
      stage: rect(section.querySelector('.rta-works-stage') || section),
      cards: [...section.querySelectorAll('.rta-work-card')].map(card => ({
        ...rect(card), ...appearance(card), name: card.textContent.trim(), href: card.getAttribute('href'),
        loaded: [...card.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
      })),
      active: document.activeElement?.classList.contains('rta-work-card') ? [...section.querySelectorAll('.rta-work-card')].indexOf(document.activeElement) : -1,
    };
  });
}

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  if (options.javaScriptEnabled === false) scriptDisabledPages.add(page);
  page.on('pageerror', error => errors.push(String(error)));
  const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
  check(response?.status() === 200, `${viewport.width}: homepage loads`);
  if (!scriptDisabledPages.has(page)) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = [...document.querySelectorAll('#rta-works img')];
      images.forEach(img => { img.loading = 'eager'; });
      await Promise.all(images.map(img => img.decode().catch(() => {})));
    });
  }
  await settled(page);
  return { context, page };
}

async function desktopSequence() {
  const { context, page } = await open({ width: 1440, height: 900 });
  let state = await inspect(page);
  check(state.cards.map(card => card.name).join('|') === expectedNames.join('|'), 'Eight requested services retain their exact order');
  check(state.cards.every(card => card.href === '#contact' && card.loaded), 'All service links and real photographs load');
  check(state.pinned, 'Desktop uses the pinned presentation');
  const start = state.y + state.section.top - state.header.bottom;
  const end = state.y + state.section.bottom - state.height;
  check(end > start + state.height, 'Desktop allocates scroll space for the title and sequential reveal');
  await scroll(page, start);
  state = await inspect(page);
  check(state.cards.every(card => card.opacity < 0.02), 'At entry the large title appears before all service cards');
  check(state.title.visible && state.title.height > 65, 'Intro heading is visibly oversized');
  check(state.title.top >= state.header.bottom - 2 && state.title.bottom <= state.height, 'Intro heading fits below the fixed navigation');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(artifacts, 'intro-1440.png') });
  const titleAtStart = state.title;
  const counts = [];
  const positions = [];
  let visibleCardsInOrder = true;
  let stageRemainsPinned = true;
  let partialRevealY;
  for (let sample = 0; sample <= 120; sample++) {
    await scroll(page, start + (end - start) * sample / 120);
    state = await inspect(page);
    const count = state.cards.filter(card => card.visible).length;
    counts.push(count);
    positions.push({ y: state.y, count });
    if (partialRevealY === undefined && count >= 2 && count < 6 && state.cards.some(card => card.opacity > 0.05 && card.opacity < 0.95)) partialRevealY = state.y;
    visibleCardsInOrder &&= state.cards.every((card, index) => !card.visible || state.cards.slice(0, index).every(previous => previous.visible));
    stageRemainsPinned &&= Math.abs(state.stage.top - state.header.bottom) <= 3;
    if (sample === 60) await page.screenshot({ path: path.join(artifacts, 'mid-reveal-1440.png') });
  }
  check([...new Set(counts)].join(',') === '0,1,2,3,4,5,6,7,8', 'Scrolling reveals every card one at a time from zero through eight', [...new Set(counts)]);
  check(counts.every((count, index) => index === 0 || count >= counts[index - 1]), 'Previously revealed cards remain visible while scrolling forward');
  check(visibleCardsInOrder, 'Cards reveal in the requested reading order');
  check(stageRemainsPinned, 'The stage remains beneath the navigation throughout the sequence');
  check(state.cards.every(card => card.visible && card.top >= state.header.bottom && card.bottom <= state.height + 1), 'Completed grid fits entirely in the desktop viewport');
  check(state.title.height < titleAtStart.height && state.title.top < titleAtStart.top, 'The large title settles into a smaller heading above the grid');
  check(!state.overflow, 'Desktop sequence has no horizontal overflow');
  await page.screenshot({ path: path.join(artifacts, 'completed-1440.png') });
  const completedTitle = state.title;
  const reverseCounts = [];
  let headingStaysSettled = true;
  for (let sample = 60; sample >= 0; sample--) {
    await scroll(page, start + (end - start) * sample / 60);
    state = await inspect(page);
    reverseCounts.push(state.cards.filter(card => card.visible).length);
    headingStaysSettled &&= Math.abs(state.title.size - completedTitle.size) < 1 && Math.abs(state.title.top - completedTitle.top) < 2;
  }
  check(reverseCounts.every(count => count === 8), 'Upward scrolling keeps every completed service card visible', reverseCounts.filter((n, i) => !i || n !== reverseCounts[i - 1]));
  check(headingStaysSettled, 'Upward scrolling keeps the heading settled above the completed grid');
  await scroll(page, state.y + state.section.top - state.height + 4);
  state = await inspect(page);
  check(state.section.top < state.height && state.cards.every(card => card.visible), 'Cards stay revealed while any part of the section remains in view');
  await leaveAboveSection(page);
  state = await inspect(page);
  check(state.section.top >= state.height && state.cards.every(card => card.opacity < 0.02), 'Leaving fully above the section rearms the next downward reveal offscreen');
  await scroll(page, start);
  state = await inspect(page);
  check(state.cards.every(card => card.opacity < 0.02) && Math.abs(state.title.size - titleAtStart.size) < 1, 'A new downward entry starts again with the large title alone');
  const replayCounts = [];
  for (let sample = 0; sample <= 60; sample++) {
    await scroll(page, start + (end - start) * sample / 60);
    state = await inspect(page);
    replayCounts.push(state.cards.filter(card => card.visible).length);
  }
  check([...new Set(replayCounts)].join(',') === '0,1,2,3,4,5,6,7,8' && replayCounts.every((count, index) => !index || count >= replayCounts[index - 1]), 'A second downward pass repeats the complete one-by-one reveal', [...new Set(replayCounts)]);
  await leaveAboveSection(page);
  await scroll(page, partialRevealY ?? start + (end - start) / 2);
  const partial = await inspect(page);
  check(partial.cards.some(card => card.opacity > 0.05 && card.opacity < 0.95) && partial.cards.some(card => card.visible), 'Partial-pass review includes both a revealed card and an unfinished fade');
  await scroll(page, start);
  state = await inspect(page);
  check(sameOpacities(partial, state), 'Reversing midway preserves every card at its reached reveal progress');
  await scroll(page, start + (partial.y - start) / 2);
  state = await inspect(page);
  check(sameOpacities(partial, state), 'Scrolling down again inside the same pass does not reset or replay revealed cards');
  await scroll(page, end);
  state = await inspect(page);
  check(state.cards.every(card => card.visible), 'Continuing beyond the previous position finishes the remaining cards');
  await scroll(page, start);
  const skip = page.locator('#rta-works a[href="#services"]');
  check(await skip.count() === 1, 'A visible link lets visitors skip the scroll presentation');
  if (await skip.count() === 1) {
    await skip.click();
    await page.waitForTimeout(1100);
    const destination = await page.evaluate(() => ({ top: document.querySelector('#services').getBoundingClientRect().top, header: document.querySelector('.header').getBoundingClientRect().bottom, hash: location.hash }));
    check(destination.hash === '#services' && destination.top >= destination.header - 2 && destination.top <= destination.header + 50, 'Skip reaches Our Expertise below the header', destination);
  }
  await leaveAboveSection(page);
  await scroll(page, start);
  state = await inspect(page);
  check(state.cards.every(card => card.opacity < 0.02), 'Keyboard review starts with the service cards hidden on a fresh pass');
  await page.locator('.rta-work-card').first().focus();
  await settled(page);
  for (let index = 0; index < 8; index++) {
    if (index > 0) { await page.keyboard.press('Tab'); await settled(page); }
    state = await inspect(page);
    const card = state.cards[index];
    check(state.active === index && card.visible && card.top >= state.header.bottom - 2 && card.bottom <= state.height + 2, `Keyboard focus exposes service ${index + 1} below the navigation`, { active: state.active, card, header: state.header.bottom });
  }
  await page.keyboard.press('Shift+Tab');
  await settled(page);
  state = await inspect(page);
  check(state.active === 6 && state.cards[6].visible, 'Reverse keyboard navigation keeps the service visible');
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page);
  state = await inspect(page);
  check(!state.pinned && !state.overflow, 'Resizing to mobile releases the oversized pinned grid');
  check(state.cards.every(card => card.visible), 'Resizing preserves all cards revealed during the current pass');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settled(page);
  state = await inspect(page);
  check(!state.pinned && state.cards.every(card => card.visible), 'Changing reduced-motion preference restores all service content');
  await writeFile(path.join(artifacts, 'sequence-positions.json'), JSON.stringify(positions, null, 2));
  await context.close();
}

async function fastReturn() {
  const { context, page } = await open({ width: 1440, height: 900 });
  let state = await inspect(page);
  const expandedHeight = state.section.height;
  const start = state.y + state.section.top - state.header.bottom;
  const end = state.y + state.section.bottom - state.height;
  await page.mouse.move(720, 450);
  const wheel = async delta => {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(160);
    await settled(page);
    return inspect(page);
  };

  await scroll(page, end);
  const complete = await inspect(page);
  state = await wheel(-120);
  check(expandedHeight - state.section.height > state.height, 'An upward wheel gesture removes the completed sticky scroll distance');
  check(sameOpacities(complete, state) && state.cards.every(card => card.visible), 'Fast upward return preserves all completed cards');
  check(Math.abs(state.stage.top - complete.stage.top) < 3, 'Compacting the timeline keeps the visible grid in the same position');
  state = await wheel(-300);
  check(state.stage.top > state.header.bottom + 250 && state.cards.every(card => card.visible), 'The next short upward gesture immediately carries the section toward the bottom of the viewport');
  await leaveAboveSection(page);
  state = await inspect(page);
  check(Math.abs(state.section.height - expandedHeight) < 3 && state.cards.every(card => card.opacity < 0.02), 'Returning fully above the compact section restores its original reveal distance offscreen');

  await scroll(page, start + (end - start) * .5);
  const partial = await inspect(page);
  check(partial.cards.some(card => card.visible) && partial.cards.some(card => card.opacity < .02), 'Fast partial return starts with both revealed and unrevealed cards');
  state = await wheel(-120);
  check(expandedHeight - state.section.height > state.height * .5 && state.section.height > state.height, 'A partial upward return removes only the traversed part of the timeline');
  check(sameOpacities(partial, state) && Math.abs(state.stage.top - partial.stage.top) < 3, 'Partial compaction retains card progress without a visible position jump');
  state = await wheel(-180);
  check(state.stage.top > state.header.bottom + 150 && sameOpacities(partial, state), 'A partial presentation also leaves its sticky position promptly when scrolling upward');
  state = await wheel(180);
  check(sameOpacities(partial, state), 'Changing back to downward scrolling does not hide or restart the retained cards');
  await scroll(page, state.y + state.section.bottom - state.height);
  state = await inspect(page);
  check(state.cards.every(card => card.visible), 'Downward scrolling through the remaining timeline finishes every unrevealed card');
  await leaveAboveSection(page);
  await scroll(page, start);
  state = await inspect(page);
  check(Math.abs(state.section.height - expandedHeight) < 3 && state.cards.every(card => card.opacity < .02), 'A fresh pass after partial compaction again starts with the title alone');

  await scroll(page, end + state.height * 1.4);
  const below = await inspect(page);
  const nextBefore = await page.locator('#services').evaluate(element => element.getBoundingClientRect().top);
  state = await wheel(-120);
  const nextAfter = await page.locator('#services').evaluate(element => element.getBoundingClientRect().top);
  const removedHeight = below.section.height - state.section.height;
  check(removedHeight > state.height && Math.abs((below.y - state.y) - removedHeight - 120) < 4, 'Upward scrolling from later sections removes the spacer with matching scroll compensation');
  check(Math.abs(nextAfter - nextBefore - 120) < 4, 'Content below the presentation moves only by the requested upward scroll distance');
  await page.locator('.footer a[href="#top"]').click();
  await page.waitForFunction(() => scrollY < 2, undefined, { timeout: 5000 });
  await settled(page);
  state = await inspect(page);
  check(state.y < 2 && await page.evaluate(() => location.hash === '#top'), 'Back to top still completes native anchor navigation after timeline compaction');
  check(Math.abs(state.section.height - expandedHeight) < 3 && state.cards.every(card => card.opacity < .02), 'Back to top rearms the next downward presentation');
  await context.close();
}

async function flowAndFallbacks() {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1440, height: 550 }]) {
    const { context, page } = await open(viewport);
    let state = await inspect(page);
    check(!state.overflow, `${viewport.width}x${viewport.height}: no horizontal overflow`);
    const start = state.y + state.section.top - state.header.bottom;
    const end = state.y + state.section.bottom - state.header.bottom;
    const seen = new Set();
    let readingOrder = true;
    for (let top = start; top <= end; top += viewport.height / 8) {
      await scroll(page, top);
      state = await inspect(page);
      state.cards.forEach((card, index) => { if (card.visible && card.bottom > state.header.bottom && card.top < viewport.height) seen.add(index); });
      readingOrder &&= state.cards.every((card, index) => !card.visible || state.cards.slice(0, index).every(previous => previous.visible));
    }
    check(seen.size === 8, `${viewport.width}x${viewport.height}: all eight services can be seen by normal scrolling`, [...seen]);
    check(readingOrder, `${viewport.width}x${viewport.height}: service reveals follow reading order`);
    check(state.cards.every(card => card.loaded), `${viewport.width}x${viewport.height}: photographs remain loaded`);
    if (viewport.height <= 550) check(!state.pinned && state.cards.every(card => card.visible), 'Short landscape viewport uses the complete static grid');
    if (viewport.width === 390) {
      let mobileReverseVisible = true;
      for (let top = end; top >= start; top -= viewport.height / 3) {
        await scroll(page, top);
        state = await inspect(page);
        mobileReverseVisible &&= state.cards.every(card => card.visible);
      }
      await scroll(page, start);
      state = await inspect(page);
      check(state.flow && mobileReverseVisible && state.cards.every(card => card.visible), 'Mobile upward scrolling keeps the completed cards visible');
      await leaveAboveSection(page);
      state = await inspect(page);
      check(state.section.top >= state.height && state.cards.every(card => card.opacity < 0.02), 'Mobile reveal rearms only after returning completely above the section');
      const replaySeen = new Set();
      let mobileReplayOrdered = true;
      for (let top = start; top <= end; top += viewport.height / 8) {
        await scroll(page, top);
        state = await inspect(page);
        state.cards.forEach((card, index) => { if (card.visible && card.bottom > state.header.bottom && card.top < viewport.height) replaySeen.add(index); });
        mobileReplayOrdered &&= state.cards.every((card, index) => !card.visible || state.cards.slice(0, index).every(previous => previous.visible));
      }
      check(replaySeen.size === 8 && mobileReplayOrdered, 'Mobile downward reentry repeats the reveal in reading order');
      await leaveAboveSection(page);
      await scroll(page, start);
      await page.locator('.rta-work-card').nth(3).focus();
      await settled(page);
      state = await inspect(page);
      check(state.cards[3].visible && state.cards[3].top >= state.header.bottom - 2 && state.cards[3].bottom <= state.height + 2, 'Mobile keyboard focus reveals its service and scrolls it into view');
      await page.screenshot({ path: path.join(artifacts, 'mobile-390.png') });
    }
    await context.close();
  }
  for (const options of [{ reducedMotion: 'reduce' }, { javaScriptEnabled: false }]) {
    const name = options.javaScriptEnabled === false ? 'No JavaScript' : 'Reduced motion';
    const { context, page } = await open({ width: 1440, height: 900 }, options);
    let state = await inspect(page);
    await scroll(page, state.y + state.section.top - state.header.bottom);
    state = await inspect(page);
    check(!state.pinned && state.cards.every(card => card.visible), `${name}: all service content is visible without a pinned sequence`);
    check(!state.overflow && state.section.height < state.height * 1.5, `${name}: no empty animation scroll space remains`);
    await page.screenshot({ path: path.join(artifacts, options.javaScriptEnabled === false ? 'no-js-1440.png' : 'reduced-motion-1440.png') });
    await context.close();
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true });
  await desktopSequence();
  await fastReturn();
  await flowAndFallbacks();
  check(errors.length === 0, 'No browser JavaScript errors', errors);
} catch (error) {
  check(false, 'Focused scroll review completed', String(error?.stack || error));
} finally {
  await browser?.close();
  await writeFile(path.join(artifacts, 'qa-report.json'), JSON.stringify({ results, errors }, null, 2));
  const failed = results.filter(result => result.status === 'fail');
  console.log(`\n${results.length - failed.length} passed; ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}
