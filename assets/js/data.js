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
