import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAutoImport, getImportKey, parseRequest, splitRequestText } from '../src/requestParse.js'

test('imports a slip with Indonesian dates, account numbers, and decimal rupiah', () => {
  const { header, items } = parseRequest(`
Tanggal: 27 November 2026
Jam: 8.30
Nama SPA/Santri / Pemohon: Contoh Dapur
Tujuan Transaksi: Belanja Bahan
No. Rekening / VA: 0012-345
Cara pembayaran: Virtual Account
Jenis transaksi: Klaim/Reimburse
Total Nominal: Rp 12.345,67
`)
  assert.equal(header.request_date, '2026-11-27')
  assert.equal(header.request_time, '08:30')
  assert.equal(header.requester, 'Contoh Dapur')
  assert.equal(header.account_number, '0012345')
  assert.equal(header.payment_type, 'virtual_account')
  assert.equal(header.transaction_type, 'claim_reimburse')
  assert.deepEqual(items, [{ item_name: 'Belanja Bahan', qty: 1, unit: 'pcs', unit_price: 12345.67 }])
})

test('ignores dates that do not exist and supports integer rupiah', () => {
  const { header, items } = parseRequest('Tanggal: 31/02/2026\nTotal Pengajuan: 15.000')
  assert.equal(header.request_date, undefined)
  assert.equal(items[0].unit_price, 15000)
  assert.deepEqual(parseRequest('Dokumen kosong'), { header: {}, items: [] })
})


test('automatically imports only slips with the data needed for the recap', () => {
  const slip = parseRequest('Tanggal: 27/11/2026\nPemohon: Tim Dapur\nKeperluan: Beras\nTotal: 1234.56')
  assert.equal(slip.items[0].unit_price, 1234.56)
  assert.equal(canAutoImport(slip), true)
  assert.equal(canAutoImport({ ...slip, header: { ...slip.header, request_date: '' } }), false)
  assert.equal(canAutoImport(parseRequest('Pemohon: Tim Dapur\nTotal: 1234.56')), false)
})

test('the same uploaded file and slip position generate the same retry key', async () => {
  const key = await getImportKey('sample-digest', true, 0)
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(await getImportKey('sample-digest', true, 0), key)
  assert.notEqual(await getImportKey('sample-digest', true, 1), key)
  assert.notEqual(await getImportKey('sample-digest', false, 0), key)
})

test('two slip headings produce independent records, including a slip missing a field', () => {
  const text = [
    'SLIP PENGAJUAN', 'Tanggal: 27 Nov 2026', 'Pemohon: Tim A', 'Keperluan: Beras', 'Total: 12.500',
    'SLIP PENGAJUAN', 'Pemohon: Tim B', 'Keperluan: Telur', 'Total: 30.000',
  ].join('\n')
  const slips = splitRequestText(text).map(parseRequest)
  assert.equal(slips.length, 2)
  assert.deepEqual(slips.map(slip => slip.header.requester), ['Tim A', 'Tim B'])
  assert.deepEqual(slips.map(slip => slip.items[0].unit_price), [12500, 30000])
  assert.deepEqual(slips.map(canAutoImport), [true, false])
})

test('two repeated date and applicant blocks split while a separate transaction date stays in one slip', () => {
  const blocks = ['Tanggal: 27/11/2026\nPemohon: Tim A\nKeperluan: Beras\nTotal: 1000',
    'Tanggal: 28 / 11 / 2026\nPemohon: Tim B\nKeperluan: Telur\nTotal: 2000']
  assert.deepEqual(splitRequestText(blocks.join('\n')).map(parseRequest).map(slip => slip.header.request_date),
    ['2026-11-27', '2026-11-28'])
  assert.equal(splitRequestText(blocks[0] + '\nTanggal Transaksi: 30/11/2026').length, 1)
})

const printedSlip = [
  'Tanggal   :   28 Nov 2026',
  'Jam   :   08:30',
  'Jenis Transaksi   Uang Muka   ✓   Pembayaran   Penyaluran   Klaim/Reimburse',
  'Nama SPA/Santri   :   Tim Dapur',
  'Amanah   :',
  'No Hp/WA   :',
  'Tujuan Transaksi   Belanja bahan',
  'Tujuan Transaksi   Tunai   ✓   Transfer/Top Up   Virtual Account',
  'No Rekening/VA   :   0012-3456',
  'Atas Nama   :   Tim Dapur',
  'Bank   :   Bank Uji',
  'Informasi Pengeluaran Biaya',
  'Rincian   Nominal   Qty   Jumlah',
  'Beras   Rp 12.500,50   2   kg   Rp 25.001',
  'Bumbu   Rp 4.000   0,5   kg   Rp 2.000',
  'Total Nominal   Rp 27.001',
  'Tujuan Transaksi   :   Belanja bahan',
  'Tanggal Transaksi   :   30 Nov 2026',
  'SLIP PENGAJUAN',
].join('\n')

test('round-trips printed choices, the request date, and individual line items', () => {
  const slip = parseRequest(printedSlip)
  assert.equal(slip.header.requester, 'Tim Dapur')
  assert.equal(slip.header.request_date, '2026-11-28')
  assert.equal(slip.header.purpose, 'Belanja bahan')
  assert.equal(slip.header.payment_type, 'transfer')
  assert.equal(slip.header.transaction_type, 'payment')
  assert.equal(slip.header.account_number, '00123456')
  assert.equal(slip.header.phone, undefined)
  assert.deepEqual(slip.items, [
    { item_name:'Beras', qty:2, unit:'kg', unit_price:12500.50 },
    { item_name:'Bumbu', qty:0.5, unit:'kg', unit_price:4000 },
  ])
  assert.equal(canAutoImport(slip), true)
})

test('won’t save conflicting sums, unmarked payment options or mistaken account digits automatically', () => {
  const slip = parseRequest(printedSlip.replace('Rp 25.001','Rp 25.010')
    .replace('Rp 27.001','Rp 27.011')
    .replace('✓   Transfer/Top Up','Transfer/Top Up')
    .replace('0012-3456','OO12-3456'))
  assert.equal(canAutoImport(slip), false)
  assert.equal(slip.header.payment_type, undefined)
  assert.equal(slip.header.account_number, undefined)
  assert.match(slip.issues.join(' '), /Cara pembayaran belum jelas.*Subtotal.*total rincian/i)
  assert.equal(slip.items.length, 2)
})

test('reads wrapped labels and rejects malformed, signed, or contradictory totals', () => {
  const prefix = 'Tanggal :\n28 Nov 2026\nPemohon :\nDapur Uji\nKeperluan: Belanja bahan\n'
  assert.equal(canAutoImport(parseRequest(prefix + 'Total Nominal\nRp 1 500,25')), true)
  for (const total of ['Rp -15.000', 'Rp 15.O00', 'Rp 1.2.3', '15.000\nGrand Total 16.000']) {
    const slip = parseRequest(prefix + 'Total Nominal ' + total)
    assert.equal(canAutoImport(slip), false, total)
    assert.equal(slip.items.length, 0)
  }
})

test('separates combined native exports with slip headings at the end', () => {
  const two = splitRequestText(printedSlip+'\n'+printedSlip.replaceAll('Tim Dapur','Tim Lain'))
  assert.deepEqual(two.map(block=>parseRequest(block).header.requester), ['Tim Dapur','Tim Lain'])
  assert.ok(two.map(block=>parseRequest(block)).every(canAutoImport))
})
