import { todayKey } from "./data.js";

const STATE_KEY = "parkpulse.state.v0152";
const QUEUE_CACHE_KEY = "parkpulse.queueCache.v1";
const HISTORY_KEY = "parkpulse.waitHistory.v1";
const SCROLL_KEY = "parkpulse.scrollPositions.v1";

function uid(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultState() {
  return {
    selectedParkId: 6,
    activeTab: "for-you",
    favorites: [],
    priorities: {},
    itinerary: [],
    appearance: { theme: "system", accent: "blue" },
    waits: { query: "", filter: "rides", openOnly: false },
    parkDay: { active: false, startedAt: null, skippedUids: [] },
    daily: { date: todayKey(), doneUids: [], riddenRideIds: [] },
    onboardingDismissed: false,
    planEditMode: false
  };
}

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export class ParkPulseStore extends EventTarget {
  constructor() {
    super();
    const saved = safeParse(localStorage.getItem(STATE_KEY), {});
    this.state = this.#sanitize({ ...defaultState(), ...saved });
    this.#rollDateIfNeeded();
  }

  #sanitize(state) {
    state.favorites = Array.isArray(state.favorites) ? [...new Set(state.favorites.map(Number).filter(Number.isFinite))] : [];
    state.priorities = state.priorities && typeof state.priorities === "object" ? state.priorities : {};
    state.itinerary = Array.isArray(state.itinerary) ? state.itinerary.filter(Boolean) : [];
    state.appearance = { ...defaultState().appearance, ...(state.appearance || {}) };
    state.waits = { ...defaultState().waits, ...(state.waits || {}) };
    state.parkDay = { ...defaultState().parkDay, ...(state.parkDay || {}) };
    state.daily = { ...defaultState().daily, ...(state.daily || {}) };
    return state;
  }

  #rollDateIfNeeded() {
    const today = todayKey();
    if (this.state.daily.date !== today) {
      this.state.daily = { date: today, doneUids: [], riddenRideIds: [] };
      this.state.parkDay = { active: false, startedAt: null, skippedUids: [] };
      this.#persist(false);
    }
  }

  get snapshot() {
    this.#rollDateIfNeeded();
    return structuredClone(this.state);
  }

  update(mutator, reason = "state") {
    this.#rollDateIfNeeded();
    mutator(this.state);
    this.#persist(true, reason);
  }

  replace(nextState, reason = "state") {
    this.state = this.#sanitize(nextState);
    this.#rollDateIfNeeded();
    this.#persist(true, reason);
  }

  #persist(emit = true, reason = "state") {
    localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    if (emit) this.dispatchEvent(new CustomEvent("change", { detail: { reason } }));
  }

  addRideToPlan(ride, { afterUid = null } = {}) {
    if (!ride) return;
    const exists = this.state.itinerary.some((item) => item.type === "ride" && Number(item.rideId) === Number(ride.id));
    if (exists) return;
    const item = { uid: uid("ride"), type: "ride", rideId: Number(ride.id), parkId: Number(ride.parkId), name: ride.name };
    this.update((state) => {
      if (!afterUid) state.itinerary.push(item);
      else {
        const index = state.itinerary.findIndex((entry) => entry.uid === afterUid);
        state.itinerary.splice(index >= 0 ? index + 1 : state.itinerary.length, 0, item);
      }
    }, "itinerary");
  }

  addCustomBlock(block) {
    const kind = block.kind || "note";
    this.update((state) => state.itinerary.push({
      uid: uid("block"),
      type: "custom",
      kind,
      title: String(block.title || "Plan block").trim() || "Plan block",
      note: String(block.note || "").trim(),
      parkId: Number(block.parkId || state.selectedParkId),
      time: String(block.time || "")
    }), "itinerary");
  }

  resetAll() {
    this.state = defaultState();
    this.#persist(true, "reset");
    localStorage.removeItem(QUEUE_CACHE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SCROLL_KEY);
  }
}

export const store = new ParkPulseStore();

export function loadQueueCache() {
  return safeParse(localStorage.getItem(QUEUE_CACHE_KEY), {});
}

export function saveQueueCache(cache) {
  localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(cache));
}

export function loadHistory() {
  return safeParse(localStorage.getItem(HISTORY_KEY), {});
}

export function appendHistory(rides) {
  const history = loadHistory();
  const now = Date.now();
  for (const ride of rides) {
    const key = String(ride.id);
    const samples = Array.isArray(history[key]) ? history[key] : [];
    const last = samples.at(-1);
    if (!last || now - last.t >= 4 * 60 * 1000 || last.w !== ride.waitTime || last.o !== ride.isOpen) {
      samples.push({ t: now, w: ride.waitTime, o: ride.isOpen });
    }
    history[key] = samples.slice(-36);
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getScrollPositions() {
  return safeParse(sessionStorage.getItem(SCROLL_KEY), {});
}

export function setScrollPosition(tab, y) {
  const positions = getScrollPositions();
  positions[tab] = Math.max(0, Math.round(y));
  sessionStorage.setItem(SCROLL_KEY, JSON.stringify(positions));
}
