import { normalize } from './core.js';

// Short, original summaries informed by the community guide linked in the UI.
// Map names are resolved against the visitor's current portal feed at runtime.
export const CLASSIC_BANDS = [
  { min: 1, max: 9, title: 'Maple Island', why: 'Follow the island quests before sailing. They teach the basics and lead toward your first job.', maps: ['Snail Hunting Ground II', 'Mushroom Garden'], tip: 'Once you leave for Victoria Island, plan your first job advancement.' },
  { min: 10, max: 15, title: 'First job, easy mushrooms', why: 'Start with monsters you can defeat quickly. The Ellinia tree dungeon is compact; Henesys has a convenient mixed-mob alternative.', maps: ['Tree Dungeon, Forest Up North IV', 'Henesys Hunting Ground III'], tip: 'Do your first job advancement at level 10 before settling into a grind.' },
  { min: 16, max: 20, title: 'Bubblings or green mushrooms', why: 'Kerning subway has a dense Bubbling map. Stay near Ellinia if the tree dungeon suits your class better.', maps: ['Line 1 <Area 1>', 'Tree Dungeon, Forest Up North IV'], tip: 'Choose the map where you can clear without draining your potion money.' },
  { min: 21, max: 25, title: 'Stirges and Ant Tunnel', why: 'Dark Cave mixes Stirges and mushrooms. Ant Tunnel III is an alternative when you want dense mushroom spawns.', maps: ['Dark Cave', 'Ant Tunnel III'], tip: 'Avoid Croko areas just because their Jr. Neckis look level-appropriate; much stronger Crocos share some maps.' },
  { min: 26, max: 30, title: 'Mushrooms, boars, or a party', why: 'Ant Tunnel III is a steady mushroom option. Wild Boar II gives a different layout and monster mix.', maps: ['Ant Tunnel III', 'The Land of Wild Boar II'], tip: 'Kerning Party Quest is another option in the 20s. Return to your instructor for second job at level 30.' },
  { min: 31, max: 35, title: 'Curse Eyes or Jr. Wraiths', why: 'The Ellinia tree dungeon is narrow and easy to patrol. Kerning subway offers a denser, different option.', maps: ['Tree Dungeon, Forest Up North IX', 'Line 2 <Area 1>'], tip: 'Pick based on your class, how many hits a kill takes, and potion use.' },
  { min: 36, max: 40, title: 'Kerning subway', why: 'The Jr. Wraith lines offer dense spawns, with a second line when your first choice is crowded.', maps: ['Line 2 <Area 1>', 'Line 1 <Area 2>'], tip: 'Watch for mixed maps with much higher-level monsters; they can turn a good-looking grind into a costly one.' },
  { min: 41, max: 45, title: 'Monkey Forest', why: 'Zombie Lupins make the Ellinia tree dungeons a useful step up. The open Monkey Forest offers another layout.', maps: ['Tree Dungeon, Monkey Forest II', 'Monkey Forest II'], tip: 'A compact map is often better than a higher-level monster spread across a long walk.' },
  { min: 46, max: 55, title: 'Wraiths or the beach', why: 'Deep Kerning subway lines are dense Wraith options. Florina Beach is a change of pace.', maps: ['Line 2 <Area 3>', 'Line 1 <Area 4>', 'Hot Sand'], tip: 'Bring enough potions for the long subway trip; actual XP and mesos depend on your build and market.' }
];

export function guideForLevel(level) {
  return CLASSIC_BANDS.find(band => level >= band.min && level <= band.max) ?? null;
}

export function resolveGuideMaps(data, band) {
  if (!band) return [];
  return band.maps.map(name => {
    const matches = data.maps.filter(map => normalize(map.name) === normalize(name));
    const preferredArea = band.max <= 9 ? 'maple island' : 'victoria island';
    return { name, map: matches.find(map => normalize(map.area) === preferredArea) ?? matches[0] ?? null };
  });
}
