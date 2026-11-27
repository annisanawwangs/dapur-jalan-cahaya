import { requestSubtotalCents, requestTotal } from './domain.js'

const fields = {
  requester: 'Nama SPA\\s*/\\s*Santri(?:\\s*/\\s*Pemohon)?|Nama Pemohon|Pemohon',
  department: 'Divisi\\s*/\\s*Departemen|Divisi|Departemen',
  position_title: 'Amanah(?:\\s*/\\s*Jabatan)?|Jabatan',
  phone: 'No\\.?\\s*HP\\s*/\\s*WA|No HP|No WA',
  purpose: 'Tujuan Transaksi|Keperluan',
  account_number: 'No\\.?\\s*Rekening(?:\\s*/\\s*VA)?|Nomor Rekening',
  account_name: 'Atas Nama',
  bank_name: 'Bank',
  program: 'Program internal|Program',
  vendor_name: 'Nama Vendor/Toko/Marketplace|Vendor',
  invoice_no: 'No Invoice/Nota/Pesanan|No Invoice',
  vendor_address: 'Alamat/Link',
  notes: 'Catatan',
}

const months = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember']
const transactionTypes = [
  ['uang muka','advance'], ['pembayaran','payment'], ['penyaluran','disbursement'],
  ['klaim\\s*/\\s*reimburse|klaim|reimburse','claim_reimburse'], ['retur(?: dana)?','refund'],
  ['tunjangan','allowance'], ['pinjaman','loan'],
]
const paymentTypes = [
  ['tunai|cash','cash'], ['transfer(?:\\s*/\\s*top up)?','transfer'], ['virtual account|va','virtual_account'],
]
const indent = /^[ \t]*/
const clean = value => value.trim().replace(/[ \t]+/g, ' ')
const looksLikePaymentChoices = value => /[✓✔☑]|\[x\]/i.test(value) ||
  paymentTypes.filter(([label]) => new RegExp('\\b(?:'+label+')\\b','i').test(value)).length > 1

function parseDate(value) {
  const iso = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/)
  const named = value.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(20\d{2})$/i)
  const numeric = value.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})$/)
  const monthName = named?.[2].toLowerCase()
  const namedMonth = months.findIndex(month => month === monthName || month.slice(0, 3) === monthName) + 1
  const dateParts = iso ? [iso[1], iso[2], iso[3]]
    : named ? [named[3], namedMonth, named[1]]
    : numeric && [numeric[3].length === 2 ? '20' + numeric[3] : numeric[3], numeric[2], numeric[1]]
  if (!dateParts) return null
  const [year, month, day] = dateParts
  const date = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
  const parsed = new Date(date + 'T00:00:00Z')
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

function rupiahCents(value) {
  const number = clean(value).replace(/^rp\.?\s*/i, '').replace(/,-$/, '')
  let normalized
  if (/^\d+(?:[.,]\d{1,2})?$/.test(number)) normalized = number.replace(',', '.')
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(number)) normalized = number.replaceAll('.', '').replace(',', '.')
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(number)) normalized = number.replaceAll(',', '')
  else if (/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(number)) normalized = number.replaceAll(' ', '').replace(',', '.')
  else return null
  const [whole, decimal = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2,'0'))
  return Number.isSafeInteger(cents) && cents < 1e15 ? cents : null
}

const itemHeader = /^rincian\s+nominal\s+(?:qty|kuantitas)\s+jumlah$/i
const totalLabel = /^(?:grand total|total(?:\s+(?:nominal|pengajuan|biaya))?)(?=$|[\s:：])/i
const labelBoundary = new RegExp('^(?:' + Object.values(fields).join('|')
  + '|Tanggal|Jam|Jenis Transaksi|Metode|Cara Pembayaran|Pernyataan|Validasi|Informasi Pengeluaran Biaya|Rincian|Total|SLIP PENGAJUAN|Nomor SP|SPA/Administration)(?=$|[:：\\s])','i')

function readValue(lines, index, remaining) {
  const inline = clean(remaining.trimStart().replace(/^[:：]\s*/, ''))
  if (inline) return inline === '-' ? '' : inline
  const next = lines[index + 1]
  return next && !labelBoundary.test(next) ? clean(next.replace(/^[:：]\s*/, '')) : ''
}

function readOptions(lines, label, options, field, header, issues) {
  const records = lines.flatMap((line,index) => {
    const found = line.match(label)
    if (!found) return []
    const value = readValue(lines,index,found[1])
    const checked = options.filter(([name]) => new RegExp('(?:✓|✔|☑|\\[x\\])\\s*(?:'+name+')\\b','i').test(value))
    if (checked.length) return checked.length === 1 ? [checked[0][1]] : [null]
    const explicit = options.find(([name]) => new RegExp('^(?:'+name+')$','i').test(value))
    return [explicit?.[1] ?? null]
  })
  if (!records.length) return
  if (records[0] && records.every(record => record === records[0])) header[field] = records[0]
  else issues.push(field === 'payment_type' ? 'Cara pembayaran belum jelas.' : 'Jenis transaksi belum jelas.')
}

function readItemRows(lines, start, issues) {
  const items = []
  let subtotal = 0
  let interrupted = false
  let index = start + 1
  for (; index < lines.length && !totalLabel.test(lines[index]); index++) {
    const row = lines[index].match(/^(.+?)\s+(Rp\.?\s*[\d.,]+)\s+(\d+(?:[.,]\d{1,3})?)(?:\s+([^\d]+?))?\s+(Rp\.?\s*[\d.,]+)$/i)
    if (!row) {
      if (labelBoundary.test(lines[index])) break
      interrupted = true
      continue
    }
    const [, name, price, quantity, unit = 'pcs', rowTotal] = row
    const cents = rupiahCents(price)
    const qty = Number(quantity.replace(',', '.'))
    const printedSubtotal = rupiahCents(rowTotal)
    if (cents === null || !Number.isFinite(qty) || qty <= 0 || qty >= 1e12 || printedSubtotal === null) {
      interrupted = true
      continue
    }
    const calculated = requestSubtotalCents(qty, cents / 100)
    if (calculated !== printedSubtotal) issues.push('Subtotal “'+clean(name)+'” berbeda dari kuantitas × harga satuan.')
    subtotal += calculated
    items.push({ item_name: clean(name), qty, unit: clean(unit), unit_price: cents / 100 })
  }
  if (!items.length || interrupted) issues.push('Ada baris rincian barang yang tidak terbaca lengkap.')
  return { items, subtotal }
}

export function parseRequest(text) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.replace(indent, '').trimEnd()).filter(Boolean)
  const header = {}
  const issues = []
  for (const [field, label] of Object.entries(fields)) {
    const pattern = new RegExp('^(?:' + label + ')(?=$|[:：\\s])([\\s\\S]*)$','i')
    const values = lines.flatMap((line,index) => {
      const match = line.match(pattern)
      if (!match) return []
      const remaining = match[1]
      if (field === 'purpose') {
        const value = readValue(lines,index,remaining)
        return value && (remaining.trimStart().startsWith(':') || !looksLikePaymentChoices(value)) ? [value] : []
      }
      if (!remaining.trimStart().startsWith(':') && !remaining.trimStart().startsWith('：')) return []
      const value = readValue(lines,index,remaining)
      const cleaned = field === 'notes' ? value.replace(/(?:^|\s)Manager\s*\/\s*SPV.*$/i, '').trim() : value
      return cleaned ? [cleaned] : []
    })
    if (values.length && values.every(value => value.toLowerCase() === values[0].toLowerCase())) header[field] = values[0]
    else if (values.length) {
      const fieldLabel = { requester:'Nama pemohon',purpose:'Tujuan transaksi',account_number:'Nomor rekening',account_name:'Nama pemilik rekening',bank_name:'Nama bank' }[field]
      if (fieldLabel) issues.push(fieldLabel+' terbaca berbeda di beberapa bagian slip.')
    }
  }

  const dateValues = lines.flatMap((line,index) => {
    const match = line.match(/^tanggal(?=$|[:：\s])(?!\s+transaksi\b)(.*)$/i)
    return match ? [readValue(lines,index,match[1])] : []
  }).filter(Boolean)
  const dates = dateValues.map(parseDate)
  if (dates[0] && dates.every(date => date === dates[0])) header.request_date = dates[0]
  else if (dates.length) issues.push('Tanggal pengajuan tidak valid atau terbaca berbeda.')
  const time = text.match(/\bJam\s*[:：]?\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i)
  if (time) header.request_time = time[1].padStart(2, '0') + ':' + time[2]

  if (header.account_number) {
    if (/^\d+(?:[ .-]+\d+)*$/.test(header.account_number)) header.account_number = header.account_number.replace(/[ .-]/g, '')
    else {
      delete header.account_number
      issues.push('Nomor rekening mengandung karakter yang perlu diperiksa.')
    }
  }
  readOptions(lines, /^(?:metode(?: pembayaran)?|cara pembayaran)(?=$|[:：\s])(.*)$/i, paymentTypes, 'payment_type', header, issues)
  if (!header.payment_type && !issues.includes('Cara pembayaran belum jelas.')) {
    const legacy = lines.filter(line => /^tujuan transaksi\s/i.test(line) && looksLikePaymentChoices(line))
    readOptions(legacy, /^tujuan transaksi\s+(.+)/i, paymentTypes, 'payment_type', header, issues)
  }
  readOptions(lines, /^jenis transaksi(?=$|[:：\s])(.*)$/i, transactionTypes, 'transaction_type', header, issues)

  const amounts = lines.flatMap((line,index) => {
    const label = line.match(totalLabel)
    if (!label) return []
    const value = readValue(lines,index,line.slice(label[0].length))
    return value ? [rupiahCents(value)] : []
  })
  const amount = amounts[0] > 0 && amounts.every(value => value === amounts[0]) ? amounts[0] : null
  if (amounts.length && amount === null) issues.push('Total nominal tidak valid atau terbaca berbeda.')

  const itemStart = lines.findIndex(line => itemHeader.test(line))
  let items = []
  if (itemStart !== -1) {
    const result = readItemRows(lines,itemStart,issues)
    items = result.items
    if (amount === null || result.subtotal !== amount) issues.push('Periksa total rincian terhadap total yang tercetak pada slip.')
  } else if (amount !== null) {
    items = [{ item_name: header.purpose || 'Total pengajuan', qty: 1, unit: 'pcs', unit_price: amount / 100 }]
  }
  return issues.length ? { header, items, issues: [...new Set(issues)] } : { header, items }
}

export function canAutoImport({ header, items, issues }) {
  if (issues?.length || !header.request_date || !header.requester || !header.purpose) return false
  if (!items.length || items.length > 200 || !items.every(item => item.unit_price >= 0 && item.unit_price < 1e13)) return false
  const total = requestTotal(items)
  return total > 0 && total < 1e13
}

export function hasSlipData({ header, items }) {
  return Boolean(header.requester || header.purpose || items.length)
}

export function splitRequestText(text) {
  const matches = Array.from(text.matchAll(/^\s*(?:slip|formulir|form)\s+pengajuan(?:\s+dana)?\b/gim))
  if (matches.length > 1 && !hasSlipData(parseRequest(text.slice(0,matches[0].index)))) {
    return matches.map((match, index) => text.slice(match.index, matches[index + 1]?.index))
  }
  // Some exports omit the repeated title but retain each slip's date or requester.
  const boundaries = [
    /^\s*tanggal\s*[:：]?\s*\d/gim,
    /^\s*(?:nama\s+(?:spa\s*\/\s*santri(?:\s*\/\s*pemohon)?|pemohon)|pemohon)\s*[:：]/gim,
  ]
  for (const pattern of boundaries) {
    const starts = Array.from(text.matchAll(pattern), match => match.index)
    if (starts.length < 2) continue
    const parts = starts.map((start, index) => text.slice(index === 0 ? 0 : start, starts[index + 1]))
    if (parts.every(part => {
      const { header, items } = parseRequest(part)
      return header.requester && header.purpose && items.length
    })) return parts
  }
  if (matches.length > 1) {
    const parts = matches.map((match,index) => text.slice(index?matches[index-1].index:0,match.index))
    if (parts.every(part=>hasSlipData(parseRequest(part)))) return parts
  }
  return [text]
}

export async function getImportKey(fileDigest, split, index) {
  // Stable across retries and renaming a file. The database scopes the key to the current user.
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(fileDigest + ':' + (split ? 'split' : 'single') + ':' + index))).slice(0, 16)
  id[6] = (id[6] & 0x0f) | 0x80
  id[8] = (id[8] & 0x3f) | 0x80
  const hex = Array.from(id, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
