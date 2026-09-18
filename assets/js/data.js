export const VERSION = "0.15.2";

export const PARKS = Object.freeze([
  { id: 6, name: "Magic Kingdom", shortName: "Magic Kingdom", icon: "✦" },
  { id: 5, name: "EPCOT", shortName: "EPCOT", icon: "◉" },
  { id: 7, name: "Disney's Hollywood Studios", shortName: "Hollywood Studios", icon: "★" },
  { id: 8, name: "Disney's Animal Kingdom", shortName: "Animal Kingdom", icon: "◌" }
]);

export const PARK_BY_ID = new Map(PARKS.map((park) => [park.id, park]));

const SHOW_IDS = new Set([125, 171, 334, 356, 457, 1214]);
const SHOW_KEYWORDS = [
  "philharmagic", "musical jamboree", "tiki room", "hall of presidents",
  "carousel of progress", "laugh floor", "festival of the lion king", "finding nemo",
  "beauty and the beast", "indiana jones epic stunt spectacular", "for the first time in forever",
  "muppet", "awesome planet", "impressions de france", "reflections of china",
  "the american adventure", "feathered friends", "walt disney presents", "disney junior",
  "voyage of the little mermaid", "musical adventure", "short film festival", "turtle talk",
  "canada far and wide", "vacation fun", "zootopia", "enchanted tales with belle"
];
const OTHER_KEYWORDS = [
  "meet ", "greeting", "character", "playground", "play area", "splash 'n' soak",
  "splash n' soak", "cinderella castle", "treasures of the seven seas", "wilderness explorers",
  "affection section", "conservation station", "animal care", "bluey's wild world",
  "discovery island trails", "gorilla falls", "maharajah jungle trek", "journey of water",
  "seabase aquarium", "oasis exhibits", "tree of life", "swiss family treehouse",
  "tom sawyer island", "restaurant", "tavern", "canteen", "royal table", "be our guest",
  "crystal palace"
];

export function classifyAttraction(ride) {
  const normalized = String(ride?.name || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (SHOW_IDS.has(Number(ride?.id)) || SHOW_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "show";
  if (OTHER_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "other";
  return "ride";
}

export const PRIORITIES = Object.freeze([
  { value: 0, key: "skip", label: "Skip", icon: "⊘" },
  { value: 1, key: "convenient", label: "If Convenient", icon: "○" },
  { value: 2, key: "want", label: "Want To Do", icon: "☆" },
  { value: 3, key: "must", label: "Must Do", icon: "★" }
]);

export const ACCENTS = Object.freeze({
  blue: { label: "Blue", hex: "#5cc8ff", rgb: "92 200 255" },
  teal: { label: "Teal", hex: "#48d6c5", rgb: "72 214 197" },
  indigo: { label: "Indigo", hex: "#8e9eff", rgb: "142 158 255" },
  purple: { label: "Purple", hex: "#c29cff", rgb: "194 156 255" },
  pink: { label: "Pink", hex: "#ff91c8", rgb: "255 145 200" },
  red: { label: "Red", hex: "#ff8a8a", rgb: "255 138 138" },
  orange: { label: "Orange", hex: "#ffb16b", rgb: "255 177 107" },
  green: { label: "Green", hex: "#73d99a", rgb: "115 217 154" }
});

export const CUSTOM_BLOCK_KINDS = Object.freeze([
  { key: "meal", label: "Meal", icon: "🍽" },
  { key: "break", label: "Break", icon: "☕" },
  { key: "transit", label: "Park Hop / Transit", icon: "↗" },
  { key: "note", label: "Note", icon: "✎" }
]);

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parkName(id) {
  return PARK_BY_ID.get(Number(id))?.shortName || "Walt Disney World";
}
