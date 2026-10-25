export const PROFILE_KEY = 'maple-route-profile-v1';

const fields = [
  'current', 'destination', 'routeStyle', 'targetId', 'crop', 'goals',
  'level', 'job', 'focus', 'guideMode', 'selectedItemName', 'gearOwned',
  'partyDone', 'sessions', 'selectedQuest', 'questDone', 'activeQuests', 'acceptedQuests',
  'questItemsReady', 'questsFinished', 'questsHidden', 'questsAvailable', 'planQuests', 'citizenship', 'planSkip', 'tripTicks', 'questPick'
];

export function snapshotProfile(state) {
  return Object.fromEntries(fields.map(key => [key, key === 'selectedItemName' ? state.selectedItem?.name ?? null : key === 'selectedQuest' ? state.selectedQuest?.name ?? null : state[key] ?? null]));
}

export function makeProfileBackup(state) {
  return { format: 'maple-route-profile', version: 1, exportedAt: new Date().toISOString(), profile: snapshotProfile(state) };
}

export function parseProfileBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.format !== 'maple-route-profile' || backup.version !== 1 || !backup.profile || typeof backup.profile !== 'object' || Array.isArray(backup.profile)) {
    throw new Error('This is not a supported Maple Route progress backup.');
  }
  const profile = backup.profile;
  if (!Array.isArray(profile.goals) || !Array.isArray(profile.sessions) || !Array.isArray(profile.activeQuests) || !Array.isArray(profile.partyDone)) {
    throw new Error('The progress backup is missing required lists.');
  }
  if (!Number.isInteger(profile.level) || profile.level < 1 || profile.level > 200) throw new Error('The backup has an invalid character level.');
  return Object.fromEntries(fields.filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]]));
}
