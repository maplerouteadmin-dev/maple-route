// Live EXP tracking from the status bar. Each reading is "EXP value [percent]"; the bar's pixel fill
// must agree with the percent, which rejects OCR misreads. Level-ups are detected when the percent
// wraps around, and the EXP needed for the old level is estimated from value / percent.

export function createExpTracker(now = Date.now()) {
  return { startedAt: now, gained: 0, gainedPercent: 0, lost: 0, levelUps: 0, startLevel: null, level: null, last: null, samples: 0, mapMinutes: {} };
}

export function addExpReading(tracker, { value, percent, level = null, barFill = null, mapId = null }, now = Date.now()) {
  if (!Number.isFinite(value) || !Number.isFinite(percent) || percent < 0 || percent > 100) return { tracker, accepted: false };
  if (Number.isFinite(barFill) && Math.abs(barFill * 100 - percent) > 3) return { tracker, accepted: false };
  const t = { ...tracker, mapMinutes: { ...tracker.mapMinutes } };
  const need = percent >= 1 ? value * 100 / percent : null;
  const last = t.last;
  if (last) {
    // A falling amount with a rising percentage on the same level is an OCR error.
    if (value < last.value && percent >= last.percent && !(Number.isFinite(level) && level !== last.level))
      return { tracker, accepted: false };
    if (need && last.need && Math.abs(need - last.need) / last.need > .05 && percent >= last.percent && !(Number.isFinite(level) && level !== last.level))
      return { tracker, accepted: false }; // same level must imply the same EXP-to-level
    const leveled = (Number.isFinite(level) && Number.isFinite(last.level) && level > last.level) || (percent + 25 < last.percent && value < last.value);
    if (leveled) {
      t.gained += Math.max(0, (last.need ?? last.value) - last.value) + value;
      t.gainedPercent += 100 - last.percent + percent;
      t.levelUps += 1;
    } else if (value >= last.value) {
      t.gained += value - last.value; t.gainedPercent += percent - last.percent;
    } else t.lost += last.value - value; // died, or EXP spent
    if (mapId) t.mapMinutes[mapId] = (t.mapMinutes[mapId] ?? 0) + (now - last.at) / 60000;
  }
  const resolvedLevel = Number.isFinite(level) ? level : last?.level != null ? last.level + (last && percent + 25 < last.percent ? 1 : 0) : null;
  if (t.startLevel == null && resolvedLevel != null) t.startLevel = resolvedLevel;
  t.level = resolvedLevel;
  t.last = { value, percent, level: resolvedLevel, need: need ?? last?.need ?? null, at: now };
  t.samples += 1;
  return { tracker: t, accepted: true };
}

export function expSummary(tracker, now = Date.now()) {
  const minutes = Math.max(0, (now - tracker.startedAt) / 60000), hours = minutes / 60;
  const perHour = hours > 0 ? tracker.gained / hours : 0, percentPerHour = hours > 0 ? tracker.gainedPercent / hours : 0;
  const left = tracker.last ? 100 - tracker.last.percent : null;
  const minutesToLevel = left != null && percentPerHour > 0 ? left / percentPerHour * 60 : null;
  const topMap = Object.entries(tracker.mapMinutes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { minutes, gained: tracker.gained, lost: tracker.lost, perHour, percentPerHour, minutesToLevel, levelUps: tracker.levelUps, level: tracker.level, startLevel: tracker.startLevel, percent: tracker.last?.percent ?? null, topMap };
}

// Row in the same shape as manually saved training sessions; mesos are not on the status bar.
export function sessionFromTracker(tracker, now = Date.now(), fallbackLevel = null) {
  const s = expSummary(tracker, now), minutes = Math.max(1, Math.round(s.minutes));
  const startLevel = s.startLevel ?? fallbackLevel ?? 1, endLevel = Math.max(startLevel, s.level ?? startLevel);
  return {
    id: `auto-${now}`, auto: true, mapId: s.topMap ?? '', minutes, startLevel, endLevel,
    startExp: 0, endExp: Math.round(s.gained), startMesos: 0, endMesos: 0,
    expGained: Math.round(s.gained), mesoChange: 0, expPerHour: Math.round(s.gained * 60 / minutes), mesosPerHour: 0
  };
}
