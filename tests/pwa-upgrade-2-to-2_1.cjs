// Integration: old installed 2.0 PWA receives new 2.1 assets on the same origin.
// Two repository snapshots are required: .stable-v2/ and current candidate root.
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));

(async()=>{
  const v2=path.resolve('.stable-v2'),v21=process.cwd();
  for(const file of ['index.html','version.json','service-worker.js','assets/js/app.js']){
    assert(fs.existsSync(path.join(v2,file)),'Missing v2 snapshot: '+file);
    assert(fs.existsSync(path.join(v21,file)),'Missing RC: '+file);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(v2,'version.json'))).version,'2.0.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(v21,'version.json'))).version,'2.1.0-rc.1');
  const beforeManifest=JSON.parse(fs.readFileSync(path.join(v2,'manifest.webmanifest')));
  const afterManifest=JSON.parse(fs.readFileSync(path.join(v21,'manifest.webmanifest')));
  for(const key of ['id','scope','start_url','display'])
    assert.equal(afterManifest[key],beforeManifest[key],'PWA identity changed: '+key);
  let mode='stable';
  const mimetype={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json',
    '.webmanifest':'application/manifest+json','.png':'image/png'};
  const server=createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost/');
    const pathname=decodeURIComponent(url.pathname)==='/'?'/index.html':decodeURIComponent(url.pathname);
    const root=mode==='stable'?v2:v21;
    const file=path.resolve(root,pathname.replace(/^\/+/,''));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,buffer)=>{
      if(err){res.writeHead(404).end('missing');return;}
      res.writeHead(200,{'Content-Type':mimetype[path.extname(file)]||'application/octet-stream',
        'Cache-Control':'no-store','Service-Worker-Allowed':'/'});
      res.end(buffer);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const BASE='http://127.0.0.1:'+server.address().port+'/';
  let browser=null;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    const errors=[],backendRequests=[];
    page.on('pageerror',err=>errors.push(String(err.message)));
    const saved={selectedParkId:6,selectedResortId:'wdw',
      lastParkByResort:{wdw:6,dlr:16},activeView:'explore',sort:'wait',theme:'dark',accent:'pink',
      favorites:['mk:space-mountain'],
      rules:[{rideId:'mk:space-mountain',parkId:6,rideName:'Space Mountain',land:'Tomorrowland',
        reopen:true,threshold:35,expiresAt:Date.now()+86400000,createdAt:Date.now()-60000}]};
    await page.addInitScript(({saved})=>{
      if(!localStorage.getItem('parkpulse.rideWatcher.v1')){
        localStorage.setItem('parkpulse.rideWatcher.v1',JSON.stringify(saved));
        localStorage.setItem('parkpulse.glassStyle','frosted');
      }
    },{saved});
    await page.route('https://parkpulse-api.jamesp5297.workers.dev/**',async route=>{
      const req=route.request(),url=new URL(req.url);
      backendRequests.push({method:req.method(),path:url.pathname});
      if(url.pathname.startsWith('/api/park/')){
        const id=Number(url.pathname.split('/').pop());
        const ride=id===6?{id:'mk:space-mountain',name:'Space Mountain',land:'Tomorrowland'}:
          {id:'other:'+id,name:'Other Ride',land:'Land'};
        return route.fulfill({json:{parkPulseFormat:2,parkId:id,
          rides:[{...ride,isOpen:true,operationalStatus:'OPERATING',waitTime:25,
            lastUpdated:new Date().toISOString(),source:'themeparks.wiki',
            sourceStale:false,sourceMissing:false}],parkHours:null,crowdLevel:null}});
      }
      if(url.pathname==='/health')return route.fulfill({json:{ok:true,version:'2.0.1'}});
      if(url.pathname==='/api/analytics/status')return route.fulfill({json:{ok:true,baselineRides:42,totalRides:101}});
      return route.fulfill({json:{ok:true}});
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.locator('.hero-card').waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:20000});
    assert.equal(await page.locator('.dashboard-overview').count(),0);
    const before=await page.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration();
      return {scope:r?.scope,active:r?.active?.scriptURL,
        controller:navigator.serviceWorker.controller?.scriptURL,
        caches:await caches.keys(),saved:localStorage.getItem('parkpulse.rideWatcher.v1')};
    });
    assert.equal(before.scope,BASE);
    assert.equal(before.controller,before.active);
    assert(before.caches.includes('parkpulse-2.0.0'),'2.0 offline cache missing');
    assert.deepEqual(JSON.parse(before.saved).favorites,saved.favorites);
    mode='rc';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('[data-banner-action="update-app"]').waitFor({state:'visible',timeout:25000});
    assert.equal(await page.locator('.dashboard-overview').count(),0,'2.0 must remain until update is accepted');
    const waiting=await page.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration();
      return {scope:r?.scope,waiting:r?.waiting?.state};
    });
    assert.equal(waiting.scope,BASE);
    assert.equal(waiting.waiting,'installed');
    await page.locator('[data-banner-action="update-app"]').click();
    await page.locator('.dashboard-overview').waitFor({state:'visible',timeout:25000});
    await page.waitForFunction(()=>{
      const script=document.querySelector('script[type="module"]');
      return script?.getAttribute('src')?.includes('2.1.0-rc.1')&&Boolean(navigator.serviceWorker.controller);
    },null,{timeout:20000});
    const after=await page.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration();
      return {scope:r?.scope,active:r?.active?.scriptURL,controller:navigator.serviceWorker.controller?.scriptURL,
        caches:await caches.keys(),state:JSON.parse(localStorage.getItem('parkpulse.rideWatcher.v1')),
        glass:localStorage.getItem('parkpulse.glassStyle')};
    });
    assert.equal(after.scope,BASE,'Scope changed during update');
    assert.equal(after.active,before.active,'Reinstalled worker rather than upgrading existing one');
    assert.equal(after.controller,before.controller,'Controller URL changed');
    assert(after.caches.includes('parkpulse-2.1.0-rc.1'),'2.1 cache missing');
    assert(!after.caches.includes('parkpulse-2.0.0'),'Stale cache not deleted');
    assert.equal(after.state.selectedParkId,6);
    assert.equal(after.state.selectedResortId,'wdw');
    assert.equal(after.state.theme,'dark');
    assert.equal(after.state.accent,'pink');
    assert.equal(after.glass,'frosted');
    assert.deepEqual(after.state.favorites,saved.favorites);
    assert.deepEqual(after.state.rules.map(r=>r.rideId),saved.rules.map(r=>r.rideId));
    assert.equal(after.state.rules[0].threshold,saved.rules[0].threshold);
    assert.equal(after.state.rules[0].expiresAt,saved.rules[0].expiresAt);
    assert.equal(after.state.dashboard.density,'compact');
    assert.equal(await page.locator('.dashboard-watches').count(),1,'Saved watch not rendered');
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.dashboard-overview').waitFor({state:'visible',timeout:15000});
    assert.equal(await page.locator('.dashboard-watches').count(),1,'Offline reload lost watch');
    await context.setOffline(false);
    await page.goto(BASE+'?ride=mk%3Aspace-mountain',{waitUntil:'domcontentloaded'});
    await page.locator('#rideSheet:not(.hidden)').waitFor({state:'visible',timeout:18000});
    assert.match(await page.locator('#sheetTitle').innerText(),/Space Mountain/);
    assert(backendRequests.every(r=>['GET','OPTIONS'].includes(r.method)),
      'Update unexpectedly wrote push subscription data');
    assert.deepEqual(errors,[],'JS errors during upgrade');
    console.log('PASS: original 2.0 installed PWA -> Update button -> 2.1, preserved scope, data, cache, offline and ride deep link');
    await context.close();
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
