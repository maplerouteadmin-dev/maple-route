import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('bundles every Tesseract core variant the browser loader can select', () => {
  for (const stem of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-relaxedsimd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
    for (const extension of ['wasm.js', 'wasm']) {
      assert.ok(statSync(resolve(`public/ocr/core/${stem}.${extension}`)).size > 0);
    }
  }
  assert.ok(statSync(resolve('public/ocr/worker.min.js')).size > 0);
  assert.ok(statSync(resolve('public/ocr/lang/eng.traineddata.gz')).size > 0);
});
