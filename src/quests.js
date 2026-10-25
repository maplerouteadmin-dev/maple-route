import { normalize, shortestRoute } from './core.js';

const API = 'https://mapleclassic.wiki/api.php';
const text = value => String(value ?? '').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&amp;/g, '&').trim();

function query(tables, fields, where = '', limit = 500) {
  const params = new URLSearchParams({ action: 'cargoquery', tables, fields, limit: String(limit), format: 'json', origin: '*' });
  if (where) params.set('where', where);
  return `${API}?${params}`;
}

async function rows(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('The community quest guide is unavailable right now.');
  const payload = await response.json();
  if (!Array.isArray(payload?.cargoquery)) throw new Error('The community quest guide changed format.');
  return payload.cargoquery.map(row => row.title ?? {});
}

// Quest list from the Classic game files (OSMS Data Explorer, "Public Release"): every quest that
// exists, its quest line (`parent`, the name the in-game quest window shows) and order, level,
// earlier quests it needs, and what to hunt/collect. The wiki only adds hand-in NPCs and step
// guides where it has them.
export const OSMS_QUESTS = 'https://osmsdataexplorer.com/data/current/quests.json';
const JOB_REGIONS = new Set(['Warrior', 'Magician', 'Bowman', 'Thief']);

export function fromOsmsQuests(payload, wikiRows = []) {
  const list = Array.isArray(payload?.quests) ? payload.quests : [];
  const byId = new Map(list.map(q => [String(q.id), q]));
  const order = new Map();
  for (const chain of payload?.chains ?? []) chain.quest_ids?.forEach((id, index) => order.set(String(id), { parent: chain.parent, index, ids: chain.quest_ids.map(String) }));
  const wiki = new Map(wikiRows.map(row => [normalize(row.name), row]));
  const quests = list.filter(q => q?.name).map(q => {
    const id = String(q.id), chain = order.get(id), extra = wiki.get(normalize(q.name));
    const prerequisites = new Set();
    for (const match of String(q.requirements ?? '').matchAll(/Complete:\s*(.+?)\s*\(#0*(\d+)\)/g)) prerequisites.add(byId.get(String(Number(match[2])))?.name ?? byId.get(match[2])?.name ?? match[1]);
    if (chain && chain.index > 0) { const before = byId.get(chain.ids[chain.index - 1]); if (before) prerequisites.add(before.name); }
    return {
      id, name: String(q.name).trim(), giver: q.npc_name || extra?.giver || '', turnIn: extra?.turnIn || '', start: extra?.start || q.region || '',
      level: Number.isFinite(q.level_min) ? q.level_min : null, job: JOB_REGIONS.has(q.region) ? q.region : '', region: q.region ?? null,
      arc: q.parent || null, arcOrder: chain?.index ?? 0, prerequisites: [...prerequisites],
      type: q.region === 'Event' ? 'Event' : q.region === 'Citizenship' ? 'Citizenship' : q.region === 'Crafting' ? 'Crafting' : 'Normal',
      repeatable: Boolean(q.is_repeatable || q.is_daily || q.is_weekly), needs: (q.requirements_list ?? []).filter(r => r.type === 'mob' || r.type === 'item').map(r => ({ type: r.type, name: r.name, count: r.count })),
      text: String(q.description ?? '').slice(0, 1200),
      doneText: String(q.description ?? '').split('\n').map(line => line.trim()).filter(Boolean).pop() ?? '',
      rewards: { exp: q.rewards_exp ?? null, mesos: q.rewards_money ?? null, items: q.rewards_items ?? '' },
      rotation: q.rotation?.group ? String(q.rotation.group) : null,
      grade: (q.requirements_list ?? []).find(r => r.type === 'citizenship')?.grade ?? null
    };
  });
  return collapseRotations(quests);
}

// Weekly rotations ("Donating to Kerning City": 18 versions, one picked each week, all with the same
// name) become one quest whose `variants` hold each version's needs. Its `needs` stay empty until the
// week's version is known (Quest Helper line, the player's pick or other players' reports: questnotes.js).
export function collapseRotations(quests) {
  const out = [], groups = new Map();
  for (const q of quests) {
    if (!q.rotation) { out.push(q); continue; }
    const key = `${q.rotation}|${q.name}`;
    if (!groups.has(key)) { const first = { ...q, needs: [], variants: [] }; groups.set(key, first); out.push(first); }
    groups.get(key).variants.push({ id: q.id, needs: q.needs, grade: q.grade, level: q.level });
  }
  for (const q of groups.values()) q.level = Math.min(...q.variants.map(v => v.level ?? Infinity)) === Infinity ? q.level : Math.min(...q.variants.map(v => v.level ?? Infinity));
  return out;
}

async function fetchWikiQuestRows() {
  const result = await rows(query('quests', 'name_en,giver,turn_in,start_point'));
  return result.map(row => ({ name: text(row['name en']), giver: text(row.giver), turnIn: text(row['turn in']), start: text(row['start point']) })).filter(row => row.name);
}

export async function fetchQuestCatalog() {
  const [game, wiki] = await Promise.all([
    fetch(OSMS_QUESTS, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('The quest list is unavailable right now.'); return r.json(); }),
    fetchWikiQuestRows().catch(() => [])
  ]);
  const quests = fromOsmsQuests(game, wiki);
  if (!quests.length) throw new Error('The quest list changed format.');
  return quests;
}

export async function fetchQuestSteps(questName) {
  if (typeof questName !== 'string' || !questName.trim() || questName.length > 180) throw new Error('Choose a valid quest.');
  const safeName = questName.replaceAll("'", "''");
  const result = await rows(query('quest_steps', 'quest_id,step_number,title,target_npc,destination_map,target_monster,notes', `quest_id='${safeName}'`, 100));
  return result.map(row => ({ number: Number(row['step number']) || 0, title: text(row.title), npc: text(row['target npc']), map: text(row['destination map']), monster: text(row['target monster']), notes: text(row.notes) }))
    .filter(step => step.title).sort((a, b) => a.number - b.number);
}

export async function fetchQuestItems(questName) {
  if (typeof questName !== 'string' || !questName.trim() || questName.length > 180) throw new Error('Choose a valid quest.');
  const safeName = questName.replaceAll("'", "''");
  const result = await rows(query('quest_required_items', 'quest_id,item_id,quantity', `quest_id='${safeName}'`, 100));
  return result.map(row => ({ name: text(row['item id']), quantity: Number(row.quantity) || 1 })).filter(item => item.name);
}

export function questStepMaps(data, step, currentMapId = null, limit = 6) {
  if (!step) return [];
  const matchingTargets = data.targets.filter(target =>
    (step.npc && target.kind === 'npc' && normalize(target.name) === normalize(step.npc)) ||
    (step.monster && target.kind === 'mob' && normalize(target.name) === normalize(step.monster))
  );
  const ids = new Set();
  if (step.map) for (const map of data.maps) if (normalize(map.name) === normalize(step.map) || map.aliases?.some(alias => normalize(alias) === normalize(step.map))) ids.add(map.id);
  if (!ids.size) for (const target of matchingTargets) for (const location of target.locations) ids.add(location.mapId);
  return [...ids].map(id => {
    const map = data.maps.find(candidate => candidate.id === id);
    if (!map) return null;
    const route = currentMapId ? shortestRoute(data, currentMapId, id) : null;
    const spawns = matchingTargets.flatMap(target => target.locations).filter(location => location.mapId === id).reduce((sum, location) => sum + (location.count ?? 0), 0);
    return { map, hops: route?.length ?? null, spawns };
  }).filter(Boolean).sort((a, b) => b.spawns - a.spawns || (a.hops === null) - (b.hops === null) || (a.hops ?? 0) - (b.hops ?? 0) || a.map.name.localeCompare(b.map.name)).slice(0, limit);
}

export function questUrl(name) { return `https://mapleclassic.wiki/wiki/${encodeURIComponent(name.replaceAll(' ', '_')).replaceAll("'", '%27')}`; }
