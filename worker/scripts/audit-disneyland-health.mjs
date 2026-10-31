// Read-only staging and upstream diagnosis, no Cloudflare credentials or D1 access.
// Summarizes counts/timestamps only; never writes or exposes push subscriptions.
const parks=[
  {id:16,name:"Disneyland Park",uid:"7340550b-c14d-4def-80bb-acdb51d49a66"},
  {id:17,name:"Disney California Adventure",uid:"832fcd51-ea19-4e77-85c7-75d5843b127c"}
];
const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
console.log("diagnostic_at",new Date().toISOString(),"Anaheim_date",date);
async function json(url){
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"ParkPulseReadOnlyStageAudit/1.0"},signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  return response.json();
}
function ageStats(rows){
  const now=Date.now();
  const ages=rows.map(item=>Date.parse(item?.lastUpdated||item?.last_updated||"")).filter(Number.isFinite).map(t=>Math.round((now-t)/60000)).sort((a,b)=>a-b);
  return {total:rows.length,timestamped:ages.length,fresh15m:ages.filter(n=>n>=0&&n<=15).length,
    ageMinMinutes:ages[0]??null,ageMedianMinutes:ages[Math.floor(ages.length/2)]??null,
    ageMaxMinutes:ages.at(-1)??null};
}
for(const park of parks){
  const urls={
    stage:"https://parkpulse-api-staging.jamesp5297.workers.dev/api/park/"+park.id,
    schedule:"https://api.themeparks.wiki/v1/entity/"+park.uid+"/schedule",
    live:"https://api.themeparks.wiki/v1/entity/"+park.uid+"/live",
    queue:"https://queue-times.com/parks/"+park.id+"/queue_times.json"
  };
  for(const [kind,url] of Object.entries(urls)){
    try{
      const payload=await json(url);
      if(kind==="schedule"){
        const rows=payload?.schedule||[];
        const today=rows.filter(e=>e.date===date);
        console.log(park.name,kind,JSON.stringify({timezone:payload.timezone,rows:rows.length,
          firstDate:rows[0]?.date,lastDate:rows.at(-1)?.date,
          todayRows:today.map(x=>({date:x.date,type:x.type,openingTime:x.openingTime,closingTime:x.closingTime}))}));
      } else if(kind==="stage"){
        const rows=payload.rides||[];
        const statuses=rows.reduce((a,x)=>{a[x.source||"missing"]=(a[x.source||"missing"]||0)+1;return a;},{});
        console.log(park.name,kind,JSON.stringify({parkHours:payload.parkHours||null,rides:rows.length,
          sources:statuses,sourceStale:rows.filter(x=>x.sourceStale).length,
          sourceMissing:rows.filter(x=>x.sourceMissing).length,...ageStats(rows)}));
      } else if(kind==="live"){
        const rows=payload?.liveData||[];
        const counts=rows.reduce((a,x)=>{a[x.status||"missing"]=(a[x.status||"missing"]||0)+1;return a;},{});
        console.log(park.name,kind,JSON.stringify({statusCounts:counts,...ageStats(rows)}));
      } else {
        const rows=[...(payload?.rides||[]),...(payload?.lands||[]).flatMap(x=>x.rides||[])];
        console.log(park.name,kind,JSON.stringify(ageStats(rows)));
      }
    }catch(error){console.warn(park.name,kind,error.message);}
  }
}
