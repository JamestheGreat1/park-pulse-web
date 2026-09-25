const KEY = "parkpulse.rideWatcher.v1";

const defaults = {
  selectedParkId: Number(window.PARKPULSE_CONFIG?.DEFAULT_PARK_ID || 6),
  activeView: "explore",
  query: "",
  openOnly: false,
  sort: "recommended",
  theme: "system",
  accent: "blue",
  favorites: [],
  mustDo: [],
  favoritesOnly: false,
  parkDay: {
    active: false,
    parkId: null,
    startedAt: null,
    expiresAt: null,
    currentRideId: null,
    completedRideIds: []
  },
  rules: []
};

function parse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function cleanRule(rule) {
  if (!rule || rule.rideId == null || String(rule.rideId).trim() === "") return null;
  return {
    rideId: String(rule.rideId),
    parkId: Number(rule.parkId),
    rideName: String(rule.rideName || "Attraction"),
    land: String(rule.land || ""),
    reopen: rule.reopen !== false,
    threshold: rule.threshold == null || rule.threshold === "" ? null : Math.max(5, Math.min(300, Number(rule.threshold))),
    expiresAt: rule.expiresAt == null ? null : Number(rule.expiresAt),
    createdAt: Number(rule.createdAt || Date.now())
  };
}

export class Store extends EventTarget {
  constructor() {
    super();
    const saved = parse(localStorage.getItem(KEY), {});
    this.state = { ...defaults, ...saved };
    this.state.favorites = [...new Set((Array.isArray(saved.favorites) ? saved.favorites : []).filter(id => typeof id === "string" && id.length < 120))];
    this.state.mustDo = [...new Set((Array.isArray(saved.mustDo) ? saved.mustDo : []).filter(id => typeof id === "string" && id.length < 120))];
    const savedParkDay = saved.parkDay && typeof saved.parkDay === "object" ? saved.parkDay : {};
    const parkDayExpired = Number(savedParkDay.expiresAt || 0) > 0 && Number(savedParkDay.expiresAt) <= Date.now();
    this.state.parkDay = {
      active: Boolean(savedParkDay.active) && !parkDayExpired,
      parkId: Number.isFinite(Number(savedParkDay.parkId)) ? Number(savedParkDay.parkId) : null,
      startedAt: Number.isFinite(Number(savedParkDay.startedAt)) ? Number(savedParkDay.startedAt) : null,
      expiresAt: Number.isFinite(Number(savedParkDay.expiresAt)) ? Number(savedParkDay.expiresAt) : null,
      currentRideId: typeof savedParkDay.currentRideId === "string" ? savedParkDay.currentRideId : null,
      completedRideIds: [...new Set((Array.isArray(savedParkDay.completedRideIds) ? savedParkDay.completedRideIds : []).filter(id => typeof id === "string" && id.length < 120))]
    };
    if (!this.state.parkDay.active) this.state.parkDay.currentRideId = null;
    this.state.rules = Array.isArray(saved.rules) ? saved.rules.map(cleanRule).filter(Boolean) : [];
    if (!["blue","cyan","violet","pink","orange","green","red","gold"].includes(this.state.accent)) this.state.accent = "blue";
    this.pruneExpired(false);
  }
  get snapshot() { return structuredClone(this.state); }
  update(mutator, reason = "state") {
    mutator(this.state);
    this.pruneExpired(false);
    localStorage.setItem(KEY, JSON.stringify(this.state));
    this.dispatchEvent(new CustomEvent("change", { detail: { reason } }));
  }
  pruneExpired(emit = true) {
    const before = this.state.rules.length;
    const now = Date.now();
    this.state.rules = this.state.rules.filter((rule) => !rule.expiresAt || rule.expiresAt > now);
    if (before !== this.state.rules.length) {
      localStorage.setItem(KEY, JSON.stringify(this.state));
      if (emit) this.dispatchEvent(new CustomEvent("change", { detail: { reason: "expired" } }));
    }
  }
  toggleFavorite(rideId) {
    this.update(state => {
      const id = String(rideId);
      state.favorites = state.favorites.includes(id) ? state.favorites.filter(item => item !== id) : [...state.favorites, id];
    }, "preferences");
  }
  setMustDo(rideId, enabled) {
    this.update(state => {
      state.mustDo = state.mustDo.filter(id => id !== String(rideId));
      if (enabled) state.mustDo.push(String(rideId));
    }, "preferences");
  }
  startParkDay(parkId, expiresAt) {
    this.update(state => {
      state.parkDay = {
        active: true,
        parkId: Number(parkId),
        startedAt: Date.now(),
        expiresAt: Number(expiresAt) || null,
        currentRideId: null,
        completedRideIds: []
      };
    }, "park-day");
  }
  endParkDay() {
    this.update(state => {
      state.parkDay = {
        active: false,
        parkId: null,
        startedAt: null,
        expiresAt: null,
        currentRideId: null,
        completedRideIds: []
      };
    }, "park-day");
  }
  setParkDayCurrent(rideId, parkId = null) {
    this.update(state => {
      if (!state.parkDay?.active) return;
      state.parkDay.currentRideId = rideId == null ? null : String(rideId);
      if (parkId != null && Number.isFinite(Number(parkId))) state.parkDay.parkId = Number(parkId);
    }, "park-day");
  }
  completeParkDayRide(rideId) {
    this.update(state => {
      if (!state.parkDay?.active) return;
      const id = String(rideId);
      state.parkDay.completedRideIds = [...new Set([...(state.parkDay.completedRideIds || []), id])];
      if (String(state.parkDay.currentRideId || "") === id) state.parkDay.currentRideId = null;
    }, "park-day");
  }
  uncompleteParkDayRide(rideId) {
    this.update(state => {
      if (!state.parkDay?.active) return;
      const id = String(rideId);
      state.parkDay.completedRideIds = (state.parkDay.completedRideIds || []).filter(item => String(item) !== id);
    }, "park-day");
  }
  ruleForRide(rideId) {
    this.pruneExpired(false);
    return this.state.rules.find((rule) => String(rule.rideId) === String(rideId)) || null;
  }
  saveRule(rule) {
    const cleaned = cleanRule(rule);
    if (!cleaned) return;
    this.update((state) => {
      state.rules = state.rules.filter((item) => String(item.rideId) !== String(cleaned.rideId));
      state.rules.push(cleaned);
    }, "rules");
  }
  removeRule(rideId) {
    this.update((state) => {
      state.rules = state.rules.filter((rule) => String(rule.rideId) !== String(rideId));
    }, "rules");
  }
}

export const store = new Store();
