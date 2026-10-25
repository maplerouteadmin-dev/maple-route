// Schematic drawing of one map from data coordinates: exits by kind, NPCs, the player's live
// position and the exit the route needs. Map y grows downward, like the screen.
const W = 1000, H = 250, PAD = 36;

// One colour per monster on a map (most spawns first), shared by the map dots and the monster chips.
const SPAWN_COLORS = ['#e4572e', '#f3a712', '#7cb518', '#a06cd5', '#1fa7a0', '#ff70a6', '#8d99ae'];
export function spawnColors(mobSpots = []) {
  const counts = new Map();
  for (const spot of mobSpots) counts.set(spot.name, (counts.get(spot.name) ?? 0) + 1);
  return new Map([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name], i) => [name, SPAWN_COLORS[i % SPAWN_COLORS.length]]));
}
const spawnDots = (spots, at, r, esc) => { const colors = spawnColors(spots); return spots.map(spot => { const p = at(spot); return `<circle class="mv-spawn" data-mob="${esc(spot.name)}" cx="${p.x}" cy="${p.y}" r="${r}" style="fill:${colors.get(spot.name)}"><title>${esc(spot.name)}</title></circle>`; }).join(''); };

export function mapViewModel(data, mapId, { route = null, position = null, goal = null } = {}) {
  const map = data.maps.find(m => m.id === mapId);
  if (!map) return null;
  const name = id => data.maps.find(m => m.id === id)?.name ?? '?';
  const next = route?.[0]?.from === mapId ? route[0] : null;
  const exits = data.portals.filter(p => p.from === mapId && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
  // Rides from one driver share a spot: draw one marker per driver with all destinations.
  const markers = [];
  for (const portal of exits) {
    const key = portal.kind === 'taxi' ? `npc:${portal.npc}` : `${portal.name}:${portal.x}:${portal.y}`;
    let marker = markers.find(m => m.key === key);
    if (!marker) markers.push(marker = { key, x: Number(portal.x), y: Number(portal.y), kind: portal.kind, npc: portal.npc ?? null, targets: [], next: false });
    if (!marker.targets.some(t => t.id === portal.to)) marker.targets.push({ id: portal.to, name: name(portal.to) });
    if (next && portal === next) marker.next = true;
  }
  const npcs = (map.npcs ?? []).filter(n => !markers.some(m => m.npc === n.name && Math.abs(m.x - n.x) < 5)).map(n => ({ ...n }));
  const points = [...markers, ...npcs, ...(position ? [position] : [])];
  if (!points.length) return { map, markers, npcs, player: null, position, width: W, height: H, empty: true };
  let minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  let minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  if (map.bounds) { minX = Math.min(minX, map.bounds.minX); maxX = Math.max(maxX, map.bounds.maxX); minY = Math.min(minY, map.bounds.minY); maxY = Math.max(maxY, map.bounds.maxY); }
  const spanX = Math.max(400, maxX - minX), spanY = Math.max(250, maxY - minY);
  const px = x => PAD + (x - minX) / spanX * (W - PAD * 2), py = y => PAD + 14 + (y - minY) / spanY * (H - PAD * 2 - 14);
  for (const item of [...markers, ...npcs]) { item.sx = px(item.x); item.sy = py(item.y); }
  // Stagger labels of neighbours so names do not overprint.
  [...markers].sort((a, b) => a.sx - b.sx).forEach((marker, i, all) => { marker.labelUp = i > 0 && marker.sx - all[i - 1].sx < 120 && !all[i - 1].labelUp; });
  const player = position ? { sx: px(position.x), sy: py(position.y) } : null;
  // On the destination map the target is the NPC you were sent to, when there is one.
  const goalSpot = goal && Number.isFinite(goal.x) ? { ...goal, sx: px(goal.x), sy: py(goal.y), goal: true } : null;
  const target = markers.find(m => m.next) ?? goalSpot;
  return { map, markers, npcs, mobSpots: map.mobSpots ?? [], player, target, goal: goalSpot, position, width: W, height: H, empty: false };
}

// Labels near the edges grow inward so they are not clipped.
const anchor = (x, width) => x < 110 ? 'start' : x > width - 110 ? 'end' : 'middle';

const KIND_LABEL = { visible: 'Portal', walk: 'Walk-in exit', hidden: 'Hidden portal', special: 'Scripted exit', taxi: 'NPC ride' };

export function mapViewSvg(model, esc) {
  if (!model) return '';
  if (model.empty) return `<p class="muted">No coordinates are listed for ${esc(model.map.name)}.</p>`;
  const parts = [`<svg class="mapview" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="Schematic of ${esc(model.map.name)}">`];
  parts.push(`<rect class="mv-bg" x="0" y="0" width="${model.width}" height="${model.height}" rx="14"/>`);
  if (model.player && model.target) parts.push(pathLine(model.player.sx, model.player.sy, model.target.sx, model.target.sy, 10));
  for (const npc of model.npcs) parts.push(`<circle class="mv-npc" data-npc="${esc(npc.name)}" cx="${npc.sx}" cy="${npc.sy}" r="4"><title>${esc(npc.name)}</title></circle>`);
  for (const marker of model.markers) {
    const label = marker.kind === 'taxi' ? `${marker.npc} (${marker.targets.length})` : marker.targets.map(t => t.name).join(' / ');
    const short = label.length > 26 ? `${label.slice(0, 25)}…` : label;
    const title = `${KIND_LABEL[marker.kind] ?? 'Exit'} to ${marker.targets.map(t => t.name).join(', ')}`;
    const ly = marker.labelUp ? marker.sy - 16 : marker.sy + 24;
    parts.push(`<g class="mv-exit mv-${marker.kind}${marker.next ? ' mv-next' : ''}" data-to="${esc(marker.targets[0].id)}" tabindex="0" role="button" aria-label="${esc(title)}"><title>${esc(title)}</title>`
      + (marker.next ? `<circle class="mv-halo" cx="${marker.sx}" cy="${marker.sy}" r="16"/>` : '')
      + (marker.kind === 'taxi' ? `<rect x="${marker.sx - 8}" y="${marker.sy - 8}" width="16" height="16" rx="4"/>` : `<circle cx="${marker.sx}" cy="${marker.sy}" r="8"/>`)
      + `<text x="${marker.sx}" y="${ly}" text-anchor="${anchor(marker.sx, model.width)}">${esc(short)}</text></g>`);
  }
  if (model.player) parts.push(`<g class="mv-player"><circle class="mv-pulse" cx="${model.player.sx}" cy="${model.player.sy}" r="12"/><circle cx="${model.player.sx}" cy="${model.player.sy}" r="7"/><text x="${model.player.sx}" y="${model.player.sy + 26}">You</text></g>`);
  parts.push('</svg>');
  return parts.join('');
}

// ---------- Mini map picture + exits in one view ----------
// Game mini map pictures are drawn at 1/16 of map units with a per-map offset the data does not
// list. Every portal and NPC stands on ground, so the offset is where those points land on top of
// solid (non-transparent) pixels. `alpha` is the picture's alpha channel (one byte per pixel).
export const PICTURE_SCALE = 1 / 16;

export function calibratePicture(alpha, width, height, points, scale = PICTURE_SCALE) {
  const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return null;
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] > 128;
  const xs = pts.map(p => p.x * scale), ys = pts.map(p => p.y * scale);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Gentle prior: edge portals sit near the picture's sides and the lowest ground a little above its
  // bottom. It only settles close calls (maps with few points, scenery that looks like ground).
  const oxPrior = width / 2 - (minX + maxX) / 2, oyPrior = height - 16 - maxY;
  let best = null;
  for (let ox = Math.floor(-minX) - 80; ox <= Math.ceil(width - maxX) + 80; ox++) {
    for (let oy = Math.floor(-minY) - 60; oy <= Math.ceil(height - maxY) + 60; oy++) {
      let score = 0;
      for (let i = 0; i < pts.length; i++) {
        const px = Math.round(xs[i] + ox), py = Math.round(ys[i] + oy);
        if (px < 0 || py < 0 || px >= width || py >= height) { score -= 2; continue; }
        // Standing right on the surface scores best, hovering a little above it less, inside scenery least.
        const touching = solid(px, py) || solid(px, py + 1), near = solid(px, py + 2) || solid(px, py + 3), air = !solid(px, py - 5);
        score += air ? (touching ? 3 : near ? 2 : 0) : (touching || near ? 1 : 0);
      }
      const total = score - (Math.abs(ox - oxPrior) + Math.abs(oy - oyPrior)) / 3;
      if (!best || total > best.total) best = { ox, oy, score, total };
    }
  }
  return { ox: best.ox, oy: best.oy, score: best.score, scale, confidence: best.score / (pts.length * 3) };
}

// The way to go: a bright dashed line with a dark casing and an arrowhead, readable over any map art.
function pathLine(x1, y1, x2, y2, unit) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, a = unit * .9;
  const tip = { x: x2 - ux * unit * .7, y: y2 - uy * unit * .7 }, base = { x: tip.x - ux * a, y: tip.y - uy * a };
  const head = `${tip.x},${tip.y} ${base.x - uy * a * .6},${base.y + ux * a * .6} ${base.x + uy * a * .6},${base.y - ux * a * .6}`;
  return `<g class="mv-route"><line class="mv-path-casing" x1="${x1}" y1="${y1}" x2="${base.x}" y2="${base.y}" style="stroke-width:${unit * .62}"/>`
    + `<line class="mv-path" x1="${x1}" y1="${y1}" x2="${base.x}" y2="${base.y}" style="stroke-width:${unit * .32};stroke-dasharray:${unit * .9} ${unit * .55}"/>`
    + `<polygon class="mv-path-head" points="${head}" style="stroke-width:${unit * .15}"/></g>`;
}

export function pictureOverlaySvg(model, picture, esc) {
  const { width: W, height: H, src, calibration: cal } = picture;
  const at = p => ({ x: p.x * cal.scale + cal.ox, y: p.y * cal.scale + cal.oy });
  // Always drawn at 2.4x the picture with 13 px labels, whatever the map's shape: long maps scroll
  // (and follow the player) instead of being stretched to the card's width.
  const unit = 13 / 2.4, r = unit * .55;
  const parts = [`<svg class="mv-overlay" viewBox="0 0 ${W} ${H}" style="width:${Math.round(W * 2.4)}px;height:${Math.round(H * 2.4)}px" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mini map of ${esc(model.map.name)} with exits">`,
    `<image href="${esc(src)}" x="0" y="0" width="${W}" height="${H}" style="image-rendering:pixelated"/>`];
  const target = model.target ? at(model.target) : null, player = model.position ? at(model.position) : null;
  if (player && target) parts.push(pathLine(player.x, player.y, target.x, target.y, unit));
  if (model.mobSpots?.length) parts.push(spawnDots(model.mobSpots, at, r * .32, esc));
  for (const npc of model.npcs) { const p = at(npc); parts.push(`<circle class="mv-npc" data-npc="${esc(npc.name)}" cx="${p.x}" cy="${p.y}" r="${r * .45}"><title>${esc(npc.name)}</title></circle>`); }
  const shortOf = marker => { const label = marker.kind === 'taxi' ? `${marker.npc}` : marker.targets.map(t => t.name).join(' / '); return label.length > 24 ? `${label.slice(0, 23)}…` : label; };
  const placed = placeLabels(model.markers.map(marker => { const p = at(marker); return { x: p.x, y: p.y, r, text: shortOf(marker), anchor: p.x < W * .12 ? 'start' : p.x > W * .88 ? 'end' : 'middle', priority: marker.next ? 1 : 0 }; }), unit);
  for (const [index, marker] of model.markers.entries()) {
    const p = at(marker), short = shortOf(marker), spot = placed[index];
    const title = `${marker.kind === 'taxi' ? 'NPC ride' : 'Exit'} to ${marker.targets.map(t => t.name).join(', ')}`;
    parts.push(`<g class="mv-exit mv-${marker.kind}${marker.next ? ' mv-next' : ''}" data-to="${esc(marker.targets[0].id)}" tabindex="0" role="button" aria-label="${esc(title)}"><title>${esc(title)}</title>`
      + (marker.next ? `<circle class="mv-halo" cx="${p.x}" cy="${p.y}" r="${r * 2}" style="stroke-width:${unit * .2}"/>` : '')
      + (marker.kind === 'taxi' ? `<rect x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" rx="${r * .4}" style="stroke-width:${unit * .12}"/>` : `<circle cx="${p.x}" cy="${p.y}" r="${r}" style="stroke-width:${unit * .12}"/>`)
      + (spot ? `<text x="${spot.x}" y="${spot.y}" text-anchor="${spot.anchor}" style="font-size:${unit}px;paint-order:stroke;stroke:#0d221c;stroke-width:${unit * .28}px">${esc(short)}</text>` : '') + '</g>');
  }
  if (model.goal) { const g = at(model.goal); parts.push(goalMark(g.x, g.y, r, unit, model.goal.name, esc)); }
  if (player) parts.push(`<g class="mv-player"><circle class="mv-pulse" cx="${player.x}" cy="${player.y}" r="${r * 1.6}"/><circle cx="${player.x}" cy="${player.y}" r="${r}" style="stroke-width:${unit * .15}"/><text x="${player.x}" y="${player.y + r * 3.2}" style="font-size:${unit}px;paint-order:stroke;stroke:#0d221c;stroke-width:${unit * .28}px">You</text></g>`);
  parts.push('</svg>');
  return parts.join('');
}

// The NPC you are being taken to: a gold halo and their name above them.
function goalMark(x, y, r, unit, name, esc) {
  return `<g class="mv-goal"><circle class="mv-halo" cx="${x}" cy="${y}" r="${r * 2}" style="stroke-width:${unit * .2}"/><circle cx="${x}" cy="${y}" r="${r * .8}"/><text x="${x}" y="${y - r * 2.6}" text-anchor="middle" style="font-size:${unit}px;paint-order:stroke;stroke:#0d221c;stroke-width:${unit * .28}px">${esc(name)}</text></g>`;
}

// Full OSMS map render as the background: portal and NPC coordinates are pixels of this image, so
// exits land exactly. `render` = { src, width, height } in map units; `position` is in map units too.
export function renderOverlaySvg(model, render, esc) {
  const { width: W, height: H, src } = render;
  // Drawn at 2.4/16 of map size (matching the mini map view); text sizes are in map units.
  const unit = 16 / 2.4 * 13, r = unit * .55;
  const label = (x, y, text, anchor = 'middle', cls = '') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" style="font-size:${unit}px;paint-order:stroke;stroke:#0d221c;stroke-width:${unit * .28}px">${esc(text)}</text>`;
  const parts = [`<svg class="mv-overlay" viewBox="0 0 ${W} ${H}" style="width:${Math.round(W / 16 * 2.4)}px;height:${Math.round(H / 16 * 2.4)}px" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of ${esc(model.map.name)} with exits">`,
    `<image href="${esc(src)}" x="0" y="0" width="${W}" height="${H}"/>`];
  const player = model.position, target = model.target;
  if (player && target) parts.push(pathLine(player.x, player.y, target.x, target.y, unit));
  if (model.mobSpots?.length) parts.push(spawnDots(model.mobSpots, p => p, r * .32, esc));
  for (const npc of model.npcs) parts.push(`<circle class="mv-npc" data-npc="${esc(npc.name)}" cx="${npc.x}" cy="${npc.y}" r="${r * .45}"><title>${esc(npc.name)}</title></circle>`);
  const shortOf = marker => { const text = marker.kind === 'taxi' ? marker.npc : marker.targets.map(t => t.name).join(' / '); return text.length > 24 ? `${text.slice(0, 23)}…` : text; };
  const placed = placeLabels(model.markers.map(marker => ({ x: marker.x, y: marker.y, r, text: shortOf(marker), anchor: marker.x < W * .12 ? 'start' : marker.x > W * .88 ? 'end' : 'middle', priority: marker.next ? 1 : 0 })), unit);
  for (const [index, marker] of model.markers.entries()) {
    const short = shortOf(marker), spot = placed[index];
    const title = `${marker.kind === 'taxi' ? 'NPC ride' : 'Exit'} to ${marker.targets.map(t => t.name).join(', ')}`;
    parts.push(`<g class="mv-exit mv-${marker.kind}${marker.next ? ' mv-next' : ''}" data-to="${esc(marker.targets[0].id)}" tabindex="0" role="button" aria-label="${esc(title)}"><title>${esc(title)}</title>`
      + (marker.next ? `<circle class="mv-halo" cx="${marker.x}" cy="${marker.y}" r="${r * 2}" style="stroke-width:${unit * .2}"/>` : '')
      + (marker.kind === 'taxi' ? `<rect x="${marker.x - r}" y="${marker.y - r}" width="${r * 2}" height="${r * 2}" rx="${r * .4}" style="stroke-width:${unit * .12}"/>` : `<circle cx="${marker.x}" cy="${marker.y}" r="${r}" style="stroke-width:${unit * .12}"/>`)
      + (spot ? label(spot.x, spot.y, short, spot.anchor) : '') + '</g>');
  }
  if (player) parts.push(`<g class="mv-player"><circle class="mv-pulse" cx="${player.x}" cy="${player.y}" r="${r * 1.6}"/><circle cx="${player.x}" cy="${player.y}" r="${r}" style="stroke-width:${unit * .15}"/>${label(player.x, player.y + r * 3.2, 'You')}</g>`);
  if (model.goal) parts.push(goalMark(model.goal.x, model.goal.y, r, unit, model.goal.name, esc));
  parts.push('</svg>');
  return parts.join('');
}

// Greedy label placement so names do not print over each other: try above, then below the marker;
// a label that still collides is left out (the exit keeps its hover title). Priority items go first.
export function placeLabels(items, unit) {
  const boxes = [], out = new Array(items.length).fill(null);
  const order = items.map((item, i) => i).sort((a, b) => (items[b].priority ?? 0) - (items[a].priority ?? 0));
  const overlaps = box => boxes.some(o => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
  for (const i of order) {
    const { x, y, text, r, anchor = 'middle' } = items[i];
    const w = text.length * unit * .56, h = unit * 1.15;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    for (const ly of [y - r * 1.8, y + r * 1.8 + unit * .9]) {
      const box = { x0, x1: x0 + w, y0: ly - h * .85, y1: ly + h * .2 };
      if (!overlaps(box)) { boxes.push(box); out[i] = { x, y: ly, anchor }; break; }
    }
  }
  return out;
}
