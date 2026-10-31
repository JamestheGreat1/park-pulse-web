const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[], apiParks=[], apiHosts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://parkpulse-api-staging.jamesp5297.workers.dev/**',async route=>{
      const url=new URL(route.request().url());
      apiHosts.push(url.host);
      const park=url.pathname.match(/^\/api\/park\/(\d+)$/);
      if(park){
        const id=Number(park[1]);
        apiParks.push(id);
        const rides={5:['epcot:remy','Remy’s Ratatouille Adventure'],
          6:['mk:space-mountain','Space Mountain'],7:['dhs:rise','Rise of the Resistance'],
          8:['ak:expedition-everest','Expedition Everest'],
          16:['dl:indiana-jones','Indiana Jones Adventure'],
          17:['dca:guardians','Guardians of the Galaxy – Mission: BREAKOUT!']};
        const r=rides[id];
        return route.fulfill({json:{
          parkPulseFormat:2,parkId:id,parkName:'Staging Fixture '+id,
          primaryAvailable:true,fallbackUsed:false,parkHours:null,crowdLevel:null,
          rides:r?[{id:r[0],parkId:id,name:r[1],land:'Test Land',kind:'ride',isOpen:true,
            waitTime:25,source:'themeparks.wiki',lastUpdated:new Date().toISOString()}]:[]
        }});
      }
      if(url.pathname==='/health')return route.fulfill({json:{
        ok:true,staging:true,stagingHistoryOnly:true,pushRegistrationEnabled:false,
        notificationEngine:{ready:false}
      }});
      if(url.pathname==='/api/analytics/status')return route.fulfill({json:{
        ok:true,totalRides:101,baselineRides:8,pendingRides:93,historyStatus:'collecting'
      }});
      return route.fulfill({json:{ok:true}});
    });
    await page.goto('http://127.0.0.1:8768/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-dismiss-first-run]',{timeout:10000});
    await page.locator('[data-dismiss-first-run]').click();
    await page.locator('#nav-resorts').click();
    assert.equal(await page.locator('[data-resort="dlr"]').isDisabled(),false);
    await page.locator('[data-resort="dlr"]').click();
    await page.waitForSelector('#view-explore [data-open-ride]',{timeout:10000});
    assert.equal(await page.locator('#view-explore [data-park]').count(),2);
    assert.equal(await page.locator('#view-explore [data-park="16"]').getAttribute('aria-pressed'),'true');
    await page.locator('#view-explore [data-park="17"]').click();
    await page.waitForSelector('[data-ride-id="dca:guardians"]',{timeout:10000});
    await page.locator('[data-ride-id="dca:guardians"] [data-open-ride]').first().click();
    assert.match(await page.locator('#sheetTitle').textContent(),/Guardians/);
    // Prevent small-screen gear distortion on both glass surfaces.
    await page.setViewportSize({width:320,height:720});
    for(const surface of ['liquid','neutral']){
      const iconCheck=await page.evaluate(surface=>{
        document.documentElement.setAttribute('data-preview-surface',surface);
        const svg=document.querySelector('#nav-settings svg');
        const path=svg.querySelector('path');
        const b=path.getBBox();
        const iconStyle=getComputedStyle(svg);
        const box=svg.getBoundingClientRect();
        return {viewBox:svg.getAttribute('viewBox'),closed:path.getAttribute('d').endsWith('Z'),
          centered:Math.abs(b.x+b.width/2-12)<0.1&&Math.abs(b.y+b.height/2-12)<0.1,
          inBounds:b.x>1&&b.y>1&&b.x+b.width<23&&b.y+b.height<23,
          fill:iconStyle.fill,size:box.width};
      },surface);
      assert.equal(iconCheck.viewBox,'0 0 24 24');
      assert(iconCheck.closed&&iconCheck.centered&&iconCheck.inBounds,JSON.stringify(iconCheck));
      assert.equal(iconCheck.fill,'none');
      assert(iconCheck.size>=17&&iconCheck.size<=22);
    }
    assert(apiParks.includes(16)&&apiParks.includes(17));
    assert(apiHosts.every(host=>host==='parkpulse-api-staging.jamesp5297.workers.dev'));
    assert.deepEqual(errors,[]);
    console.log('PASS: generated staging preview loads, uses staging API, selects DLR and DCA, and opens ride sheets');
    await context.close();
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
