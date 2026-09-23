import { workerBase } from "./api.js?v=1.3.8";

function base64ToBytes(value) {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function vapidPublicKey() {
  if (!workerBase) throw new Error("ParkPulse backend is unavailable.");
  const response = await fetch(`${workerBase}/vapid-key`, { cache: "no-store" });
  if (!response.ok) throw new Error("Couldn't load notification key.");
  const data = await response.json();
  if (!data?.publicKey) throw new Error("Notification key is unavailable.");
  return String(data.publicKey).replace(/=+$/g, "");
}
function subscriptionVapidKey(subscription) {
  const key = subscription?.options?.applicationServerKey;
  return key ? bytesToBase64Url(key) : null;
}
export function pushSupported(){return Boolean(workerBase&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window);}
export async function registration(){if(!("serviceWorker" in navigator))return null;return navigator.serviceWorker.ready;}
export async function currentSubscription(){
  const reg=await registration();
  if(!reg) return null;

  let sub=await reg.pushManager.getSubscription();
  if(!sub||Notification.permission!=="granted") return sub;

  try{
    const currentKey=await vapidPublicKey();
    const subscribedKey=subscriptionVapidKey(sub);
    if(subscribedKey&&subscribedKey!==currentKey){
      await sub.unsubscribe();
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64ToBytes(currentKey)
      });
    }
  }catch{}

  return sub;
}
export async function enablePush(){
  if(!pushSupported())throw new Error("Push notifications aren't supported on this device.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted")throw new Error("Notification permission wasn't granted.");

  const reg=await registration();
  const currentKey=await vapidPublicKey();
  let sub=await reg.pushManager.getSubscription();

  if(sub){
    const subscribedKey=subscriptionVapidKey(sub);
    if(subscribedKey && subscribedKey!==currentKey){
      await sub.unsubscribe();
      sub=null;
    }
  }

  if(!sub){
    sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:base64ToBytes(currentKey)
    });
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

  const result=await response.json().catch(()=>({}));

  if(!response.ok){
    if(response.status===410||result.code==="SUBSCRIPTION_EXPIRED"){
      throw new Error("This notification subscription expired. Disable and re-enable notifications.");
    }
    if(result.code==="PUSH_CONFIG_MISSING"){
      throw new Error("ParkPulse push keys are missing on the Worker.");
    }
    if(result.code==="PUSH_PROVIDER_REJECTED"){
      const reason=result.pushReason? ` · ${result.pushReason}` : "";
      throw new Error(`Push service rejected the request${result.pushStatus?` (${result.pushStatus})`:""}${reason}.`);
    }
    throw new Error(`Push test failed${response.status?` (${response.status})`:""}.`);
  }

  return result;
}
