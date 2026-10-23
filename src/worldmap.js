import { normalize, portalPosition } from './core.js';
import { atlasNeighbors } from './atlas.js';

// Interactive world map: one map at a time with everything it connects to, each neighbour with enough
// detail to decide (monster levels, NPCs, how you get there), plus search across maps, NPCs and mobs.
// Used in the World map section and in the pop-out over the game. Pure; returns HTML strings.

const mobsOn = (data, mapId) => (data.targets ?? []).filter(t => t.kind === 'mob' && !t.special && t.locations.some(l => l.mapId === mapId));
const npcsOn = (data, mapId) => (data.targets ?? []).filter(t => t.kind === 'npc' && t.locations.some(l => l.mapId === mapId));

// Monsters that spawn on a map with how many of each (OSMS spawn points), most first.
export function mobTally(data, mapId) {
  // The map's own spawn points are the truth (the monster list can miss one, e.g. Orange Mushrooms);
  // the monster list fills in level and picture, and covers maps without spawn points.
  const spots = data.maps.find(m => m.id === mapId)?.mobSpots ?? [];
  const listed = mobsOn(data, mapId), byName = new Map(listed.map(m => [m.name, m]));
  const counts = new Map();
  for (const spot of spots) counts.set(spot.name, (counts.get(spot.name) ?? 0) + 1);
  const mobTarget = name => byName.get(name) ?? (data.targets ?? []).find(t => t.kind === 'mob' && t.name === name);
  const kinds = (counts.size ? [...counts].map(([name, count]) => { const m = mobTarget(name); return { name, level: m?.level ?? null, thumb: m?.thumb ?? null, count }; })
    : listed.map(m => ({ name: m.name, level: m.level, thumb: m.thumb ?? null, count: m.locations.find(l => l.mapId === mapId)?.count ?? 0 })))
    .sort((a, b) => b.count - a.count || (a.level ?? 0) - (b.level ?? 0));
  const levels = kinds.map(k => k.level).filter(Number.isFinite);
  return { total: kinds.reduce((n, k) => n + k.count, 0), kinds, levels: levels.length ? [Math.min(...levels), Math.max(...levels)] : null };
}

export function mapSummary(data, mapId) {
  const { total, levels } = mobTally(data, mapId);
  return {
    mobs: levels ? `${total ? `${total} ` : ''}Lv ${levels[0]}${levels[1] !== levels[0] ? `–${levels[1]}` : ''} monsters` : 'no monsters',
    npcs: npcsOn(data, mapId).length,
    rides: data.portals.filter(p => p.from === mapId && p.kind === 'taxi').length
  };
}

export function worldMapModel(data, centerId, { currentId = null, destinationId = null, query = '' } = {}) {
  const center = data.maps.find(m => m.id === centerId);
  if (!center) return null;
  const { neighbors, hiddenCount } = atlasNeighbors(data, centerId, 16);
  const rows = neighbors.map(link => {
    const exits = data.portals.filter(p => p.from === centerId && p.to === link.map.id);
    const how = exits.some(p => p.kind === 'taxi') ? `ride (${exits.find(p => p.kind === 'taxi').npc})` : exits.length ? [portalPosition(exits[0], center), exits[0].kind === 'hidden' ? 'hidden portal' : exits[0].kind === 'walk' ? 'walk-in exit' : 'portal'].filter(Boolean).join(' ') : 'leads here only';
    return { id: link.map.id, name: link.map.name, area: link.map.area, outgoing: link.outgoing, how, ...mapSummary(data, link.map.id), current: link.map.id === currentId, destination: link.map.id === destinationId };
  });
  const q = normalize(query), results = [];
  if (q.length >= 2) {
    for (const map of data.maps) if (normalize(map.name).includes(q)) results.push({ kind: 'map', name: map.name, mapId: map.id, detail: map.area });
    for (const t of data.targets ?? []) if (normalize(t.name).includes(q) && t.locations[0]) {
      const best = [...t.locations].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
      const map = data.maps.find(m => m.id === best.mapId);
      if (map) results.push({ kind: t.kind, name: t.name, mapId: map.id, detail: `${t.kind === 'mob' ? `Lv ${t.level ?? '?'} · ` : ''}${map.name}${t.locations.length > 1 ? ` +${t.locations.length - 1} more` : ''}` });
    }
    results.sort((a, b) => Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q)) || a.name.localeCompare(b.name));
  }
  return { center: { id: center.id, name: center.name, area: center.area, ...mapSummary(data, center.id), current: center.id === currentId, destination: center.id === destinationId }, rows, hiddenCount, results: results.slice(0, 12), query };
}

export function worldMapHtml(model, esc) {
  if (!model) return '<p class="fine">Pick a map to explore.</p>';
  const c = model.center;
  const tag = row => row.current ? '<span class="wm-tag you">you</span>' : row.destination ? '<span class="wm-tag dest">destination</span>' : '';
  const actions = id => `<span class="wm-actions"><button type="button" class="link-button" data-wm-center="${esc(id)}">explore</button><button type="button" class="button secondary wm-go" data-wm-go="${esc(id)}">Go</button></span>`;
  return `<div class="wm">
    <label class="wm-search"><input type="search" data-wm-search placeholder="Search maps, NPCs, monsters" value="${esc(model.query)}" autocomplete="off"></label>
    ${model.results.length ? `<ul class="wm-results">${model.results.map(r => `<li><span><strong>${esc(r.name)}</strong> <small>${esc(r.kind === 'map' ? r.detail : `${r.kind === 'npc' ? 'NPC' : 'Monster'} · ${r.detail}`)}</small></span>${actions(r.mapId)}</li>`).join('')}</ul>` : model.query.length >= 2 ? '<p class="fine">No matches.</p>' : ''}
    <div class="wm-center"><div><div class="wm-name">${esc(c.name)} ${tag(c)}</div><small>${esc(c.area)} · ${esc(c.mobs)} · ${c.npcs} NPC${c.npcs === 1 ? '' : 's'}${c.rides ? ` · ${c.rides} rides` : ''}</small></div>${c.current ? '' : `<button type="button" class="button wm-go" data-wm-go="${esc(c.id)}">Go here</button>`}</div>
    <ul class="wm-rows">${model.rows.map(row => `<li class="${row.outgoing ? '' : 'incoming'}"><span><strong>${esc(row.name)}</strong> ${tag(row)}<small>${esc(row.how)} · ${esc(row.mobs)}${row.npcs ? ` · ${row.npcs} NPC${row.npcs === 1 ? '' : 's'}` : ''}</small></span>${actions(row.id)}</li>`).join('')}</ul>
    ${model.hiddenCount ? `<p class="fine">${model.hiddenCount} more connected maps not shown.</p>` : ''}
  </div>`;
}
