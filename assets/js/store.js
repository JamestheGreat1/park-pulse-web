const KEY = "parkpulse.rideWatcher.v1";

const defaults = {
  selectedParkId: Number(window.PARKPULSE_CONFIG?.DEFAULT_PARK_ID || 6),
  activeView: "explore",
  query: "",
  openOnly: false,
  sort: "recommended",
  theme: "system",
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
    this.state.rules = Array.isArray(saved.rules) ? saved.rules.map(cleanRule).filter(Boolean) : [];
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
