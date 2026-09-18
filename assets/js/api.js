import { PARKS, classifyAttraction } from "./data.js";
import { appendHistory, loadQueueCache, saveQueueCache } from "./store.js";

const config = window.PARKPULSE_CONFIG || {};
const workerBase = String(config.WORKER_BASE || "").replace(/\/$/, "");
const requestTimeout = Number(config.REQUEST_TIMEOUT_MS || 12000);

function normalizeParkPayload(parkId, payload) {
  const rides = [];
  for (const land of payload?.lands || []) {
    for (const ride of land?.rides || []) {
      rides.push(normalizeRide(parkId, ride, land?.name || "Other"));
    }
  }
  for (const ride of payload?.rides || []) {
    rides.push(normalizeRide(parkId, ride, "Other"));
  }
  const deduped = new Map(rides.map((ride) => [ride.id, ride]));
  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRide(parkId, ride, land) {
  const normalized = {
    id: Number(ride.id),
    parkId: Number(parkId),
    land,
    name: String(ride.name || "Attraction"),
    isOpen: Boolean(ride.is_open),
    waitTime: Math.max(0, Number(ride.wait_time || 0)),
    lastUpdated: ride.last_updated || null
  };
  normalized.kind = classifyAttraction(normalized);
  return normalized;
}

async function fetchJSON(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function fetchPark(parkId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeout);
  try {
    const url = workerBase
      ? `${workerBase}/api/park/${parkId}`
      : `https://queue-times.com/parks/${parkId}/queue_times.json`;
    const payload = await fetchJSON(url, controller.signal);
    return normalizeParkPayload(parkId, payload);
  } finally {
    clearTimeout(timer);
  }
}

export class QueueData extends EventTarget {
  constructor() {
    super();
    this.byPark = new Map();
    this.updatedAt = null;
    this.error = null;
    this.refreshing = false;
    this.source = "live";
    this.#hydrateCache();
  }

  #hydrateCache() {
    const cache = loadQueueCache();
    for (const park of PARKS) {
      if (Array.isArray(cache?.parks?.[park.id])) this.byPark.set(park.id, cache.parks[park.id]);
    }
    this.updatedAt = cache.updatedAt || null;
    if (this.byPark.size) this.source = "cache";
  }

  allRides() {
    return [...this.byPark.values()].flat();
  }

  ridesForPark(parkId) {
    return this.byPark.get(Number(parkId)) || [];
  }

  rideById(id) {
    const target = Number(id);
    return this.allRides().find((ride) => ride.id === target) || null;
  }

  async refresh({ silent = false } = {}) {
    if (this.refreshing) return;
    this.refreshing = true;
    this.error = null;
    if (!silent) this.dispatchEvent(new CustomEvent("status", { detail: { refreshing: true } }));

    const results = await Promise.allSettled(PARKS.map(async (park) => [park.id, await fetchPark(park.id)]));
    let successes = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        const [parkId, rides] = result.value;
        this.byPark.set(parkId, rides);
        successes += 1;
      }
    }

    if (successes > 0) {
      this.updatedAt = new Date().toISOString();
      this.source = successes === PARKS.length ? "live" : "mixed";
      const parks = {};
      for (const [id, rides] of this.byPark.entries()) parks[id] = rides;
      saveQueueCache({ updatedAt: this.updatedAt, parks });
      appendHistory(this.allRides());
    } else {
      this.error = navigator.onLine
        ? "ParkPulse couldn't reach live wait times. Showing the most recent saved data instead."
        : "You're offline. ParkPulse is showing the most recent saved wait times.";
      this.source = this.byPark.size ? "cache" : "none";
    }

    this.refreshing = false;
    this.dispatchEvent(new CustomEvent("update", { detail: { successes, source: this.source, error: this.error } }));
  }
}

export const queueData = new QueueData();
