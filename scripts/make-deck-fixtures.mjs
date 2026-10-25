// Local-only, simulated 1280x800 samples from existing private fixtures.
// Real Deck captures must replace these for validation; fixtures/screens is gitignored.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deckSizedFrame } from '../desktop/deck-fixtures.mjs';

const names = ['henesys-1-1366', 'henesys-2', 'questwin-8'];
for (const name of names) {
  const base = new URL(`../fixtures/screens/${name}`, import.meta.url);
  const meta = new URL(`${base.href}.json`), raw = new URL(`${base.href}.rgba`);
  if (!existsSync(meta) || !existsSync(raw)) continue;
  const { width, height } = JSON.parse(readFileSync(meta, 'utf8'));
  const scaled = deckSizedFrame({ width, height, data: new Uint8ClampedArray(readFileSync(raw)) });
  const out = new URL(`../fixtures/screens/deck-sim-${name}`, import.meta.url);
  writeFileSync(fileURLToPath(new URL(`${out.href}.rgba`)), scaled.data);
  writeFileSync(fileURLToPath(new URL(`${out.href}.json`)), JSON.stringify({ width: scaled.width, height: scaled.height, contentHeight: scaled.contentHeight, derivedFrom: name, simulated: true }));
  console.log(`Created private simulated fixture deck-sim-${name}`);
}
