import { copyFile, mkdir } from 'node:fs/promises'

const output = new URL('../public/ocr/', import.meta.url)
const modules = new URL('../node_modules/', import.meta.url)
const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]
await mkdir(output, { recursive: true })
await Promise.all(files.map(([source, target]) =>
  copyFile(new URL(source, modules), new URL(target, output))
))
