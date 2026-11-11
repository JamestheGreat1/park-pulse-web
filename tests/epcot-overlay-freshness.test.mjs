import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../worker/src/index.js",import.meta.url),"utf8");
const section=(a,b)=>{
  const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert(start>=0&&end>start,"Missing Worker source region "+a);
  return source.slice(start,end);
};
const canonical={
  key:"epcot:living-with-the-land",name:"Living with the Land",land:"World Nature",
  aliases:["Living with the Land - Glimmering Greenhouses","Living with the Land: Glimmering Greenhouses"]
};
const park={name:"EPCOT",themeParksId:"epcot-id",resortId:"wdw",rides:[canonical]};
const now=Date.now();
const fresh=new Date(now-2*60000).toISOString();
const old=new Date(now-2*86400000).toISOString();
const make=(name,lastUpdated,isOpen,id)=>({id,name,last_updated:lastUpdated,is_open:isOpen,wait_time:isOpen?10:0});
const regular=make("Living with the Land",fresh,false,156);
const overlay=make("Living with the Land – Glimmering Greenhouses",old,false,17914);

function harness({lands=[regular],top=[overlay],theme=[]}={}){
  const context=vm.createContext({
    Date,String,Map,Number,Math,Array,console,
    VERSION:"2.0.4",LIVE_FRESHNESS_MS:15*60_000,
    fetch:async url=>({
      ok:true,
      json:async()=>String(url).includes("themeparks.wiki")
        ? {liveData:theme}
        : {lands:[{name:"World Nature",rides:lands}],rides:top}
    })
  });
  vm.runInContext(
    section("function normalizeName(", "async function fetchFreshParkRides(")+
    section("async function fetchFreshParkRides(", "function dateKeyInZone(")+
    section("async function fetchThemeParksRides(", "async function addDisplayFallbacks("),
    context
  );
  context.park=park;
  context.liveRideDisplayName=(catalog,chosen)=>catalog.name;
  return context;
}

test("EPCOT: stale top-level Glimmering entry MUST NOT overwrite fresh standard ride in lands",async()=>{
  // Exact layout observed live at 2026-11-11T08:07Z: fresh standard in World Nature
  // and 44-hour-old Glimmering overlay in top-level rides.
  const ctx=harness();
  const rides=await vm.runInContext("fetchQueueTimesRides(5,park)",ctx);
  assert.equal(rides.length,1);
  assert.equal(rides[0].id,canonical.key);
  assert.equal(rides[0].sourceId,"156");
  assert.equal(rides[0].rawName,"Living with the Land");
  assert.equal(rides[0].lastUpdated,fresh);
  assert.equal(vm.runInContext("isFreshSourceRide",ctx)(rides[0]),true);
});

test("EPCOT: freshness wins with both provider variants in reversed order",async()=>{
  const ctx=harness({lands:[overlay],top:[regular]});
  const rides=await vm.runInContext("fetchQueueTimesRides(5,park)",ctx);
  assert.equal(rides.length,1);
  assert.equal(rides[0].sourceId,"156");
  assert.equal(rides[0].lastUpdated,fresh);
});

test("EPCOT: ThemeParks duplicates also choose fresh entry regardless of position",async()=>{
  for(const entries of [
    [{name:regular.name,id:"regular",lastUpdated:fresh,status:"CLOSED"},
     {name:overlay.name,id:"holiday",lastUpdated:old,status:"CLOSED"}],
    [{name:overlay.name,id:"holiday",lastUpdated:old,status:"CLOSED"},
     {name:regular.name,id:"regular",lastUpdated:fresh,status:"CLOSED"}]
  ]){
    const ctx=harness({theme:entries.map(x=>({
      ...x,entityId:x.id,queue:{STANDBY:{waitTime:null}}
    }))});
    const rides=await vm.runInContext("fetchThemeParksRides(5,park,{})",ctx);
    assert.equal(rides.length,1);
    assert.equal(rides[0].rawName,"Living with the Land");
    assert.equal(rides[0].lastUpdated,fresh);
  }
});

test("EPCOT: fresh data survives full primary/fallback selection without stale D1 fallback",async()=>{
  const ctx=harness({theme:[]});
  const result=await vm.runInContext("fetchFreshParkRides(5,park,{})",ctx);
  assert.equal(result.rides.length,1);
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.rides[0].id,canonical.key);
  assert.equal(result.rides[0].sourceId,"156");
  assert.equal(result.rides[0].lastUpdated,fresh);
  assert.equal(result.rides[0].sourceStale,false);
  assert.equal(result.rides[0].name,"Living with the Land");
});

test("EPCOT: stale overlay alone remains stale, never artificially refreshed",async()=>{
  const ctx=harness({lands:[],top:[overlay],theme:[]});
  const result=await vm.runInContext("fetchFreshParkRides(5,park,{})",ctx);
  assert.equal(result.rides.length,0);
});
