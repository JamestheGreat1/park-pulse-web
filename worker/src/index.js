import { buildPushPayload } from "@block65/webcrypto-web-push";

const VERSION = "1.2.0";
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;

const PARKS = new Map([
  [5, {
    name: "EPCOT",
    themeParksId: "47f90d2c-e191-4239-a466-5892ef59a88b",
    rides: [
      ride("epcot:figment", "Journey Into Imagination With Figment", "World Celebration"),
      ride("epcot:spaceship-earth", "Spaceship Earth", "World Celebration"),
      ride("epcot:cosmic-rewind", "Guardians of the Galaxy: Cosmic Rewind", "World Discovery"),
      ride("epcot:mission-space", "Mission: SPACE", "World Discovery"),
      ride("epcot:test-track", "Test Track", "World Discovery", ["Test Track Presented by Chevrolet"]),
      ride("epcot:living-with-the-land", "Living with the Land", "World Nature"),
      ride("epcot:soarin", "Soarin' Across America", "World Nature", ["Soarin' Around the World"]),
      ride("epcot:nemo", "The Seas with Nemo & Friends", "World Nature"),
      ride("epcot:frozen", "Frozen Ever After", "World Showcase"),
      ride("epcot:gran-fiesta", "Gran Fiesta Tour Starring The Three Caballeros", "World Showcase"),
      ride("epcot:remy", "Remy's Ratatouille Adventure", "World Showcase", [], true)
    ]
  }],
  [6, {
    name: "Magic Kingdom",
    themeParksId: "75ea578a-adc8-4116-a54d-dccb60765ef9",
    rides: [
      ride("mk:jungle-cruise", "Jungle Cruise", "Adventureland"),
      ride("mk:pirates", "Pirates of the Caribbean", "Adventureland"),
      ride("mk:magic-carpets", "The Magic Carpets of Aladdin", "Adventureland"),
      ride("mk:small-world", "it's a small world", "Fantasyland"),
      ride("mk:dumbo", "Dumbo the Flying Elephant", "Fantasyland"),
      ride("mk:mad-tea-party", "Mad Tea Party", "Fantasyland"),
      ride("mk:peter-pan", "Peter Pan's Flight", "Fantasyland"),
      ride("mk:carrousel", "Prince Charming Regal Carrousel", "Fantasyland"),
      ride("mk:seven-dwarfs", "Seven Dwarfs Mine Train", "Fantasyland"),
      ride("mk:barnstormer", "The Barnstormer", "Fantasyland"),
      ride("mk:winnie-the-pooh", "The Many Adventures of Winnie the Pooh", "Fantasyland"),
      ride("mk:little-mermaid", "Under the Sea - Journey of The Little Mermaid", "Fantasyland"),
      ride("mk:big-thunder", "Big Thunder Mountain Railroad", "Frontierland"),
      ride("mk:tianas", "Tiana's Bayou Adventure", "Frontierland"),
      ride("mk:haunted-mansion", "Haunted Mansion", "Liberty Square"),
      ride("mk:astro-orbiter", "Astro Orbiter", "Tomorrowland"),
      ride("mk:buzz", "Buzz Lightyear's Space Ranger Spin", "Tomorrowland"),
      ride("mk:space-mountain", "Space Mountain", "Tomorrowland"),
      ride("mk:speedway", "Tomorrowland Speedway", "Tomorrowland"),
      ride("mk:peoplemover", "Tomorrowland Transit Authority PeopleMover", "Tomorrowland"),
      ride("mk:tron", "TRON Lightcycle / Run", "Tomorrowland", ["TRON Lightcycle / Run Presented by Enterprise"])
    ]
  }],
  [7, {
    name: "Hollywood Studios",
    themeParksId: "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
    rides: [
      ride("dhs:star-tours", "Star Tours - The Adventures Continue", "Echo Lake", ["Star Tours – The Adventures Continue"]),
      ride("dhs:runaway-railway", "Mickey & Minnie's Runaway Railway", "Hollywood Boulevard"),
      ride("dhs:toy-story-mania", "Toy Story Mania!", "Toy Story Land"),
      ride("dhs:millennium-falcon", "Millennium Falcon: Smugglers Run", "Star Wars: Galaxy's Edge"),
      ride("dhs:rise", "Star Wars: Rise of the Resistance", "Star Wars: Galaxy's Edge"),
      ride("dhs:tower-of-terror", "The Twilight Zone Tower of Terror", "Sunset Boulevard", ["The Twilight Zone™ Tower of Terror"]),
      ride("dhs:alien-saucers", "Alien Swirling Saucers", "Toy Story Land"),
      ride("dhs:slinky-dog", "Slinky Dog Dash", "Toy Story Land"),
      ride("dhs:rock-n-roller", "Rock 'n' Roller Coaster", "Sunset Boulevard", [
        "Rock 'n' Roller Coaster Starring Aerosmith",
        "Rock 'n' Roller Coaster Starring The Muppets"
      ])
    ]
  }],
  [8, {
    name: "Animal Kingdom",
    themeParksId: "1c84a229-8862-4648-9c71-378ddd2c7693",
    rides: [
      ride("ak:kilimanjaro-safaris", "Kilimanjaro Safaris", "Africa"),
      ride("ak:wildlife-express", "Wildlife Express Train", "Africa"),
      ride("ak:expedition-everest", "Expedition Everest", "Asia", ["Expedition Everest - Legend of the Forbidden Mountain"]),
      ride("ak:kali-river-rapids", "Kali River Rapids", "Asia"),
      ride("ak:flight-of-passage", "Avatar Flight of Passage", "Pandora - The World of Avatar"),
      ride("ak:navi-river-journey", "Na'vi River Journey", "Pandora - The World of Avatar")
    ]
  }]
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          service: "parkpulse-api",
          version: VERSION,
          primaryDataSource: "ThemeParks.wiki",
          fallbackDataSource: "Queue-Times",
          now: new Date().toISOString()
        }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/vapid-key") {
        return json({ publicKey: env.VAPID_SERVER_PUBLIC_KEY }, 200, cors);
      }

      const parkMatch = url.pathname.match(/^\/api\/park\/(\d+)$/);
      if (request.method === "GET" && parkMatch) {
        const parkId = Number(parkMatch[1]);
        const park = PARKS.get(parkId);
        if (!park) return json({ error: "Unsupported park" }, 404, cors);

        const snapshot = await fetchFreshParkRides(parkId, park);
        const rides = await addDisplayFallbacks(env, parkId, park, snapshot);

        return json({
          parkPulseFormat: 2,
          parkId,
          parkName: park.name,
          primaryDataSource: "ThemeParks.wiki",
          fallbackDataSource: "Queue-Times",
          primaryAvailable: snapshot.primaryAvailable,
          fallbackUsed: snapshot.fallbackUsed,
          generatedAt: new Date().toISOString(),
          rides
        }, 200, { ...cors, "Cache-Control": "public, max-age=120" });
      }

      if (request.method === "POST" && url.pathname === "/subscriptions") {
        const body = await request.json();
        const subscription = validateSubscription(body?.subscription);
        if (!subscription) return json({ error: "Invalid push subscription" }, 400, cors);

        const rawRules = Array.isArray(body?.rules)
          ? body.rules
          : Array.isArray(body?.watchIds)
            ? body.watchIds
            : [];

        const rules = normalizeRules(rawRules).slice(0, 100);

        await env.DB.prepare(
          `INSERT INTO subscriptions(endpoint,p256dh,auth,watch_ids,updated_at)
           VALUES(?,?,?,?,?)
           ON CONFLICT(endpoint) DO UPDATE SET
             p256dh=excluded.p256dh,
             auth=excluded.auth,
             watch_ids=excluded.watch_ids,
             updated_at=excluded.updated_at`
        ).bind(
          subscription.endpoint,
          subscription.p256dh,
          subscription.auth,
          JSON.stringify(rules),
          Date.now()
        ).run();

        return json({ ok: true, watched: rules.length }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/subscriptions/test") {
        const body = await request.json().catch(() => ({}));
        const subscription = validateSubscription(body?.subscription);
        if (!subscription) return json({ error: "Invalid push subscription" }, 400, cors);

        const delivered = await sendPush(subscription, {
          title: "ParkPulse test",
          body: "Notifications are connected and ready for your ride watches.",
          url: env.APP_URL || "/",
          tag: "parkpulse-device-test",
          renotify: true
        }, env);

        if (!delivered) return json({ error: "Push subscription expired" }, 410, cors);
        return json({ ok: true, delivered: true }, 200, cors);
      }

      if (request.method === "DELETE" && url.pathname === "/subscriptions") {
        const body = await request.json().catch(() => ({}));
        if (!body?.endpoint) return json({ error: "endpoint required" }, 400, cors);

        await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?")
          .bind(body.endpoint).run();

        await env.DB.prepare("DELETE FROM notification_log_v2 WHERE endpoint = ?")
          .bind(body.endpoint).run().catch(() => {});

        return json({ ok: true }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/send/test") {
        if (!env.PUSH_ADMIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.PUSH_ADMIN_TOKEN}`) {
          return json({ error: "Unauthorized" }, 401, cors);
        }

        const rows = (await env.DB.prepare(
          "SELECT endpoint,p256dh,auth FROM subscriptions ORDER BY updated_at DESC LIMIT 50"
        ).all()).results || [];

        const payload = {
          title: "ParkPulse test",
          body: "Push is wired up correctly.",
          url: env.APP_URL || "/",
          tag: "parkpulse-test"
        };

        const results = await Promise.allSettled(rows.map((row) => sendPush(row, payload, env)));
        return json({
          ok: true,
          attempted: rows.length,
          delivered: results.filter((result) => result.status === "fulfilled" && result.value).length
        }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      console.error(error);
      return json({ error: "Internal error" }, 500, cors);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runRideWatch(env));
  }
};

function ride(key, name, land, aliases = [], keepWhenMissing = false) {
  return { key, name, land, aliases, keepWhenMissing };
}

function normalizeName(value) {
  return String(value || "")
    .replace(/[®™]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\bsingle[\s-]*rider(?:\s+line|\s+queue)?\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function isSingleRiderName(name) {
  return /\bsingle[\s-]*rider\b/i.test(String(name || ""));
}

function findCatalogRide(park, name) {
  const wanted = normalizeName(name);
  if (!wanted) return null;

  for (const catalogRide of park.rides) {
    const names = [catalogRide.name, ...(catalogRide.aliases || [])];
    if (names.some((candidate) => normalizeName(candidate) === wanted)) {
      return catalogRide;
    }
  }

  return null;
}

async function fetchFreshParkRides(parkId, park) {
  const merged = new Map();
  let primaryAvailable = false;
  let fallbackAvailable = false;
  let fallbackUsed = false;

  try {
    const primary = await fetchThemeParksRides(parkId, park);
    primaryAvailable = true;
    for (const item of primary) merged.set(item.id, item);
  } catch (error) {
    console.warn("ThemeParks.wiki fetch failed", park.name, error);
  }

  const missingKeys = new Set(
    park.rides.filter((catalogRide) => !merged.has(catalogRide.key)).map((catalogRide) => catalogRide.key)
  );

  if (!primaryAvailable || missingKeys.size) {
    try {
      const fallback = await fetchQueueTimesRides(parkId, park);
      fallbackAvailable = true;
      for (const item of fallback) {
        if (!merged.has(item.id)) {
          merged.set(item.id, item);
          fallbackUsed = true;
        }
      }
    } catch (error) {
      console.warn("Queue-Times fallback failed", park.name, error);
    }
  }

  return {
    rides: [...merged.values()],
    primaryAvailable,
    fallbackAvailable,
    fallbackUsed
  };
}

async function fetchThemeParksRides(parkId, park) {
  const response = await fetch(
    `https://api.themeparks.wiki/v1/entity/${park.themeParksId}/live`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": `ParkPulse/${VERSION}`
      },
      cf: { cacheEverything: true, cacheTtl: 240 }
    }
  );

  if (!response.ok) {
    throw new Error(`ThemeParks.wiki returned ${response.status}`);
  }

  const payload = await response.json();
  const results = [];

  for (const item of payload?.liveData || []) {
    const catalogRide = findCatalogRide(park, item?.name);
    if (!catalogRide) continue;

    const standby = item?.queue?.STANDBY;
    const waitValue = standby?.waitTime;
    const waitTime = waitValue == null ? null : Number.isFinite(Number(waitValue)) ? Math.max(0, Number(waitValue)) : null;

    results.push({
      id: catalogRide.key,
      parkId,
      name: catalogRide.name,
      rawName: String(item?.name || catalogRide.name),
      aliases: catalogRide.aliases || [],
      land: catalogRide.land,
      isOpen: String(item?.status || "").toUpperCase() === "OPERATING",
      waitTime,
      lastUpdated: item?.lastUpdated || null,
      source: "themeparks.wiki",
      sourceId: String(item?.entityId || item?.id || ""),
      sourceStale: false,
      sourceMissing: false
    });
  }

  return [...new Map(results.map((item) => [item.id, item])).values()];
}

async function fetchQueueTimesRides(parkId, park) {
  const response = await fetch(
    `https://queue-times.com/parks/${parkId}/queue_times.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": `ParkPulse/${VERSION}`
      },
      cf: { cacheEverything: true, cacheTtl: 240 }
    }
  );

  if (!response.ok) {
    throw new Error(`Queue-Times returned ${response.status}`);
  }

  const payload = await response.json();
  const results = [];

  const ingest = (item) => {
    if (isSingleRiderName(item?.name)) return;

    const catalogRide = findCatalogRide(park, item?.name);
    if (!catalogRide) return;

    results.push({
      id: catalogRide.key,
      parkId,
      name: catalogRide.name,
      rawName: String(item?.name || catalogRide.name),
      aliases: catalogRide.aliases || [],
      land: catalogRide.land,
      isOpen: Boolean(item?.is_open),
      waitTime: Number.isFinite(Number(item?.wait_time))
        ? Math.max(0, Number(item.wait_time))
        : null,
      lastUpdated: item?.last_updated || null,
      source: "queue-times",
      sourceId: item?.id == null ? null : String(item.id),
      sourceStale: false,
      sourceMissing: false
    });
  };

  for (const land of payload?.lands || []) {
    for (const item of land?.rides || []) ingest(item);
  }
  for (const item of payload?.rides || []) ingest(item);

  return [...new Map(results.map((item) => [item.id, item])).values()];
}

async function addDisplayFallbacks(env, parkId, park, snapshot) {
  const byKey = new Map(snapshot.rides.map((item) => [item.id, item]));

  if (!snapshot.primaryAvailable && !snapshot.fallbackAvailable && !snapshot.rides.length) {
    const staleRows = await readStaleParkRows(env, parkId);
    for (const row of staleRows) {
      byKey.set(row.id, row);
    }
  }

  for (const catalogRide of park.rides) {
    if (byKey.has(catalogRide.key) || !catalogRide.keepWhenMissing) continue;

    const stale = await readStaleRide(env, catalogRide.key);
    if (stale) {
      byKey.set(catalogRide.key, stale);
    } else {
      byKey.set(catalogRide.key, {
        id: catalogRide.key,
        parkId,
        name: catalogRide.name,
        rawName: catalogRide.name,
        aliases: catalogRide.aliases || [],
        land: catalogRide.land,
        isOpen: false,
        waitTime: null,
        lastUpdated: null,
        source: "unavailable",
        sourceId: null,
        sourceStale: true,
        sourceMissing: true
      });
    }
  }

  return [...byKey.values()];
}

async function readStaleRide(env, rideKey) {
  try {
    const row = await env.DB.prepare(
      `SELECT ride_key,park_id,source_id,name,land,is_open,wait_time,source,source_updated_at,updated_at
       FROM ride_state_v2 WHERE ride_key = ?`
    ).bind(rideKey).first();

    return row ? staleRowToRide(row) : null;
  } catch {
    return null;
  }
}

async function readStaleParkRows(env, parkId) {
  try {
    const rows = (await env.DB.prepare(
      `SELECT ride_key,park_id,source_id,name,land,is_open,wait_time,source,source_updated_at,updated_at
       FROM ride_state_v2 WHERE park_id = ?`
    ).bind(parkId).all()).results || [];

    return rows.map(staleRowToRide);
  } catch {
    return [];
  }
}

function staleRowToRide(row) {
  return {
    id: String(row.ride_key),
    parkId: Number(row.park_id),
    name: String(row.name || "Attraction"),
    rawName: String(row.name || "Attraction"),
    land: String(row.land || "Other"),
    isOpen: Boolean(row.is_open),
    waitTime: row.wait_time == null ? null : Number(row.wait_time),
    lastUpdated: row.source_updated_at || (row.updated_at ? new Date(Number(row.updated_at)).toISOString() : null),
    source: String(row.source || "cached"),
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceStale: true,
    sourceMissing: false
  };
}

function validateSubscription(subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth || !String(endpoint).startsWith("https://")) {
    return null;
  }

  return {
    endpoint: String(endpoint),
    p256dh: String(p256dh),
    auth: String(auth)
  };
}

function normalizeRules(raw) {
  const now = Date.now();
  const out = [];

  for (const item of raw || []) {
    if (item == null) continue;

    if (typeof item !== "object") {
      const rideId = String(item).trim();
      if (rideId) out.push({ rideId, reopen: true, threshold: null, expiresAt: null });
      continue;
    }

    const rideId = String(item.rideId ?? "").trim();
    if (!rideId) continue;

    const expiresAt = item.expiresAt == null ? null : Number(item.expiresAt);
    if (expiresAt && expiresAt <= now) continue;

    const rawThreshold = item.threshold == null ? null : Number(item.threshold);
    const threshold = Number.isFinite(rawThreshold)
      ? Math.max(5, Math.min(300, rawThreshold))
      : null;

    const rule = {
      rideId,
      parkId: Number(item.parkId) || null,
      rideName: String(item.rideName || "Attraction").slice(0, 160),
      reopen: item.reopen !== false,
      threshold,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null
    };

    if (rule.reopen || rule.threshold != null) out.push(rule);
  }

  return [...new Map(out.map((rule) => [rule.rideId, rule])).values()];
}

function ruleMatchesRide(rule, ride) {
  if (String(rule.rideId) === String(ride.id)) return true;
  if (Number(rule.parkId) !== Number(ride.parkId)) return false;

  const park = PARKS.get(Number(ride.parkId));
  const catalogRide = park ? findCatalogRide(park, rule.rideName) : null;
  if (catalogRide && catalogRide.key === ride.id) return true;

  return normalizeName(rule.rideName) === normalizeName(ride.name);
}

async function runRideWatch(env) {
  const priorRows = await readPriorRideState(env);
  const prior = new Map(priorRows.map((row) => [row.id, row]));

  const current = [];
  for (const [parkId, park] of PARKS) {
    const snapshot = await fetchFreshParkRides(parkId, park);
    current.push(...snapshot.rides);
  }

  const currentByPark = groupByPark(current);
  const priorByPark = groupByPark([...prior.values()]);

  const subscriptions = (await env.DB.prepare(
    "SELECT endpoint,p256dh,auth,watch_ids FROM subscriptions"
  ).all()).results || [];

  const parsedSubs = [];
  for (const row of subscriptions) {
    let raw = [];
    try { raw = JSON.parse(row.watch_ids || "[]"); } catch {}

    const rules = normalizeRules(raw);
    parsedSubs.push({ ...row, rules });

    if (JSON.stringify(rules) !== JSON.stringify(raw)) {
      await env.DB.prepare(
        "UPDATE subscriptions SET watch_ids=?,updated_at=? WHERE endpoint=?"
      ).bind(JSON.stringify(rules), Date.now(), row.endpoint).run();
    }
  }

  const easternHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date()));

  for (const ride of current) {
    const before = prior.get(ride.id);

    if (before) {
      const pNow = currentByPark.get(ride.parkId) || [];
      const pBefore = priorByPark.get(ride.parkId) || [];
      const nowOpen = pNow.filter((item) => item.isOpen).length;
      const beforeOpen = pBefore.filter((item) => item.isOpen).length;
      const operationalNow = nowOpen >= 3;
      const operationalBefore = beforeOpen >= 3;
      const openingRamp = easternHour < 11 && nowOpen - beforeOpen >= 3;
      const reopened =
        !before.isOpen &&
        ride.isOpen &&
        operationalBefore &&
        operationalNow &&
        !openingRamp;

      const watchers = parsedSubs.filter((sub) =>
        sub.rules.some((rule) => ruleMatchesRide(rule, ride))
      );

      for (const watcher of watchers) {
        const rule = watcher.rules.find((candidate) => ruleMatchesRide(candidate, ride));
        if (!rule) continue;

        let payload = null;
        let kind = null;

        if (reopened && rule.reopen) {
          kind = "reopen";
          payload = {
            title: `${ride.name} reopened`,
            body: `${PARKS.get(ride.parkId).name} • ${ride.waitTime > 0 ? `${ride.waitTime} min` : "Open now"}`,
            url: `${env.APP_URL || "/"}?ride=${encodeURIComponent(ride.id)}`,
            tag: `ride-${safeTag(ride.id)}-reopen`,
            renotify: true
          };
        } else if (
          rule.threshold != null &&
          before.isOpen &&
          ride.isOpen &&
          Number.isFinite(Number(before.waitTime)) &&
          Number.isFinite(Number(ride.waitTime)) &&
          Number(before.waitTime) > rule.threshold &&
          Number(ride.waitTime) <= rule.threshold
        ) {
          kind = "wait";
          payload = {
            title: `${ride.name} is down to ${ride.waitTime} min`,
            body: `Your target was ${rule.threshold} min • ${PARKS.get(ride.parkId).name}`,
            url: `${env.APP_URL || "/"}?ride=${encodeURIComponent(ride.id)}`,
            tag: `ride-${safeTag(ride.id)}-wait`,
            renotify: true
          };
        }

        if (payload && kind) {
          try {
            if (await cooldownActive(env, watcher.endpoint, ride.id, kind)) continue;

            const delivered = await sendPush(watcher, payload, env);
            if (delivered) {
              await markNotification(env, watcher.endpoint, ride.id, kind);
            } else {
              await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint=?")
                .bind(watcher.endpoint).run();
            }
          } catch (error) {
            console.warn("Push failed", error);
          }
        }
      }
    }

    await writeRideState(env, ride);
  }

  await env.DB.prepare(
    "DELETE FROM notification_log_v2 WHERE last_sent < ?"
  ).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run().catch(() => {});
}

async function readPriorRideState(env) {
  try {
    const rows = (await env.DB.prepare(
      `SELECT ride_key,park_id,source_id,name,land,is_open,wait_time,source,source_updated_at,updated_at
       FROM ride_state_v2`
    ).all()).results || [];

    return rows.map((row) => ({
      id: String(row.ride_key),
      parkId: Number(row.park_id),
      sourceId: row.source_id ? String(row.source_id) : null,
      name: String(row.name || "Attraction"),
      land: String(row.land || "Other"),
      isOpen: Boolean(row.is_open),
      waitTime: row.wait_time == null ? null : Number(row.wait_time),
      source: String(row.source || "unknown"),
      lastUpdated: row.source_updated_at || null,
      updatedAt: Number(row.updated_at || 0)
    }));
  } catch {
    return [];
  }
}

async function writeRideState(env, ride) {
  await env.DB.prepare(
    `INSERT INTO ride_state_v2(
       ride_key,park_id,source_id,name,land,is_open,wait_time,source,source_updated_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(ride_key) DO UPDATE SET
       park_id=excluded.park_id,
       source_id=excluded.source_id,
       name=excluded.name,
       land=excluded.land,
       is_open=excluded.is_open,
       wait_time=excluded.wait_time,
       source=excluded.source,
       source_updated_at=excluded.source_updated_at,
       updated_at=excluded.updated_at`
  ).bind(
    String(ride.id),
    Number(ride.parkId),
    ride.sourceId || null,
    ride.name,
    ride.land || "Other",
    ride.isOpen ? 1 : 0,
    ride.waitTime == null ? null : Number(ride.waitTime),
    ride.source || "unknown",
    ride.lastUpdated || null,
    Date.now()
  ).run();
}

async function cooldownActive(env, endpoint, rideKey, kind) {
  try {
    const row = await env.DB.prepare(
      "SELECT last_sent FROM notification_log_v2 WHERE endpoint=? AND ride_key=? AND kind=?"
    ).bind(endpoint, String(rideKey), kind).first();

    return Boolean(
      row &&
      Date.now() - Number(row.last_sent) < NOTIFICATION_COOLDOWN_MS
    );
  } catch {
    return false;
  }
}

async function markNotification(env, endpoint, rideKey, kind) {
  try {
    await env.DB.prepare(
      `INSERT INTO notification_log_v2(endpoint,ride_key,kind,last_sent)
       VALUES(?,?,?,?)
       ON CONFLICT(endpoint,ride_key,kind) DO UPDATE SET last_sent=excluded.last_sent`
    ).bind(endpoint, String(rideKey), kind, Date.now()).run();
  } catch {}
}

function groupByPark(rides) {
  const map = new Map();
  for (const item of rides) {
    if (!map.has(item.parkId)) map.set(item.parkId, []);
    map.get(item.parkId).push(item);
  }
  return map;
}

function safeTag(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = !env.APP_ORIGIN || origin === env.APP_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : env.APP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function sendPush(row, data, env) {
  const subscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  };

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY
  };

  const requestInit = await buildPushPayload({
    data: JSON.stringify(data),
    options: {
      ttl: 300,
      urgency: "high",
      topic: String(data.tag || "parkpulse")
    }
  }, subscription, vapid);

  const response = await fetch(subscription.endpoint, requestInit);
  if (response.status === 404 || response.status === 410) return false;
  if (!response.ok) throw new Error(`Push service returned ${response.status}`);
  return true;
}
