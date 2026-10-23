import { normalize } from './core.js';

// The steps of one quest for the Live card checklist: the wiki's step list when it has one, else
// built from the game data (talk to the giver, each hunt/collect target, hand in). Pure.
export function buildSteps(quest, wikiSteps = []) {
  if (wikiSteps?.length) return wikiSteps.map((step, i) => ({ number: step.number || i + 1, title: step.title, npc: step.npc || null, monster: step.monster || null, map: step.map || null, notes: step.notes || null }));
  if (!quest) return [];
  const steps = [];
  if (quest.giver) steps.push({ title: `Talk to ${quest.giver} to start`, npc: quest.giver, accept: true });
  for (const need of quest.needs ?? []) steps.push(need.type === 'mob'
    ? { title: `Defeat ${need.count} ${need.name}`, monster: need.name, count: need.count }
    : { title: `Collect ${need.count} ${need.name}`, item: need.name, count: need.count });
  const turnIn = quest.turnIn || quest.giver;
  if (turnIn) steps.push({ title: `Hand it in to ${turnIn}${quest.turnInGuessed && quest.turnIn ? ' (best guess)' : ''}`, npc: turnIn, handIn: true });
  return steps.map((step, i) => ({ number: i + 1, npc: null, monster: null, map: null, ...step }));
}

// The first step not done. A first "talk to the giver" step counts as done once the quest has been
// accepted (it shows in the Quest Helper / active quests).
export function currentStep(steps, done = [], { accepted = false, giver = null } = {}) {
  const doneSet = new Set(done);
  const first = steps[0];
  if (accepted && first && (first.accept || (first.npc && giver && normalize(first.npc) === normalize(giver) && /talk|meet|speak|visit/i.test(first.title)))) doneSet.add(first.number);
  return { step: steps.find(step => !doneSet.has(step.number)) ?? null, done: doneSet };
}
