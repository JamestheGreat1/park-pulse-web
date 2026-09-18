import { loadHistory } from "./store.js";

function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : Math.round((list[middle - 1] + list[middle]) / 2);
}

function priorityBonus(priority) {
  return ({ 0: -100, 1: 0, 2: 17, 3: 32 })[Number(priority)] ?? 0;
}

function historicMedian(rideId, history) {
  const samples = (history[String(rideId)] || []).filter((sample) => sample.o && sample.w > 0).map((sample) => sample.w);
  return median(samples);
}

export function recommendations(rides, state, { limit = 8, parkId = null } = {}) {
  const history = loadHistory();
  const favoriteSet = new Set(state.favorites.map(Number));
  const ridden = new Set(state.daily.riddenRideIds.map(Number));
  const planIndex = new Map(
    state.itinerary.filter((item) => item.type === "ride").map((item, index) => [Number(item.rideId), index])
  );

  const pool = rides.filter((ride) =>
    ride.kind === "ride" && ride.isOpen && (parkId == null || ride.parkId === Number(parkId)) && Number(state.priorities[ride.id] ?? 1) !== 0
  );
  if (!pool.length) return [];

  const currentMedian = median(pool.map((ride) => ride.waitTime).filter((wait) => wait > 0)) ?? 25;

  return pool.map((ride) => {
    const priority = Number(state.priorities[ride.id] ?? 1);
    const effectiveWait = ride.waitTime === 0 ? 5 : ride.waitTime;
    const hist = historicMedian(ride.id, history);
    let score = 48 + priorityBonus(priority) + Math.round((currentMedian - effectiveWait) * 1.15);
    if (ride.waitTime <= 15) score += 10;
    if (ride.waitTime >= 60) score -= 15;
    if (favoriteSet.has(ride.id)) score += 6;
    if (planIndex.has(ride.id)) score += Math.max(3, 15 - Math.min(12, planIndex.get(ride.id) * 2));
    if (hist && ride.waitTime > 0) score += Math.max(-10, Math.min(18, Math.round((hist - ride.waitTime) * 0.75)));
    if (ridden.has(ride.id)) score -= 28;
    score = Math.max(0, Math.min(100, score));

    let reason = "Open now and one of the stronger options nearby.";
    if (priority === 3 && ride.waitTime <= currentMedian) reason = "A must-do for you with a better-than-current-typical wait.";
    else if (priority === 2 && ride.waitTime <= currentMedian) reason = "One of your priorities and the wait is looking solid.";
    else if (hist && ride.waitTime > 0 && ride.waitTime <= hist - 10) reason = `About ${hist - ride.waitTime} min below its recent ParkPulse median.`;
    else if (favoriteSet.has(ride.id)) reason = "One of your favorites is a strong option right now.";
    else if (ride.waitTime === 0) reason = "Open with no posted queue.";
    else if (ride.waitTime <= 15) reason = "Very short posted wait right now.";
    else if (ride.waitTime < currentMedian) reason = "Below the current median wait for open rides.";

    return { ride, score, reason };
  }).sort((a, b) => b.score - a.score || a.ride.waitTime - b.ride.waitTime).slice(0, limit);
}

export function nextUp(state, queueData) {
  const done = new Set(state.daily.doneUids || []);
  const skipped = new Set(state.parkDay.skippedUids || []);
  const pending = state.itinerary.filter((item) => !done.has(item.uid) && !skipped.has(item.uid));
  if (!pending.length) return null;

  if (pending[0].type === "custom") return { item: pending[0], ride: null, reason: "Next on your plan." };

  const window = pending.slice(0, 4).filter((item) => item.type === "ride").map((item, position) => ({
    item,
    ride: queueData.rideById(item.rideId),
    position
  }));

  const open = window.filter((candidate) => candidate.ride?.isOpen);
  if (!open.length) {
    const first = window[0];
    return first ? { ...first, reason: "Next on your itinerary; ParkPulse will keep checking for it to reopen." } : null;
  }

  const history = loadHistory();
  const candidate = open.map((entry) => {
    const priority = Number(state.priorities[entry.ride.id] ?? 1);
    const favorite = state.favorites.includes(entry.ride.id);
    const hist = historicMedian(entry.ride.id, history);
    let score = 60 - entry.position * 6 + priority * 8 + (favorite ? 7 : 0) - Math.min(35, entry.ride.waitTime) * 0.7;
    if (hist && entry.ride.waitTime > 0) score += Math.min(16, Math.max(-8, (hist - entry.ride.waitTime) * 0.7));
    return { ...entry, score };
  }).sort((a, b) => b.score - a.score)[0];

  const reason = candidate.position === 0
    ? "Next on your plan and open now."
    : "A stronger timing window from the next few stops — your itinerary order stays unchanged.";
  return { ...candidate, reason };
}
