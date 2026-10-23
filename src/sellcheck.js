import { normalize, editDistance } from './core.js';

// "Sell to an NPC shop or to players?" The shop price is the game's own item value (what a shop pays);
// the player price is a median of logged trade-chat adverts or a price the player types in.

export const MEOWDB_PRICE_CHECK = 'https://meowdb.com/msclassic/price-check';

export function findCatalogItem(name, catalog) {
  const wanted = normalize(name);
  if (!wanted) return null;
  const exact = catalog.find(item => normalize(item.name) === wanted);
  if (exact) return exact;
  let best = null, bestScore = 0;
  for (const item of catalog) {
    const candidate = normalize(item.name);
    if (Math.abs(candidate.length - wanted.length) > 4) continue;
    const score = 1 - editDistance(wanted, candidate) / Math.max(wanted.length, candidate.length);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore >= .85 ? best : null;
}

// Adverts are asking prices; a sale usually lands somewhat below. `haircut` is that discount.
export function sellVerdict({ shopPrice, marketPrice, quantity = 1, haircut = .15 }) {
  const qty = Math.max(1, Math.round(Number(quantity) || 1));
  const shop = Number.isFinite(shopPrice) && shopPrice > 0 ? shopPrice : null;
  const market = Number.isFinite(marketPrice) && marketPrice > 0 ? marketPrice : null;
  const expected = market ? Math.round(market * (1 - haircut)) : null;
  const result = { quantity: qty, shopEach: shop, marketEach: market, expectedEach: expected, shopTotal: shop ? shop * qty : null, expectedTotal: expected ? expected * qty : null };
  if (!market && !shop) return { ...result, choice: 'unknown', reason: 'No shop value or player price is known for this item yet.' };
  if (!market) return { ...result, choice: 'unknown', reason: 'No player price yet. Check current listings, or type a price you have seen.' };
  if (!shop) return { ...result, choice: 'players', reason: 'Shops do not list a value for this item, so players are the only buyers.' };
  const extra = expected - shop;
  if (expected >= shop * 1.5 && extra * qty >= 5000) return { ...result, choice: 'players', reason: `Players should pay about ${Math.round(expected / shop * 10) / 10}× the shop price, roughly ${(extra * qty).toLocaleString()} mesos more for ${qty === 1 ? 'one' : `all ${qty}`}.` };
  if (expected <= shop * 1.1) return { ...result, choice: 'shop', reason: 'Players are not paying meaningfully more than the shop, so sell it to an NPC and save the time.' };
  return { ...result, choice: 'either', reason: `Players pay a little more (about ${(extra * qty).toLocaleString()} mesos in total). Sell to a shop if you value your time.` };
}

// Logged items whose player price clearly beats the shop: the "worth listing" table.
export function listingOpportunities(summaries, catalog, limit = 15) {
  const rows = [];
  for (const row of summaries) {
    const market = row.sell?.median;
    if (!market) continue;
    const item = findCatalogItem(row.item, catalog);
    const verdict = sellVerdict({ shopPrice: item?.npcPrice ?? null, marketPrice: market });
    if (verdict.choice !== 'players') continue;
    rows.push({ item: item?.name ?? row.item, shop: item?.npcPrice ?? null, market, adverts: row.sell.count, gain: verdict.expectedEach - (item?.npcPrice ?? 0) });
  }
  return rows.sort((a, b) => b.gain - a.gain).slice(0, limit);
}
