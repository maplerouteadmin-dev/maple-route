// Words for the voice. Map names end in Roman numerals ("Ant Tunnel I", "West Rocky Mountain II"),
// which voices read as letters ("eye", "eye eye"): say them as numbers. A numeral counts only right
// after a capitalised word ("Tunnel I"); a lone "I" also needs what follows to fit a map name (the end,
// punctuation, or "then/and/to…"), so the pronoun ("Then I go") stays a word. Pure.
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const AFTER_NAME = /^(?:$|[\s]*[.,;:!?)>"'’]|\s+(?:then|and|to|for|via|from|on|in|at|or|is|has)\b)/;
export function spoken(text) {
  return String(text ?? '').replace(/(?<=\b[A-Z][\w'’]*>?\s)(VIII|VII|VI|IV|IX|III|II|I|V|X)\b(?![\w'’])/g, (numeral, _n, at, all) => {
    if (/[.!?]$/.test(all.slice(0, at).trimEnd())) return numeral; // a new sentence's first word
    if ((numeral === 'I' || numeral === 'V') && !AFTER_NAME.test(all.slice(at + numeral.length))) return numeral;
    return String(ROMAN[numeral]);
  });
}

// What to do at a trip stop, said when you get there ("Buy 1 Salad from the 24 Hr Mobile Store").
// `step` = a planMultiTrip stop ({ type, quests, npc, item, count, goals }); `npc` = who takes the hand-in.
const list = names => names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
export function taskWords(step, { npc = null } = {}) {
  if (!step) return '';
  const quests = list(step.quests ?? []);
  if (step.type === 'start') return `Talk to ${step.npc ?? npc ?? 'the quest NPC'} to start ${quests || 'the quest'}.`;
  if (step.type === 'buy') return `Buy ${step.count ?? 1} ${step.item} from ${step.npc ?? 'the shop'}.`;
  if (step.type === 'hunt') return `Hunt here for ${list(step.goals ?? []) || 'what you need'}.`;
  if (step.type === 'craft') return 'Craft your items here.';
  if (step.type === 'handin') return `Talk to ${npc ?? step.npc ?? 'the quest NPC'} to hand in ${quests || 'your quest'}.`;
  return '';
}
