// These are *known* ride/show variants, not arbitrary feed aliases.
// Only a fresh observed provider name can activate one; ride keys never change.
// New aliases must also be configured on the matching park's curated catalog.
export const LIVE_RIDE_VARIANTS = Object.freeze({
  "mk:jungle-cruise": [
    "Jingle Cruise"
  ],
  "dl:small-world": [
    '"it\'s a small world" Holiday'
  ],
  "dl:haunted-mansion": [
    "Haunted Mansion Holiday"
  ],
  "dl:space-mountain": [
    "Hyperspace Mountain",
    "Space Mountain Ghost Galaxy"
  ],
  "dca:guardians": [
    "Guardians of the Galaxy – Monsters After Dark"
  ],
  "dca:luigis": [
    "Luigi's Honkin' Haul-O-Ween",
    "Luigi's Joy to the Whirl"
  ],
  "dca:maters": [
    "Mater's Graveyard JamBOOree",
    "Mater's Jingle Jamboree"
  ],
  "dca:soarin": [
    "Soarin' Around the World",
    "Soarin' Over California"
  ],
  "epcot:soarin": [
    "Soarin' Around the World"
  ]
});

const normalize = value => String(value || "")
  .replace(/[®™]/g, "")
  .replace(/[’‘]/g, "'")
  .replace(/[–—]/g, "-")
  .replace(/[^a-z0-9]+/gi, " ")
  .trim().toLowerCase();

export function liveRideDisplayName(catalogRide, observedRide, fresh) {
  const canonical = String(catalogRide?.name || observedRide?.name || "Attraction");
  if (!fresh || !catalogRide || !observedRide) return canonical;
  const sourceName = normalize(observedRide.rawName);
  if (!sourceName) return canonical;
  for (const variant of LIVE_RIDE_VARIANTS[catalogRide.key] || []) {
    if (normalize(variant) === sourceName) return variant;
  }
  return canonical;
}
