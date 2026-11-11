// Read-only, public-feed diagnostic. Never print API keys, subscriptions, or user data.
const now=Date.now();
const sources=[
  ["parkpulse", "https://parkpulse-api.jamesp5297.workers.dev/api/park/5"],
  ["health", "https://parkpulse-api.jamesp5297.workers.dev/health"],
  ["themeparks", "https://api.themeparks.wiki/v1/entity/47f90d2c-e191-4239-a466-5892ef59a88b/live"],
  ["queue-times", "https://queue-times.com/parks/5/queue_times.json"]
];
console.log("READ-ONLY diagnostic time",new Date(now).toISOString());
await Promise.all(sources.map(async ([id,url])=>{
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),16000);
    let r;
    try{r=await fetch(url,{signal:controller.signal,headers:{accept:"application/json","User-Agent":"ParkPulse-readonly-diagnostic"}});}
    finally{clearTimeout(timeout)}
    console.log(id,"status",r.status,"type",r.headers.get("content-type"));
    if(!r.ok)return;
    const data=await r.json();
    if(id==="health"){
      console.log(id,"public",JSON.stringify(data));
    }else if(id==="parkpulse"){
      console.log(id,"flags",JSON.stringify({parkPulseFormat:data.parkPulseFormat,rideCount:data.rides?.length,keys:Object.keys(data).slice(0,20)}));
      console.log(id,"Land",JSON.stringify((data.rides||[]).filter(x=>/living.with.the.land|living-with-the-land/i.test(x.name+" "+x.rawName+" "+x.id)).map(x=>({
        id:x.id,name:x.name,rawName:x.rawName,source:x.source,sourceId:x.sourceId,
        isOpen:x.isOpen,operationalStatus:x.operationalStatus,waitTime:x.waitTime,
        lastUpdated:x.lastUpdated,ageMinutes:x.lastUpdated?Math.round((now-Date.parse(x.lastUpdated))/60000):null,
        sourceStale:x.sourceStale,sourceMissing:x.sourceMissing,activeVariant:x.activeVariant
      }))));
      console.log(id,"EPCOT-other",JSON.stringify((data.rides||[]).filter(x=>/epcot:(soarin|nemo|figment)/.test(x.id)).map(x=>({
        id:x.id,name:x.name,rawName:x.rawName,source:x.source,ageMinutes:x.lastUpdated?Math.round((now-Date.parse(x.lastUpdated))/60000):null,
        sourceStale:x.sourceStale,sourceMissing:x.sourceMissing
      }))));
    }else if(id==="themeparks"){
      const hits=(data.liveData||[]).filter(x=>/living.with.the.land|glimmering|soarin|nemo/i.test(x.name||""));
      console.log(id,"count",data.liveData?.length,"relevant",JSON.stringify(hits.map(x=>({
        name:x.name,entityId:x.entityId,status:x.status,lastUpdated:x.lastUpdated,
        ageMinutes:x.lastUpdated?Math.round((now-Date.parse(x.lastUpdated))/60000):null,
        standby:x.queue?.STANDBY?.waitTime
      }))));
    }else if(id==="queue-times"){
      const all=[...(data.rides||[]),...(data.lands||[]).flatMap(l=>l.rides||[])];
      const landRides=(data.lands||[]).flatMap(l=>(l.rides||[]).map(ride=>({...ride,container:"lands:"+l.name})));
      const topRides=(data.rides||[]).map(ride=>({...ride,container:"top-level"}));
      console.log(id,"Land ingestion order",JSON.stringify([...landRides,...topRides].filter(x=>/living.with.the.land|glimmering/i.test(x.name||"")).map(x=>({
        name:x.name,container:x.container,last_updated:x.last_updated,id:x.id
      }))));
      console.log(id,"count",all.length,"relevant",JSON.stringify(all.filter(x=>/living.with.the.land|glimmering|soarin|nemo/i.test(x.name||"")).map(x=>({
        name:x.name,id:x.id,is_open:x.is_open,wait_time:x.wait_time,last_updated:x.last_updated,
        ageMinutes:x.last_updated?Math.round((now-Date.parse(x.last_updated))/60000):null
      }))));
    }
  }catch(e){console.log(id,"request failed",String(e.message).slice(0,300))}
}));
