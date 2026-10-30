export const TOWN_SCROLLS = Object.freeze(['Henesys', 'Ellinia', 'Perion', 'Kerning City', 'Lith Harbor', 'Sleepywood', 'Forgotten Hollow']);

// A saved inventory may be old or edited by hand. Only known destinations can change routes.
export function ownedTownScrolls(value) {
  if (!Array.isArray(value)) return [];
  const owned = new Set(value);
  return TOWN_SCROLLS.filter(name => owned.has(name));
}
