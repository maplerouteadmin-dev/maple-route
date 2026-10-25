// NPC shops: which quest items you can simply buy (a Salad from Raymond in the Henesys Town Hall, 220
// mesos) instead of hunting for them. MapleClassic Wiki `shops` (who, where) and `shop_items` (what,
// price) tables (CC BY-NC-SA), fetched in the player's browser.
const WIKI = 'https://mapleclassic.wiki/api.php';
const decode = text => String(text ?? '').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

// → { [item name lower-case]: [{ shop, npc, map, town, price }] }, cheapest first.
export function fromWikiShops(shopRows, itemRows) {
  const shops = new Map((shopRows ?? []).map(r => [decode(r.page ?? r.name_en ?? r['name en']), { npc: decode(r.npc) || decode(r.page), map: decode(r.map), town: decode(r.town) }]));
  const sold = {};
  for (const row of itemRows ?? []) {
    const shop = decode(row['shop id'] ?? row.shop_id), item = decode(row['item id'] ?? row.item_id), price = Number(row.price), grade = Number(row['citizenship grade'] ?? row.citizenship_grade) || null;
    if (!shop || !item) continue;
    const where = shops.get(shop) ?? { npc: shop, map: '', town: '' };
    (sold[item.toLowerCase()] ??= []).push({ item, shop, npc: where.npc, map: where.map, town: where.town, price: Number.isFinite(price) && price > 0 ? price : null, grade });
  }
  for (const list of Object.values(sold)) list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return sold;
}

// Town hall shopkeepers sell only to that town's residents of at least this grade (Henesys and Kerning
// City; wiki Citizenship page). Grade names, lowest first.
export const CITIZEN_GRADES = ['Traveler', 'Visitor', 'Helpful Stranger', 'Recognized Guest', 'Town Resident', 'Trusted Neighbor', 'Distinguished Citizen', 'Town Patron', 'Guardian of the Village', 'Citizen of Honor'];
export const citizenshipNote = seller => seller?.grade ? `needs ${seller.town || 'town'} citizenship, grade ${seller.grade} (${CITIZEN_GRADES[seller.grade - 1] ?? '?'})` : '';

export const sellersOf = (shops, itemName) => shops?.[String(itemName ?? '').trim().toLowerCase()] ?? [];

async function cargo(table, fields) {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const params = new URLSearchParams({ action: 'cargoquery', tables: table, fields, limit: '500', offset: String(offset), format: 'json', origin: '*' });
    const response = await fetch(`${WIKI}?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('The shop list is unavailable right now.');
    const page = ((await response.json())?.cargoquery ?? []).map(r => r.title ?? {});
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

export async function fetchShops() {
  const [shopRows, itemRows] = await Promise.all([cargo('shops', '_pageName=page,npc,map,town'), cargo('shop_items', 'shop_id,item_id,price,citizenship_grade')]);
  return fromWikiShops(shopRows, itemRows);
}
