// Nearest-neighbour resize for private, simulated Deck-size OCR fixtures.
// It does not modify screenshots or fetch game data in the shipped app.
export function deckSizedFrame(image, width = 1280, height = 800) {
  if (!image?.width || !image?.height || image.data?.length !== image.width * image.height * 4) throw new Error('Invalid RGBA frame');
  const contentHeight = Math.min(height, Math.round(image.height * width / image.width));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < contentHeight; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor(y * image.height / contentHeight));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(x * image.width / width));
      const from = (sourceY * image.width + sourceX) * 4;
      data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data, contentHeight };
}

export const pictureScaleForWidth = width => width / 1366;
