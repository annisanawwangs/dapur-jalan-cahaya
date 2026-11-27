import { canAutoImport, hasSlipData, parseRequest, splitRequestText } from './requestParse'

const splitFields = [
  ['Tanggal', .18, .139, .47, .164],
  ['Nama SPA/Santri', .18, .251, .47, .276],
  ['Divisi/Departemen', .18, .285, .47, .31],
  ['No HP/WA', .18, .35, .47, .374],
  ['Tujuan Transaksi', .195, .4, .465, .46],
  ['No Rekening', .175, .568, .34, .594],
  ['Atas Nama', .18, .601, .47, .624],
  ['Bank', .18, .633, .47, .655],
  ['Total Nominal', .74, .437, .93, .472],
]

const transactionLabels = ['Uang Muka','Pembayaran','Penyaluran','Klaim/Reimburse','Retur Dana','Tunjangan','Pinjaman']
const methodLabels = ['Tunai','Transfer','Virtual Account']
const criticalFields = new Set(['Tanggal','Nama SPA/Santri','Tujuan Transaksi','No Rekening','Total Nominal'])
const recognizable = texts => texts.map(text => ({ text }))
const parseImported = ({text,issues}) => {
  const slip = parseRequest(text)
  return issues?.length ? {...slip,issues:[...new Set([...(slip.issues||[]),...issues])]} : slip
}
const lowConfidence = confidence => Number.isFinite(confidence) && confidence < 80

async function readSlip(canvas, index, recognize, progress) {
  const { width, height } = canvas
  const half = height / 2
  const offset = index * 1.01
  const lines = []
  const issues = []
  for (const [label, left, top, right, bottom] of splitFields) {
    progress('Slip ' + (index + 1) + ' · ' + label)
    const crop = document.createElement('canvas')
    const cropWidth = (right - left) * width
    const cropHeight = (bottom - top) * half
    crop.width = Math.ceil(cropWidth) + 40
    crop.height = Math.ceil(cropHeight) + 40
    const context = crop.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, crop.width, crop.height)
    context.drawImage(canvas, left * width, (offset + top) * half, cropWidth, cropHeight, 20, 20, cropWidth, cropHeight)
    const numeric = label === 'Total Nominal'
    const {text,confidence} = await recognize(crop, label === 'Tujuan Transaksi' ? '6' : '7', numeric)
    if (text) {
      lines.push(label + ': ' + text.replace(/\s*\n\s*/g, ' '))
      if (criticalFields.has(label) && lowConfidence(confidence)) issues.push(label+' perlu diperiksa dari hasil pindai.')
    }
    crop.width = 1
    crop.height = 1
  }
  const context = canvas.getContext('2d')
  const radius = Math.max(2, Math.round(width * 2.6 / 990))
  const side = radius * 2 + 1
  function getChecked(positions, row, labels) {
    const selected = positions.map((column, i) => {
      const x = Math.round(column * width / 990)
      const y = Math.round((row + 700 * offset) * height / 1400)
      const { data } = context.getImageData(x - radius, y - radius, side, side)
      let dark = 0
      for (let j = 0; j < data.length; j += 4) {
        if (data[j] + data[j + 1] + data[j + 2] < 360) dark++
      }
      return dark / (side * side) > .12 ? labels[i] : null
    }).filter(Boolean)
    return selected.length === 1 ? selected[0] : null
  }
  const type = getChecked([210,319,432,540,671,779,885], 158, transactionLabels)
  const method = getChecked([201,277,390], 383, methodLabels)
  if (type) lines.push('Jenis transaksi: ' + type)
  if (method) lines.push('Metode: ' + method)
  return { text: lines.join('\n'), issues }
}

const isPDF = file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

export class ImportAssetsError extends Error {
  constructor(cause) {
    super('Komponen impor belum dapat dimuat. Muat ulang aplikasi, lalu pilih file lagi.', { cause })
  }
}

async function loadAssets(load) {
  try {
    return await load()
  } catch (error) {
    throw new ImportAssetsError(error)
  }
}

export async function readRequestFile(file, { split = false, progress = () => {}, signal } = {}) {
  const cancelled = new DOMException('Impor dibatalkan.', 'AbortError')
  if (signal?.aborted) throw cancelled
  if (file.size > 50 * 1024 * 1024) throw new Error('Ukuran dokumen maksimal 50 MB.')
  if (/\.txt$/i.test(file.name)) return { slips: splitRequestText(await file.text()).map(text=>parseRequest(text)), split: false }
  if (/\.docx$/i.test(file.name)) {
    const { default: mammoth } = await loadAssets(() => import('mammoth/mammoth.browser.js'))
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { slips: splitRequestText(result.value).map(text=>parseRequest(text)), split: false }
  }
  if (!isPDF(file) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Gunakan PDF, DOCX, TXT, JPG, PNG, atau WEBP.')
  }

  let stopped = false
  let worker
  let pdf
  let renderTask
  let timeout
  let phase = 'membuka dokumen'
  const ensureRunning = () => {
    if (stopped || signal?.aborted) throw cancelled
  }
  const report = message => {
    if (!stopped && !signal?.aborted) progress(message)
  }
  async function step(label, operation, timeoutMs = 35000) {
    ensureRunning()
    phase = label
    let deadline
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Impor terhenti saat ' + label + '. Coba unggah kembali atau gunakan foto yang lebih kecil.')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(deadline)
    }
  }

  async function recognize(input, mode = '6', numeric = false) {
    ensureRunning()
    if (!worker) {
      const { createWorker } = await loadAssets(() => import('tesseract.js'))
      ensureRunning()
      report('Menyiapkan pembaca gambar (OCR)…')
      let rejectWorker
      const failedWorker = new Promise((_, reject) => { rejectWorker = reject })
      const loadingWorker = createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: '/ocr',
        workerBlobURL: false,
        errorHandler: error => rejectWorker(new Error('Pembaca gambar (OCR) gagal dimuat atau dijalankan.', { cause: error })),
      }).then(loadedWorker => {
        if (stopped || signal?.aborted) loadedWorker.terminate().catch(() => {})
        else worker = loadedWorker
        return loadedWorker
      })
      await step('menyiapkan pembaca gambar (OCR)', () => Promise.race([loadingWorker, failedWorker]))
      ensureRunning()
    }
    return step('membaca gambar (OCR)', async () => {
      await worker.setParameters({
        tessedit_pageseg_mode: mode,
        tessedit_char_whitelist: numeric ? '0123456789.,-' : '',
        preserve_interword_spaces: '1',
      })
      const {data:{text,confidence}}=await worker.recognize(input)
      return {text:text.trim(),confidence}
    }, 45000)
  }

  function splitScanned({text,confidence}) {
    const issues=lowConfidence(confidence)?['Sebagian teks hasil pindai kurang jelas. Periksa data sebelum menyimpan.']:[]
    return splitRequestText(text).map(part=>({text:part,issues}))
  }

  async function read() {
    if (!isPDF(file)) {
      report('Membaca gambar…')
      return { slips: splitScanned(await recognize(file)).map(parseImported), split: false }
    }
    const [pdfjs, workerAsset] = await loadAssets(() => Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]))
    ensureRunning()
    pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default
    const data = await file.arrayBuffer()
    ensureRunning()
    pdf = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      canvasMaxAreaInBytes: 24 * 1024 * 1024,
    })
    const documentFile = await step('membuka PDF', () => pdf.promise)
    if (documentFile.numPages > 10) throw new Error('PDF maksimal 10 halaman.')
    const slips = []
    let splitPage = false
    for (let number = 1; number <= documentFile.numPages; number++) {
      ensureRunning()
      const pageLabel = 'halaman ' + number + ' dari ' + documentFile.numPages
      report('Membaca teks ' + pageLabel + '…')
      const page = await step('membuka ' + pageLabel, () => documentFile.getPage(number))
      const content = await step('membaca teks ' + pageLabel, () => page.getTextContent())
      const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')
      const textSlips = splitRequestText(text)
      if (textSlips.length > 1 || (!split && hasSlipData(parseRequest(text)))) {
        splitPage ||= textSlips.length > 1
        slips.push(...recognizable(textSlips))
        continue
      }
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(1800 / natural.width, 2600 / natural.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      report('Menyiapkan gambar ' + pageLabel + '…')
      renderTask = page.render({ canvas, viewport })
      await step('menyiapkan gambar ' + pageLabel, () => renderTask.promise)
      renderTask = null
      report('Membaca hasil pindai ' + pageLabel + '…')
      const scanned = splitScanned(await recognize(canvas))
      if (scanned.length > 1 || (!split && canAutoImport(parseRequest(scanned[0].text)))) {
        splitPage ||= scanned.length > 1
        slips.push(...scanned)
      } else {
        const halves = [await readSlip(canvas, 0, recognize, report), await readSlip(canvas, 1, recognize, report)]
        const looksLikeTwo = halves.every(half => {
          const { header, items } = parseRequest(half.text)
          return header.requester && header.purpose && items.length
        })
        splitPage ||= split || looksLikeTwo
        slips.push(...(split || looksLikeTwo ? halves : scanned))
      }
      canvas.width = 1
      canvas.height = 1
      page.cleanup()
    }
    return { slips: slips.map(parseImported), split: splitPage }
  }

  let abort
  try {
    return await Promise.race([
      read(),
      new Promise((_, reject) => {
        abort = () => reject(cancelled)
        if (signal?.aborted) abort()
        else signal?.addEventListener('abort', abort, { once: true })
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Impor melebihi 3 menit saat ' + phase + '. Coba unggah halaman satu per satu.')), 180000)
      }),
    ])
  } finally {
    stopped = true
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    renderTask?.cancel()
    if (worker) worker.terminate().catch(() => {})
    if (pdf) pdf.destroy().catch(() => {})
  }
}
