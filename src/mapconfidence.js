import { normalize } from './core.js';

// OCR of a long mini-map title can contain one wrong letter. Fuzzy matches never score above
// .88 in matchMap, so they need a separate, deliberately narrower path than exact titles.
import { recallScale } from './minimap.js';

// Before a layout has a learned scale, the game's 1366px logical width gives the
// picture comparator a safe first attempt on a shared window (including 2560px TVs).
export function pictureComparisonScale(memory, layout, frameWidth) {
  return recallScale(memory, layout) ?? (Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth / 1366 : null);
}

export function plausibleNeighborTitle(matches, current, neighbors = []) {
  const best = matches[0];
  if (!best || !current || best.map.id === current || !neighbors.includes(best.map.id)) return false;
  if (best.score < .78) return false;
  const rival = matches.find(match => match.map.name !== best.map.name);
  return !rival || best.score - rival.score >= .12;
}

// A narrow mini-map header can cut off the end of a long title. Only use a complete-word prefix
// when exactly one neighboring map fits it; the live reader then requires a second matching read.
export function uniqueNeighborPrefix(text, maps, current, neighbors = []) {
  if (!current || !neighbors.length) return null;
  const lines = String(text ?? '').split(/\r?\n/).map(normalize).filter(Boolean);
  const fragment = lines.at(-1) ?? '';
  if (fragment.length < 12 || fragment.split(' ').length < 2) return null;
  const candidates = maps.filter(map => neighbors.includes(map.id) && map.id !== current &&
    normalize(map.name).startsWith(`${fragment} `));
  return candidates.length === 1 ? candidates[0] : null;
}
