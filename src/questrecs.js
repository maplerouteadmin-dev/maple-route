import { normalize, shortestRoute, editDistance } from './core.js';
import { npcMapId } from './npclocations.js';

// Quest suggestions for the player's level and job, minus what they have finished or are doing,
// nearest-to-level first, then closest quest giver. Pure.

const JOBS = { warrior: /warrior|fighter|page|spearman|swords?man/i, magician: /magician|mage|wizard|cleric/i, bowman: /bowman|archer|hunter|crossbow/i, thief: /thief|rogue|assassin|bandit/i, beginner: /beginner/i };

export function jobFits(required, job) {
  if (!required || /^(any|all|none|-)?$/i.test(required.trim()) || !job || job === 'Any') return true;
  const want = JOBS[job.toLowerCase()];
  return want ? want.test(required) : true;
}

// Startable in Classic right now: in the current game version (not pre-launch), not a time-limited
// event outside its dates, not a citizenship/crafting side system, and every prerequisite finished.
export function questAvailable(quest, done, now = Date.now()) {
  if (quest.version && quest.version === 'pre-launch') return false;
  if (quest.repeatable) return false;
  if (quest.type && /citizenship|crafting/i.test(quest.type)) return false;
  // Event quests in the game data are live; dated ones (older wiki rows) only inside their dates.
  if (quest.type && /event/i.test(quest.type) && (quest.from || quest.until)) {
    const from = quest.from ? Date.parse(quest.from) : -Infinity, until = quest.until ? Date.parse(quest.until) : Infinity;
    if (!(from <= now && now <= until)) return false;
  }
  return (quest.prerequisites ?? []).every(name => done.has(normalize(name)));
}

// `available` = names read off the in-game Available tab: when known, the game's own list wins over
// the wiki's level/prerequisite rules.
export function recommendQuests(catalog, { level, job = 'Any', finished = [], active = [], hidden = [], available = [], data = null, currentMapId = null, limit = 8, below = 15, now = Date.now() } = {}) {
  const levelConfirmed = Number.isInteger(level) && level >= 1;
  const done = new Set(finished.map(normalize)), skip = new Set([...finished, ...active, ...hidden].map(normalize)), offered = new Set(available.map(normalize));
  const giverMap = name => {
    if (!data || !name) return null;
    const mapId = npcMapId(data, name, currentMapId);
    return data.maps.find(m => m.id === mapId) ?? null;
  };
  const seen = new Set();
  return catalog
    // Quests read off the in-game Available tab come first; the game-data rules still list the rest
    // (a read can miss a line).
    .filter(q => !skip.has(normalize(q.name)) && (offered.has(normalize(q.name)) || (levelConfirmed && q.level != null && q.level <= level && q.level >= level - below && (!q.maxLevel || level <= q.maxLevel) && jobFits(q.job, job) && questAvailable(q, done, now))))
    .filter(q => { const key = normalize(q.name); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(q => {
      const map = giverMap(q.giver);
      const route = map && currentMapId ? (map.id === currentMapId ? [] : shortestRoute(data, currentMapId, map.id)) : null;
      return { name: q.name, title: q.arc ?? q.name, inGame: offered.has(normalize(q.name)), level: q.level, giver: q.giver || null, map, hops: route ? route.length : null, after: q.prerequisites ?? [] };
    })
    .sort((a, b) => Number(b.inGame) - Number(a.inGame) || (level - (a.level ?? 0)) - (level - (b.level ?? 0)) || (a.hops ?? 99) - (b.hops ?? 99) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Lines read off the in-game quest window ("Completed" tab) → catalog quest names found on it.
// Each line is matched whole against every name; only confident matches count.
// `min`: how close a line must be. Inside the quest window's own list every row is a quest name (or a
// town heading), so it can be looser there (.74) than on a whole-screen read (.82).
export function questsInText(text, names, { min = .82 } = {}) {
  const byNorm = names.map(name => [normalize(name), name]).filter(([n]) => n.length >= 4);
  const found = new Set();
  for (const raw of String(text).split('\n')) {
    const line = normalize(raw);
    if (line.length < 4) continue;
    let best = null, bestScore = 0;
    for (const [n, name] of byNorm) {
      const whole = Math.abs(n.length - line.length) > Math.max(4, n.length * .3) ? 0 : 1 - editDistance(line, n) / Math.max(line.length, n.length);
      // Long names are cut short at the end ("…Fun: Match...") and the quest icon can hide the first
      // word ("World's Unique Fun: Omok"): compare a long enough line with the name's start or end.
      const part = line.length >= 12 && n.length > line.length;
      const start = part ? 1 - editDistance(line, n.slice(0, line.length)) / line.length - .04 : 0;
      const end = part ? 1 - editDistance(line, n.slice(n.length - line.length)) / line.length - .04 : 0;
      // Extra text after the name on the same line ("Winston's Fossil Dig-up  Lv. 25"): its start.
      const lead = n.length >= 10 && line.length > n.length + 2 ? 1 - editDistance(line.slice(0, n.length), n) / n.length - .04 : 0;
      const score = Math.max(whole, start, end, lead);
      if (score > bestScore || (score === bestScore && best && name.length < best.length)) { best = name; bestScore = score; }
    }
    if (bestScore >= min) { found.add(best); continue; }
    // Quest window rows only: match word by word. Icons add junk in front, the row is cut off at the
    // end, and letters get misread ("EX Cr Betty's Rezoarch an FI" = Dr. Betty's Research on Plants).
    if (min < .82) { const byWords = wordMatch(line, byNorm); if (byWords) found.add(byWords); }
  }
  return [...found];
}

// The name whose real words (3+ letters) are mostly in the line: each within a couple of misread
// letters, the line's last word may be the cut-off start of one. Needs 2+ words and two thirds of them.
function wordMatch(line, byNorm) {
  const lineWords = line.split(' ').filter(Boolean), last = lineWords.at(-1) ?? '';
  let best = null, bestShare = 0, bestHits = 0;
  for (const [n, name] of byNorm) {
    const words = n.split(' ').filter(w => w.length >= 3);
    if (words.length < 2) continue;
    const hits = words.filter(w => lineWords.some(lw => lw.length >= 3 && editDistance(lw, w) <= Math.max(1, Math.floor(w.length / 4))) || (last.length >= 2 && w.startsWith(last.slice(0, 2)) && w === words.at(-1))).length;
    const share = hits / words.length;
    if (hits >= 2 && share >= .66 && (share > bestShare || (share === bestShare && hits > bestHits))) { best = name; bestShare = share; bestHits = hits; }
  }
  return best;
}

// Everything that has to be done before a quest (earliest first, through the whole chain) and the
// quests it unlocks directly.
export function questChain(catalog, name) {
  const byName = new Map(catalog.map(q => [normalize(q.name), q]));
  const before = [], seen = new Set([normalize(name)]);
  const walk = questName => {
    for (const pre of byName.get(normalize(questName))?.prerequisites ?? []) {
      const key = normalize(pre);
      if (seen.has(key)) continue;
      seen.add(key); walk(pre); before.push(byName.get(key)?.name ?? pre);
    }
  };
  walk(name);
  const after = catalog.filter(q => (q.prerequisites ?? []).some(pre => normalize(pre) === normalize(name))).map(q => q.name);
  return { before, after: [...new Set(after)] };
}

// The in-game quest window lists quest lines by their line title ("Winston's Fossil Dig-up") and
// single quests by name. These are the names to look for on screen.
export function gameQuestNames(catalog) {
  return [...new Set(catalog.flatMap(q => [q.name, q.arc].filter(Boolean)))];
}

// Names read off the quest window -> catalog quest names. Completed tab: a finished line means
// every quest in it. Available tab: a line means its first quest not yet finished.
export function questsForGameNames(catalog, names, { tab = 'completed', finished = [] } = {}) {
  const done = new Set(finished.map(normalize)), out = new Set();
  for (const name of names) {
    const key = normalize(name);
    const line = catalog.filter(q => q.arc && normalize(q.arc) === key).sort((a, b) => (a.arcOrder ?? 0) - (b.arcOrder ?? 0));
    if (line.length) {
      if (tab === 'completed') line.forEach(q => out.add(q.name));
      else { const next = line.find(q => !done.has(normalize(q.name))); if (next) out.add(next.name); }
    } else {
      const quest = catalog.find(q => normalize(q.name) === key);
      if (quest) out.add(quest.name);
    }
  }
  return [...out];
}

// Who you hand a quest in to, when no source lists it, from the game's "done" line:
// 1. the NPC the action is aimed at ("delivered the scroll to Jaime", "informed Arwen", "met the
//    Bowman Job Instructor", "checked on Athena Pierce"), the last such one;
// 2. else the quest giver, when they are named ("the flower that Sabitrama wanted");
// 3. else the first NPC the line is about ("Dances with Balrog in Perion welcomed me", "Maria
//    looked relieved after reading the reply from Lucas"); NPCs only named after "from" never count.
export function guessTurnIn(doneText, npcNames, giver = '') {
  const text = ` ${normalize(doneText)} `, names = npcNames.filter(name => normalize(name).length >= 3);
  const at = name => text.lastIndexOf(` ${normalize(name)} `);
  const aimed = names.map(name => {
    const key = normalize(name);
    const match = [...text.matchAll(new RegExp(` (?:to|informed|told|warned|met|visited|checked on|reported to|returned to|brought it to|gave it to)(?: the)? ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'g'))].pop();
    return match ? { name, index: match.index } : null;
  }).filter(Boolean).sort((a, b) => b.index - a.index || b.name.length - a.name.length);
  if (aimed.length) return aimed[0].name;
  // An NPC named right after "from" is where something came from ("the reply from Lucas",
  // "answers from Manji"), never who you hand it to.
  const mentions = names.map(name => ({ name, index: at(name), from: text.includes(` from ${normalize(name)} `) && text.split(` ${normalize(name)} `).length - 1 === text.split(` from ${normalize(name)} `).length - 1 })).filter(n => n.index >= 0 && !n.from);
  if (giver && mentions.some(n => n.name === giver)) return giver;
  const first = mentions.sort((a, b) => a.index - b.index || b.name.length - a.name.length)[0];
  // A story line ("Maria looked relieved…", "Tamya heard…") is about the NPC it starts with.
  return first?.name ?? giver;
}

// What a quest is about, in one short line, so same-named quests can be told apart ("Test of
// Qualification · Thief · from Thief Job Instructor · Dark Marble ×30"). `sameName` = how many quests
// share its name: then the job or town comes first. Pure.
export function questGoal(quest) {
  const needs = (quest?.needs ?? []).map(n => n.type === 'mob' ? `defeat ${n.count ?? ''} ${n.name}`.replace('  ', ' ') : `${n.name}${n.count ? ` ×${n.count}` : ''}`);
  if (needs.length) return needs.slice(0, 3).join(', ') + (needs.length > 3 ? ` +${needs.length - 3} more` : '');
  if (quest?.variants?.length) return 'a different item each week';
  return quest?.turnIn && quest.turnIn !== quest.giver ? `talk to ${quest.turnIn}` : 'talk / deliver';
}
export function questDetail(quest, { sameName = 1 } = {}) {
  if (!quest) return '';
  const which = [quest.job, quest.town].filter(Boolean).join(' · ');
  const parts = [sameName > 1 && which ? which : '', quest.level ? `Lv ${quest.level}` : '', sameName <= 1 && which ? which : '', quest.giver ? `from ${quest.giver}` : '', questGoal(quest)];
  return parts.filter(Boolean).join(' · ');
}

