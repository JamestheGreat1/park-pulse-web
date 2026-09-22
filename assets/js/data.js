export const PARKS = [
  { id: 6, name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  { id: 5, name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  { id: 7, name: "Hollywood Studios", short: "DHS", emoji: "🎬" },
  { id: 8, name: "Animal Kingdom", short: "AK", emoji: "🌿" }
];

export const PARK_BY_ID = new Map(PARKS.map((park) => [park.id, park]));

const SHOW_PATTERNS = [
  /\bshow\b/i,
  /\blive on stage\b/i,
  /\bsing[- ]along\b/i,
  /\bstunt spectacular\b/i,
  /\bconcert\b/i,
  /\bparade\b/i,
  /\bcavalcade\b/i,
  /\bfireworks\b/i,
  /\btheater\b/i,
  /\btheatre\b/i,
  /philharmagic/i,
  /laugh floor/i,
  /turtle talk/i,
  /festival of the lion king/i,
  /finding nemo.*big blue/i,
  /hall of presidents/i,
  /country bear.*jamboree/i
];

const CLEAN_NAMES = new Map([
  ['"it\'s a small world"', "It's a Small World"],
  ["'it's a small world'", "It's a Small World"],
  ["it's a small world", "It's a Small World"]
]);

export function parkName(id) {
  return PARK_BY_ID.get(Number(id))?.name || "Walt Disney World";
}

export function isSingleRiderName(name) {
  return /\bsingle[\s-]*rider\b/i.test(String(name || ""));
}

export function isShowName(name) {
  const value = String(name || "");
  return SHOW_PATTERNS.some((pattern) => pattern.test(value));
}

export function cleanAttractionName(name) {
  let value = String(name || "Attraction")
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

  const known = CLEAN_NAMES.get(value.toLowerCase());
  if (known) return known;

  value = value
    .replace(/\s+[–—-]\s+single[\s-]*rider(?:\s+line)?$/i, "")
    .replace(/\s*\(single[\s-]*rider\)$/i, "")
    .replace(/\s+\|\s+/g, " · ")
    .trim();

  return value || "Attraction";
}

export function minutesLabel(wait, isOpen) {
  if (!isOpen) return "Closed";
  const value = Math.max(0, Number(wait || 0));
  return value > 0 ? `${value} min` : "Open";
}

export function relativeTime(iso) {
  if (!iso) return "just now";
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
