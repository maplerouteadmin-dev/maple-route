// One list of quests found by screen reading or added by hand. Leaving a quest
// out does not erase what the player has actually accepted in game.
export function outstandingQuests({ helperQuests = [], activeQuests = [], planQuests = [], questsAvailable = [], planSkip = [], questsFinished = [], includeAvailable = true } = {}) {
  const finished = new Set(questsFinished), skipped = new Set(planSkip), entries = new Map();
  for (const [source, names] of [['Quest Helper', helperQuests], ['In Progress', activeQuests], ['Added by hand', planQuests], ['Available', questsAvailable]]) {
    for (const name of names) {
      if (!name || finished.has(name)) continue;
      const entry = entries.get(name) ?? { name, sources: [] };
      entry.sources.push(source);
      entries.set(name, entry);
    }
  }
  return [...entries.values()].map(entry => ({
    ...entry,
    status: skipped.has(entry.name) ? 'left-out'
      : entry.sources.some(source => source !== 'Available') || includeAvailable ? 'included' : 'available-only'
  }));
}

// A manual-only choice disappears when removed. A quest read from the game stays visible
// under Left out, so the next screen read cannot silently add it back to the route.
export function removePlannedQuest({ helperQuests = [], activeQuests = [], planQuests = [], questsAvailable = [], planSkip = [] }, name) {
  const scanned = [...helperQuests, ...activeQuests, ...questsAvailable].includes(name);
  return {
    planQuests: planQuests.filter(quest => quest !== name),
    planSkip: scanned ? [...new Set([...planSkip, name])] : planSkip.filter(quest => quest !== name)
  };
}
