import { normalize } from './core.js';
import { questItemGivenAtStart } from './questorigins.js';

const words = value => normalize(value).split(' ').filter(Boolean).map(word => word.replace(/(es|s)$/, '')).join(' ');
export function stepCoversNeed(step, need) {
  const wanted = words(need?.name ?? '');
  const said = words([step?.title, step?.monster, step?.item, step?.notes].filter(Boolean).join(' '));
  return Boolean(wanted) && ` ${said} `.includes(` ${wanted} `);
}

const needStep = (need, number, quest) => need.type === 'mob'
  ? { number, title: `Defeat ${need.count} ${need.name}`, monster: need.name, count: need.count }
  : { number, title: questItemGivenAtStart(quest, need.name) ? `Check ${need.name} in your bag (given when you accepted the quest)` : `Collect ${need.count} ${need.name}`, item: need.name, count: need.count };

// Talk-only quests with nothing to hunt (event trails like The First Mark) still happen somewhere:
// the quest's own ending text names the map ("…in a crack in the rocks at The Pig Beach"). Returns the
// known maps it names, in text order, with the sentence that names each. Only unique map names of 6+
// letters count, longest first, so "Ant Tunnel Park" wins over "Ant Tunnel". Towns are left out: an
// ending like "…back in Henesys" is where the quest NPCs already are, not a place to search. Pure.
export function questPlaces(quest, maps = []) {
  if (!quest?.text || quest.needs?.length) return [];
  if (quest.turnIn && quest.giver && normalize(quest.turnIn) !== normalize(quest.giver)) return []; // a delivery: the hand-in is the place
  const paragraphs = String(quest.text).split(/\n+/).filter(Boolean);
  const ending = paragraphs.length > 1 ? paragraphs.at(-1) : '';
  if (!ending) return [];
  const counts = new Map();
  for (const map of maps) { const key = normalize(map.name ?? ''); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
  // Older saved map data has no town flag: a map that returns to itself is a town.
  const isTown = map => map.town ?? !map.returnTo;
  const names = [...new Set(maps.filter(map => !isTown(map)).map(map => map.name).filter(name => name && normalize(name).length >= 6 && counts.get(normalize(name)) === 1))]
    .sort((a, b) => b.length - a.length);
  const text = ` ${normalize(ending)} `, taken = [], found = [];
  for (const name of names) {
    const key = ` ${normalize(name)} `;
    const at = text.indexOf(key);
    if (at === -1 || taken.some(([from, to]) => at < to && at + key.length > from)) continue;
    taken.push([at, at + key.length]);
    const map = maps.find(candidate => candidate.name === name);
    const sentence = ending.split(/(?<=[.!?])\s+/).find(part => normalize(part).includes(normalize(name))) ?? '';
    found.push({ at, id: map.id, name, sentence: sentence.trim() });
  }
  return found.sort((a, b) => a.at - b.at).map(({ at, ...place }) => place);
}
// Errands a talk-only quest's text spells out: sentences that start with Deliver/Bring/Give/Visit/Find,
// a list after "to the …" split into one errand each. Only for quests with nothing to hunt. Pure.
export function questTasks(quest) {
  if (quest?.needs?.length) return [];
  const middle = String(quest?.text ?? '').split(/\n+/).filter(Boolean).slice(1, -1).join(' ');
  const out = [];
  for (const sentence of middle.split(/(?<=[.!?])\s+/)) {
    const match = sentence.trim().match(/^(Deliver|Bring|Give|Take|Visit|Find|Hand)\b(.*?)[.!]?$/);
    if (!match) continue;
    const [, verb, rest] = match;
    // Skip what the hand-in step already says ("Take the journal to Daniel" when Daniel takes it in).
    if (quest.turnIn && ` ${normalize(rest)} `.includes(` ${normalize(quest.turnIn)} `)) continue;
    const list = rest.match(/^(.*?\bto )(the .+)$/);
    const parts = list ? list[2].split(/,\s*(?:and\s+)?|\s+and\s+(?=the\b)/).map(part => part.trim()).filter(Boolean) : [];
    if (parts.length > 1) for (const part of parts) out.push(`${verb}${list[1]}${part}`);
    else out.push(`${verb}${rest}`.replace(/\s*\bin Unknown Map\(\d+\)/g, ''));
  }
  return out.slice(0, 6);
}
// The quest's clue, when its text quotes one ("Where the sea meets a shore guarded by little snouts.").
export function questClue(quest) {
  const middle = String(quest?.text ?? '').split(/\n+/).filter(Boolean).slice(1, -1).join(' ');
  return middle.match(/"([^"]{8,200})"/)?.[1] ?? null;
}

// The steps of one quest for the Live card checklist: the wiki's step list when it has one, else
// built from the game data (talk to the giver, each hunt/collect target, hand in). Pure.
export function buildSteps(quest, wikiSteps = []) {
  if (wikiSteps?.length) {
    const steps = wikiSteps.map((step, i) => ({ ...step, number: step.number || i + 1, npc: step.npc || null, monster: step.monster || null, map: step.map || null, notes: step.notes || null }));
    const first = steps[0];
    const received = quest?.startItems?.map(item => item.name).filter(Boolean) ?? [];
    if (received.length && first?.npc && quest?.giver && normalize(first.npc) === normalize(quest.giver)
      && /\b(?:talk|speak|meet|visit)\b/i.test(first.title)
      && !received.some(item => normalize(first.title).includes(normalize(item)))) {
      first.title += ` (receive ${received.join(' and ')})`;
    }
    const missing = (quest?.needs ?? []).filter(need => !steps.some(step => stepCoversNeed(step, need)));
    if (!missing.length) return steps;
    const turnIn = quest?.turnIn || quest?.giver;
    const last = steps.at(-1);
    const finalTalk = steps.length > 1 && turnIn && last?.npc && normalize(last.npc) === normalize(turnIn) && /hand|turn|return|deliver|talk|speak|finish/i.test(last.title);
    let number = Math.max(...steps.map(step => Number(step.number) || 0));
    steps.splice(finalTalk ? steps.length - 1 : steps.length, 0, ...missing.map(need => needStep(need, ++number, quest)));
    if (turnIn && !finalTalk) steps.push({ number: ++number, title: `Hand it in to ${turnIn}`, npc: turnIn, handIn: true });
    return steps;
  }
  if (!quest) return [];
  const steps = [];
  if (quest.giver) {
    const received = quest.startItems?.map(item => item.name).filter(Boolean).join(' and ');
    steps.push({ title: `Talk to ${quest.giver} to start${received ? ` (receive ${received})` : ''}`, npc: quest.giver, accept: true });
  }
  if (quest.startAction) steps.push({ title: quest.startAction });
  for (const need of quest.needs ?? []) steps.push(needStep(need, null, quest));
  // Where a talk-only quest actually happens (quest.places, from questPlaces), with its clue.
  // A clue only matters further along a trail (the opening quest just quotes the log).
  const clue = quest.needs?.length || !quest.prerequisites?.length ? null : questClue(quest);
  for (const place of quest.places ?? []) steps.push({ title: `Go to ${place.name}`, map: place.name, mapId: place.id, visit: true, notes: place.sentence || (clue ? `Clue: "${clue}"` : null) });
  if (!quest.places?.length && clue) steps.push({ title: `Follow the clue: "${clue}"`, notes: 'The game data does not say where; check the quest window in game.' });
  // A talk-only quest whose text gives the errands ("Deliver a pouch to the child in the dark tunnel, the
  // child on the open field and the child up on the high ground"): one tickable step each.
  if (!quest.places?.length && !clue) for (const task of questTasks(quest)) steps.push({ title: task, notes: 'The game data does not say where; check the quest window in game.' });
  const turnIn = quest.turnIn || quest.giver;
  if (turnIn) steps.push({ title: `Hand it in to ${turnIn}${quest.turnInGuessed && quest.turnIn ? ' (best guess)' : ''}`, npc: turnIn, handIn: true });
  return steps.map((step, i) => ({ npc: null, monster: null, map: null, ...step, number: i + 1 }));
}

// The first step not done. A first "talk to the giver" step counts as done once the quest has been
// accepted (it shows in the Quest Helper / active quests).
export function currentStep(steps, done = [], { accepted = false, giver = null, completedNeeds = [] } = {}) {
  const doneSet = new Set(done);
  const ready = new Set([...completedNeeds, ...done.filter(value => typeof value === 'string' && value.startsWith('need:')).map(value => value.slice(5))].map(normalize));
  for (const step of steps) if ((step.item || step.monster) && ready.has(normalize(step.item || step.monster))) doneSet.add(step.number);
  const first = steps[0];
  if (accepted && first && (first.accept || (first.npc && giver && normalize(first.npc) === normalize(giver) && /talk|meet|speak|visit/i.test(first.title)))) doneSet.add(first.number);
  return { step: steps.find(step => !doneSet.has(step.number)) ?? null, done: doneSet };
}
