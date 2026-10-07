#!/usr/bin/env node
/**
 * Copies MediaPipe's vision bundle and WASM runtime into `public/mediapipe/`
 * so the web build serves the exact version that is installed. The bundle is
 * loaded by the browser directly, not through Metro, which cannot transform
 * its dynamic `import(url)` (see src/services/faceDetection/backend.web.ts).
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision');
const dest = path.join(__dirname, '..', 'public', 'mediapipe');
const FILES = [
  'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
];

fs.mkdirSync(dest, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(src, file), path.join(dest, path.basename(file)));
console.log(`MediaPipe runtime copied to ${path.relative(process.cwd(), dest)}`);
