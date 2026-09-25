import { PARKS, parkName, minutesLabel, relativeTime, escapeHtml, isRideStale } from "./data.js?v=1.8.4-preview.1";
import { store } from "./store.js?v=1.8.4-preview.1";
import { rideData, fetchRideHistory, fetchRideInsights, fetchAnalyticsStatus } from "./api.js?v=1.8.4-preview.1";
import { currentSubscription, enablePush, syncRules, disablePush, backendHealth, sendTestPush } from "./push.js?v=1.8.4-preview.1";
import { applySeasonalTheme, seasonalEffectsEnabled, setSeasonalEffectsEnabled, glassStyleSetting, setGlassStyleSetting } from "./seasonal.js?v=1.8.4-preview.1";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const views = { explore: $("#view-explore"), watching: $("#view-watching"), settings: $("#view-settings") };
const sheet = $("#rideSheet");
const backdrop = $("#sheetBackdrop");
const installHelpSheet = $("#installHelpSheet");
const installHelpBackdrop = $("#installHelpBackdrop");
const pullRefresh = $("#pullRefresh");
const pullRefreshLabel = $("#pullRefreshLabel");
const APP_VERSION = "1.8.4-preview.1";
let installPrompt = null;
let pushOn = false;
let rulesSynced = false;
let syncQueue = Promise.resolve();
let backendState = { ok: null };
let analyticsState = null;
let serviceWorkerRegistration = null;
let pendingServiceWorker = null;
let sheetReturnFocus = null;
let installHelpReturnFocus = null;
let nextUpOffset = 0;

const FIRST_RUN_KEY = "parkpulse.quickStart.v1";

const ACCENTS = [
  { id:"blue", label:"Blue" },
  { id:"cyan", label:"Cyan" },
  { id:"violet", label:"Violet" },
  { id:"pink", label:"Pink" },
  { id:"orange", label:"Orange" },
  { id:"green", label:"Green" },
  { id:"red", label:"Red" },
  { id:"gold", label:"Gold" }
];

const PULL_REFRESH_TRIGGER = 82;
const PULL_REFRESH_MAX_OFFSET = 86;
const pullRefreshMedia = window.matchMedia?.("(pointer: coarse) and (max-width: 1023px)");
let pullStartX = 0;
let pullStartY = 0;
let pullRawDistance = 0;
let pullTracking = false;
let pullRefreshing = false;

function pullRefreshAvailable() {
  return Boolean(pullRefresh && pullRefreshMedia?.matches);
}
function resetPullRefresh({ immediate = false } = {}) {
  pullTracking = false;
  pullRawDistance = 0;
  document.body.classList.remove("ptr-tracking");
  if (!pullRefresh) return;
  pullRefresh.classList.remove("pulling", "armed", "refreshing", "success", "error");
  if (immediate) pullRefresh.classList.add("no-transition");
  pullRefresh.style.setProperty("--pull-y", "0px");
  pullRefreshLabel.textContent = "Pull to refresh";
  requestAnimationFrame(() => pullRefresh.classList.remove("active", "no-transition"));
}
function setPullRefreshDistance(rawDistance) {
  if (!pullRefresh) return;
  const eased = Math.min(PULL_REFRESH_MAX_OFFSET, Math.max(0, rawDistance) * 0.56);
  const armed = rawDistance >= PULL_REFRESH_TRIGGER;
  pullRefresh.style.setProperty("--pull-y", `${eased}px`);
  pullRefresh.classList.add("active", "pulling");
  pullRefresh.classList.toggle("armed", armed);
  pullRefreshLabel.textContent = armed ? "Release to refresh" : "Pull to refresh";
}
async function triggerPullRefresh() {
  if (!pullRefreshAvailable() || pullRefreshing || rideData.refreshing) {
    resetPullRefresh();
    return;
  }

  pullRefreshing = true;
  pullTracking = false;
  document.body.classList.remove("ptr-tracking");
  pullRefresh.classList.remove("pulling", "armed");
  pullRefresh.classList.add("active", "refreshing");
  pullRefresh.style.setProperty("--pull-y", "62px");
  pullRefreshLabel.textContent = "Refreshing…";

  const before = rideData.updatedAt;
  await rideData.refresh();

  const updated = Boolean(rideData.updatedAt && rideData.updatedAt !== before);
  pullRefresh.classList.remove("refreshing");
  pullRefresh.classList.add(updated ? "success" : "error");
  pullRefreshLabel.textContent = updated ? "Updated" : "Couldn't refresh";

  await new Promise((resolve) => setTimeout(resolve, updated ? 420 : 700));
  pullRefreshing = false;
  resetPullRefresh();
}
function setupPullToRefresh() {
  if (!pullRefresh || !pullRefreshMedia) return;

  const syncAvailability = () => {
    pullRefresh.classList.toggle("enabled", pullRefreshMedia.matches);
    if (!pullRefreshMedia.matches) resetPullRefresh({ immediate: true });
  };
  syncAvailability();
  pullRefreshMedia.addEventListener?.("change", syncAvailability);

  window.addEventListener("touchstart", (event) => {
    if (
      !pullRefreshAvailable() ||
      pullRefreshing ||
      rideData.refreshing ||
      document.body.classList.contains("sheet-open") ||
      window.scrollY > 0 ||
      event.touches.length !== 1
    ) {
      pullTracking = false;
      return;
    }

    const touch = event.touches[0];
    pullStartX = touch.clientX;
    pullStartY = touch.clientY;
    pullRawDistance = 0;
    pullTracking = true;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (!pullTracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - pullStartX;
    const deltaY = touch.clientY - pullStartY;

    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) * 0.8) {
      resetPullRefresh({ immediate: true });
      return;
    }

    if (window.scrollY > 0) {
      resetPullRefresh({ immediate: true });
      return;
    }

    if (deltaY < 5) return;

    event.preventDefault();
    document.body.classList.add("ptr-tracking");
    pullRawDistance = deltaY;
    setPullRefreshDistance(deltaY);
  }, { passive: false });

  const finishPull = () => {
    if (!pullTracking) return;
    const shouldRefresh = pullRawDistance >= PULL_REFRESH_TRIGGER;
    pullTracking = false;
    document.body.classList.remove("ptr-tracking");
    if (shouldRefresh) triggerPullRefresh();
    else resetPullRefresh();
  };

  window.addEventListener("touchend", finishPull, { passive: true });
  window.addEventListener("touchcancel", () => resetPullRefresh(), { passive: true });
}

function firstRunVisible() {
  try { return localStorage.getItem(FIRST_RUN_KEY) !== "seen"; }
  catch { return false; }
}
function dismissFirstRun() {
  try { localStorage.setItem(FIRST_RUN_KEY, "seen"); } catch {}
  render();
}

function platformInfo() {
  const ua = navigator.userAgent || "";
  const ipadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iphone|ipad|ipod/i.test(ua) || ipadDesktopMode;
  const android = /android/i.test(ua);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return { ios, android, standalone, mobile: ios || android };
}
function installSetting() {
  const platform = platformInfo();
  if (platform.standalone) {
    return { visible: true, installed: true, copy: "Installed and ready to go.", action: "Installed" };
  }
  if (platform.ios) {
    return { visible: true, installed: false, copy: "Add ParkPulse to your Home Screen first — that’s how push works on iPhone and iPad.", action: "Add" };
  }
  if (platform.android) {
    return { visible: true, installed: false, copy: "Install it for app-style launch and background ride alerts.", action: "Install" };
  }
  if (installPrompt) {
    return { visible: true, installed: false, copy: "Install ParkPulse as its own desktop app.", action: "Install" };
  }
  return { visible: false, installed: false, copy: "", action: "" };
}
function iconBell(active = false) {
  if (active) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="bell-solid" d="M12 2a6 6 0 0 0-6 6v3.35c0 1.92-.67 3.78-1.9 5.25l-.68.81A1 1 0 0 0 4.2 19h15.6a1 1 0 0 0 .78-1.59l-.68-.81A8.15 8.15 0 0 1 18 11.35V8a6 6 0 0 0-6-6Zm-2.75 18a3 3 0 0 0 5.5 0h-5.5Z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>`;
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
function dateKeyInZone(date, timeZone) {
  const parts = zoneParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function parkTimeFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });
}
function compactDuration(minutes) {
  const mins = Math.max(0, Math.floor(Number(minutes) || 0));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
function formatParkHours(hours, now = Date.now()) {
  if (!hours?.timezone || !hours?.date) return "";
  if (hours.date !== dateKeyInZone(new Date(now), hours.timezone)) return "";
  if (hours.closedToday) return "Closed today";
  if (!hours.openingTime || !hours.closingTime) return "";

  const formatter = parkTimeFormatter(hours.timezone);
  const range = `${formatter.format(new Date(hours.openingTime))}–${formatter.format(new Date(hours.closingTime))}`;
  const openMs = new Date(hours.openingTime).getTime();
  const closeMs = new Date(hours.closingTime).getTime();
  const remainingMinutes = Math.floor((closeMs - now) / 60000);

  if (Number.isFinite(openMs) && now >= openMs && Number.isFinite(remainingMinutes) && remainingMinutes > 0 && remainingMinutes <= 240) {
    return `Closes in ${compactDuration(remainingMinutes)} · ${range}`;
  }

  return `Today · ${range}`;
}
function formatTicketedEvents(hours) {
  if (!hours?.timezone || !hours?.date) return [];
  if (hours.date !== dateKeyInZone(new Date(), hours.timezone)) return [];

  const formatter = parkTimeFormatter(hours.timezone);
  return (Array.isArray(hours.ticketedEvents) ? hours.ticketedEvents : [])
    .filter((event) => event?.openingTime && event?.closingTime)
    .map((event) => ({
      name: String(event.name || "Special Ticketed Event"),
      hours: `${formatter.format(new Date(event.openingTime))}–${formatter.format(new Date(event.closingTime))}`
    }));
}
function crowdPresentation(crowd) {
  if (!crowd) return { kind: "none", text: "" };

  if (crowd.available) {
    const delta = Number(crowd.deltaPercent || 0);
    const pressureText = Math.abs(delta) < 5
      ? "Waits are about normal"
      : delta < 0
        ? `Waits are ${Math.abs(delta)}% below typical`
        : `Waits are ${delta}% above typical`;

    const trend = crowd.trend?.direction === "up"
      ? { symbol:"↗", label:"building", direction:"up" }
      : crowd.trend?.direction === "down"
        ? { symbol:"↘", label:"easing", direction:"down" }
        : crowd.trend?.direction === "steady"
          ? { symbol:"→", label:"steady", direction:"steady" }
          : null;

    return {
      kind: "level",
      level: Number(crowd.level || 0),
      label: String(crowd.label || ""),
      text: pressureText,
      samples: Number(crowd.samples || 0),
      trend
    };
  }

  if (crowd.reason === "ticketed-event") {
    return { kind: "note", text: "Crowd estimate paused for the ticketed event" };
  }

  if (crowd.reason === "building") {
    return {
      kind: "note",
      text: `Still building the crowd estimate · ${Number(crowd.samples || 0)}/${Number(crowd.requiredSamples || 0)} rides`
    };
  }

  return { kind: "none", text: "" };
}
function crowdMarkup(crowd, hours, now = Date.now()) {
  // Never present cached wait pressure as a live estimate outside today's hours.
  if (!hours?.timezone || !hours?.date || hours.date !== dateKeyInZone(new Date(now), hours.timezone)) return "";
  const opening = Date.parse(hours.openingTime);
  const closing = Date.parse(hours.closingTime);
  if (hours.closedToday || !Number.isFinite(opening) || !Number.isFinite(closing) || now < opening || now >= closing) return "";
  const view = crowdPresentation(crowd);
  if (view.kind === "level") {
    const level = Math.max(1, Math.min(10, Math.round(view.level)));
    const segments = Array.from({ length: 10 }, (_, i) => `<i${i < level ? ' class="filled"' : ""}></i>`).join("");
    const expanded = typeof document !== "undefined" && document.querySelector(".crowd-explanation")?.open;
    return `<div class="park-crowd crowd-level-${level}"><div class="crowd-overview"><span class="crowd-meter" aria-hidden="true">${segments}</span><span class="crowd-score"><b>${level}/10</b> ${escapeHtml(view.label)}</span>${view.trend ? `<span class="crowd-trend trend-${view.trend.direction}">${view.trend.symbol} ${escapeHtml(view.trend.label)}</span>` : ""}</div><span class="crowd-detail">${escapeHtml(view.text)}</span><details class="crowd-explanation"${expanded ? " open" : ""}><summary>About this estimate</summary><p>Based on ${view.samples} rides with usable wait comparisons. This estimates crowd pressure from wait times, not a count of people in the park.</p></details></div>`;
  }
  if (view.kind === "note") {
    return `<div class="park-crowd crowd-note"><span class="crowd-detail">${escapeHtml(view.text)}</span></div>`;
  }
  return "";
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
function rideComparison(ride) {
  if (!ride || isRideStale(ride) || !ride.isOpen || !ride.baselineReady) return null;

  const wait = Number(ride.waitTime);
  const typical = Number(ride.typicalWait);
  const baselineDays = Number(ride.baselineDays || 0);
  const baselineMinutes = Number(ride.baselineMinutes || 0);

  if (
    !Number.isFinite(wait) ||
    wait <= 0 ||
    !Number.isFinite(typical) ||
    typical <= 0 ||
    baselineDays < 5 ||
    baselineMinutes < 60
  ) return null;

  const ratio = wait / typical;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  return {
    ratio,
    percentDelta: Math.max(-99, Math.min(199, Math.round((ratio - 1) * 100)))
  };
}

function typicalComparisonBadge(ride) {
  const comparison = rideComparison(ride);
  if (!comparison) return null;

  const delta = comparison.percentDelta;

  if (delta <= -10) {
    return {
      text: `↓ ${Math.abs(delta)}% vs typical`,
      tone: "good"
    };
  }

  if (delta >= 30) {
    return {
      text: `↑ ${delta}% vs typical`,
      tone: "very-high"
    };
  }

  if (delta >= 15) {
    return {
      text: `↑ ${delta}% vs typical`,
      tone: "high"
    };
  }

  return null;
}


function recommendationScore(ride, state = store.snapshot) {
  if (!ride || !ride.isOpen || isRideStale(ride) || ride.sourceMissing) return -Infinity;
  const id = String(ride.id);
  const comparison = rideComparison(ride);
  const wait = Number(ride.waitTime);
  let score = 0;

  if (state.mustDo.includes(id)) score += 500;
  if (state.favorites.includes(id)) score += 220;
  if (comparison) score += Math.max(-180, Math.min(300, (1 - comparison.ratio) * 320));
  if (Number.isFinite(wait)) score += Math.max(-80, 120 - wait) * 1.15;

  return score;
}

function recommendationReason(ride, state = store.snapshot) {
  if (!ride) return "No live ride data yet.";
  if (isRideStale(ride)) return "Live data is stale right now.";
  if (!ride.isOpen) return "Currently unavailable.";
  const id = String(ride.id);
  const comparison = rideComparison(ride);
  const wait = Number(ride.waitTime);
  const priority = state.mustDo.includes(id) ? "Must-do" : state.favorites.includes(id) ? "Favorite" : "";

  if (comparison?.percentDelta <= -25) {
    return `${priority ? priority + " · " : ""}${Math.abs(comparison.percentDelta)}% below typical right now`;
  }
  if (comparison?.percentDelta <= -10) {
    return `${priority ? priority + " · " : ""}${Math.abs(comparison.percentDelta)}% better than typical right now`;
  }
  if (Number.isFinite(wait) && wait <= 20) {
    return `${priority ? priority + " · " : ""}${wait} min right now`;
  }
  if (priority && Number.isFinite(wait)) return `${priority} · open at ${wait} min`;
  if (Number.isFinite(wait)) return `Open at ${wait} min right now`;
  return "Open right now.";
}

function recommendationCandidates(state = store.snapshot) {
  return rideData.ridesForPark(state.selectedParkId)
    .filter(ride => ride.isOpen && !isRideStale(ride) && !ride.sourceMissing && Number.isFinite(Number(ride.waitTime)))
    .sort((a, b) =>
      recommendationScore(b, state) - recommendationScore(a, state) ||
      Number(a.waitTime ?? Infinity) - Number(b.waitTime ?? Infinity) ||
      a.name.localeCompare(b.name)
    );
}

function nextUpRide(state = store.snapshot) {
  const candidates = recommendationCandidates(state);
  if (!candidates.length) return null;
  const index = ((nextUpOffset % candidates.length) + candidates.length) % candidates.length;
  return candidates[index];
}

function nextUpMarkup(state = store.snapshot) {
  const ride = nextUpRide(state);
  if (!ride) return "";

  const status = rideStatus(ride);
  const reason = recommendationReason(ride, state);
  const comparison = rideComparison(ride);
  const label = comparison?.percentDelta <= -25
    ? "Great right now"
    : state.mustDo.includes(String(ride.id))
      ? "Must-do pick"
      : state.favorites.includes(String(ride.id))
        ? "Favorite pick"
        : "ParkPulse pick";

  return `<section class="next-up-card liquid-glass">
    <div class="next-up-head">
      <div><span class="eyebrow">${escapeHtml(label)}</span><h3>What should I ride next?</h3><p>${escapeHtml(reason)}</p></div>
    </div>
    <div class="next-up-ride-row">
      <button class="next-up-ride" type="button" data-open-ride="${ride.id}">
        <span class="ride-land">${escapeHtml(ride.land)}</span>
        <strong>${escapeHtml(ride.name)}</strong>
      </button>
      <div class="next-up-wait"><b class="${status.stale ? "stale" : ride.isOpen ? "open" : "closed"}">${escapeHtml(status.wait)}</b><span>${escapeHtml(status.label)}</span></div>
    </div>
    <div class="next-up-actions">
      <button class="primary-button next-up-primary" type="button" data-open-ride="${ride.id}">View ride</button>
      <button class="secondary-button" type="button" data-next-up-another>Show another</button>
    </div>
  </section>`;
}

function cycleNextUp() {
  nextUpOffset += 1;
  renderExplore();
  bindDynamic();
}

function rideStatus(ride) {
  if (!ride) return { stale:true, wait:"—", label:"No live data", updated:"Unavailable" };
  const stale = isRideStale(ride);
  if (ride.sourceMissing) return { stale:true, wait:"No data", label:"Standby feed unavailable", updated:"Waiting for live standby data" };
  const wait = minutesLabel(ride.waitTime, ride.isOpen);
  if (stale) return { stale:true, wait, label:`Stale · last seen ${relativeTime(ride.lastUpdated)}`, updated:`Last seen ${relativeTime(ride.lastUpdated)}` };
  if (ride.operationalStatus === "DOWN") {
    const downtime = Number.isFinite(Number(ride.downMinutes)) ? compactDuration(Number(ride.downMinutes)) : null;
    return {
      stale:false,
      wait:"Down",
      label:downtime ? `Down ${downtime}` : "Temporarily down",
      updated:`Updated ${relativeTime(ride.lastUpdated)}`
    };
  }
  return { stale:false, wait, label:ride.isOpen ? "Operating" : "Unavailable", updated:`Updated ${relativeTime(ride.lastUpdated)}` };
}
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast liquid-glass"; el.textContent = message; $("#toastRegion").append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 2600);
}
function renderStatusBanner() {
  const banner = $("#networkBanner");
  if (!banner) return;

  let tone = "";
  let message = "";
  let action = "";
  let actionLabel = "";

  if (pendingServiceWorker) {
    tone = "update";
    message = "A ParkPulse update is ready.";
    action = "update-app";
    actionLabel = "Update";
  } else if (!navigator.onLine) {
    tone = "offline";
    message = "You’re offline — showing the last data ParkPulse has.";
  } else if (rideData.error) {
    tone = "error";
    message = "Live data couldn’t refresh. The last good data is still here.";
    action = "retry-data";
    actionLabel = "Try again";
  }

  if (!message) {
    banner.className = "network-banner shell-width hidden";
    banner.innerHTML = "";
    return;
  }

  banner.className = `network-banner shell-width ${tone}`;
  banner.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button" data-banner-action="${action}">${escapeHtml(actionLabel)}</button>` : ""}`;

  const button = $("[data-banner-action]", banner);
  if (!button) return;
  if (action === "update-app") button.onclick = applyPendingUpdate;
  if (action === "retry-data") button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Trying…";
    await rideData.refresh();
    renderStatusBanner();
  };
}
function applyPendingUpdate() {
  if (!pendingServiceWorker) return;
  pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
}
async function checkForAppUpdate() {
  const registration = serviceWorkerRegistration;
  if (!registration || !navigator.onLine || pendingServiceWorker) return;

  try {
    const response = await fetch(`./version.json?check=${Date.now()}`, { cache: "no-store" });
    const remote = response.ok ? await response.json() : null;
    if (remote?.version && remote.version !== APP_VERSION) {
      await registration.update();
      if (registration.waiting) {
        pendingServiceWorker = registration.waiting;
        renderStatusBanner();
      }
    }
  } catch {}
}

function watchForServiceWorkerUpdate(registration) {
  serviceWorkerRegistration = registration;

  const markReady = (worker) => {
    if (!worker || !navigator.serviceWorker.controller) return;
    pendingServiceWorker = worker;
    renderStatusBanner();
  };

  if (registration.waiting) markReady(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") markReady(worker);
    });
  });

  checkForAppUpdate();
  setInterval(checkForAppUpdate, 5 * 60 * 1000);
}
function setTheme() {
  const state = store.snapshot;
  const root = document.documentElement;
  const nextTheme = state.theme;
  const nextAccent = state.accent || "blue";
  const visualColorChanged =
    root.dataset.theme !== nextTheme ||
    root.dataset.accent !== nextAccent;

  root.dataset.theme = nextTheme;
  root.dataset.accent = nextAccent;

  if (visualColorChanged) {
    root.classList.add("glass-color-snap");
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("glass-color-snap"));
  }

  applySeasonalTheme();
}
function selectView(name) {
  const target = views[name];
  if (!target) return;

  store.update((s) => { s.activeView = name; }, "view");

  // Only build the views once. Recreating backdrop-filter elements on every
  // tab change makes browsers briefly composite them against a stale backdrop.
  if (!target.childElementCount) render();

  const root = document.documentElement;
  const liquid = root.dataset.previewSurface === "liquid";
  if (liquid) root.classList.add("glass-color-snap");

  for (const [key, el] of Object.entries(views)) el.classList.toggle("active", key === name);
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.viewTarget === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (liquid) {
    void target.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("glass-color-snap"));
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
function sortedRides(rides, state) {
  const q = state.query.trim().toLowerCase();
  let list = rides.filter((r) =>
    (!q || `${r.name} ${r.land}`.toLowerCase().includes(q)) &&
    (!state.openOnly || (r.isOpen && !isRideStale(r))) &&
    (!state.favoritesOnly || state.favorites.includes(String(r.id)))
  );
  const staleRank = (ride) => isRideStale(ride) ? 1 : 0;
  if (state.sort === "wait") list.sort((a,b) => staleRank(a) - staleRank(b) || (a.isOpen === b.isOpen ? (a.waitTime ?? Infinity) - (b.waitTime ?? Infinity) : a.isOpen ? -1 : 1));
  else if (state.sort === "name") list.sort((a,b) => staleRank(a) - staleRank(b) || a.name.localeCompare(b.name));
  else list.sort((a,b) => {
    const freshness = staleRank(a) - staleRank(b);
    if (freshness) return freshness;

    const operating = Number(b.isOpen) - Number(a.isOpen);
    if (operating) return operating;

    const aRatio = rideComparison(a)?.ratio ?? Infinity;
    const bRatio = rideComparison(b)?.ratio ?? Infinity;
    if (aRatio !== bRatio) return aRatio - bRatio;

    return (a.waitTime ?? Infinity) - (b.waitTime ?? Infinity) || a.name.localeCompare(b.name);
  });
  return list;
}
function rideCard(ride, state = store.snapshot, index = 0) {
  const favorite = state.favorites.includes(String(ride.id));
  const rule = store.ruleForRide(ride.id);
  const status = rideStatus(ride);
  const valueBadge = typicalComparisonBadge(ride);
  const explanation = state.sort === "recommended" && index < 3 && ride.isOpen && !status.stale
    ? recommendationReason(ride, state)
    : "";
  return `<article class="ride-card liquid-glass ${rule ? "watching" : ""} ${status.stale ? "stale" : ""}" data-ride-id="${ride.id}">
    <button class="ride-main" type="button" data-open-ride="${ride.id}">
      <div class="ride-copy"><span class="ride-land">${escapeHtml(ride.land)}</span><h3>${escapeHtml(ride.name)}</h3><div class="ride-meta"><span class="updated">${escapeHtml(status.updated)}</span>${rule ? `<span class="watch-badge">Watching</span>` : ""}${valueBadge ? `<span class="value-badge ${valueBadge.tone}">${escapeHtml(valueBadge.text)}</span>` : ""}</div>${explanation ? `<div class="recommendation-hint"><span aria-hidden="true">✦</span>${escapeHtml(explanation)}</div>` : ""}</div>
      <div class="ride-status"><span class="wait ${status.stale ? "stale" : ride.isOpen ? "open" : "closed"}">${escapeHtml(status.wait)}</span><span class="status-label">${escapeHtml(status.label)}</span></div>
    </button>
    <div class="ride-actions">
      <button class="favorite-button ${favorite ? "active" : ""}" type="button" data-favorite="${ride.id}" aria-pressed="${favorite}" aria-label="${favorite ? "Unfavorite" : "Favorite"} ${escapeHtml(ride.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg></button>
      <button class="watch-button ${rule ? "active" : ""}" type="button" data-open-ride="${ride.id}" aria-label="${rule ? "Edit alert" : "Watch"} ${escapeHtml(ride.name)}">${iconBell(Boolean(rule))}</button>
    </div>
  </article>`;
}
function rideListMarkup(state = store.snapshot) {
  const rides = sortedRides(rideData.ridesForPark(state.selectedParkId), state);
  return rides.length
    ? rides.map((ride, index) => rideCard(ride, state, index)).join("")
    : `<div class="empty liquid-glass">${escapeHtml(rideData.error || "No rides match that search.")}</div>`;
}
function bindRideCards(root = views.explore) {
  root.querySelectorAll('[data-favorite]').forEach(button => {
    button.onclick = () => store.toggleFavorite(button.dataset.favorite);
  });
  root.querySelectorAll('[data-open-ride]').forEach((button) => {
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
  const parkSchedule = rideData.hoursForPark(state.selectedParkId);
  const parkHours = formatParkHours(parkSchedule);
  const ticketedEvents = formatTicketedEvents(parkSchedule);
  const crowd = rideData.crowdForPark(state.selectedParkId);
  views.explore.innerHTML = `
    <section class="hero-card liquid-glass">
      <div><span class="eyebrow">Walt Disney World</span><h2>Stop refreshing wait times.</h2><p>Pick a wait you’d actually take. ParkPulse will keep an eye on it and buzz you when it gets there.</p></div>
      <button class="hero-watch" type="button" data-view-jump="watching" aria-label="View ${activeCount} active ${activeCount === 1 ? "watch" : "watches"}"><strong>${activeCount}</strong><span>${activeCount === 1 ? "active watch" : "active watches"}</span></button>
    </section>
    ${firstRunVisible() ? `<section class="first-run-card liquid-glass" aria-label="ParkPulse quick start"><div class="first-run-mark" aria-hidden="true">✦</div><div class="first-run-copy"><span class="eyebrow">Quick start</span><h3>Best Now does the useful part for you.</h3><p>It compares each ride with what’s normal right now. Tap a ride to watch it, then let ParkPulse keep checking. That’s basically it.</p></div><button type="button" class="first-run-dismiss" data-dismiss-first-run>Got it</button></section>` : ""}
    <div class="park-strip" aria-label="Choose a park">
      ${PARKS.map((p) => `<button type="button" class="park-chip ${p.id === state.selectedParkId ? "active" : ""}" data-park="${p.id}" aria-pressed="${p.id === state.selectedParkId}"><span aria-hidden="true">${p.emoji}</span>${p.short}</button>`).join("")}
    </div>
    <section class="toolbar liquid-glass">
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="rideSearch" type="search" enterkeyhint="search" autocapitalize="none" autocomplete="off" spellcheck="false" aria-label="Search rides in ${escapeHtml(parkName(state.selectedParkId))}" placeholder="Search ${escapeHtml(parkName(state.selectedParkId))}" value="${escapeHtml(state.query)}"></label>
      <button class="filter-button ${state.openOnly ? "active" : ""}" type="button" data-toggle-open>Open only</button>
      <button class="filter-button ${state.favoritesOnly ? "active" : ""}" type="button" data-toggle-favorites aria-pressed="${state.favoritesOnly}">Favorites</button>
      <select id="sortSelect" aria-label="Sort rides"><option value="recommended" ${state.sort === "recommended" ? "selected" : ""}>Best now</option><option value="wait" ${state.sort === "wait" ? "selected" : ""}>Lowest wait</option><option value="name" ${state.sort === "name" ? "selected" : ""}>A–Z</option></select>
    </section>
    ${nextUpMarkup(state)}
    <div class="section-heading"><div class="park-heading-copy"><span class="eyebrow">Live waits</span><h2>${escapeHtml(parkName(state.selectedParkId))}</h2><span class="park-hours">${escapeHtml(parkHours)}</span><div class="park-events">${ticketedEvents.map((event) => `<span class="park-event"><b>✦ ${escapeHtml(event.name)}</b><span>${escapeHtml(event.hours)}</span></span>`).join("")}</div><div class="park-crowd-wrap">${crowdMarkup(crowd, parkSchedule)}</div></div><span class="refresh-copy">${rideData.refreshing ? "Refreshing…" : rideData.updatedAt ? `Updated ${relativeTime(rideData.updatedAt)}` : "Loading…"}</span></div>
    <div class="ride-list">${rideListMarkup(state)}</div>`;
}
function renderWatching() {
  const rules = store.snapshot.rules;
  views.watching.innerHTML = `
    <div class="page-heading"><span class="eyebrow">Your alerts</span><h2>Watching</h2><p>Your watches keep running after you close ParkPulse. No need to babysit the app.</p></div>
    ${!pushOn ? `<button class="notification-callout liquid-glass" type="button" data-enable-push><span>🔔</span><div><strong>Turn on notifications</strong><small>Your watches are saved, but notifications are off.</small></div><b>Enable</b></button>` : ""}
    <div class="watch-list">${rules.length ? rules.map((rule) => {
      const ride = rideData.rideById(rule.rideId);
      const detail = [rule.reopen ? "Reopening" : null, rule.threshold ? `≤ ${rule.threshold} min` : null].filter(Boolean).join(" · ");
      const status = rideStatus(ride);
      return `<article class="watch-card liquid-glass ${status.stale ? "stale" : ""}"><button class="watch-card-main" type="button" data-open-ride="${rule.rideId}"><span class="ride-land">${escapeHtml(parkName(rule.parkId))}</span><h3>${escapeHtml(rule.rideName)}</h3><p>${escapeHtml(detail || "Status watch")} · ${remaining(rule)}</p></button><div class="watch-live"><span class="wait ${status.stale ? "stale" : ride?.isOpen ? "open" : "closed"}">${escapeHtml(status.wait)}</span><button class="delete-watch" type="button" data-delete-watch="${rule.rideId}" aria-label="Stop watching ${escapeHtml(rule.rideName)}">×</button></div></article>`;
    }).join("") : `<div class="empty liquid-glass"><span class="empty-icon">🔔</span><h3>Nothing here yet</h3><p>Pick a ride, set a target, and ParkPulse will keep an eye on it.</p><button type="button" data-view-jump="explore">Find a ride</button></div>`}</div>`;
}
async function refreshBackendState() {
  const next = await backendHealth().catch(() => null);
  backendState = next || { ok: false };
  renderSettings();
  bindDynamic();
}

async function refreshAnalyticsState() {
  const next = await fetchAnalyticsStatus().catch(() => null);
  if (next) analyticsState = next;
  renderSettings();
  bindDynamic();
}

function renderSettings() {
  const state = store.snapshot;
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const platform = platformInfo();
  const install = installSetting();
  const iosNeedsInstall = platform.ios && !platform.standalone;
  const pushBlocked = permission === "denied";
  const pushCopy = pushOn
    ? (rulesSynced ? "Connected · watches synced" : "Watches pending sync — retrying automatically")
    : iosNeedsInstall
      ? "Add ParkPulse to your Home Screen and open it there first."
      : pushBlocked
        ? "Blocked in your browser or device settings."
        : "Not enabled";
  const pushAction = pushOn
    ? `<button type="button" data-toggle-push class="setting-action">Disable</button>`
    : iosNeedsInstall
      ? `<button type="button" data-install class="setting-action">Install first</button>`
      : pushBlocked
        ? `<span class="health-pill bad">Blocked</span>`
        : `<button type="button" data-toggle-push class="setting-action">Enable</button>`;
  const installRow = install.visible
    ? `<div class="setting-row install-status-row"><div><strong>Install ParkPulse</strong><small>${escapeHtml(install.copy)}</small></div>${install.installed ? `<span class="health-pill good">Installed</span>` : `<button type="button" data-install class="setting-action">${escapeHtml(install.action)}</button>`}</div>`
    : "";
  const backendCopy = backendState?.ok === true ? `Online · Worker ${backendState.version || ""}`.trim() : backendState?.ok === false ? "Unavailable" : "Checking…";
  const refreshCopy = rideData.updatedAt ? relativeTime(rideData.updatedAt) : "Not yet";
  const notificationEngine = backendState?.notificationEngine || null;
  const alertEngineCopy = !backendState?.ok
    ? "Waiting for the Worker"
    : !notificationEngine
      ? "Deploy the latest Worker to check scheduled alerts"
      : notificationEngine.status === "running"
        ? `Checked ${relativeTime(notificationEngine.lastCheck)} · every ${notificationEngine.cadenceMinutes || 5} min`
        : notificationEngine.status === "waiting"
          ? "Waiting for the first scheduled check"
          : notificationEngine.status === "stale"
            ? `Last checked ${relativeTime(notificationEngine.lastCheck)} · scheduler may be stuck`
            : notificationEngine.reason === "d1-read-limit"
              ? "D1 read limit reached — ride alerts are paused until Cloudflare resets usage or the plan is upgraded."
              : "D1 is unavailable — ride alerts may be paused.";
  const alertEngineLabel = !notificationEngine
    ? "Worker update"
    : notificationEngine.status === "running"
      ? "Running"
      : notificationEngine.status === "waiting"
        ? "Starting"
        : "Needs attention";
  const alertEngineTone = notificationEngine?.status === "running" ? "good" : notificationEngine ? "bad" : "";
  const historyDiagnosticsAvailable = analyticsState?.ok === true && typeof analyticsState.historyCollecting === "boolean";
  const historyCopy = historyDiagnosticsAvailable
    ? analyticsState.historyCollecting
      ? "Five-minute ride samples are coming in normally."
      : analyticsState.latestHistorySample
        ? `Last sample ${relativeTime(analyticsState.latestHistorySample)} — this may need attention.`
        : "Waiting for the first history sample."
    : backendState?.ok === true
      ? "Couldn’t check history right now — retrying automatically."
      : backendState?.ok === false
        ? "Worker unavailable — history status can’t be checked."
        : "Checking history collection…";
  const historyLabel = historyDiagnosticsAvailable
    ? analyticsState.historyCollecting ? "Collecting" : "Not current"
    : backendState?.ok === true ? "Retrying" : backendState?.ok === false ? "Unavailable" : "Checking";
  const historyTone = historyDiagnosticsAvailable
    ? analyticsState.historyCollecting ? "good" : "bad"
    : backendState?.ok === false ? "bad" : "";
  views.settings.innerHTML = `
    <div class="page-heading"><span class="eyebrow">ParkPulse</span><h2>Settings</h2><p>The useful stuff, plus a few ways to make ParkPulse yours.</p></div>
    <section class="settings-group liquid-glass">
      <div class="setting-row"><div><strong>Push notifications</strong><small>${escapeHtml(pushCopy)}</small></div>${pushAction}</div>
      ${pushOn ? `<div class="setting-row"><div><strong>Test notification</strong><small>Make sure push is actually working on this device.</small></div><button type="button" data-test-push class="setting-action">Send test</button></div>` : ""}
      ${installRow}
    </section>
    <div class="settings-section-title">Customization</div>
    <section class="settings-group liquid-glass">
      <label class="setting-row"><div><strong>Appearance</strong><small>Follow your system, or pick light or dark yourself.</small></div><select id="themeSelect"><option value="system" ${state.theme === "system" ? "selected" : ""}>System</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option></select></label>
      <div class="setting-row accent-setting"><div><strong>Accent color</strong><small>Changes the highlights and glow. Purely vibes.</small></div><div class="accent-picker" role="group" aria-label="Accent color">${ACCENTS.map((accent) => `<button type="button" class="accent-swatch accent-${accent.id} ${state.accent === accent.id ? "active" : ""}" data-accent-choice="${accent.id}" aria-label="${accent.label}" aria-pressed="${state.accent === accent.id}"><span></span></button>`).join("")}</div></div>
      <div class="setting-row glass-style-setting"><div><strong>Glass style</strong><small>Choose a softer frosted look or the clearer refractive Liquid Glass effect.</small></div><div class="glass-style-picker" role="group" aria-label="Glass style"><button type="button" data-glass-style="frosted" aria-pressed="${glassStyleSetting() === "frosted"}" class="${glassStyleSetting() === "frosted" ? "active" : ""}">Frosted</button><button type="button" data-glass-style="liquid" aria-pressed="${glassStyleSetting() === "liquid"}" class="${glassStyleSetting() === "liquid" ? "active" : ""}">Liquid</button></div></div>
      <label class="setting-row seasonal-effects-setting"><div><strong>Seasonal effects</strong><small>Automatically adds subtle holiday ambience when the season rolls around.</small></div><span class="setting-switch"><input id="seasonalEffectsToggle" type="checkbox" ${seasonalEffectsEnabled() ? "checked" : ""} aria-label="Seasonal effects"><span class="switch"></span></span></label>
    </section>
    <div class="settings-section-title">Status & diagnostics</div>
    <section class="settings-group liquid-glass status-diagnostics">
      <div class="setting-row"><div><strong>Worker</strong><small>Backend + notification status</small></div><span class="health-pill ${backendState?.ok === true ? "good" : backendState?.ok === false ? "bad" : ""}">${escapeHtml(backendCopy)}</span></div>
      <div class="setting-row"><div><strong>Ride data</strong><small>Last time ParkPulse got fresh ride data</small></div><span class="setting-value">${escapeHtml(refreshCopy)}</span></div>
      <div class="setting-row"><div><strong>Data source</strong><small>Powered by <a class="data-source-link" href="https://themeparks.wiki/" target="_blank" rel="noopener noreferrer">ThemeParks.wiki</a> and <a class="data-source-link" href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Queue-Times.com</a></small></div><span class="setting-value">${escapeHtml(rideData.sourceSummary || "Waiting…")}</span></div>
      <div class="setting-row"><div><strong>ThemeParks API key</strong><small>Used by the Worker — never stored in the app.</small></div><span class="health-pill ${backendState?.themeParksApiKeyConfigured ? "good" : ""}">${backendState?.themeParksApiKeyConfigured ? "Connected" : "Anonymous"}</span></div>
      <div class="setting-row"><div><strong>Push server</strong><small>Background notification setup</small></div><span class="health-pill ${backendState?.vapidConfigured ? "good" : "bad"}">${backendState?.vapidConfigured ? "Ready" : "Needs setup"}</span></div>
      <div class="setting-row"><div><strong>Ride alert engine</strong><small>${escapeHtml(alertEngineCopy)}</small></div><span class="health-pill ${alertEngineTone}">${escapeHtml(alertEngineLabel)}</span></div>
      <div class="setting-row"><div><strong>History collection</strong><small>${escapeHtml(historyCopy)}</small></div><span class="health-pill ${historyTone}">${escapeHtml(historyLabel)}</span></div>
      <div class="setting-row"><div><strong>Trend baselines</strong><small>${analyticsState?.themeParksApiKeyConfigured === false ? "Historical backfill is paused because the ThemeParks API key is missing." : "History used for Best Now + crowd estimates"}</small></div><span class="setting-value">${analyticsState?.ok ? `${analyticsState.baselineRides}/${analyticsState.totalRides} rides` : backendState?.ok === true ? "Retrying…" : backendState?.ok === false ? "Unavailable" : "Checking…"}</span></div>
      <div class="setting-row"><div><strong>App version</strong><small>What you’re currently running</small></div><span class="setting-value">v${APP_VERSION}</span></div>
      <div class="setting-row"><div><strong>Diagnostics</strong><small>Copies basic status. No secrets or push keys.</small></div><button type="button" data-copy-diagnostics class="setting-action">Copy</button></div>
    </section>
    <section class="settings-group liquid-glass"><div class="about-row"><strong>Data</strong><p>ThemeParks.wiki is the main live feed. Queue-Times only steps in when a ride is missing. If the data is stale, ParkPulse says so instead of pretending it’s live.</p><a href="https://www.themeparks.wiki/" target="_blank" rel="noopener noreferrer">ThemeParks.wiki ↗</a> · <a href="https://queue-times.com/" target="_blank" rel="noopener noreferrer">Queue-Times ↗</a></div></section>
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
function renderParkHours() {
  const parkId = store.snapshot.selectedParkId;
  const schedule = rideData.hoursForPark(parkId);
  const hoursEl = $(".park-hours", views.explore);
  if (hoursEl) hoursEl.textContent = formatParkHours(schedule);

  const eventsEl = $(".park-events", views.explore);
  if (eventsEl) {
    const events = formatTicketedEvents(schedule);
    eventsEl.innerHTML = events.map((event) =>
      `<span class="park-event"><b>✦ ${escapeHtml(event.name)}</b><span>${escapeHtml(event.hours)}</span></span>`
    ).join("");
  }

  const crowdEl = $(".park-crowd-wrap", views.explore);
  if (crowdEl) crowdEl.innerHTML = crowdMarkup(rideData.crowdForPark(parkId), schedule);
}
function renderRideDataUpdate() {
  if (document.activeElement?.id !== "rideSearch") return render();
  renderRideResults();
  renderRefreshCopy();
  renderParkHours();
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
  document.querySelectorAll('[data-park]').forEach((b) => b.onclick = () => { nextUpOffset = 0; store.update((s) => { s.selectedParkId = Number(b.dataset.park); s.query = ""; }, "park"); if (!rideData.ridesForPark(Number(b.dataset.park)).length) rideData.refresh({ parkId: Number(b.dataset.park) }); });
  document.querySelectorAll('[data-next-up-another]').forEach((b) => b.onclick = cycleNextUp);
  bindRideCards(views.explore);
  document.querySelectorAll('[data-dismiss-first-run]').forEach((b) => b.onclick = dismissFirstRun);
  $$('[data-view-jump]').forEach((b) => b.onclick = () => selectView(b.dataset.viewJump));
  $$('[data-toggle-favorites]').forEach(b => b.onclick = () => store.update(s => { s.favoritesOnly = !s.favoritesOnly; }, 'filter'));
  $$('[data-toggle-open]').forEach((b) => b.onclick = () => store.update((s) => { s.openOnly = !s.openOnly; }, "filter"));
  const search = $("#rideSearch"); if (search) search.oninput = () => store.update((s) => { s.query = search.value; }, "search");
  const sort = $("#sortSelect"); if (sort) sort.onchange = () => store.update((s) => { s.sort = sort.value; }, "sort");
  $$('[data-delete-watch]').forEach((b) => b.onclick = async () => { store.removeRule(b.dataset.deleteWatch); if (await safeSync()) toast("Watch removed"); });
  $$('[data-enable-push]').forEach((b) => b.onclick = activatePush);
  $$('[data-toggle-push]').forEach((b) => b.onclick = pushOn ? deactivatePush : activatePush);
  $$('[data-install]').forEach((b) => b.onclick = installApp);
  $$('[data-test-push]').forEach((b) => b.onclick = testNotification);
  $$('[data-copy-diagnostics]').forEach((b) => b.onclick = copyDiagnostics);
  const theme = $("#themeSelect"); if (theme) theme.onchange = () => store.update((s) => { s.theme = theme.value; }, "theme");
  document.querySelectorAll("button[data-accent-choice]").forEach((button) => {
    button.onclick = () => store.update((s) => { s.accent = button.dataset.accentChoice; }, "accent");
  });
  document.querySelectorAll("[data-glass-style]").forEach((button) => {
    button.onclick = () => {
      const style = button.dataset.glassStyle === "liquid" ? "liquid" : "frosted";
      setGlassStyleSetting(style);
      applySeasonalTheme();
      document.querySelectorAll("[data-glass-style]").forEach((item) => {
        const active = item.dataset.glassStyle === style;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    };
  });
  const seasonalEffects = $("#seasonalEffectsToggle");
  if (seasonalEffects) seasonalEffects.onchange = () => {
    setSeasonalEffectsEnabled(seasonalEffects.checked);
    applySeasonalTheme();
  };
}
async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}
async function shareRide(id) {
  const ride = rideData.rideById(id) || store.ruleForRide(id);
  if (!ride) return;

  const name = ride.name || ride.rideName || "this ride";
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("ride", String(id));
  const payload = {
    title: `${name} · ParkPulse`,
    text: `Check ${name} on ParkPulse.`,
    url: url.href
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await copyText(url.href);
    toast("Ride link copied");
  } catch {
    toast("Couldn’t share this ride.");
  }
}
function focusableInSheet() {
  return $$('button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', sheet)
    .filter((el) => !el.classList.contains("hidden") && el.offsetParent !== null);
}
function handleDialogKeydown(event) {
  if (event.key === "Escape" && installHelpSheet && !installHelpSheet.classList.contains("hidden")) {
    event.preventDefault();
    closeInstallHelp();
    return;
  }
  if (sheet.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = focusableInSheet();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openRide(id) {
  const ride = rideData.rideById(id);
  const existing = store.ruleForRide(id);
  if (!ride && !existing) return;
  const model = ride || existing;
  sheet.dataset.rideId = String(id);
  sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-head"><div><span class="ride-land">${escapeHtml(model.land || parkName(model.parkId))}</span><h2 id="sheetTitle">${escapeHtml(model.name || model.rideName)}</h2></div><div class="sheet-actions"><button class="sheet-action" type="button" data-share-ride="${id}" aria-label="Share ${escapeHtml(model.name || model.rideName)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button><button class="sheet-close" type="button" data-close-sheet aria-label="Close">×</button></div></div>
    <div class="sheet-status"><span class="wait ${rideStatus(ride).stale ? "stale" : ride?.isOpen ? "open" : "closed"}">${escapeHtml(rideStatus(ride).wait)}</span><small>${escapeHtml(rideStatus(ride).label)}</small></div>
    ${ride ? `<div class="sheet-recommendation"><span>ParkPulse context</span><strong>${escapeHtml(recommendationReason(ride, store.snapshot))}</strong></div>` : ""}
    <div id="rideInsights" class="ride-insights"><span class="insight-loading">Checking the trend data…</span></div>
    <section class="ride-history"><div class="history-heading"><h3>Wait history</h3><select id="historyRange" aria-label="History range"><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option></select></div><div id="rideHistory" aria-live="polite"></div></section>
    <label class="toggle-row"><div><strong>Must-do ride</strong><small>Prioritize it in Next Up. This doesn’t create an alert.</small></div><input id="mustDoToggle" type="checkbox" ${store.snapshot.mustDo.includes(String(id)) ? "checked" : ""}><span class="switch"></span></label>
    <form id="watchForm">
      <label class="toggle-row"><div><strong>Notify when it reopens</strong><small>Useful when a ride goes down.</small></div><input id="reopenToggle" type="checkbox" ${existing?.reopen !== false ? "checked" : ""}><span class="switch"></span></label>
      <div class="threshold-block"><div class="threshold-head"><div><strong>Wait-time target</strong><small>Buzz me when the wait drops to this or better:</small></div><button id="thresholdToggle" class="mini-toggle ${existing?.threshold ? "active" : ""}" type="button">${existing?.threshold ? "On" : "Off"}</button></div><div id="thresholdControls" class="threshold-controls ${existing?.threshold ? "" : "disabled"}"><button type="button" data-step="-5">−</button><output id="thresholdValue">${existing?.threshold || 30}</output><span>min</span><button type="button" data-step="5">+</button></div></div>
      <label class="duration-row"><span><strong>Watch for</strong><small>Pick how long ParkPulse should keep checking.</small></span><select id="durationSelect">${existing ? `<option value="keep" selected>Keep current expiration</option>` : ""}<option value="today">Today</option><option value="3h">3 hours</option><option value="forever" >Until disabled</option></select></label>
      <button class="primary-button" type="submit">${existing ? "Save watch" : "Start watching"}</button>
      ${existing ? `<button class="danger-text" type="button" data-remove-current>Stop watching this ride</button>` : ""}
    </form>`;
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  $('[data-share-ride]', sheet)?.addEventListener("click", () => shareRide(id));
  requestAnimationFrame(() => $('[data-close-sheet]', sheet)?.focus({ preventScroll: true }));
  loadRideInsights(id);
  loadRideHistory(id);
  $('#historyRange', sheet).onchange = event => loadRideHistory(id, event.target.value);
  $('#mustDoToggle', sheet).onchange = event => store.setMustDo(id, event.target.checked);
  let thresholdEnabled = Boolean(existing?.threshold), threshold = Number(existing?.threshold || 30);
  const refreshThreshold = () => { $("#thresholdValue").textContent = threshold; $("#thresholdControls").classList.toggle("disabled", !thresholdEnabled); $("#thresholdToggle").classList.toggle("active", thresholdEnabled); $("#thresholdToggle").textContent = thresholdEnabled ? "On" : "Off"; };
  $("#thresholdToggle").onclick = () => { thresholdEnabled = !thresholdEnabled; refreshThreshold(); };
  $$('[data-step]', sheet).forEach((b) => b.onclick = () => { threshold = Math.max(5, Math.min(180, threshold + Number(b.dataset.step))); refreshThreshold(); });
  $('[data-close-sheet]').onclick = closeSheet; backdrop.onclick = closeSheet;
  $('[data-remove-current]', sheet)?.addEventListener("click", async () => { store.removeRule(id); const synced = await safeSync(); closeSheet(); if (synced) toast("Watch removed"); });
  $("#watchForm").onsubmit = async (event) => {
    event.preventDefault();
    const reopen = $("#reopenToggle").checked;
    const waitTarget = thresholdEnabled ? threshold : null;
    if (!reopen && !waitTarget) return toast("Choose at least one alert.");
    const duration = $("#durationSelect").value;
    store.saveRule({ rideId: id, parkId: model.parkId, rideName: model.name || model.rideName, land: model.land || "", reopen, threshold: waitTarget, expiresAt: duration === "keep" ? existing.expiresAt : durationExpiry(duration), createdAt: existing?.createdAt || Date.now() });
    if (!pushOn) toast("Watch saved — turn on notifications if you want it to buzz you.");
    else { if (await safeSync()) toast("Watch saved"); }
    closeSheet();
  };
}
async function loadRideInsights(id) {
  const host = $("#rideInsights");
  const data = await fetchRideInsights(id);
  if (!host?.isConnected || sheet.dataset.rideId !== String(id) || sheet.classList.contains("hidden")) return;

  if (!data?.available) {
    host.innerHTML = '<span class="insight-loading">Still building enough history for this ride. Give it a little time.</span>';
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
    ? `30-day ThemeParks history · ${data.samples?.baselineDays || 0} days with data`
    : "ParkPulse is still building the historical baseline.";

  host.innerHTML = `
    <div class="insight-head"><span>ParkPulse trend</span>${data.comparison?.label ? `<b>${escapeHtml(data.comparison.label)}</b>` : ""}</div>
    ${stats.length ? `<div class="insight-grid">${stats.join("")}</div>` : ""}
    <small>${escapeHtml(sourceCopy)} Today’s range comes from ParkPulse’s live samples.</small>
  `;
}

let historyRequest = 0;
async function loadRideHistory(id, range = "today") {
  const request = ++historyRequest;
  const host = $("#rideHistory");
  host.textContent = "Loading shared history…";
  const data = await fetchRideHistory(id, range);
  if (request !== historyRequest || !host.isConnected || sheet.dataset.rideId !== String(id)) return;
  if (!data) { host.textContent = "History couldn’t load. Try another range or reopen this ride."; return; }
  const points = data.points || [];
  const open = points.filter(p => p.isOpen && Number.isFinite(p.waitTime));
  if (!open.length) { host.textContent = "No posted waits collected in this range yet."; return; }

  const waits = open.map(p => Number(p.waitTime));
  const low = Math.min(...waits);
  const high = Math.max(...waits);
  const average = Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length);
  const axisMax = Math.max(15, Math.ceil(high / 15) * 15);
  const start = Date.parse(data.startAt), end = Date.parse(data.endAt);
  const plot = { left: 46, right: 590, top: 10, bottom: 130 };
  const x = p => plot.left + (Date.parse(p.observedAt) - start) / Math.max(1, end - start) * (plot.right - plot.left);
  const yValue = value => plot.bottom - value / axisMax * (plot.bottom - plot.top);
  const y = p => yValue(p.waitTime);

  const ordered = [...points].sort((p1, p2) => Date.parse(p1.observedAt) - Date.parse(p2.observedAt));
  const gapLimitMs = Math.max(10, Number(data.bucketMinutes || 5) * 1.75) * 60_000;
  const segments = [];
  let segment = [];
  let previousOpen = null;
  const flushSegment = () => {
    if (segment.length >= 2) segments.push(segment);
    segment = [];
    previousOpen = null;
  };
  for (const point of ordered) {
    const validOpen = point.isOpen && Number.isFinite(point.waitTime);
    if (!validOpen) {
      flushSegment();
      continue;
    }
    if (previousOpen && Date.parse(point.observedAt) - Date.parse(previousOpen.observedAt) > gapLimitMs) flushSegment();
    segment.push(point);
    previousOpen = point;
  }
  flushSegment();

  const lines = segments.map(group =>
    `<polyline class="history-line" points="${group.map(p => `${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(" ")}"/>`
  ).join("");
  const dots = open.map(p => `<circle cx="${x(p).toFixed(2)}" cy="${y(p).toFixed(2)}" r="2.25"/>`).join("");

  const yTicks = [0, axisMax / 3, axisMax * 2 / 3, axisMax];
  const grid = yTicks.map(value => {
    const py = yValue(value).toFixed(2);
    return `<g class="history-grid"><line x1="${plot.left}" y1="${py}" x2="${plot.right}" y2="${py}"/><text x="${plot.left - 7}" y="${(Number(py) + 3).toFixed(2)}" text-anchor="end">${Math.round(value)}m</text></g>`;
  }).join("");
  const avgY = yValue(average).toFixed(2);
  const averageLine = `<line class="history-average-line" x1="${plot.left}" y1="${avgY}" x2="${plot.right}" y2="${avgY}"/><text class="history-average-label" x="${plot.right - 4}" y="${Math.max(plot.top + 9, Number(avgY) - 5).toFixed(2)}" text-anchor="end">avg ${average}m</text>`;

  const timeFormat = value => new Date(value).toLocaleString([], { timeZone: data.timezone, hour: "numeric" });
  const dateFormat = value => new Date(value).toLocaleString([], { timeZone: data.timezone, month: "short", day: "numeric" });
  const xTickCount = range === "today" ? 4 : 5;
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const ratio = xTickCount === 1 ? 0 : index / (xTickCount - 1);
    const timestamp = start + (end - start) * ratio;
    const px = plot.left + (plot.right - plot.left) * ratio;
    const label = range === "today" ? timeFormat(timestamp) : dateFormat(timestamp);
    return `<text class="history-x-label" x="${px.toFixed(2)}" y="144" text-anchor="${index === 0 ? "start" : index === xTickCount - 1 ? "end" : "middle"}">${escapeHtml(label)}</text>`;
  }).join("");

  host.innerHTML = `
    <div class="history-chart-wrap">
      <svg class="history-chart" viewBox="0 0 600 150" role="img" aria-label="Wait history from ${low} to ${high} minutes, averaging ${average} minutes. Continuous samples are connected; closures and missing stretches remain gaps.">
        ${grid}${averageLine}${lines}${dots}${xTicks}
      </svg>
    </div>
    <div class="history-stats" aria-label="Wait history summary">
      <div><span>↓ Low</span><strong>${low}m</strong></div>
      <div><span>− Average</span><strong>${average}m</strong></div>
      <div><span>↑ High</span><strong>${high}m</strong></div>
    </div>
    <small class="history-note">${data.bucketMinutes}-minute posted waits. Gaps mean the ride was closed or data wasn’t available.</small>`;
}

function closeSheet() {
  if (sheet.classList.contains("hidden")) return;
  sheet.classList.add("hidden");
  sheet.setAttribute("aria-hidden", "true");
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("sheet-open");
  const returnTo = sheetReturnFocus;
  sheetReturnFocus = null;
  if (returnTo?.isConnected) requestAnimationFrame(() => returnTo.focus({ preventScroll: true }));
}
const SHEET_DISMISS_TRIGGER = 96;
let sheetGesture = null;

function setupSheetDismissGesture() {
  sheet.addEventListener("touchstart", (event) => {
    if (sheet.classList.contains("hidden") || event.touches.length !== 1 || sheet.scrollTop > 1) {
      sheetGesture = null;
      return;
    }
    const touch = event.touches[0];
    sheetGesture = { x: touch.clientX, y: touch.clientY, dy: 0, dragging: false };
  }, { passive: true });

  sheet.addEventListener("touchmove", (event) => {
    if (!sheetGesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - sheetGesture.x;
    const dy = touch.clientY - sheetGesture.y;

    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.8 || sheet.scrollTop > 1) {
      if (!sheetGesture.dragging) sheetGesture = null;
      return;
    }
    if (dy < 8) return;

    sheetGesture.dy = dy;
    sheetGesture.dragging = true;
    event.preventDefault();
    sheet.classList.add("sheet-dragging");
    sheet.style.setProperty("--sheet-drag-y", `${Math.min(180, dy * 0.72)}px`);
    backdrop.style.opacity = String(Math.max(0.18, 1 - dy / 320));
  }, { passive: false });

  const finish = () => {
    if (!sheetGesture) return;
    const dismiss = sheetGesture.dragging && sheetGesture.dy >= SHEET_DISMISS_TRIGGER;
    sheetGesture = null;
    sheet.classList.remove("sheet-dragging");
    if (dismiss) {
      sheet.classList.add("sheet-dismissing");
      sheet.style.setProperty("--sheet-drag-y", "100vh");
      backdrop.style.opacity = "0";
      window.setTimeout(() => {
        closeSheet();
        sheet.classList.remove("sheet-dismissing");
        sheet.style.removeProperty("--sheet-drag-y");
        backdrop.style.removeProperty("opacity");
      }, 180);
    } else {
      sheet.style.removeProperty("--sheet-drag-y");
      backdrop.style.removeProperty("opacity");
    }
  };

  sheet.addEventListener("touchend", finish, { passive: true });
  sheet.addEventListener("touchcancel", finish, { passive: true });
}

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
function safeSync(options = {}) {
  rulesSynced = false;
  // Serialize full replacements so older saves cannot overwrite newer rules.
  const task = syncQueue.then(() => performSync(options));
  syncQueue = task.catch(() => false);
  return task;
}
async function performSync({ quiet = false } = {}) {
  try {
    const sent = JSON.stringify(store.snapshot.rules);
    const result = await syncRules(JSON.parse(sent));
    rulesSynced = result?.synced === true && sent === JSON.stringify(store.snapshot.rules);
    if (result?.synced === false && result.reason === "subscription") {
      pushOn = false;
      renderWatching();
      renderSettings();
      bindDynamic();
      if (!quiet) toast("Notifications need to be turned on again.");
      return false;
    }
    renderSettings();
    bindDynamic();
    return rulesSynced;
  } catch {
    rulesSynced = false;
    renderSettings();
    bindDynamic();
    if (!quiet) toast("Saved on this device. Notification changes are pending sync.");
    return false;
  }
}
async function refreshPushState({ sync = false } = {}) {
  let next;
  try { next = Boolean(await currentSubscription()); }
  catch {
    rulesSynced = false;
    renderSettings(); bindDynamic();
    return;
  }
  const changed = next !== pushOn;
  pushOn = next;

  if (sync && pushOn) await safeSync({ quiet: true });

  if (changed) {
    renderWatching();
    renderSettings();
    bindDynamic();
  }
}
async function activatePush() {
  const platform = platformInfo();
  if (platform.ios && !platform.standalone) {
    return toast("On iPhone/iPad, add ParkPulse to your Home Screen, open it there, then turn notifications on.");
  }
  if ("Notification" in window && Notification.permission === "denied") {
    return toast(platform.ios
      ? "Notifications are blocked. Allow ParkPulse in iOS Settings → Notifications, then try again."
      : "Notifications are blocked in your browser or device settings.");
  }
  try {
    await enablePush();
    pushOn = true;
    const synced = await safeSync();
    render();
    if (synced) toast("Notifications are on — watches synced");
  } catch (error) {
    toast(error.message || "Couldn't enable notifications.");
  }
}
async function deactivatePush() {
  try { await disablePush(); pushOn = false; rulesSynced = false; render(); toast("Notifications disabled"); }
  catch { toast("Couldn’t disable notifications. Try again."); }
}
async function testNotification() {
  try { await sendTestPush(); toast("Test sent — you should get it in a second."); }
  catch (error) { toast(error.message || "Couldn't send test notification."); }
}
async function copyDiagnostics() {
  const lines = [
    `ParkPulse v${APP_VERSION}`,
    `Worker: ${backendState?.ok === true ? "online" : backendState?.ok === false ? "unavailable" : "unknown"}`,
    `Push: ${pushOn ? "subscribed" : "not connected"}`,
    `Watch sync: ${rulesSynced ? "synced" : "pending / unavailable"}`,
    `Notification permission: ${"Notification" in window ? Notification.permission : "unsupported"}`,
    `Platform: ${platformInfo().android ? "Android" : platformInfo().ios ? "iOS" : "browser"}${platformInfo().standalone ? " standalone" : ""}`,
    `Last app refresh: ${rideData.updatedAt || "none"}`,
    `Active watches: ${store.snapshot.rules.length}`,
    `Ride sources: ${rideData.sourceSummary || "none"}`,
    `ThemeParks API key: ${backendState?.themeParksApiKeyConfigured ? "configured" : "anonymous"}`,
    `VAPID push server: ${backendState?.vapidConfigured ? "configured" : "missing"}`,
    `Ride alert engine: ${backendState?.notificationEngine?.status || "unknown"}`,
    `Ride alert last check: ${backendState?.notificationEngine?.lastCheck || "none"}`,
    `History collection: ${analyticsState?.historyCollecting ? "collecting" : analyticsState?.historyStatus || "unknown"}`,
    `Latest history checkpoint rides: ${analyticsState?.ok ? analyticsState.historyRides : "unknown"}`,
    `History diagnostics mode: ${analyticsState?.diagnosticsMode || "unknown"}`,
    `Latest history sample: ${analyticsState?.latestHistorySample || "none"}`,
    `Trend baselines: ${analyticsState?.ok ? `${analyticsState.baselineRides}/${analyticsState.totalRides}` : "unknown"}`,
    `Accent: ${store.snapshot.accent || "blue"}`
  ];
  try { await navigator.clipboard.writeText(lines.join("\n")); toast("Diagnostics copied"); }
  catch { toast(lines.join(" · ")); }
}
function closeInstallHelp() {
  if (!installHelpSheet || installHelpSheet.classList.contains("hidden")) return;
  installHelpSheet.classList.add("hidden");
  installHelpSheet.setAttribute("aria-hidden", "true");
  installHelpBackdrop?.classList.add("hidden");
  installHelpBackdrop?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("install-help-open");
  const returnTo = installHelpReturnFocus;
  installHelpReturnFocus = null;
  if (returnTo?.isConnected) requestAnimationFrame(() => returnTo.focus({ preventScroll: true }));
}
function openInstallHelp() {
  if (!installHelpSheet || !installHelpBackdrop) {
    return toast("On iPhone/iPad: Share → Add to Home Screen, then open ParkPulse from there.");
  }

  installHelpReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  installHelpSheet.innerHTML = `
    <div class="install-help-handle" aria-hidden="true"></div>
    <div class="install-help-head">
      <div>
        <span class="eyebrow">Add to Home Screen</span>
        <h2 id="installHelpTitle">Add ParkPulse</h2>
      </div>
      <button type="button" class="install-help-close" data-close-install-help aria-label="Close">×</button>
    </div>
    <p class="install-help-lede">iPhone and iPad need one quick manual step. After this, ParkPulse opens like an app and can use push notifications.</p>
    <div class="install-help-steps">
      <div class="install-help-step">
        <span class="install-help-number">1</span>
        <span class="install-help-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>
        </span>
        <div><strong>Tap Share in Safari</strong><small>Use the Share button in Safari’s toolbar.</small></div>
      </div>
      <div class="install-help-step">
        <span class="install-help-number">2</span>
        <span class="install-help-icon install-help-plus" aria-hidden="true">＋</span>
        <div><strong>Choose Add to Home Screen</strong><small>Then open ParkPulse from the new Home Screen icon.</small></div>
      </div>
    </div>
    <button type="button" class="primary-button install-help-done" data-close-install-help>Got it</button>
  `;

  installHelpSheet.classList.remove("hidden");
  installHelpSheet.setAttribute("aria-hidden", "false");
  installHelpBackdrop.classList.remove("hidden");
  installHelpBackdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("install-help-open");

  $$("[data-close-install-help]", installHelpSheet).forEach((button) => button.onclick = closeInstallHelp);
  installHelpBackdrop.onclick = closeInstallHelp;
  requestAnimationFrame(() => $("[data-close-install-help]", installHelpSheet)?.focus({ preventScroll: true }));
}

async function installApp() {
  const platform = platformInfo();
  if (platform.standalone) return toast("ParkPulse is already installed.");

  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderSettings();
    bindDynamic();
    return;
  }

  if (platform.ios) return openInstallHelp();
  if (platform.android) return toast("On Android: browser menu → Install app / Add to Home screen.");
  toast("Use your browser menu → Install ParkPulse.");
}

let liquidGlassMotionFrame = 0;
const liquidGlassMotionMedia = window.matchMedia?.("(prefers-reduced-motion: reduce)");

function updateLiquidGlassMotion() {
  liquidGlassMotionFrame = 0;
  const root = document.documentElement;
  if (liquidGlassMotionMedia?.matches) {
    root.style.setProperty("--glass-scroll-x", "0px");
    root.style.setProperty("--glass-scroll-y", "0px");
    return;
  }

  const scrollY = window.scrollY || 0;
  root.style.setProperty("--glass-scroll-x", `${(Math.sin(scrollY / 260) * 7).toFixed(2)}px`);
  root.style.setProperty("--glass-scroll-y", `${(Math.cos(scrollY / 340) * 2.5).toFixed(2)}px`);
}

function queueLiquidGlassMotion() {
  if (liquidGlassMotionFrame) return;
  liquidGlassMotionFrame = requestAnimationFrame(updateLiquidGlassMotion);
}

function setupLiquidGlassMotion() {
  updateLiquidGlassMotion();
  window.addEventListener("scroll", queueLiquidGlassMotion, { passive: true });
  liquidGlassMotionMedia?.addEventListener?.("change", queueLiquidGlassMotion);
}

async function init() {
  setTheme();
  setupLiquidGlassMotion();
  setupPullToRefresh();
setupSheetDismissGesture();
  if ("serviceWorker" in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register("./service-worker.js")
      .then(watchForServiceWorkerUpdate).catch(() => {});
  }
  Promise.allSettled([backendHealth(), fetchAnalyticsStatus()]).then(([health, analytics]) => {
    backendState = health.status === "fulfilled" ? health.value : { ok: false };
    analyticsState = analytics.status === "fulfilled" ? analytics.value : null;
    renderSettings(); bindDynamic();
  });
  refreshPushState({ sync: true });
  $$('[data-view-target]').forEach((button) => button.onclick = () => selectView(button.dataset.viewTarget));
  $("#refreshButton").onclick = () => rideData.refresh();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    renderSettings();
    bindDynamic();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    renderSettings();
    bindDynamic();
    toast("ParkPulse installed");
  });
  window.addEventListener("online", async () => {
    renderStatusBanner();
    await rideData.refresh({ parkId: store.snapshot.selectedParkId });
    await refreshPushState({ sync: true });
    await Promise.all([refreshBackendState(), refreshAnalyticsState()]);
    renderStatusBanner();
  });
  window.addEventListener("offline", renderStatusBanner);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshPushState({ sync: true });
      refreshBackendState();
      refreshAnalyticsState();
      checkForAppUpdate();
    }
  });
  window.addEventListener("focus", checkForAppUpdate);
  window.addEventListener("keydown", handleDialogKeydown);
  rideData.addEventListener("update", () => {
    renderRideDataUpdate();
    renderStatusBanner();
  });
  rideData.addEventListener("status", () => {
    renderRefreshCopy();
    renderStatusBanner();
  });
  store.addEventListener("change", (e) => {
    if (["rules", "expired", "rule-migration"].includes(e.detail.reason)) rulesSynced = false;
    if (e.detail.reason === "park") nextUpOffset = 0;
    if (e.detail.reason === "search") renderRideResults();
    else if (e.detail.reason !== "view") render();
  });
  const active = store.snapshot.activeView in views ? store.snapshot.activeView : "explore";
  selectView(active);
  renderStatusBanner();
  await rideData.refresh();
  migrateLegacyRules();
  if (pushOn) await safeSync({ quiet: true });
  const deepLinkRide = new URL(location.href).searchParams.get("ride");
  if (deepLinkRide && rideData.rideById(deepLinkRide)) openRide(deepLinkRide);
  setInterval(async () => {
    await rideData.refresh();
    renderSettings();
    bindDynamic();
  }, Number(window.PARKPULSE_CONFIG?.REFRESH_INTERVAL_MS || 300000));
  setInterval(() => {
    if (navigator.onLine) refreshBackendState();
  }, 5 * 60 * 1000);
  setInterval(() => {
    if (navigator.onLine) refreshAnalyticsState();
  }, 15 * 60 * 1000);
  setInterval(() => {
    if (navigator.onLine) {
      refreshPushState({ sync: true });
      if (!analyticsState?.ok) refreshAnalyticsState();
    }
    renderParkHours();
    renderRideResults();
  }, 60 * 1000);
}
init();
