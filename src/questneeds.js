import { normalize } from './core.js';

// "Dark Marble (Warrior)" in the wiki's list is the same item as the game's "Dark Marble".
export const itemKey = name => normalize(String(name ?? '').replace(/\s+\((?:quest item|Warrior|Magician|Bowman|Thief)\)$/i, '').replace(/([A-Za-z]+)'s\b/g, '$1').replace(/([A-Za-z]+)'\b/g, '$1'));

// The game files distinguish items handed over on accepting a quest from items
// the player must find. Both can appear in requirements_list and the wiki list.
export const providedAtStart = (quest, name) => Boolean(itemKey(name) && quest?.startItems?.some(item => itemKey(item.name ?? item) === itemKey(name)));

// Game quest objectives and the wiki's required-item list are complementary.
// A short wiki step list must not hide an item the player still needs to bring.
export function completeQuestNeeds(quest, requiredItems = []) {
  const needs = (quest?.needs ?? []).filter(need => !providedAtStart(quest, need.name)).map(need => ({ ...need }));
  for (const item of requiredItems ?? []) {
    if (!item?.name || providedAtStart(quest, item.name)) continue;
    const existing = needs.find(need => itemKey(need.name) === itemKey(item.name));
    if (existing) existing.count = Math.max(Number(existing.count) || 0, Number(item.quantity) || 1);
    else needs.push({ name: item.name, count: Number(item.quantity) || 1, type: 'item' });
  }
  return needs;
}
