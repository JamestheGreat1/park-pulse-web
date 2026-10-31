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
    assert.equal(await page.locator('#nav-resorts').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('#view-resorts').isVisible(),true);
    assert.equal(await page.locator('#view-explore').isVisible(),false);
    assert.equal(await page.locator('[data-resort="dlr"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-resort="wdw"]').getAttribute('aria-pressed'),'false');
    assert.match(await page.locator('[data-resort="dlr"]').innerText(),/Selected/);
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#nav-resorts').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('[data-resort="dlr"]').getAttribute('aria-pressed'),'true');
    await page.locator('#nav-explore').click();
    await page.waitForSelector('#view-explore [data-open-ride]',{timeout:10000});
    assert.equal(await page.locator('#view-explore [data-park]').count(),2);
    assert.equal(await page.locator('#view-explore [data-park="16"]').getAttribute('aria-pressed'),'true');
    await page.locator('#view-explore [data-park="17"]').click();
    await page.waitForSelector('[data-ride-id="dca:guardians"]',{timeout:10000});
    await page.locator('[data-ride-id="dca:guardians"] [data-open-ride]').first().click();
    assert.match(await page.locator('#sheetTitle').textContent(),/Guardians/);
    await page.locator('[data-close-sheet]').click();
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
    // Every Liquid tab must fit INSIDE the same dock, in one row, including
    // the active fourth tab at small phone width and the desktop layout.
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:800});
      await page.locator('#nav-settings').click();
      const rects = await page.evaluate(()=>{
        document.documentElement.setAttribute('data-preview-surface','liquid');
        const nav=document.querySelector('.bottom-nav').getBoundingClientRect();
        const items=[...document.querySelectorAll('.bottom-nav .nav-item')]
          .map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height}});
        return {nav:{x:nav.x,right:nav.right,y:nav.y,bottom:nav.bottom},items,
          grid:getComputedStyle(document.querySelector('.bottom-nav')).gridTemplateColumns};
      });
      assert.equal(rects.items.length,4);
      assert(rects.items.every(r=>r.width>=40&&r.x>=rects.nav.x-1&&r.right<=rects.nav.right+1),
        'All four tab slots must fit inside Liquid dock at '+width+': '+JSON.stringify(rects));
      assert(rects.items.every(r=>r.y>=rects.nav.y-1&&r.bottom<=rects.nav.bottom+1),
        'No Liquid tab can wrap outside dock at '+width+': '+JSON.stringify(rects));
      assert(rects.items.every((r,i)=>i===0||
        (Math.abs(r.y-rects.items[0].y)<2&&rects.items[i-1].right<=r.x+1)),
        'Liquid dock items must share one row at '+width+': '+JSON.stringify(rects));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#nav-resorts').click();
    const selectedStyle = await page.evaluate(()=>{
      const selected=document.querySelector('[data-resort="dlr"]');
      const other=document.querySelector('[data-resort="wdw"]');
      return {selectedBorder:getComputedStyle(selected).borderTopColor,
        otherBorder:getComputedStyle(other).borderTopColor,
        selectedMark:getComputedStyle(selected,'::after').width,
        selectedBadge:getComputedStyle(selected.querySelector('.resort-card-status')).backgroundColor};
    });
    assert.notEqual(selectedStyle.selectedBorder,selectedStyle.otherBorder);
    assert.equal(selectedStyle.selectedMark,'4px');
    assert.notEqual(selectedStyle.selectedBadge,'rgba(0, 0, 0, 0)');
    assert(apiParks.includes(16)&&apiParks.includes(17));
    // Default preview must keep its push controls intentionally disabled.
    const previewPush = await page.evaluate(async()=>{
      const mod=await import('/assets/js/push.js?v='+
        document.querySelector('script[type="module"]')?.src?.split('?v=')[1]?.split('&')[0]);
      return mod.pushSupported();
    }).catch(()=>null);
    assert.notEqual(previewPush,true);

    assert(apiHosts.every(host=>host==='parkpulse-api-staging.jamesp5297.workers.dev'));
    assert.deepEqual(errors,[]);
    console.log('PASS: generated staging preview loads, uses staging API, selects DLR and DCA, and opens ride sheets');
    await context.close();
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
