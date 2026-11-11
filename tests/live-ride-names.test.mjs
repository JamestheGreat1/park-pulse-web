import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { disneylandRidesForPark } from "../worker/src/disneyland-rides.js";
import { LIVE_RIDE_VARIANTS, liveRideDisplayName } from "../worker/src/live-ride-names.js";

const source=readFileSync(new URL("../worker/src/index.js",import.meta.url),"utf8");
function section(from,to){
  const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
  assert(a!==-1 && b>a, "Missing source section "+from);
  return source.slice(a,b);
}
const normalize=s=>String(s||"").replace(/[®™]/g,"").replace(/[’‘]/g,"'")
  .replace(/[–—]/g,"-").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();
const mk={key:"mk:jungle-cruise",name:"Jungle Cruise",land:"Adventureland",aliases:["Jingle Cruise"]};
const epcot={key:"epcot:soarin",name:"Soarin' Across America",land:"World Nature",aliases:["Soarin' Around the World"]};
const all=[mk,epcot,...disneylandRidesForPark(16),...disneylandRidesForPark(17)];
const byKey=new Map(all.map(ride=>[ride.key,ride]));

test("all curated variants are catalog aliases with the same permanent ride ID",()=>{
  assert.deepEqual(Object.keys(LIVE_RIDE_VARIANTS).sort(),[
    "dca:guardians","dca:luigis","dca:maters","dca:soarin",
    "dl:haunted-mansion","dl:small-world","dl:space-mountain",
    "epcot:soarin","mk:jungle-cruise"
  ]);
  for(const [id,variants] of Object.entries(LIVE_RIDE_VARIANTS)){
    const catalog=byKey.get(id);
    assert(catalog,"Missing ride "+id);
    assert.equal(new Set(variants.map(normalize)).size,variants.length);
    for(const name of variants){
      assert(catalog.aliases.some(alias=>normalize(alias)===normalize(name)),
        id+" has no matching alias for "+name);
      const observed={id,rawName:name,name:catalog.name,lastUpdated:new Date().toISOString()};
      assert.equal(liveRideDisplayName(catalog,observed,true),name);
      assert.equal(liveRideDisplayName(catalog,observed,false),catalog.name);
    }
    assert.equal(liveRideDisplayName(catalog,{rawName:catalog.name},true),catalog.name);
    assert.equal(liveRideDisplayName(catalog,{rawName:"unrecognized overlay"},true),catalog.name);
  }
});

test("branding-only aliases never become new display names",()=>{
  const soarin=byKey.get("dca:soarin");
  const guardians=byKey.get("dca:guardians");
  assert.equal(liveRideDisplayName(soarin,{rawName:"Soarin’ Across America"},true),soarin.name);
  assert.equal(liveRideDisplayName(guardians,{rawName:"Guardians of the Galaxy - Mission BREAKOUT!"},true),guardians.name);
});

function sample(catalog,rawName,wait=20,lastUpdated=new Date().toISOString()){
  return {id:catalog.key,parkId:6,name:catalog.name,rawName,isOpen:true,
    waitTime:wait,lastUpdated,source:"queue-times",sourceMissing:false,sourceStale:false};
}
function fetchNames({catalog=mk,primary=[],fallback=[]}={}){
  const context=vm.createContext({
    Date,Number,String,Map,Math,Array,console,
    LIVE_FRESHNESS_MS:15*60_000,liveRideDisplayName,
    fetchThemeParksRides:async()=>primary,fetchQueueTimesRides:async()=>fallback
  });
  vm.runInContext(section("function normalizeName(", "function dateKeyInZone("),context);
  context.park={name:"Magic Kingdom",resortId:"wdw",rides:[catalog]};
  return vm.runInContext("fetchFreshParkRides(6,park,{})",context);
}
test("a fresh overlay returns the seasonal name, canonical name and same stable ID",async()=>{
  const winter=await fetchNames({primary:[sample(mk,"Jingle Cruise",40)]});
  assert.equal(winter.rides.length,1);
  assert.equal(winter.rides[0].id,"mk:jungle-cruise");
  assert.equal(winter.rides[0].name,"Jingle Cruise");
  assert.equal(winter.rides[0].canonicalName,"Jungle Cruise");
  assert.equal(winter.rides[0].activeVariant,true);
  const ordinary=await fetchNames({primary:[sample(mk,"Jungle Cruise",30)]});
  assert.equal(ordinary.rides[0].id,winter.rides[0].id);
  assert.equal(ordinary.rides[0].name,"Jungle Cruise");
  assert.equal(ordinary.rides[0].activeVariant,false);
});
test("fresh overlay fallback wins over stale primary; stale feed never activates variant",async()=>{
  const stale=sample(mk,"Jungle Cruise",35,new Date(Date.now()-3600_000).toISOString());
  const result=await fetchNames({primary:[stale],fallback:[sample(mk,"Jingle Cruise",25)]});
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.rides[0].name,"Jingle Cruise");
  assert.equal(result.rides[0].waitTime,25);
  const outdated=await fetchNames({fallback:[sample(mk,"Jingle Cruise",25,"2020-01-01T12:00:00Z")]});
  assert.equal(outdated.rides.length,0);
});
test("stale D1 records revert to canonical title, retaining stale flags",()=>{
  const context=vm.createContext({String,Number,PARKS:new Map([[6,{rides:[mk]}]])});
  vm.runInContext(section("function staleRowToRide(", "function validateSubscription("),context);
  context.row={
    ride_key:"mk:jungle-cruise",park_id:6,source_id:"17950",name:"Jingle Cruise",land:"Adventureland",
    is_open:1,wait_time:40,source:"queue-times",
    source_updated_at:"2026-11-03T10:00:00Z",updated_at:1793700000000
  };
  const record=vm.runInContext("staleRowToRide(row)",context);
  assert.equal(record.id,"mk:jungle-cruise");
  assert.equal(record.name,"Jungle Cruise");
  assert.equal(record.canonicalName,"Jungle Cruise");
  assert.equal(record.activeVariant,false);
  assert.equal(record.sourceStale,true);
});
test("push titles use a verified live name, without changing existing shortnames",()=>{
  const context=vm.createContext({String,Map});
  vm.runInContext(section("const NOTIFICATION_RIDE_NAMES = new Map([", "function normalizeName("),context);
  context.ride={id:"epcot:soarin",name:"Soarin' Around the World",
    activeVariant:true,sourceStale:false,sourceMissing:false};
  assert.equal(vm.runInContext("notificationRideName(ride)",context),"Soarin' Around the World");
  context.ride={id:"epcot:soarin",name:"Soarin' Across America",activeVariant:false};
  assert.equal(vm.runInContext("notificationRideName(ride)",context),"Soarin'");
  context.ride={id:"mk:jungle-cruise",name:"Jingle Cruise",
    activeVariant:true,sourceStale:false,sourceMissing:false};
  assert.equal(vm.runInContext("notificationRideName(ride)",context),"Jingle Cruise");
});
