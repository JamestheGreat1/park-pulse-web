import { PARKS, isSingleRiderName, normalizeRideName } from "./data.js?v=1.5.3-install-push";

const config = window.PARKPULSE_CONFIG || {};
export const workerBase = String(config.WORKER_BASE || "").replace(/\/$/, "");
const timeoutMs = Number(config.REQUEST_TIMEOUT_MS || 12000);

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizedWorkerRide(parkId, ride) {
  return {
    id: String(ride.id),
    parkId: Number(parkId),
    name: String(ride.name || "Attraction"),
    rawName: String(ride.rawName || ride.name || "Attraction"),
    aliases: Array.isArray(ride.aliases) ? ride.aliases.map(String) : [],
    land: String(ride.land || "Other"),
    kind: "ride",
    isOpen: Boolean(ride.isOpen),
    operationalStatus: String(ride.operationalStatus || (ride.isOpen ? "OPERATING" : "UNKNOWN")),
    waitTime: ride.waitTime == null ? null : Number.isFinite(Number(ride.waitTime)) ? Math.max(0, Number(ride.waitTime)) : null,
    downSince: ride.downSince || null,
    downMinutes: ride.downMinutes == null ? null : Math.max(0, Number(ride.downMinutes)),
    lastUpdated: ride.lastUpdated || null,
    source: String(ride.source || "unknown"),
    sourceId: ride.sourceId ? String(ride.sourceId) : null,
    sourceStale: Boolean(ride.sourceStale),
    sourceMissing: Boolean(ride.sourceMissing),
    typicalWait: ride.typicalWait == null ? null : Number(ride.typicalWait),
    typicalLow: ride.typicalLow == null ? null : Number(ride.typicalLow),
    typicalHigh: ride.typicalHigh == null ? null : Number(ride.typicalHigh),
    baselineDays: Number(ride.baselineDays || 0),
    valueRatio: ride.valueRatio == null ? null : Number(ride.valueRatio)
  };
}

function legacyQueueTimesRide(parkId, ride, land) {
  const rawName = String(ride?.name || "Attraction");
  if (isSingleRiderName(rawName)) return null;
  return {
    id: String(ride.id),
    parkId: Number(parkId),
    name: rawName.replace(/[®™]/g, "").trim(),
    rawName,
    aliases: [],
    land: String(land || "Other"),
    kind: "ride",
    isOpen: Boolean(ride.is_open),
    operationalStatus: Boolean(ride.is_open) ? "OPERATING" : "CLOSED",
    waitTime: Math.max(0, Number(ride.wait_time || 0)),
    downSince: null,
    downMinutes: null,
    lastUpdated: ride.last_updated || null,
    source: "queue-times",
    sourceId: String(ride.id),
    sourceStale: false,
    sourceMissing: false
  };
}

function parseLegacyQueueTimes(parkId, payload) {
  const rides = [];
  for (const land of payload?.lands || []) {
    for (const ride of land?.rides || []) {
      const normalized = legacyQueueTimesRide(parkId, ride, land.name);
      if (normalized) rides.push(normalized);
    }
  }
  for (const ride of payload?.rides || []) {
    const normalized = legacyQueueTimesRide(parkId, ride, "Other");
    if (normalized) rides.push(normalized);
  }
  return [...new Map(rides.map((ride) => [ride.id, ride])).values()];
}

export async function fetchPark(parkId) {
  const url = workerBase
    ? `${workerBase}/api/park/${parkId}`
    : `https://queue-times.com/parks/${parkId}/queue_times.json`;
  const payload = await fetchJson(url);

  if (Array.isArray(payload?.rides) && payload?.parkPulseFormat === 2) {
    return {
      rides: payload.rides.map((ride) => normalizedWorkerRide(parkId, ride)),
      parkHours: payload.parkHours || null,
      crowdLevel: payload.crowdLevel || null
    };
  }

  return {
    rides: parseLegacyQueueTimes(parkId, payload),
    parkHours: null,
    crowdLevel: null
  };
}

export async function fetchRideInsights(rideId) {
  if (!workerBase || !rideId) return null;
  try {
    return await fetchJson(`${workerBase}/api/ride/${encodeURIComponent(String(rideId))}/insights`);
  } catch {
    return null;
  }
}

export async function fetchAnalyticsStatus() {
  if (!workerBase) return null;
  try {
    return await fetchJson(`${workerBase}/api/analytics/status`);
  } catch {
    return null;
  }
}

export class RideData extends EventTarget {
  constructor() {
    super();
    this.byPark = new Map();
    this.hoursByPark = new Map();
    this.crowdByPark = new Map();
    this.updatedAt = null;
    this.refreshing = false;
    this.error = null;
    this.sourceSummary = null;
  }

  ridesForPark(id) {
    return this.byPark.get(Number(id)) || [];
  }

  allRides() {
    return [...this.byPark.values()].flat();
  }

  hoursForPark(id) {
    return this.hoursByPark.get(Number(id)) || null;
  }

  crowdForPark(id) {
    return this.crowdByPark.get(Number(id)) || null;
  }

  rideById(id) {
    return this.allRides().find((ride) => String(ride.id) === String(id)) || null;
  }

  rideByName(parkId, name) {
    const wanted = normalizeRideName(name);
    return this.ridesForPark(parkId).find((ride) => [ride.name, ...(ride.aliases || [])].some((name) => normalizeRideName(name) === wanted)) || null;
  }

  async refresh({ parkId = null } = {}) {
    if (this.refreshing) return;
    this.refreshing = true;
    this.dispatchEvent(new Event("status"));

    try {
      const targets = parkId ? PARKS.filter((park) => park.id === Number(parkId)) : PARKS;
      const results = await Promise.allSettled(
        targets.map(async (park) => [park.id, await fetchPark(park.id)])
      );

      let ok = 0;
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [id, data] = result.value;
          this.byPark.set(id, data.rides || []);
          this.hoursByPark.set(id, data.parkHours || null);
          this.crowdByPark.set(id, data.crowdLevel || null);
          ok++;
        }
      }

      if (!ok) throw new Error("Could not load live ride data");
      this.updatedAt = new Date().toISOString();
      this.error = ok === targets.length ? null : "Some park data could not be refreshed.";

      const sources = new Set(this.allRides().map((ride) => ride.source).filter(Boolean));
      this.sourceSummary = [...sources].sort().join(", ");
    } catch {
      this.error = navigator.onLine
        ? "ParkPulse couldn't reach live ride data."
        : "You're offline. Live ride data is unavailable.";
    } finally {
      this.refreshing = false;
      this.dispatchEvent(new Event("update"));
    }
  }
}

export const rideData = new RideData();
