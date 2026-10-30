// Phase 2: manually curated, queueable attractions from the Disneyland Resort.
// WDW is not changed by these lists. The resort/parks remain disabled in the shared
// catalog until live matching and production capacity have been reviewed.
// Keys are ParkPulse-owned and stable across renames and seasonal overlays.
const ride = (key, name, land, aliases = []) => Object.freeze({
  key, name, land, aliases: Object.freeze(aliases)
});

export const DISNEYLAND_RIDES = new Map([
  [16, Object.freeze([
    // Adventureland
    ride("dl:indiana-jones", "Indiana Jones Adventure", "Adventureland", ["Indiana Jones™ Adventure"]),
    ride("dl:jungle-cruise", "Jungle Cruise", "Adventureland"),
    // Bayou Country
    ride("dl:canoes", "Davy Crockett's Explorer Canoes", "Bayou Country"),
    ride("dl:winnie-the-pooh", "The Many Adventures of Winnie the Pooh", "Bayou Country"),
    ride("dl:tianas", "Tiana's Bayou Adventure", "Bayou Country"),
    // Fantasyland
    ride("dl:small-world", "it's a small world", "Fantasyland", ["\"it's a small world\"", "it's a small world Holiday"]),
    ride("dl:alice", "Alice in Wonderland", "Fantasyland"),
    ride("dl:casey-jr", "Casey Jr. Circus Train", "Fantasyland"),
    ride("dl:dumbo", "Dumbo the Flying Elephant", "Fantasyland"),
    ride("dl:carrousel", "King Arthur Carrousel", "Fantasyland"),
    ride("dl:mad-tea-party", "Mad Tea Party", "Fantasyland"),
    ride("dl:matterhorn", "Matterhorn Bobsleds", "Fantasyland"),
    ride("dl:mr-toad", "Mr. Toad's Wild Ride", "Fantasyland"),
    ride("dl:peter-pan", "Peter Pan's Flight", "Fantasyland"),
    ride("dl:pinocchio", "Pinocchio's Daring Journey", "Fantasyland"),
    ride("dl:snow-white", "Snow White's Enchanted Wish", "Fantasyland"),
    ride("dl:storybook-land", "Storybook Land Canal Boats", "Fantasyland"),
    // Frontierland
    ride("dl:big-thunder", "Big Thunder Mountain Railroad", "Frontierland"),
    ride("dl:mark-twain", "Mark Twain Riverboat", "Frontierland"),
    ride("dl:columbia", "Sailing Ship Columbia", "Frontierland"),
    // Main Street, U.S.A.
    ride("dl:railroad", "Disneyland Railroad", "Main Street, U.S.A."),
    // Mickey's Toontown
    ride("dl:gadgetcoaster", "Chip 'n' Dale's GADGETcoaster", "Mickey's Toontown", ["Gadget's Go Coaster"]),
    ride("dl:runaway-railway", "Mickey & Minnie's Runaway Railway", "Mickey's Toontown"),
    ride("dl:roger-rabbit", "Roger Rabbit's Car Toon Spin", "Mickey's Toontown"),
    // New Orleans Square
    ride("dl:haunted-mansion", "Haunted Mansion", "New Orleans Square", ["Haunted Mansion Holiday"]),
    ride("dl:pirates", "Pirates of the Caribbean", "New Orleans Square"),
    // Star Wars: Galaxy's Edge
    ride("dl:smugglers-run", "Millennium Falcon: Smugglers Run", "Star Wars: Galaxy's Edge"),
    ride("dl:rise", "Star Wars: Rise of the Resistance", "Star Wars: Galaxy's Edge"),
    // Tomorrowland
    ride("dl:astro-orbitor", "Astro Orbitor", "Tomorrowland", ["Astro Orbiter"]),
    ride("dl:autopia", "Autopia", "Tomorrowland"),
    ride("dl:buzz", "Buzz Lightyear Astro Blasters", "Tomorrowland"),
    ride("dl:monorail", "Disneyland Monorail", "Tomorrowland"),
    ride("dl:nemo", "Finding Nemo Submarine Voyage", "Tomorrowland"),
    ride("dl:space-mountain", "Space Mountain", "Tomorrowland", ["Hyperspace Mountain", "Space Mountain Ghost Galaxy"]),
    ride("dl:star-tours", "Star Tours - The Adventures Continue", "Tomorrowland")
  ])],
  [17, Object.freeze([
    // Avengers Campus
    ride("dca:guardians", "Guardians of the Galaxy - Mission: BREAKOUT!", "Avengers Campus", [
      "Guardians of the Galaxy - Monsters After Dark", "Guardians of the Galaxy: Monsters After Dark",
      "Guardians of the Galaxy - Mission BREAKOUT!"
    ]),
    ride("dca:web-slingers", "WEB SLINGERS: A Spider-Man Adventure", "Avengers Campus", [
      "WEB SLINGERS: A Spider-Man Adventure presented by WEB"
    ]),
    // Cars Land
    ride("dca:luigis", "Luigi's Rollickin' Roadsters", "Cars Land", ["Luigi's Honkin' Haul-O-Ween"]),
    ride("dca:radiator-springs", "Radiator Springs Racers", "Cars Land"),
    ride("dca:maters", "Mater's Junkyard Jamboree", "Cars Land", ["Mater's Graveyard JamBOOree"]),
    // Grizzly Peak
    ride("dca:grizzly", "Grizzly River Run", "Grizzly Peak"),
    ride("dca:soarin", "Soarin' Across America", "Grizzly Peak", [
      "Soarin' Around the World", "Soarin' Over California", "Soarin’ Across America"
    ]),
    // Hollywood Land
    ride("dca:monsters", "Monsters, Inc. Mike & Sulley to the Rescue!", "Hollywood Land", [
      "Monsters, Inc. Mike & Sulley to the Rescue"
    ]),
    // Paradise Gardens Park
    ride("dca:golden-zephyr", "Golden Zephyr", "Paradise Gardens Park"),
    ride("dca:goofys-sky-school", "Goofy's Sky School", "Paradise Gardens Park"),
    ride("dca:silly-symphony", "Silly Symphony Swings", "Paradise Gardens Park"),
    ride("dca:little-mermaid", "The Little Mermaid - Ariel's Undersea Adventure", "Paradise Gardens Park"),
    // Pixar Pier
    ride("dca:incredicoaster", "Incredicoaster", "Pixar Pier"),
    ride("dca:inside-out", "Inside Out Emotional Whirlwind", "Pixar Pier"),
    ride("dca:jessies-carousel", "Jessie's Critter Carousel", "Pixar Pier"),
    ride("dca:jumpin-jellyfish", "Jumpin' Jellyfish", "Pixar Pier"),
    // Distinct queues: do not merge swinging with non-swinging.
    ride("dca:pal-a-round-swinging", "Pixar Pal-A-Round - Swinging", "Pixar Pier"),
    ride("dca:pal-a-round-non-swinging", "Pixar Pal-A-Round - Non-Swinging", "Pixar Pier"),
    ride("dca:toy-story-mania", "Toy Story Midway Mania!", "Pixar Pier")
  ])]
]);

// Deterministic lookup for tests, and for wiring gated California parks when enabled.
export function disneylandRidesForPark(parkId) {
  return DISNEYLAND_RIDES.get(Number(parkId)) || [];
}
