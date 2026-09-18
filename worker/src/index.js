import { buildPushPayload } from "@block65/webcrypto-web-push";

const PARKS = new Map([[5, "EPCOT"], [6, "Magic Kingdom"], [7, "Hollywood Studios"], [8, "Animal Kingdom"]]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "parkpulse-api", version: "0.15.2" }, 200, cors);
      if (request.method === "GET" && url.pathname === "/vapid-key") return json({ publicKey: env.VAPID_SERVER_PUBLIC_KEY }, 200, cors);

      const parkMatch = url.pathname.match(/^\/api\/park\/(\d+)$/);
      if (request.method === "GET" && parkMatch) {
        const parkId = Number(parkMatch[1]);
        if (!PARKS.has(parkId)) return json({ error: "Unsupported park" }, 404, cors);
        const upstream = await fetch(`https://queue-times.com/parks/${parkId}/queue_times.json`, {
          headers: { Accept: "application/json", "User-Agent": "ParkPulse-Web/0.15.2" },
          cf: { cacheEverything: true, cacheTtl: 240 }
        });
        if (!upstream.ok) return json({ error: "Queue-Times upstream error" }, 502, cors);
        return new Response(await upstream.arrayBuffer(), { status: 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" } });
      }

      if (request.method === "POST" && url.pathname === "/subscriptions") {
        const body = await request.json();
        const subscription = body?.subscription;
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;
        const watchIds = Array.isArray(body?.watchIds) ? [...new Set(body.watchIds.map(Number).filter(Number.isFinite))].slice(0, 100) : [];
        if (!endpoint || !p256dh || !auth || !String(endpoint).startsWith("https://")) return json({ error: "Invalid push subscription" }, 400, cors);
        await env.DB.prepare(`INSERT INTO subscriptions(endpoint,p256dh,auth,watch_ids,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,watch_ids=excluded.watch_ids,updated_at=excluded.updated_at`)
          .bind(endpoint, p256dh, auth, JSON.stringify(watchIds), Date.now()).run();
        return json({ ok: true, watched: watchIds.length }, 200, cors);
      }

      if (request.method === "DELETE" && url.pathname === "/subscriptions") {
        const body = await request.json();
        if (!body?.endpoint) return json({ error: "endpoint required" }, 400, cors);
        await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
        return json({ ok: true }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/send/test") {
        if (!env.PUSH_ADMIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.PUSH_ADMIN_TOKEN}`) return json({ error: "Unauthorized" }, 401, cors);
        const body = await request.json().catch(() => ({}));
        const rows = (await env.DB.prepare("SELECT endpoint,p256dh,auth FROM subscriptions ORDER BY updated_at DESC LIMIT 50").all()).results || [];
        const payload = { title: "ParkPulse test", body: body.body || "Push is wired up correctly.", url: env.APP_URL || "/", tag: "parkpulse-test" };
        const results = await Promise.allSettled(rows.map((row) => sendPush(row, payload, env)));
        return json({ ok: true, attempted: rows.length, delivered: results.filter((result) => result.status === "fulfilled" && result.value).length }, 200, cors);
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
  return new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

async function runRideWatch(env) {
  const priorRows = (await env.DB.prepare("SELECT ride_id,is_open FROM ride_state").all()).results || [];
  const prior = new Map(priorRows.map((row) => [Number(row.ride_id), Boolean(row.is_open)]));
  const allRides = [];

  for (const [parkId] of PARKS) {
    try {
      const response = await fetch(`https://queue-times.com/parks/${parkId}/queue_times.json`, { headers: { Accept: "application/json", "User-Agent": "ParkPulse-Web/0.15.2" } });
      if (!response.ok) continue;
      const payload = await response.json();
      for (const land of payload?.lands || []) for (const ride of land?.rides || []) allRides.push(normalizeRide(parkId, ride));
      for (const ride of payload?.rides || []) allRides.push(normalizeRide(parkId, ride));
    } catch (error) { console.warn("Queue poll failed", parkId, error); }
  }

  const reopened = [];
  const seen = new Set();
  for (const ride of allRides) {
    if (seen.has(ride.id)) continue;
    seen.add(ride.id);
    const wasOpen = prior.get(ride.id);
    if (wasOpen === false && ride.isOpen) reopened.push(ride);
    await env.DB.prepare(`INSERT INTO ride_state(ride_id,park_id,name,is_open,wait_time,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(ride_id) DO UPDATE SET park_id=excluded.park_id,name=excluded.name,is_open=excluded.is_open,wait_time=excluded.wait_time,updated_at=excluded.updated_at`)
      .bind(ride.id, ride.parkId, ride.name, ride.isOpen ? 1 : 0, ride.waitTime, Date.now()).run();
  }

  if (!reopened.length) return;
  const subscriptions = (await env.DB.prepare("SELECT endpoint,p256dh,auth,watch_ids FROM subscriptions").all()).results || [];
  for (const ride of reopened) {
    const watchers = subscriptions.filter((row) => {
      try { return JSON.parse(row.watch_ids || "[]").map(Number).includes(ride.id); } catch { return false; }
    });
    if (!watchers.length) continue;
    const payload = {
      title: `${ride.name} reopened`,
      body: `${PARKS.get(ride.parkId)} • ${ride.waitTime > 0 ? `${ride.waitTime} min` : "Open now"}`,
      url: env.APP_URL || "/",
      tag: `ride-${ride.id}-reopened`,
      renotify: true
    };
    await Promise.allSettled(watchers.map(async (row) => {
      const delivered = await sendPush(row, payload, env);
      if (!delivered) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(row.endpoint).run();
    }));
  }
}

function normalizeRide(parkId, ride) {
  return { id: Number(ride.id), parkId: Number(parkId), name: String(ride.name || "Attraction"), isOpen: Boolean(ride.is_open), waitTime: Math.max(0, Number(ride.wait_time || 0)) };
}

async function sendPush(row, data, env) {
  const subscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_SERVER_PUBLIC_KEY, privateKey: env.VAPID_SERVER_PRIVATE_KEY };
  const requestInit = await buildPushPayload({ data: JSON.stringify(data), options: { ttl: 300, urgency: "high", topic: String(data.tag || "parkpulse") } }, subscription, vapid);
  const response = await fetch(subscription.endpoint, requestInit);
  if (response.status === 404 || response.status === 410) return false;
  if (!response.ok) throw new Error(`Push service returned ${response.status}`);
  return true;
}
