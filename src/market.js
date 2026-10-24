// Player marketplace: listings to buy or sell an item for mesos, with the item's real stats and
// upgrade slots (what decides an equip's value in Classic), and the seller's character name so a
// buyer can /find or whisper them in game. Pure: catalog shaping, listing checks, stat comparison,
// search. Storage is src/marketstore.js.
import { normalize, editDistance } from './core.js';

export const OSMS_ITEMS = 'https://osmsdataexplorer.com/data/current/items.json';
export const OSMS_CASH = 'https://osmsdataexplorer.com/data/current/cash_shop.json';
export const LISTING_DAYS = 7;

// Equipment stats as the game files name them (OSMS items.json `stats`), in the order shown in game.
export const STATS = [
  ['incSTR', 'STR'], ['incDEX', 'DEX'], ['incINT', 'INT'], ['incLUK', 'LUK'],
  ['incMHP', 'HP'], ['incMMP', 'MP'], ['incPAD', 'Weapon Attack'], ['incMAD', 'Magic Attack'],
  ['incPDD', 'Weapon Defense'], ['incMDD', 'Magic Defense'], ['incACC', 'Accuracy'], ['incEVA', 'Avoidability'],
  ['incSpeed', 'Speed'], ['incJump', 'Jump']
];
const STAT_KEYS = new Set(STATS.map(([key]) => key));

// Weapon kinds by the game's item id (the first four digits), since the files only say "Weapon".
export const WEAPON_KINDS = { 130: 'One-Handed Sword', 131: 'One-Handed Axe', 132: 'One-Handed Blunt Weapon', 133: 'Dagger', 137: 'Wand', 138: 'Staff',
  140: 'Two-Handed Sword', 141: 'Two-Handed Axe', 142: 'Two-Handed Blunt Weapon', 143: 'Spear', 144: 'Polearm', 145: 'Bow', 146: 'Crossbow', 147: 'Claw' };
// Category names as players say them (the files call Use items "Consumable").
export const CATEGORIES = [['Equipment', 'Equipment'], ['Consumable', 'Use'], ['Etc', 'Etc'], ['Setup', 'Setup'], ['Scroll', 'Scroll'], ['Cash', 'Cash'], ['Custom', 'Custom']];
export const JOBS = [['Warrior', 'Warrior'], ['Mage', 'Magician'], ['Bowman', 'Bowman'], ['Thief', 'Thief']];

// items.json (+ cash_shop.json) → [{ id, name, category, type, equip, reqLevel, job, slots, base, success }]
export function fromOsmsItems(payload, cashPayload = null) {
  const items = (Array.isArray(payload?.items) ? payload.items : []).filter(item => item?.name && item?.id != null).map(item => {
    const stats = item.stats ?? {}, equip = item.category === 'Equipment';
    const base = {};
    for (const key of STAT_KEYS) if (Number(stats[key])) base[key] = Number(stats[key]);
    const type = equip && item.sub_category === 'Weapon' ? WEAPON_KINDS[Math.floor(Number(item.id) / 10000)] ?? 'Weapon' : equip ? String(item.sub_category ?? '') : '';
    return { id: String(item.id), name: String(item.name).trim().slice(0, 160), category: String(item.category ?? ''), type, equip,
      reqLevel: Number(stats.reqLevel) || null, job: equip ? item.req_job_label ?? 'All' : null, slots: equip ? Math.max(0, Number(stats.tuc) || 0) : null, base: equip ? base : null, success: null,
      // The game files mark what cannot change hands: trade-blocked items, quest and party-quest items.
      tradeable: !(Number(stats.tradeBlock) || Number(stats.quest) || Number(stats.pquest)), desc: String(item.description ?? '').slice(0, 300) };
  });
  // Scrolls: what they are for (slot) and their success rate, what decides their price.
  const scrolls = (Array.isArray(payload?.scrolls) ? payload.scrolls : []).filter(s => s?.name && s?.id != null).map(s => ({
    id: String(s.id), name: String(s.name).trim().slice(0, 160), category: 'Scroll', type: String(s.equip_slot ?? ''), equip: false, reqLevel: null, job: null, slots: null, base: null,
    success: Number.isFinite(Number(s.success_rate)) ? Number(s.success_rate) : null, stat: s.stat_type ?? null, tradeable: true, desc: String(s.description ?? '').slice(0, 300) }));
  // Cash shop items (coupons, pets, cash equipment…): their shop section as the type.
  const cash = (Array.isArray(cashPayload?.categories) ? cashPayload.categories : []).flatMap(group => (group.items ?? []).filter(i => i?.name && i?.id != null).map(i => ({
    id: String(i.id), name: String(i.name).trim().slice(0, 160), category: 'Cash', type: String(group.category ?? i.category ?? ''), equip: false, reqLevel: null, job: null, slots: null, base: null, success: null, tradeable: true, unsure: true })));
  const seen = new Set();
  return [...items, ...scrolls, ...cash].filter(item => !seen.has(item.id) && seen.add(item.id));
}

// The choices for the filters, from what the catalog holds: types per category.
export function catalogFacets(catalog) {
  const types = {};
  for (const item of catalog ?? []) if (item.type) (types[item.category] ??= new Set()).add(item.type);
  return Object.fromEntries(Object.entries(types).map(([category, set]) => [category, [...set].sort()]));
}
// Whether an item suits a job: "All", or the job among "Warrior/Thief".
export const forJob = (item, job) => !job || !item?.job || item.job === 'All' || item.job.split('/').includes(job);

// Real-money trading and off-site payment are against the game's rules: such notes are refused,
// and links are not allowed at all (spam). Mesos only.
const BLOCKED = /\b(usd|eur|gbp|cad|aud|paypal|venmo|cash ?app|zelle|crypto|btc|eth|real money|irl money|\$\s?\d|\d\s?\$|dollars?)\b|https?:|www\.|discord\.gg/i;
// "1.5m", "250k", "2b", "1,200,000" → mesos (NaN when unreadable).
export function parseMesos(text) {
  const match = /^([\d.]+)\s*([kmb])?$/i.exec(String(text ?? '').replace(/[,\s]/g, '').replace(/mesos?$/i, ''));
  if (!match) return NaN;
  const value = Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase()] ?? 1);
  return Number.isFinite(value) ? Math.round(value) : NaN;
}

// Classic character names: 4–12 letters or digits.
export const validName = name => /^[A-Za-z0-9]{4,12}$/.test(String(name ?? '').trim());

// An item that is not in the game files' list (a new item, an event item, a nickname): typed by the
// seller, with optional stats and slots. Same checks as notes: no links or real-money words.
export function customItem(name) {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (clean.length < 2 || BLOCKED.test(clean)) return null;
  return { id: 'custom', name: clean, category: 'Custom', type: 'Custom item', equip: true, custom: true, reqLevel: null, job: null, slots: null, base: {}, tradeable: true, unsure: true };
}

// Checks a new listing against the catalog item. Returns { listing } or { errors: [...] }.
export function checkListing(input, item, now = Date.now()) {
  const errors = [];
  if (!item) errors.push('Pick an item from the list.');
  else if (item.tradeable === false) errors.push(`${item.name} cannot be traded in game, so it cannot be listed.`);
  const side = input?.side === 'buy' ? 'buy' : input?.side === 'sell' ? 'sell' : null;
  if (!side) errors.push('Choose selling or buying.');
  const price = parseMesos(input?.price);
  if (!Number.isFinite(price) || price < 1 || price > 10_000_000_000) errors.push('Price must be between 1 and 10,000,000,000 mesos.');
  const quantity = Math.round(Number(input?.quantity ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 9999) errors.push('Quantity must be 1–9999.');
  const ign = String(input?.ign ?? '').trim();
  if (!validName(ign)) errors.push('Your character name: 4–12 letters or numbers, as it appears in game.');
  const note = String(input?.note ?? '').trim().slice(0, 200);
  if (BLOCKED.test(note)) errors.push('Notes cannot contain links or real-money payment. Mesos only.');
  const channel = input?.channel === '' || input?.channel == null ? null : Math.round(Number(input.channel));
  if (channel !== null && (!Number.isFinite(channel) || channel < 1 || channel > 40)) errors.push('Channel must be 1–40 (or leave it empty).');
  let stats = null, slotsLeft = null, scrolled = null;
  if (item?.equip && side === 'sell') {
    stats = {};
    for (const [key, value] of Object.entries(input?.stats ?? {})) {
      if (!STAT_KEYS.has(key) || value === '' || value == null) continue;
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < -99 || n > 999) { errors.push(`${STATS.find(([k]) => k === key)[1]} looks wrong.`); continue; }
      if (n) stats[key] = n;
    }
    // A custom item has no known slot count: slots and scrolls are optional, up to 20.
    const maxSlots = item.custom ? 20 : Math.max(item.slots ?? 0, 0) + 2;
    const optional = value => item.custom && (value === '' || value == null);
    slotsLeft = optional(input?.slotsLeft) ? null : Math.round(Number(input?.slotsLeft ?? item.slots));
    if (slotsLeft !== null && (!Number.isFinite(slotsLeft) || slotsLeft < 0 || slotsLeft > maxSlots)) errors.push(`Slots left must be 0–${item.custom ? 20 : item.slots ?? 0}.`);
    scrolled = optional(input?.scrolled) ? null : Math.round(Number(input?.scrolled ?? 0));
    if (scrolled !== null && (!Number.isFinite(scrolled) || scrolled < 0 || scrolled > maxSlots)) errors.push('Successful scrolls looks wrong.');
    if (item.custom && !Object.keys(stats).length) stats = null;
  }
  // Offers (selling only): allowed unless switched off; an optional lowest offer, below the asking price.
  const offersAllowed = side === 'sell' ? input?.offersAllowed !== false : false;
  const minOffer = offersAllowed && String(input?.minOffer ?? '').trim() ? parseMesos(input.minOffer) : null;
  if (minOffer !== null && (!Number.isFinite(minOffer) || minOffer < 1 || minOffer > price)) errors.push('The lowest offer must be a price up to your asking price (or leave it empty).');
  if (errors.length) return { errors };
  return { listing: { side, item_id: item.id, item_name: item.name, price, quantity, stats, slots_left: slotsLeft, scrolled, ign, channel, note, offers_allowed: offersAllowed, min_offer: minOffer, expires_at: new Date(now + LISTING_DAYS * 86_400_000).toISOString() } };
}

// Each stat of a listed equip next to the item's clean (base) stats: { label, value, base, delta }.
export function statLines(listing, item) {
  if (!listing?.stats && !item?.base) return [];
  const keys = new Set([...Object.keys(item?.base ?? {}), ...Object.keys(listing?.stats ?? {})]);
  return STATS.filter(([key]) => keys.has(key)).map(([key, label]) => {
    const base = item?.base?.[key] ?? 0, value = listing?.stats ? (listing.stats[key] ?? 0) : base;
    return { key, label, value, base, delta: value - base };
  });
}

// One line a buyer can read at a glance: "+3 STR +2 Weapon Attack · 2 of 7 slots left".
export function equipSummary(listing, item) {
  if (!item?.equip || listing?.side !== 'sell') return '';
  const changed = statLines(listing, item).filter(line => line.delta).map(line => `${line.delta > 0 ? '+' : ''}${line.delta} ${line.label}`);
  const slots = listing.slots_left == null ? '' : item.custom ? `${listing.slots_left} slot${listing.slots_left === 1 ? '' : 's'} left` : `${listing.slots_left} of ${item.slots} slot${item.slots === 1 ? '' : 's'} left`;
  return [changed.length ? changed.join(' ') : item.custom ? '' : 'clean (base stats)', slots, listing.scrolled ? `${listing.scrolled} scroll${listing.scrolled === 1 ? '' : 's'} passed` : ''].filter(Boolean).join(' · ');
}

// An offer on someone's selling listing: a price (at least their minimum), your character name and a
// short note. Returns { offer } or { errors }.
export function checkOffer(input, listing, { me = null, now = Date.now() } = {}) {
  const errors = [];
  if (!listing || listing.side !== 'sell' || isExpired(listing, now)) errors.push('That listing is no longer open.');
  else if (listing.offers_allowed === false) errors.push('The seller is not taking offers: fixed price.');
  if (listing && me && listing.owner === me) errors.push('That is your own listing.');
  const price = parseMesos(input?.price);
  if (!Number.isFinite(price) || price < 1 || price > 10_000_000_000) errors.push('Offer a price in mesos, e.g. 1.2m or 800k.');
  else if (listing?.min_offer && price < listing.min_offer) errors.push(`The seller's lowest offer is ${listing.min_offer.toLocaleString()} mesos.`);
  const ign = String(input?.ign ?? '').trim();
  if (!validName(ign)) errors.push('Your character name: 4–12 letters or numbers, as it appears in game.');
  const note = String(input?.note ?? '').trim().slice(0, 120);
  if (BLOCKED.test(note)) errors.push('Notes cannot contain links or real-money payment. Mesos only.');
  const quantity = Math.max(1, Math.min(listing?.quantity ?? 1, Math.round(Number(input?.quantity ?? 1)) || 1));
  return errors.length ? { errors } : { offer: { listing_id: listing.id, price, quantity, ign, note } };
}

// What a listing says about offers: "Offers welcome", "Offers from 1.2m", "Fixed price".
export function offerTerms(listing) {
  if (listing?.side !== 'sell') return '';
  if (listing.offers_allowed === false) return 'Fixed price: no offers';
  return listing.min_offer ? `Offers from ${listing.min_offer.toLocaleString()} mesos` : 'Offers welcome';
}

// Days left before a listing expires (0 once it has), for "expires in 3 days".
export const daysLeft = (listing, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(listing?.expires_at) - now) / 86_400_000));
export const isExpired = (listing, now = Date.now()) => Boolean(listing?.expires_at) && Date.parse(listing.expires_at) <= now;

// The fields to post again when the owner relists an expired listing (a fresh 7 days from now).
export function relistCopy(listing, now = Date.now()) {
  const { id, owner, created_at: created, expires_at: expires, ...fields } = listing ?? {};
  return { ...fields, expires_at: new Date(now + LISTING_DAYS * 86_400_000).toISOString() };
}

// Search and filters: words in the item name, side, category and type, job, level range, minimum
// stats, slots left, scroll success rate, price cap. `itemOf(listing)` gives the catalog item.
export function filterListings(listings, { query = '', side = 'all', category = '', type = '', job = '', minLevel = null, maxLevel = null, minSuccess = null, minStats = {}, minSlots = null, maxPrice = null, itemOf = () => null, now = Date.now() } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  return (listings ?? []).filter(l => {
    const item = itemOf(l) ?? (l.item_id === 'custom' ? { category: 'Custom' } : null);
    if (category && item?.category !== category) return false;
    if (type && item?.type !== type) return false;
    if (job && !(item?.job && forJob(item, job))) return false;
    if (minLevel != null && !((item?.reqLevel ?? 0) >= minLevel)) return false;
    if (maxLevel != null && (item?.reqLevel ?? 0) > maxLevel) return false;
    if (minSuccess != null && !((item?.success ?? -1) >= minSuccess)) return false;
    if (l.expires_at && Date.parse(l.expires_at) <= now) return false;
    if (side !== 'all' && l.side !== side) return false;
    if (words.length && !words.every(word => normalize(l.item_name).includes(word))) return false;
    for (const [key, min] of Object.entries(minStats)) if (min && (l.stats?.[key] ?? 0) < min) return false;
    if (minSlots != null && (l.slots_left ?? -1) < minSlots) return false;
    if (maxPrice != null && l.price > maxPrice) return false;
    return true;
  });
}

// Orders: cheapest first, most expensive, newest, ending soonest.
export const SORTS = [['price-asc', 'Cheapest first'], ['price-desc', 'Most expensive first'], ['newest', 'Newest first'], ['ending', 'Ending soonest']];
export function sortListings(listings, sort = 'price-asc') {
  const by = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)), ending: (a, b) => String(a.expires_at).localeCompare(String(b.expires_at)) }[sort] ?? ((a, b) => a.price - b.price);
  return [...(listings ?? [])].sort(by);
}

// Lowest asking and highest offered price per item: what the market looks like right now.
export function priceBook(listings, itemId) {
  const forItem = (listings ?? []).filter(l => l.item_id === itemId);
  const sells = forItem.filter(l => l.side === 'sell').map(l => l.price), buys = forItem.filter(l => l.side === 'buy').map(l => l.price);
  return { lowestAsk: sells.length ? Math.min(...sells) : null, highestBid: buys.length ? Math.max(...buys) : null, sells: sells.length, buys: buys.length };
}

// What a buyer types in game to find the seller.
export const findCommand = ign => `/find ${String(ign ?? '').trim()}`;

// Items for the picker: name words, equipment first when equally good.
export function searchItems(catalog, query, limit = 12) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return (catalog ?? []).filter(item => item.tradeable !== false && words.every(word => normalize(item.name).includes(word)))
    .sort((a, b) => Number(normalize(b.name).startsWith(words[0])) - Number(normalize(a.name).startsWith(words[0])) || a.name.length - b.name.length)
    .slice(0, limit);
}

// Reading an item tooltip off the shared game screen (hover the item, press the button): which game
// item it is, its stats and its upgrade slots left. OCR text is noisy, so names are matched loosely
// and only lines that look like "STR : +3" count. Returns { item, stats, slotsLeft, candidates }.
const TOOLTIP_STATS = [
  ['incSTR', /\bSTR\b/], ['incDEX', /\bDEX\b/], ['incINT', /\bINT\b/], ['incLUK', /\bLUK\b/],
  ['incMHP', /\b(MAX\s*)?HP\b/], ['incMMP', /\b(MAX\s*)?MP\b/],
  ['incPAD', /WEAPON\s*(ATTACK|ATT)\b|^\s*ATT(ACK)?\b/], ['incMAD', /MAGIC\s*(ATTACK|ATT)\b/],
  ['incPDD', /WEAPON\s*(DEFENSE|DEFENCE|DEF)\b/], ['incMDD', /MAGIC\s*(DEFENSE|DEFENCE|DEF)\b/],
  ['incACC', /ACCURACY|\bACC\b/], ['incEVA', /AVOID(ABILITY)?|\bAVOID\b/], ['incSpeed', /\bSPEED\b/], ['incJump', /\bJUMP\b/]
];
export function parseTooltip(text, catalog) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const stats = {};
  let slotsLeft = null;
  for (const line of lines) {
    const upper = line.toUpperCase().replace(/[|]/g, 'I');
    const slots = /UPGRADES?\s*AVAILABLE\D{0,6}(\d{1,2})/.exec(upper);
    if (slots) { slotsLeft = Number(slots[1]); continue; }
    if (/REQ|ATTACK SPEED|CATEGORY|SUCCESS/.test(upper)) continue;
    const value = /[:;]\s*([+-]?\s*\d{1,4})\s*$/.exec(upper);
    if (!value) continue;
    const hit = TOOLTIP_STATS.find(([, pattern]) => pattern.test(upper.split(/[:;]/)[0]));
    if (hit && !(hit[0] in stats)) stats[hit[0]] = Number(value[1].replace(/\s/g, ''));
  }
  // The item. Tooltip names read badly (coloured, bold) but descriptions read well, so: the item whose
  // description's words (and numbers: "Restores 250 HP") are on screen, with its name words breaking
  // ties (8 throwing stars share one description); else a long-enough name matching a whole line.
  // Chat adverts on screen ("S> …", "… PMO", "280K each") are ignored.
  const kept = lines.filter(line => !/(^|\s)[SB]\s*>|\bPMO\b|\beach\b|\bfor sale\b|\bW>|\bWTB\b|\bWTS\b/i.test(line));
  const words = new Set(normalize(kept.join(' ')).split(' ').filter(word => word.length >= 3));
  const numbers = new Set(kept.join(' ').match(/\d+/g) ?? []);
  const wordsOf = text => [...new Set(normalize(text).split(' ').filter(word => word.length >= 4 && !/^\d+$/.test(word)))];
  const scored = [];
  for (const item of catalog ?? []) {
    if (item.tradeable === false) continue;
    const nameHits = wordsOf(item.name).filter(word => words.has(word)).length;
    const descWords = item.desc ? wordsOf(item.desc) : [];
    if (descWords.length >= 3) {
      const share = descWords.filter(word => words.has(word)).length / descWords.length;
      if (share >= .75) {
        const needed = item.desc.match(/\d+/g) ?? [];
        const numberFit = needed.length ? (needed.every(n => numbers.has(n)) ? .2 : -.4) : 0;
        scored.push({ item, score: share + numberFit + nameHits * .15 + descWords.length * .005 });
      }
    }
  }
  for (const [index, line] of kept.entries()) {
    const seen = normalize(line);
    if (seen.length < 4) continue;
    for (const item of catalog ?? []) {
      if (item.tradeable === false) continue;
      const name = normalize(item.name);
      if (name.length < 6 && seen !== name) continue; // short names ("Meat") only when a line is exactly that
      if (Math.abs(name.length - seen.length) > Math.max(3, name.length * .3)) continue;
      const score = 1 - editDistance(seen, name) / Math.max(seen.length, name.length);
      if (score >= .8) scored.push({ item, score: score - index * .002 });
    }
  }
  const best = [...new Map(scored.sort((a, b) => b.score - a.score).map(c => [c.item.id, c])).values()].slice(0, 5);
  const item = best[0]?.item ?? null;
  return { item, stats: item?.equip ? stats : {}, slotsLeft: item?.equip ? slotsLeft : null, candidates: best.map(c => c.item) };
}

