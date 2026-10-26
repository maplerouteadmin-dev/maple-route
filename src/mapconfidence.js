// OCR of a long mini-map title can contain one wrong letter. Fuzzy matches never score above
// .88 in matchMap, so they need a separate, deliberately narrower path than exact titles.
export function plausibleNeighborTitle(matches, current, neighbors = []) {
  const best = matches[0];
  if (!best || !current || best.map.id === current || !neighbors.includes(best.map.id)) return false;
  if (best.score < .78) return false;
  const rival = matches.find(match => match.map.name !== best.map.name);
  return !rival || best.score - rival.score >= .12;
}
