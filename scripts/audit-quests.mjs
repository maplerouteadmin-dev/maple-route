import { fromOsmsQuests, OSMS_QUESTS } from '../src/quests.js';
import { auditQuestCatalog } from '../src/questaudit.js';

const API = 'https://mapleclassic.wiki/api.php';
const decode = value => String(value ?? '').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
async function wikiRows(table, fields) {
  const all = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const url = new URL(API);
    url.search = new URLSearchParams({ action: 'cargoquery', tables: table, fields, limit: '500', offset: String(offset), format: 'json' });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.cargoquery)) throw new Error(`${table}: unexpected response`);
    const page = payload.cargoquery.map(row => row.title ?? {});
    all.push(...page);
    if (page.length < 500) return all;
  }
  throw new Error(`${table}: exceeds audit limit`);
}

const [gameResponse, questRows, itemRows, stepRows] = await Promise.all([
  fetch(OSMS_QUESTS),
  wikiRows('quests', 'name_en,giver,turn_in,start_point'),
  wikiRows('quest_required_items', 'quest_id,item_id,quantity'),
  wikiRows('quest_steps', 'quest_id,step_number,title,target_npc,destination_map,target_monster,notes')
]);
if (!gameResponse.ok) throw new Error(`OSMS quests: HTTP ${gameResponse.status}`);
const game = await gameResponse.json();
const wiki = questRows.map(row => ({ name: decode(row['name en']), giver: decode(row.giver), turnIn: decode(row['turn in']), start: decode(row['start point']) }));
const quests = fromOsmsQuests(game, wiki);
const required = itemRows.map(row => ({ quest: decode(row['quest id']), item: decode(row['item id']), quantity: Number(row.quantity) || 1 })).filter(row => row.quest && row.item);
const steps = stepRows.map(row => ({ quest: decode(row['quest id']), title: decode(row.title), npc: decode(row['target npc']), map: decode(row['destination map']), monster: decode(row['target monster']), notes: decode(row.notes) })).filter(row => row.quest && row.title);
const report = auditQuestCatalog(quests, required, steps);
const joined = fromOsmsQuests(game, wiki, required);
report.missingAfterCatalogJoinQuests = auditQuestCatalog(joined, required, steps).missingFromGameQuests;
console.log(JSON.stringify(report, null, 2));
