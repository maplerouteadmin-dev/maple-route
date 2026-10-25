import { completeQuestNeeds, itemKey } from './questneeds.js';
import { buildSteps, stepCoversNeed } from './queststeps.js';
import { wikiQuestMatches } from './questidentity.js';

// Report differences between the game-file objectives and the community wiki.
// A wiki step that does not name an objective is a review candidate, not proof
// that the guide is wrong (some steps describe several objectives together).
export function auditQuestCatalog(quests, requiredRows, stepRows) {
  const matching = title => quests.filter(quest => wikiQuestMatches(quest, title));
  const itemsByQuest = new Map(), stepsByQuest = new Map();
  for (const row of requiredRows) {
    for (const quest of matching(row.quest)) {
      const key = `${quest.id ?? quest.name}|${quest.job ?? ''}`;
      if (!itemsByQuest.has(key)) itemsByQuest.set(key, []);
      itemsByQuest.get(key).push({ name: row.item, quantity: row.quantity });
    }
  }
  for (const row of stepRows) {
    for (const quest of matching(row.quest)) {
      const key = `${quest.id ?? quest.name}|${quest.job ?? ''}`;
      if (!stepsByQuest.has(key)) stepsByQuest.set(key, []);
      stepsByQuest.get(key).push(row);
    }
  }
  const rows = [];
  for (const quest of quests) {
    const key = `${quest.id ?? quest.name}|${quest.job ?? ''}`, wikiItems = itemsByQuest.get(key) ?? [], wikiSteps = stepsByQuest.get(key) ?? [];
    const gameNeeds = quest.needs ?? [], needs = completeQuestNeeds(quest, wikiItems);
    const missingFromGame = wikiItems.filter(item => !gameNeeds.some(need => itemKey(need.name) === itemKey(item.name))).map(item => item.name);
    const unnamedInSteps = wikiSteps.length ? needs.filter(need => !wikiSteps.some(step => stepCoversNeed(step, need))).map(need => need.name) : [];
    const reconciled = buildSteps({ ...quest, needs }, wikiSteps);
    const uncoveredAfterReconcile = needs.filter(need => !reconciled.some(step => stepCoversNeed(step, need))).map(need => need.name);
    if (missingFromGame.length || unnamedInSteps.length || (needs.length && !wikiSteps.length) || uncoveredAfterReconcile.length) rows.push({ quest: quest.name, missingFromGame, unnamedInSteps, noWikiSteps: Boolean(needs.length && !wikiSteps.length), uncoveredAfterReconcile });
  }
  return {
    quests: quests.length,
    wikiRequiredRows: requiredRows.length,
    wikiStepRows: stepRows.length,
    unmatchedWikiItemQuests: [...new Set(requiredRows.map(row => row.quest))].filter(title => !matching(title).length),
    missingFromGameQuests: rows.filter(row => row.missingFromGame.length).length,
    unnamedInStepsQuests: rows.filter(row => row.unnamedInSteps.length).length,
    noWikiStepsQuests: rows.filter(row => row.noWikiSteps).length,
    uncoveredAfterReconcileQuests: rows.filter(row => row.uncoveredAfterReconcile.length).length,
    rows
  };
}
