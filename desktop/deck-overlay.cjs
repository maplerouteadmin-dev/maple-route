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
function pairingBounds(position = 'bottom-left') {
  const b = overlayBounds(position), height = 300;
  return position === 'upper-right' ? { ...b, height } : { ...b, y: b.y + b.height - height, height };
}
function overlayBounds(position = 'bottom-left') {
  if (position === 'upper-right') return { x: 1020, y: 150, width: 250, height: 142 };
  if (position === 'bottom-right') return { x: 1020, y: 608, width: 250, height: 142 };
  return { x: 4, y: 600, width: 258, height: 156 };
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

module.exports = { overlayBounds, pairingBounds, overlayPosition, OVERLAY_POSITIONS, markOwnWindowAsOverlay };
