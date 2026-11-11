// Run against a local static server at 127.0.0.1:8765; no production API writes.
const assert = require('node:assert/strict');
const {chromium} = require(require.resolve('playwright', {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));

(async()=>{
  const browser = await chromium.launch({headless:true});
  try{
    const context = await browser.newContext({serviceWorkers:'block'});
    const page = await context.newPage();
    const requests = [],errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('https://parkpulse-api.jamesp5297.workers.dev/**',async route=>{
      const request = route.request();
      const url = new URL(request.url());
      requests.push({method:request.method(),path:url.pathname});
      const park = url.pathname.match(/^\/api\/park\/(\d+)$/);
      if(park) return route.fulfill({json:{
        parkPulseFormat:2,parkId:Number(park[1]),parkHours:null,crowdLevel:null,
        rides:[
          {id:'mk:preview-one',name:'Preview Mountain',land:'Tomorrowland',isOpen:true,
           waitTime:20,operationalStatus:'OPERATING',source:'themeparks.wiki',lastUpdated:new Date().toISOString()},
          {id:'mk:preview-two',name:'Preview Railway',land:'Frontierland',isOpen:true,
           waitTime:30,operationalStatus:'OPERATING',source:'themeparks.wiki',lastUpdated:new Date().toISOString()}
        ]
      }});
      if(url.pathname==='/health')return route.fulfill({json:{ok:true,version:'2.0.1'}});
      return route.fulfill({json:{ok:true}});
    });

    await page.goto('http://127.0.0.1:8765/preview-2-1/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-overview',{timeout:12000});
    await page.waitForSelector('.ride-list .ride-card',{timeout:12000});
    assert.match(await page.title(),/2.1.*Preview/);
    assert.match(await page.locator('.preview-ribbon').innerText(),/DEVELOPMENT PREVIEW/);
    assert.equal(await page.locator('.hero-card').count(),0);
    assert.equal(await page.locator('.dashboard-stat').count(),3);
    assert.match(await page.locator('.dashboard-metrics').innerText(),/25/);
    assert.equal(await page.locator('.dashboard-watches').count(),0);
    await page.locator('#nav-settings').click();
    assert.match(await page.locator('#view-settings').innerText(),/Push alerts are disabled in the preview/);
    await page.locator('#dashboardHoursToggle').check();
    await page.locator('#dashboardWorthToggle').uncheck();
    await page.locator('#nav-explore').click();
    assert.equal(await page.locator('.dashboard-pick').count(),0);
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardWorthToggle').check();
    await page.locator('#nav-explore').click();
    await page.locator('.ride-list .ride-card [data-open-ride]').first().click();
    await page.waitForSelector('#watchForm');
    await page.locator('#watchForm button[type="submit"]').click();
    assert.equal(await page.locator('.dashboard-watches').count(),1);
    assert.equal(await page.evaluate(()=>{
      const state=JSON.parse(localStorage.getItem('parkpulse.preview21.rideWatcher.v1'));
      return !!state?.rules?.length && state.dashboard.showHours === true &&
        localStorage.getItem('parkpulse.rideWatcher.v1') === null;
    }),true);
    assert.equal(requests.some(request=>!['GET','OPTIONS'].includes(request.method)),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: isolated 2.1 hosted preview loads, persists separate settings/watches and sends no production writes');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
