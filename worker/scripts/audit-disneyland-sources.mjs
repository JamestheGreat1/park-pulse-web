// Read-only audit of the public provider endpoints.
// This does not enable parks, deploy a Worker, write D1, or require API secrets.
// Run: node worker/scripts/audit-disneyland-sources.mjs
import fs from "node:fs";
import { disneylandRidesForPark } from "../src/disneyland-rides.js";

const PARK_IDS = [
  { id: 16, name: "Disneyland Park", themeParksId: "7340550b-c14d-4def-80bb-acdb51d49a66" },
  { id: 17, name: "Disney California Adventure", themeParksId: "832fcd51-ea19-4e77-85c7-75d5843b127c" }
];

function normalize(name) {
  return String(name || "")
    .replace(/[®™]/g, "").replace(/[’‘]/g, "'").replace(/[–—]/g, "-")
    .replace(/\bsingle[\s-]*rider(?:\s+line|\s+queue)?\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function matchCatalog(parkId, name) {
  if (/\bsingle[\s-]*rider\b/i.test(String(name || ""))) return null;
  const normalized = normalize(name);
  return disneylandRidesForPark(parkId).find(ride =>
    [ride.name, ...ride.aliases].some(alias => normalize(alias) === normalized)) || null;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ParkPulse-ReadOnly-Catalog-Audit/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function report(park, provider, records) {
  const included = records.filter(row => row && typeof row.name === "string" && !/\bsingle[\s-]*rider\b/i.test(row.name));
  const matched = included.map(row => ({ record: row, catalog: matchCatalog(park.id, row.name) })).filter(row => row.catalog);
  const uniqueKeys = [...new Set(matched.map(row => row.catalog.key))];
  const unmatched = included.filter(row => !matchCatalog(park.id, row.name)).map(row => row.name);
  const missing = disneylandRidesForPark(park.id).filter(ride => !uniqueKeys.includes(ride.key)).map(ride => ride.name);
  const summary = [
    `### ${park.name} — ${provider}`,
    `- Provider records (excluding single-rider): **${included.length}**`,
    `- Matched records / distinct curated rides: **${matched.length} / ${uniqueKeys.length}** of ${disneylandRidesForPark(park.id).length}`,
    `- Not found in this snapshot: ${missing.length ? missing.join(", ") : "none"}`,
    `- Provider entries intentionally excluded or unmatched: ${unmatched.length ? unmatched.join(", ") : "none"}`
  ].join("\n");
  console.log(summary + "\n");
  return summary;
}

const lines = ["## ParkPulse Disneyland live provider name audit", "", "Read-only source snapshot; missing entities are not assumed closed."];
let errors = 0;
for (const park of PARK_IDS) {
  const sources = [
    ["ThemeParks.wiki", `https://api.themeparks.wiki/v1/entity/${park.themeParksId}/live`,
      payload => Array.isArray(payload?.liveData) ? payload.liveData : null],
    ["Queue-Times", `https://queue-times.com/parks/${park.id}/queue_times.json`,
      payload => [...(payload?.lands || []).flatMap(land => land.rides || []), ...(payload?.rides || [])]]
  ];
  for (const [provider, url, rows] of sources) {
    try {
      const payload = await getJson(url);
      const records = rows(payload);
      if (!records) throw new Error("Unrecognized provider payload shape");
      lines.push(report(park, provider, records), "");
    } catch (error) {
      errors++;
      const message = `### ${park.name} — ${provider}\n- Unable to audit: ${error.message}`;
      console.warn(message);
      lines.push(message, "");
    }
  }
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}
if (errors) {
  console.error(`Some provider probes failed (${errors}/4). This does not affect the gated feature or production.`);
  process.exitCode = 1;
}
