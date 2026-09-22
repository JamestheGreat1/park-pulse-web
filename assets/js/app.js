import { PARKS, parkName, minutesLabel, relativeTime, escapeHtml, isRideStale } from "./data.js?v=1.3.5";
import { store } from "./store.js?v=1.3.5";
import { rideData, fetchRideInsights, fetchAnalyticsStatus } from "./api.js?v=1.3.5";
import { currentSubscription, enablePush, syncRules, disablePush, backendHealth, sendTestPush } from "./push.js?v=1.3.5";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const views = { explore: $("#view-explore"), watching: $("#view-watching"), settings: $("#view-settings") };
const sheet = $("#rideSheet");
const backdrop = $("#sheetBackdrop");
const APP_VERSION = "1.3.5";
let installPrompt = null;
let pushOn = false;
let backendState = { ok: null };
let analyticsState = null;

function iconBell(active = false) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>${active ? '<circle cx="18" cy="5" r="3" class="bell-dot"/>' : ""}</svg>`;
}
function zoneParts(date, timeZone) {
  const values = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  }).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values;
}
function zonedDateToUtc(year, month, day, hour, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const parts = zoneParts(new Date(guess), timeZone);
  const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  guess -= represented - guess;
  return guess;
}
function easternParkDayEnd() {
  const timeZone = "America/New_York";
  const nowParts = zoneParts(new Date(), timeZone);
  const date = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  if (nowParts.hour >= 3) date.setUTCDate(date.getUTCDate() + 1);
  return zonedDateToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 3, timeZone);
}
function durationExpiry(value) {
  if (value === "3h") return Date.now() + 3 * 60 * 60 * 1000;
  if (value === "today") return easternParkDayEnd();
  return null;
}
function remaining(rule) {
  if (!rule.expiresAt) return "Until disabled";
  const mins = Math.max(0, Math.round((rule.expiresAt - Date.now()) / 60000));
  if (mins < 90) return `${mins} min left`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr left`;
  return "Today";
}
function rideStatus(ride) {
  if (!ride) return { stale:true, wait:"—", label:"No live data", updated:"Unavailable" };
  const stale = isRideStale(ride);
  if (ride.sourceMissing) return { stale:true, wait:"No data", label:"Standby feed unavailable", updated:"Waiting for live standby data" };
  const wait = minutesLabel(ride.waitTime, ride.isOpen);
  if (stale) return { stale:true, wait, label:`Stale · last seen ${relativeTime(ride.lastUpdated)}`, updated:`Last seen ${relativeTime(ride.lastUpdated)}` };
  return { stale:false, wait, label:ride.isOpen ? "Operating" : "Unavailable", updated:`Updated ${relativeTime(ride.lastUpdated)}` };
}
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast liquid-glass"; el.textContent = message; $("#toastRegion").append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 2600);
}
function setTheme() { document.documentElement.dataset.theme = store.snapshot.theme; }
function selectView(name) {
  store.update((s) => { s.activeView = name; }, "view");
  for (const [key, el] of Object.entries(views)) el.classList.toggle("active", key === name);
  $$(".nav-item").forEach((button) => { const active = button.dataset.viewTarget === name; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
  window.scrollTo({ top: 0, behavior: "instant" }); render();
}
function sortedRides(rides, state) {
  const q = state.query.trim().toLowerCase();
  let list = rides.filter((r) => (!q || `${r.name} ${r.land}`.toLowerCase().includes(q)) && (!state.openOnly || (r.isOpen && !isRideStale(r))));
  const staleRank = (ride) => isRideStale(ride) ? 1 : 0;
  if (state.sort === "wait") list.sort((a,b) => staleRank(a) - staleRank(b) || (a.isOpen === b.isOpen ? (a.waitTime ?? Infinity) - (b.waitTime ?? Infinity) : a.isOpen ? -1 : 1));
  else if (state.sort === "name") list.sort((a,b) => staleRank(a) - staleRank(b) || a.name.localeCompare(b.name));
  else list.sort((a,b) => {
    const freshness = staleRank(a) - staleRank(b);
    if (freshness) return freshness;

    const operating = Number(b.isOpen) - Number(a.isOpen);
    if (operating) return operating;

    const aRatio = Number.isFinite(a.valueRatio) ? a.valueRatio : Infinity;
    const bRatio = Number.isFinite(b.valueRatio) ? b.valueRatio : Infinity;
    if (aRatio !== bRatio) return aRatio - bRatio;

    return (a.waitTime ?? Infinity) - (b.waitTime ?? Infinity) || a.name.localeCompare(b.name);
  });
  return list;
}
function rideCard(ride) {
  const rule = store.ruleForRide(ride.id);
  const status = rideStatus(ride);
  return `<article class="ride-card liquid-glass ${rule ? "watching" : ""} ${status.stale ? "stale" : ""}" data-ride-id="${ride.id}">
    <button class="ride-main" type="button" data-open-ride="${ride.id}">
      <div class="ride-copy"><span class="ride-land">${escapeHtml(ride.land)}</span><h3>${escapeHtml(ride.name)}</h3><span class="updated">${escapeHtml(status.updated)}</span></div>
      <div class="ride-status"><span class="wait ${status.stale ? "stale" : ride.isOpen ? "open" : "closed"}">${escapeHtml(status.wait)}</span><span class="status-label">${escapeHtml(status.label)}</span></div>
    </button>
    <button class="watch-button ${rule ? "active" : ""}" type="button" data-open-ride="${ride.id}" aria-label="${rule ? "Edit alert" : "Watch"} ${escapeHtml(ride.name)}">${iconBell(Boolean(rule))}</button>
  </article>`;
}
function rideListMarkup(state = store.snapshot) {
  const rides = sortedRides(rideData.ridesForPark(state.selectedParkId), state);
  return rides.length
    ? rides.map(rideCard).join("")
    : `<div class="empty liquid-glass">${rideData.error || "No rides match that search."}</div>`;
}
function bindRideCards(root = views.explore) {
  $$('[data-open-ride]', root).forEach((button) => {
    button.onclick = () => openRide(button.dataset.openRide);
  });
}
function renderRideResults() {
  const list = $(".ride-list", views.explore);
  if (!list) return renderExplore();
  list.innerHTML = rideListMarkup();
  bindRideCards(list);
}
function renderExplore() {
  const state = store.snapshot;
  const activeCount = state.rules.length;
  views.explore.innerHTML = `
    <section class="hero-card liquid-glass">
      <div><span class="eyebrow">Walt Disney World</span><h2>Stop refreshing wait times.</h2><p>Tell ParkPulse what “worth it” looks like. We’ll watch the ride and buzz you when it gets there.</p></div>
      <button class="hero-watch" type="button" data-view-jump="watching"><strong>${activeCount}</strong><span>${activeCount === 1 ? "active watch" : "active watches"}</span></button>
    </section>
    <div class="park-strip" role="tablist" aria-label="Park">
      ${PARKS.map((p) => `<button type="button" class="park-chip ${p.id === state.selectedParkId ? "active" : ""}" data-park="${p.id}"><span>${p.emoji}</span>${p.short}</button>`).join("")}
    </div>
    <section class="toolbar liquid-glass">
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="rideSearch" type="search" enterkeyhint="search" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="Search ${escapeHtml(parkName(state.selectedParkId))}" value="${escapeHtml(state.query)}"></label>
      <button class="filter-button ${state.openOnly ? "active" : ""}" type="button" data-toggle-open>Open only</button>
      <select id="sortSelect" aria-label="Sort rides"><option value="recommended" ${state.sort === "recommended" ? "selected" : ""}>Best now</option><option value="wait" ${state.sort === "wait" ? "selected" : ""}>Lowest wait</option><option value="name" ${state.sort === "name" ? "selected" : ""}>A–Z</option></select>
    </section>
    <div class="section-heading"><div><span class="eyebrow">Live waits</span><h2>${escapeHtml(parkName(state.selectedParkId))}</h2></div><span class="refresh-copy">${rideData.refreshing ? "Refreshing…" : rideData.updatedAt ? `Updated ${relativeTime(rideData.updatedAt)}` : "Loading…"}</span></div>
    <div class="ride-list">${rideListMarkup(state)}</div>`;
}
function renderWatching() {
  const rules = store.snapshot.rules;
  views.watching.innerHTML = `
    <div class="page-heading"><span class="eyebrow">Your alerts</span><h2>Watching</h2><p>These watches keep running through the backend even when the PWA is closed.</p></div>
    ${!pushOn ? `<button class="notification-callout liquid-glass" type="button" data-enable-push><span>🔔</span><div><strong>Turn on notifications</strong><small>Your watches are saved, but your phone can’t buzz you yet.</small></div><b>Enable</b></button>` : ""}
    <div class="watch-list">${rules.length ? rules.map((rule) => {
      const ride = rideData.rideById(rule.rideId);
      const detail = [rule.reopen ? "Reopening" : null, rule.threshold ? `≤ ${rule.threshold} min` : null].filter(Boolean).join(" · ");
      const status = rideStatus(ride);
      return `<article class="watch-card liquid-glass ${status.stale ? "stale" : ""}"><button class="watch-card-main" type="button" data-open-ride="${rule.rideId}"><span class="ride-land">${escapeHtml(parkName(rule.parkId))}</span><h3>${escapeHtml(rule.rideName)}</h3><p>${escapeHtml(detail || "Status watch")} · ${remaining(rule)}</p></button><div class="watch-live"><span class="wait ${status.stale ? "stale" : ride?.isOpen ? "open" : "closed"}">${escapeHtml(status.wait)}</span><button class="delete-watch" type="button" data-delete-watch="${rule.rideId}" aria-label="Stop watching ${escapeHtml(rule.rideName)}">×</button></div></article>`;
    }).join("") : `<div class="empty liquid-glass"><span class="empty-icon">🔔</span><h3>Nothing’s being watched yet</h3><p>Pick a ride and set a wait target or reopening alert.</p><button type="button" data-view-jump="explore">Find a ride</button></div>`}</div>`;
}
function renderSettings() {
  const state = store.snapshot;
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const backendCopy = backendState?.ok === true ? `Online · Worker ${backendState.version || ""}`.trim() : backendState?.ok === false ? "Unavailable" : "Checking…";
  const refreshCopy = rideData.updatedAt ? relativeTime(rideData.updatedAt) : "Not yet";
  views.settings.innerHTML = `
    <div class="page-heading"><span class="eyebrow">ParkPulse</span><h2>Settings</h2><p>A tiny ride watcher, not another giant park-planning app.</p></div>
    <section class="settings-group liquid-glass">
      <div class="setting-row"><div><strong>Push notifications</strong><small>${pushOn ? "Connected to this device" : permission === "denied" ? "Blocked in browser settings" : "Not enabled"}</small></div><button type="button" data-toggle-push class="setting-action">${pushOn ? "Disable" : "Enable"}</button></div>
      ${pushOn ? `<div class="setting-row"><div><strong>Test notification</strong><small>Send a real Web Push to this device.</small></div><button type="button" data-test-push class="setting-action">Send test</button></div>` : ""}
      <div class="setting-row"><div><strong>Install ParkPulse</strong><small>Home Screen install is required for Web Push on iPhone.</small></div><button type="button" data-install class="setting-action">Install</button></div>
      <label class="setting-row"><div><strong>Appearance</strong><small>Liquid Glass adapts to light or dark mode.</small></div><select id="themeSelect"><option value="system" ${state.theme === "system" ? "selected" : ""}>System</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option></select></label>
    </section>
    <section class="settings-group liquid-glass">
      <div class="setting-row"><div><strong>Worker</strong><small>Backend and notification monitor</small></div><span class="health-pill ${backendState?.ok === true ? "good" : backendState?.ok === false ? "bad" : ""}">${escapeHtml(backendCopy)}</span></div>
      <div class="setting-row"><div><strong>Ride data</strong><small>Last successful app refresh</small></div><span class="setting-value">${escapeHtml(refreshCopy)}</span></div>
      <div class="setting-row"><div><strong>Data source</strong><small>ThemeParks.wiki primary · Queue-Times fallback</small></div><span class="setting-value">${escapeHtml(rideData.sourceSummary || "Waiting…")}</span></div>
      <div class="setting-row"><div><strong>ThemeParks API key</strong><small>Stored only as a Cloudflare Worker secret.</small></div><span class="health-pill ${backendState?.themeParksApiKeyConfigured ? "good" : ""}">${backendState?.themeParksApiKeyConfigured ? "Connected" : "Anonymous"}</span></div>
      <div class="setting-row"><div><strong>Trend baselines</strong><small>30-day time-of-day history backfill</small></div><span class="setting-value">${analyticsState?.ok ? `${analyticsState.baselineRides}/${analyticsState.totalRides} rides` : "Building…"}</span></div>
      <div class="setting-row"><div><strong>App version</strong><small>Installed ParkPulse frontend</small></div><span class="setting-value">v${APP_VERSION}</span></div>
      <div class="setting-row"><div><strong>Diagnostics</strong><small>Copies basic status only — no push keys.</small></div><button type="button" data-copy-diagnostics class="setting-action">Copy</button></div>
    </section>
    <section class="settings-group liquid-glass"><div class="about-row"><strong>Data</strong><p>ThemeParks.wiki is ParkPulse’s primary live source. Queue-Times is used only as a fallback when a curated ride is missing. Stale or missing standby data is labeled instead of being presented as live.</p><a href="https://www.themeparks.wiki/" target="_blank" rel="noopener noreferrer">ThemeParks.wiki ↗</a> · <a href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Queue-Times ↗</a></div></section>
    <p class="fine-print">ParkPulse is an independent project and is not affiliated with or endorsed by Disney.</p>`;
}
function updateWatchBadge() {
  const n = store.snapshot.rules.length;
  $("#watchingBadge").textContent = n > 9 ? "9+" : String(n);
  $("#watchingBadge").classList.toggle("hidden", n === 0);
}
function renderRefreshCopy() {
  const el = $(".refresh-copy", views.explore);
  if (el) el.textContent = rideData.refreshing
    ? "Refreshing…"
    : rideData.updatedAt
      ? `Updated ${relativeTime(rideData.updatedAt)}`
      : "Loading…";
}
function renderRideDataUpdate() {
  if (document.activeElement?.id !== "rideSearch") return render();
  renderRideResults();
  renderRefreshCopy();
  renderWatching();
  renderSettings();
  updateWatchBadge();
  setTheme();
  bindDynamic();
}
function render() {
  store.pruneExpired(false);
  renderExplore(); renderWatching(); renderSettings();
  updateWatchBadge();
  setTheme(); bindDynamic();
}
function bindDynamic() {
  $$('[data-park]').forEach((b) => b.onclick = () => { store.update((s) => { s.selectedParkId = Number(b.dataset.park); s.query = ""; }, "park"); if (!rideData.ridesForPark(Number(b.dataset.park)).length) rideData.refresh({ parkId: Number(b.dataset.park) }); });
  bindRideCards();
  $$('[data-view-jump]').forEach((b) => b.onclick = () => selectView(b.dataset.viewJump));
  $$('[data-toggle-open]').forEach((b) => b.onclick = () => store.update((s) => { s.openOnly = !s.openOnly; }, "filter"));
  const search = $("#rideSearch"); if (search) search.oninput = () => store.update((s) => { s.query = search.value; }, "search");
  const sort = $("#sortSelect"); if (sort) sort.onchange = () => store.update((s) => { s.sort = sort.value; }, "sort");
  $$('[data-delete-watch]').forEach((b) => b.onclick = async () => { store.removeRule(b.dataset.deleteWatch); await safeSync(); toast("Watch removed"); });
  $$('[data-enable-push]').forEach((b) => b.onclick = activatePush);
  $$('[data-toggle-push]').forEach((b) => b.onclick = pushOn ? deactivatePush : activatePush);
  $$('[data-install]').forEach((b) => b.onclick = installApp);
  $$('[data-test-push]').forEach((b) => b.onclick = testNotification);
  $$('[data-copy-diagnostics]').forEach((b) => b.onclick = copyDiagnostics);
  const theme = $("#themeSelect"); if (theme) theme.onchange = () => store.update((s) => { s.theme = theme.value; }, "theme");
}
function openRide(id) {
  const ride = rideData.rideById(id);
  const existing = store.ruleForRide(id);
  if (!ride && !existing) return;
  const model = ride || existing;
  sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-head"><div><span class="ride-land">${escapeHtml(model.land || parkName(model.parkId))}</span><h2 id="sheetTitle">${escapeHtml(model.name || model.rideName)}</h2></div><button class="sheet-close" type="button" data-close-sheet aria-label="Close">×</button></div>
    <div class="sheet-status"><span class="wait ${rideStatus(ride).stale ? "stale" : ride?.isOpen ? "open" : "closed"}">${escapeHtml(rideStatus(ride).wait)}</span><small>${escapeHtml(rideStatus(ride).label)}</small></div>
    <div id="rideInsights" class="ride-insights"><span class="insight-loading">Loading ParkPulse trend data…</span></div>
    <form id="watchForm">
      <label class="toggle-row"><div><strong>Notify when it reopens</strong><small>Great for temporary downtime.</small></div><input id="reopenToggle" type="checkbox" ${existing?.reopen !== false ? "checked" : ""}><span class="switch"></span></label>
      <div class="threshold-block"><div class="threshold-head"><div><strong>Wait-time target</strong><small>Buzz me when the posted wait drops to or below:</small></div><button id="thresholdToggle" class="mini-toggle ${existing?.threshold ? "active" : ""}" type="button">${existing?.threshold ? "On" : "Off"}</button></div><div id="thresholdControls" class="threshold-controls ${existing?.threshold ? "" : "disabled"}"><button type="button" data-step="-5">−</button><output id="thresholdValue">${existing?.threshold || 30}</output><span>min</span><button type="button" data-step="5">+</button></div></div>
      <label class="duration-row"><span><strong>Watch for</strong><small>Temporary watches clean themselves up.</small></span><select id="durationSelect"><option value="today">Today</option><option value="3h">3 hours</option><option value="forever" ${existing && !existing.expiresAt ? "selected" : ""}>Until disabled</option></select></label>
      <button class="primary-button" type="submit">${existing ? "Save watch" : "Start watching"}</button>
      ${existing ? `<button class="danger-text" type="button" data-remove-current>Stop watching this ride</button>` : ""}
    </form>`;
  sheet.classList.remove("hidden"); backdrop.classList.remove("hidden"); document.body.classList.add("sheet-open");
  loadRideInsights(id);
  let thresholdEnabled = Boolean(existing?.threshold), threshold = Number(existing?.threshold || 30);
  const refreshThreshold = () => { $("#thresholdValue").textContent = threshold; $("#thresholdControls").classList.toggle("disabled", !thresholdEnabled); $("#thresholdToggle").classList.toggle("active", thresholdEnabled); $("#thresholdToggle").textContent = thresholdEnabled ? "On" : "Off"; };
  $("#thresholdToggle").onclick = () => { thresholdEnabled = !thresholdEnabled; refreshThreshold(); };
  $$('[data-step]', sheet).forEach((b) => b.onclick = () => { threshold = Math.max(5, Math.min(180, threshold + Number(b.dataset.step))); refreshThreshold(); });
  $('[data-close-sheet]').onclick = closeSheet; backdrop.onclick = closeSheet;
  $('[data-remove-current]', sheet)?.addEventListener("click", async () => { store.removeRule(id); await safeSync(); closeSheet(); toast("Watch removed"); });
  $("#watchForm").onsubmit = async (event) => {
    event.preventDefault();
    const reopen = $("#reopenToggle").checked;
    const waitTarget = thresholdEnabled ? threshold : null;
    if (!reopen && !waitTarget) return toast("Choose at least one alert.");
    const duration = $("#durationSelect").value;
    store.saveRule({ rideId: id, parkId: model.parkId, rideName: model.name || model.rideName, land: model.land || "", reopen, threshold: waitTarget, expiresAt: durationExpiry(duration), createdAt: existing?.createdAt || Date.now() });
    if (!pushOn) toast("Watch saved — enable notifications to get buzzed.");
    else { await safeSync(); toast("Watch saved"); }
    closeSheet();
  };
}
async function loadRideInsights(id) {
  const data = await fetchRideInsights(id);
  const host = $("#rideInsights");
  if (!host || sheet.classList.contains("hidden")) return;

  if (!data?.available) {
    host.innerHTML = '<span class="insight-loading">ParkPulse is building trend history. This gets smarter as the 5-minute samples accumulate.</span>';
    return;
  }

  const stats = [];
  if (data.todayLow != null && data.todayHigh != null) {
    stats.push(`<div><span>Today</span><strong>${data.todayLow}–${data.todayHigh} min</strong></div>`);
  }
  if (data.typicalNow != null) {
    stats.push(`<div><span>Typical now</span><strong>${data.typicalNow} min</strong></div>`);
  }
  if (data.typicalRange?.low != null && data.typicalRange?.high != null) {
    stats.push(`<div><span>Usual range</span><strong>${data.typicalRange.low}–${data.typicalRange.high} min</strong></div>`);
  }

  const sourceCopy = data.baselineSource === "themeparks-history"
    ? `30-day ThemeParks history · ${data.samples?.baselineDays || 0} days represented`
    : "ParkPulse is still building the historical baseline.";

  host.innerHTML = `
    <div class="insight-head"><span>ParkPulse trend</span>${data.comparison?.label ? `<b>${escapeHtml(data.comparison.label)}</b>` : ""}</div>
    ${stats.length ? `<div class="insight-grid">${stats.join("")}</div>` : ""}
    <small>${escapeHtml(sourceCopy)} Today’s range comes from ParkPulse’s own live samples.</small>
  `;
}

function closeSheet() { sheet.classList.add("hidden"); backdrop.classList.add("hidden"); document.body.classList.remove("sheet-open"); }
function migrateLegacyRules() {
  const current = store.snapshot.rules;
  let changed = false;
  const next = current.map((rule) => {
    if (rideData.rideById(rule.rideId)) return rule;
    const match = rideData.rideByName(rule.parkId, rule.rideName);
    if (!match) return rule;
    changed = true;
    return {
      ...rule,
      rideId: String(match.id),
      rideName: match.name,
      land: match.land
    };
  });
  if (changed) store.update((state) => { state.rules = next; }, "rule-migration");
  return changed;
}
async function safeSync() { try { await syncRules(store.snapshot.rules); } catch { toast("Saved locally; notification sync failed."); } }
async function activatePush() {
  try { await enablePush(); pushOn = true; await syncRules(store.snapshot.rules); render(); toast("Notifications are on"); }
  catch (error) { toast(error.message || "Couldn't enable notifications."); }
}
async function deactivatePush() { await disablePush().catch(() => {}); pushOn = false; render(); toast("Notifications disabled"); }
async function testNotification() {
  try { await sendTestPush(); toast("Test sent — watch for the notification."); }
  catch (error) { toast(error.message || "Couldn't send test notification."); }
}
async function copyDiagnostics() {
  const lines = [
    `ParkPulse v${APP_VERSION}`,
    `Worker: ${backendState?.ok === true ? "online" : backendState?.ok === false ? "unavailable" : "unknown"}`,
    `Push: ${pushOn ? "connected" : "not connected"}`,
    `Notification permission: ${"Notification" in window ? Notification.permission : "unsupported"}`,
    `Last app refresh: ${rideData.updatedAt || "none"}`,
    `Active watches: ${store.snapshot.rules.length}`,
    `Ride sources: ${rideData.sourceSummary || "none"}`,
    `ThemeParks API key: ${backendState?.themeParksApiKeyConfigured ? "configured" : "anonymous"}`,
    `Trend baselines: ${analyticsState?.ok ? `${analyticsState.baselineRides}/${analyticsState.totalRides}` : "unknown"}`
  ];
  try { await navigator.clipboard.writeText(lines.join("\n")); toast("Diagnostics copied"); }
  catch { toast(lines.join(" · ")); }
}
async function installApp() {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(ios ? "On iPhone: Share → Add to Home Screen." : "Use your browser menu → Install ParkPulse.");
}
async function init() {
  setTheme();
  if ("serviceWorker" in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    await navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
  backendState = await backendHealth().catch(() => ({ok:false}));
  analyticsState = await fetchAnalyticsStatus().catch(() => null);
  pushOn = Boolean(await currentSubscription().catch(() => null));
  $$('[data-view-target]').forEach((button) => button.onclick = () => selectView(button.dataset.viewTarget));
  $("#refreshButton").onclick = () => rideData.refresh();
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener("online", () => rideData.refresh({ parkId: store.snapshot.selectedParkId }));
  rideData.addEventListener("update", renderRideDataUpdate);
  rideData.addEventListener("status", renderRefreshCopy);
  store.addEventListener("change", (e) => {
    if (e.detail.reason === "search") renderRideResults();
    else if (e.detail.reason !== "view") render();
  });
  const active = store.snapshot.activeView in views ? store.snapshot.activeView : "explore";
  selectView(active);
  await rideData.refresh();
  migrateLegacyRules();
  if (pushOn) await safeSync();
  const deepLinkRide = new URL(location.href).searchParams.get("ride");
  if (deepLinkRide && rideData.rideById(deepLinkRide)) openRide(deepLinkRide);
  setInterval(async () => {
    await rideData.refresh();
    analyticsState = await fetchAnalyticsStatus().catch(() => analyticsState);
    renderRideDataUpdate();
  }, Number(window.PARKPULSE_CONFIG?.REFRESH_INTERVAL_MS || 300000));
}
init();
