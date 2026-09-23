import { sendNotification } from "web-push-neo";

const VERSION = "1.5.2";
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;
const LIVE_FRESHNESS_MS = 15 * 60 * 1000;
const BASELINE_REFRESH_MS = 24 * 60 * 60 * 1000;
const BASELINE_RETRY_MS = 30 * 60 * 1000;
const BASELINE_BATCH_SIZE = 8;
const BASELINE_MIN_DAYS = 5;
const BASELINE_MIN_MINUTES = 60;
const HISTORY_HEALTH_WINDOW_MS = 20 * 60 * 1000;
const CROWD_MIN_SMALL_PARK = 4;
const CROWD_MIN_LARGE_PARK = 6;

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
          themeParksApiKeyConfigured: Boolean(env.THEMEPARKS_API_KEY),
          historyDays: 30,
          historyBackfillEnabled: Boolean(env.THEMEPARKS_API_KEY),
          historyBackfillBatchSize: BASELINE_BATCH_SIZE,
          liveFreshnessMinutes: LIVE_FRESHNESS_MS / 60000,
          vapidConfigured: Boolean(env.VAPID_SUBJECT && env.VAPID_SERVER_PUBLIC_KEY && env.VAPID_SERVER_PRIVATE_KEY),
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

        const [snapshot, parkHours] = await Promise.all([
          fetchFreshParkRides(parkId, park, env),
          fetchParkHours(park, env).catch((error) => {
            console.warn("ThemeParks.wiki schedule fetch failed", park.name, error);
            return null;
          })
        ]);
        const displayRides = await addDisplayFallbacks(env, parkId, park, snapshot);
        let rides = await attachCurrentBaselines(env, displayRides);
        rides = await attachDowntimeContext(env, rides);
        let crowdLevel = calculateCrowdLevel(rides, park.rides.length, parkHours);
        crowdLevel = await attachCrowdTrend(env, parkId, crowdLevel, parkHours);

        return json({
          parkPulseFormat: 2,
          parkId,
          parkName: park.name,
          primaryDataSource: "ThemeParks.wiki",
          fallbackDataSource: "Queue-Times",
          primaryAvailable: snapshot.primaryAvailable,
          fallbackUsed: snapshot.fallbackUsed,
          parkHours,
          crowdLevel,
          generatedAt: new Date().toISOString(),
          rides
        }, 200, { ...cors, "Cache-Control": "public, max-age=120" });
      }

      const insightMatch = url.pathname.match(/^\/api\/ride\/([^/]+)\/insights$/);
      if (request.method === "GET" && insightMatch) {
        const rideKey = decodeURIComponent(insightMatch[1]);
        if (!catalogRideByKey(rideKey)) return json({ error: "Unknown ride" }, 404, cors);
        const insights = await getRideInsights(env, rideKey);
        return json(insights, 200, { ...cors, "Cache-Control": "public, max-age=120" });
      }

      if (request.method === "GET" && url.pathname === "/api/analytics/status") {
        return json(await getAnalyticsStatus(env), 200, { ...cors, "Cache-Control": "no-store" });
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
        if (!subscription) return json({ error: "Invalid push subscription", code: "INVALID_SUBSCRIPTION" }, 400, cors);

        try {
          const delivered = await sendPush(subscription, {
            title: "ParkPulse test",
            body: "Notifications are connected and ready for your ride watches.",
            url: env.APP_URL || "/",
            tag: "parkpulse-device-test",
            renotify: true
          }, env);

          if (!delivered) {
            return json({
              error: "Push subscription expired",
              code: "SUBSCRIPTION_EXPIRED"
            }, 410, cors);
          }

          return json({ ok: true, delivered: true }, 200, cors);
        } catch (error) {
          console.warn("Push test failed", error);

          if (error?.code === "PUSH_CONFIG_MISSING") {
            return json({
              error: "Push server configuration is incomplete",
              code: "PUSH_CONFIG_MISSING"
            }, 503, cors);
          }

          if (Number.isFinite(Number(error?.pushStatus))) {
            return json({
              error: "Push provider rejected the notification",
              code: "PUSH_PROVIDER_REJECTED",
              pushStatus: Number(error.pushStatus),
              pushReason: error.pushReason || null
            }, 502, cors);
          }

          return json({
            error: "Push send failed",
            code: "PUSH_SEND_FAILED"
          }, 500, cors);
        }
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

function sourceTimestampMs(ride) {
  const value = new Date(ride?.lastUpdated || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isFreshSourceRide(ride, now = Date.now()) {
  if (!ride || ride.sourceMissing || ride.sourceStale) return false;
  const updated = sourceTimestampMs(ride);
  if (!updated) return false;
  return now - updated <= LIVE_FRESHNESS_MS;
}

function chooseFreshRide(primaryRide, fallbackRide, now = Date.now()) {
  const primaryFresh = isFreshSourceRide(primaryRide, now);
  const fallbackFresh = isFreshSourceRide(fallbackRide, now);

  if (!primaryFresh && !fallbackFresh) return null;
  if (primaryFresh && !fallbackFresh) return primaryRide;
  if (!primaryFresh && fallbackFresh) return fallbackRide;

  const primaryHasWait = primaryRide?.isOpen && primaryRide?.waitTime != null && Number.isFinite(Number(primaryRide.waitTime));
  const fallbackHasWait = fallbackRide?.isOpen && fallbackRide?.waitTime != null && Number.isFinite(Number(fallbackRide.waitTime));

  if (primaryHasWait !== fallbackHasWait) {
    return primaryHasWait ? primaryRide : fallbackRide;
  }

  return sourceTimestampMs(fallbackRide) > sourceTimestampMs(primaryRide)
    ? fallbackRide
    : primaryRide;
}

async function fetchFreshParkRides(parkId, park, env) {
  const primaryByKey = new Map();
  const fallbackByKey = new Map();
  let primaryAvailable = false;
  let fallbackAvailable = false;
  let fallbackUsed = false;

  try {
    const primary = await fetchThemeParksRides(parkId, park, env);
    primaryAvailable = true;
    for (const item of primary) primaryByKey.set(item.id, item);
  } catch (error) {
    console.warn("ThemeParks.wiki fetch failed", park.name, error);
  }

  const needsFallback =
    !primaryAvailable ||
    park.rides.some((catalogRide) => !isFreshSourceRide(primaryByKey.get(catalogRide.key)));

  if (needsFallback) {
    try {
      const fallback = await fetchQueueTimesRides(parkId, park);
      fallbackAvailable = true;
      for (const item of fallback) fallbackByKey.set(item.id, item);
    } catch (error) {
      console.warn("Queue-Times fallback failed", park.name, error);
    }
  }

  const rides = [];
  const now = Date.now();

  for (const catalogRide of park.rides) {
    const chosen = chooseFreshRide(
      primaryByKey.get(catalogRide.key),
      fallbackByKey.get(catalogRide.key),
      now
    );

    if (!chosen) continue;
    if (chosen.source === "queue-times") fallbackUsed = true;
    rides.push(chosen);
  }

  return {
    rides,
    primaryAvailable,
    fallbackAvailable,
    fallbackUsed
  };
}

function dateKeyInZone(date = new Date(), timeZone = "America/New_York") {
  const parts = zoneParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function fetchParkHours(park, env) {
  const response = await fetch(
    `https://api.themeparks.wiki/v1/entity/${park.themeParksId}/schedule`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": `ParkPulse/${VERSION}`,
        ...(env.THEMEPARKS_API_KEY ? { "x-api-key": env.THEMEPARKS_API_KEY } : {})
      },
      cf: { cacheEverything: true, cacheTtl: 300 }
    }
  );

  if (!response.ok) {
    throw new Error(`ThemeParks.wiki schedule returned ${response.status}`);
  }

  const payload = await response.json();
  const timezone = String(payload?.timezone || "America/New_York");
  const date = dateKeyInZone(new Date(), timezone);
  const todayEntries = (payload?.schedule || []).filter((entry) => entry?.date === date);
  const operating = todayEntries.filter(
    (entry) =>
      String(entry?.type || "").toUpperCase() === "OPERATING" &&
      entry?.openingTime &&
      entry?.closingTime
  );
  const ticketedEvents = todayEntries
    .filter(
      (entry) =>
        String(entry?.type || "").toUpperCase() === "TICKETED_EVENT" &&
        entry?.openingTime &&
        entry?.closingTime
    )
    .map((entry) => ({
      name: String(entry?.description || "").trim().slice(0, 160) || "Special Ticketed Event",
      openingTime: entry.openingTime,
      closingTime: entry.closingTime
    }))
    .sort((a, b) => new Date(a.openingTime).getTime() - new Date(b.openingTime).getTime());

  if (!operating.length) {
    return todayEntries.length
      ? {
          date,
          timezone,
          openingTime: null,
          closingTime: null,
          closedToday: true,
          ticketedEvents
        }
      : null;
  }

  const sortedByOpen = [...operating].sort(
    (a, b) => new Date(a.openingTime).getTime() - new Date(b.openingTime).getTime()
  );
  const sortedByClose = [...operating].sort(
    (a, b) => new Date(b.closingTime).getTime() - new Date(a.closingTime).getTime()
  );

  return {
    date,
    timezone,
    openingTime: sortedByOpen[0].openingTime,
    closingTime: sortedByClose[0].closingTime,
    closedToday: false,
    ticketedEvents
  };
}

async function fetchThemeParksRides(parkId, park, env) {
  const response = await fetch(
    `https://api.themeparks.wiki/v1/entity/${park.themeParksId}/live`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": `ParkPulse/${VERSION}`,
        ...(env.THEMEPARKS_API_KEY ? { "x-api-key": env.THEMEPARKS_API_KEY } : {})
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
      operationalStatus: String(item?.status || "UNKNOWN").toUpperCase(),
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
      operationalStatus: Boolean(item?.is_open) ? "OPERATING" : "CLOSED",
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
  const staleRows = await readStaleParkRows(env, parkId);
  const staleByKey = new Map(staleRows.map((item) => [String(item.id), item]));

  for (const catalogRide of park.rides) {
    if (byKey.has(catalogRide.key)) continue;

    const stale = staleByKey.get(catalogRide.key);
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
        operationalStatus: "UNKNOWN",
        waitTime: null,
        lastUpdated: null,
        source: "unavailable",
        sourceId: null,
        sourceStale: true,
        sourceMissing: true
      });
    }
  }

  return park.rides
    .map((catalogRide) => byKey.get(catalogRide.key))
    .filter(Boolean);
}

function baselineRowIsReady(baseline) {
  return Boolean(
    baseline &&
    Number(baseline.sample_days || 0) >= BASELINE_MIN_DAYS &&
    Number(baseline.sample_minutes || 0) >= BASELINE_MIN_MINUTES
  );
}

function rideHasUsableComparison(ride, now = Date.now()) {
  const wait = Number(ride?.waitTime);
  const typical = Number(ride?.typicalWait);
  return Boolean(
    isFreshSourceRide(ride, now) &&
    ride?.isOpen &&
    Number.isFinite(wait) &&
    wait > 0 &&
    Number.isFinite(typical) &&
    typical > 0 &&
    Number(ride?.baselineDays || 0) >= BASELINE_MIN_DAYS &&
    Number(ride?.baselineMinutes || 0) >= BASELINE_MIN_MINUTES
  );
}

async function attachCurrentBaselines(env, rides) {
  if (!rides?.length) return rides || [];

  const slotMinute = Math.floor(easternMinutes(Date.now()) / 15) * 15;

  try {
    const rows = (await env.DB.prepare(
      `SELECT ride_key,median_wait,p25_wait,p75_wait,sample_days,sample_minutes
       FROM ride_baseline WHERE slot_minute=?`
    ).bind(slotMinute).all()).results || [];

    const byRide = new Map(rows.map((row) => [String(row.ride_key), row]));

    return rides.map((ride) => {
      const baseline = byRide.get(String(ride.id));
      if (!baselineRowIsReady(baseline)) return ride;

      const typicalWait = Number(baseline.median_wait);
      const currentWait = ride.waitTime == null ? null : Number(ride.waitTime);
      const valueRatio =
        ride.isOpen &&
        Number.isFinite(currentWait) &&
        currentWait > 0 &&
        Number.isFinite(typicalWait) &&
        typicalWait > 0
          ? currentWait / typicalWait
          : null;

      return {
        ...ride,
        typicalWait,
        typicalLow: baseline.p25_wait == null ? null : Number(baseline.p25_wait),
        typicalHigh: baseline.p75_wait == null ? null : Number(baseline.p75_wait),
        baselineReady: true,
        baselineDays: Number(baseline.sample_days || 0),
        baselineMinutes: Number(baseline.sample_minutes || 0),
        valueRatio: Number.isFinite(valueRatio) ? valueRatio : null
      };
    });
  } catch {
    return rides;
  }
}

function activeTicketedEvent(parkHours, now = Date.now()) {
  if (!parkHours?.ticketedEvents?.length) return null;

  for (const event of parkHours.ticketedEvents) {
    const start = new Date(event?.openingTime || 0).getTime();
    const end = new Date(event?.closingTime || 0).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end) {
      return event;
    }
  }

  return null;
}

function crowdMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function crowdLevelFromPressure(pressure) {
  if (pressure <= 0.55) return 1;
  if (pressure <= 0.65) return 2;
  if (pressure <= 0.75) return 3;
  if (pressure <= 0.85) return 4;
  if (pressure <= 0.95) return 5;
  if (pressure <= 1.05) return 6;
  if (pressure <= 1.15) return 7;
  if (pressure <= 1.30) return 8;
  if (pressure <= 1.50) return 9;
  return 10;
}

function crowdLabel(level) {
  if (level <= 2) return "Very Light";
  if (level <= 4) return "Light";
  if (level <= 6) return "Moderate";
  if (level <= 8) return "Busy";
  if (level === 9) return "Very Busy";
  return "Extremely Busy";
}

function calculateCrowdLevel(rides, totalCatalogRides, parkHours, now = Date.now()) {
  const requiredSamples = totalCatalogRides >= 10
    ? CROWD_MIN_LARGE_PARK
    : CROWD_MIN_SMALL_PARK;

  if (activeTicketedEvent(parkHours, now)) {
    return {
      available: false,
      reason: "ticketed-event",
      samples: 0,
      requiredSamples
    };
  }

  const ratios = (rides || [])
    .filter((ride) => rideHasUsableComparison(ride, now))
    .map((ride) => Math.max(
      0.35,
      Math.min(2, Number(ride.waitTime) / Number(ride.typicalWait))
    ))
    .filter(Number.isFinite);

  if (ratios.length < requiredSamples) {
    return {
      available: false,
      reason: "building",
      samples: ratios.length,
      requiredSamples
    };
  }

  const pressure = crowdMedian(ratios);
  const level = crowdLevelFromPressure(pressure);
  const deltaPercent = Math.round((pressure - 1) * 100);

  return {
    available: true,
    level,
    label: crowdLabel(level),
    pressure: Math.round(pressure * 100) / 100,
    deltaPercent,
    samples: ratios.length,
    requiredSamples,
    method: "median-normalized-wait-pressure"
  };
}

function durationMinutesSince(startMs, now = Date.now()) {
  if (!Number.isFinite(startMs) || startMs <= 0 || startMs > now) return null;
  return Math.max(0, Math.floor((now - startMs) / 60000));
}

async function attachDowntimeContext(env, rides, now = Date.now()) {
  const downRides = (rides || []).filter(
    (ride) => isFreshSourceRide(ride, now) && ride.operationalStatus === "DOWN"
  );
  if (!downRides.length) return rides || [];

  const rideKeys = downRides.map((ride) => String(ride.id));
  const start = parkDayStartMs(new Date(now));
  let rows = [];

  try {
    rows = (await env.DB.prepare(
      `SELECT ride_key,is_open,observed_at
       FROM ride_history
       WHERE ride_key IN (SELECT value FROM json_each(?))
         AND observed_at>=?
       ORDER BY ride_key ASC, observed_at DESC`
    ).bind(JSON.stringify(rideKeys), start).all()).results || [];
  } catch {
    rows = [];
  }

  const rowsByRide = new Map();
  for (const row of rows) {
    const key = String(row.ride_key);
    if (!rowsByRide.has(key)) rowsByRide.set(key, []);
    rowsByRide.get(key).push(row);
  }

  const downSinceByRide = new Map();

  for (const ride of downRides) {
    const history = rowsByRide.get(String(ride.id)) || [];
    let earliestClosed = null;

    for (const row of history) {
      if (Boolean(row.is_open)) break;
      const observed = Number(row.observed_at);
      if (Number.isFinite(observed)) earliestClosed = observed;
    }

    if (earliestClosed == null) {
      const sourceUpdated = sourceTimestampMs(ride);
      if (sourceUpdated >= start && sourceUpdated <= now) earliestClosed = sourceUpdated;
    }

    if (earliestClosed != null) downSinceByRide.set(String(ride.id), earliestClosed);
  }

  return (rides || []).map((ride) => {
    const downSince = downSinceByRide.get(String(ride.id));
    if (downSince == null) return ride;
    return {
      ...ride,
      downSince: new Date(downSince).toISOString(),
      downMinutes: durationMinutesSince(downSince, now)
    };
  });
}

async function attachCrowdTrend(env, parkId, crowdLevel, parkHours, now = Date.now()) {
  if (!crowdLevel?.available || activeTicketedEvent(parkHours, now)) return crowdLevel;

  const target = now - 30 * 60 * 1000;
  const windowStart = target - 10 * 60 * 1000;
  const windowEnd = target + 10 * 60 * 1000;
  const slotMinute = Math.floor(easternMinutes(target) / 15) * 15;

  let rows = [];
  try {
    rows = (await env.DB.prepare(
      `SELECT
         h.ride_key,h.wait_time,h.observed_at,
         b.median_wait,b.sample_days,b.sample_minutes
       FROM ride_history h
       JOIN ride_baseline b
         ON b.ride_key=h.ride_key AND b.slot_minute=?
       WHERE h.park_id=?
         AND h.observed_at>=?
         AND h.observed_at<=?
         AND h.is_open=1
         AND h.wait_time IS NOT NULL
         AND b.sample_days>=5
         AND b.sample_minutes>=60
       ORDER BY h.ride_key ASC, h.observed_at ASC`
    ).bind(slotMinute, parkId, windowStart, windowEnd).all()).results || [];
  } catch {
    return crowdLevel;
  }

  const closestByRide = new Map();
  for (const row of rows) {
    const key = String(row.ride_key);
    const observed = Number(row.observed_at);
    const distance = Math.abs(observed - target);
    const previous = closestByRide.get(key);
    if (!previous || distance < previous.distance) {
      closestByRide.set(key, { row, distance });
    }
  }

  const ratios = [...closestByRide.values()]
    .map(({ row }) => {
      const wait = Number(row.wait_time);
      const typical = Number(row.median_wait);
      if (!Number.isFinite(wait) || !Number.isFinite(typical) || typical <= 0) return null;
      return Math.max(0.35, Math.min(2, wait / typical));
    })
    .filter(Number.isFinite);

  if (ratios.length < Number(crowdLevel.requiredSamples || 0)) {
    return { ...crowdLevel, trend: null };
  }

  const previousPressure = crowdMedian(ratios);
  const delta = Number(crowdLevel.pressure) - previousPressure;
  const direction = delta >= 0.08 ? "up" : delta <= -0.08 ? "down" : "steady";

  return {
    ...crowdLevel,
    trend: {
      direction,
      label: direction === "up" ? "building" : direction === "down" ? "easing" : "steady",
      previousPressure: Math.round(previousPressure * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      minutes: 30,
      samples: ratios.length
    }
  };
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
    operationalStatus: Boolean(row.is_open) ? "OPERATING" : "UNKNOWN",
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
    const snapshot = await fetchFreshParkRides(parkId, park, env);
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
      const beforeFresh = Date.now() - Number(before.updatedAt || 0) <= LIVE_FRESHNESS_MS;
      const nowOpen = pNow.filter((item) => item.isOpen).length;
      const beforeOpen = pBefore.filter(
        (item) => item.isOpen && Date.now() - Number(item.updatedAt || 0) <= LIVE_FRESHNESS_MS
      ).length;
      const operationalNow = nowOpen >= 3;
      const operationalBefore = beforeOpen >= 3;
      const openingRamp = easternHour < 11 && nowOpen - beforeOpen >= 3;
      const reopened =
        beforeFresh &&
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
          beforeFresh &&
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

  }

  await writeCurrentRideSnapshot(env, current);

  await env.DB.prepare(
    "DELETE FROM notification_log_v2 WHERE last_sent < ?"
  ).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run().catch(() => {});

  await env.DB.prepare(
    "DELETE FROM ride_history WHERE observed_at < ?"
  ).bind(Date.now() - 31 * 24 * 60 * 60 * 1000).run().catch(() => {});

  if (env.THEMEPARKS_API_KEY) {
    await refreshRideBaselines(env, current).catch((error) => {
      console.warn("Baseline refresh failed", error);
    });
  }
}

function catalogRideByKey(rideKey) {
  for (const [parkId, park] of PARKS) {
    const found = park.rides.find((item) => item.key === rideKey);
    if (found) return { ...found, parkId, parkName: park.name };
  }
  return null;
}

function zoneParts(date, timeZone = "America/New_York") {
  const out = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

function zonedDateToUtc(year, month, day, hour, timeZone = "America/New_York") {
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const parts = zoneParts(new Date(guess), timeZone);
  const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  guess -= represented - guess;
  return guess;
}

function parkDayStartMs(now = new Date()) {
  const p = zoneParts(now);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (p.hour < 3) date.setUTCDate(date.getUTCDate() - 1);
  return zonedDateToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 3);
}

function easternMinutes(ms) {
  const p = zoneParts(new Date(ms));
  return p.hour * 60 + p.minute;
}

function circularMinuteDifference(a, b) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 1440 - raw);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function localDateOffset(days, now = Date.now(), timeZone = "America/New_York") {
  const p = zoneParts(new Date(now), timeZone);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDayEndMs(dateString, timeZone = "America/New_York") {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return zonedDateToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    timeZone
  );
}

function weightedQuantile(weightMap, quantile) {
  const entries = [...weightMap.entries()]
    .map(([value, weight]) => [Number(value), Number(weight)])
    .filter(([value, weight]) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0)
    .sort((a, b) => a[0] - b[0]);

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!total) return null;

  const target = total * quantile;
  let cumulative = 0;
  for (const [value, weight] of entries) {
    cumulative += weight;
    if (cumulative >= target) return Math.round(value);
  }
  return Math.round(entries.at(-1)[0]);
}

function historyStateWait(state) {
  if (String(state?.status || "").toUpperCase() !== "OPERATING") return null;
  const wait = state?.queue?.STANDBY?.waitTime;
  return wait == null || !Number.isFinite(Number(wait)) ? null : Math.max(0, Number(wait));
}

function buildTimeBaselines(historyPayload) {
  const timezone = historyPayload?.timezone || "America/New_York";
  const endMs = localDayEndMs(historyPayload?.range?.to, timezone);
  const states = [];

  if (historyPayload?.opening?.time) states.push(historyPayload.opening);
  for (const row of historyPayload?.history || []) {
    if (row?.time) states.push(row);
  }

  states.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const slots = new Map();

  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    const wait = historyStateWait(state);
    if (wait == null) continue;

    let cursor = new Date(state.time).getTime();
    const nextTime = index + 1 < states.length
      ? new Date(states[index + 1].time).getTime()
      : endMs;
    const intervalEnd = Math.min(nextTime, endMs);

    if (!Number.isFinite(cursor) || !Number.isFinite(intervalEnd) || intervalEnd <= cursor) continue;

    while (cursor < intervalEnd) {
      const parts = zoneParts(new Date(cursor), timezone);
      const minuteOfDay = parts.hour * 60 + parts.minute;
      const slotMinute = Math.floor(minuteOfDay / 15) * 15;
      const secondsIntoSlot = (parts.minute % 15) * 60 + parts.second;
      const msToNextSlot = Math.max(1000, (15 * 60 - secondsIntoSlot) * 1000);
      const segmentEnd = Math.min(intervalEnd, cursor + msToNextSlot);
      const weightMinutes = (segmentEnd - cursor) / 60000;
      const dayKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

      let slot = slots.get(slotMinute);
      if (!slot) {
        slot = {
          weights: new Map(),
          totalMinutes: 0,
          weightedSum: 0,
          days: new Set()
        };
        slots.set(slotMinute, slot);
      }

      slot.weights.set(wait, (slot.weights.get(wait) || 0) + weightMinutes);
      slot.totalMinutes += weightMinutes;
      slot.weightedSum += wait * weightMinutes;
      slot.days.add(dayKey);
      cursor = segmentEnd;
    }
  }

  return [...slots.entries()]
    .map(([slotMinute, slot]) => ({
      slotMinute,
      medianWait: weightedQuantile(slot.weights, 0.5),
      p25Wait: weightedQuantile(slot.weights, 0.25),
      p75Wait: weightedQuantile(slot.weights, 0.75),
      meanWait: slot.totalMinutes > 0 ? Math.round(slot.weightedSum / slot.totalMinutes) : null,
      sampleMinutes: Math.round(slot.totalMinutes),
      sampleDays: slot.days.size
    }))
    .filter((row) => row.medianWait != null && row.sampleMinutes > 0)
    .sort((a, b) => a.slotMinute - b.slotMinute);
}

async function requestThemeParksHistory(env, ride, from, to) {
  const url = new URL(`https://api.themeparks.wiki/v1/entity/${encodeURIComponent(ride.sourceId)}/history`);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": `ParkPulse/${VERSION}`,
      "x-api-key": env.THEMEPARKS_API_KEY
    }
  });

  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function fetchThemeParksHistory(env, ride) {
  if (!env.THEMEPARKS_API_KEY || !ride?.sourceId) {
    throw new Error("ThemeParks history requires an authenticated attraction id");
  }

  // ThemeParks' 30-day credential window includes today. Because ParkPulse
  // intentionally builds baselines from completed park days only, the widest
  // default request is the previous 29 completed days.
  let from = localDateOffset(-29);
  const to = localDateOffset(-1);

  let { response, payload } = await requestThemeParksHistory(env, ride, from, to);

  // Future-proof the backfill against plan/window changes. ThemeParks returns
  // the exact earliest date this credential may request.
  if (
    !response.ok &&
    payload?.error?.type === "HISTORY_WINDOW_EXCEEDED" &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(payload?.error?.earliestAllowedDate || ""))
  ) {
    const earliestAllowedDate = String(payload.error.earliestAllowedDate);
    if (earliestAllowedDate <= to && earliestAllowedDate !== from) {
      from = earliestAllowedDate;
      ({ response, payload } = await requestThemeParksHistory(env, ride, from, to));
    }
  }

  if (!response.ok) {
    const type = payload?.error?.type || `HTTP_${response.status}`;
    const message = payload?.error?.message || `ThemeParks history returned ${response.status}`;
    const error = new Error(`${type}: ${message}`);
    error.retryAfter = Number(payload?.error?.retryAfter || response.headers.get("Retry-After") || 0);
    throw error;
  }

  if (payload?.entityType === "PARK" || Array.isArray(payload?.entities)) {
    throw new Error("Unexpected park history response for attraction");
  }

  return payload;
}

async function saveRideBaseline(env, ride, rows) {
  if (!rows.length) throw new Error("No standby history was available for this ride");

  const now = Date.now();
  const payload = rows.map((row) => ({
    slotMinute: Number(row.slotMinute),
    medianWait: Number(row.medianWait),
    p25Wait: row.p25Wait == null ? null : Number(row.p25Wait),
    p75Wait: row.p75Wait == null ? null : Number(row.p75Wait),
    meanWait: row.meanWait == null ? null : Number(row.meanWait),
    sampleMinutes: Number(row.sampleMinutes),
    sampleDays: Number(row.sampleDays)
  }));

  await env.DB.batch([
    env.DB.prepare("DELETE FROM ride_baseline WHERE ride_key=?").bind(String(ride.id)),
    env.DB.prepare(
      `INSERT INTO ride_baseline(
         ride_key,slot_minute,median_wait,p25_wait,p75_wait,mean_wait,
         sample_minutes,sample_days,refreshed_at
       )
       SELECT
         ?1,
         CAST(json_extract(value,'$.slotMinute') AS INTEGER),
         CAST(json_extract(value,'$.medianWait') AS INTEGER),
         CAST(json_extract(value,'$.p25Wait') AS INTEGER),
         CAST(json_extract(value,'$.p75Wait') AS INTEGER),
         CAST(json_extract(value,'$.meanWait') AS INTEGER),
         CAST(json_extract(value,'$.sampleMinutes') AS INTEGER),
         CAST(json_extract(value,'$.sampleDays') AS INTEGER),
         ?2
       FROM json_each(?3)`
    ).bind(String(ride.id), now, JSON.stringify(payload)),
    env.DB.prepare(
      `INSERT INTO ride_baseline_meta(ride_key,source_id,status,slot_count,refreshed_at,last_error)
       VALUES(?,?,?,?,?,NULL)
       ON CONFLICT(ride_key) DO UPDATE SET
         source_id=excluded.source_id,
         status=excluded.status,
         slot_count=excluded.slot_count,
         refreshed_at=excluded.refreshed_at,
         last_error=NULL`
    ).bind(String(ride.id), String(ride.sourceId || ""), "ok", rows.length, now)
  ]);
}
async function markBaselineError(env, ride, error) {
  const message = String(error?.message || error || "Unknown baseline error").slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO ride_baseline_meta(ride_key,source_id,status,slot_count,refreshed_at,last_error)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(ride_key) DO UPDATE SET
       source_id=excluded.source_id,
       status=excluded.status,
       refreshed_at=excluded.refreshed_at,
       last_error=excluded.last_error`
  ).bind(
    String(ride.id),
    String(ride.sourceId || ""),
    "error",
    0,
    Date.now(),
    message
  ).run().catch(() => {});
}

async function refreshRideBaselines(env, currentRides) {
  if (!env.THEMEPARKS_API_KEY) return { processed: 0, refreshed: 0, failed: 0 };

  let metaRows = [];
  try {
    metaRows = (await env.DB.prepare(
      "SELECT ride_key,source_id,status,slot_count,refreshed_at,last_error FROM ride_baseline_meta"
    ).all()).results || [];
  } catch {
    return { processed: 0, refreshed: 0, failed: 0, reason: "schema-not-ready" };
  }

  const meta = new Map(metaRows.map((row) => [String(row.ride_key), row]));
  const now = Date.now();

  const candidates = currentRides
    .filter((ride) => ride.source === "themeparks.wiki" && ride.sourceId && !ride.sourceStale)
    .filter((ride) => {
      const row = meta.get(String(ride.id));
      if (!row) return true;
      if (String(row.source_id || "") !== String(ride.sourceId || "")) return true;
      if (
        row.status === "error" &&
        String(row.last_error || "").startsWith("HISTORY_WINDOW_EXCEEDED:")
      ) return true;

      const age = now - Number(row.refreshed_at || 0);
      return age >= (row.status === "ok" ? BASELINE_REFRESH_MS : BASELINE_RETRY_MS);
    })
    .sort((a, b) => {
      const aMeta = meta.get(String(a.id));
      const bMeta = meta.get(String(b.id));
      return Number(aMeta?.refreshed_at || 0) - Number(bMeta?.refreshed_at || 0);
    })
    .slice(0, BASELINE_BATCH_SIZE);

  let refreshed = 0;
  let failed = 0;

  for (const ride of candidates) {
    try {
      const payload = await fetchThemeParksHistory(env, ride);
      const rows = buildTimeBaselines(payload);
      await saveRideBaseline(env, ride, rows);
      refreshed++;
    } catch (error) {
      failed++;
      console.warn("Ride baseline failed", ride.name, error);
      await markBaselineError(env, ride, error);
      if (Number(error?.retryAfter) > 0) break;
    }
  }

  return { processed: candidates.length, refreshed, failed };
}

async function getAnalyticsStatus(env) {
  const totalRides = [...PARKS.values()].reduce((sum, park) => sum + park.rides.length, 0);
  const now = Date.now();

  try {
    const [metaResult, history30d, historyRecent] = await Promise.all([
      env.DB.prepare(
        "SELECT ride_key,status,slot_count,refreshed_at,last_error FROM ride_baseline_meta"
      ).all(),
      env.DB.prepare(
        `SELECT COUNT(*) AS sample_count,
                COUNT(DISTINCT ride_key) AS ride_count,
                MAX(observed_at) AS latest_observation
         FROM ride_history
         WHERE observed_at >= ?`
      ).bind(now - 31 * 24 * 60 * 60 * 1000).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS sample_count,
                COUNT(DISTINCT ride_key) AS ride_count,
                MAX(observed_at) AS latest_observation
         FROM ride_history
         WHERE observed_at >= ?`
      ).bind(now - HISTORY_HEALTH_WINDOW_MS).first()
    ]);

    const rows = metaResult.results || [];
    const ready = rows.filter((row) => row.status === "ok" && Number(row.slot_count) > 0);
    const errors = rows.filter((row) => row.status === "error");
    const errorGroups = new Map();
    for (const row of errors) {
      const message = String(row.last_error || "Unknown baseline error").slice(0, 300);
      const current = errorGroups.get(message) || { message, count: 0, rides: [] };
      current.count += 1;
      if (current.rides.length < 5) current.rides.push(String(row.ride_key || ""));
      errorGroups.set(message, current);
    }
    const baselineErrors = [...errorGroups.values()]
      .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
      .slice(0, 5);

    const latestHistoryMs = Number(history30d?.latest_observation || 0);
    const historyCollecting =
      Number(historyRecent?.sample_count || 0) > 0 &&
      latestHistoryMs > 0 &&
      now - latestHistoryMs <= HISTORY_HEALTH_WINDOW_MS;

    return {
      ok: true,
      totalRides,
      baselineRides: ready.length,
      pendingRides: Math.max(0, totalRides - ready.length),
      errorRides: errors.length,
      baselineErrors,
      latestRefresh: ready.length
        ? new Date(Math.max(...ready.map((row) => Number(row.refreshed_at || 0)))).toISOString()
        : null,
      backfillComplete: ready.length >= totalRides,
      themeParksApiKeyConfigured: Boolean(env.THEMEPARKS_API_KEY),
      historyCollecting,
      historyStatus: historyCollecting
        ? "collecting"
        : latestHistoryMs > 0
          ? "stale"
          : "waiting",
      historySamples: Number(history30d?.sample_count || 0),
      historyRides: Number(history30d?.ride_count || 0),
      recentHistorySamples: Number(historyRecent?.sample_count || 0),
      recentHistoryRides: Number(historyRecent?.ride_count || 0),
      latestHistorySample: latestHistoryMs
        ? new Date(latestHistoryMs).toISOString()
        : null,
      historyHealthWindowMinutes: HISTORY_HEALTH_WINDOW_MS / 60000
    };
  } catch {
    return {
      ok: false,
      totalRides,
      baselineRides: 0,
      pendingRides: totalRides,
      errorRides: 0,
      baselineErrors: [],
      latestRefresh: null,
      backfillComplete: false,
      themeParksApiKeyConfigured: Boolean(env.THEMEPARKS_API_KEY),
      historyCollecting: false,
      historyStatus: "unavailable",
      historySamples: 0,
      historyRides: 0,
      recentHistorySamples: 0,
      recentHistoryRides: 0,
      latestHistorySample: null,
      historyHealthWindowMinutes: HISTORY_HEALTH_WINDOW_MS / 60000,
      reason: "schema-not-ready"
    };
  }
}

async function getRideInsights(env, rideKey) {
  const catalog = catalogRideByKey(rideKey);
  const now = Date.now();
  const todayStart = parkDayStartMs(new Date(now));
  const currentMinute = easternMinutes(now);
  const slotMinute = Math.floor(currentMinute / 15) * 15;

  let todayRows = [];
  let historyRows = [];
  let latest = null;
  let baseline = null;

  try {
    todayRows = (await env.DB.prepare(
      `SELECT wait_time,observed_at FROM ride_history
       WHERE ride_key=? AND observed_at>=? AND is_open=1 AND wait_time IS NOT NULL
       ORDER BY observed_at ASC`
    ).bind(rideKey, todayStart).all()).results || [];

    historyRows = (await env.DB.prepare(
      `SELECT wait_time,observed_at FROM ride_history
       WHERE ride_key=? AND observed_at>=? AND observed_at<? AND is_open=1 AND wait_time IS NOT NULL
       ORDER BY observed_at ASC`
    ).bind(rideKey, now - 30 * 24 * 60 * 60 * 1000, todayStart).all()).results || [];

    baseline = await env.DB.prepare(
      `SELECT median_wait,p25_wait,p75_wait,mean_wait,sample_minutes,sample_days,refreshed_at
       FROM ride_baseline WHERE ride_key=? AND slot_minute=?`
    ).bind(rideKey, slotMinute).first();

    latest = await env.DB.prepare(
      `SELECT wait_time,is_open,source,source_updated_at,updated_at
       FROM ride_state_v2 WHERE ride_key=?`
    ).bind(rideKey).first();
  } catch {
    return {
      rideId: rideKey,
      rideName: catalog?.name || "Attraction",
      available: false,
      reason: "history-not-ready"
    };
  }

  const todayValues = todayRows.map((row) => Number(row.wait_time)).filter(Number.isFinite);
  const comparable = historyRows
    .filter((row) => circularMinuteDifference(easternMinutes(Number(row.observed_at)), currentMinute) <= 30)
    .map((row) => Number(row.wait_time))
    .filter(Number.isFinite);

  const baselineReady =
    baseline &&
    Number(baseline.sample_days || 0) >= 5 &&
    Number(baseline.sample_minutes || 0) >= 60;

  const typicalNow = baselineReady
    ? Number(baseline.median_wait)
    : comparable.length >= 8
      ? median(comparable)
      : null;

  const typicalRange = baselineReady &&
    baseline.p25_wait != null &&
    baseline.p75_wait != null
      ? {
          low: Number(baseline.p25_wait),
          high: Number(baseline.p75_wait)
        }
      : null;

  const currentWait = latest?.wait_time == null ? null : Number(latest.wait_time);
  const todayLow = todayValues.length >= 2 ? Math.min(...todayValues) : null;
  const todayHigh = todayValues.length >= 2 ? Math.max(...todayValues) : null;

  let comparison = null;
  if (Number.isFinite(currentWait) && Number.isFinite(typicalNow)) {
    const delta = currentWait - typicalNow;
    comparison = {
      delta,
      label: delta <= -15
        ? "Much better than typical"
        : delta <= -5
          ? "Better than typical"
          : delta >= 15
            ? "Busier than typical"
            : delta >= 5
              ? "A little busier than typical"
              : "Typical for this time"
    };
  }

  return {
    rideId: rideKey,
    rideName: catalog?.name || rideKey,
    parkId: catalog?.parkId || null,
    available: Boolean(todayValues.length || typicalNow != null),
    currentWait: Number.isFinite(currentWait) ? currentWait : null,
    todayLow,
    todayHigh,
    typicalNow,
    typicalRange,
    comparison,
    baselineSource: baselineReady ? "themeparks-history" : "parkpulse-samples",
    baselineRefreshedAt: baselineReady && baseline.refreshed_at
      ? new Date(Number(baseline.refreshed_at)).toISOString()
      : null,
    samples: {
      today: todayValues.length,
      comparable: comparable.length,
      history: historyRows.length,
      baselineDays: baselineReady ? Number(baseline.sample_days || 0) : 0,
      baselineMinutes: baselineReady ? Number(baseline.sample_minutes || 0) : 0
    },
    window: {
      days: 30,
      slotMinutes: 15,
      comparableMinutes: 30
    }
  };
}

async function writeCurrentRideSnapshot(env, rides) {
  const now = Date.now();
  const bucket = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);

  const stateRows = (rides || []).map((ride) => ({
    id: String(ride.id),
    parkId: Number(ride.parkId),
    sourceId: ride.sourceId || null,
    name: ride.name,
    land: ride.land || "Other",
    isOpen: ride.isOpen ? 1 : 0,
    waitTime: ride.waitTime == null ? null : Number(ride.waitTime),
    source: ride.source || "unknown",
    sourceUpdatedAt: ride.lastUpdated || null
  }));

  const historyRows = (rides || [])
    .filter((ride) => !ride.sourceStale && !ride.sourceMissing)
    .map((ride) => ({
      id: String(ride.id),
      parkId: Number(ride.parkId),
      waitTime: ride.waitTime == null ? null : Number(ride.waitTime),
      isOpen: ride.isOpen ? 1 : 0,
      source: ride.source || "unknown"
    }));

  const statements = [];

  if (stateRows.length) {
    statements.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO ride_state_v2(
           ride_key,park_id,source_id,name,land,is_open,wait_time,source,source_updated_at,updated_at
         )
         SELECT
           json_extract(value,'$.id'),
           CAST(json_extract(value,'$.parkId') AS INTEGER),
           json_extract(value,'$.sourceId'),
           json_extract(value,'$.name'),
           json_extract(value,'$.land'),
           CAST(json_extract(value,'$.isOpen') AS INTEGER),
           CAST(json_extract(value,'$.waitTime') AS INTEGER),
           json_extract(value,'$.source'),
           json_extract(value,'$.sourceUpdatedAt'),
           ?1
         FROM json_each(?2)`
      ).bind(now, JSON.stringify(stateRows))
    );
  }

  if (historyRows.length) {
    statements.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO ride_history(
           ride_key,park_id,wait_time,is_open,source,observed_at
         )
         SELECT
           json_extract(value,'$.id'),
           CAST(json_extract(value,'$.parkId') AS INTEGER),
           CAST(json_extract(value,'$.waitTime') AS INTEGER),
           CAST(json_extract(value,'$.isOpen') AS INTEGER),
           json_extract(value,'$.source'),
           ?1
         FROM json_each(?2)`
      ).bind(bucket, JSON.stringify(historyRows))
    );
  }

  if (statements.length) await env.DB.batch(statements);
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
  if (!env.VAPID_SUBJECT || !env.VAPID_SERVER_PUBLIC_KEY || !env.VAPID_SERVER_PRIVATE_KEY) {
    const error = new Error("Push server configuration is incomplete");
    error.code = "PUSH_CONFIG_MISSING";
    throw error;
  }

  const subscription = {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  };

  const vapidDetails = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY
  };

  try {
    await sendNotification(
      subscription,
      JSON.stringify(data),
      {
        vapidDetails,
        TTL: 300,
        urgency: "high"
      }
    );
    return true;
  } catch (cause) {
    const status = Number(cause?.statusCode || cause?.status || 0);
    if (status === 404 || status === 410) return false;

    let reason = null;
    try {
      const body = typeof cause?.body === "string"
        ? JSON.parse(cause.body)
        : cause?.body;
      if (body && typeof body.reason === "string") {
        reason = body.reason.slice(0, 80);
      }
    } catch {}

    const error = new Error(status ? `Push service returned ${status}` : "Push send failed");
    error.code = "PUSH_SEND_FAILED";
    if (status) error.pushStatus = status;
    if (reason) error.pushReason = reason;
    throw error;
  }
}
