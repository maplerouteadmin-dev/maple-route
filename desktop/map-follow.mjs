// A map's SVG coordinates are not CSS pixels. Recenter in the viewer's own
// viewport so a narrow phone follows the player just like the Deck pop-out.
export function centeredScroll({ x, y, svgWidth, svgHeight, viewBoxWidth, viewBoxHeight, viewportWidth, viewportHeight }) {
  if (![x, y, svgWidth, svgHeight, viewBoxWidth, viewBoxHeight, viewportWidth, viewportHeight].every(Number.isFinite) ||
      svgWidth <= 0 || svgHeight <= 0 || viewBoxWidth <= 0 || viewBoxHeight <= 0) return null;
  return {
    left: Math.max(0, x * svgWidth / viewBoxWidth - viewportWidth / 2),
    top: Math.max(0, y * svgHeight / viewBoxHeight - viewportHeight / 2)
  };
}
