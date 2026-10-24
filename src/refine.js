// Refined quest items: nobody drops a Garnet or a Silver Ingot, you collect the ore and have it
// refined. Jewels: Chrishrama, the Arcforger in Sleepywood. Metals: Silas Irons, the Blacksmith in
// Perion (MapleClassic Wiki NPC pages). 10 ores per refined item is the usual rate (a candidate:
// the NPC's own window has the exact price).
const JEWELS = ['Garnet', 'Amethyst', 'Aquamarine', 'Emerald', 'Opal', 'Sapphire', 'Topaz', 'Diamond', 'Black Crystal'];
export const ORES_PER_ITEM = 10;

export function refineRecipe(itemName) {
  const name = String(itemName ?? '').trim();
  const jewel = JEWELS.find(j => j.toLowerCase() === name.toLowerCase());
  if (jewel) return { item: jewel, ore: `${jewel} Ore`, per: ORES_PER_ITEM, npc: 'Chrishrama', town: 'Sleepywood', role: 'Arcforger' };
  const ingot = /^(.+?) Ingot$/i.exec(name);
  if (ingot) return { item: name, ore: `${ingot[1]} Ore`, per: ORES_PER_ITEM, npc: 'Silas Irons', town: 'Perion', role: 'Blacksmith' };
  return null;
}
