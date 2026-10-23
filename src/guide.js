export function rankGrindMaps(data, playerLevel, mode = 'xp') {
  const level = Number(playerLevel);
  if (!Number.isInteger(level) || level < 1 || level > 200) return [];
  const maps = new Map(data.maps.map(map => [map.id, map]));
  const spots = new Map();
  for (const mob of data.targets ?? []) {
    if (mob.kind !== 'mob' || mob.special || !Number.isFinite(mob.level) || mob.level < 1) continue;
    const difference = mob.level - level;
    if (mode === 'xp' && (difference < -8 || difference > 4)) continue;
    if (mode !== 'xp' && (difference < -12 || difference > 0)) continue;
    for (const location of mob.locations) {
      const map = maps.get(location.mapId);
      if (!map || !Number.isFinite(location.count) || location.count < 1) continue;
      const density = Math.min(location.count, 60);
      const proximity = Math.max(.15, 1 - Math.abs(difference) / (mode === 'xp' ? 12 : 16));
      const score = mode === 'xp'
        ? density * Math.max(1, mob.exp ?? 1) / Math.sqrt(Math.max(1, mob.hp ?? 1)) * proximity
        : density * proximity;
      if (!spots.has(map.id)) spots.set(map.id, { map, score: 0, mobs: [] });
      const spot = spots.get(map.id);
      spot.score += score;
      spot.mobs.push({ name: mob.name, level: mob.level, count: location.count });
    }
  }
  return [...spots.values()].sort((a, b) => b.score - a.score || a.map.name.localeCompare(b.map.name)).slice(0, 10);
}
