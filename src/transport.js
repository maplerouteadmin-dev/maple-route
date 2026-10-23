// Victoria Island NPC transport, from the MapleClassic Wiki (CC BY-NC-SA 4.0):
// https://mapleclassic.wiki/wiki/Regular_Cab, the per-town Regular Cab pages, Phil and VIP Cab.
// Fares are [below level 20, level 20+] in mesos. Driver positions come from the OSMS NPC data.
export const TRANSPORT_SOURCE = 'https://mapleclassic.wiki/wiki/Regular_Cab';

export const TRANSPORT = [
  { npc: 'Regular Cab', town: 'Henesys', to: { 'Lith Harbor': [400, 800], Perion: [600, 1200], Ellinia: [500, 1000], 'Kerning City': [600, 1200], Sleepywood: [2500, 2500] } },
  { npc: 'Regular Cab', town: 'Perion', to: { 'Lith Harbor': [600, 1200], Henesys: [600, 1200], Ellinia: [500, 1000], 'Kerning City': [400, 800], Sleepywood: [2500, 2500] } },
  { npc: 'Regular Cab', town: 'Kerning City', to: { 'Lith Harbor': [500, 1000], Perion: [400, 800], Ellinia: [600, 1200], Henesys: [600, 1200], Sleepywood: [2500, 2500] } },
  { npc: 'Regular Cab', town: 'Sleepywood', to: { Henesys: [2500, 2500], Ellinia: [2500, 2500], Perion: [2500, 2500], 'Kerning City': [2500, 2500] } },
  // The wiki's Ellinia cab page has no fare table; these mirror the published fares in the other direction.
  { npc: 'Regular Cab', town: 'Ellinia', inferred: true, to: { 'Lith Harbor': [600, 1200], Henesys: [500, 1000], Perion: [500, 1000], 'Kerning City': [600, 1200], Sleepywood: [2500, 2500] } },
  { npc: 'Phil', town: 'Lith Harbor', to: { Perion: [600, 1200], Ellinia: [600, 1200], Henesys: [400, 800], 'Kerning City': [500, 1000] } },
  { npc: 'VIP Cab', town: 'Lith Harbor', to: { 'Ant Tunnel Park': [10000, 10000] } },
  { npc: 'VIP Cab', town: 'Ellinia', to: { 'Ant Tunnel Park': [10000, 10000] } },
  // Boats (MapleClassic Wiki: Shanks, Pason, Pison). Shanks is the only way off Maple Island, so boats
  // stay in routes even with taxis turned off. Pison takes you back to where you came from (Lith Harbor
  // for anyone who came by Pason); the wiki lists no fare for him.
  { npc: 'Shanks', town: 'Southperry', boat: true, to: { 'Lith Harbor': [300, 300] } },
  { npc: 'Pason', town: 'Lith Harbor', boat: true, to: { 'Florina Beach': [1500, 1500] } },
  { npc: 'Pison', town: 'Florina Beach', boat: true, note: 'Takes you back to where you came from.', to: { 'Lith Harbor': [0, 0] } }
];

// Route cost of a ride, in "portal hops". Cheap rides beat a long walk; the VIP cab is a last resort.
const rideCost = fare => fare[1] >= 10000 ? 8 : fare[1] >= 2500 ? 4 : 3;
export const TRANSPORT_SOURCES = ['https://mapleclassic.wiki/wiki/Shanks', 'https://mapleclassic.wiki/wiki/Pason', 'https://mapleclassic.wiki/wiki/Pison'];

// `maps` are validated-shape maps ({ id, name, area }); `npcAt(mapId, name)` returns a driver position or null.
export function transportEdges(maps, npcAt) {
  const byName = name => maps.find(map => map.name === name && /victoria/i.test(map.area)) ?? maps.find(map => map.name === name);
  const edges = [];
  for (const route of TRANSPORT) {
    const from = byName(route.town);
    if (!from) continue;
    const spot = npcAt(from.id, route.npc);
    for (const [destination, fare] of Object.entries(route.to)) {
      const to = byName(destination);
      if (!to || to.id === from.id) continue;
      edges.push({
        from: from.id, to: to.id, name: route.npc, kind: 'taxi', npc: route.npc, fare, arrive: '',
        note: route.note ?? (route.inferred ? 'Fare mirrors the published fare in the other direction.' : ''), boat: Boolean(route.boat),
        cost: rideCost(fare), x: spot?.x ?? null, y: spot?.y ?? null
      });
    }
  }
  return edges;
}

export function fareText(fare, level = null) {
  if (!Array.isArray(fare)) return 'Costs mesos.';
  if (fare[0] === fare[1]) return `Fare ${fare[0].toLocaleString()} mesos.`;
  if (Number.isFinite(level)) return `Fare ${(level < 20 ? fare[0] : fare[1]).toLocaleString()} mesos at level ${level}.`;
  return `Fare ${fare[0].toLocaleString()} mesos below level 20, ${fare[1].toLocaleString()} from level 20.`;
}
