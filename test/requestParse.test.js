import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAutoImport, getImportKey, parseRequest } from '../src/requestParse.js'

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
