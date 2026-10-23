import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('public/ocr');
mkdirSync(`${target}/core`, { recursive: true });
mkdirSync(`${target}/lang`, { recursive: true });
copyFileSync(resolve('node_modules/tesseract.js/dist/worker.min.js'), `${target}/worker.min.js`);
for (const stem of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-relaxedsimd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  for (const extension of ['wasm.js', 'wasm']) {
    copyFileSync(resolve(`node_modules/tesseract.js-core/${stem}.${extension}`), `${target}/core/${stem}.${extension}`);
  }
}
copyFileSync(resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), `${target}/lang/eng.traineddata.gz`);
