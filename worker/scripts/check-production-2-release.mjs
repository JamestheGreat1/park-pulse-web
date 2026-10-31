// Read-only production release gate. Never uses credentials or mutates D1.
// Runs from GitHub Actions so the public Worker can be checked after deployment
// and BEFORE merging the public 2.0 PWA to main.
const origin = "https://parkpulse-api.jamesp5297.workers.dev";
const parks = new Map([[5,11],[6,21],[7,9],[8,6],[16,35],[17,19]]);
const fetchJson = async (path) => {
  const response = await fetch(origin + path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(path + " HTTP " + response.status);
  return response.json();
};
const health = await fetchJson("/health");
console.log("Production Worker:", JSON.stringify({
  version: health.version, staging: health.staging, ok: health.ok,
  vapidConfigured: health.vapidConfigured, status: health.notificationEngine?.status,
  lastCheck: health.notificationEngine?.lastCheck,
  checkpointRides: health.notificationEngine?.checkpointRides,
  delivery: health.notificationEngine?.delivery
}));
if (health.version !== "2.0.0" || health.ok !== true || health.staging !== false ||
    health.vapidConfigured !== true || health.themeParksApiKeyConfigured !== true ||
    health.notificationEngine?.ready !== true || health.notificationEngine?.status !== "running") {
  throw new Error("Production Worker health is not yet ready for public 2.0");
}
if (Number(health.notificationEngine.checkpointRides) !== 101) {
  throw new Error("Expected 101 ride checkpoints after first production 2.0 cron tick; currently " +
    health.notificationEngine.checkpointRides);
}
if (Number(health.notificationEngine?.delivery?.pending || 0) > 0 ||
    Number(health.notificationEngine?.delivery?.failed || 0) > 0) {
  throw new Error("Last notification cycle has pending/failed deliveries; investigate before publishing");
}
for (const [parkId, expected] of parks) {
  const data = await fetchJson("/api/park/" + parkId);
  const rides = data?.rides || [];
  const stale = rides.filter(r => r.sourceStale || r.sourceMissing).length;
  const result = { parkId, name: data.parkName, rides: rides.length,
    schedule: Boolean(data.parkHours), sourceStaleOrMissing: stale,
    generatedAt: data.generatedAt };
  console.log("Park API:", JSON.stringify(result));
  if (data.parkPulseFormat !== 2 || Number(data.parkId) !== parkId ||
      rides.length !== expected || !data.generatedAt) {
    throw new Error("Invalid park payload for park " + parkId);
  }
}
console.log("PASS: 2.0 production Worker, 101 alert checkpoints, six live park APIs.");
