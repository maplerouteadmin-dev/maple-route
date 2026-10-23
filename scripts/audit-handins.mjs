// Audits quests whose hand-in NPC no source lists: the guess (guessTurnIn) vs the wiki's last step NPC and the NPCs named in the quest text.
// Usage: npm run audit:handins [out.json]
import { fromOsmsQuests } from '../src/quests.js';
import { guessTurnIn } from '../src/questrecs.js';
import { normalize } from '../src/core.js';
import { writeFileSync } from 'node:fs';

const get = async url => (await fetch(url)).json();
const quests = await get('https://osmsdataexplorer.com/data/current/quests.json');
const maps = await get('https://osmsdataexplorer.com/data/current/maps.json');
const npcNames = [...new Set(Object.values(maps.npc_lookup ?? {}).map(n => n?.name).filter(Boolean))];
const text = v => String(v ?? '').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
const wikiRows = async (table, fields) => {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const u = new URL('https://mapleclassic.wiki/api.php');
    Object.entries({ action: 'cargoquery', tables: table, fields, limit: '500', offset: String(offset), format: 'json' }).forEach(([k, v]) => u.searchParams.set(k, v));
    const page = (await get(u)).cargoquery?.map(r => r.title) ?? [];
    out.push(...page); if (page.length < 500) break;
  }
  return out;
};
const wikiQuests = await wikiRows('quests', 'name_en,giver,turn_in');
const steps = await wikiRows('quest_steps', 'quest_id,step_number,title,target_npc');
const lastStepNpc = new Map();
for (const s of steps) { const q = normalize(text(s['quest id'])), n = Number(s['step number']) || 0; if (!text(s['target npc'])) continue; const cur = lastStepNpc.get(q); if (!cur || n >= cur.n) lastStepNpc.set(q, { n, npc: text(s['target npc']), title: text(s.title) }); }
const catalog = fromOsmsQuests(quests, wikiQuests.map(r => ({ name: text(r['name en']), giver: text(r.giver), turnIn: text(r['turn in']) })));
const raw = new Map(quests.quests.map(q => [String(q.name).trim(), q]));
const rows = [];
for (const q of catalog) {
  if (q.turnIn) continue; // the wiki lists a hand-in NPC
  const guess = guessTurnIn(q.doneText, npcNames, q.giver);
  const step = lastStepNpc.get(normalize(q.name));
  const description = String(raw.get(q.name)?.description ?? '');
  const mentioned = npcNames.filter(n => n.length >= 3 && ` ${normalize(description)} `.includes(` ${normalize(n)} `));
  let verdict;
  if (step) verdict = normalize(step.npc) === normalize(guess) ? 'confirmed by wiki step' : 'CONFLICT with wiki step';
  else if (normalize(guess) === normalize(q.giver) && !mentioned.some(n => normalize(n) !== normalize(q.giver))) verdict = 'likely (only the giver is mentioned)';
  else if (normalize(guess) === normalize(q.giver)) verdict = 'CHECK (giver assumed, other NPCs mentioned)';
  else verdict = 'from quest text (unverified)';
  rows.push({ quest: q.name, line: q.arc, region: q.region, level: q.level, giver: q.giver, guess, wiki: step?.npc ?? '', wikiStep: step?.title ?? '', mentioned: mentioned.join(', '), doneText: q.doneText, verdict });
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
const tally = rows.reduce((a, r) => (a[r.verdict] = (a[r.verdict] ?? 0) + 1, a), {});
console.log(catalog.length + ' quests; ' + rows.length + ' without a listed hand-in'); console.log(JSON.stringify(tally, null, 1));
for (const r of rows.filter(r => /CONFLICT|CHECK/.test(r.verdict)).slice(0, 60)) console.log(`${r.verdict} | ${r.quest} | giver ${r.giver} | guess ${r.guess} | wiki ${r.wiki} | mentioned: ${r.mentioned}`);
