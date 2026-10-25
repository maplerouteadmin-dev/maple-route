import { normalize, editDistance } from './core.js';

// Trade chat → price log. Only lines that clearly name an item and a price are kept; everything is
// stored in this browser. Prices are what players *asked or offered*, not completed sales.

export function parsePrice(text) {
  const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*(b|bil|m|mil|k)\b/i) ?? String(text).match(/\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/);
  if (!m) return null;
  const value = Number(m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  const unit = (m[2] ?? '').toLowerCase();
  const price = Math.round(value * (unit.startsWith('b') ? 1e9 : unit.startsWith('m') ? 1e6 : unit === 'k' ? 1e3 : 1));
  return Number.isFinite(price) && price >= 100 && price <= 1e11 ? price : null;
}

// "S>" / "B>" (OCR may read S as 5 and > as »), or WTS/WTB/selling/buying.
const SIDE = /(?:^|[\s:;)\]])(?:([SB5])\s*[>»›]|(WTS|WTB|selling|buying)\b)/i;

// One chat line: "Name [channel badge] : [Yellow Square] S> STR11 Earring 3.5 M". OCR often drops the
// colon, so the seller is simply the first word and the side marker is searched anywhere.
export function parseTradeLine(line) {
  const text = String(line).trim().replace(/^[^\p{L}\p{N}]+/u, ''); // OCR leaves specks before the name
  const seller = text.match(/^[\p{L}\p{N}_]{2,16}/u)?.[0];
  const side = text.match(SIDE);
  if (!seller || !side) return null;
  const marker = (side[1] ?? side[2]).toUpperCase();
  const kind = marker === 'B' || marker === 'WTB' || marker === 'BUYING' ? 'buy' : 'sell';
  const brackets = [...text.matchAll(/[[|]([^\][|]{2,48})[\])]/g)].map(m => m[1].trim()).filter(t => !/square|channel|^fm$|free market|pmo|ch\s*\d/i.test(t));
  const after = text.slice(side.index + side[0].length);
  const priceText = after.match(/(\d+(?:[.,]\d+)?\s*(?:b|bil|m|mil|k)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b)/i)?.[0];
  const price = priceText ? parsePrice(priceText) : null;
  let item = brackets[0];
  if (!item && priceText) item = after.slice(0, after.indexOf(priceText)).replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!item || item.length < 3 || !/[A-Za-z]{3}/.test(item) || !price) return null;
  return { seller, kind, item: item.replace(/\s+/g, ' '), price };
}

export function parseTradeChat(text) {
  return String(text).split('\n').map(parseTradeLine).filter(Boolean);
}

// A short tag per player name; kept for logs saved while names were not stored.
export function sellerTag(name) {
  let h = 0x811c9dc5;
  for (const ch of String(name ?? '').toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 4096).toString(36);
}

// Same seller, item and price within 15 minutes is one advert repeated, not a new data point. The
// seller's name is kept so you can contact them later.
export function addTrades(log, trades, now = Date.now(), cap = 2000) {
  const list = Array.isArray(log) ? [...log] : [];
  for (const trade of trades) {
    const key = normalize(trade.item), by = sellerTag(trade.seller);
    if (list.some(row => row.key === key && (row.seller ? row.seller === trade.seller : row.by === by) && row.price === trade.price && now - row.at < 15 * 60_000)) continue;
    list.unshift({ ...trade, by, key, at: now });
  }
  return list.slice(0, cap);
}

// Trade chat writes scrolls the player way ("60% glove att", "GFA 60%", "Cape luk 60%"); Classic names
// them by tier: Lesser = 100%, Intermediate = 60%, Greater = 10%, Chaos = 10% ("Gloves Attack Scroll:
// Intermediate"). Turns the shorthand into the scroll's name, or null.
const TIER_BY_RATE = { 100: 'lesser', 60: 'intermediate', 10: 'greater' };
const SCROLL_WORDS = [
  [/\bgfa\b/g, 'gloves attack'], [/\bgfma\b|\bgfm\b/g, 'gloves magic attack'], [/\bm\s?att?k?\b|\bmagic att?k?\b/g, 'magic attack'], [/\bw?att?k?\b|\bwa\b/g, 'attack'],
  [/\bacc\b/g, 'accuracy'], [/\bdef\b/g, 'defense'], [/\bcrit\b/g, 'crit rate'], [/\bglove\b/g, 'gloves'], [/\bshoe\b/g, 'shoes'], [/\bhelm(et)?\b/g, 'hat'],
  [/\b1h\b/g, '1h'], [/\b2h\b/g, '2h'], [/\bbw\b/g, 'blunt'], [/\bspd\b/g, 'speed'], [/\bmaxhp\b/g, 'hp'], [/\bmaxmp\b/g, 'mp']
];
export function scrollNamer(names) {
  const scrolls = (names ?? []).map(name => /^(.*?)\s*Scroll:\s*(Lesser|Intermediate|Greater|Chaos)$/i.exec(name)).filter(Boolean)
    .map(([full, what, tier]) => ({ full, tier: tier.toLowerCase(), words: normalize(what).split(' ').filter(Boolean) }));
  return text => {
    let t = ` ${normalize(String(text ?? '').replace(/(\d+)\s*%/g, ' $1pct '))} `;
    const rate = /\b(100|60|10)pct\b/.exec(t)?.[1];
    const tier = /\bchaos\b/.test(t) ? 'chaos' : /\b(lesser|intermediate|greater)\b/.exec(t)?.[1] ?? TIER_BY_RATE[rate];
    if (!tier || !(/\bscroll\b|pct\b|\bgfa\b|\bchaos\b/.test(t))) return null;
    for (const [pattern, word] of SCROLL_WORDS) t = t.replace(pattern, ` ${word} `);
    const words = new Set(t.split(' ').filter(Boolean).flatMap(w => [w, w.replace(/s$/, '')]));
    // The scroll whose every name word is in the advert; the most specific wins (Magic Attack over Attack).
    const fits = scrolls.filter(s => s.tier === tier && s.words.every(w => words.has(w) || words.has(w.replace(/s$/, ''))));
    return fits.sort((a, b) => b.words.length - a.words.length)[0]?.full ?? null;
  };
}

// OCR slips split one item into several ("Mushmom Spare", "Frarmeless Glasses"): snap an advert's
// item to the game item whose name is very close (same first letter, 85% alike), else keep it as read.
// Scroll shorthand ("60% glove att") is turned into the scroll's name first.
export function itemNamer(names) {
  const scroll = scrollNamer(names);
  const exact = new Map(), byFirst = new Map();
  for (const name of names ?? []) { const key = normalize(name); if (!key) continue; exact.set(key, name); (byFirst.get(key[0]) ?? byFirst.set(key[0], []).get(key[0])).push([key, name]); }
  const cache = new Map();
  return text => {
    const key = normalize(text);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    let best = exact.get(key) ?? scroll(text), top = 0;
    if (!best && key.length >= 6) for (const [other, name] of byFirst.get(key[0]) ?? []) {
      if (Math.abs(other.length - key.length) > 2) continue;
      const score = 1 - editDistance(key, other) / Math.max(key.length, other.length);
      if (score >= .85 && score > top) { top = score; best = name; }
    }
    cache.set(key, best);
    return best;
  };
}

// Price groups per item. With `namer` (itemNamer), adverts are grouped under the real item name.
export function summarizePrices(log, query = '', namer = null) {
  const wanted = normalize(query), groups = new Map();
  for (const row of log ?? []) {
    const name = (namer && namer(row.item)) || row.item, key = namer ? normalize(name) : row.key;
    if (wanted && !key.includes(wanted) && !row.key.includes(wanted)) continue;
    const group = groups.get(key) ?? groups.set(key, { item: name, sells: [], buys: [], lastSeen: 0 }).get(key);
    (row.kind === 'buy' ? group.buys : group.sells).push(row.price);
    group.lastSeen = Math.max(group.lastSeen, row.at);
  }
  const stats = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return { count: values.length, low: sorted[0], median: sorted[Math.floor(sorted.length / 2)], high: sorted[sorted.length - 1] };
  };
  return [...groups.values()].map(group => ({ item: group.item, sell: stats(group.sells), buy: stats(group.buys), lastSeen: group.lastSeen }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

export function formatMesos(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return `${+(value / 1e9).toFixed(2)}b`;
  if (value >= 1e6) return `${+(value / 1e6).toFixed(2)}m`;
  if (value >= 1e3) return `${+(value / 1e3).toFixed(1)}k`;
  return String(value);
}
