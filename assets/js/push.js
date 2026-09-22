import { workerBase } from "./api.js?v=1.3.4";

function base64ToBytes(value) {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
export function pushSupported(){return Boolean(workerBase&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window);}
export async function registration(){if(!("serviceWorker" in navigator))return null;return navigator.serviceWorker.ready;}
export async function currentSubscription(){const reg=await registration();return reg?reg.pushManager.getSubscription():null;}
export async function enablePush(){
  if(!pushSupported())throw new Error("Push notifications aren't supported on this device.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted")throw new Error("Notification permission wasn't granted.");
  const reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(!sub){
    const key=await fetch(`${workerBase}/vapid-key`,{cache:"no-store"}).then((r)=>{if(!r.ok)throw new Error("Couldn't load notification key.");return r.json();});
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(key.publicKey)});
  }
  return sub;
}
export async function syncRules(rules){
  if(!workerBase||!("serviceWorker" in navigator))return{synced:false,reason:"backend"};
  const sub=await currentSubscription();if(!sub)return{synced:false,reason:"subscription"};
  const payload={subscription:sub.toJSON(),watchIds:rules.map((r)=>r.rideId),rules};
  const response=await fetch(`${workerBase}/subscriptions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error("Couldn't sync ride alerts.");
  return{synced:true,...(await response.json())};
}
export async function disablePush(){
  const sub=await currentSubscription();if(!sub)return;
  if(workerBase)await fetch(`${workerBase}/subscriptions`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
  await sub.unsubscribe();
}


export async function backendHealth(){
  if(!workerBase) return {ok:false,reason:"backend"};
  try{
    const response=await fetch(`${workerBase}/health`,{cache:"no-store"});
    if(!response.ok) return {ok:false,status:response.status};
    return await response.json();
  }catch{
    return {ok:false,reason:"network"};
  }
}

export async function sendTestPush(){
  const sub=await currentSubscription();
  if(!sub) throw new Error("Enable notifications first.");
  const response=await fetch(`${workerBase}/subscriptions/test`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({subscription:sub.toJSON()})
  });
  if(!response.ok){
    if(response.status===410) throw new Error("This notification subscription expired. Disable and re-enable notifications.");
    throw new Error("Couldn't send a test notification.");
  }
  return response.json();
}
