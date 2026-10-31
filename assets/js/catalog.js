// Shared, declarative resort and park metadata.
// Disabled parks are registered for future rollout but MUST NOT be polled or shown.
export const RESORTS = Object.freeze([
  Object.freeze({ id: "wdw", name: "Walt Disney World", short: "WDW", location: "Orlando, Florida", timezone: "America/New_York", enabled: true, parkIds: Object.freeze([6, 5, 7, 8]) }),
  Object.freeze({ id: "dlr", name: "Disneyland Resort", short: "DLR", location: "Anaheim, California", timezone: "America/Los_Angeles", enabled: false, parkIds: Object.freeze([16, 17]) })
]);

export const ALL_PARKS = Object.freeze([
  { id: 6, name: "Magic Kingdom", short: "MK", emoji: "🏰", resortId: "wdw", themeParksId: "75ea578a-adc8-4116-a54d-dccb60765ef9", enabled: true },
  { id: 5, name: "EPCOT", short: "EPCOT", emoji: "🌐", resortId: "wdw", themeParksId: "47f90d2c-e191-4239-a466-5892ef59a88b", enabled: true },
  { id: 7, name: "Hollywood Studios", short: "DHS", emoji: "🎬", resortId: "wdw", themeParksId: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", enabled: true },
  { id: 8, name: "Animal Kingdom", short: "AK", emoji: "🌿", resortId: "wdw", themeParksId: "1c84a229-8862-4648-9c71-378ddd2c7693", enabled: true },
  { id: 16, name: "Disneyland Park", short: "DL", emoji: "🏰", resortId: "dlr", themeParksId: "7340550b-c14d-4def-80bb-acdb51d49a66", enabled: false },
  { id: 17, name: "Disney California Adventure", short: "DCA", emoji: "🎡", resortId: "dlr", themeParksId: "832fcd51-ea19-4e77-85c7-75d5843b127c", enabled: false }
].map((park) => Object.freeze({
  ...park,
  timezone: RESORTS.find((resort) => resort.id === park.resortId).timezone
})));

export const RESORT_BY_ID = new Map(RESORTS.map((resort) => [resort.id, resort]));
export const PARK_BY_ID = new Map(ALL_PARKS.map((park) => [park.id, park]));
// Preserve the original WDW-only operational set until Disneyland's ride catalog is ready.
export const PARKS = Object.freeze(ALL_PARKS.filter((park) => park.enabled && RESORT_BY_ID.get(park.resortId)?.enabled));

export function parksForResort(resortId, { includeDisabled = false } = {}) {
  if (!RESORT_BY_ID.has(resortId)) return [];
  return ALL_PARKS.filter((park) => park.resortId === resortId &&
    (includeDisabled || (park.enabled && RESORT_BY_ID.get(resortId).enabled)));
}

export function resortForPark(parkId) {
  return RESORT_BY_ID.get(PARK_BY_ID.get(Number(parkId))?.resortId) || null;
}

export function parkTimezone(parkId) {
  return PARK_BY_ID.get(Number(parkId))?.timezone || "America/New_York";
}

export function parkName(parkId) {
  return PARK_BY_ID.get(Number(parkId))?.name || "Walt Disney World";
}
