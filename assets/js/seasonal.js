const PREVIEW_HOSTS = new Set(["preview.useparkpulse.com", "localhost", "127.0.0.1"]);
const PREVIEW_WORKERS_SUFFIX = "-park-pulse-web.jamesp5297.workers.dev";
const PREVIEW_SEASON_KEY = "parkpulse.preview.season";
const PREVIEW_INTENSITY_KEY = "parkpulse.preview.seasonIntensity";
const PREVIEW_SURFACE_KEY = "parkpulse.preview.surface";

export const SEASONS = [
  { id: "auto", label: "Automatic", emoji: "✦" },
  { id: "none", label: "None", emoji: "—" },
  { id: "halloween", label: "Halloween", emoji: "🎃" },
  { id: "christmas", label: "Christmas", emoji: "🎄" },
  { id: "easter", label: "Easter", emoji: "🌸" },
  { id: "july4", label: "Fourth of July", emoji: "🎆" }
];

export const INTENSITIES = [
  { id: "subtle", label: "Subtle" },
  { id: "normal", label: "Normal" },
  { id: "extra", label: "Extra" }
];

export const SURFACES = [
  { id: "neutral", label: "Neutral frosted glass" },
  { id: "navy", label: "Current navy glass" }
];

function safeGet(key, fallback) {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
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

export function automaticSeason(now = new Date()) {
  const date = atLocalMidnight(now);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 10) return "halloween";
  if ((month === 11 && day >= 20) || month === 12) return "christmas";
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

export function previewSeasonSetting() {
  const value = safeGet(PREVIEW_SEASON_KEY, "auto");
  return SEASONS.some((item) => item.id === value) ? value : "auto";
}

export function previewIntensitySetting() {
  const value = safeGet(PREVIEW_INTENSITY_KEY, "normal");
  return INTENSITIES.some((item) => item.id === value) ? value : "normal";
}

export function previewSurfaceSetting() {
  const value = safeGet(PREVIEW_SURFACE_KEY, "neutral");
  return SURFACES.some((item) => item.id === value) ? value : "neutral";
}

export function activeSeason(now = new Date()) {
  const forced = requestedPreviewSeason();
  const selected = forced || (isSeasonPreviewEnabled() ? previewSeasonSetting() : "auto");
  return selected === "auto" ? automaticSeason(now) : selected;
}

function ensureSeasonalLayer() {
  let layer = document.querySelector(".seasonal-layer");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.className = "seasonal-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = Array.from({ length: 40 }, (_, index) =>
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
  const intensity = isSeasonPreviewEnabled() ? previewIntensitySetting() : "normal";
  const surface = isSeasonPreviewEnabled() ? previewSurfaceSetting() : "navy";
  const root = document.documentElement;

  root.dataset.season = season;
  root.dataset.seasonIntensity = intensity;
  root.dataset.previewSurface = surface;
  root.classList.toggle("season-active", season !== "none");

  ensureSeasonalLayer();

  const badge = ensurePreviewBadge();
  if (badge) {
    const meta = SEASONS.find((item) => item.id === season) || SEASONS[1];
    const forced = requestedPreviewSeason();
    badge.textContent = `PREVIEW · ${meta.emoji} ${meta.label} · ${intensity}${forced ? " · URL override" : ""}`;
  }

  return { season, intensity, surface };
}

export function seasonalPreviewControlsMarkup() {
  if (!isSeasonPreviewEnabled()) return "";

  const season = previewSeasonSetting();
  const intensity = previewIntensitySetting();
  const surface = previewSurfaceSetting();
  const urlOverride = requestedPreviewSeason();

  return `
    <div class="settings-section-title preview-only-title">Preview lab</div>
    <section class="settings-group liquid-glass preview-settings">
      <div class="setting-row preview-warning"><div><strong>Seasonal preview</strong><small>Only available on the protected preview site. Production users never see these controls.</small></div><span class="preview-lock">PRIVATE</span></div>
      <label class="setting-row"><div><strong>Overlay</strong><small>${urlOverride ? `URL override active: ${urlOverride}` : "Force a season without changing the calendar."}</small></div>
        <select id="seasonPreviewSelect">${SEASONS.map((item) => `<option value="${item.id}" ${season === item.id ? "selected" : ""}>${item.emoji} ${item.label}</option>`).join("")}</select>
      </label>
      <label class="setting-row"><div><strong>Intensity</strong><small>Testing-only control. Public seasonal effects will use the approved default.</small></div>
        <select id="seasonIntensitySelect">${INTENSITIES.map((item) => `<option value="${item.id}" ${intensity === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select>
      </label>
      <label class="setting-row"><div><strong>Glass style</strong><small>Compare neutral frosted surfaces against the current navy treatment.</small></div>
        <select id="previewSurfaceSelect">${SURFACES.map((item) => `<option value="${item.id}" ${surface === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select>
      </label>
    </section>
  `;
}

export function bindSeasonalPreviewControls(onChange) {
  if (!isSeasonPreviewEnabled()) return;

  const season = document.querySelector("#seasonPreviewSelect");
  if (season) season.onchange = () => {
    safeSet(PREVIEW_SEASON_KEY, season.value);
    const url = new URL(location.href);
    url.searchParams.delete("season");
    history.replaceState({}, "", url);
    applySeasonalTheme();
    onChange?.();
  };

  const intensity = document.querySelector("#seasonIntensitySelect");
  if (intensity) intensity.onchange = () => {
    safeSet(PREVIEW_INTENSITY_KEY, intensity.value);
    applySeasonalTheme();
    onChange?.();
  };

  const surface = document.querySelector("#previewSurfaceSelect");
  if (surface) surface.onchange = () => {
    safeSet(PREVIEW_SURFACE_KEY, surface.value);
    applySeasonalTheme();
    onChange?.();
  };
}
