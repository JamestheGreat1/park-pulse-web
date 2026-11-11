import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../worker/src/index.js",import.meta.url),"utf8");
const section=(a,b)=>{
  const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert(start>=0 && end>start,"Cannot find Worker source sections "+a+" / "+b);
  return source.slice(start,end);
};

function harness({themeEntries=[],queueEntries=[]}={}){
  const now=new Date().toISOString();
  const ctx=vm.createContext({
    Date, String, Map, Number, Array, Math, console,
    VERSION:"2.0.2",LIVE_FRESHNESS_MS:15*60_000,
    ENABLED_PARKS:[5,6,7,8].map(id=>({id,resortId:"wdw",name:id===6?"Magic Kingdom":"Park",
      themeParksId:id===6?"mk-uuid":"other"})),
    parkTimezone:()=>"America/New_York",
    fetch:async url=>({
      ok:true,
      json:async()=>String(url).includes("themeparks.wiki")
        ? {liveData:themeEntries.map(entry=>({
          name:entry.name,
          status:entry.open?"OPERATING":"DOWN",
          lastUpdated:entry.timestamp||now,
          entityId:entry.entityId||"source:"+entry.name,
          queue:{STANDBY:{waitTime:entry.wait??0}}
        }))}
        : {lands:[{name:"Adventureland",rides:queueEntries.map(entry=>({
          id:entry.id||17950,name:entry.name,is_open:entry.open,
          wait_time:entry.wait??0,last_updated:entry.timestamp||now
        }))}]}
    })
  });
  vm.runInContext(
    section("function ride(", "const NOTIFICATION_RIDE_NAMES")+
    section("const PARKS = new Map([","export default {")+
    section("function normalizeName(", "async function fetchFreshParkRides(")+
    section("async function fetchFreshParkRides(", "function dateKeyInZone(")+
    section("async function fetchThemeParksRides(", "async function addDisplayFallbacks("),
    ctx
  );
  return ctx;
}

test("Jingle Cruise and Jungle Cruise share the same permanent watch/history identity",()=>{
  const ctx=harness();
  const catalog=vm.runInContext("PARKS.get(6)",ctx);
  const base=vm.runInContext("findCatalogRide(PARKS.get(6),'Jungle Cruise')",ctx);
  const holiday=vm.runInContext("findCatalogRide(PARKS.get(6),'Jingle Cruise')",ctx);
  assert.equal(catalog.rides.filter(ride=>ride.key==="mk:jungle-cruise").length,1);
  assert.equal(base?.key,"mk:jungle-cruise");
  assert.equal(holiday?.key,base.key);
  assert.equal(holiday.name,"Jungle Cruise");
  // The ingestion layer rejects single-rider observations before name matching.
  assert.equal(vm.runInContext("isSingleRiderName('Jingle Cruise Single Rider')",ctx),true);
});

test("ThemeParks overlay can beat a closed Jungle Cruise base entry in either order",async()=>{
  for(const entries of [
    [{name:"Jingle Cruise",open:true,wait:30},{name:"Jungle Cruise",open:false,wait:0}],
    [{name:"Jungle Cruise",open:false,wait:0},{name:"Jingle Cruise",open:true,wait:30}]
  ]){
    const ctx=harness({themeEntries:entries});
    const rides=await vm.runInContext("fetchThemeParksRides(6,PARKS.get(6),{})",ctx);
    assert.equal(rides.length,1);
    assert.equal(rides[0].id,"mk:jungle-cruise");
    assert.equal(rides[0].name,"Jungle Cruise");
    assert.equal(rides[0].rawName,"Jingle Cruise");
    assert.equal(rides[0].waitTime,30);
    assert.equal(rides[0].isOpen,true);
    assert.equal(rides[0].source,"themeparks.wiki");
  }
});

test("Queue-Times Jingle Cruise fallback provides a fresh ride under the stable ID",async()=>{
  for(const entries of [
    [{name:"Jingle Cruise",open:true,wait:35,id:17950},{name:"Jungle Cruise",open:false,wait:0,id:133}],
    [{name:"Jungle Cruise",open:false,wait:0,id:133},{name:"Jingle Cruise",open:true,wait:35,id:17950}]
  ]){
    const ctx=harness({queueEntries:entries});
    const rides=await vm.runInContext("fetchQueueTimesRides(6,PARKS.get(6))",ctx);
    assert.equal(rides.length,1);
    assert.equal(rides[0].id,"mk:jungle-cruise");
    assert.equal(rides[0].rawName,"Jingle Cruise");
    assert.equal(rides[0].waitTime,35);
    assert.equal(rides[0].sourceId,"17950");
    assert.equal(rides[0].source,"queue-times");
    assert.equal(rides[0].sourceStale,false);
  }
});

test("fresh Jingle Cruise wins over a missing ThemeParks entry without fabricating freshness",async()=>{
  const stale="2026-10-01T18:00:00Z";
  const ctx=harness({
    themeEntries:[],
    queueEntries:[{name:"Jingle Cruise",open:true,wait:25,id:17950}]
  });
  const result=await vm.runInContext("fetchFreshParkRides(6,PARKS.get(6),{})",ctx);
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.rides.length,1);
  assert.equal(result.rides[0].id,"mk:jungle-cruise");
  assert.equal(result.rides[0].source,"queue-times");
  assert.equal(result.rides[0].waitTime,25);
  // Stale upstream timestamps must still be rejected; the alias isn't a bypass.
  const oldCtx=harness({
    themeEntries:[],
    queueEntries:[{name:"Jingle Cruise",open:true,wait:25,id:17950,timestamp:stale}]
  });
  const old=await vm.runInContext("fetchFreshParkRides(6,PARKS.get(6),{})",oldCtx);
  assert.equal(old.rides.length,0);
});
