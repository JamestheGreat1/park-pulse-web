import { PARKS, RESORTS, parksForResort, resortForPark } from "./catalog.js?v=1.9.5";

const KEY = "parkpulse.rideWatcher.v1";

const defaults = {
  selectedParkId: Number(window.PARKPULSE_CONFIG?.DEFAULT_PARK_ID || 6),
  selectedResortId: "wdw",
  lastParkByResort: {},
  activeView: "explore",
  query: "",
  openOnly: false,
  sort: "recommended",
  theme: "system",
  accent: "blue",
  useLocalTime: true,
  favorites: [],
  favoritesOnly: false,
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
    delete this.state.mustDo;
    this.state.favorites = [...new Set((Array.isArray(saved.favorites) ? saved.favorites : []).filter(id => typeof id === "string" && id.length < 120))];
    if (!["recommended","wait","name"].includes(this.state.sort)) this.state.sort = "recommended";
    this.state.rules = Array.isArray(saved.rules) ? saved.rules.map(cleanRule).filter(Boolean) : [];
    if (!["blue","cyan","violet","pink","orange","green","red","gold"].includes(this.state.accent)) this.state.accent = "blue";
    if (typeof this.state.useLocalTime !== "boolean") this.state.useLocalTime = true;
    // Old installs only saved a park; derive their resort without resetting watches.
    const availableResorts = RESORTS.filter((resort) => resort.enabled && parksForResort(resort.id).length);
    const savedPark = PARKS.find((park) => park.id === Number(saved.selectedParkId));
    const savedResort = availableResorts.find((resort) => resort.id === saved.selectedResortId);
    const activeResort = savedResort ||
      availableResorts.find((resort) => resort.id === savedPark?.resortId) ||
      availableResorts[0];
    this.state.selectedResortId = activeResort?.id || "wdw";
    const previous = saved.lastParkByResort && typeof saved.lastParkByResort === "object"
      && !Array.isArray(saved.lastParkByResort) ? saved.lastParkByResort : {};
    this.state.lastParkByResort = {};
    for (const resort of availableResorts) {
      const parks = parksForResort(resort.id);
      const last = parks.find((park) => park.id === Number(previous[resort.id])) ||
        (savedPark?.resortId === resort.id ? savedPark : null) || parks[0];
      if (last) this.state.lastParkByResort[resort.id] = last.id;
    }
    const selectedPark = parksForResort(this.state.selectedResortId)
      .find((park) => park.id === Number(saved.selectedParkId));
    this.state.selectedParkId = selectedPark?.id ??
      this.state.lastParkByResort[this.state.selectedResortId] ?? defaults.selectedParkId;
    this.state.lastParkByResort[this.state.selectedResortId] = this.state.selectedParkId;
    if (!["explore", "watching", "resorts", "settings"].includes(this.state.activeView)) this.state.activeView = "explore";
    this.pruneExpired(false);
  }
  get snapshot() { return structuredClone(this.state); }
  update(mutator, reason = "state") {
    mutator(this.state);
    this.pruneExpired(false);
    localStorage.setItem(KEY, JSON.stringify(this.state));
    this.dispatchEvent(new CustomEvent("change", { detail: { reason } }));
  }
  selectResort(resortId) {
    const resort = RESORTS.find((item) => item.id === resortId && item.enabled);
    const parks = resort ? parksForResort(resort.id) : [];
    if (!parks.length) return false;
    this.update((state) => {
      state.lastParkByResort[state.selectedResortId] = state.selectedParkId;
      const selectedPark = parks.find((park) =>
        park.id === Number(state.lastParkByResort[resort.id])) || parks[0];
      state.selectedResortId = resort.id;
      state.selectedParkId = selectedPark.id;
      state.lastParkByResort[resort.id] = selectedPark.id;
      state.activeView = "explore";
      state.query = "";
    }, "resort");
    return true;
  }
  selectPark(parkId) {
    const park = PARKS.find((item) => item.id === Number(parkId));
    const resort = park && resortForPark(park.id);
    if (!park || !resort?.enabled) return false;
    this.update((state) => {
      state.selectedResortId = resort.id;
      state.selectedParkId = park.id;
      state.lastParkByResort[resort.id] = park.id;
      state.query = "";
    }, "park");
    return true;
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
