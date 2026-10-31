const assert = require('node:assert/strict');
const { version } = require('../version.json');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://parkpulse-api.jamesp5297.workers.dev/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/health') return; // Deliberately unresolved: UI must still work.
      const match = url.pathname.match(/\/api\/park\/(\d+)/);
      const data = match ? { parkPulseFormat: 2, rides: [{ id: match[1] === '5' ? 'epcot:test' : `test:${match[1]}`, name: 'Test Mountain', isOpen: true, waitTime: 30, lastUpdated: new Date().toISOString(), source: 'test' }] } : {};
      await route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForSelector('[data-dismiss-first-run]', { timeout: 5000 });
    await page.locator('[data-dismiss-first-run]').click();
    await page.waitForFunction(() => !document.querySelector('[data-dismiss-first-run]'));
    for (const name of ['watching', 'resorts', 'settings', 'explore']) {
      await page.locator(`#nav-${name}`).click();
      assert.equal(await page.locator(`#nav-${name}`).getAttribute('aria-current'), 'page');
    }
    await page.locator('#nav-resorts').click();
    assert.equal(await page.locator('[data-resort="wdw"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-resort="dlr"]').isDisabled(), true);
    assert.match(await page.locator('[data-resort="dlr"]').innerText(), /Coming soon/);
    // The fourth nav item must remain reachable without clipping on a small phone.
    await page.setViewportSize({ width: 320, height: 640 });
    const mobileNav = await page.locator('.bottom-nav .nav-item').evaluateAll(items =>
      items.map(item => {
        const box = item.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      }));
    assert.equal(mobileNav.length, 4);
    assert(mobileNav.every(item => item.width >= 44 && item.left >= 0 && item.right <= 320));
    assert(mobileNav.every((item, index) => index === 0 || mobileNav[index - 1].right <= item.left + 1));
    const resortCard = await page.locator('[data-resort="dlr"]').boundingBox();
    assert(resortCard && resortCard.x >= 0 && resortCard.x + resortCard.width <= 320);
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopNav = await page.locator('.bottom-nav .nav-item').evaluateAll(items =>
      items.map(item => item.getBoundingClientRect().width));
    assert.equal(desktopNav.length, 4);
    assert(desktopNav.every(width => width >= 108));
    await page.locator('[data-resort="wdw"]').click();
    assert.equal(await page.locator('#nav-explore').getAttribute('aria-current'), 'page');
    await page.locator('#view-explore [data-park="5"]').click();
    assert.equal(await page.locator('#view-explore [data-park="5"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('parkpulse.rideWatcher.v1'));
      return state.selectedResortId === 'wdw' && state.selectedParkId === 5 && state.lastParkByResort.wdw === 5;
    }), true);
    await page.locator('[data-view-jump="watching"]').click();
    await page.locator('[data-view-jump="explore"]').click();
    await page.locator('#view-explore [data-open-ride]').first().click();
    await page.keyboard.press('Tab');
    await page.locator('#durationSelect').selectOption('3h');
    await page.locator('#watchForm button[type="submit"]').click();
    const deadline = await page.evaluate(() => JSON.parse(localStorage.getItem('parkpulse.rideWatcher.v1')).rules[0].expiresAt);
    await page.locator('#view-explore [data-open-ride]').first().click();
    assert.equal(await page.locator('#durationSelect').inputValue(), 'keep');
    await page.locator('#thresholdToggle').click();
    await page.locator('#watchForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('parkpulse.rideWatcher.v1')).rules[0].expiresAt), deadline);
    // Match the cache/version emitted by the shipped service worker, not a past release.
    const cacheName = `parkpulse-${version}`;
    assert(await page.evaluate(name => caches.has(name), cacheName), `Missing offline cache: ${cacheName}`);
    const cached = await page.evaluate(async name =>
      (await (await caches.open(name)).keys()).map(request => request.url), cacheName);
    for (const module of ['app', 'api', 'data', 'store', 'push', 'config', 'seasonal']) {
      assert(cached.some(url => url.endsWith(`/assets/js/${module}.js?v=${version}`)),
        `Missing cached module: ${module}`);
    }
    assert(cached.some(url => url.endsWith(`/assets/css/app.css?v=${version}`)),
      'Missing cached stylesheet');
    assert(cached.some(url => url.endsWith('/version.json')), 'Missing cached version manifest');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-explore [data-open-ride]', { timeout: 5000 });
    assert.equal(await page.locator('[data-dismiss-first-run]').count(), 0);
    assert.equal(await page.locator('#view-explore [data-park="5"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#nav-resorts').count(), 1);
    assert.match(await page.locator('#networkBanner').textContent(), /offline/i);
    // Deep link from another WDW park must select its destination before showing
    // the ride, despite the last-saved resort/park and offline cache.
    await context.setOffline(false);
    await page.locator('#view-explore [data-park="6"]').click();
    await page.goto('http://127.0.0.1:8765/?ride=epcot:test', {waitUntil:'domcontentloaded'});
    await page.waitForSelector('#rideSheet:not(.hidden)', {timeout: 10000});
    assert.equal(await page.locator('#view-explore [data-park="5"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#sheetTitle').textContent(), /Test Mountain/);
    assert.deepEqual(errors, []);
    console.log('PASS: startup with hanging health, onboarding, navigation, view jumps, keyboard dialog, expiration preservation, complete cache, offline relaunch');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
