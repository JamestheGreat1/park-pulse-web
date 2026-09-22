import { PARKS, cleanAttractionName, isSingleRiderName, attractionKind, catalogRide, catalogPlaceholders } from "./data.js?v=1.1.1";

const config = window.PARKPULSE_CONFIG || {};
export const workerBase = String(config.WORKER_BASE || "").replace(/\/$/, "");
const timeoutMs = Number(config.REQUEST_TIMEOUT_MS || 12000);

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: "application/json", ...(options.headers || {}) }, cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  } finally { clearTimeout(timer); }
}

function normalizeRide(parkId, ride, land) {
  const rawName = String(ride.name || "Attraction");
  return {
    id:Number(ride.id),
    parkId:Number(parkId),
    name:(catalogRide(parkId, rawName, ride.id)?.name || cleanAttractionName(rawName)),
    rawName,
    land:String((Number(parkId) === 5 && Number(ride.id) === 10914 && (!land || land === "Other")) ? "World Showcase" : (land || "Other")),
    kind:attractionKind(parkId, rawName, ride.id),
    isOpen:Boolean(ride.is_open),
    waitTime:Math.max(0,Number(ride.wait_time||0)),
    lastUpdated:ride.last_updated||null,
    sourceStale:Boolean(ride.parkpulse_stale),
    sourceMissing:false
  };
}

export async function fetchPark(parkId) {
  const url = workerBase ? `${workerBase}/api/park/${parkId}` : `https://queue-times.com/parks/${parkId}/queue_times.json`;
  const payload = await fetchJson(url);
  const rides = [];
  for (const land of payload?.lands || []) for (const ride of land?.rides || []) if (!isSingleRiderName(ride?.name)) rides.push(normalizeRide(parkId, ride, land.name));
  for (const ride of payload?.rides || []) if (!isSingleRiderName(ride?.name)) rides.push(normalizeRide(parkId, ride, "Other"));
  for (const ride of payload?.parkpulse_stale || []) if (!isSingleRiderName(ride?.name)) rides.push(normalizeRide(parkId, ride, "Other"));
  const live = [...new Map(rides.map((ride) => [ride.id, ride])).values()];
  return [...live, ...catalogPlaceholders(parkId, live)];
}

export class RideData extends EventTarget {
  constructor(){super();this.byPark=new Map();this.updatedAt=null;this.refreshing=false;this.error=null;}
  ridesForPark(id){return this.byPark.get(Number(id))||[];}
  allRides(){return [...this.byPark.values()].flat();}
  rideById(id){return this.allRides().find((ride)=>ride.id===Number(id))||null;}
  async refresh({parkId=null}={}){
    if(this.refreshing)return;
    this.refreshing=true;this.dispatchEvent(new Event("status"));
    try{
      const targets=parkId?PARKS.filter((p)=>p.id===Number(parkId)):PARKS;
      const results=await Promise.allSettled(targets.map(async(park)=>[park.id,await fetchPark(park.id)]));
      let ok=0;
      for(const result of results)if(result.status==="fulfilled"){this.byPark.set(result.value[0],result.value[1]);ok++;}
      if(!ok)throw new Error("Could not load live ride data");
      this.updatedAt=new Date().toISOString();
      this.error=ok===targets.length?null:"Some park data could not be refreshed.";
    }catch(error){this.error=navigator.onLine?"ParkPulse couldn't reach live ride data.":"You're offline. Live ride data is unavailable.";}
    finally{this.refreshing=false;this.dispatchEvent(new Event("update"));}
  }
}
export const rideData = new RideData();
