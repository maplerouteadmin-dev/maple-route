import { normalize } from './core.js';

// "Read quests one by one": the player clicks through the quests in the in-game quest window, and each
// time the window shows a different quest its text is read. Which quest is it? Every catalog quest is
// scored by how many of its own words (name, description, NPCs, items) appear in what was read, rare
// words counting more (a word in half the quests says little). The list rows only show short titles,
// so the quest whose details are open stands out. Pure; no layout of the window is assumed.

const STOP = new Set(['about', 'after', 'again', 'already', 'another', 'around', 'asked', 'because', 'before', 'being', 'could', 'every',
  'first', 'found', 'going', 'great', 'have', 'into', 'just', 'level', 'little', 'looks', 'maybe', 'might', 'more', 'much', 'need', 'needs',
  'only', 'other', 'quest', 'really', 'right', 'said', 'seems', 'should', 'since', 'some', 'something', 'still', 'take', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'this', 'those', 'through', 'very', 'want', 'wants', 'what', 'when',
  'where', 'which', 'while', 'will', 'with', 'would', 'your', 'complete', 'characters', 'higher']);
const wordsOf = text => normalize(text ?? '').split(' ').filter(word => word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word));

// Per catalog: each quest's distinct words and how rare each word is. Built once per catalog array.
const indexCache = new WeakMap();
function indexFor(catalog) {
  if (indexCache.has(catalog)) return indexCache.get(catalog);
  const quests = catalog.map(quest => ({ quest, words: new Set(wordsOf([quest.name, quest.arc, quest.text, quest.giver, quest.turnIn,
    ...(quest.needs ?? []).map(need => need.name), ...(quest.startItems ?? []).map(item => item.name)].filter(Boolean).join(' '))) }));
  const df = new Map();
  for (const { words } of quests) for (const word of words) df.set(word, (df.get(word) ?? 0) + 1);
  const weight = word => Math.log(1 + quests.length / (df.get(word) ?? 1));
  const index = { quests, weight };
  indexCache.set(catalog, index);
  return index;
}

// The quest shown in `text`, or null when nothing stands out. Returns { quest, score, runnerUp }.
export function identifyQuestDetail(text, catalog, { min = 9, margin = 1.35 } = {}) {
  if (!text || !catalog?.length) return null;
  const seen = new Set(wordsOf(text));
  if (seen.size < 3) return null;
  const { quests, weight } = indexFor(catalog);
  // Whole lines as read (numbers kept): a series like "Collecting 70 / 100 / 150 Cursed Dolls" shares
  // every description word and differs only in its name.
  const lines = new Set(String(text).split('\n').map(line => normalize(line)).filter(line => line.length >= 6));
  const scored = quests.map(({ quest, words }) => {
    let score = 0;
    for (const word of words) if (seen.has(word)) score += weight(word);
    // The full name on its own line is strong evidence (the detail panel shows it whole).
    const name = normalize(quest.name);
    const named = name.length >= 6 && lines.has(name);
    if (named) score += 12;
    return { quest, score, named };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < min) return null;
  // Without its name on screen a quest needs a much clearer lead: a wrong quest is worse than none.
  const needed = best.named ? margin : margin + .3;
  // Same-named versions (a job test per job) share the name: a few rare words apart is enough.
  const sameName = second && normalize(second.quest.name) === normalize(best.quest.name);
  if (second && best.score < second.score * needed && !(sameName && best.score - second.score >= 3)) return null;
  return { quest: best.quest, score: best.score, runnerUp: second?.quest ?? null };
}
