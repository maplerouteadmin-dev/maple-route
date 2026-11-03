// Teleport pads inside one map (Utah's Pig Farm is a maze of them). The OSMS portal feed marks them
// `intra_map` with the spot they send you to (`dest_portal`). Several pads sharing one landing spot
// are traps: they all drop you back at the start. Pure.
export function mapTeleports(exits = []) {
  const byName = new Map(exits.filter(exit => exit?.name).map(exit => [String(exit.name), exit]));
  const pads = exits.filter(exit => exit?.intra_map && exit.dest_portal && Number.isFinite(Number(exit.x)) && Number.isFinite(Number(exit.y)));
  const shared = new Map();
  for (const pad of pads) shared.set(pad.dest_portal, (shared.get(pad.dest_portal) ?? 0) + 1);
  return pads.map(pad => {
    const landing = byName.get(String(pad.dest_portal));
    if (!landing || !Number.isFinite(Number(landing.x)) || !Number.isFinite(Number(landing.y))) return null;
    return { x: Number(pad.x), y: Number(pad.y), toX: Number(landing.x), toY: Number(landing.y), trap: shared.get(pad.dest_portal) >= 3 };
  }).filter(Boolean).slice(0, 60);
}
// What to tell the player on a map with pads.
export function teleportHint(teleports = []) {
  // Only a maze (pads that send you back) needs explaining; a town's teleporters are ordinary.
  const traps = teleports.filter(pad => pad.trap).length, forward = teleports.length - traps;
  if (!traps) return '';
  return traps
    ? `This map has ${forward} teleporter${forward === 1 ? '' : 's'} (green, the arrow shows where each lands) and ${traps} trap${traps === 1 ? '' : 's'} (red) that send you back to the start.`
    : `This map has ${forward} teleporter${forward === 1 ? '' : 's'}: the arrow on the map shows where each lands.`;
}
