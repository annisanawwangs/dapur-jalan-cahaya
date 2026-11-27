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

async function readSlip(canvas, index, recognize, progress) {
  const { width, height } = canvas
  const half = height / 2
  const offset = index * 1.01
  const lines = []
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
    const numeric = label === 'No Rekening' || label === 'Total Nominal'
    const text = await recognize(crop, label === 'Tujuan Transaksi' ? '6' : '7', numeric)
    if (text) lines.push(label + ': ' + text.replace(/\s*\n\s*/g, ' '))
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
  return lines.join('\n')
}

const isPDF = file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

export async function readRequestFile(file, { split = false, progress = () => {} } = {}) {
  if (file.size > 50 * 1024 * 1024) throw new Error('Ukuran dokumen maksimal 50 MB.')
  if (/\.txt$/i.test(file.name)) return [await file.text()]
  if (/\.docx$/i.test(file.name)) {
    const { default: mammoth } = await import('mammoth/mammoth.browser.js')
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return [result.value]
  }
  if (!isPDF(file) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Gunakan PDF, DOCX, TXT, JPG, PNG, atau WEBP.')
  }

  let stopped = false
  let worker
  let pdf
  let timeout
  const ensureRunning = () => {
    if (stopped) throw new Error('Pembacaan dihentikan.')
  }

  async function recognize(input, mode = '6', numeric = false) {
    ensureRunning()
    if (!worker) {
      const { createWorker } = await import('tesseract.js')
      ensureRunning()
      const loadedWorker = await createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: '/ocr',
        workerBlobURL: false,
      })
      if (stopped) await loadedWorker.terminate()
      ensureRunning()
      worker = loadedWorker
    }
    await worker.setParameters({
      tessedit_pageseg_mode: mode,
      tessedit_char_whitelist: numeric ? '0123456789.,' : '',
      preserve_interword_spaces: '1',
    })
    return (await worker.recognize(input)).data.text.trim()
  }

  async function read() {
    if (!isPDF(file)) {
      progress('Membaca gambar…')
      return [await recognize(file)]
    }
    const [pdfjs, workerAsset] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    ensureRunning()
    pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default
    pdf = pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false })
    const documentFile = await pdf.promise
    if (documentFile.numPages > 10) throw new Error('PDF maksimal 10 halaman.')
    const slips = []
    for (let number = 1; number <= documentFile.numPages; number++) {
      ensureRunning()
      progress('Halaman ' + number + ' dari ' + documentFile.numPages)
      const page = await documentFile.getPage(number)
      if (!split) {
        const content = await page.getTextContent()
        const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')
        if (text.trim().length > 40) {
          slips.push(text)
          continue
        }
      }
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2480 / natural.width, 4000 / natural.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      if (split) {
        slips.push(await readSlip(canvas, 0, recognize, progress))
        slips.push(await readSlip(canvas, 1, recognize, progress))
      } else {
        slips.push(await recognize(canvas))
      }
      canvas.width = 1
      canvas.height = 1
    }
    return slips
  }

  try {
    return await Promise.race([
      read(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Pembacaan melebihi 3 menit. Coba dokumen yang lebih jelas atau gunakan input manual.')), 180000)
      }),
    ])
  } finally {
    stopped = true
    clearTimeout(timeout)
    if (worker) await worker.terminate().catch(() => {})
    if (pdf) await pdf.destroy().catch(() => {})
  }
}
