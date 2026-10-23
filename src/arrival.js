import { normalize, portalPosition } from './core.js';

// Everything worth knowing once you are standing on a map: where you are on it, monsters and how
// they suit your level, NPCs (and which quests they give or take), exits, rides, your own logged
// runs here and quest steps that happen here. Pure; the app renders it.

function side(map, x) {
  const b = map?.bounds;
  if (!b || !Number.isFinite(x) || b.maxX - b.minX < 300) return null;
  const f = (x - b.minX) / (b.maxX - b.minX);
  return f < .34 ? 'left' : f > .66 ? 'right' : 'middle';
}

function level(map, y) {
  const b = map?.bounds;
  if (!b || !Number.isFinite(y) || b.maxY - b.minY < 300) return null;
  const f = (y - b.minY) / (b.maxY - b.minY);
  return f < .4 ? 'upper level' : f > .75 ? 'ground level' : 'middle level';
}

export function fitLabel(mobLevel, playerLevel) {
  if (!Number.isFinite(mobLevel) || !Number.isFinite(playerLevel)) return null;
  const d = mobLevel - playerLevel;
  return d > 8 ? 'dangerous' : d > 4 ? 'tough' : d >= -8 ? 'good EXP' : 'very easy';
}

export function arrivalDetails(data, mapId, { playerLevel = null, position = null, sessions = [], quests = [], questTasks = [] } = {}) {
  const map = data.maps.find(m => m.id === mapId);
  if (!map) return null;
  const name = id => data.maps.find(m => m.id === id)?.name ?? '?';
  const across = position ? side(map, position.x) : null, height = position ? level(map, position.y) : null;
  const where = [across === 'middle' ? 'in the middle' : across ? `on the ${across} side` : null, height ? `${across ? '' : 'on the '}${height}` : null].filter(Boolean);
  const mobs = (data.targets ?? []).filter(t => t.kind === 'mob').flatMap(t => t.locations.filter(l => l.mapId === mapId).map(l => ({
    name: t.name, level: t.level, count: l.count, exp: t.exp, hp: t.hp, special: t.special, fit: fitLabel(t.level, playerLevel)
  }))).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (a.level ?? 0) - (b.level ?? 0));
  const questNpcs = new Map();
  for (const quest of quests) for (const [role, npc] of [['gives', quest.giver], ['takes', quest.turnIn]]) {
    if (!npc) continue;
    const key = normalize(npc), list = questNpcs.get(key) ?? questNpcs.set(key, []).get(key);
    if (!list.some(q => q.name === quest.name && q.role === role)) list.push({ name: quest.name, role, level: quest.level });
  }
  const npcs = (map.npcs ?? []).filter((n, i, all) => all.findIndex(o => o.name === n.name) === i).map(n => ({
    // Quests closest to your level first.
    name: n.name, side: side(map, n.x), quests: [...(questNpcs.get(normalize(n.name)) ?? [])].sort((a, b) => Math.abs((a.level ?? 0) - (playerLevel ?? 0)) - Math.abs((b.level ?? 0) - (playerLevel ?? 0))).slice(0, 6)
  }));
  const exits = data.portals.filter(p => p.from === mapId && p.kind !== 'taxi').map(p => ({ to: p.to, name: name(p.to), kind: p.kind, where: portalPosition(p, map) }))
    .filter((e, i, all) => all.findIndex(o => o.to === e.to && o.kind === e.kind) === i);
  const rides = data.portals.filter(p => p.from === mapId && p.kind === 'taxi').map(p => ({ npc: p.npc, to: p.to, name: name(p.to), fare: p.fare }));
  const levels = mobs.filter(m => !m.special && Number.isFinite(m.level)).map(m => m.level);
  const training = levels.length ? { from: Math.max(1, Math.min(...levels) - 4), to: Math.max(...levels) + 8, spawns: mobs.reduce((n, m) => n + (m.count ?? 0), 0) } : null;
  const mine = sessions.filter(s => s.mapId === mapId).sort((a, b) => b.expPerHour - a.expPerHour);
  const questSteps = questTasks.filter(task => task.step && task.maps?.some(option => option.map.id === mapId)).map(task => ({ quest: task.quest.name, step: task.step.title }));
  return { map, where: where.join(', ') || null, mobs, npcs, exits, rides, training, bestRun: mine[0] ?? null, runs: mine.length, questSteps };
}
