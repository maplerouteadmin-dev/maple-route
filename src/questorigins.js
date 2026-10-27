import { normalize } from './core.js';

// Verified quest-specific sources take precedence over generic drop tables and
// name-based monster guesses. The Old Snail gives the book on acceptance.
// https://mapleclassic.wiki/wiki/The_Old_Snail
export function questItemGivenAtStart(quest, item) {
  const name = typeof quest === 'string' ? quest : quest?.name;
  if (quest?.startItems?.some(startItem => normalize(startItem.name) === normalize(item))) {
    return { npc: quest.giver || 'the quest giver', map: quest.start || '' };
  }
  if (normalize(name) === 'the old snail' && normalize(item) === 'the snail legend') {
    return { npc: 'Pia', map: 'Henesys Park' };
  }
  return null;
}

// The shell belongs to Mano, not ordinary Snails. The quest text names the boss
// and its one spawn map; the generic item-name guess otherwise picks Snail.
export function verifiedQuestItemMonsters(quest, item) {
  if (normalize(quest?.name) === 'a rainbow snail shell that makes wishes come true' && normalize(item) === 'rainbow colored snail shell') return ['Mano'];
  return null;
}

export function verifiedQuestTurnIn(quest) {
  const name = typeof quest === 'string' ? quest : quest?.name;
  if (normalize(name) === 'the old snail') return 'Jay';
  if (normalize(name) === 'first greeting with nella the town resident') return 'Nella';
  return null;
}
