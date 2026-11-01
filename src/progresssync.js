import { MARKET_URL, MARKET_KEY } from './marketstore.js';

// Sync between a player's own devices (PC and Steam Deck): the quest plan and progress of the selected
// character, stored under a private sync code (supabase/progress-sync.sql). Device-only things (the
// map you are on, Live GPS, screen reading, voice) stay on each device.
export const SYNC_FIELDS = ['goals', 'level', 'journeyLevelConfirmed', 'job', 'gearOwned', 'sessions', 'questDone', 'activeQuests',
  'acceptedQuests', 'questItemsReady', 'questsFinished', 'questsHidden', 'questsAvailable', 'planQuests', 'citizenship', 'planSkip',
  'tripTicks', 'questPick', 'questNpcMaps'];
export const SYNC_LIVE_FIELDS = ['guideQuest', 'tripAll', 'tripAvailable', 'startingQuest', 'goalNpc'];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to type on a phone or Deck
// 20 characters × 5 bits = 100 bits, shown as MR-XXXX-XXXX-XXXX-XXXX-XXXX.
export function newSyncCode(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  const chars = [...random(20)].map(byte => ALPHABET[byte % 32]).join('');
  return `MR-${chars.match(/.{4}/g).join('-')}`;
}
// What the player typed -> the code, or null. Spaces, dashes and case do not matter.
export function normalizeSyncCode(text) {
  const raw = String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MR/, '');
  if (raw.length !== 20 || [...raw].some(char => !ALPHABET.includes(char))) return null;
  return `MR-${raw.match(/.{4}/g).join('-')}`;
}

// The part of the app state that travels between devices.
export function syncPayload(state, { character = '' } = {}) {
  const profile = Object.fromEntries(SYNC_FIELDS.map(key => [key, state[key] ?? null]));
  const live = { guideQuest: state.guide?.quest ?? null, tripAll: Boolean(state.tripAll), tripAvailable: state.tripAvailable !== false,
    startingQuest: state.startingQuest ?? null, goalNpc: state.goalNpc ?? null };
  return { format: 'maple-route-sync', version: 1, character: character || '', profile, live };
}
// Fields to put into the app state from a downloaded payload; null when it is not usable here.
export function readSyncPayload(payload, { character = '' } = {}) {
  if (payload?.format !== 'maple-route-sync' || payload.version !== 1 || !payload.profile || typeof payload.profile !== 'object') return null;
  if ((payload.character || '') !== (character || '')) return { otherCharacter: payload.character || 'your main profile' };
  const profile = {};
  for (const key of SYNC_FIELDS) if (Object.hasOwn(payload.profile, key) && payload.profile[key] !== undefined) profile[key] = payload.profile[key];
  if (profile.level != null && !(Number.isInteger(profile.level) && profile.level >= 1 && profile.level <= 200)) delete profile.level;
  for (const key of ['goals', 'sessions', 'activeQuests', 'acceptedQuests', 'questsFinished', 'questsHidden', 'questsAvailable', 'planQuests', 'planSkip', 'tripTicks'])
    if (key in profile && !Array.isArray(profile[key])) delete profile[key];
  const live = Object.fromEntries(SYNC_LIVE_FIELDS.filter(key => Object.hasOwn(payload.live ?? {}, key)).map(key => [key, payload.live[key]]));
  return { profile, live };
}
// A stable text of the payload, to tell whether anything changed since the last upload.
export const syncFingerprint = payload => JSON.stringify({ profile: payload.profile, live: payload.live, character: payload.character });

export function createSyncStore({ url = MARKET_URL, key = MARKET_KEY, fetchImpl = (...args) => fetch(...args) } = {}) {
  const base = url.replace(/\/+$/, '');
  async function rpc(name, body) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (response.status === 404) throw new Error('Sync is not set up on the server yet.');
    if (!response.ok) throw new Error('Could not reach the sync service. Your progress is still saved on this device.');
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }
  return {
    configured: Boolean(base && key),
    // { data, updated_at } or null when nothing is saved under this code yet.
    get: code => rpc('sync_get', { code }),
    // { data, updated_at, saved }: saved false = another device saved since `base`; its copy comes back.
    put: (code, payload, base = null) => rpc('sync_put', { code, payload, base })
  };
}
