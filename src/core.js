export const STORAGE_KEY = 'maple-route-v2';

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validateDataset(input) {
  if (!input || typeof input !== 'object' || input.schemaVersion !== 1) throw new Error('Expected a Maple Route data file with schemaVersion 1.');
  if (!Array.isArray(input.maps) || !Array.isArray(input.portals)) throw new Error('The file needs maps and portals arrays.');
  if (input.maps.length > 10000 || input.portals.length > 100000) throw new Error('The data file is too large.');
  const maps = new Map();
  for (const raw of input.maps) {
    const id = String(raw?.id ?? '').trim();
    const name = String(raw?.name ?? '').trim();
    if (!id || !name || id.length > 80 || name.length > 160 || maps.has(id)) throw new Error('Each map needs a unique id and a name.');
    const aliases = Array.isArray(raw.aliases) ? raw.aliases.map(x => String(x).trim()).filter(Boolean).slice(0, 20) : [];
    const bounds = raw.bounds;
    const spatial = bounds && ['minX', 'maxX', 'minY', 'maxY'].every(key => Number.isFinite(Number(bounds[key])))
      && Number(bounds.maxX) > Number(bounds.minX) && Number(bounds.maxY) >= Number(bounds.minY)
      ? Object.fromEntries(['minX', 'maxX', 'minY', 'maxY'].map(key => [key, Number(bounds[key])])) : null;
    const point = value => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) ? { x: Number(value.x), y: Number(value.y) } : null;
    const marks = Array.isArray(raw.marks) ? raw.marks.slice(0, 60).map(point).filter(Boolean) : [];
    const spots = {};
    if (raw.spots && typeof raw.spots === 'object') for (const [key, value] of Object.entries(raw.spots).slice(0, 120)) { const spot = point(value); if (spot && key.length <= 40) spots[key] = spot; }
    const npcs = Array.isArray(raw.npcs) ? raw.npcs.slice(0, 60).map(npc => { const spot = point(npc); return spot && npc.name ? { name: String(npc.name).slice(0, 60), ...spot } : null; }).filter(Boolean) : [];
    const picture = typeof raw.picture === 'string' && /^images\/maps\/\d{1,12}\.png$/.test(raw.picture) ? raw.picture : null;
    const mobSpots = Array.isArray(raw.mobSpots) ? raw.mobSpots.slice(0, 400).map(spot => { const at = point(spot); return at && spot.name ? { name: String(spot.name).slice(0, 60), ...at } : null; }).filter(Boolean) : [];
    const returnTo = typeof raw.returnTo === 'string' && raw.returnTo !== id ? raw.returnTo : null;
    // How many monsters can be alive at once (the game's mob cap), and how many spawn points the map has.
    const capacity = Number.isInteger(raw.capacity) && raw.capacity > 0 && raw.capacity < 1000 ? raw.capacity : null;
    maps.set(id, { id, name, area: String(raw.area ?? '').slice(0, 120), aliases, bounds: spatial, marks, spots, npcs, mobSpots, picture, returnTo, capacity });
  }
  if (!maps.size) throw new Error('The file has no maps.');
  const portals = [];
  for (const raw of input.portals) {
    const from = String(raw?.from ?? ''), to = String(raw?.to ?? '');
    if (!maps.has(from) || !maps.has(to)) throw new Error(`A portal refers to an unknown map: ${from} → ${to}.`);
    const name = String(raw?.name ?? '').trim();
    if (!name || name.length > 160) throw new Error('Each portal needs a short name.');
    const cost = Number(raw.cost ?? 1);
    if (!Number.isFinite(cost) || cost <= 0 || cost > 10000) throw new Error('Portal cost must be between 0 and 10000.');
    const x = raw.x == null ? null : Number(raw.x), y = raw.y == null ? null : Number(raw.y);
    if ((x !== null && !Number.isFinite(x)) || (y !== null && !Number.isFinite(y))) throw new Error('Portal coordinates must be finite numbers.');
    const kind = ['visible', 'walk', 'hidden', 'special', 'taxi'].includes(raw.kind) ? raw.kind : 'visible';
    const fare = Array.isArray(raw.fare) && raw.fare.length === 2 && raw.fare.every(n => Number.isFinite(n) && n >= 0) ? raw.fare.map(Number) : null;
    portals.push({ from, to, name, kind, arrive: String(raw.arrive ?? '').slice(0, 40), cost, note: String(raw.note ?? '').slice(0, 240), x, y, ...(fare ? { fare } : {}), ...(raw.npc ? { npc: String(raw.npc).slice(0, 60) } : {}), ...(raw.boat ? { boat: true } : {}) });
  }
  if (input.targets !== undefined && (!Array.isArray(input.targets) || input.targets.length > 5000)) throw new Error('Targets must be an array of at most 5000 mobs and NPCs.');
  const targets = [];
  const targetIds = new Set();
  for (const raw of input.targets ?? []) {
    const id = String(raw?.id ?? '').trim(), name = String(raw?.name ?? '').trim();
    const kind = raw?.kind;
    if (!id || id.length > 80 || targetIds.has(id) || !name || name.length > 160 || !['mob', 'npc'].includes(kind)) throw new Error('Each mob or NPC needs a unique id, name, and kind.');
    if (!Array.isArray(raw.locations) || raw.locations.length > 500) throw new Error('Each mob or NPC needs a locations array of at most 500 maps.');
    const locations = [];
    const locationIds = new Set();
    for (const location of raw.locations) {
      const mapId = String(location?.mapId ?? '');
      if (!maps.has(mapId) || locationIds.has(mapId)) throw new Error(`Invalid or duplicate location for ${name}.`);
      locationIds.add(mapId);
      const count = location.count == null ? null : Number(location.count);
      if (count !== null && (!Number.isInteger(count) || count < 0)) throw new Error(`Invalid spawn count for ${name}.`);
      locations.push({ mapId, count });
    }
    targetIds.add(id);
    const level = raw.level == null ? null : Number(raw.level);
    if (level !== null && (!Number.isInteger(level) || level < 0 || level > 1000)) throw new Error(`Invalid level for ${name}.`);
    const hp = raw.hp == null ? null : Number(raw.hp), exp = raw.exp == null ? null : Number(raw.exp);
    if ([hp, exp].some(value => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error(`Invalid HP or EXP for ${name}.`);
    if (locations.length) targets.push({ id, name, kind, level, hp, exp, special: Boolean(raw.special), locations, ...(/^[0-9a-f]{32}$/.test(raw.thumb ?? '') ? { thumb: raw.thumb } : {}) });
  }
  return {
    schemaVersion: 1,
    label: String(input.label ?? 'Imported map data').slice(0, 120),
    source: String(input.source ?? '').slice(0, 500),
    updated: String(input.updated ?? '').slice(0, 80),
    maps: [...maps.values()], portals, targets
  };
}

export function portalPosition(portal, map) {
  const bounds = map?.bounds;
  let horizontal = '', vertical = '';
  if (bounds && Number.isFinite(portal.x) && bounds.maxX - bounds.minX >= 300) {
    const fraction = (portal.x - bounds.minX) / (bounds.maxX - bounds.minX);
    horizontal = fraction < .34 ? 'left' : fraction > .66 ? 'right' : '';
  }
  if (bounds && Number.isFinite(portal.y) && bounds.maxY - bounds.minY >= 300) {
    const fraction = (portal.y - bounds.minY) / (bounds.maxY - bounds.minY);
    vertical = fraction < .3 ? 'top' : fraction > .7 ? 'bottom' : '';
  }
  if (!horizontal && !vertical) {
    const name = String(portal.name).toLowerCase();
    horizontal = /(^|[_-])(east|right)/.test(name) ? 'right' : /(^|[_-])(west|left)/.test(name) ? 'left' : '';
    vertical = /(^|[_-])(north|up)/.test(name) ? 'top' : /(^|[_-])(south|down)/.test(name) ? 'bottom' : '';
  }
  if (horizontal && vertical) return `${vertical}-${horizontal}`;
  if (horizontal) return horizontal;
  if (vertical) return vertical;
  return null;
}

// Dijkstra over the directed portal graph. `edgeCost(portal)` defaults to the portal's own cost
// (1 for ordinary portals, more for hidden/scripted exits and taxis). Graphs are a few hundred maps.
export function searchRoute(data, start, destination, edgeCost = portal => portal.cost) {
  if (!data.maps.some(m => m.id === start) || !data.maps.some(m => m.id === destination)) return null;
  if (start === destination) return [];
  const distance = new Map([[start, 0]]), previous = new Map(), remaining = new Set(data.maps.map(m => m.id));
  const outgoing = new Map(data.maps.map(m => [m.id, []]));
  for (const portal of data.portals) outgoing.get(portal.from)?.push(portal);
  while (remaining.size) {
    let current = null, best = Infinity;
    for (const id of remaining) { const d = distance.get(id) ?? Infinity; if (d < best) { best = d; current = id; } }
    if (current === null || current === destination) break;
    remaining.delete(current);
    for (const portal of outgoing.get(current)) {
      const candidate = best + edgeCost(portal);
      if (candidate < (distance.get(portal.to) ?? Infinity)) { distance.set(portal.to, candidate); previous.set(portal.to, portal); }
    }
  }
  if (!previous.has(destination)) return null;
  const steps = [];
  for (let id = destination; id !== start;) { const portal = previous.get(id); if (!portal) return null; steps.unshift(portal); id = portal.from; }
  return steps;
}

export const shortestRoute = (data, start, destination) => searchRoute(data, start, destination);

export function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; }
  }
  return row[b.length];
}

// OCR reads roman numerals in map names ("Hunting Ground II") as l, 1 or |; turn such runs back into i's.
// Only at the end of a name (or before another numeral): a leading "L" (L Forest I) is a letter, not I.
const numeralLike = word => /^[il1|]{1,3}$/.test(word ?? '');
const numerals = text => { const words = text.split(' '); return words.map((word, i) => numeralLike(word) && (i === words.length - 1 || numeralLike(words[i + 1])) ? 'i'.repeat(word.length) : word).join(' '); };
const containsWords = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);

export function matchMap(text, maps, current = null) {
  // OCR often reads the numeral I as a bar; map names never contain one.
  // A roman-numeral I is often read as a bar glued to the word before it ("L Forest|" = L Forest I).
  const seen = numerals(normalize(String(text).replace(/(\S)(\|+)/g, '$1 $2').replace(/\|/g, 'I'))), compact = seen.replaceAll(' ', '');
  if (!seen || !maps.length) return [];
  const lines = String(text).split(/\r?\n/).map(line => numerals(normalize(line.replace(/(\S)(\|+)/g, '$1 $2').replace(/\|/g, 'I')))).filter(Boolean);
  // A numeral glued to the last word ("L Forestll", "Ant Tunnell"): the last word may end in an l
  // itself, so try every split of the trailing l/1/| run (1-3 numeral letters) as a separate word.
  const glued = [];
  const run = seen.match(/[l1|]{1,4}$/)?.[0] ?? '';
  for (let k = 1; k <= Math.min(3, run.length); k++) {
    const before = seen.slice(0, seen.length - k);
    if (/[a-z]{3,}$/.test(before)) glued.push(`${before} ${'i'.repeat(k)}`);
  }
  const words = seen.split(' ');
  const candidates = [];
  for (const map of maps) {
    let score = 0;
    for (const alias of [map.name, ...map.aliases]) {
      // Map names go through the same numeral rule as the reading ("Camp 1" is seen as "camp i").
      const target = numerals(normalize(alias)), merged = target.replaceAll(' ', '');
      if (target.length < 3) continue;
      // Numeral glued to the last word ("L Forestll" = L Forest II): compare with the trailing l/1/| run as i's.
      if (seen === target || compact === merged || glued.includes(target) || lines.at(-1) === target) score = Math.max(score, 1);
      // Whole words only, so "ground i" does not match inside "ground ii".
      else if (containsWords(seen, target) || glued.some(g => containsWords(g, target))) score = Math.max(score, .96);
      else {
        const size = target.split(' ').length;
        for (let i = 0; i < words.length; i++) {
          const fragment = words.slice(i, i + size).join(' ').replaceAll(' ', '');
          if (fragment.length < 3 || Math.abs(fragment.length - merged.length) > 2) continue;
          const closeness = 1 - editDistance(fragment, merged) / Math.max(fragment.length, merged.length);
          if (closeness >= .78) score = Math.max(score, closeness * .88);
        }
      }
    }
    if (score >= .68) candidates.push({ map, score: Math.min(1, score + (map.id === current ? .01 : 0)) });
  }
  // The title is "area / map name": with a map line present, the area line alone is not the map
  // ("Victoria Road" is both an area and a map; a cut-off second line must not fall back to it).
  // One-line title bars ("Victoria Road : Ellinia Department Store") put the area first: a map whose
  // whole name is just the leading words, with more words after it, is the area, not the map.
  const leadingArea = c => {
    const name = normalize(c.map.name), count = name.split(' ').length, head = seen.split(' ').slice(0, count).join(' '), rest = seen.split(' ').slice(count).join(' ');
    return /[a-z]{3}/.test(rest) && rest !== name && editDistance(head, name) <= Math.max(1, Math.floor(name.length * .2)); // allows OCR slips
  };
  // A longer name that contains a matched shorter one and nearly matches beats it: "Ellinia
  // Department Stor" is Ellinia Department Store, not Ellinia.
  // Only for cut-off titles: when some name matched exactly, nothing else gets lifted next to it.
  const exact = candidates.some(c => c.score >= 1);
  if (!exact) for (const short of candidates) for (const long of candidates) {
    const s = normalize(short.map.name), l = normalize(long.map.name);
    // ...unless the title line IS the shorter name exactly (Dangerous Valley, not Dangerous Valley II).
    if (lines.at(-1) === s) continue;
    if (long !== short && l.length > s.length && ` ${l} `.includes(` ${s} `) && long.score >= .8 && long.score <= short.score) long.score = Math.min(1, short.score + .01);
  }
  // The area line alone is not the map, except when area and map share the name (Truth Booth).
  const kept = candidates.filter(c => !(lines.length >= 2 && lines[0] !== lines.at(-1) && /[a-z]{3}/.test(lines[lines.length - 1]) && normalize(c.map.name) === lines[0]) && !leadingArea(c));
  return kept.sort((a, b) => b.score - a.score || a.map.name.localeCompare(b.map.name)).slice(0, 5);
}
