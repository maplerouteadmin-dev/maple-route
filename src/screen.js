import { createWorker, OEM, PSM } from 'tesseract.js';
import { findTitleBand, findTitleBar, titleTextRect, inkTitle, findMarkers, fitMinimap, toWorld, minimapLayout, recallScale } from './minimap.js';

// Browser-side glue between a captured frame (canvas, video or ImageBitmap) and minimap.js.
// Only the top corners of the frame are ever read.
// OCR calls give up after this long so one stuck job cannot freeze Live GPS.
const OCR_TIMEOUT = 8000;
const recognize = (worker, canvas) => Promise.race([worker.recognize(canvas), new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT))]);

const CORNER_W = .35, CORNER_H = .75; // tall enough for an expanded mini map

function cornerImage(source, width, height, side) {
  const w = Math.max(1, Math.ceil(width * CORNER_W)), h = Math.max(1, Math.ceil(height * CORNER_H));
  const offsetX = side === 'left' ? 0 : width - w;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, offsetX, 0, w, h, 0, 0, w, h);
  const image = context.getImageData(0, 0, w, h);
  canvas.width = canvas.height = 0;
  return { image, offsetX, side };
}

// Fast path: the mini map rarely moves, so look only where it was last found.
function locateNear(source, width, height, last) {
  // Room to the right for a wider window (a longer title); a band touching the crop edge means a
  // window that grew past it, so the full search runs instead.
  const x = Math.max(0, last.offsetX + last.band.x - 12), w = Math.min(width - x, last.band.w + Math.round(width * .12));
  const h = Math.min(Math.ceil(height * CORNER_H), Math.round(last.band.y + last.band.h * 8));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, x, 0, w, h, 0, 0, w, h);
  const image = context.getImageData(0, 0, w, h); canvas.width = canvas.height = 0;
  const band = findTitleBand(image, 'left', { regionW: 1, regionH: Math.min(1, (last.band.y + last.band.h * 3) / h), frameHeight: height }) ?? findTitleBar(image, { frameHeight: height });
  if (!band || band.x + band.w >= w - 3) return null;
  return { image, offsetX: x, side: last.side, band };
}

// Finds the mini-map window in the top-left corner, else the top-right one. `last` (the previous
// result) is tried first with a small crop.
export function locateMinimap(source, width, height, preferSide = null, last = null) {
  if (last) { const near = locateNear(source, width, height, last); if (near) return near; }
  const sides = preferSide === 'right' ? ['right', 'left'] : ['left', 'right'];
  for (const side of sides) {
    const corner = cornerImage(source, width, height, side);
    const band = findTitleBand(corner.image, side, { regionW: 1, regionH: .3 / CORNER_H, frameHeight: height });
    if (band) return { ...corner, band };
  }
  // No mini map on this map (shops, houses) or it is collapsed: just the one-line title bar.
  for (const side of sides) {
    const corner = cornerImage(source, width, height, side);
    const bar = findTitleBar(corner.image, { frameHeight: height });
    if (bar) return { ...corner, band: bar };
  }
  // Entire-screen shares with the game in a window: the mini map can be anywhere. Search the top
  // three quarters of the whole frame in vertical strips (the result is remembered via `last`).
  const stripW = Math.ceil(width * .4), step = Math.ceil(width * .3);
  for (let x = 0; x < width; x += step) {
    const w = Math.min(stripW, width - x), h = Math.ceil(height * .75);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, x, 0, w, h, 0, 0, w, h);
    const image = context.getImageData(0, 0, w, h); canvas.width = canvas.height = 0;
    const band = findTitleBand(image, 'left', { regionW: 1, regionH: 1, frameHeight: height }) ?? findTitleBar(image, { frameHeight: height });
    if (band && band.x + band.w < w - 3) return { image, offsetX: x, side: 'left', band };
    if (x + w >= width) break;
  }
  return null;
}

// Letter-shape thumbnail of the title text (white glyph pixels on/off, 96x24), used to notice when the
// map name changes. Averaged brightness was not enough: two titles in white on the same pale-blue strip
// average out almost the same, so map changes went unnoticed.
export function titleSignature(found) {
  const rect = titleTextRect(found.band), cols = 96, rows = 24, out = new Uint8Array(cols * rows);
  const { width, data } = found.image;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let ink = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = Math.floor(rect.x + (c + (dx + .5) / 2) * rect.w / cols), y = Math.floor(rect.y + (r + (dy + .5) / 2) * rect.h / rows), i = (y * width + x) * 4;
      const lum = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      if (found.band.collapsed ? lum < 120 : lum > 200) ink++; // bar text is dark on light
    }
    out[r * cols + c] = ink >= 2 ? 1 : 0;
  }
  return out;
}

// Same map: ~0-2% of cells differ in a live session; different maps: 13-20% on real screenshots.
export function signatureChanged(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
  return differ / a.length > .05;
}

// Crops the title text, inks it black-on-white at roughly 4× and OCRs it as one block.
export async function readTitle(worker, source, found, preview = null) {
  const rect = titleTextRect(found.band), scale = Math.min(5, Math.max(2, (found.band.collapsed ? 120 : 240) / found.band.h));
  const out = document.createElement('canvas');
  out.width = Math.round(rect.w * scale); out.height = Math.round(rect.h * scale);
  const context = out.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.x + found.offsetX, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
  const pixels = context.getImageData(0, 0, out.width, out.height);
  if (found.band.collapsed) {
    for (let i = 0; i < pixels.data.length; i += 4) { const ink = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114 < 120; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = ink ? 0 : 255; pixels.data[i + 3] = 255; }
  } else inkTitle(pixels);
  context.putImageData(pixels, 0, 0);
  if (preview) preview.src = out.toDataURL('image/png');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const { data } = await recognize(worker, out);
    return data.text.trim();
  } finally { out.width = out.height = 0; }
}

// Player position in map coordinates. Needs the dot plus two portal rings, or one ring when a scale
// was already learned for this mini map size. Positions far outside the map are rejected.
export function locatePlayer(found, map, scaleMemory = []) {
  const markers = findMarkers(found.image, found.band), layout = minimapLayout(found.band, markers.body);
  const result = { markers, layout, fit: null, world: null, reason: null };
  if (markers.collapsed) return { ...result, reason: 'collapsed' };
  if (!markers.player) return { ...result, reason: 'no-dot' };
  if (!map?.marks?.length) return { ...result, reason: 'no-portal-data' };
  const known = recallScale(scaleMemory, layout);
  const fit = (known && fitMinimap(markers.portals, map.marks, found.band.h, { scale: known })) || fitMinimap(markers.portals, map.marks, found.band.h);
  if (!fit) return { ...result, reason: markers.portals.length < 2 ? 'few-portals' : 'no-fit' };
  const world = toWorld(fit, markers.player), bounds = map.bounds;
  if (bounds) {
    const margin = (bounds.maxX - bounds.minX) * .15 + 300;
    if (world.x < bounds.minX - margin || world.x > bounds.maxX + margin) return { ...result, fit, reason: 'implausible' };
  }
  return { ...result, fit, world };
}

// Any frame rectangle as ImageData.
export function regionImage(source, rect) {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, rect.w); canvas.height = Math.max(1, rect.h);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  return image;
}

// OCR one frame rectangle: upscale smoothly, ink it (`ink(imageData)`), recognize.
export async function readRegion(worker, source, rect, { ink, scale = 3, psm = PSM.SINGLE_BLOCK, whitelist = '' } = {}) {
  const out = document.createElement('canvas');
  out.width = Math.round(rect.w * scale); out.height = Math.round(rect.h * scale);
  const context = out.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
  if (ink) { const pixels = context.getImageData(0, 0, out.width, out.height); ink(pixels); context.putImageData(pixels, 0, 0); }
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
    const { data } = await recognize(worker, out);
    return data.text.trim();
  } finally {
    if (whitelist) await worker.setParameters({ tessedit_char_whitelist: '' });
    out.width = out.height = 0;
  }
}

// Same local Tesseract setup as the rest of the app (assets under /ocr/, nothing sent anywhere).
// One-off read of a whole frame (the quest window can be anywhere): sparse text, slightly enlarged, longer timeout.
export async function readWholeFrame(worker, source, width, height) {
  const scale = width < 1600 ? 2 : 1.5, out = document.createElement('canvas');
  out.width = Math.round(width * scale); out.height = Math.round(height * scale);
  const context = out.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height, 0, 0, out.width, out.height);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await Promise.race([worker.recognize(out), new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), 45000))]);
    return data.text;
  } finally { out.width = out.height = 0; }
}

export function createOcrWorker(logger) {
  const base = new URL('ocr/', document.baseURI).href;
  return createWorker('eng', OEM.LSTM_ONLY, { workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`, workerBlobURL: false, ...(logger ? { logger } : {}) });
}
