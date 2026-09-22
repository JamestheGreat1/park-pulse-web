import { buildPushPayload } from "@block65/webcrypto-web-push";

const VERSION = "1.1.0";
const PARKS = new Map([[5,"EPCOT"],[6,"Magic Kingdom"],[7,"Hollywood Studios"],[8,"Animal Kingdom"]]);
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ok:true,service:"parkpulse-api",version:VERSION,now:new Date().toISOString()},200,cors);
      }

      if (request.method === "GET" && url.pathname === "/vapid-key") {
        return json({publicKey:env.VAPID_SERVER_PUBLIC_KEY},200,cors);
      }

      const parkMatch = url.pathname.match(/^\/api\/park\/(\d+)$/);
      if (request.method === "GET" && parkMatch) {
        const parkId = Number(parkMatch[1]);
        if (!PARKS.has(parkId)) return json({error:"Unsupported park"},404,cors);

        const upstream = await fetch(`https://queue-times.com/parks/${parkId}/queue_times.json`,{
          headers:{Accept:"application/json","User-Agent":`ParkPulse-Web/${VERSION}`},
          cf:{cacheEverything:true,cacheTtl:240}
        });
        if (!upstream.ok) return json({error:"Queue-Times upstream error"},502,cors);

        const payload = await upstream.json();
        const liveIds = new Set();
        for (const land of payload?.lands || []) {
          for (const ride of land?.rides || []) liveIds.add(Number(ride.id));
        }
        for (const ride of payload?.rides || []) liveIds.add(Number(ride.id));

        const rows = (await env.DB.prepare(
          "SELECT ride_id,name,is_open,wait_time,updated_at FROM ride_state WHERE park_id = ?"
        ).bind(parkId).all()).results || [];

        payload.parkpulse_stale = rows
          .filter((row) => !liveIds.has(Number(row.ride_id)))
          .map((row) => ({
            id:Number(row.ride_id),
            name:row.name,
            is_open:Boolean(row.is_open),
            wait_time:Number(row.wait_time || 0),
            last_updated:new Date(Number(row.updated_at || 0)).toISOString(),
            parkpulse_stale:true
          }));

        return json(payload,200,{...cors,"Cache-Control":"public, max-age=120"});
      }

      if (request.method === "POST" && url.pathname === "/subscriptions") {
        const body = await request.json();
        const subscription = validateSubscription(body?.subscription);
        if (!subscription) return json({error:"Invalid push subscription"},400,cors);

        const rawRules = Array.isArray(body?.rules) ? body.rules : Array.isArray(body?.watchIds) ? body.watchIds : [];
        const rules = normalizeRules(rawRules).slice(0,100);

        await env.DB.prepare(
          `INSERT INTO subscriptions(endpoint,p256dh,auth,watch_ids,updated_at)
           VALUES(?,?,?,?,?)
           ON CONFLICT(endpoint) DO UPDATE SET
             p256dh=excluded.p256dh,
             auth=excluded.auth,
             watch_ids=excluded.watch_ids,
             updated_at=excluded.updated_at`
        ).bind(subscription.endpoint,subscription.p256dh,subscription.auth,JSON.stringify(rules),Date.now()).run();

        return json({ok:true,watched:rules.length},200,cors);
      }

      if (request.method === "POST" && url.pathname === "/subscriptions/test") {
        const body = await request.json().catch(()=>({}));
        const subscription = validateSubscription(body?.subscription);
        if (!subscription) return json({error:"Invalid push subscription"},400,cors);

        const delivered = await sendPush(subscription,{
          title:"ParkPulse test",
          body:"Notifications are connected and ready for your ride watches.",
          url:env.APP_URL || "/",
          tag:"parkpulse-device-test",
          renotify:true
        },env);

        if (!delivered) return json({error:"Push subscription expired"},410,cors);
        return json({ok:true,delivered:true},200,cors);
      }

      if (request.method === "DELETE" && url.pathname === "/subscriptions") {
        const body = await request.json().catch(()=>({}));
        if (!body?.endpoint) return json({error:"endpoint required"},400,cors);
        await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
        await env.DB.prepare("DELETE FROM notification_log WHERE endpoint = ?").bind(body.endpoint).run().catch(()=>{});
        return json({ok:true},200,cors);
      }

      if (request.method === "POST" && url.pathname === "/send/test") {
        if (!env.PUSH_ADMIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.PUSH_ADMIN_TOKEN}`) {
          return json({error:"Unauthorized"},401,cors);
        }
        const rows=(await env.DB.prepare("SELECT endpoint,p256dh,auth FROM subscriptions ORDER BY updated_at DESC LIMIT 50").all()).results||[];
        const payload={title:"ParkPulse test",body:"Push is wired up correctly.",url:env.APP_URL||"/",tag:"parkpulse-test"};
        const results=await Promise.allSettled(rows.map(row=>sendPush(row,payload,env)));
        return json({ok:true,attempted:rows.length,delivered:results.filter(r=>r.status==="fulfilled"&&r.value).length},200,cors);
      }

      return json({error:"Not found"},404,cors);
    } catch (error) {
      console.error(error);
      return json({error:"Internal error"},500,cors);
    }
  },

  async scheduled(_controller,env,ctx){
    ctx.waitUntil(runRideWatch(env));
  }
};

function corsHeaders(request,env){
  const origin=request.headers.get("Origin")||"";
  const allowed=!env.APP_ORIGIN||origin===env.APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin":allowed&&origin?origin:env.APP_ORIGIN||"*",
    "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization",
    "Access-Control-Max-Age":"86400",
    "Vary":"Origin"
  };
}

function json(value,status=200,headers={}){
  return new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
}

function validateSubscription(subscription){
  const endpoint=subscription?.endpoint;
  const p256dh=subscription?.keys?.p256dh;
  const auth=subscription?.keys?.auth;
  if(!endpoint||!p256dh||!auth||!String(endpoint).startsWith("https://")) return null;
  return {endpoint:String(endpoint),p256dh:String(p256dh),auth:String(auth)};
}

function normalizeRules(raw){
  const now=Date.now();
  const out=[];
  for(const item of raw||[]){
    if(Number.isFinite(Number(item))){
      out.push({rideId:Number(item),reopen:true,threshold:null,expiresAt:null});
      continue;
    }
    if(!item||!Number.isFinite(Number(item.rideId))) continue;
    const expiresAt=item.expiresAt==null?null:Number(item.expiresAt);
    if(expiresAt&&expiresAt<=now) continue;
    const threshold=item.threshold==null?null:Math.max(5,Math.min(300,Number(item.threshold)));
    const rule={
      rideId:Number(item.rideId),
      parkId:Number(item.parkId)||null,
      rideName:String(item.rideName||"Attraction").slice(0,160),
      reopen:item.reopen!==false,
      threshold:Number.isFinite(threshold)?threshold:null,
      expiresAt:Number.isFinite(expiresAt)?expiresAt:null
    };
    if(rule.reopen||rule.threshold) out.push(rule);
  }
  return [...new Map(out.map(r=>[r.rideId,r])).values()];
}

async function runRideWatch(env){
  const priorRows=(await env.DB.prepare("SELECT ride_id,park_id,name,is_open,wait_time,updated_at FROM ride_state").all()).results||[];
  const prior=new Map(priorRows.map(row=>[
    Number(row.ride_id),
    {
      id:Number(row.ride_id),
      parkId:Number(row.park_id),
      name:row.name,
      isOpen:Boolean(row.is_open),
      waitTime:Number(row.wait_time||0),
      updatedAt:Number(row.updated_at||0)
    }
  ]));

  const current=[];
  for(const [parkId] of PARKS){
    try{
      const response=await fetch(`https://queue-times.com/parks/${parkId}/queue_times.json`,{
        headers:{Accept:"application/json","User-Agent":`ParkPulse-Web/${VERSION}`}
      });
      if(!response.ok) continue;
      const payload=await response.json();
      for(const land of payload?.lands||[]) for(const ride of land?.rides||[]) current.push(normalizeRide(parkId,ride));
      for(const ride of payload?.rides||[]) current.push(normalizeRide(parkId,ride));
    }catch(error){
      console.warn("Queue poll failed",parkId,error);
    }
  }

  const deduped=[...new Map(current.map(r=>[r.id,r])).values()];
  const currentByPark=groupByPark(deduped);
  const priorByPark=groupByPark([...prior.values()]);
  const subscriptions=(await env.DB.prepare("SELECT endpoint,p256dh,auth,watch_ids FROM subscriptions").all()).results||[];
  const parsedSubs=[];

  for(const row of subscriptions){
    let raw=[];
    try{raw=JSON.parse(row.watch_ids||"[]");}catch{}
    const rules=normalizeRules(raw);
    parsedSubs.push({...row,rules});
    if(JSON.stringify(rules)!==JSON.stringify(raw)){
      await env.DB.prepare("UPDATE subscriptions SET watch_ids=?,updated_at=? WHERE endpoint=?")
        .bind(JSON.stringify(rules),Date.now(),row.endpoint).run();
    }
  }

  const easternHour=Number(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",
    hour:"2-digit",
    hourCycle:"h23"
  }).format(new Date()));

  for(const ride of deduped){
    const before=prior.get(ride.id);
    if(before){
      const pNow=currentByPark.get(ride.parkId)||[];
      const pBefore=priorByPark.get(ride.parkId)||[];
      const nowOpen=pNow.filter(r=>r.isOpen).length;
      const beforeOpen=pBefore.filter(r=>r.isOpen).length;
      const operationalNow=nowOpen>=3;
      const operationalBefore=beforeOpen>=3;
      const openingRamp=easternHour<11 && nowOpen-beforeOpen>=3;
      const reopened=!before.isOpen&&ride.isOpen&&operationalBefore&&operationalNow&&!openingRamp;
      const watchers=parsedSubs.filter(s=>s.rules.some(rule=>rule.rideId===ride.id));

      for(const watcher of watchers){
        const rule=watcher.rules.find(rule=>rule.rideId===ride.id);
        if(!rule) continue;

        let payload=null;
        let kind=null;

        if(reopened&&rule.reopen){
          kind="reopen";
          payload={
            title:`${ride.name} reopened`,
            body:`${PARKS.get(ride.parkId)} • ${ride.waitTime>0?`${ride.waitTime} min`:"Open now"}`,
            url:`${env.APP_URL||"/"}?ride=${ride.id}`,
            tag:`ride-${ride.id}-reopen`,
            renotify:true
          };
        } else if(rule.threshold!=null&&before.isOpen&&ride.isOpen&&before.waitTime>rule.threshold&&ride.waitTime<=rule.threshold){
          kind="wait";
          payload={
            title:`${ride.name} is down to ${ride.waitTime} min`,
            body:`Your target was ${rule.threshold} min • ${PARKS.get(ride.parkId)}`,
            url:`${env.APP_URL||"/"}?ride=${ride.id}`,
            tag:`ride-${ride.id}-wait`,
            renotify:true
          };
        }

        if(payload&&kind){
          try{
            if(await cooldownActive(env,watcher.endpoint,ride.id,kind)) continue;
            const delivered=await sendPush(watcher,payload,env);
            if(delivered) await markNotification(env,watcher.endpoint,ride.id,kind);
            else await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint=?").bind(watcher.endpoint).run();
          }catch(error){
            console.warn("Push failed",error);
          }
        }
      }
    }

    await env.DB.prepare(
      `INSERT INTO ride_state(ride_id,park_id,name,is_open,wait_time,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(ride_id) DO UPDATE SET
         park_id=excluded.park_id,
         name=excluded.name,
         is_open=excluded.is_open,
         wait_time=excluded.wait_time,
         updated_at=excluded.updated_at`
    ).bind(ride.id,ride.parkId,ride.name,ride.isOpen?1:0,ride.waitTime,Date.now()).run();
  }

  await env.DB.prepare("DELETE FROM notification_log WHERE last_sent < ?")
    .bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run().catch(()=>{});
}

async function cooldownActive(env,endpoint,rideId,kind){
  const row=await env.DB.prepare(
    "SELECT last_sent FROM notification_log WHERE endpoint=? AND ride_id=? AND kind=?"
  ).bind(endpoint,rideId,kind).first();
  return Boolean(row&&Date.now()-Number(row.last_sent)<NOTIFICATION_COOLDOWN_MS);
}

async function markNotification(env,endpoint,rideId,kind){
  await env.DB.prepare(
    `INSERT INTO notification_log(endpoint,ride_id,kind,last_sent)
     VALUES(?,?,?,?)
     ON CONFLICT(endpoint,ride_id,kind) DO UPDATE SET last_sent=excluded.last_sent`
  ).bind(endpoint,rideId,kind,Date.now()).run();
}

function groupByPark(rides){
  const map=new Map();
  for(const r of rides){
    if(!map.has(r.parkId)) map.set(r.parkId,[]);
    map.get(r.parkId).push(r);
  }
  return map;
}

function normalizeRide(parkId,ride){
  return {
    id:Number(ride.id),
    parkId:Number(parkId),
    name:String(ride.name||"Attraction"),
    isOpen:Boolean(ride.is_open),
    waitTime:Math.max(0,Number(ride.wait_time||0))
  };
}

async function sendPush(row,data,env){
  const subscription={
    endpoint:row.endpoint,
    expirationTime:null,
    keys:{p256dh:row.p256dh,auth:row.auth}
  };
  const vapid={
    subject:env.VAPID_SUBJECT,
    publicKey:env.VAPID_SERVER_PUBLIC_KEY,
    privateKey:env.VAPID_SERVER_PRIVATE_KEY
  };
  const requestInit=await buildPushPayload({
    data:JSON.stringify(data),
    options:{ttl:300,urgency:"high",topic:String(data.tag||"parkpulse")}
  },subscription,vapid);
  const response=await fetch(subscription.endpoint,requestInit);
  if(response.status===404||response.status===410) return false;
  if(!response.ok) throw new Error(`Push service returned ${response.status}`);
  return true;
}
