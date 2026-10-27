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

// The steps of one quest for the Live card checklist: the wiki's step list when it has one, else
// built from the game data (talk to the giver, each hunt/collect target, hand in). Pure.
export function buildSteps(quest, wikiSteps = []) {
  if (wikiSteps?.length) {
    const steps = wikiSteps.map((step, i) => ({ ...step, number: step.number || i + 1, npc: step.npc || null, monster: step.monster || null, map: step.map || null, notes: step.notes || null }));
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
  if (quest.giver) steps.push({ title: `Talk to ${quest.giver} to start`, npc: quest.giver, accept: true });
  for (const need of quest.needs ?? []) steps.push(needStep(need, null, quest));
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
