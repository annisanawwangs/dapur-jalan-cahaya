const fields = {
  requester: 'Nama SPA\\s*/\\s*Santri(?:\\s*/\\s*Pemohon)?|Nama Pemohon|Pemohon',
  department: 'Divisi\\s*/\\s*Departemen|Divisi|Departemen',
  position_title: 'Amanah\\s*/\\s*Jabatan|Jabatan',
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
  [/uang muka/i,'advance'], [/reimburse|klaim/i,'claim_reimburse'], [/pembayaran/i,'payment'],
  [/penyaluran/i,'disbursement'], [/retur/i,'refund'], [/tunjangan/i,'allowance'], [/pinjaman/i,'loan'],
]

function parseDate(text) {
  const named = text.match(/\bTanggal\s*[:：]?\s*(\d{1,2})\s+([a-z]+)\s+(20\d{2})/i)
  const numeric = text.match(/\bTanggal\s*[:：]?\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/i)
  const iso = text.match(/\bTanggal\s*[:：]?\s*(20\d{2})-(\d{2})-(\d{2})\b/i)
  const dateParts = iso ? [iso[1], iso[2], iso[3]]
    : named ? [named[3], months.indexOf(named[2].toLowerCase()) + 1, named[1]]
    : numeric && [numeric[3].length === 2 ? '20' + numeric[3] : numeric[3], numeric[2], numeric[1]]
  if (!dateParts) return null
  const [year, month, day] = dateParts
  const date = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
  const parsed = new Date(date + 'T00:00:00Z')
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

export function parseRequest(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim())
  const header = {}
  for (const [field, label] of Object.entries(fields)) {
    const pattern = new RegExp('^(?:' + label + ')\\s*[:：]\\s*(.+)$', 'i')
    const entry = lines.map(line => line.match(pattern)).find(Boolean)
    if (entry) header[field] = entry[1].trim()
  }
  const date = parseDate(text)
  if (date) header.request_date = date
  const time = text.match(/\bJam\s*[:：]?\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i)
  if (time) header.request_time = time[1].padStart(2, '0') + ':' + time[2]
  if (header.account_number) header.account_number = header.account_number.replace(/\D/g, '')
  const method = lines.find(line => /^(metode|cara pembayaran)\s*[:：]/i.test(line)) || ''
  if (/tunai|cash/i.test(method)) header.payment_type = 'cash'
  else if (/virtual account/i.test(method)) header.payment_type = 'virtual_account'
  else if (/transfer/i.test(method)) header.payment_type = 'transfer'

  const kind = lines.find(line => /^jenis transaksi\s*[:：]/i.test(line)) || ''
  const type = transactionTypes.find(([pattern]) => pattern.test(kind))
  if (type) header.transaction_type = type[1]

  const nominal = text.match(/^\s*Total(?:\s+(?:Nominal|Pengajuan|Biaya))?\s*[:：]?\s*(?:Rp\.?\s*)?([\d.,]+)/im)
  const value = nominal?.[1] ?? ''
  const normalized = /,\d{1,2}$/.test(value) ? value.replaceAll('.', '').replace(',', '.') : value.replace(/[.,]/g, '')
  const amount = Number(normalized)
  const items = amount > 0 && Number.isFinite(amount)
    ? [{ item_name: header.purpose || 'Total pengajuan', qty: 1, unit: 'pcs', unit_price: amount }]
    : []
  return { header, items }
}
