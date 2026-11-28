import { Plus, Trash2 } from 'lucide-react'
import { requestSubtotalCents, requestTotal } from '../domain'
import { num, rupiah } from '../lib'

export const newInvoiceItem = (values = {}) => ({
  key: crypto.randomUUID(), item_name: '', qty: '1', unit: 'pcs', unit_price: '', ...values,
})

export default function InvoiceItems({ items, onChange, disabled }) {
  function update(key, field, value) {
    onChange(items.map(item => item.key === key ? { ...item, [field]: value } : item))
  }

  return <section className="request-items span2 invoice-lines" aria-label="Rincian barang">
    <div className="request-head">
      <b>Rincian barang</b>
      <button type="button" disabled={disabled || items.length >= 200} onClick={() => onChange([...items, newInvoiceItem()])}>
        <Plus size={16}/> Tambah barang
      </button>
    </div>
    {items.map((item, index) => <div className="invoice-line" key={item.key}>
      <label>Nama barang<input aria-label={'Nama barang '+(index+1)} value={item.item_name}
        onChange={event => update(item.key,'item_name',event.target.value)} required disabled={disabled}/></label>
      <label>Jumlah<input aria-label={'Jumlah '+(index+1)} type="number" min="0.001" step="0.001" value={item.qty}
        onChange={event => update(item.key,'qty',event.target.value)} required disabled={disabled}/></label>
      <label>Satuan<input aria-label={'Satuan '+(index+1)} value={item.unit}
        onChange={event => update(item.key,'unit',event.target.value)} required disabled={disabled}/></label>
      <label>Harga satuan<input aria-label={'Harga satuan '+(index+1)} type="number" min="0" step="0.01" value={item.unit_price}
        onChange={event => update(item.key,'unit_price',event.target.value)} required disabled={disabled}/></label>
      <div className="invoice-subtotal"><span>Subtotal</span><strong>{rupiah(requestSubtotalCents(item.qty,item.unit_price)/100)}</strong></div>
      <button type="button" className="danger-icon" aria-label={'Hapus barang '+(index+1)}
        disabled={disabled || items.length === 1} onClick={() => onChange(items.filter(line => line.key !== item.key))}><Trash2 size={16}/></button>
    </div>)}
    <div className="request-total"><b>Total pengeluaran</b><strong>{rupiah(requestTotal(items))}</strong></div>
  </section>
}

export function InvoiceBreakdown({items}) {
  return <div className="table-wrap"><table>
    <thead><tr><th>Nama barang</th><th>Jumlah</th><th>Harga satuan</th><th className="right">Subtotal</th></tr></thead>
    <tbody>{items.map((item,index)=><tr key={index}>
      <td>{item.item_name}</td><td>{num(item.qty)} {item.unit}</td><td>{rupiah(item.unit_price)}</td>
      <td className="right">{rupiah(requestSubtotalCents(item.qty,item.unit_price)/100)}</td>
    </tr>)}</tbody>
  </table></div>
}
