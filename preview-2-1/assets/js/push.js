// ParkPulse 2.1 preview: deliberately read-only; never register, sync, or delete production push subscriptions.
import { workerBase } from "./api.js?v=2.1.0-preview";
export async function currentSubscription(){return null;}
export async function enablePush(){throw new Error("Push notifications are disabled in the development preview.");}
export async function syncRules(){return {synced:false,reason:"preview"};}
export async function disablePush(){return;}
export async function backendHealth(){
  if(!workerBase)return {ok:false,reason:"backend"};
  try{
    const response=await fetch(workerBase+"/health",{cache:"no-store"});
    if(!response.ok)return {ok:false,status:response.status};
    return await response.json();
  }catch{return {ok:false,reason:"network"};}
}
export async function sendTestPush(){throw new Error("Push testing is disabled in preview.");}
export async function simulateStagingRideAlert(){throw new Error("Push testing is disabled in preview.");}
export async function armStagingCronProbe(){throw new Error("Push testing is disabled in preview.");}
export async function armStagingLiveProbe(){throw new Error("Push testing is disabled in preview.");}
export async function stagingLiveProbeStatus(){throw new Error("Push testing is disabled in preview.");}
