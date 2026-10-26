const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// Clear areas measured on a real 1280x800 Gaming Mode frame. None covers the game's upper-left mini
// map (the reader needs it), the chat (x 268-790) or the level/HP/EXP bar (x 265-1015, y 697-760).
// Bottom-left sits over the event icons only.
const OVERLAY_POSITIONS = ['bottom-left', 'bottom-right', 'upper-right'];
const overlayPosition = value => OVERLAY_POSITIONS.includes(value) ? value : 'bottom-left';
// While the phone QR code shows (the first minute, until a phone connects) the box is taller so the
// code is big enough for a phone camera (about 230 px); it grows upward, still clear of the HUD.
function pairingBounds(position = 'bottom-left', viewport) {
  const b = overlayBounds(position, viewport);
  const height = Math.round(300 * b.height / (position === 'bottom-left' ? 208 : 142));
  return position === 'upper-right' ? { ...b, height } : { ...b, y: b.y + b.height - height, height };
}
function overlayBounds(position = 'bottom-left', viewport = { width: 1280, height: 800 }) {
  // HUD measurements above are for 1280x800. Scale with gamescope's current output so a docked
  // display keeps the box in the same clear corner instead of leaving it Deck-sized mid-screen.
  const width = Math.max(640, Number(viewport?.width) || 1280);
  const height = Math.max(480, Number(viewport?.height) || 800);
  const sx = width / 1280, sy = height / 800;
  const scale = b => ({ x: Math.round(b.x * sx), y: Math.round(b.y * sy), width: Math.round(b.width * sx), height: Math.round(b.height * sy) });
  if (position === 'upper-right') return scale({ x: 1020, y: 150, width: 250, height: 142 });
  if (position === 'bottom-right') return scale({ x: 1020, y: 658, width: 250, height: 142 });
  // Width stops just before the chat/level UI at x=265; more height grows the map upward.
  return scale({ x: 4, y: 592, width: 258, height: 208 });
}

function displaySizeFromHelper(line) {
  try {
    const { width, height } = JSON.parse(line).screen ?? {};
    return Number.isInteger(width) && Number.isInteger(height) && width >= 640 && height >= 480 &&
      width <= 7680 && height <= 4320 ? { width, height } : null;
  } catch { return null; }
}

async function markOwnWindowAsOverlay(window) {
  const handle = window.getNativeWindowHandle();
  if (!handle || handle.length < 4) throw new Error('This window has no X11 window ID');
  const id = `0x${handle.readUInt32LE(0).toString(16)}`;
  // The ID is obtained from OUR BrowserWindow, never searched from the game.
  await execFileAsync('xprop', ['-id', id, '-f', 'GAMESCOPE_EXTERNAL_OVERLAY', '32c',
    '-set', 'GAMESCOPE_EXTERNAL_OVERLAY', '1'], { timeout: 3000, env: process.env }); // the display our window is on
  return id;
}

module.exports = { overlayBounds, pairingBounds, overlayPosition, displaySizeFromHelper, OVERLAY_POSITIONS, markOwnWindowAsOverlay };
