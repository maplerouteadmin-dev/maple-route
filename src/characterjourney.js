// A conservative character-wide quest preview. It never infers that a quest was
// completed from its absence in a screen read; only confirmed progress unlocks it.
export function characterJourney(quests, { level = null, job = 'Any', finished = [], active = [], available = [] } = {}) {
  const done = new Set(finished), started = new Set(active), offered = new Set(available);
  const known = new Set(quests.map(quest => quest.name));
  const entries = quests.filter(quest => !quest.repeatable).map(quest => {
    const after = [...new Set(quest.prerequisites ?? [])].filter(name => !done.has(name));
    const unknown = after.filter(name => !known.has(name));
    const jobMismatch = Boolean(quest.job && job !== quest.job);
    let status = 'eligible';
    if (done.has(quest.name)) status = 'finished';
    else if (started.has(quest.name)) status = 'in-progress';
    else if (offered.has(quest.name)) status = 'eligible'; // The game's Available tab is stronger evidence than catalog rules.
    else if (jobMismatch) status = job === 'Any' ? 'choose-job' : 'other-job';
    else if (quest.level && !Number.isInteger(level)) status = 'confirm-level';
    else if (quest.level && level < quest.level) status = 'level';
    else if (unknown.length) status = 'unknown-prerequisite';
    else if (after.length && !offered.has(quest.name)) status = 'prerequisite';
    return { quest, status, after, gameConfirmed: offered.has(quest.name) };
  });
  const rank = { 'in-progress': 0, eligible: 1, prerequisite: 2, level: 3, 'confirm-level': 4, 'unknown-prerequisite': 5, 'choose-job': 6, 'other-job': 7, finished: 8 };
  entries.sort((a, b) => rank[a.status] - rank[b.status] || (a.quest.level ?? 1) - (b.quest.level ?? 1) || (a.quest.arcOrder ?? 0) - (b.quest.arcOrder ?? 0) || a.quest.name.localeCompare(b.quest.name));
  return entries;
}

// The level-20 path is a view of the live quest catalog, not a bundled quest list.
// A band is an invitation to inspect candidates, never proof the game offers them.
export function level20Journey(entries) {
  const bands = [[1, 9], [10, 14], [15, 19], [20, 20]];
  return bands.map(([min, max]) => ({
    min, max,
    entries: entries.filter(({ quest, status }) => status !== 'finished' && status !== 'other-job' && Number.isInteger(quest.level) && quest.level >= min && quest.level <= max)
  }));
}
