import { ACCENTS, CUSTOM_BLOCK_KINDS, PARKS, PARK_BY_ID, PRIORITIES, VERSION, parkName } from "./data.js";
import { queueData } from "./api.js";
import { getScrollPositions, setScrollPosition, store } from "./store.js";
import { nextUp, recommendations } from "./recommendations.js";

const config = window.PARKPULSE_CONFIG || {};
const workerBase = String(config.WORKER_BASE || "").replace(/\/$/, "");
const refreshInterval = Number(config.REFRESH_INTERVAL_MS || 300000);

const panels = new Map([...document.querySelectorAll("[data-tab-panel]")].map((el) => [el.dataset.tabPanel, el]));
const tabButtons = [...document.querySelectorAll("[data-tab]")];
const refreshButton = document.querySelector("#refreshButton");
const networkBanner = document.querySelector("#networkBanner");
const parkDayPill = document.querySelector("#parkDayPill");
const modal = document.querySelector("#modal");
const modalBackdrop = document.querySelector("#modalBackdrop");
const toastRegion = document.querySelector("#toastRegion");

let modalCleanup = null;
let lastRefreshAttempt = 0;
let renderQueued = false;

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastRegion.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function waitBadge(ride) {
  if (!ride) return `<div class="wait-badge closed"><strong>—</strong><small>wait</small></div>`;
  if (!ride.isOpen) return `<div class="wait-badge closed"><strong>Closed</strong><small>status</small></div>`;
  const cls = ride.waitTime <= 15 ? "short" : ride.waitTime >= 60 ? "long" : "";
  return `<div class="wait-badge ${cls}"><strong>${ride.waitTime}</strong><small>min</small></div>`;
}

function selectedPark() {
  return PARK_BY_ID.get(Number(store.state.selectedParkId)) || PARKS[0];
}

function applyAppearance() {
  const { theme, accent } = store.state.appearance;
  const accentInfo = ACCENTS[accent] || ACCENTS.blue;
  document.documentElement.dataset.theme = theme || "system";
  document.documentElement.style.setProperty("--accent", accentInfo.hex);
  document.documentElement.style.setProperty("--accent-rgb", accentInfo.rgb);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f3f8fc" : "#07182e");
}

function parkSwitcherHTML() {
  return `<div class="park-switcher">${PARKS.map((park) => `
    <button type="button" class="park-chip ${park.id === Number(store.state.selectedParkId) ? "active" : ""}" data-action="select-park" data-park-id="${park.id}">
      <span class="park-icon" aria-hidden="true">${park.icon}</span><span>${esc(park.shortName)}</span>
    </button>`).join("")}</div>`;
}

function dailyProgress() {
  const done = new Set(store.state.daily.doneUids || []);
  const planCount = store.state.itinerary.length;
  const doneCount = store.state.itinerary.filter((item) => done.has(item.uid)).length;
  return { doneCount, planCount, percent: planCount ? Math.round((doneCount / planCount) * 100) : 0 };
}

function renderForYou() {
  const panel = panels.get("for-you");
  const state = store.state;
  const park = selectedPark();
  const rides = queueData.ridesForPark(park.id);
  const recs = recommendations(queueData.allRides(), state, { limit: 7, parkId: park.id });
  const next = nextUp(state, queueData);
  const progress = dailyProgress();

  let hero = "";
  if (next) {
    const item = next.item;
    const ride = next.ride;
    const title = item.type === "custom" ? item.title : (ride?.name || item.name || "Next stop");
    const location = item.type === "custom" ? parkName(item.parkId) : parkName(ride?.parkId || item.parkId);
    hero = `
      <article class="card accent hero-card">
        <p class="eyebrow">Recommended next</p>
        <div class="hero-top">
          <div>
            <h2>${esc(title)}</h2>
            <p>${esc(next.reason || "Next on your plan.")}</p>
            <p class="meta" style="margin-top:8px">${esc(location)}</p>
          </div>
          ${item.type === "ride" ? waitBadge(ride) : `<div class="wait-badge"><strong>${esc(item.time || "Plan")}</strong><small>${esc(item.kind || "block")}</small></div>`}
        </div>
        <div class="button-row" style="margin-top:14px">
          ${state.parkDay.active ? `<button type="button" class="primary-button small-button" data-action="mark-done" data-uid="${esc(item.uid)}">Done</button><button type="button" class="ghost-button small-button" data-action="skip-item" data-uid="${esc(item.uid)}">Skip for now</button>` : `<button type="button" class="primary-button" data-action="start-day">Start Park Day</button>`}
          <button type="button" class="ghost-button small-button" data-action="goto-plan">View plan</button>
        </div>
      </article>`;
  } else {
    hero = `
      <article class="card accent hero-card">
        <p class="eyebrow">Park Day</p>
        <h2>${state.itinerary.length ? "You finished today's plan ✦" : "Build your park day"}</h2>
        <p>${state.itinerary.length ? "Everything on your itinerary is complete or skipped for now." : "Add attractions or custom blocks, then ParkPulse can surface the best next move without rearranging your plan."}</p>
        <div class="button-row" style="margin-top:14px"><button type="button" class="primary-button" data-action="goto-plan">${state.itinerary.length ? "Review plan" : "Build itinerary"}</button></div>
      </article>`;
  }

  const openRides = rides.filter((ride) => ride.kind === "ride" && ride.isOpen);
  const statusCopy = queueData.updatedAt
    ? `${queueData.source === "live" ? "Live" : queueData.source === "mixed" ? "Partially live" : "Saved"} • updated ${formatRelativeTime(queueData.updatedAt)}`
    : "Waiting for live data";

  panel.innerHTML = `
    <div class="stack">
      <section class="section">
        <div class="section-header"><div><p class="eyebrow">Park focus</p><h2>${esc(park.shortName)}</h2><p>${esc(statusCopy)}</p></div></div>
        ${parkSwitcherHTML()}
      </section>

      ${state.itinerary.length ? `
        <section class="card">
          <div class="section-header"><div><p class="eyebrow">Your itinerary</p><h3>${progress.doneCount}/${progress.planCount} done</h3><p>Your order stays yours. ParkPulse only helps with timing.</p></div></div>
          <div class="progress-line" style="margin-top:12px"><div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div><strong>${progress.percent}%</strong></div>
        </section>` : ""}

      ${hero}

      <section class="section">
        <div class="section-header"><div><h2>For You</h2><p>${openRides.length ? `${openRides.length} rides currently reporting open in ${esc(park.shortName)}.` : "No rides in this park are currently reporting open."}</p></div></div>
        ${recs.length ? `<div class="recommendation-list two-col">${recs.map((rec) => recommendationCardHTML(rec)).join("")}</div>` : emptyStateHTML("◷", "No recommendations right now", queueData.error || "When rides begin reporting open, your strongest options will show up here.")}
      </section>

      <div class="card" style="padding:13px 15px"><p class="meta" style="margin:0">Powered by <a href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Queue-Times.com</a>. Live data updates approximately every five minutes.</p></div>
    </div>`;
}

function recommendationCardHTML(rec) {
  return `<article class="ride-card">
    <div class="ride-card-main"><div><p class="ride-name">${esc(rec.ride.name)}</p><p class="ride-land">${esc(parkName(rec.ride.parkId))} • ${esc(rec.reason)}</p></div>${waitBadge(rec.ride)}</div>
    <div class="ride-actions"><span class="score-pill">✦ ${rec.score}/100</span>${rideActionButtons(rec.ride)}</div>
  </article>`;
}

function renderPlan() {
  const panel = panels.get("plan");
  const state = store.state;
  const progress = dailyProgress();
  const done = new Set(state.daily.doneUids || []);
  const skipped = new Set(state.parkDay.skippedUids || []);
  let previousPark = null;

  const items = state.itinerary.map((item, index) => {
    const ride = item.type === "ride" ? queueData.rideById(item.rideId) : null;
    const itemPark = Number(item.parkId || ride?.parkId || state.selectedParkId);
    const hop = previousPark != null && previousPark !== itemPark
      ? `<div class="hop-divider">Hop to ${esc(parkName(itemPark))}</div>` : (index === 0 ? `<div class="hop-divider">Start in ${esc(parkName(itemPark))}</div>` : "");
    previousPark = itemPark;
    const completed = done.has(item.uid);
    const isSkipped = skipped.has(item.uid);
    const title = item.type === "custom" ? item.title : (ride?.name || item.name || "Unavailable attraction");
    const subtitle = item.type === "custom"
      ? [parkName(itemPark), item.time, item.note].filter(Boolean).join(" • ")
      : `${parkName(itemPark)}${isSkipped ? " • skipped for now" : ""}`;
    return `${hop}<article class="plan-item ${completed ? "done" : ""} ${item.type === "custom" ? "custom-block" : ""}" data-plan-uid="${esc(item.uid)}">
      <button type="button" class="plan-index" data-action="toggle-done" data-uid="${esc(item.uid)}" aria-label="${completed ? "Mark not done" : "Mark done"}">${completed ? "✓" : index + 1}</button>
      <div class="plan-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div>
      ${state.planEditMode ? `<div class="plan-controls">
        <button type="button" class="mini-icon" data-action="move-item" data-direction="-1" data-uid="${esc(item.uid)}" aria-label="Move earlier" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="mini-icon" data-action="move-item" data-direction="1" data-uid="${esc(item.uid)}" aria-label="Move later" ${index === state.itinerary.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="mini-icon" data-action="remove-item" data-uid="${esc(item.uid)}" aria-label="Remove">×</button>
      </div>` : (item.type === "ride" ? waitBadge(ride) : `<div class="wait-badge"><strong>${esc(item.time || "—")}</strong><small>${esc(item.kind)}</small></div>`)}
    </article>`;
  }).join("");

  panel.innerHTML = `<div class="stack">
    <section class="section">
      <div class="section-header">
        <div><p class="eyebrow">Your day</p><h2>Your Itinerary</h2><p>${progress.doneCount}/${progress.planCount} done • Your order stays yours. ParkPulse only helps with timing.</p></div>
        ${state.itinerary.length ? `<button type="button" class="ghost-button small-button" data-action="toggle-plan-edit">${state.planEditMode ? "Done" : "Edit"}</button>` : ""}
      </div>
      ${state.itinerary.length ? `<div class="progress-line"><div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div><strong>${progress.percent}%</strong></div>` : ""}
    </section>
    <section class="button-row">
      <button type="button" class="primary-button" data-action="open-attraction-picker">+ Add Attractions</button>
      <button type="button" class="secondary-button" data-action="open-custom-block">+ Custom Block</button>
      ${state.itinerary.length ? `<button type="button" class="ghost-button" data-action="${state.parkDay.active ? "end-day" : "start-day"}">${state.parkDay.active ? "End Park Day" : "Start Park Day"}</button>` : ""}
    </section>
    <section class="plan-list">${items || emptyStateHTML("☷", "Nothing planned yet", "Add attractions, a meal, a break, or a park-hop block. The picker keeps your place while you choose — no teleporting.")}</section>
  </div>`;
}

function renderWaits() {
  const panel = panels.get("waits");
  const state = store.state;
  const park = selectedPark();
  const query = state.waits.query.toLowerCase().trim();
  const filter = state.waits.filter;
  const rides = queueData.ridesForPark(park.id).filter((ride) => {
    const matchesQuery = !query || ride.name.toLowerCase().includes(query) || ride.land.toLowerCase().includes(query);
    const matchesKind = filter === "all" || (filter === "rides" && ride.kind === "ride") || (filter === "shows" && ride.kind === "show") || (filter === "other" && ride.kind === "other");
    const matchesOpen = !state.waits.openOnly || ride.isOpen;
    return matchesQuery && matchesKind && matchesOpen;
  });

  const byLand = new Map();
  for (const ride of rides) {
    if (!byLand.has(ride.land)) byLand.set(ride.land, []);
    byLand.get(ride.land).push(ride);
  }

  panel.innerHTML = `<div class="stack">
    <section class="section"><div class="section-header"><div><p class="eyebrow">Live waits</p><h2>${esc(park.shortName)}</h2><p>${queueData.updatedAt ? `Updated ${formatRelativeTime(queueData.updatedAt)}` : "Pulling current waits…"}</p></div></div>${parkSwitcherHTML()}</section>
    <section class="card controls-card">
      <input id="waitSearch" class="search-input" type="search" value="${esc(state.waits.query)}" placeholder="Search attractions or lands" aria-label="Search attractions">
      <div class="segmented" aria-label="Attraction type filter">
        ${[["all","All"],["rides","Rides"],["shows","Shows"],["other","Other"]].map(([key,label]) => `<button type="button" data-action="wait-filter" data-filter="${key}" class="${filter === key ? "active" : ""}">${label}</button>`).join("")}
      </div>
      <div class="toggle-row"><div><strong>Open only</strong><div class="meta">Hide attractions currently reporting closed.</div></div><label class="toggle"><input id="openOnlyToggle" type="checkbox" ${state.waits.openOnly ? "checked" : ""}><span></span></label></div>
    </section>
    ${rides.length ? [...byLand.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([land, entries]) => `<section class="section"><div class="section-header"><div><h3>${esc(land)}</h3><p>${entries.length} attraction${entries.length === 1 ? "" : "s"}</p></div></div><div class="ride-list">${entries.map(rideCardHTML).join("")}</div></section>`).join("") : emptyStateHTML("⌕", "No matches", "Try a different search or filter.")}
  </div>`;

  const search = panel.querySelector("#waitSearch");
  if (search) {
    search.addEventListener("input", debounce((event) => {
      store.update((s) => { s.waits.query = event.target.value; }, "wait-query");
    }, 180));
  }
  panel.querySelector("#openOnlyToggle")?.addEventListener("change", (event) => {
    store.update((s) => { s.waits.openOnly = event.target.checked; }, "wait-filter");
  });
}

function renderFavorites() {
  const panel = panels.get("favorites");
  const favoriteSet = new Set(store.state.favorites.map(Number));
  const rides = queueData.allRides().filter((ride) => favoriteSet.has(ride.id)).sort((a, b) => a.parkId - b.parkId || a.name.localeCompare(b.name));
  panel.innerHTML = `<div class="stack"><section class="section"><div class="section-header"><div><p class="eyebrow">Your picks</p><h2>Favorites</h2><p>${rides.length} saved attraction${rides.length === 1 ? "" : "s"}</p></div></div></section>${rides.length ? `<div class="ride-list">${rides.map(rideCardHTML).join("")}</div>` : emptyStateHTML("☆", "No favorites yet", "Tap the star on any attraction to keep it handy and give it a small recommendation boost.")}</div>`;
}

function renderSettings() {
  const panel = panels.get("settings");
  const { theme, accent } = store.state.appearance;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const notificationPermission = pushSupported ? Notification.permission : "default";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  panel.innerHTML = `<div class="stack">
    <section class="section"><div class="section-header"><div><p class="eyebrow">ParkPulse ${VERSION}</p><h2>Settings</h2><p>Personal, local-first, and account-free.</p></div></div></section>
    <div class="settings-grid">
      <section class="settings-row"><h3>Appearance</h3><p>System follows your device automatically.</p><div class="segmented" style="margin-top:10px">${["system","light","dark"].map((key) => `<button type="button" data-action="set-theme" data-theme="${key}" class="${theme === key ? "active" : ""}">${key[0].toUpperCase()+key.slice(1)}</button>`).join("")}</div>
        <div class="accent-grid">${Object.entries(ACCENTS).map(([key, value]) => `<button type="button" class="accent-swatch ${accent === key ? "active" : ""}" data-action="set-accent" data-accent="${key}" style="--swatch:${value.hex}"><span class="accent-dot"></span><span>${value.label}</span></button>`).join("")}</div>
      </section>
      <section class="settings-row"><h3>Notifications</h3><p>${pushSupported ? (workerBase ? "Enable real Web Push alerts for watched rides when the included backend is deployed." : "The app is push-ready. Set WORKER_BASE in assets/js/config.js after deploying the included Cloudflare Worker.") : "This browser does not expose the Web Push APIs ParkPulse needs."}</p><div class="button-row" style="margin-top:10px"><button type="button" class="primary-button small-button" data-action="enable-notifications" ${!pushSupported || !workerBase ? "disabled" : ""}>${notificationPermission === "granted" ? "Notifications Enabled" : "Enable Notifications"}</button>${notificationPermission === "granted" ? `<button type="button" class="ghost-button small-button" data-action="sync-notifications">Sync watched rides</button>` : ""}</div></section>
      <section class="settings-row"><h3>Install on iPhone</h3><p>${standalone ? "ParkPulse is running as an installed Home Screen app." : "In Safari, use Share → Add to Home Screen. Web Push on iPhone is available to Home Screen web apps."}</p></section>
      <section class="settings-row"><h3>Live data</h3><p>Queue-Times provides live wait/status data. ParkPulse keeps a small local wait history to spot unusually good timing windows.</p><div class="button-row" style="margin-top:10px"><button type="button" class="ghost-button small-button" data-action="manual-refresh">Refresh now</button><a class="ghost-button small-button" style="text-decoration:none;display:inline-flex;align-items:center" href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Queue-Times.com</a></div></section>
      <section class="settings-row"><h3>Local data</h3><p>Your favorites, priorities, itinerary, and Park Day progress stay in this browser unless you reset them.</p><div class="button-row" style="margin-top:10px"><button type="button" class="danger-button small-button" data-action="reset-data">Reset ParkPulse</button></div></section>
    </div>
  </div>`;
}

function rideCardHTML(ride) {
  return `<article class="ride-card"><div class="ride-card-main"><div><p class="ride-name">${esc(ride.name)}</p><p class="ride-land">${esc(ride.land)} • ${esc(parkName(ride.parkId))}</p></div>${waitBadge(ride)}</div><div class="ride-actions">${rideActionButtons(ride)}</div></article>`;
}

function rideActionButtons(ride) {
  const favorite = store.state.favorites.includes(ride.id);
  const inPlan = store.state.itinerary.some((item) => item.type === "ride" && Number(item.rideId) === ride.id);
  const priority = Number(store.state.priorities[ride.id] ?? 1);
  const priorityInfo = PRIORITIES.find((entry) => entry.value === priority) || PRIORITIES[1];
  return `<button type="button" class="action-chip ${favorite ? "active" : ""}" data-action="toggle-favorite" data-ride-id="${ride.id}" aria-label="${favorite ? "Remove from favorites" : "Add to favorites"}">${favorite ? "★ Favorite" : "☆ Favorite"}</button>
    <button type="button" class="action-chip priority-chip" data-action="cycle-priority" data-ride-id="${ride.id}">${priorityInfo.icon} ${priorityInfo.label}</button>
    <button type="button" class="action-chip ${inPlan ? "active" : ""}" data-action="${inPlan ? "goto-plan" : "add-plan-ride"}" data-ride-id="${ride.id}">${inPlan ? "✓ In Plan" : "+ Plan"}</button>`;
}

function emptyStateHTML(icon, title, body) {
  return `<div class="card empty-state"><span class="big-icon" aria-hidden="true">${icon}</span><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
}

function renderParkDayPill() {
  const state = store.state;
  if (!state.parkDay.active || !state.itinerary.length) {
    parkDayPill.classList.add("hidden");
    parkDayPill.innerHTML = "";
    return;
  }
  const next = nextUp(state, queueData);
  if (!next) {
    parkDayPill.classList.add("hidden");
    return;
  }
  const item = next.item;
  const title = item.type === "custom" ? item.title : (next.ride?.name || item.name || "Next stop");
  const subtitle = item.type === "ride" ? (next.ride?.isOpen ? `${next.ride.waitTime} min • ${parkName(next.ride.parkId)}` : `Closed • ${parkName(item.parkId)}`) : `${parkName(item.parkId)}${item.time ? ` • ${item.time}` : ""}`;
  parkDayPill.innerHTML = `<div><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><div class="button-row"><button type="button" class="primary-button small-button" data-action="mark-done" data-uid="${esc(item.uid)}">Done</button><button type="button" class="ghost-button small-button" data-action="skip-item" data-uid="${esc(item.uid)}">Skip</button></div>`;
  parkDayPill.classList.remove("hidden");
}

function renderNetworkBanner() {
  let message = "";
  if (!navigator.onLine) message = "Offline — showing your saved plan and the latest wait data ParkPulse has.";
  else if (queueData.error) message = queueData.error;
  else if (queueData.source === "cache") message = "Showing saved wait data while ParkPulse reconnects.";
  if (!message) networkBanner.classList.add("hidden");
  else { networkBanner.textContent = message; networkBanner.classList.remove("hidden"); }
}

function renderAll() {
  applyAppearance();
  renderForYou();
  renderPlan();
  renderWaits();
  renderFavorites();
  renderSettings();
  renderParkDayPill();
  renderNetworkBanner();
  syncActiveTab(false);
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}

function syncActiveTab(restoreScroll = true) {
  const target = store.state.activeTab || "for-you";
  for (const [key, panel] of panels) panel.classList.toggle("active", key === target);
  for (const button of tabButtons) {
    const active = button.dataset.tab === target;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  if (restoreScroll) {
    const y = getScrollPositions()[target] || 0;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }
}

function switchTab(next) {
  if (!panels.has(next) || next === store.state.activeTab) return;
  setScrollPosition(store.state.activeTab, window.scrollY);
  store.update((state) => { state.activeTab = next; }, "tab");
  syncActiveTab(true);
}

function openModal(html, cleanup = null) {
  closeModal();
  modal.innerHTML = html;
  modal.classList.remove("hidden");
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  modalCleanup = cleanup;
  modal.querySelector("[autofocus]")?.focus();
}

function closeModal() {
  modalCleanup?.();
  modalCleanup = null;
  modal.classList.add("hidden");
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  modal.innerHTML = "";
}

function openAttractionPicker() {
  const allRides = queueData.allRides().filter((ride) => ride.kind === "ride");
  const already = new Set(store.state.itinerary.filter((item) => item.type === "ride").map((item) => Number(item.rideId)));
  const selected = new Set();
  const favoriteSet = new Set(store.state.favorites.map(Number));
  const recIds = new Set(recommendations(allRides, store.state, { limit: 12 }).map((entry) => entry.ride.id));
  const ordered = [...allRides].sort((a, b) => a.parkId - b.parkId || a.name.localeCompare(b.name));

  const modalHTML = `<header class="modal-header"><div class="modal-grabber"></div><div class="modal-title-row"><div><p class="eyebrow">Itinerary</p><h2 id="modalTitle">Add Attractions</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">×</button></div><input id="pickerSearch" class="search-input" style="margin-top:11px" type="search" placeholder="Search rides or parks" autofocus></header>
    <div id="pickerBody" class="modal-body"></div>
    <footer class="modal-footer"><strong id="pickerCount" class="meta">0 selected</strong><div class="button-row"><button type="button" class="ghost-button small-button" data-action="close-modal">Cancel</button><button id="pickerAddButton" type="button" class="primary-button small-button" disabled>Add Selected</button></div></footer>`;
  openModal(modalHTML);

  const body = modal.querySelector("#pickerBody");
  const input = modal.querySelector("#pickerSearch");
  const count = modal.querySelector("#pickerCount");
  const addButton = modal.querySelector("#pickerAddButton");

  function renderRows() {
    const query = input.value.toLowerCase().trim();
    const visible = ordered.filter((ride) => !already.has(ride.id) && (!query || ride.name.toLowerCase().includes(query) || parkName(ride.parkId).toLowerCase().includes(query)));
    const favorites = visible.filter((ride) => favoriteSet.has(ride.id));
    const recommended = visible.filter((ride) => !favoriteSet.has(ride.id) && recIds.has(ride.id));
    const browse = visible.filter((ride) => !favoriteSet.has(ride.id) && !recIds.has(ride.id));
    const sections = [["Favorites", favorites], ["Recommended", recommended], ["Browse", browse]].filter(([, rides]) => rides.length);
    body.innerHTML = sections.length ? sections.map(([label, rides]) => `<div><p class="modal-section-label">${label}</p>${rides.map((ride) => pickerRowHTML(ride, selected.has(ride.id))).join("")}</div>`).join("") : emptyStateHTML("⌕", "No rides found", already.size ? "Everything matching this search is already in your plan." : "Try another search.");
  }

  function updateCount() {
    count.textContent = `${selected.size} selected`;
    addButton.disabled = selected.size === 0;
  }

  input.addEventListener("input", renderRows);
  body.addEventListener("click", (event) => {
    const row = event.target.closest("[data-picker-ride]");
    if (!row) return;
    const id = Number(row.dataset.pickerRide);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    row.classList.toggle("selected", selected.has(id));
    row.querySelector(".picker-check").textContent = selected.has(id) ? "✓" : "";
    updateCount();
  });
  addButton.addEventListener("click", () => {
    for (const id of selected) {
      const ride = queueData.rideById(id);
      if (ride) store.addRideToPlan(ride);
    }
    closeModal();
    toast(`${selected.size} attraction${selected.size === 1 ? "" : "s"} added to your plan.`);
  });
  renderRows();
  updateCount();
}

function pickerRowHTML(ride, selected) {
  return `<button type="button" class="picker-row ${selected ? "selected" : ""}" data-picker-ride="${ride.id}"><div><strong>${esc(ride.name)}</strong><div class="meta" style="margin-top:4px">${esc(parkName(ride.parkId))} • ${ride.isOpen ? `${ride.waitTime} min` : "Closed"}</div></div><span class="picker-check" aria-hidden="true">${selected ? "✓" : ""}</span></button>`;
}

function openCustomBlockModal() {
  const options = CUSTOM_BLOCK_KINDS.map((kind) => `<option value="${kind.key}">${kind.icon} ${kind.label}</option>`).join("");
  const parkOptions = PARKS.map((park) => `<option value="${park.id}" ${park.id === Number(store.state.selectedParkId) ? "selected" : ""}>${park.shortName}</option>`).join("");
  openModal(`<header class="modal-header"><div class="modal-grabber"></div><div class="modal-title-row"><div><p class="eyebrow">Itinerary</p><h2 id="modalTitle">Custom Block</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">×</button></div></header>
    <div class="modal-body"><form id="customBlockForm" class="stack">
      <label><span class="meta">Type</span><select name="kind" class="select-input">${options}</select></label>
      <label><span class="meta">Title</span><input name="title" class="text-input" required maxlength="80" placeholder="Lunch, resort break, Skyliner…" autofocus></label>
      <label><span class="meta">Park</span><select name="parkId" class="select-input">${parkOptions}</select></label>
      <label><span class="meta">Time (optional)</span><input name="time" class="time-input" type="time"></label>
      <label><span class="meta">Note (optional)</span><textarea name="note" class="textarea-input" maxlength="220" placeholder="Anything useful for the day"></textarea></label>
    </form></div>
    <footer class="modal-footer"><span></span><div class="button-row"><button type="button" class="ghost-button small-button" data-action="close-modal">Cancel</button><button type="submit" form="customBlockForm" class="primary-button small-button">Add Block</button></div></footer>`);
  modal.querySelector("#customBlockForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    store.addCustomBlock(Object.fromEntries(form.entries()));
    closeModal();
    toast("Custom block added.");
  });
}

async function refreshData({ manual = false, silent = false } = {}) {
  if (queueData.refreshing) return;
  lastRefreshAttempt = Date.now();
  refreshButton.classList.add("spinning");
  refreshButton.disabled = true;
  try {
    await queueData.refresh({ silent });
    if (manual) toast(queueData.error ? "Using saved data — live refresh failed." : "Wait times refreshed.");
  } finally {
    refreshButton.classList.remove("spinning");
    refreshButton.disabled = false;
  }
}

async function enableNotifications() {
  if (!workerBase) return toast("Deploy the included Worker and set WORKER_BASE first.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return toast("Web Push is not supported here.");
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return toast("Notifications were not enabled.");
    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await fetch(`${workerBase}/vapid-key`);
    if (!keyResponse.ok) throw new Error("Could not load VAPID key");
    const { publicKey } = await keyResponse.json();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await postSubscription(subscription);
    toast("ParkPulse notifications are enabled.");
    scheduleRender();
  } catch (error) {
    console.error(error);
    toast("ParkPulse couldn't finish notification setup.");
  }
}

async function syncNotifications({ quiet = false } = {}) {
  if (!workerBase || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await postSubscription(subscription);
    if (!quiet) toast("Watched rides synced.");
  } catch (error) {
    console.warn("Push sync failed", error);
    if (!quiet) toast("Could not sync watched rides.");
  }
}

async function postSubscription(subscription) {
  const watchIds = [...new Set([
    ...store.state.favorites,
    ...store.state.itinerary.filter((item) => item.type === "ride").map((item) => Number(item.rideId))
  ])];
  const response = await fetch(`${workerBase}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), watchIds })
  });
  if (!response.ok) throw new Error(`Subscription sync failed (${response.status})`);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function formatRelativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "recently";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function handleAction(actionEl) {
  const action = actionEl.dataset.action;
  const rideId = Number(actionEl.dataset.rideId);
  const uid = actionEl.dataset.uid;
  switch (action) {
    case "select-park": store.update((s) => { s.selectedParkId = Number(actionEl.dataset.parkId); }, "park"); break;
    case "goto-plan": switchTab("plan"); break;
    case "toggle-favorite":
      store.update((s) => { const index = s.favorites.indexOf(rideId); if (index >= 0) s.favorites.splice(index, 1); else s.favorites.push(rideId); }, "favorites");
      syncNotifications({ quiet: true });
      break;
    case "cycle-priority":
      store.update((s) => { const current = Number(s.priorities[rideId] ?? 1); s.priorities[rideId] = (current + 1) % PRIORITIES.length; }, "priority");
      break;
    case "add-plan-ride": {
      const ride = queueData.rideById(rideId); if (ride) { store.addRideToPlan(ride); toast(`${ride.name} added to your plan.`); syncNotifications({ quiet: true }); } break;
    }
    case "open-attraction-picker": openAttractionPicker(); break;
    case "open-custom-block": openCustomBlockModal(); break;
    case "close-modal": closeModal(); break;
    case "toggle-plan-edit": store.update((s) => { s.planEditMode = !s.planEditMode; }, "plan-edit"); break;
    case "move-item":
      store.update((s) => { const index = s.itinerary.findIndex((item) => item.uid === uid); const next = index + Number(actionEl.dataset.direction); if (index < 0 || next < 0 || next >= s.itinerary.length) return; [s.itinerary[index], s.itinerary[next]] = [s.itinerary[next], s.itinerary[index]]; }, "itinerary");
      break;
    case "remove-item":
      store.update((s) => { s.itinerary = s.itinerary.filter((item) => item.uid !== uid); s.daily.doneUids = s.daily.doneUids.filter((id) => id !== uid); s.parkDay.skippedUids = s.parkDay.skippedUids.filter((id) => id !== uid); }, "itinerary");
      syncNotifications({ quiet: true });
      break;
    case "toggle-done":
    case "mark-done":
      store.update((s) => { const isDone = s.daily.doneUids.includes(uid); s.daily.doneUids = isDone ? s.daily.doneUids.filter((id) => id !== uid) : [...s.daily.doneUids, uid]; const item = s.itinerary.find((entry) => entry.uid === uid); if (!isDone && item?.type === "ride" && !s.daily.riddenRideIds.includes(Number(item.rideId))) s.daily.riddenRideIds.push(Number(item.rideId)); }, "progress");
      break;
    case "skip-item": store.update((s) => { if (!s.parkDay.skippedUids.includes(uid)) s.parkDay.skippedUids.push(uid); }, "progress"); break;
    case "start-day": store.update((s) => { s.parkDay.active = true; s.parkDay.startedAt = new Date().toISOString(); s.parkDay.skippedUids = []; }, "park-day"); toast("Park Day started. Next Up is live."); break;
    case "end-day": store.update((s) => { s.parkDay.active = false; }, "park-day"); break;
    case "wait-filter": store.update((s) => { s.waits.filter = actionEl.dataset.filter; }, "wait-filter"); break;
    case "set-theme": store.update((s) => { s.appearance.theme = actionEl.dataset.theme; }, "appearance"); break;
    case "set-accent": store.update((s) => { s.appearance.accent = actionEl.dataset.accent; }, "appearance"); break;
    case "enable-notifications": enableNotifications(); break;
    case "sync-notifications": syncNotifications(); break;
    case "manual-refresh": refreshData({ manual: true }); break;
    case "reset-data":
      if (confirm("Reset your ParkPulse favorites, priorities, itinerary, history, and Park Day progress?")) { store.resetAll(); toast("ParkPulse was reset."); refreshData({ silent: true }); }
      break;
  }
}

function registerEvents() {
  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl && !actionEl.disabled) handleAction(actionEl);
  });
  tabButtons.forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  refreshButton.addEventListener("click", () => refreshData({ manual: true }));
  modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal(); });
  window.addEventListener("online", () => { renderNetworkBanner(); refreshData({ silent: true }); });
  window.addEventListener("offline", renderNetworkBanner);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastRefreshAttempt > 2 * 60 * 1000) refreshData({ silent: true });
  });
  window.addEventListener("pagehide", () => setScrollPosition(store.state.activeTab, window.scrollY));
  store.addEventListener("change", (event) => {
    if (event.detail?.reason !== "tab") scheduleRender();
  });
  queueData.addEventListener("update", scheduleRender);
}

async function boot() {
  applyAppearance();
  registerEvents();
  renderAll();
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./service-worker.js", { scope: "./" }); }
    catch (error) { console.warn("Service worker registration failed", error); }
  }
  await refreshData({ silent: true });
  setInterval(() => { if (document.visibilityState === "visible") refreshData({ silent: true }); }, refreshInterval);
}

boot();
