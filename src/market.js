// Player marketplace: listings to buy or sell an item for mesos, with the item's real stats and
// upgrade slots (what decides an equip's value in Classic), and the seller's character name so a
// buyer can /find or whisper them in game. Pure: catalog shaping, listing checks, stat comparison,
// search. Storage is src/marketstore.js.
import { normalize } from './core.js';

export const OSMS_ITEMS = 'https://osmsdataexplorer.com/data/current/items.json';
export const LISTING_DAYS = 7;

// Equipment stats as the game files name them (OSMS items.json `stats`), in the order shown in game.
export const STATS = [
  ['incSTR', 'STR'], ['incDEX', 'DEX'], ['incINT', 'INT'], ['incLUK', 'LUK'],
  ['incMHP', 'HP'], ['incMMP', 'MP'], ['incPAD', 'Weapon Attack'], ['incMAD', 'Magic Attack'],
  ['incPDD', 'Weapon Defense'], ['incMDD', 'Magic Defense'], ['incACC', 'Accuracy'], ['incEVA', 'Avoidability'],
  ['incSpeed', 'Speed'], ['incJump', 'Jump']
];
const STAT_KEYS = new Set(STATS.map(([key]) => key));

// items.json → [{ id, name, category, type, equip, reqLevel, job, slots, base: { incSTR: 2, … } }]
export function fromOsmsItems(payload) {
  const list = [...(Array.isArray(payload?.items) ? payload.items : []), ...(Array.isArray(payload?.scrolls) ? payload.scrolls.map(s => ({ ...s, category: s.category ?? 'Scroll' })) : [])];
  return list.filter(item => item?.name && item?.id != null).map(item => {
    const stats = item.stats ?? {}, equip = item.category === 'Equipment';
    const base = {};
    for (const key of STAT_KEYS) if (Number(stats[key])) base[key] = Number(stats[key]);
    return { id: String(item.id), name: String(item.name).trim().slice(0, 160), category: String(item.category ?? ''), type: String(item.sub_category ?? ''), equip,
      reqLevel: Number(stats.reqLevel) || null, job: item.req_job_label ?? null, slots: equip ? Math.max(0, Number(stats.tuc) || 0) : null, base: equip ? base : null };
  });
}

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
  return { id: 'custom', name: clean, category: 'Custom', type: 'Custom item', equip: true, custom: true, reqLevel: null, job: null, slots: null, base: {} };
}

// Checks a new listing against the catalog item. Returns { listing } or { errors: [...] }.
export function checkListing(input, item, now = Date.now()) {
  const errors = [];
  if (!item) errors.push('Pick an item from the list.');
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
  if (errors.length) return { errors };
  return { listing: { side, item_id: item.id, item_name: item.name, price, quantity, stats, slots_left: slotsLeft, scrolled, ign, channel, note, expires_at: new Date(now + LISTING_DAYS * 86_400_000).toISOString() } };
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

// Search and filters: words in the item name, side, minimum stat totals, slots left, price cap.
export function filterListings(listings, { query = '', side = 'all', minStats = {}, minSlots = null, maxPrice = null, now = Date.now() } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  return (listings ?? []).filter(l => {
    if (l.expires_at && Date.parse(l.expires_at) <= now) return false;
    if (side !== 'all' && l.side !== side) return false;
    if (words.length && !words.every(word => normalize(l.item_name).includes(word))) return false;
    for (const [key, min] of Object.entries(minStats)) if (min && (l.stats?.[key] ?? 0) < min) return false;
    if (minSlots != null && (l.slots_left ?? -1) < minSlots) return false;
    if (maxPrice != null && l.price > maxPrice) return false;
    return true;
  });
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
  return (catalog ?? []).filter(item => words.every(word => normalize(item.name).includes(word)))
    .sort((a, b) => Number(normalize(b.name).startsWith(words[0])) - Number(normalize(a.name).startsWith(words[0])) || a.name.length - b.name.length)
    .slice(0, limit);
}
