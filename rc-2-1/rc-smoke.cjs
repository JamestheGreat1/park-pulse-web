// RC1 hosted test: no live backend writes, no installation on the real user's device.
const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    const page=await ctx.newPage();
    const errors=[], backendRequests=[];
    page.on('pageerror',e=>errors.push(String(e.message)));
    const stableState=JSON.stringify({selectedParkId:6,selectedResortId:'wdw',
      favorites:['mk:production-only'],
      rules:[{rideId:'mk:production-only',parkId:6,rideName:'Production Watch',reopen:true}]});
    await page.addInitScript(({stableState})=>{
      // Simulates existing production watch data on the same origin.
      localStorage.setItem('parkpulse.rideWatcher.v1',stableState);
      localStorage.setItem('parkpulse.lastGoodRides.v1','{"parks":[]}');
    },{stableState});
    await page.route('https://parkpulse-api.jamesp5297.workers.dev/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      backendRequests.push({method:request.method(),path:url.pathname});
      const park=url.pathname.match(/^\/api\/park\/(\d+)$/);
      if(park)return route.fulfill({json:{parkPulseFormat:2,parkId:Number(park[1]),
        rides:[{id:'mk:rc-test',name:'RC Test Mountain',land:'Tomorrowland',isOpen:true,
          operationalStatus:'OPERATING',waitTime:25,lastUpdated:new Date().toISOString(),
          source:'themeparks.wiki',sourceMissing:false,sourceStale:false}],
        parkHours:null,crowdLevel:null}});
      if(url.pathname==='/health')return route.fulfill({json:{ok:true,version:'2.0.1'}});
      if(url.pathname==='/api/analytics/status')return route.fulfill({json:{ok:true,baselineRides:20,totalRides:101}});
      return route.fulfill({json:{ok:true}});
    });
    const BASE='http://127.0.0.1:8765/rc-2-1/';
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-overview',{timeout:15000});
    await page.waitForSelector('.ride-list .ride-card',{timeout:15000});
    assert.match(await page.title(),/RC1/);
    assert.match(await page.locator('.rc-ribbon').innerText(),/2.1 RC1 TEST/);
    assert.equal(await page.locator('.dashboard-watches').count(),0,
      'Existing production watches must not appear in the separate RC app');
    assert.equal(await page.locator('.dashboard-stat').count(),3);
    assert.match(await page.locator('link[rel="manifest"]').getAttribute('href'),/manifest.webmanifest\?v=2\.1\.0-rc\.1/);

    await page.waitForFunction(async()=>{
      const scope=new URL('./',location.href).href;
      const reg=await navigator.serviceWorker.getRegistration(scope);
      return reg?.scope===scope&&Boolean(reg.active) &&
        navigator.serviceWorker.controller?.scriptURL.includes('/rc-2-1/service-worker.js');
    },{timeout:18000});
    const sw=await page.evaluate(async()=>{
      const result=await import('./assets/js/push.js?v=2.1.0-rc.1');
      const registration=await result.registration();
      return {scope:registration?.scope,controller:navigator.serviceWorker.controller?.scriptURL,
        cacheNames:await caches.keys()};
    });
    assert.equal(sw.scope,BASE);
    assert(sw.controller?.includes('/rc-2-1/service-worker.js'));
    assert(sw.cacheNames.includes('parkpulserc-2.1.0-rc.1'),
      'RC must cache under its own prefix, not the stable app cache');

    await page.locator('.ride-list .ride-card [data-open-ride]').first().click();
    await page.locator('#watchForm').waitFor({state:'visible'});
    await page.locator('#watchForm button[type="submit"]').click();
    await page.waitForSelector('.dashboard-watches');
    const state=await page.evaluate(()=>({
      rc:JSON.parse(localStorage.getItem('parkpulse.rc21.rideWatcher.v1')||'null'),
      stable:localStorage.getItem('parkpulse.rideWatcher.v1'),
      prodCache:localStorage.getItem('parkpulse.lastGoodRides.v1')
    }));
    assert(state.rc?.rules?.some(r=>r.rideId==='mk:rc-test'));
    assert.equal(state.stable,stableState,'RC must not overwrite stable watches');
    assert.equal(state.prodCache,'{"parks":[]}');
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardDensitySelect').selectOption('comfortable');
    await page.locator('#nav-explore').click();
    await page.waitForSelector('.dashboard-overview');
    assert.equal(await page.locator('.dashboard-compact').count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('parkpulse.rc21.rideWatcher.v1')).dashboard.density),'comfortable');
    assert(backendRequests.every(r=>['GET','OPTIONS'].includes(r.method)),
      'No backend push/watch writes should occur unless the tester deliberately enables notifications');

    await ctx.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-overview',{timeout:15000});
    assert.equal(await page.locator('.dashboard-watches').count(),1);
    assert.equal(await page.locator('.dashboard-compact').count(),0);
    await ctx.setOffline(false);
    assert.deepEqual(errors,[],'No page JavaScript exceptions');
    console.log('PASS: RC1 standalone scope, offline cache, UI, watch isolation, and no backend writes');
    await ctx.close();
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
