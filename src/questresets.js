// Daily and weekly quests come back: a finished one counts as not done again after the reset.
// MapleStory resets dailies at 00:00 UTC; Classic's weekly reset day is not in the game data, so
// Monday 00:00 UTC is assumed (the usual weekly quest reset). Pure.
export function lastReset(kind, now = Date.now()) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (kind === 'daily') return midnight;
  if (kind === 'weekly') return midnight - ((d.getUTCDay() + 6) % 7) * 86_400_000; // back to Monday
  return null;
}
// Quests finished before their last reset: [names].
export function questsToReset(catalog, finished = [], finishedAt = {}, now = Date.now()) {
  const kinds = new Map(catalog.filter(q => q.resets).map(q => [q.name, q.resets]));
  return finished.filter(name => {
    const kind = kinds.get(name), at = finishedAt[name];
    return kind && Number.isFinite(at) && at < lastReset(kind, now);
  });
}
