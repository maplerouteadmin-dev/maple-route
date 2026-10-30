// Enlarge a small map inside the fixed Live GPS viewport without changing its aspect ratio.
// Large maps retain their natural size so the player can scroll across them.
export function fittedMapSize(width, height, viewportWidth, viewportHeight) {
  if (![width, height, viewportWidth, viewportHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.max(1, Math.min(viewportWidth / width, viewportHeight / height));
  const fittedWidth = Math.round(width * scale);
  const fittedHeight = Math.round(height * scale);
  return { width: fittedWidth, height: fittedHeight, top: Math.max(0, Math.floor((viewportHeight - fittedHeight) / 2)) };
}
