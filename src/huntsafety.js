// Conservative hunt-map risk: only known, unrelated monsters above the player's level count.
// Unknown levels never invent danger, but also cannot certify a map as safe.
export function huntRisk(data, mapId, playerLevel, wantedNames = []) {
  const level = Number(playerLevel);
  if (!Number.isFinite(level) || level <= 0) return { penalty: 0, dangerous: [] };
  const wanted = new Set(wantedNames.map(name => String(name).trim().toLowerCase()));
  const dangerous = (data.targets ?? []).filter(target => target.kind === 'mob' &&
    Number.isFinite(Number(target.level)) && Number(target.level) > level + 3 &&
    !wanted.has(String(target.name).trim().toLowerCase())).flatMap(target =>
    (target.locations ?? []).filter(location => location.mapId === mapId).map(location => ({
      name: target.name, level: Number(target.level), count: location.count ?? 1
    })));
  const penalty = dangerous.reduce((sum, mob) => sum + 120 + Math.min(80, mob.count * 4) + Math.min(80, (mob.level - level - 3) * 5), 0);
  return { penalty, dangerous };
}
