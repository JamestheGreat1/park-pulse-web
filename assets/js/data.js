export const PARKS = [
  { id: 6, name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  { id: 5, name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  { id: 7, name: "Hollywood Studios", short: "DHS", emoji: "🎬" },
  { id: 8, name: "Animal Kingdom", short: "AK", emoji: "🌿" }
];

export const PARK_BY_ID = new Map(PARKS.map((park) => [park.id, park]));
export const STALE_AFTER_MS = 15 * 60 * 1000;

const RIDE_CATALOG = new Map([
  [6, [
    ["Jungle Cruise"],
    ["Pirates of the Caribbean"],
    ["The Magic Carpets of Aladdin"],
    ["it's a small world"],
    ["Dumbo the Flying Elephant"],
    ["Mad Tea Party"],
    ["Peter Pan's Flight"],
    ["Prince Charming Regal Carrousel"],
    ["Seven Dwarfs Mine Train"],
    ["The Barnstormer"],
    ["The Many Adventures of Winnie the Pooh"],
    ["Under the Sea - Journey of The Little Mermaid"],
    ["Big Thunder Mountain Railroad"],
    ["Tiana's Bayou Adventure"],
    ["Haunted Mansion"],
    ["Astro Orbiter"],
    ["Buzz Lightyear's Space Ranger Spin"],
    ["Space Mountain"],
    ["Tomorrowland Speedway"],
    ["Tomorrowland Transit Authority PeopleMover"],
    ["TRON Lightcycle / Run"],
    ["Walt Disney World Railroad", null, ["Walt Disney World Railroad - Fantasyland", "Walt Disney World Railroad - Main Street, U.S.A."]]
  ]],
  [5, [
    ["Journey Into Imagination With Figment"],
    ["Spaceship Earth"],
    ["Guardians of the Galaxy: Cosmic Rewind"],
    ["Mission: SPACE"],
    ["Test Track", null, ["Test Track Presented by Chevrolet"]],
    ["Living with the Land"],
    ["Soarin' Across America"],
    ["The Seas with Nemo & Friends"],
    ["Frozen Ever After"],
    ["Gran Fiesta Tour Starring The Three Caballeros"],
    ["Remy's Ratatouille Adventure", 10914]
  ]],
  [7, [
    ["Star Tours - The Adventures Continue", null, ["Star Tours – The Adventures Continue"]],
    ["Mickey & Minnie's Runaway Railway"],
    ["Toy Story Mania!"],
    ["Millennium Falcon: Smugglers Run"],
    ["Star Wars: Rise of the Resistance"],
    ["Rock 'n' Roller Coaster Starring The Muppets", null, ["Rock 'n' Roller Coaster Starring Aerosmith"]],
    ["The Twilight Zone Tower of Terror", null, ["The Twilight Zone™ Tower of Terror"]],
    ["Alien Swirling Saucers"],
    ["Slinky Dog Dash"]
  ]],
  [8, [
    ["Kilimanjaro Safaris"],
    ["Wildlife Express Train"],
    ["Expedition Everest", null, ["Expedition Everest - Legend of the Forbidden Mountain"]],
    ["Kali River Rapids"],
    ["Avatar Flight of Passage"],
    ["Na'vi River Journey"]
  ]]
]);

const SHOW_PATTERNS = [
  /\bshow\b/i, /\blive on stage\b/i, /\bsing[- ]along\b/i,
  /\bstunt spectacular\b/i, /\bconcert\b/i, /\bparade\b/i,
  /\bcavalcade\b/i, /\bfireworks\b/i, /\btheater\b/i, /\btheatre\b/i,
  /philharmagic/i, /laugh floor/i, /turtle talk/i,
  /festival of the lion king/i, /finding nemo.*big blue/i,
  /hall of presidents/i, /country bear.*jamboree/i,
  /enchanted tiki room/i, /carousel of progress/i, /enchanted tales with belle/i,
  /short film festival/i, /canada far and wide/i, /awesome planet/i,
  /zootopia: better zoogether/i, /feathered friends in flight/i
];

const NAME_OVERRIDES = new Map([
  ["expedition everest - legend of the forbidden mountain", "Expedition Everest"],
  ["test track presented by chevrolet", "Test Track"],
  ["the twilight zone tower of terror", "The Twilight Zone Tower of Terror"]
]);

export function parkName(id) {
  return PARK_BY_ID.get(Number(id))?.name || "Walt Disney World";
}

export function cleanAttractionName(name) {
  let value = String(name || "Attraction")
    .replace(/[®™]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

  value = value
    .replace(/\s+-\s+single[\s-]*rider(?:\s+line|\s+queue)?$/i, "")
    .replace(/\s*\(single[\s-]*rider(?:\s+line|\s+queue)?\)$/i, "")
    .replace(/\s+\|\s+/g, " · ")
    .trim();

  return NAME_OVERRIDES.get(value.toLowerCase()) || value || "Attraction";
}

function key(value) {
  return cleanAttractionName(value).toLowerCase();
}

export function isSingleRiderName(name) {
  return /\bsingle[\s-]*rider\b/i.test(String(name || ""));
}

export function catalogRide(parkId, name, rideId = null) {
  const list = RIDE_CATALOG.get(Number(parkId)) || [];
  const cleaned = key(name);
  const numericId = Number(rideId);
  for (const [canonicalName, id, aliases = []] of list) {
    if (id && numericId === Number(id)) return { id: Number(id), name: canonicalName };
    if ([canonicalName, ...aliases].some((alias) => key(alias) === cleaned)) {
      return { id: id ? Number(id) : (Number.isFinite(numericId) ? numericId : null), name: canonicalName };
    }
  }
  return null;
}

export function catalogPlaceholders(parkId, liveRides) {
  const ids = new Set(liveRides.map((ride) => Number(ride.id)));
  return (RIDE_CATALOG.get(Number(parkId)) || [])
    .filter(([, id]) => id && !ids.has(Number(id)))
    .map(([name, id]) => ({
      id: Number(id),
      parkId: Number(parkId),
      name,
      rawName: name,
      land: Number(parkId) === 5 && Number(id) === 10914 ? "World Showcase" : "Other",
      kind: "ride",
      isOpen: false,
      waitTime: 0,
      lastUpdated: null,
      sourceMissing: true
    }));
}

export function attractionKind(parkId, name, rideId = null) {
  if (catalogRide(parkId, name, rideId)) return "ride";
  const value = cleanAttractionName(name);
  if (SHOW_PATTERNS.some((pattern) => pattern.test(value))) return "show";
  return "other";
}

export function isRideStale(ride, now = Date.now()) {
  if (!ride || ride.sourceMissing || !ride.lastUpdated) return true;
  const updated = new Date(ride.lastUpdated).getTime();
  return !Number.isFinite(updated) || now - updated > STALE_AFTER_MS;
}

export function minutesLabel(wait, isOpen) {
  if (!isOpen) return "Closed";
  const value = Math.max(0, Number(wait || 0));
  return value > 0 ? `${value} min` : "Open";
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
