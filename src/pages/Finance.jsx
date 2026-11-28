import React from 'react'
import { Plus, Search, Download, Trash2, Pencil, Printer } from 'lucide-react'
import { supabase, rupiah, dateID, downloadCSV, getMasterOptions, groupOptions, addMasterOption } from '../lib'
import MasterSelect from '../components/MasterSelect'
import { Card, Empty, Modal, Toast } from '../components/UI'

import { localDate, monthRange } from '../domain'
const fallback={expense_category:['Bahan Pokok','Protein','Bumbu','Sayur','Kebersihan','Alat Dapur','Bahan Tambahan','Minuman','Kemasan','Jasa','Lainnya'],income_category:['Top Up Kas','Donasi','Penggantian','Pendapatan Lain'],payment_method:['Cash','Transfer','QRIS'],program:['Makan TIM'],merchant:[]}
const newBlank=()=>({type:'expense',amount:'',category:fallback.expense_category[0],item_name:'',description:'',merchant:'',program:fallback.program[0],payment_method:fallback.payment_method[0],transaction_date:localDate()})

export default function Finance({has}){
 const [rows,setRows]=React.useState([]),[open,setOpen]=React.useState(false),[form,setForm]=React.useState(newBlank()),[editId,setEditId]=React.useState(null),[q,setQ]=React.useState(''),[month,setMonth]=React.useState(localDate().slice(0,7)),[toast,setToast]=React.useState(''),[masters,setMasters]=React.useState(fallback)
 const [saving,setSaving]=React.useState(false)
 const [saveError,setSaveError]=React.useState('')
 const savingRef=React.useRef(false)
 const draftId=React.useRef(null)
 React.useEffect(()=>{load()},[month])
 async function load(){if(!supabase)return; const {from,to}=monthRange(month); const [tx,opts]=await Promise.all([supabase.from('transactions').select('*').gte('transaction_date',from).lt('transaction_date',to).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),getMasterOptions(['expense_category','income_category','payment_method','program','merchant'])]); if(tx.error){setToast(tx.error.message);return} setRows(tx.data||[]);const g=groupOptions(opts);setMasters({...fallback,...Object.fromEntries(Object.entries(g).filter(([,v])=>v.length))})}
 const filtered=rows.filter(r=>[r.item_name,r.description,r.category,r.merchant,r.program].join(' ').toLowerCase().includes(q.toLowerCase()))
 const income=filtered.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount),0), expense=filtered.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount),0)
 function add(){
   if(savingRef.current) return
   const blank=newBlank()
   blank.category=masters.expense_category?.[0]||blank.category
   blank.payment_method=masters.payment_method?.[0]||blank.payment_method
   blank.program=masters.program?.[0]||''
   draftId.current=crypto.randomUUID()
   setSaveError('')
   setEditId(null)
   setForm(blank)
   setOpen(true)
 }
 function edit(row){
   if(savingRef.current) return
   setSaveError('')
   setEditId(row.id)
   setForm({...row,amount:String(row.amount)})
   setOpen(true)
 }
 function closeForm(){
   if(!savingRef.current) setOpen(false)
 }
 async function save(event){
   event.preventDefault()
   if(savingRef.current) return
   savingRef.current=true
   setSaving(true)
   setSaveError('')
   const payload={
     type:form.type,
     amount:Number(form.amount),
     category:form.category,
     item_name:form.item_name?.trim()||null,
     description:form.description,
     merchant:form.merchant,
     program:form.program,
     payment_method:form.payment_method,
     transaction_date:form.transaction_date,
   }
   try{
     const table=supabase.from('transactions')
     const request=editId
       ? table.update(payload).eq('id',editId)
       : table.upsert({id:draftId.current,...payload},{onConflict:'id',ignoreDuplicates:true})
     const {data,error}=await request.select('id')
     if(error) throw error
     if(editId&&!data?.length) throw new Error('Transaksi tidak dapat diperbarui. Muat ulang daftar dan coba lagi.')
     setOpen(false)
     setToast(data?.length?'Transaksi tersimpan.':'Transaksi ini sudah tercatat. Gunakan Edit transaksi jika perlu mengubahnya.')
     await load()
   }catch(error){
     setSaveError(error.message||'Transaksi belum dapat dikonfirmasi. Coba tekan Simpan lagi.')
   }finally{
     savingRef.current=false
     setSaving(false)
   }
 }
 async function del(id){if(!confirm('Hapus transaksi ini?'))return; const {error}=await supabase.from('transactions').delete().eq('id',id);if(error)setToast(error.message);else load()}
 function exportRows(){downloadCSV(`keuangan-${month}.csv`,filtered.map(r=>({tanggal:r.transaction_date,jenis:r.type,kategori:r.category,nama_barang:r.item_name,keterangan:r.description,merchant:r.merchant,program:r.program,metode:r.payment_method,nominal:r.amount})))}
 function printFinance(){document.body.classList.add('finance-print'); window.addEventListener('afterprint',()=>document.body.classList.remove('finance-print'),{once:true}); window.print()}
 async function addOption(type,name){
   const value=await addMasterOption(type,name,masters[type]||[])
   if(value) setMasters(previous=>({...previous,[type]:[...new Set([...(previous[type]||[]),value])]}))
   return value
 }
 const optionsWithValue=(values,value)=>value&&!values.includes(value)?[value,...values]:values
 const categoryType=form.type==='income'?'income_category':'expense_category'
 const canAddOption=has('settings.manage')||has('finance.create')||has('finance.edit')
 return <><Toast message={toast}/><div className="toolbar"><div className="filters"><input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/><div className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari transaksi..."/></div></div><div className="actions"><button onClick={printFinance}><Printer size={17}/>Cetak</button><button onClick={exportRows}><Download size={17}/>CSV</button>{has('finance.create')&&<button className="primary" onClick={add}><Plus size={17}/>Transaksi</button>}</div></div>
 <div className="mini-stats"><div><span>Pemasukan</span><b>{rupiah(income)}</b></div><div><span>Pengeluaran</span><b>{rupiah(expense)}</b></div><div><span>Selisih</span><b>{rupiah(income-expense)}</b></div></div>
 <Card className="table-card"><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Nama barang</th><th>Keterangan</th><th>Program</th><th>Metode</th><th className="right">Nominal</th>{(has('finance.edit')||has('finance.delete'))&&<th></th>}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{dateID(r.transaction_date)}</td><td><span className={`badge ${r.type}`}>{r.type==='income'?'Masuk':'Keluar'}</span></td><td>{r.category}</td><td>{r.item_name||'-'}</td><td><b>{r.description||'-'}</b><small>{r.merchant||''}</small></td><td>{r.program||'-'}</td><td>{r.payment_method}</td><td className="right amount">{rupiah(r.amount)}</td>{(has('finance.edit')||has('finance.delete'))&&<td><div className="row-actions">{has('finance.edit')&&<button aria-label="Edit transaksi" onClick={()=>edit(r)}><Pencil size={15}/></button>}{has('finance.delete')&&<button aria-label="Hapus transaksi" onClick={()=>del(r.id)}><Trash2 size={15}/></button>}</div></td>}</tr>)}</tbody></table>{!filtered.length&&<Empty title="Belum ada transaksi"/>}</div></Card>
 <Modal open={open} title={editId?'Edit transaksi':'Tambah transaksi'} onClose={closeForm}><form className="form-grid" onSubmit={save} aria-busy={saving}><label>Jenis<select value={form.type} onChange={e=>{const t=e.target.value;setForm({...form,type:t,category:(t==='income'?masters.income_category:masters.expense_category)?.[0]||''})}}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></label><label>Tanggal<input type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})} required/></label><label className="span2">Nominal<input type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" required/></label><label className="span2">Nama barang<input value={form.item_name||''} onChange={e=>setForm({...form,item_name:e.target.value})} placeholder="Contoh: Kukusan 30 cm"/></label><MasterSelect key={categoryType} label="Kategori" name="kategori" value={form.category} options={masters[categoryType]} onChange={category=>setForm(previous=>({...previous,category}))} onAdd={canAddOption?name=>addOption(categoryType,name):undefined}/><label>Metode<select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{optionsWithValue(masters.payment_method,form.payment_method).map(x=><option key={x}>{x}</option>)}</select></label><label>Merchant<input list="merchant-options" value={form.merchant||''} onChange={e=>setForm({...form,merchant:e.target.value})} placeholder="Toko / pemasok"/><datalist id="merchant-options">{(masters.merchant||[]).map(x=><option key={x} value={x}/>)}</datalist></label><MasterSelect label="Program" name="program" allowEmpty value={form.program} options={masters.program} onChange={program=>setForm(previous=>({...previous,program}))} onAdd={canAddOption?name=>addOption('program',name):undefined}/><label className="span2">Keterangan<textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Catatan transaksi"/></label>{saveError&&<div className="form-error span2" role="alert">{saveError}</div>}<div className="form-actions span2"><button type="button" onClick={closeForm} disabled={saving}>Batal</button><button className="primary" disabled={saving}>{saving?'Menyimpan…':'Simpan'}</button></div></form></Modal></>
}
