// Reads the MapleStory Worlds "mini map" window from one captured frame: where the title strip is,
// the player's yellow dot and the teal portal rings. Works on ImageData-like objects
// ({ width, height, data: RGBA bytes }) so it runs the same in the browser and in node tests.
// Colors were sampled from real Classic World screenshots (fixtures/screens, kept out of git).

const isPanelBlue = (r, g, b) => r >= 120 && r <= 190 && g >= 160 && g <= 215 && b >= 180 && b <= 235 && b - r >= 30 && g - r >= 15;
const isPlayerYellow = (r, g, b) => r >= 225 && g >= 185 && b <= 110 && r > g;
const isPortalTeal = (r, g, b) => b - r >= 45 && g - r >= 30 && b >= g && b >= 95 && r < 140;
const isFrameLight = (r, g, b) => r > 220 && g > 220 && b > 220 && Math.max(r, g, b) - Math.min(r, g, b) < 18;

function longestRun(flags, maxGap = 0) {
  let best = null, start = -1, last = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0 || i - last - 1 > maxGap) {
        if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
        start = i;
      }
      last = i;
    }
  }
  if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
  return best;
}

// The pale-blue strip holding the region emblem and the two-line "street / map" title.
// `regionW`/`regionH` are the searched share of the image; `frameHeight` is the full game frame
// height when `image` is already a cropped corner (band size limits are relative to it).
export function findTitleBand(image, side = 'left', { regionW: shareW = .35, regionH: shareH = .3, frameHeight = image.height } = {}) {
  const { width, data } = image, height = frameHeight;
  const regionW = Math.floor(width * shareW), regionH = Math.min(image.height, Math.floor(image.height * shareH));
  const left = side === 'left' ? 0 : width - regionW;
  const rowHits = new Array(regionH).fill(0);
  for (let y = 0; y < regionH; y++) for (let x = left; x < left + regionW; x++) {
    const i = (y * width + x) * 4;
    if (isPanelBlue(data[i], data[i + 1], data[i + 2])) rowHits[y]++;
  }
  // Narrow mini map windows have short title rows mostly covered by text: count lightly, bridge gaps.
  // A pale-blue sky or sea in the game can be the same blue and taller than the title strip, so
  // every blue stretch is tried from the top down; the first one shaped like a title strip wins.
  for (const [y0, y1] of allRuns(rowHits.map(count => count > Math.max(30, regionW * .05)), 3)) {
    const bandH = y1 - y0 + 1;
    if (bandH < height * .025 || bandH > height * .14) continue;
    const columns = [];
    for (let x = left; x < left + regionW; x++) {
      let hits = 0;
      for (let y = y0; y <= y1; y++) { const i = (y * width + x) * 4; if (isPanelBlue(data[i], data[i + 1], data[i + 2])) hits++; }
      columns.push(hits > bandH * .3);
    }
    const cols = longestRun(columns, 4);
    if (!cols || cols[1] - cols[0] < bandH * 1.8) continue; // narrow windows: text area ~2x its height
    // A sky is as wide as the screen region; the title strip ends at the window edge.
    if (cols[0] === 0 && cols[1] >= regionW - 1) continue;
    // The blue run is the text area; the square region emblem (not blue) sits just left of it.
    const textX = left + cols[0], right = left + cols[1];
    const x = Math.max(left, textX - Math.round(bandH * .97));
    // Inventory and other windows can have a pale-blue strip, but it is far wider
    // than a mini-map title. Reject it instead of OCRing a covered mini map.
    if (right - x + 1 > bandH * 12) continue;
    return { x, y: y0, w: right - x + 1, h: bandH, textX };
  }
  return null;
}

// Every run of set flags (gaps up to maxGap bridged), top to bottom.
function allRuns(flags, maxGap = 0) {
  const runs = [];
  let start = -1, last = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (start < 0 || i - last - 1 > maxGap) { if (start >= 0) runs.push([start, last]); start = i; } last = i; }
  }
  if (start >= 0) runs.push([start, last]);
  return runs;
}

export function titleTextRect(band) {
  if (band.collapsed) return { x: band.textX, y: band.y, w: band.textW, h: band.h };
  const x = band.textX ?? band.x;
  return { x, y: band.y, w: Math.max(1, band.x + band.w - x - Math.round(band.h * .1)), h: band.h };
}

// White outlined title text → black text on white, which Tesseract reads reliably (in place).
export function inkTitle(image, threshold = 200) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const ink = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114 > threshold;
    data[i] = data[i + 1] = data[i + 2] = ink ? 0 : 255; data[i + 3] = 255;
  }
  return image;
}

function components(mask, w, h) {
  const seen = new Uint8Array(w * h), found = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start]; seen[start] = 1;
    let count = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      count++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    found.push({ count, x: sx / count, y: sy / count, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return found;
}

// The map picture is boxed by a thin light frame (top line, bottom line, left/right edges). Finding
// that frame instead of assuming a size copes with the +/- buttons and with any game resolution.
// Returns null when there is no frame under the title: the mini map is collapsed to its title.
export function minimapBody(image, band) {
  const { width, height, data } = image;
  const light = (x, y) => { const i = (y * width + x) * 4; return isFrameLight(data[i], data[i + 1], data[i + 2]); };
  const rowLight = (y, x0, x1) => { let n = 0; for (let x = x0; x <= x1; x++) if (light(x, y)) n++; return n / (x1 - x0 + 1); };
  const colLight = (x, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) if (light(x, y)) n++; return n / (y1 - y0 + 1); };
  const sx0 = band.x + Math.round(band.w * .05), sx1 = Math.min(width - 1, band.x + Math.round(band.w * .95));
  let y = band.y + band.h, frameTop = -1;
  for (const end = Math.min(height - 1, y + Math.round(band.h * 1.1)); y <= end; y++) if (rowLight(y, sx0, sx1) > .85) { frameTop = y; break; }
  if (frameTop < 0) return null;
  while (y < height && rowLight(y, sx0, sx1) > .85) y++;
  const top = y;
  let bottom = -1;
  for (y = top + Math.max(4, Math.round(band.h * .3)); y < height; y++) if (rowLight(y, sx0, sx1) > .85) { bottom = y - 1; break; }
  if (bottom < 0 || bottom - top < band.h * .4) return null;
  // Side edges: the light columns nearest to the band's left and right ends.
  const reach = Math.round(band.h * .4);
  let left = band.x, right = Math.min(width - 1, band.x + band.w - 1);
  for (let x = Math.max(0, band.x - reach); x <= band.x + reach; x++) if (colLight(x, top, bottom) > .8) left = x + 1;
  for (let x = Math.min(width - 1, band.x + band.w - 1 + reach); x >= band.x + band.w - 1 - reach; x--) if (colLight(x, top, bottom) > .8) right = x - 1;
  return right - left < band.h ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

export function findMarkers(image, band) {
  if (band.collapsed) return { body: null, unit: band.h, player: null, portals: [], collapsed: true };
  const body = minimapBody(image, band), unit = band.h;
  if (!body) return { body: null, unit, player: null, portals: [], collapsed: true };
  const yellow = new Uint8Array(body.w * body.h), teal = new Uint8Array(body.w * body.h);
  for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
    const i = ((body.y + y) * image.width + body.x + x) * 4, r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    if (isPlayerYellow(r, g, b)) yellow[y * body.w + x] = 1;
    if (isPortalTeal(r, g, b)) teal[y * body.w + x] = 1;
  }
  const dot = components(yellow, body.w, body.h)
    .filter(c => c.w >= unit * .07 && c.h >= unit * .07 && c.w <= unit * .25 && c.h <= unit * .25 && c.count / (c.w * c.h) >= .45 && Math.max(c.w, c.h) / Math.min(c.w, c.h) <= 1.6)
    .sort((a, b) => b.count - a.count)[0];
  const portals = components(teal, body.w, body.h)
    .filter(c => c.count >= unit * unit * .0035 && c.w <= unit * .35 && c.h <= unit * .35)
    .map(c => ({ x: body.x + c.x, y: body.y + c.y }));
  return { body, unit, player: dot ? { x: body.x + dot.x, y: body.y + dot.y } : null, portals, collapsed: false };
}

// Mini map layout = picture size relative to the title strip. Expanding or shrinking the mini map
// changes it (and may change the zoom), so learned scales are remembered per layout.
export function minimapLayout(band, body) {
  return body ? { w: body.w / band.h, h: body.h / band.h } : null;
}

export function recallScale(memory, layout) {
  if (!layout || !Array.isArray(memory)) return null;
  const close = (a, b) => Math.abs(a - b) <= Math.max(a, b) * .06;
  return memory.find(entry => close(entry.w, layout.w) && close(entry.h, layout.h))?.scale ?? null;
}

export function rememberScale(memory, layout, scale) {
  if (!layout || !Number.isFinite(scale)) return memory ?? [];
  const list = Array.isArray(memory) ? [...memory] : [];
  const known = list.findIndex(entry => recallScale([entry], layout) !== null);
  if (known >= 0) list[known] = { ...list[known], scale: list[known].scale * .8 + scale * .2 };
  else list.unshift({ ...layout, scale });
  return list.slice(0, 8);
}

// Finds the scale/offset that maps world portal coordinates onto the detected rings. The minimap
// scrolls with the player, so offset changes every frame; scale is shared by x and y and stays
// constant for a given UI size, so `hint.scale` (scale per band-height unit) narrows the search.
export function fitMinimap(rings, worldPortals, unit, hint = null) {
  const world = worldPortals.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!rings.length || !world.length) return null;
  const tolerance = Math.max(4, unit * .12);
  const score = (s, ox, oy) => {
    let inliers = 0, error = 0; const matches = [];
    for (const ring of rings) {
      let best = Infinity, match = null;
      for (const portal of world) { const d = Math.abs(ring.x - (s * portal.x + ox)) + Math.abs(ring.y - (s * portal.y + oy)); if (d < best) { best = d; match = portal; } }
      if (best <= tolerance) { inliers++; error += best; matches.push(match); }
    }
    return { scale: s, ox, oy, inliers, error, matches };
  };
  let best = null;
  const consider = fit => { if (fit.inliers && (!best || fit.inliers > best.inliers || (fit.inliers === best.inliers && fit.error < best.error))) best = fit; };
  const minS = unit * .0003, maxS = unit * .012;
  for (let i = 0; i < rings.length; i++) for (let j = 0; j < rings.length; j++) {
    if (i === j || rings[j].x <= rings[i].x) continue;
    for (const a of world) for (const b of world) {
      if (b.x <= a.x) continue;
      const s = (rings[j].x - rings[i].x) / (b.x - a.x);
      if (s < minS || s > maxS) continue;
      if (hint?.scale && Math.abs(s / unit - hint.scale) > hint.scale * .12) continue;
      consider(score(s, rings[i].x - s * a.x, rings[i].y - s * a.y));
    }
  }
  if (hint?.scale && (!best || best.inliers < 2)) {
    const s = hint.scale * unit;
    for (const ring of rings) for (const portal of world) consider(score(s, ring.x - s * portal.x, ring.y - s * portal.y));
  }
  if (!best) return null;
  if (best.inliers < 2 && !hint?.scale) return null; // one ring alone cannot fix the scale
  return { ...best, scalePerUnit: best.scale / unit };
}

export function toWorld(fit, point) {
  return { x: (point.x - fit.ox) / fit.scale, y: (point.y - fit.oy) / fit.scale };
}

// Plain-language hint from the player's map position to the portal they need. One game screen is
// roughly 1000 map units wide, which keeps distances meaningful without promising precision.
export function guidance(player, portal) {
  if (!player || !Number.isFinite(portal?.x)) return null;
  const dx = portal.x - player.x, dy = Number.isFinite(portal.y) ? portal.y - player.y : 0;
  const near = Math.abs(dx) < 90 && Math.abs(dy) < 120;
  const side = dx > 0 ? 'right' : 'left';
  const distance = Math.abs(dx) < 450 ? 'a few steps' : Math.abs(dx) < 1100 ? 'about one screen' : `about ${Math.max(2, Math.round(Math.abs(dx) / 1000))} screens`;
  const vertical = dy < -120 ? 'up' : dy > 120 ? 'down' : '';
  let text;
  if (near) text = 'You are at the portal';
  else if (Math.abs(dx) < 90) text = vertical === 'up' ? 'The portal is above you, climb up' : 'The portal is below you, drop down';
  else text = `Head ${side}, ${distance}${vertical === 'up' ? ', then climb up' : vertical === 'down' ? ', then drop down' : ''}`;
  return { dx, dy, near, side: Math.abs(dx) < 90 ? null : side, vertical: vertical || null, text };
}

// Maps without a mini map (shops, houses) and collapsed mini maps show only a one-line light-grey
// title bar: dark "Street : Map name" text, two grey -/+ buttons and a gold WORLD button. Found by
// the WORLD button with light bar to its left. Returned in the same shape as a title band.
const isWorldGold = (r, g, b) => r > 170 && g > 120 && g < 210 && b < 120 && r - g > 15 && r - g < 100;
const isBarLight = (r, g, b) => Math.min(r, g, b) > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 18;

export function findTitleBar(image, { frameHeight = image.height } = {}) {
  const { width, height, data } = image;
  const px = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const rows = [], maxY = Math.min(height, Math.round(frameHeight * .25)), minGold = Math.max(6, frameHeight * .008);
  for (let y = 0; y < maxY; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && isWorldGold(...px(x, y));
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        const w = x - start;
        if (w >= minGold && w <= frameHeight * .12) {
          const from = Math.max(0, start - w * 10);
          let light = 0; for (let lx = from; lx < start; lx++) if (isBarLight(...px(lx, y))) light++;
          if (start - from > w * 3 && light / (start - from) > .3) { rows.push({ y, a: start, w }); break; }
        }
        start = -1;
      }
    }
  }
  if (!rows.length) return null;
  const group = rows.filter(row => row.y - rows[0].y <= rows[0].w && Math.abs(row.a - rows[0].a) <= 3);
  if (group.length < 3) return null;
  const y0 = group[0].y, y1 = group[group.length - 1].y, h = y1 - y0 + 1, goldX = group[0].a, goldW = Math.max(...group.map(r => r.w));
  // Left end of the bar: walk left along a row above the text while it stays light.
  const scanY = Math.max(0, y0 - Math.max(1, Math.round(h * .3)));
  // Start past the grey -/+ buttons that sit between the text and WORLD.
  const from = Math.max(0, goldX - Math.round(goldW * 1.8));
  let left = from, misses = 0;
  for (let x = from; x >= 0 && misses < 6; x--) { if (isBarLight(...px(x, scanY))) { left = x; misses = 0; } else misses++; }
  const top = Math.max(0, y0 - Math.round(h * .45)), textW = goldX - Math.round(goldW * 1.4) - left; // up to the -/+ buttons
  if (textW < goldW * 2) return null;
  return { x: left, y: top, w: goldX - left, h: Math.min(height - top, h + Math.round(h * .9)), textX: left + 2, textW, collapsed: true };
}
