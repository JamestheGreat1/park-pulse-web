import { PARKS, parkName, minutesLabel, relativeTime, escapeHtml } from "./data.js?v=1.0.5";
import { store } from "./store.js?v=1.0.5";
import { rideData } from "./api.js?v=1.0.5";
import { currentSubscription, enablePush, syncRules, disablePush } from "./push.js?v=1.0.0";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const views = { explore: $("#view-explore"), watching: $("#view-watching"), settings: $("#view-settings") };
const sheet = $("#rideSheet");
const backdrop = $("#sheetBackdrop");
let installPrompt = null;
let pushOn = false;

function iconBell(active = false) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>${active ? '<circle cx="18" cy="5" r="3" class="bell-dot"/>' : ""}</svg>`;
}
function durationExpiry(value) {
  if (value === "3h") return Date.now() + 3 * 60 * 60 * 1000;
  if (value === "today") { const nextMidnight = new Date(); nextMidnight.setHours(24, 0, 0, 0); return nextMidnight.getTime(); }
  return null;
}
function remaining(rule) {
  if (!rule.expiresAt) return "Until disabled";
  const mins = Math.max(0, Math.round((rule.expiresAt - Date.now()) / 60000));
  if (mins < 90) return `${mins} min left`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr left`;
  return "Today";
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
  let list = rides.filter((r) => (!q || `${r.name} ${r.land}`.toLowerCase().includes(q)) && (!state.openOnly || r.isOpen) && (state.attractionFilter !== "rides" || r.kind === "ride"));
  if (state.sort === "wait") list.sort((a,b) => (a.isOpen === b.isOpen ? a.waitTime - b.waitTime : a.isOpen ? -1 : 1));
  else if (state.sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
  else list.sort((a,b) => (Number(b.isOpen) - Number(a.isOpen)) || (a.waitTime - b.waitTime) || a.name.localeCompare(b.name));
  return list;
}
function rideCard(ride) {
  const rule = store.ruleForRide(ride.id);
  return `<article class="ride-card liquid-glass ${rule ? "watching" : ""}" data-ride-id="${ride.id}">
    <button class="ride-main" type="button" data-open-ride="${ride.id}">
      <div class="ride-copy"><span class="ride-land">${escapeHtml(ride.land)}</span><h3>${escapeHtml(ride.name)}</h3><span class="updated">Updated ${relativeTime(ride.lastUpdated)}</span></div>
      <div class="ride-status"><span class="wait ${ride.isOpen ? "open" : "closed"}">${minutesLabel(ride.waitTime, ride.isOpen)}</span><span class="status-label">${ride.isOpen ? "Operating" : "Unavailable"}</span></div>
    </button>
    <button class="watch-button ${rule ? "active" : ""}" type="button" data-open-ride="${ride.id}" aria-label="${rule ? "Edit alert" : "Watch"} ${escapeHtml(ride.name)}">${iconBell(Boolean(rule))}</button>
  </article>`;
}
function renderExplore() {
  const state = store.snapshot;
  const rides = sortedRides(rideData.ridesForPark(state.selectedParkId), state);
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
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="rideSearch" type="search" placeholder="Search ${escapeHtml(parkName(state.selectedParkId))}" value="${escapeHtml(state.query)}"></label>
      <button class="filter-button ${state.openOnly ? "active" : ""}" type="button" data-toggle-open>Open only</button>
      <select id="typeSelect" aria-label="Attraction type"><option value="rides" ${state.attractionFilter === "rides" ? "selected" : ""}>Rides</option><option value="all" ${state.attractionFilter === "all" ? "selected" : ""}>All</option></select>
      <select id="sortSelect" aria-label="Sort rides"><option value="recommended" ${state.sort === "recommended" ? "selected" : ""}>Best now</option><option value="wait" ${state.sort === "wait" ? "selected" : ""}>Lowest wait</option><option value="name" ${state.sort === "name" ? "selected" : ""}>A–Z</option></select>
    </section>
    <div class="section-heading"><div><span class="eyebrow">Live waits</span><h2>${escapeHtml(parkName(state.selectedParkId))}</h2></div><span class="refresh-copy">${rideData.refreshing ? "Refreshing…" : rideData.updatedAt ? `Updated ${relativeTime(rideData.updatedAt)}` : "Loading…"}</span></div>
    <div class="ride-list">${rides.length ? rides.map(rideCard).join("") : `<div class="empty liquid-glass">${rideData.error || "No rides match that search."}</div>`}</div>`;
}
function renderWatching() {
  const rules = store.snapshot.rules;
  views.watching.innerHTML = `
    <div class="page-heading"><span class="eyebrow">Your alerts</span><h2>Watching</h2><p>These watches keep running through the backend even when the PWA is closed.</p></div>
    ${!pushOn ? `<button class="notification-callout liquid-glass" type="button" data-enable-push><span>🔔</span><div><strong>Turn on notifications</strong><small>Your watches are saved, but your phone can’t buzz you yet.</small></div><b>Enable</b></button>` : ""}
    <div class="watch-list">${rules.length ? rules.map((rule) => {
      const ride = rideData.rideById(rule.rideId);
      const detail = [rule.reopen ? "Reopening" : null, rule.threshold ? `≤ ${rule.threshold} min` : null].filter(Boolean).join(" · ");
      return `<article class="watch-card liquid-glass"><button class="watch-card-main" type="button" data-open-ride="${rule.rideId}"><span class="ride-land">${escapeHtml(parkName(rule.parkId))}</span><h3>${escapeHtml(rule.rideName)}</h3><p>${escapeHtml(detail || "Status watch")} · ${remaining(rule)}</p></button><div class="watch-live"><span class="wait ${ride?.isOpen ? "open" : "closed"}">${ride ? minutesLabel(ride.waitTime, ride.isOpen) : "—"}</span><button class="delete-watch" type="button" data-delete-watch="${rule.rideId}" aria-label="Stop watching ${escapeHtml(rule.rideName)}">×</button></div></article>`;
    }).join("") : `<div class="empty liquid-glass"><span class="empty-icon">🔔</span><h3>Nothing’s being watched yet</h3><p>Pick a ride and set a wait target or reopening alert.</p><button type="button" data-view-jump="explore">Find a ride</button></div>`}</div>`;
}
function renderSettings() {
  const state = store.snapshot;
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  views.settings.innerHTML = `
    <div class="page-heading"><span class="eyebrow">ParkPulse</span><h2>Settings</h2><p>A tiny ride watcher, not another giant park-planning app.</p></div>
    <section class="settings-group liquid-glass">
      <div class="setting-row"><div><strong>Push notifications</strong><small>${pushOn ? "Connected to this device" : permission === "denied" ? "Blocked in browser settings" : "Not enabled"}</small></div><button type="button" data-toggle-push class="setting-action">${pushOn ? "Disable" : "Enable"}</button></div>
      <div class="setting-row"><div><strong>Install ParkPulse</strong><small>Home Screen install is required for Web Push on iPhone.</small></div><button type="button" data-install class="setting-action">Install</button></div>
      <label class="setting-row"><div><strong>Appearance</strong><small>Liquid Glass adapts to light or dark mode.</small></div><select id="themeSelect"><option value="system" ${state.theme === "system" ? "selected" : ""}>System</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option></select></label>
    </section>
    <section class="settings-group liquid-glass"><div class="about-row"><strong>Data</strong><p>Ride status and posted wait times come from Queue-Times and update about every five minutes.</p><a href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Powered by Queue-Times.com ↗</a></div></section>
    <p class="fine-print">ParkPulse is an independent project and is not affiliated with or endorsed by Disney.</p>`;
}
function render() {
  store.pruneExpired(false);
  renderExplore(); renderWatching(); renderSettings();
  const n = store.snapshot.rules.length;
  $("#watchingBadge").textContent = n > 9 ? "9+" : String(n);
  $("#watchingBadge").classList.toggle("hidden", n === 0);
  setTheme(); bindDynamic();
}
function bindDynamic() {
  $$('[data-park]').forEach((b) => b.onclick = () => { store.update((s) => { s.selectedParkId = Number(b.dataset.park); s.query = ""; }, "park"); render(); if (!rideData.ridesForPark(Number(b.dataset.park)).length) rideData.refresh({ parkId: Number(b.dataset.park) }); });
  $$('[data-open-ride]').forEach((b) => b.onclick = () => openRide(Number(b.dataset.openRide)));
  $$('[data-view-jump]').forEach((b) => b.onclick = () => selectView(b.dataset.viewJump));
  $$('[data-toggle-open]').forEach((b) => b.onclick = () => store.update((s) => { s.openOnly = !s.openOnly; }, "filter"));
  const search = $("#rideSearch"); if (search) search.oninput = () => store.update((s) => { s.query = search.value; }, "search");
  const type = $("#typeSelect"); if (type) type.onchange = () => store.update((s) => { s.attractionFilter = type.value; }, "filter");
  const type = $("#typeSelect"); if (type) type.onchange = () => store.update((s) => { s.attractionMode = type.value; }, "filter");
  const sort = $("#sortSelect"); if (sort) sort.onchange = () => store.update((s) => { s.sort = sort.value; }, "sort");
  $$('[data-delete-watch]').forEach((b) => b.onclick = async () => { store.removeRule(Number(b.dataset.deleteWatch)); await safeSync(); toast("Watch removed"); });
  $$('[data-enable-push]').forEach((b) => b.onclick = activatePush);
  $$('[data-toggle-push]').forEach((b) => b.onclick = pushOn ? deactivatePush : activatePush);
  $$('[data-install]').forEach((b) => b.onclick = installApp);
  const theme = $("#themeSelect"); if (theme) theme.onchange = () => store.update((s) => { s.theme = theme.value; }, "theme");
}
function openRide(id) {
  const ride = rideData.rideById(id);
  const existing = store.ruleForRide(id);
  if (!ride && !existing) return;
  const model = ride || existing;
  sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-head"><div><span class="ride-land">${escapeHtml(model.land || parkName(model.parkId))}</span><h2 id="sheetTitle">${escapeHtml(model.name || model.rideName)}</h2></div><button class="sheet-close" type="button" data-close-sheet aria-label="Close">×</button></div>
    <div class="sheet-status"><span class="wait ${ride?.isOpen ? "open" : "closed"}">${ride ? minutesLabel(ride.waitTime, ride.isOpen) : "—"}</span><small>${ride?.isOpen ? "Currently operating" : "Currently unavailable"}</small></div>
    <form id="watchForm">
      <label class="toggle-row"><div><strong>Notify when it reopens</strong><small>Great for temporary downtime.</small></div><input id="reopenToggle" type="checkbox" ${existing?.reopen !== false ? "checked" : ""}><span class="switch"></span></label>
      <div class="threshold-block"><div class="threshold-head"><div><strong>Wait-time target</strong><small>Buzz me when the posted wait drops to or below:</small></div><button id="thresholdToggle" class="mini-toggle ${existing?.threshold ? "active" : ""}" type="button">${existing?.threshold ? "On" : "Off"}</button></div><div id="thresholdControls" class="threshold-controls ${existing?.threshold ? "" : "disabled"}"><button type="button" data-step="-5">−</button><output id="thresholdValue">${existing?.threshold || 30}</output><span>min</span><button type="button" data-step="5">+</button></div></div>
      <label class="duration-row"><span><strong>Watch for</strong><small>Temporary watches clean themselves up.</small></span><select id="durationSelect"><option value="today">Today</option><option value="3h">3 hours</option><option value="forever" ${existing && !existing.expiresAt ? "selected" : ""}>Until disabled</option></select></label>
      <button class="primary-button" type="submit">${existing ? "Save watch" : "Start watching"}</button>
      ${existing ? `<button class="danger-text" type="button" data-remove-current>Stop watching this ride</button>` : ""}
    </form>`;
  sheet.classList.remove("hidden"); backdrop.classList.remove("hidden"); document.body.classList.add("sheet-open");
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
function closeSheet() { sheet.classList.add("hidden"); backdrop.classList.add("hidden"); document.body.classList.remove("sheet-open"); }
async function safeSync() { try { await syncRules(store.snapshot.rules); } catch { toast("Saved locally; notification sync failed."); } }
async function activatePush() {
  try { await enablePush(); pushOn = true; await syncRules(store.snapshot.rules); render(); toast("Notifications are on"); }
  catch (error) { toast(error.message || "Couldn't enable notifications."); }
}
async function deactivatePush() { await disablePush().catch(() => {}); pushOn = false; render(); toast("Notifications disabled"); }
async function installApp() {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(ios ? "On iPhone: Share → Add to Home Screen." : "Use your browser menu → Install ParkPulse.");
}
async function init() {
  setTheme();
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  pushOn = Boolean(await currentSubscription().catch(() => null));
  $$('[data-view-target]').forEach((button) => button.onclick = () => selectView(button.dataset.viewTarget));
  $("#refreshButton").onclick = () => rideData.refresh();
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener("online", () => rideData.refresh({ parkId: store.snapshot.selectedParkId }));
  rideData.addEventListener("update", render); rideData.addEventListener("status", render);
  store.addEventListener("change", (e) => { if (e.detail.reason !== "search") render(); else renderExplore(), bindDynamic(); });
  const active = store.snapshot.activeView in views ? store.snapshot.activeView : "explore";
  selectView(active);
  await rideData.refresh();
  if (pushOn) await safeSync();
  const deepLinkRide = Number(new URL(location.href).searchParams.get("ride"));
  if (Number.isFinite(deepLinkRide) && deepLinkRide > 0 && rideData.rideById(deepLinkRide)) openRide(deepLinkRide);
  setInterval(() => rideData.refresh(), Number(window.PARKPULSE_CONFIG?.REFRESH_INTERVAL_MS || 300000));
}
init();
