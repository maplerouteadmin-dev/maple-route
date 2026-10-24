// Crafted quest items: nobody drops a Garnet, a Silver Ingot or a Screw; you collect the ingredients
// and make them. Recipes come from the Classic game files (OSMS Data Explorer crafting.json): a Garnet
// is 1 Garnet Ore + 200 mesos at the Arcforge, an ingot 5 ores at Smithing. Where each craft is done:
// MapleClassic Wiki NPC roles (Arcforger Chrishrama in Sleepywood, Blacksmith Silas Irons in Perion…).
export const OSMS_CRAFTING = 'https://osmsdataexplorer.com/data/current/crafting.json';

// Who to see (first one found on the map data wins), by discipline.
export const CRAFTERS = {
  Arcforge: { npcs: ['Chrishrama', 'Arcane Station'], town: 'Sleepywood' },
  Smithing: { npcs: ['Silas Irons', 'Anvil'], town: 'Perion' },
  Weaponcrafting: { npcs: ['Mr. Thunder', 'Weaponcrafting Station'], town: 'Perion' },
  Tailoring: { npcs: ['Francois', 'Sewing Machine'], town: 'Ellinia' },
  Woodcrafting: { npcs: ['Woodcrafting Station'], town: 'Henesys Market' },
  Leatherworking: { npcs: ['JM From tha Streetz', 'Leatherworking Station'], town: 'Kerning City' }
};

const key = name => String(name ?? '').trim().toLowerCase();

// crafting.json → { [item name lower-case]: [{ discipline, count, meso, level, ingredients: [{ name, count }] }] }
export function fromOsmsCrafting(payload) {
  const recipes = {};
  for (const discipline of payload?.disciplines ?? []) for (const type of discipline.output_types ?? []) for (const level of type.levels ?? []) for (const r of level.recipes ?? []) {
    if (!r?.result_item_name || !Array.isArray(r.ingredients) || !r.ingredients.length) continue;
    (recipes[key(r.result_item_name)] ??= []).push({
      discipline: discipline.discipline, type: type.output_type, count: Math.max(1, Number(r.result_count) || 1), meso: Number(r.meso_cost) || 0, level: Number(r.req_level) || 1,
      ingredients: r.ingredients.filter(i => i?.item_name).map(i => ({ name: String(i.item_name).trim(), count: Math.max(1, Number(i.count) || 1) }))
    });
  }
  return recipes;
}

// The simplest way to make an item (fewest kinds of ingredient, then cheapest), or null.
export function craftRecipe(crafting, itemName) {
  const options = crafting?.[key(itemName)];
  if (!options?.length) return null;
  const best = [...options].sort((a, b) => a.ingredients.length - b.ingredients.length || a.level - b.level || a.meso - b.meso)[0];
  const where = CRAFTERS[best.discipline] ?? { npcs: [], town: '' };
  return { item: String(itemName).trim(), ...best, npcs: where.npcs, npc: where.npcs[0] ?? null, town: where.town };
}

// What making `need` of an item takes: each ingredient's total, and the mesos.
export function craftNeeds(recipe, need = 1) {
  const batches = Math.ceil(Math.max(1, need) / recipe.count);
  return { batches, meso: batches * recipe.meso, ingredients: recipe.ingredients.map(i => ({ name: i.name, count: i.count * batches })) };
}
