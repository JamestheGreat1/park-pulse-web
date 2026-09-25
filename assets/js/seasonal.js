const PREVIEW_HOSTS = new Set(["preview.useparkpulse.com", "localhost", "127.0.0.1"]);
const PREVIEW_WORKERS_SUFFIX = "-park-pulse-web.jamesp5297.workers.dev";
const LEGACY_PREVIEW_SURFACE_KEY = "parkpulse.preview.surface";
const GLASS_STYLE_KEY = "parkpulse.glassStyle";
const SEASONAL_EFFECTS_KEY = "parkpulse.seasonalEffects";

export const SEASONS = [
  { id: "auto", label: "Automatic", emoji: "✦" },
  { id: "none", label: "None", emoji: "—" },
  { id: "halloween", label: "Halloween", emoji: "🎃" },
  { id: "fall", label: "Fall / Thanksgiving", emoji: "🍂" },
  { id: "christmas", label: "Christmas", emoji: "🎄" },
  { id: "easter", label: "Easter", emoji: "🌸" },
  { id: "july4", label: "Fourth of July", emoji: "🎆" }
];

export const GLASS_STYLES = [
  { id: "frosted", label: "Frosted" },
  { id: "liquid", label: "Liquid" }
];

function safeGet(key, fallback) {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function seasonalEffectsEnabled() {
  return safeGet(SEASONAL_EFFECTS_KEY, "on") !== "off";
}

export function setSeasonalEffectsEnabled(enabled) {
  safeSet(SEASONAL_EFFECTS_KEY, enabled ? "on" : "off");
}

export function glassStyleSetting() {
  const saved = safeGet(GLASS_STYLE_KEY, "");
  if (saved === "frosted" || saved === "liquid") return saved;
  const legacy = safeGet(LEGACY_PREVIEW_SURFACE_KEY, "");
  const migrated = legacy === "liquid" ? "liquid" : "frosted";
  safeSet(GLASS_STYLE_KEY, migrated);
  return migrated;
}

export function setGlassStyleSetting(style) {
  safeSet(GLASS_STYLE_KEY, style === "liquid" ? "liquid" : "frosted");
}

function glassSurface() {
  return glassStyleSetting() === "liquid" ? "liquid" : "neutral";
}

export function isSeasonPreviewEnabled() {
  return PREVIEW_HOSTS.has(location.hostname) || location.hostname.endsWith(PREVIEW_WORKERS_SUFFIX);
}

function easterSunday(year) {
  // Meeus/Jones/Butcher Gregorian Easter algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function atLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function thanksgivingDay(year) {
  const first = new Date(year, 10, 1);
  const firstThursdayOffset = (4 - first.getDay() + 7) % 7;
  return new Date(year, 10, 1 + firstThursdayOffset + 21);
}

export function automaticSeason(now = new Date()) {
  const date = atLocalMidnight(now);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 10) return "halloween";
  if (month === 11) {
    const thanksgiving = thanksgivingDay(year);
    return date <= thanksgiving ? "fall" : "christmas";
  }
  if (month === 12) return "christmas";
  if (month === 7 && day >= 1 && day <= 5) return "july4";

  const easter = easterSunday(year);
  const easterStart = addDays(easter, -10);
  const easterEnd = addDays(easter, 1);
  if (date >= easterStart && date <= easterEnd) return "easter";

  return "none";
}

function requestedPreviewSeason() {
  if (!isSeasonPreviewEnabled()) return null;
  const requested = new URL(location.href).searchParams.get("season");
  if (!requested) return null;
  return SEASONS.some((item) => item.id === requested) ? requested : null;
}

export function activeSeason(now = new Date()) {
  if (!seasonalEffectsEnabled()) return "none";
  return requestedPreviewSeason() || automaticSeason(now);
}


function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function px(value) {
  return `${Math.round(value * 10) / 10}px`;
}

function fireworkMarkup(index) {
  const colors = ["#ff6f7e", "#73b8ff", "#ffffff", "#ffd56b", "#ff7b8d", "#8fc7ff", "#ffffff"];
  const seed = index + 1;
  const left = 10 + seededUnit(seed * 3.1) * 80;
  const top = 9 + seededUnit(seed * 4.7) * 43;
  const duration = 7.0 + seededUnit(seed * 5.9) * 1.7;
  const delay = -(seededUnit(seed * 7.3) * duration);
  const startX = (seededUnit(seed * 9.1) - .5) * 24;
  const x1 = startX * .76 + (seededUnit(seed * 11.7) - .5) * 3;
  const x2 = startX * .49 + (seededUnit(seed * 13.1) - .5) * 2;
  const x3 = startX * .24 + (seededUnit(seed * 15.7) - .5) * 1.5;
  const color = colors[index % colors.length];

  const burstCount = 17;
  const shapeX = .90 + seededUnit(seed * 17.3) * .22;
  const shapeY = .90 + seededUnit(seed * 19.1) * .22;
  const rotation = (seededUnit(seed * 20.9) - .5) * .18;
  const burst = Array.from({ length: burstCount }, (_, sparkIndex) => {
    const sparkSeed = seed * 1000 + sparkIndex + 1;
    const angle = ((Math.PI * 2 * sparkIndex) / burstCount) + (seededUnit(sparkSeed * 1.9) - .5) * .25 + rotation;
    const distance = 34 + seededUnit(sparkSeed * 2.9) * 31;
    const drift = (seededUnit(sparkSeed * 3.7) - .5) * 9;
    const fall = 7 + seededUnit(sparkSeed * 4.7) * 12;
    const dx = Math.cos(angle) * distance * shapeX;
    const dy = Math.sin(angle) * distance * shapeY;
    const dx1 = dx * .28;
    const dy1 = dy * .28;
    const dx2 = dx * .64;
    const dy2 = dy * .64 + 1;
    const dx3 = dx * .88 + drift * .35;
    const dy3 = dy * .88 + 3;
    const dx4 = dx + drift;
    const dy4 = dy + fall;
    const size = 2.4 + seededUnit(sparkSeed * 5.9) * 2.4;
    const twinkle = .46 + seededUnit(sparkSeed * 7.1) * .42;
    const twinkleDelay = -(seededUnit(sparkSeed * 8.3) * twinkle);
    return `<span class="firework-burst-spark" style="--dx1:${px(dx1)};--dy1:${px(dy1)};--dx2:${px(dx2)};--dy2:${px(dy2)};--dx3:${px(dx3)};--dy3:${px(dy3)};--dx4:${px(dx4)};--dy4:${px(dy4)};--spark-size:${px(size)};--twinkle-duration:${twinkle.toFixed(2)}s;--twinkle-delay:${twinkleDelay.toFixed(2)}s"><i></i></span>`;
  }).join("");

  return `
    <span class="firework" style="--fw-left:${left.toFixed(2)}%;--fw-top:${top.toFixed(2)}%;--fw-duration:${duration.toFixed(2)}s;--fw-delay:${delay.toFixed(2)}s;--fw-color:${color};--rocket-x0:${px(startX)};--rocket-x1:${px(x1)};--rocket-x2:${px(x2)};--rocket-x3:${px(x3)}">
      <span class="firework-rocket"><span class="firework-head"></span></span>
      <span class="firework-burst">${burst}</span>
    </span>
  `;
}


let fireworkEmitterFrame = 0;
let fireworkEmitterLastFrame = 0;
let fireworkEmitterCounter = 0;
const fireworkEmitterLastByRocket = new WeakMap();

function removeEmittedFireworkSparks() {
  document.querySelectorAll(".firework-emitted-spark").forEach((spark) => spark.remove());
}

function stopFireworkEmitter() {
  if (fireworkEmitterFrame) cancelAnimationFrame(fireworkEmitterFrame);
  fireworkEmitterFrame = 0;
  fireworkEmitterLastFrame = 0;
  removeEmittedFireworkSparks();
}

function emitTrailSpark(field, fieldRect, head, rocketIndex) {
  if (!field.isConnected || !head.isConnected || head.getClientRects().length === 0) return;

  const rocket = head.closest(".firework-rocket");
  const firework = head.closest(".firework");
  if (!rocket || !firework || getComputedStyle(firework).display === "none") return;

  const rocketOpacity = Number.parseFloat(getComputedStyle(rocket).opacity || "0");
  if (rocketOpacity < .16) return;

  const headRect = head.getBoundingClientRect();
  const x = headRect.left - fieldRect.left + headRect.width / 2;
  const y = headRect.top - fieldRect.top + headRect.height / 2;

  if (x < -20 || x > fieldRect.width + 20 || y < -20 || y > fieldRect.height + 20) return;

  const seed = ++fireworkEmitterCounter + rocketIndex * 101;
  const jitterX = (seededUnit(seed * 1.7) - .5) * 8;
  const jitterY = (seededUnit(seed * 2.3) - .5) * 5;
  const driftX = (seededUnit(seed * 3.1) - .5) * 16;
  const fallY = 8 + seededUnit(seed * 4.3) * 16;
  const size = 2.0 + seededUnit(seed * 5.9) * 2.7;
  const life = .62 + seededUnit(seed * 6.7) * .34;
  const twinkle = .28 + seededUnit(seed * 7.9) * .34;
  const star = seededUnit(seed * 8.7) > .78;

  const spark = document.createElement("span");
  spark.className = `firework-emitted-spark${star ? " star" : ""}`;
  spark.style.left = `${(x + jitterX - size / 2).toFixed(1)}px`;
  spark.style.top = `${(y + jitterY - size / 2).toFixed(1)}px`;
  spark.style.setProperty("--spark-size", `${size.toFixed(1)}px`);
  spark.style.setProperty("--spark-life", `${life.toFixed(2)}s`);
  spark.style.setProperty("--spark-twinkle", `${twinkle.toFixed(2)}s`);
  spark.style.setProperty("--spark-dx1", `${(driftX * .28).toFixed(1)}px`);
  spark.style.setProperty("--spark-dy1", `${(fallY * .18).toFixed(1)}px`);
  spark.style.setProperty("--spark-dx2", `${(driftX * .62).toFixed(1)}px`);
  spark.style.setProperty("--spark-dy2", `${(fallY * .52).toFixed(1)}px`);
  spark.style.setProperty("--spark-dx3", `${driftX.toFixed(1)}px`);
  spark.style.setProperty("--spark-dy3", `${fallY.toFixed(1)}px`);
  spark.style.color = getComputedStyle(firework).color;
  spark.innerHTML = "<i></i>";
  field.append(spark);

  const cleanup = (event) => {
    if (event.animationName !== "fw-emitted-spark") return;
    spark.removeEventListener("animationend", cleanup);
    spark.remove();
  };
  spark.addEventListener("animationend", cleanup);
  window.setTimeout(() => spark.remove(), Math.ceil(life * 1000) + 250);
}

function fireworkEmitterTick(now) {
  fireworkEmitterFrame = 0;

  if (document.documentElement.dataset.season !== "july4" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stopFireworkEmitter();
    return;
  }

  const field = document.querySelector(".fireworks-field");
  if (!field) return;

  if (now - fireworkEmitterLastFrame >= 36) {
    fireworkEmitterLastFrame = now;
    const fieldRect = field.getBoundingClientRect();
    field.querySelectorAll(".firework-head").forEach((head, index) => {
      const last = fireworkEmitterLastByRocket.get(head) || 0;
      const interval = 48 + (index % 3) * 7;
      if (now - last >= interval) {
        fireworkEmitterLastByRocket.set(head, now);
        emitTrailSpark(field, fieldRect, head, index);
      }
    });
  }

  fireworkEmitterFrame = requestAnimationFrame(fireworkEmitterTick);
}

function syncFireworkEmitter() {
  const enabled =
    document.documentElement.dataset.season === "july4" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!enabled) {
    stopFireworkEmitter();
    return;
  }

  if (!fireworkEmitterFrame) {
    fireworkEmitterFrame = requestAnimationFrame(fireworkEmitterTick);
  }
}

function ensureFireworksField(layer) {
  let field = layer.querySelector(".fireworks-field");
  if (field) return field;
  field = document.createElement("div");
  field.className = "fireworks-field";
  field.setAttribute("aria-hidden", "true");
  field.innerHTML = Array.from({ length: 7 }, (_, index) => fireworkMarkup(index)).join("");
  layer.append(field);
  return field;
}

function ensureSeasonalLayer() {
  let layer = document.querySelector(".seasonal-layer");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.className = "seasonal-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = Array.from({ length: 52 }, (_, index) =>
    `<span class="seasonal-particle" style="--particle-index:${index};--particle-left:${(index * 37 + 11) % 101}%;--particle-top:${(index * 29 + 7) % 88}%;--particle-delay:-${(index * 1.37).toFixed(2)}s;--particle-duration:${(11 + (index % 7) * 1.9).toFixed(1)}s"></span>`
  ).join("");
  document.body.prepend(layer);
  return layer;
}

function ensurePreviewBadge() {
  let badge = document.querySelector(".season-preview-badge");
  if (!isSeasonPreviewEnabled()) {
    badge?.remove();
    return null;
  }
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "season-preview-badge";
    badge.setAttribute("aria-live", "polite");
    document.body.append(badge);
  }
  return badge;
}

export function applySeasonalTheme() {
  const season = activeSeason();
  const intensity = "normal";
  const surface = glassSurface();
  const root = document.documentElement;
  const effectsEnabled = seasonalEffectsEnabled();
  const visualLayerChanged =
    root.dataset.season !== season ||
    root.dataset.seasonIntensity !== intensity ||
    root.dataset.previewSurface !== surface ||
    root.dataset.seasonalEffects !== (effectsEnabled ? "on" : "off");

  root.dataset.seasonalEffects = effectsEnabled ? "on" : "off";
  root.dataset.season = season;
  root.dataset.seasonIntensity = intensity;
  root.dataset.previewSurface = surface;
  root.classList.toggle("season-active", season !== "none");

  if (visualLayerChanged) {
    root.classList.add("glass-color-snap");
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("glass-color-snap"));
  }

  const seasonalLayer = ensureSeasonalLayer();
  ensureFireworksField(seasonalLayer);
  syncFireworkEmitter();

  const badge = ensurePreviewBadge();
  if (badge) {
    const meta = SEASONS.find((item) => item.id === season) || SEASONS[1];
    const forced = requestedPreviewSeason();
    badge.textContent = effectsEnabled
      ? `PREVIEW · ${meta.emoji} ${meta.label} · ${intensity}${forced ? " · URL override" : ""}`
      : "PREVIEW · Seasonal effects off";
  }

  return { season, intensity, surface };
}
