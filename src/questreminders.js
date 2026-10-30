import { normalize } from './core.js';
// Announce only known quest objectives for monsters actually present on this map.
// Do not speak Quest Helper counts: OCR can misread them. Manual completion ticks remove goals.
export function questMobReminder(goals, spawns, _helperQuests, activeQuests, { limit = 2, excludeMonsters = [] } = {}) {
  const active = new Set(activeQuests ?? []);
  const present = new Map((spawns ?? []).map(mob => [normalize(mob.name), mob]));
  const excluded = new Set(excludeMonsters.map(normalize));
  const reminders = [];
  for (const goal of goals ?? []) {
    if (!['kill', 'collect'].includes(goal.kind) || goal.pending || goal.guess || goal.done) continue;
    const quests = (goal.quests ?? []).filter(name => active.has(name));
    if (!quests.length) continue;
    for (const monster of goal.monsters ?? []) {
      if (excluded.has(normalize(monster))) continue;
      const spawn = present.get(normalize(monster));
      if (!spawn) continue;
      reminders.push({ monster: spawn.name, item: goal.kind === 'collect' ? goal.name : null, spawnCount: spawn.count ?? 0 });
    }
  }
  const byMob = new Map();
  for (const reminder of reminders) {
    const key = normalize(reminder.monster);
    const entry = byMob.get(key) ?? { monster: reminder.monster, spawnCount: reminder.spawnCount, objectives: [] };
    if (!entry.objectives.some(objective => normalize(objective.item ?? '') === normalize(reminder.item ?? ''))) entry.objectives.push(reminder);
    byMob.set(key, entry);
  }
  const chosen = [...byMob.values()].sort((a, b) => b.spawnCount - a.spawnCount || a.monster.localeCompare(b.monster)).slice(0, Math.max(0, limit));
  if (!chosen.length) return '';
  const lines = chosen.map(({ monster, objectives }) => {
    const kill = objectives.find(objective => !objective.item);
    const items = objectives.filter(objective => objective.item).slice(0, 2);
    const count = kill ? 'quest target' : '';
    const drops = items.map(({ item }) => `hunt for ${item}`);
    return `${monster}: ${[count, ...drops].filter(Boolean).join('; ')}`;
  });
  return `Quest opportunity on this map: ${lines.join('. ')}.`;
}
