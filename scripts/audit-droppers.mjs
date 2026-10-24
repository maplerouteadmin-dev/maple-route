// Audits where every quest's collect items come from: the wiki's drop listing (monster_drops) vs the
// monsters the game's own quest text names (huntGoals' guess), plus refined items (jewels/ingots).
// Flags items with no source, guesses that disagree with the wiki, and guesses with several monsters.
// Usage: npm run audit:droppers [out.json]
import { fromOsms } from '../src/osms.js';
import { validateDataset, normalize } from '../src/core.js';
import { fromOsmsQuests } from '../src/quests.js';
import { huntGoals, textMonsters } from '../src/objective.js';
import { fromOsmsCrafting, craftRecipe } from '../src/refine.js';
import { writeFileSync } from 'node:fs';

const get = async url => (await fetch(url)).json();
const base = 'https://osmsdataexplorer.com/data/current/';
const [mapsJson, portalsJson, monstersJson, questsJson, craftingJson] = await Promise.all(['maps', 'portals', 'monsters', 'quests', 'crafting'].map(f => get(`${base}${f}.json`)));
const crafting = fromOsmsCrafting(craftingJson);
const data = validateDataset(fromOsms(mapsJson, portalsJson, monstersJson));
const quests = fromOsmsQuests(questsJson);

// Every wiki drop row, item → monsters.
const drops = new Map();
for (let offset = 0; offset < 20000; offset += 500) {
  const u = new URL('https://mapleclassic.wiki/api.php');
  Object.entries({ action: 'cargoquery', tables: 'monster_drops', fields: 'monster_id,item_id', limit: '500', offset: String(offset), format: 'json' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const page = (await get(u)).cargoquery?.map(r => r.title) ?? [];
  for (const row of page) { const item = String(row['item id'] ?? '').trim(), mob = String(row['monster id'] ?? '').trim(); if (item && mob) drops.set(item, [...new Set([...(drops.get(item) ?? []), mob])]); }
  if (page.length < 500) break;
}

// Every ingredient down two levels (Screws for a Monkey Wrench), so their wiki droppers are known.
const ingredientsOf = (name, depth) => depth > 3 ? [] : (craftRecipe(crafting, name)?.ingredients ?? []).flatMap(i => [i.name, ...ingredientsOf(i.name, depth + 1)]);
const rows = [];
for (const q of quests) {
  const items = (q.needs ?? []).filter(n => n.type === 'item');
  if (!items.length) continue;
  const named = textMonsters(data, q.text);
  // As the app sees it: wiki droppers where listed, nothing loaded yet = [] (so the text guess runs).
  // Crafted items look up their ingredients, as the app does.
  const sources = Object.fromEntries(items.flatMap(n => [[n.name, drops.get(n.name) ?? []], ...ingredientsOf(n.name, 1).map(i => [i, drops.get(i) ?? []])]));
  const goals = huntGoals(data, items.map(n => ({ name: n.name, have: 0, need: n.count })), sources, q.text, q.needs.map(n => n.name), crafting);
  for (const goal of goals) {
    const wiki = drops.get(goal.name) ?? [];
    const guessOnly = huntGoals(data, [{ name: goal.name, have: 0, need: 1 }], { [goal.name]: [] }, q.text, q.needs.map(n => n.name))[0];
    const guess = guessOnly?.guess ? guessOnly.monsters : [];
    const status = goal.craft ? (goal.monsters.length ? 'craft' : 'craft-no-ingredient-source')
      : wiki.length ? (guess.length && !guess.some(m => wiki.includes(m)) ? 'wiki-vs-text-disagree' : 'wiki')
      : goal.given ? 'given-by-npc'
      : !goal.monsters.length ? 'no-source'
      : goal.monsters.length > 1 ? 'guess-several' : 'guess';
    rows.push({ quest: q.name, item: goal.craft ? `${goal.name} → ${goal.craft.item} (${goal.craft.discipline}, ${goal.craft.npc})` : goal.name, status, used: goal.monsters, wiki, guess, named });
  }
}
const count = {};
for (const r of rows) count[r.status] = (count[r.status] ?? 0) + 1;
console.log(count);
for (const status of (process.env.SHOW ?? 'no-source,guess-several,craft-no-ingredient-source,craft').split(',')) {
  const list = rows.filter(r => r.status === status);
  if (!list.length) continue;
  console.log(`\n== ${status} (${list.length})`);
  for (const r of list.slice(0, 60)) console.log(`${r.quest} | ${r.item} | used: ${r.used.join(', ') || '-'} | wiki: ${r.wiki.join(', ') || '-'} | text names: ${r.named.join(', ') || '-'}`);
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
