export const PARKS = [
  { id: 6, name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  { id: 5, name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  { id: 7, name: "Hollywood Studios", short: "DHS", emoji: "🎬" },
  { id: 8, name: "Animal Kingdom", short: "AK", emoji: "🌿" }
];

export const PARK_BY_ID = new Map(PARKS.map((park) => [park.id, park]));

export function parkName(id) {
  return PARK_BY_ID.get(Number(id))?.name || "Walt Disney World";
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


const SINGLE_RIDER_RE = /(?:^|[-–—:()\s])single\s*rider(?:\s*line|\s*queue)?(?:$|[-–—:()\s])/i;

const SHOW_PATTERNS = [
  /\bshow\b/i,
  /\bmusical\b/i,
  /\bsing[- ]along\b/i,
  /\bconcert\b/i,
  /\btheater\b/i,
  /\btheatre\b/i,
  /\bencanto\b/i,
  /\bbeauty and the beast live on stage\b/i,
  /\bfestival of the lion king\b/i,
  /\bfinding nemo.*big blue/i,
  /\bindiana jones.*stunt/i,
  /\bfrozen.*sing/i,
  /\bmonsters,? inc\..*laugh floor\b/i,
  /\bmickey['’]s philharmagic\b/i,
  /\bhall of presidents\b/i,
  /\bcountry bear musical jamboree\b/i,
  /\benchanted tiki room\b/i
];

const NAME_OVERRIDES = new Map([
  ["A Pirate's Adventure ~ Treasures of the Seven Seas", "A Pirate's Adventure"],
  ["Expedition Everest - Legend of the Forbidden Mountain", "Expedition Everest"]
]);

export function cleanAttractionName(value) {
  let name = String(value || "Attraction").trim();
  name = NAME_OVERRIDES.get(name) || name;
  name = name
    .replace(/[™®]/g, "")
    .replace(/^["“](.+)["”]$/, "$1")
    .replace(/\s*[~]\s*/g, " – ")
    .replace(/\s+/g, " ")
    .trim();
  return name;
}

export function isSingleRiderName(value) {
  return SINGLE_RIDER_RE.test(String(value || ""));
}

export function attractionKind(value) {
  const name = cleanAttractionName(value);
  return SHOW_PATTERNS.some((pattern) => pattern.test(name)) ? "show" : "ride";
}
