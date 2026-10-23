import { fetchOsms } from '../src/osms.js';
import { shortestRoute } from '../src/core.js';

const data = await fetchOsms();
const from = data.maps.find(m => m.name === 'Lith Harbor');
const to = data.maps.find(m => m.name === 'Henesys');
if (!from || !to) throw new Error('Expected starter locations were missing from the live feed.');
const route = shortestRoute(data, from.id, to.id);
if (!route?.length) throw new Error('No live portal route from Lith Harbor to Henesys.');
if (!data.targets.some(target => target.kind === 'mob') || !data.targets.some(target => target.kind === 'npc')) throw new Error('Live mob or NPC locations are missing.');
console.log(JSON.stringify({ maps: data.maps.length, portals: data.portals.length, mobs: data.targets.filter(target => target.kind === 'mob').length, npcs: data.targets.filter(target => target.kind === 'npc').length, lithToHenesysHops: route.length, firstPortal: route[0].name }));
