export const PARKS = [
  { id: 6, name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  { id: 5, name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  { id: 7, name: "Hollywood Studios", short: "DHS", emoji: "🎬" },
  { id: 8, name: "Animal Kingdom", short: "AK", emoji: "🌿" }
];

export const PARK_BY_ID = new Map(PARKS.map((park) => [park.id, park]));
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function parkName(id) {
  return PARK_BY_ID.get(Number(id))?.name || "Walt Disney World";
}

export function normalizeRideName(value) {
  return String(value || "")
    .replace(/[®™]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\bsingle[\s-]*rider(?:\s+line|\s+queue)?\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function isSingleRiderName(name) {
  return /\bsingle[\s-]*rider\b/i.test(String(name || ""));
}

export function isRideStale(ride, now = Date.now()) {
  if (!ride || ride.sourceMissing || ride.sourceStale || !ride.lastUpdated) return true;
  const updated = new Date(ride.lastUpdated).getTime();
  return !Number.isFinite(updated) || now - updated > STALE_AFTER_MS;
}

export function minutesLabel(wait, isOpen) {
  if (!isOpen) return "Closed";
  const numeric = Number(wait);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Open";
  return `${Math.max(0, Math.round(numeric))} min`;
}

export function relativeTime(iso) {
  if (!iso) return "unavailable";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
