const assert = require('node:assert/strict');
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
      const data = match ? { parkPulseFormat: 2, rides: [{ id: `test:${match[1]}`, name: 'Test Mountain', isOpen: true, waitTime: 30, lastUpdated: new Date().toISOString(), source: 'test' }] } : {};
      await route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForSelector('[data-dismiss-first-run]', { timeout: 5000 });
    await page.locator('[data-dismiss-first-run]').click();
    await page.waitForFunction(() => !document.querySelector('[data-dismiss-first-run]'));
    for (const name of ['watching', 'settings', 'explore']) {
      await page.locator(`#nav-${name}`).click();
      assert.equal(await page.locator(`#nav-${name}`).getAttribute('aria-current'), 'page');
    }
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
    const cached = await page.evaluate(async () => (await (await caches.open('parkpulse-1.7.1-alert-engine-shell')).keys()).map(r => r.url));
    for (const module of ['app', 'api', 'data', 'store', 'push', 'config']) assert(cached.some(url => url.endsWith(`/assets/js/${module}.js?v=1.7.1`)));
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-explore [data-open-ride]', { timeout: 5000 });
    assert.equal(await page.locator('[data-dismiss-first-run]').count(), 0);
    assert.match(await page.locator('#networkBanner').textContent(), /offline/i);
    assert.deepEqual(errors, []);
    console.log('PASS: startup with hanging health, onboarding, navigation, view jumps, keyboard dialog, expiration preservation, complete cache, offline relaunch');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
