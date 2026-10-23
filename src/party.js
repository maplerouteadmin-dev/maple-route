export const PARTY_QUEST = {
  name: 'First Time Together', minLevel: 21, maxLevel: 30, entryNpc: 'Lakelis', entryMap: 'Kerning City',
  url: 'https://mapleclassic.wiki/wiki/First_Time_Together',
  preparation: [
    ['party', 'Form a party and agree who leads.'],
    ['level', 'Confirm every member meets the current entry level in game.'],
    ['channel', 'Check an available entry channel with Lakelis.'],
    ['supplies', 'Bring enough HP/MP supplies for a timed run.']
  ],
  stages: [
    ['one', 'Stage 1 · Coupons and passes', 'Each non-leader speaks with Cloto, collects the requested coupons from Ligators, then gives the pass to the leader.'],
    ['two', 'Stage 2 · Vines', 'Three members test the four vines while the leader checks with Cloto.'],
    ['three', 'Stage 3 · Platforms', 'Three members test the numbered cat platforms while the leader checks.'],
    ['four', 'Stage 4 · Barrels', 'Three members test the six numbered barrels while the leader checks.'],
    ['five', 'Final stage · King Slime', 'Defeat the enemies, collect the passes, and have the leader turn them in to Cloto.'],
    ['bonus', 'Bonus stage · Optional', 'Hunt the bonus monsters or talk to Nella to leave.']
  ]
};

export function partyLevelMessage(level) {
  if (level < PARTY_QUEST.minLevel) return `Your saved level is below the community-listed ${PARTY_QUEST.minLevel}–${PARTY_QUEST.maxLevel} range.`;
  if (level > PARTY_QUEST.maxLevel) return `Your saved level is above the community-listed ${PARTY_QUEST.minLevel}–${PARTY_QUEST.maxLevel} range.`;
  return `Your saved level is within the community-listed ${PARTY_QUEST.minLevel}–${PARTY_QUEST.maxLevel} range; confirm eligibility in game.`;
}
