import { PARKS, isSingleRiderName, normalizeRideName } from "./data.js?v=1.2.0";

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
    land: String(ride.land || "Other"),
    kind: "ride",
    isOpen: Boolean(ride.isOpen),
    waitTime: Number.isFinite(Number(ride.waitTime)) ? Math.max(0, Number(ride.waitTime)) : null,
    lastUpdated: ride.lastUpdated || null,
    source: String(ride.source || "unknown"),
    sourceId: ride.sourceId ? String(ride.sourceId) : null,
    sourceStale: Boolean(ride.sourceStale),
    sourceMissing: Boolean(ride.sourceMissing)
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
    land: String(land || "Other"),
    kind: "ride",
    isOpen: Boolean(ride.is_open),
    waitTime: Math.max(0, Number(ride.wait_time || 0)),
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
    return payload.rides.map((ride) => normalizedWorkerRide(parkId, ride));
  }

  return parseLegacyQueueTimes(parkId, payload);
}

export class RideData extends EventTarget {
  constructor() {
    super();
    this.byPark = new Map();
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

  rideById(id) {
    return this.allRides().find((ride) => String(ride.id) === String(id)) || null;
  }

  rideByName(parkId, name) {
    const wanted = normalizeRideName(name);
    return this.ridesForPark(parkId).find((ride) => normalizeRideName(ride.name) === wanted) || null;
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
          this.byPark.set(result.value[0], result.value[1]);
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
