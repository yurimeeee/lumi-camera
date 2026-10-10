#!/usr/bin/env node
/**
 * Copies ONNX Runtime Web (ESM bundle + WASM) into `public/ort/` so the web
 * build serves the installed version. Loaded by the browser directly (like
 * MediaPipe), only when the user runs AI object removal on web.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const dest = path.join(__dirname, '..', 'public', 'ort');
const FILES = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

fs.mkdirSync(dest, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(src, file), path.join(dest, file));
console.log(`ONNX Runtime Web copied to ${path.relative(process.cwd(), dest)}`);
