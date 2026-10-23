// Finds where the in-game mini map (a scaled, scrolled view of the map's mini map picture) sits in
// the OSMS picture. Both images are ImageData-like RGBA. The screen crop is shrunk by `k` (screen
// pixels per picture pixel) and slid over the picture, scoring brightness *patterns* with normalized
// cross-correlation over opaque picture pixels: dark maps (Deep Forest) would otherwise "match"
// anywhere dark. Coarse-to-fine so tall maps stay fast.

function shrink(image, factor) {
  const w = Math.max(1, Math.round(image.width / factor)), h = Math.max(1, Math.round(image.height / factor));
  const lum = new Float32Array(w * h), alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * factor), x1 = Math.max(x0 + 1, Math.floor((x + 1) * factor)), y0 = Math.floor(y * factor), y1 = Math.max(y0 + 1, Math.floor((y + 1) * factor));
    let l = 0, a = 0, n = 0;
    for (let yy = y0; yy < Math.min(y1, image.height); yy++) for (let xx = x0; xx < Math.min(x1, image.width); xx++) {
      const i = (yy * image.width + xx) * 4; l += image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114; a += image.data[i + 3]; n++;
    }
    lum[y * w + x] = l / n; alpha[y * w + x] = a / n;
  }
  return { width: w, height: h, lum, alpha };
}

// Correlation of crop placed at (ox, oy) over opaque picture pixels; -2 when too little overlaps.
function score(pic, crop, ox, oy, minOverlap) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  const yEnd = Math.min(crop.height, pic.height - oy), xEnd = Math.min(crop.width, pic.width - ox);
  for (let y = Math.max(0, -oy); y < yEnd; y++) for (let x = Math.max(0, -ox); x < xEnd; x++) {
    const p = (y + oy) * pic.width + x + ox;
    if (pic.alpha[p] < 128 || crop.alpha[y * crop.width + x] < 128) continue; // transparent in either image
    const a = pic.lum[p], b = crop.lum[y * crop.width + x];
    n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  if (n < minOverlap) return -2;
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return va > 1 && vb > 1 ? (sab / n - (sa / n) * (sb / n)) / Math.sqrt(va * vb) : -2;
}

const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

// Best and runner-up (at least `apart` px away) over a grid of offsets.
function scan(pic, crop, xs, ys, minOverlap, apart) {
  let best = { s: -3, ox: 0, oy: 0 }, second = { s: -3 };
  for (const oy of ys) for (const ox of xs) {
    const s = score(pic, crop, ox, oy, minOverlap);
    if (s > best.s) { if (Math.abs(ox - best.ox) + Math.abs(oy - best.oy) > apart) second = best; best = { s, ox, oy }; }
    else if (s > second.s && Math.abs(ox - best.ox) + Math.abs(oy - best.oy) > apart) second = { s, ox, oy };
  }
  return { best, second };
}

const AMBIGUOUS_MARGIN = .06, MIN_SCORE = .3;

// Returns { x, y, score, margin, ambiguous } with (x, y) the picture pixel at the crop's top-left
// corner, or null. `near` ({ x, y }) searches around the previous match first.
// Shrunk copies of the (unchanging) map pictures are reused between frames.
const shrinkCache = new WeakMap();
function shrinkCached(image, factor) {
  let byFactor = shrinkCache.get(image);
  if (!byFactor) shrinkCache.set(image, byFactor = new Map());
  if (!byFactor.has(factor)) byFactor.set(factor, shrink(image, factor));
  return byFactor.get(factor);
}
const stepRange = (a, b, step) => { const out = []; for (let v = a; v <= b; v += step) out.push(v); return out; };

const opaqueCache = new WeakMap();
function opaqueShare(pic) {
  if (!opaqueCache.has(pic)) { let n = 0; for (const a of pic.alpha) if (a >= 128) n++; opaqueCache.set(pic, n / pic.alpha.length); }
  return opaqueCache.get(pic);
}

export function locateInPicture(picture, screenCrop, k, { coarse = 3, near = null } = {}) {
  const pic = shrinkCached(picture, 1), crop = shrink(screenCrop, k);
  // Only opaque picture pixels are compared: sparse pictures (platforms on a transparent background,
  // like the Ellinia forests) need a proportionally smaller overlap.
  const overlap = Math.max(150, .3 * Math.min(crop.width, pic.width) * Math.min(crop.height, pic.height) * Math.min(1, opaqueShare(pic) * 1.5));
  if (near) {
    // Every other offset within ±12 px, then the best one's neighbours.
    const nx = Math.round(near.x), ny = Math.round(near.y);
    const rough = scan(pic, crop, stepRange(nx - 12, nx + 12, 2), stepRange(ny - 12, ny + 12, 2), overlap, 99).best;
    const { best } = scan(pic, crop, range(rough.ox - 1, rough.ox + 1), range(rough.oy - 1, rough.oy + 1), overlap, 99);
    if (best.s >= MIN_SCORE) return { x: best.ox, y: best.oy, score: best.s, margin: null, ambiguous: false, local: true };
  }
  const cp = shrinkCached(picture, coarse), cc = shrink(screenCrop, k * coarse);
  const rough = scan(cp, cc, range(-Math.floor(cc.width * .5), cp.width - Math.ceil(cc.width * .5)), range(-Math.floor(cc.height * .5), cp.height - Math.ceil(cc.height * .5)), overlap / (coarse * coarse), 2);
  if (rough.best.s < MIN_SCORE * .8) return null;
  const { best } = scan(pic, crop, range(rough.best.ox * coarse - coarse * 2, rough.best.ox * coarse + coarse * 2), range(rough.best.oy * coarse - coarse * 2, rough.best.oy * coarse + coarse * 2), overlap, 99);
  if (best.s < MIN_SCORE) return null;
  const margin = rough.best.s - rough.second.s;
  return { x: best.ox, y: best.oy, score: best.s, margin, ambiguous: margin < AMBIGUOUS_MARGIN };
}

// Screen pixels per picture pixel is unknown the first time a mini map size is seen. The right scale
// is the one where the best placement stands out most from the runner-up.
export function findPictureScale(picture, screenCrop, ks = [1, 1.15, 1.3, 1.4, 1.47, 1.55, 1.7, 1.85, 2, 2.25, 2.5]) {
  let best = null;
  for (const k of ks) {
    const found = locateInPicture(picture, screenCrop, k);
    if (found && !found.ambiguous && (!best || found.margin > best.margin)) best = { ...found, k };
  }
  return best;
}

// Lines up two still pictures of the same map at the same scale (the mini map picture and the full
// map render shrunk 16x). Returns how far to shift `small` to land on `big`.
export function registerPictures(big, small, { slack = 40 } = {}) {
  const b = shrink(big, 1), s = shrink(small, 1);
  const overlap = .3 * Math.min(s.width, b.width) * Math.min(s.height, b.height);
  const coarse = 2, cb = shrink(big, coarse), cs = shrink(small, coarse);
  const rough = scan(cb, cs, range(-Math.ceil(slack / coarse), Math.ceil((b.width - s.width + slack) / coarse)), range(-Math.ceil(slack / coarse), Math.ceil((b.height - s.height + slack) / coarse)), overlap / (coarse * coarse), 2);
  if (rough.best.s < MIN_SCORE) return null;
  const { best } = scan(b, s, range(rough.best.ox * coarse - 3, rough.best.ox * coarse + 3), range(rough.best.oy * coarse - 3, rough.best.oy * coarse + 3), overlap, 99);
  return best.s >= MIN_SCORE ? { dx: best.ox, dy: best.oy, score: best.s, margin: rough.best.s - rough.second.s } : null;
}

// A map narrower (or shorter) than the mini map window is drawn centred, with the window's light
// see-through backing on either side. Those strips are not part of the picture: cut them off.
// Returns { crop, dx, dy } (dx/dy = columns/rows removed on the left/top), or the crop unchanged.
export function trimSeeThrough(crop) {
  const { width: w, height: h, data } = crop;
  const lum = i => data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
  const cols = Array.from({ length: w }, (_, x) => { let s = 0; for (let y = 0; y < h; y++) s += lum((y * w + x) * 4); return s / h; });
  const rows = Array.from({ length: h }, (_, y) => { let s = 0; for (let x = 0; x < w; x++) s += lum((y * w + x) * 4); return s / w; });
  const edges = means => {
    const middle = [...means.slice(Math.floor(means.length * .4), Math.ceil(means.length * .6))].sort((a, b) => a - b);
    const ref = middle[Math.floor(middle.length / 2)], strip = v => v > ref + 70 && v > 120;
    let a = 0, b = means.length;
    while (a < means.length * .45 && strip(means[a])) a++;
    while (b > means.length * .55 && strip(means[b - 1])) b--;
    // The map is centred, so real strips sit on BOTH sides and are about as wide; one bright edge
    // (ground or sky at the bottom of a short map) is not a strip.
    const left = a, right = means.length - b;
    // ...and real strips are wide (a few % of the window), not the thin frame edge (Construction Site).
    const min = Math.max(6, means.length * .05);
    return left >= min && right >= min && Math.abs(left - right) <= Math.max(4, .25 * Math.max(left, right)) ? [a, b] : [0, means.length];
  };
  const [x0, x1] = edges(cols), [y0, y1] = edges(rows);
  if (x0 === 0 && x1 === w && y0 === 0 && y1 === h) return { crop, dx: 0, dy: 0 };
  const out = { width: x1 - x0, height: y1 - y0, data: new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4) };
  for (let y = y0; y < y1; y++) out.data.set(data.subarray((y * w + x0) * 4, (y * w + x1) * 4), (y - y0) * out.width * 4);
  return { crop: out, dx: x0, dy: y0, trimmedX: x0 > 0 || x1 < w, trimmedY: y0 > 0 || y1 < h };
}

// Game windows dragged over the mini map (inventory, stats…) are flat light-grey/white panels with
// dark text. Their pixels are made transparent so only the visible part of the map is compared.
// Returns the share of the crop that was covered (0–1).
export function maskCovered(crop) {
  const { width: w, height: h, data } = crop;
  const panel = i => { const r = data[i], g = data[i + 1], b = data[i + 2]; return r > 196 && g > 196 && b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 28; };
  // Only solid patches count (a whole 6x6 block of panel colour), so thin white map details stay.
  const B = 6, covered = new Uint8Array(w * h);
  for (let by = 0; by + B <= h; by += 3) for (let bx = 0; bx + B <= w; bx += 3) {
    let all = true;
    for (let y = by; y < by + B && all; y++) for (let x = bx; x < bx + B; x++) if (!panel((y * w + x) * 4)) { all = false; break; }
    if (all) for (let y = by; y < by + B; y++) covered.fill(1, y * w + bx, y * w + bx + B);
  }
  // Grow by a few pixels so the panel's dark text and borders go too.
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let near = false;
    for (let dy = -4; dy <= 4 && !near; dy += 2) for (let dx = -4; dx <= 4; dx += 2) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && covered[yy * w + xx]) { near = true; break; } }
    if (near) { data[(y * w + x) * 4 + 3] = 0; n++; }
  }
  return n / (w * h);
}
