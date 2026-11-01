// One play session (Live GPS on to off): time and EXP per map, levels, quests finished. Pure.
export function createSessionLog(now = Date.now(), level = null) {
  return { startedAt: now, mapId: null, mapSince: now, maps: {}, exp: 0, levels: 0, startLevel: level, quests: [] };
}
// Time on the map you were on up to now, then the new map.
export function logMap(log, mapId, now = Date.now()) {
  const next = { ...log, maps: { ...log.maps } };
  if (log.mapId) {
    const row = next.maps[log.mapId] ?? { minutes: 0, exp: 0 };
    next.maps[log.mapId] = { ...row, minutes: row.minutes + Math.max(0, now - log.mapSince) / 60000 };
  }
  next.mapId = mapId; next.mapSince = now;
  return next;
}
export function logExp(log, gained, { levelUps = 0 } = {}) {
  if (!(gained > 0) && !levelUps) return log;
  const next = { ...log, maps: { ...log.maps }, exp: log.exp + Math.max(0, gained || 0), levels: log.levels + (levelUps || 0) };
  if (log.mapId && gained > 0) { const row = next.maps[log.mapId] ?? { minutes: 0, exp: 0 }; next.maps[log.mapId] = { ...row, exp: row.exp + gained }; }
  return next;
}
export function logQuest(log, names) {
  return { ...log, quests: [...new Set([...log.quests, ...[names].flat().filter(Boolean)])] };
}
// The finished session: totals and each map with at least 3 minutes, best rate first.
export function finishSession(log, now = Date.now(), { level = null } = {}) {
  const closed = logMap(log, null, now), minutes = Math.max(0, (now - log.startedAt) / 60000);
  const maps = Object.entries(closed.maps).filter(([, row]) => row.minutes >= 3)
    .map(([mapId, row]) => ({ mapId, minutes: Math.round(row.minutes), exp: Math.round(row.exp), perHour: Math.round(row.exp / (row.minutes / 60)) }))
    .sort((a, b) => b.perHour - a.perHour);
  return { endedAt: now, startedAt: log.startedAt, minutes: Math.round(minutes), exp: Math.round(log.exp), perHour: minutes >= 1 ? Math.round(log.exp / (minutes / 60)) : 0,
    levels: log.levels, startLevel: log.startLevel, level: level ?? (log.startLevel != null ? log.startLevel + log.levels : null), maps, quests: log.quests };
}
export function summaryLines(summary, mapName = id => id) {
  const time = summary.minutes >= 60 ? `${Math.floor(summary.minutes / 60)} h ${summary.minutes % 60} min` : `${summary.minutes} min`;
  const lines = [`${time} played · ${summary.exp.toLocaleString('en-US')} EXP${summary.perHour ? ` (${summary.perHour.toLocaleString('en-US')}/h)` : ''}${summary.levels ? ` · +${summary.levels} level${summary.levels === 1 ? '' : 's'}` : ''}`];
  for (const map of summary.maps.slice(0, 4)) lines.push(`${mapName(map.mapId)}: ${map.minutes} min, ${map.perHour.toLocaleString('en-US')} EXP/h`);
  if (summary.quests.length) lines.push(`Quests finished: ${summary.quests.join(', ')}`);
  return lines;
}

// "Time to move on": a map from earlier sessions near your level that gave clearly more EXP/h than
// where you are now (after 10 minutes here). history: finished sessions (newest first).
export function betterMap({ mapId, perHour, minutes, level }, history = [], { factor = 1.5, levelSpan = 3 } = {}) {
  if (!mapId || !(minutes >= 10) || !(perHour > 0) || !Number.isInteger(level)) return null;
  let best = null;
  for (const session of history) {
    const at = session.level ?? session.startLevel;
    if (!Number.isInteger(at) || Math.abs(at - level) > levelSpan) continue;
    for (const map of session.maps ?? []) {
      if (map.mapId === mapId || map.minutes < 10 || map.perHour < perHour * factor) continue;
      if (!best || map.perHour > best.perHour) best = { mapId: map.mapId, perHour: map.perHour, level: at };
    }
  }
  return best;
}
