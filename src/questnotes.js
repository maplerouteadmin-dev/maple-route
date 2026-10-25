// What players tell us about quests the game data leaves open, shared so everyone's plans get better:
//   week   — this week's version of a rotating quest ("Donating to Kerning City" wants Firewood ×30)
//   need   — an item or monster a quest needs, with the count, when the game data lists none
//   drop   — a monster that drops an item no source knows about
//   given  — the NPC who hands over an item nobody drops
//   turnin — the NPC a quest is handed in to (when ours is only a guess from the quest text)
// Names are checked against the game data before they are saved or used. Your own notes count at once;
// other players' count once two of them agree (a week pick needs one: it must be one of the quest's
// known versions anyway). Pure; the app saves and loads rows through the market store.
import { normalize } from './core.js';

export const NOTE_KINDS = ['week', 'need', 'drop', 'given', 'turnin'];
const key = text => normalize(text ?? '');
const NAME = /^[A-Za-z0-9][A-Za-z0-9 '’:.,()&!?-]{1,59}$/;

// ISO week in UTC ("2026-W43"): a week pick is only good for the week it was made.
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - start) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

// The items a rotating quest can ask for this week.
export const variantItems = quest => [...new Set((quest?.variants ?? []).flatMap(v => v.needs.map(n => n.name)))];

// → { note } cleaned up, or { error } in plain words. `game` = { quests, mobs: [names], npcs: [names] }.
export function checkNote(raw, { quests = [], mobs = [], npcs = [] } = {}, now = new Date()) {
  const kind = String(raw?.kind ?? '');
  if (!NOTE_KINDS.includes(kind)) return { error: 'Choose what you are telling us.' };
  const find = (list, name) => list.find(x => key(x) === key(name));
  const quest = ['week', 'need', 'turnin'].includes(kind) ? quests.find(q => key(q.name) === key(raw.quest)) : null;
  if (['week', 'need', 'turnin'].includes(kind) && !quest) return { error: 'Pick the quest from the list.' };
  const item = String(raw.item ?? '').trim().replace(/\s+/g, ' ');
  if (kind === 'week') {
    const name = find(variantItems(quest), item);
    if (!quest.variants?.length) return { error: 'That quest is the same every week.' };
    if (!name) return { error: `${quest.name} asks for one of: ${variantItems(quest).join(', ')}.` };
    return { note: { kind, quest: quest.name, item: name, value: '', count: quest.variants.find(v => v.needs.some(n => n.name === name)).needs.find(n => n.name === name).count ?? null, week: weekKey(now) } };
  }
  if (kind === 'turnin') {
    const npc = find(npcs, raw.value);
    return npc ? { note: { kind, quest: quest.name, item: '', value: npc, count: null, week: null } } : { error: 'Pick the NPC from the list.' };
  }
  if (!NAME.test(item) || /https?:|www\./i.test(item)) return { error: 'Type the item or monster name as the game shows it.' };
  if (kind === 'need') {
    const count = Math.floor(Number(raw.count));
    if (!(count >= 1 && count <= 999)) return { error: 'How many does the quest ask for (1–999)?' };
    if (quest.variants?.length) return { error: 'That quest changes every week: tell us this week\'s item instead.' };
    if (quest.needs?.some(n => key(n.name) === key(item) && n.count)) return { error: 'We already know that one from the game data.' };
    return { note: { kind, quest: quest.name, item: find(mobs, item) ?? item, value: '', count, week: null } };
  }
  if (kind === 'drop') {
    const mob = find(mobs, raw.value);
    return mob ? { note: { kind, quest: '', item, value: mob, count: null, week: null } } : { error: 'Pick the monster from the list.' };
  }
  const npc = find(npcs, raw.value);
  return npc ? { note: { kind, quest: '', item, value: npc, count: null, week: null } } : { error: 'Pick the NPC from the list.' };
}

// Rows from everyone → what the planner may use. `me` = this browser's player id.
export function mergeNotes(rows, me = null, now = new Date(), agree = 2) {
  const week = weekKey(now), groups = new Map();
  for (const r of rows ?? []) {
    if (!NOTE_KINDS.includes(r?.kind) || (r.kind === 'week' && r.week !== week)) continue;
    const id = [r.kind, key(r.quest), key(r.item), key(r.value), r.kind === 'need' ? r.count : ''].join('|');
    const g = groups.get(id) ?? { ...r, owners: new Set() };
    g.owners.add(r.owner ?? 'me'); groups.set(id, g);
  }
  const out = { weekly: {}, needs: {}, drops: {}, given: {}, turnIn: {}, waiting: 0 };
  const better = (a, b) => !b || (a.mine && !b.mine) || (a.mine === b.mine && a.players > b.players);
  for (const g of groups.values()) {
    const mine = Boolean(me && g.owners.has(me)), players = g.owners.size, entry = { mine, players };
    if (!mine && players < (g.kind === 'week' ? 1 : agree)) { out.waiting++; continue; }
    if (g.kind === 'week') { const e = { ...entry, item: g.item, count: g.count }; if (better(e, out.weekly[g.quest])) out.weekly[g.quest] = e; }
    if (g.kind === 'need') {
      const list = out.needs[g.quest] ??= [], same = list.find(n => key(n.name) === key(g.item)), e = { ...entry, name: g.item, count: g.count };
      if (!same) list.push(e); else if (better(e, same)) Object.assign(same, e);
    }
    if (g.kind === 'drop') { const list = out.drops[key(g.item)] ??= []; list.push({ ...entry, name: g.value }); list.sort((a, b) => b.mine - a.mine || b.players - a.players); }
    if (g.kind === 'given') { const e = { ...entry, npc: g.value }; if (better(e, out.given[key(g.item)])) out.given[key(g.item)] = e; }
    if (g.kind === 'turnin') { const e = { ...entry, npc: g.value }; if (better(e, out.turnIn[g.quest])) out.turnIn[g.quest] = e; }
  }
  return out;
}

// This week's version of a rotating quest: what the Quest Helper shows first (its line is the item),
// then your own pick, then other players' reports. → { needs, item, by: 'helper'|'you'|'players'|null, players }
export function weekVersion(quest, { helperItems = [], pick = null, notes = null } = {}) {
  if (!quest?.variants?.length) return null;
  const of = item => quest.variants.find(v => v.needs.some(n => key(n.name) === key(item)));
  const seen = helperItems.map(of).find(Boolean);
  if (seen) return { needs: seen.needs, item: seen.needs[0]?.name, by: 'helper', players: 0 };
  if (pick && of(pick)) return { needs: of(pick).needs, item: of(pick).needs[0]?.name, by: 'you', players: 0 };
  const said = notes?.weekly?.[quest.name];
  if (said && of(said.item)) return { needs: of(said.item).needs, item: of(said.item).needs[0]?.name, by: said.mine ? 'you' : 'players', players: said.players };
  return { needs: [], item: null, by: null, players: 0 };
}

// Fill the gaps in the quest catalog (in place): needs for quests the game data lists none for, missing
// counts, and hand-in NPCs we only guessed. Game data always wins over notes.
export function applyNotes(quests, notes) {
  for (const q of quests ?? []) {
    if (q.variants?.length) continue;
    const said = notes?.needs?.[q.name] ?? [];
    if (q.playerNeeds) { q.needs = q.needs.filter(n => !n.fromPlayers); delete q.playerNeeds; }
    for (const n of q.needs ?? []) if (!n.count) { const s = said.find(x => key(x.name) === key(n.name)); if (s) { n.count = s.count; n.countFromPlayers = s.players; } }
    if (!q.needs?.length && said.length) { q.needs = said.map(s => ({ type: 'item', name: s.name, count: s.count, fromPlayers: s.mine ? 'you' : s.players })); q.playerNeeds = true; }
    const hand = notes?.turnIn?.[q.name];
    if (hand && (q.turnInGuessed || !q.turnIn)) { q.turnIn = hand.npc; q.turnInGuessed = false; q.turnInBy = hand.mine ? 'you' : hand.players; }
  }
  return quests;
}

// Item → monsters for the planner: the wiki's drops, with players' drops where the wiki has none.
// `needNames` = the item names as the quests spell them (the planner looks items up by those).
export function notedSources(itemSources, notes, needNames = []) {
  const out = { ...itemSources };
  for (const name of new Set([...Object.keys(itemSources ?? {}), ...needNames])) {
    const drops = notes?.drops?.[key(name)];
    if (drops?.length && !out[name]?.length) out[name] = drops.map(d => d.name);
  }
  return out;
}

// Who said so, for labels: "you", "3 players".
export const saidBy = by => by === 'you' ? 'you said' : typeof by === 'number' ? `${by} player${by === 1 ? '' : 's'} said` : '';
