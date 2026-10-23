// A small, explicitly sourced starter set. The wiki marks these recipes pre-launch;
// the app never treats them as confirmed live-game requirements.
export const RECIPES = [
  { item: 'Bronze Ingot', profession: 'Smithing', master: 'Silas Irons', level: 1, mesos: 100, ingredients: [['Bronze Ore', 5]] },
  { item: 'Iron Ingot', profession: 'Smithing', master: 'Silas Irons', level: 1, mesos: 100, ingredients: [['Iron Ore', 5]] },
  { item: 'Mithril Ingot', profession: 'Smithing', master: 'Silas Irons', level: 2, mesos: 200, ingredients: [['Mithril Ore', 5]] },
  { item: 'Metal Koif', profession: 'Smithing', master: 'Silas Irons', level: 1, mesos: 1000, ingredients: [['Bronze Koif', 1], ['Iron Ingot', 2]] },
  { item: 'Juno', profession: 'Smithing', master: 'Silas Irons', level: 2, mesos: 1200, ingredients: [['Iron Ingot', 2], ['Processed Leather', 2], ['Screw', 6]] },
  { item: 'Screw', profession: 'Weaponcrafting', master: 'Mr. Thunder', level: 1, mesos: 0, yield: 10, ingredients: [['Bronze Ingot', 1], ['Iron Ingot', 1]] },
  { item: 'Steel Pipe', profession: 'Weaponcrafting', master: 'Mr. Thunder', level: 1, mesos: 1500, ingredients: [['Iron Ingot', 1]] },
  { item: 'Processed Cloth', profession: 'Tailoring', master: 'Francois', level: 1, mesos: 100, ingredients: [["Pig's Ribbon", 10]] },
  { item: 'Spool of Thread', profession: 'Tailoring', master: 'Francois', level: 1, mesos: 100, yield: 10, ingredients: [['Animal Fur Bundle', 1]] },
  { item: 'Blue Bandana', profession: 'Tailoring', master: 'Francois', level: 1, mesos: 600, ingredients: [['Processed Cloth', 2], ['Blue Snail Shell', 10], ['Spool of Thread', 3]] },
  { item: 'Work Gloves', profession: 'Tailoring', master: 'Francois', level: 2, mesos: 1200, ingredients: [['Processed Cloth', 4], ['Spool of Thread', 6]] }
];

const API = 'https://mapleclassic.wiki/api.php';
const clean = value => String(value ?? '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").trim();
const safe = value => value.replaceAll("'", "''");

async function cargo(tables, fields, where, limit = 100) {
  const params = new URLSearchParams({ action: 'cargoquery', tables, fields, where, limit: String(limit), format: 'json', origin: '*' });
  const response = await fetch(`${API}?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Community shop data is unavailable.');
  const payload = await response.json();
  if (!Array.isArray(payload?.cargoquery)) throw new Error('Community shop data changed format.');
  return payload.cargoquery.map(row => row.title ?? {});
}

export function parseShopRows(rows) {
  return rows.map(row => ({ name: clean(row.shop ?? row._pageName ?? row['page name']), price: Number(row.price), item: clean(row['item id'] ?? row.item_id) }))
    .filter(row => row.name && Number.isFinite(row.price) && row.price >= 0);
}

export async function fetchWikiShops(itemName) {
  if (typeof itemName !== 'string' || !itemName.trim() || itemName.length > 160) throw new Error('Choose a valid item.');
  const rows = await cargo('shop_items', '_pageName=shop,item_id,price', `item_id='${safe(itemName)}'`);
  return parseShopRows(rows);
}

export function recipeFor(itemName) { return RECIPES.find(recipe => recipe.item.toLowerCase() === String(itemName).toLowerCase()) ?? null; }
export function remainingIngredients(recipe, owned = {}) {
  return recipe.ingredients.map(([name, needed]) => {
    const count = Math.min(needed, Math.max(0, Number(owned[name]) || 0));
    return { name, needed, owned: count, remaining: needed - count };
  });
}
