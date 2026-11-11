// Run against a local static server at 127.0.0.1:8765; no production API writes.
const assert = require('node:assert/strict');
const {chromium} = require(require.resolve('playwright', {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));

(async()=>{
  const browser = await chromium.launch({headless:true});
  try{
    const context = await browser.newContext({serviceWorkers:'block'});
    const page = await context.newPage();
    const requests = [],errors = [];
    let closedTestMode = false;
    let trendTestMode = false;
    let trendDirection = null;
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('https://parkpulse-api.jamesp5297.workers.dev/**',async route=>{
      const request = route.request();
      const url = new URL(request.url());
      requests.push({method:request.method(),path:url.pathname});
      const park = url.pathname.match(/^\/api\/park\/(\d+)$/);
      if(park) {
        const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const d = Object.fromEntries(parts.map(p=>[p.type,p.value]));
        const localDate = d.year+'-'+d.month+'-'+d.day;
        return route.fulfill({json:{
        parkPulseFormat:2,parkId:Number(park[1]),
        parkHours:closedTestMode ? {date:localDate,timezone:'America/Los_Angeles',closedToday:true,
          openingTime:null,closingTime:null,ticketedEvents:[]} :
          trendTestMode ? {date:localDate,timezone:'America/Los_Angeles',closedToday:false,
            openingTime:new Date(Date.now()-3600000).toISOString(),
            closingTime:new Date(Date.now()+3600000).toISOString(),ticketedEvents:[]} : null,
        crowdLevel:trendTestMode ? {available:true,level:7,label:'Busy',deltaPercent:17,samples:35,
          trend:trendDirection ? {direction:trendDirection} : null} : null,
        rides:[
          {id:'mk:preview-one',name:'Preview Mountain',land:'Tomorrowland',isOpen:true,
           waitTime:20,operationalStatus:'OPERATING',source:'themeparks.wiki',lastUpdated:new Date().toISOString()},
          {id:'mk:preview-two',name:'Preview Railway',land:'Frontierland',isOpen:true,
           waitTime:30,operationalStatus:'OPERATING',source:'themeparks.wiki',lastUpdated:new Date().toISOString()}
        ]
      }});
      }
      if(url.pathname==='/health')return route.fulfill({json:{ok:true,version:'2.0.1'}});
      return route.fulfill({json:{ok:true}});
    });

    await page.goto('http://127.0.0.1:8765/preview-2-1/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-overview',{timeout:12000});
    await page.waitForSelector('.ride-list .ride-card',{timeout:12000});
    assert.match(await page.title(),/2.1.*Preview/);
    assert.match(await page.locator('.preview-ribbon').innerText(),/2.1 DEV PREVIEW/);
    // The preview indicator should not consume an entire hero-sized card.
    const bannerHeight = await page.locator('.preview-ribbon').evaluate(el=>el.getBoundingClientRect().height);
    assert(bannerHeight<=48,'Preview status banner is still too tall: '+bannerHeight);
    for(const width of [320,375,390,430,768]){
      await page.setViewportSize({width,height:850});
      const geometry=await page.evaluate(()=>{
        const toolbar=document.querySelector('#view-explore .toolbar').getBoundingClientRect();
        const group=document.querySelector('#view-explore .dashboard-filter-row').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('#view-explore .dashboard-filter-row .filter-button')]
          .map(el=>el.getBoundingClientRect());
        const sort=document.querySelector('#sortSelect').getBoundingClientRect();
        const search=document.querySelector('#rideSearch').getBoundingClientRect();
        return {toolbar:{left:toolbar.left,right:toolbar.right,top:toolbar.top},
          group:{left:group.left,right:group.right,top:group.top,bottom:group.bottom},
          buttons:buttons.map(x=>({left:x.left,right:x.right,width:x.width,height:x.height,top:x.top})),
          sort:{left:sort.left,right:sort.right,top:sort.top,bottom:sort.bottom},
          search:{top:search.top,bottom:search.bottom},
          pageWidth:document.documentElement.scrollWidth
        };
      });
      assert.equal(geometry.buttons.length,2,'Expected exactly two centered filter buttons');
      const [left,right]=geometry.buttons;
      assert(Math.abs(left.width-right.width)<1,'Filter buttons must have equal widths: '+JSON.stringify(geometry));
      const midpoint=(left.left+right.right)/2,toolbarMid=(geometry.toolbar.left+geometry.toolbar.right)/2;
      assert(Math.abs(midpoint-toolbarMid)<3,'Filter buttons are not centered at '+width+': '+JSON.stringify(geometry));
      assert(left.height>=38&&right.height>=38,'Filter buttons too small at '+width);
      assert(geometry.search.bottom<left.top&&geometry.sort.top>geometry.group.bottom,
        'Controls should be search, centered buttons, then sort at '+width);
      assert(geometry.pageWidth<=width+2,'Unexpected horizontal page overflow at '+width);
      // Every KPI is the same height, with aligned number and label lines.
      const stats = await page.evaluate(()=>{
        return [...document.querySelectorAll('#view-explore .dashboard-metrics > .dashboard-stat')].map(tile=>{
          const card=tile.getBoundingClientRect();
          const number=tile.querySelector('.dashboard-stat-value')?.getBoundingClientRect();
          const label=tile.querySelector('.dashboard-stat-label')?.getBoundingClientRect();
          const unit=tile.querySelector('.stat-secondary');
          return {top:card.top,height:card.height,numberTop:number?.top,labelTop:label?.top,
            unitSize:unit?parseFloat(getComputedStyle(unit).fontSize):null};
        });
      });
      assert.equal(stats.length,3,'Three overview KPIs expected');
      assert(stats.every(x=>Number.isFinite(x.numberTop)&&Number.isFinite(x.labelTop)),'Shared stat structure missing');
      const spread=(arr)=>Math.max(...arr)-Math.min(...arr);
      assert(spread(stats.map(x=>x.height))<1.5,'Stat cards have inconsistent heights at '+width);
      assert(spread(stats.map(x=>x.numberTop))<1.5,'Stat number baselines differ at '+width);
      assert(spread(stats.map(x=>x.labelTop))<1.5,'Stat label baselines differ at '+width);
      assert(stats.slice(0,2).every(x=>x.unitSize>8),'Secondary units are unreadable at '+width);

    }
    await page.setViewportSize({width:390,height:844});
    // Color mood follows the chosen park, independent of accent theme.
    assert.equal(await page.locator('#view-explore').getAttribute('data-park-mood'),'magic');
    await page.locator('#nav-resorts').click();
    await page.locator('[data-resort="dlr"]').click();
    await page.locator('#nav-explore').click();
    assert.equal(await page.locator('#view-explore').getAttribute('data-park-mood'),'disneyland');
    await page.locator('[data-park="17"]').click();
    assert.equal(await page.locator('#view-explore').getAttribute('data-park-mood'),'dca');
    await page.locator('#nav-resorts').click();
    await page.locator('[data-resort="wdw"]').click();
    await page.locator('#nav-explore').click();
    assert.equal(await page.locator('.hero-card').count(),0);
    assert.equal(await page.locator('.dashboard-stat').count(),3);
    assert.match(await page.locator('.dashboard-metrics').innerText(),/25/);
    assert.equal(await page.locator('.dashboard-watches').count(),0);

    // Dynamic stat layout: 3-up normally, 2 centered with Crowd disabled,
    // and 1 centered at the same capped width (future module visibility).
    const inspectStats=()=>page.evaluate(()=>{
      const board=document.querySelector('.dashboard-metrics').getBoundingClientRect();
      const tiles=[...document.querySelectorAll('.dashboard-metrics > .dashboard-stat')].map(e=>{
        const r=e.getBoundingClientRect();
        return {left:r.left,right:r.right,width:r.width,top:r.top};
      });
      return {board:{left:board.left,right:board.right,width:board.width},tiles,
        overflow:document.documentElement.scrollWidth};
    });
    const verifyCentered=(geometry,width,count)=>{
      assert.equal(geometry.tiles.length,count,'Unexpected stat count');
      assert(geometry.overflow<=width+2,'Horizontal overflow at '+width);
      const first=geometry.tiles[0],last=geometry.tiles[count-1];
      const center=(first.left+last.right)/2;
      const boardCenter=(geometry.board.left+geometry.board.right)/2;
      assert(Math.abs(center-boardCenter)<3,'Stats must be centered: '+JSON.stringify({width,count,geometry}));
      assert(geometry.tiles.every(tile=>tile.width<=153 && tile.width>60),
        'Optional tile widths must stay capped and usable: '+JSON.stringify({width,count,geometry}));
      assert(geometry.tiles.every(tile=>tile.left>=geometry.board.left-1&&tile.right<=geometry.board.right+1),
        'Tiles must stay inside overview: '+JSON.stringify({width,count,geometry}));
    };
    for(const width of [320,390,430,768]){
      await page.setViewportSize({width,height:850});
      const g=await inspectStats();
      assert.equal(g.tiles.length,3);
      assert(g.tiles.every(tile=>tile.width>60),'Three tiles must be readable: '+width);
    }
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardCrowdToggle').uncheck();
    await page.locator('#nav-explore').click();
    for(const width of [320,390,430,768]){
      await page.setViewportSize({width,height:850});
      verifyCentered(await inspectStats(),width,2);
    }
    await page.evaluate(()=>document.querySelector('.dashboard-metrics .stat-operating').remove());
    for(const width of [320,390,430,768]){
      await page.setViewportSize({width,height:850});
      verifyCentered(await inspectStats(),width,1);
    }
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardCrowdToggle').check();
    await page.locator('#nav-explore').click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.dashboard-stat').count(),3);

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
    // Closed parks must show one integrated status message, no empty KPI tiles or duplicate card.
    closedTestMode = true;
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-closed-summary',{timeout:12000});
    assert.equal(await page.locator('.dashboard-metrics').count(),0);
    assert.equal(await page.locator('.park-closed-card').count(),0);
    assert.equal(await page.locator('.park-feature-slot .park-closed-card').count(),0);
    assert.equal(await page.locator('.dashboard-closed-hours').count(),1);
    assert.match(await page.locator('.dashboard-closed-summary').innerText(),/No regular operating hours are scheduled today/);
    assert.match(await page.locator('.dashboard-closed-hours').innerText(),/Closed today/);
    assert.equal(await page.locator('.park-status-pill.status-closed').count(),1);
    // If data returns to an open/unknown state, the KPI row must reappear.
    closedTestMode = false;
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('.dashboard-metrics > .dashboard-stat',{timeout:12000});
    assert.equal(await page.locator('.dashboard-closed-summary').count(),0);
    assert.equal(await page.locator('.dashboard-stat').count(),3);

    // The three directions reuse existing crowd trend data. Missing data must be silent.
    trendTestMode = true;
    for (const [direction,label,arrow] of [['down','Easing','↘'],['up','Growing','↗'],['steady','Steady','→']]) {
      trendDirection = direction;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.dashboard-stat-trend.trend-'+direction).waitFor({state:'visible',timeout:12000});
      assert.equal((await page.locator('.dashboard-stat-trend').count()),1);
      assert.match(await page.locator('.dashboard-stat-trend').innerText(),new RegExp(label));
      assert.match(await page.locator('.dashboard-stat-trend').innerText(),new RegExp(arrow));
      assert.match(await page.locator('.stat-crowd').getAttribute('aria-label'),new RegExp(label.toLowerCase()));
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:844});
        const geometry=await page.evaluate(()=>{
          const stat=document.querySelector('.stat-crowd').getBoundingClientRect();
          const trend=document.querySelector('.dashboard-stat-trend').getBoundingClientRect();
          const cards=[...document.querySelectorAll('.dashboard-metrics>.dashboard-stat')].map(el=>el.getBoundingClientRect());
          return {stat:{left:stat.left,right:stat.right,bottom:stat.bottom},
            trend:{left:trend.left,right:trend.right,bottom:trend.bottom},
            heights:cards.map(card=>card.height),pageWidth:document.documentElement.scrollWidth};
        });
        assert(geometry.trend.left>=geometry.stat.left-1 && geometry.trend.right<=geometry.stat.right+1,
          'Crowd microtrend clips horizontally at '+width+': '+JSON.stringify(geometry));
        assert(geometry.trend.bottom<=geometry.stat.bottom+1,
          'Crowd microtrend clips vertically at '+width+': '+JSON.stringify(geometry));
        assert(Math.max(...geometry.heights)-Math.min(...geometry.heights)<1.5,
          'Three stat card heights should match at '+width);
        assert(geometry.pageWidth<=width+2,'Unexpected page overflow at '+width);
      }
    }
    await page.setViewportSize({width:390,height:844});
    // No invented direction from partial or missing provider data.
    trendDirection = null;
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.stat-crowd')?.textContent?.includes('7'),{timeout:12000});
    assert.equal(await page.locator('.dashboard-stat-trend').count(),0);
    // The user's existing crowd visibility preference must hide the trend too.
    trendDirection = 'down';
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.dashboard-stat-trend.trend-down').waitFor({state:'visible',timeout:12000});
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardCrowdToggle').uncheck();
    await page.locator('#nav-explore').click();
    assert.equal(await page.locator('.stat-crowd').count(),0);
    assert.equal(await page.locator('.dashboard-stat-trend').count(),0);
    await page.locator('#nav-settings').click();
    await page.locator('#dashboardCrowdToggle').check();
    await page.locator('#nav-explore').click();
    await page.locator('.dashboard-stat-trend.trend-down').waitFor({state:'visible',timeout:12000});
    trendTestMode = false;

    assert.equal(requests.some(request=>!['GET','OPTIONS'].includes(request.method)),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: isolated 2.1 hosted preview loads, persists separate settings/watches and sends no production writes');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
