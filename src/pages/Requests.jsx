import React from 'react'
import { Plus, Search, Eye, Pencil, Trash2, Upload, Printer, CheckCircle2, XCircle } from 'lucide-react'
import { supabase, rupiah, dateID, getMasterOptions, groupOptions, addMasterOption } from '../lib'
import MasterSelect from '../components/MasterSelect'
import { ImportAssetsError, readRequestFile } from '../requestImport'
import { Card, Empty, Modal, Toast } from '../components/UI'

import { localDate, localTime, requestItems, requestTotal } from '../domain'
import { canAutoImport, getImportKey, parseRequest } from '../requestParse'
const blank=()=>({
  request_date:localDate(),request_time:localTime(),requester:'',program:'',purpose:'',status:'pending',notes:'',
  transaction_type:'payment',department:'',position_title:'',phone:'',payment_type:'transfer',account_number:'',account_name:'',bank_name:'',
  vendor_name:'',invoice_no:'',vendor_address:''
})
const fallback={program:['Makan TIM'],unit:['pcs','kg','gram','liter','ml','pack','ikat','butir']}
const transactionTypes=[
  ['advance','Uang Muka'],['payment','Pembayaran'],['disbursement','Penyaluran'],['claim_reimburse','Klaim/Reimburse'],
  ['refund','Retur Dana'],['allowance','Tunjangan'],['loan','Pinjaman']
]
const paymentTypes=[['cash','Tunai'],['transfer','Transfer/Top Up'],['virtual_account','Virtual Account']]
const safe=(v,f='-')=>v===null||v===undefined||String(v).trim()===''?f:String(v)
const timeText=v=>v?safe(String(v).slice(0,5)):'-'
const statusLabel=s=>s==='pending'?'MENUNGGU':s==='approved'?'DISETUJUI':s==='rejected'?'DITOLAK':'SELESAI'

function PrintCheck({checked,label}){return <span className="sp-check"><i className={checked?'checked':''}>{checked?'✓':''}</i>{label}</span>}
function PrintLine({label,value,className=''}){return <div className={`sp-line ${className}`}><span>{label}</span><b>:</b><em>{safe(value,'')}</em></div>}

export default function Requests({has,userId}){
 const [rows,setRows]=React.useState([]),[q,setQ]=React.useState(''),[open,setOpen]=React.useState(false),[detailOpen,setDetailOpen]=React.useState(false),[form,setForm]=React.useState(blank()),[items,setItems]=React.useState([{item_name:'',qty:1,unit:'pcs',unit_price:0}]),[detail,setDetail]=React.useState(null),[toast,setToast]=React.useState(''),[masters,setMasters]=React.useState(fallback)
 const [editing,setEditing]=React.useState(null)
 const [saving,setSaving]=React.useState(false)
 const [importQueue,setImportQueue]=React.useState([])
 const [importProgress,setImportProgress]=React.useState('')
 const [importAssetError,setImportAssetError]=React.useState('')
 const uploading=React.useRef(false)
 const operationKey=React.useRef(null)
 const saveInProgress=React.useRef(false)
 React.useEffect(()=>{load()},[])
 async function load(){if(!supabase)return;const [r,o]=await Promise.all([supabase.from('purchase_requests').select('*, request_items(*)').order('request_date',{ascending:false}).order('created_at',{ascending:false}),getMasterOptions(['program','unit'])]);if(r.error){setToast(r.error.message);return} setRows(r.data||[]);const g=groupOptions(o);setMasters({...fallback,...Object.fromEntries(Object.entries(g).filter(([,v])=>v.length))})}
 const filtered=rows.filter(r=>[r.request_no,r.requester,r.program,r.department,r.purpose,r.status].join(' ').toLowerCase().includes(q.toLowerCase()))
 const total=requestTotal(requestItems(items))
 const blankItem=()=>({item_name:'',qty:1,unit:masters.unit?.[0]||'pcs',unit_price:0})
 const canEdit=row=>row.status!=='completed' && (has('requests.approve') || (has('requests.edit') && row.status==='pending' && row.created_by===userId))
 function openForm(row=null, imported=null){
   const defaults=blank()
   const fields=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,row?.[key]??value]))
   if(!row) fields.program=masters.program?.[0]||''
   if(row) fields.request_time=row.request_time?.slice(0,5)||''
   const prefilled=imported?.items?.length?imported.items:row?.request_items
   setEditing(row)
   setForm({...fields,...(imported?{request_date:'',program:'',request_time:'',...imported.header}:null)})
   setItems(prefilled?.length?prefilled:[blankItem()])
   operationKey.current=imported?.key??crypto.randomUUID()
   setOpen(true)
 }
 function closeForm(){
   if(saving) return
   setOpen(false)
   setImportQueue([])
 }
 async function importRequest(e){
   const file=e.target.files?.[0]
   e.target.value=''
   if(!file||uploading.current||saveInProgress.current) return
   if(file.size>50*1024*1024){setToast('Ukuran dokumen maksimal 50 MB.');return}
   uploading.current=true
   setImportAssetError('')
   setImportProgress('Membuka dokumen…')
   try{
     const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name)
     const split=pdf&&confirm('Apakah setiap halaman PDF berisi dua slip, atas dan bawah? Pilih Batal jika hanya satu slip.')
     const [documents,digest]=await Promise.all([
       readRequestFile(file,{split,progress:setImportProgress}),
       file.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)),
     ])
     const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
     const results=documents.map((document,index)=>({ ...parseRequest(document), index }))
       .filter(slip=>slip.header.requester||slip.header.purpose||slip.items.length)
     if(!results.length) throw new Error('Data tidak dikenali. Pilih slip yang lebih jelas atau masukkan pengajuan secara manual.')
     const review=[]
     let saved=0
     let saveError=''
     for(const slip of results){
       slip.key=await getImportKey(hash,split,slip.index)
       if(!canAutoImport(slip)){
         review.push(slip)
         continue
       }
       setImportProgress('Menyimpan slip '+(slip.index+1)+' ke rekap…')
       try{
         await saveRequest({ ...blank(), request_time:null, ...slip.header },slip.items,slip.key)
         saved++
       }catch(error){
         saveError=error.message
         review.push(slip)
       }
     }
     if(saved){
       setQ('')
       await load()
     }
     const [first,...pending]=review
     if(first){
       setImportQueue(pending)
       openForm(null,first)
     }
     const summary=saved?saved+' slip tersedia di rekap sebagai Menunggu.':''
     const reviewMessage=review.length?review.length+' slip perlu diperiksa.':''
     setToast([summary,reviewMessage,saveError].filter(Boolean).join(' '))
   }catch(error){
     if(error instanceof ImportAssetsError){
       setToast('')
       setImportAssetError(error.message)
     }else setToast(error.message)
   }finally{
     uploading.current=false
     setImportProgress('')
   }
 }
 async function saveRequest(header,lines,key,row=null){
   const {error}=await supabase.rpc('save_purchase_request_v4',{
     p_request_id:row?.id??null,
     p_header:{...header,request_time:header.request_time||null},
     p_items:lines,
     p_operation_key:key,
     p_expected_updated_at:row?.updated_at??null,
   })
   if(error) throw error
 }
 async function save(e){
   e.preventDefault()
   if(saveInProgress.current) return
   const lines=requestItems(items)
   if(!lines.length || lines.length>200){
     setToast('Rincian pengajuan harus berisi 1 sampai 200 barang.')
     return
   }
   if(lines.some(line=>!Number.isFinite(line.qty)||line.qty<=0||!Number.isFinite(line.unit_price)||line.unit_price<0)){
     setToast('Jumlah harus lebih dari 0 dan harga tidak boleh negatif.')
     return
   }
   saveInProgress.current=true
   setSaving(true)
   try{
     await saveRequest(form,lines,operationKey.current,editing)
     if(importQueue.length){
       const [next,...pending]=importQueue
       setImportQueue(pending)
       openForm(null,next)
       setToast('Pengajuan tersimpan. Periksa slip berikutnya.')
     }else{
       setOpen(false)
       setToast('Pengajuan tersimpan.')
     }
     await load()
   }catch(error){
     setToast(error.message)
   }finally{
     saveInProgress.current=false
     setSaving(false)
   }
 }
 async function remove(id){if(!confirm('Hapus pengajuan ini?'))return;const {error}=await supabase.from('purchase_requests').delete().eq('id',id);if(error)setToast(error.message);else load()}
 async function status(id,value){
   const {data,error}=await supabase.from('purchase_requests').update({status:value})
     .eq('id',id).eq('status',detail.status).select().maybeSingle()
   if(error||!data){
     setToast(error?.message||'Status pengajuan sudah berubah. Buka kembali slip untuk melihat status terbaru.')
     load()
     return
   }
   setDetail(previous=>previous?.id===id?{...previous,...data}:previous)
   load()
 }
 async function view(row){
   const {data:receipts,error}=await supabase.from('receipts').select('*')
     .eq('request_id',row.id).order('created_at',{ascending:false})
   if(error){setToast(error.message);return}
   const signed=await Promise.all((receipts||[]).map(async receipt=>{
     const {data}=await supabase.storage.from('receipts').createSignedUrl(receipt.file_path,3600)
     return {...receipt,signed_url:data?.signedUrl}
   }))
   setDetail({...row,receipts:signed})
   setDetailOpen(true)
 }
 async function uploadReceipt(e){
   const file=e.target.files?.[0]
   e.target.value=''
   if(!file||!detail||uploading.current) return
   if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){
     setToast('Gunakan nota JPG, PNG, WEBP, atau PDF.')
     return
   }
   if(file.size>10*1024*1024){
     setToast('Ukuran nota maksimal 10 MB.')
     return
   }
   uploading.current=true
   const path=`${detail.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
   const storage=supabase.storage.from('receipts')
   try{
     const {error}=await storage.upload(path,file)
     if(error) throw error
     const {error:recordError}=await supabase.from('receipts')
       .insert({request_id:detail.id,file_name:file.name,file_path:path})
     if(recordError){
       await storage.remove([path])
       throw recordError
     }
     setToast('Nota diunggah.')
     await view(detail)
   }catch(error){
     setToast(error.message)
   }finally{
     uploading.current=false
   }
 }
 async function addProgram(name){
   const value=await addMasterOption('program',name,masters.program)
   if(value) setMasters(previous=>({...previous,program:[...new Set([...previous.program,value])]}))
   return value
 }
 const change=k=>e=>setForm({...form,[k]:e.target.value})
 function printSlip(){
   document.body.classList.add('sp-print-mode')
   const cleanup=()=>{document.body.classList.remove('sp-print-mode');window.removeEventListener('afterprint',cleanup)}
   window.addEventListener('afterprint',cleanup)
   requestAnimationFrame(()=>setTimeout(()=>window.print(),60))
 }
 return <>
 <Toast message={toast}/>
 {importAssetError&&<div className="info-banner" role="alert">
   <span>{importAssetError}</span>
   <button type="button" onClick={()=>window.location.reload()}>Muat ulang</button>
 </div>}
 {importProgress&&<div className="info-banner" role="status">{importProgress}</div>}
 <div className="toolbar"><div className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari no, pemohon, program..."/></div>{has('requests.create')&&<div className="actions">
   <button className="primary" disabled={!!importProgress} onClick={()=>{setImportQueue([]);openForm()}}><Plus size={17}/>Pengajuan</button>
   <label className="upload-btn"><Upload size={16}/>Impor ke rekap<input aria-label="Impor ke rekap" type="file" accept="application/pdf,.pdf,.docx,.txt,image/jpeg,image/png,image/webp" disabled={!!importProgress} onChange={importRequest}/></label>
 </div>}</div>
 <Card className="table-card"><div className="table-wrap"><table><thead><tr><th>No.</th><th>Tanggal</th><th>Pemohon</th><th>Program / Keperluan</th><th>Status</th><th className="right">Total</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.request_no}</b></td><td>{dateID(r.request_date)}</td><td>{r.requester}</td><td><b>{r.program||r.department||'-'}</b><small>{r.purpose}</small></td><td><span className={`badge status-${r.status}`}>{r.status==='pending'?'Menunggu':r.status==='approved'?'Disetujui':r.status==='rejected'?'Ditolak':'Selesai'}</span></td><td className="right amount">{rupiah(r.total_amount)}</td><td><div className="row-actions"><button title="Lihat slip" onClick={()=>view(r)}><Eye size={15}/></button>{canEdit(r)&&<button title="Edit pengajuan" onClick={()=>openForm(r)}><Pencil size={15}/></button>}{has('requests.delete')&&<button onClick={()=>remove(r.id)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table>{!filtered.length&&<Empty title="Belum ada pengajuan"/>}</div></Card>

 <Modal open={open} title={editing?'Edit pengajuan':'Buat pengajuan baru'} onClose={closeForm}><form className="form-grid wide-form request-form" onSubmit={save}>
  <label>Tanggal<input type="date" value={form.request_date} onChange={change('request_date')} required/></label>
  <label>Jam<input type="time" value={form.request_time} onChange={change('request_time')}/></label>
  <label className="span2">Jenis transaksi<select value={form.transaction_type} onChange={change('transaction_type')}>{transactionTypes.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
  <label>Nama SPA/Santri / Pemohon<input value={form.requester} onChange={change('requester')} required/></label>
  <label>Divisi/Departemen<input value={form.department} onChange={change('department')} placeholder="Dapur / Pendidikan / Baitulmal"/></label>
  <label>Amanah / Jabatan<input value={form.position_title} onChange={change('position_title')} placeholder="PIC Dapur"/></label>
  <label>No HP/WA<input value={form.phone} onChange={change('phone')} placeholder="08xxxxxxxxxx"/></label>
  <MasterSelect label="Program internal" name="program" allowEmpty value={form.program}
    onChange={program=>setForm(previous=>({...previous,program}))} options={masters.program}
    onAdd={has('settings.manage')||has('requests.create')||has('requests.edit')||has('requests.approve')?addProgram:undefined}/>
  <label>Cara pembayaran<select value={form.payment_type} onChange={change('payment_type')}>{paymentTypes.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
  <label className="span2">Tujuan transaksi<textarea value={form.purpose} onChange={change('purpose')} required placeholder="Belanja bahan pekanan"/></label>
  <label>No Rekening / VA<input value={form.account_number} onChange={change('account_number')}/></label>
  <label>Atas Nama<input value={form.account_name} onChange={change('account_name')}/></label>
  <label className="span2">Bank<input value={form.bank_name} onChange={change('bank_name')}/></label>
  <div className="span2 request-items"><div className="request-head"><b>Informasi pengeluaran biaya</b><button type="button" onClick={()=>setItems([...items,blankItem()])}><Plus size={15}/>Baris</button></div>{items.map((it,i)=><div className="item-row" key={i}><input placeholder="Rincian / nama barang" value={it.item_name} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,item_name:e.target.value}:x))}/><input type="number" min="0.001" step="0.001" placeholder="Qty" value={it.qty} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/><select value={it.unit} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}>{[...new Set([it.unit,...masters.unit])].map(x=><option key={x}>{x}</option>)}</select><input type="number" min="0" step="0.01" placeholder="Nominal" value={it.unit_price} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,unit_price:e.target.value}:x))}/><button type="button" className="danger-icon" onClick={()=>setItems(items.filter((_,j)=>j!==i))}>×</button></div>)}<div className="request-total"><span>Total pengajuan</span><b>{rupiah(total)}</b></div></div>
  <label>Nama Vendor/Toko/Marketplace<input value={form.vendor_name} onChange={change('vendor_name')}/></label>
  <label>No Invoice/Nota/Pesanan<input value={form.invoice_no} onChange={change('invoice_no')}/></label>
  <label className="span2">Alamat/Link<input value={form.vendor_address} onChange={change('vendor_address')}/></label>
  <label className="span2">Catatan<textarea value={form.notes} onChange={change('notes')}/></label>
  <div className="form-actions span2"><button type="button" disabled={saving} onClick={closeForm}>Batal</button><button className="primary" disabled={saving}>{saving?'Menyimpan...':'Simpan pengajuan'}</button></div>
 </form></Modal>

 <Modal open={detailOpen} title={`Slip ${detail?.request_no||''}`} onClose={()=>setDetailOpen(false)}>
  <div className="sp-slip" id="print-slip">
   <div className="sp-topbar"><div className="sp-brand"><img className="sp-brand-logo" src="/logo-mjc-white-transparent.png" alt="Masjid Jalan Cahaya"/></div><div className="sp-title">SLIP PENGAJUAN</div></div>
   <div className="sp-top-meta">
    <div className="sp-fields compact sp-top-date">
     <PrintLine label="Tanggal" value={dateID(detail?.request_date)}/>
     <PrintLine label="Jam" value={timeText(detail?.request_time)}/>
    </div>
    <div className="sp-adminbox"><b>Diisi Oleh Admin</b><div className="sp-admin-number"><span>Nomor SP</span><strong>:</strong><i></i><em>/SP/MJC/</em><i></i><em>/{detail?.request_date?new Date(detail.request_date+'T00:00:00').getFullYear():new Date().getFullYear()}</em></div></div>
   </div>
   <div className="sp-transaction-full"><span>Jenis Transaksi</span><div>{transactionTypes.map(([v,l])=><PrintCheck key={v} checked={detail?.transaction_type===v} label={l}/>)}</div></div>
   <div className="sp-body">
    <section className="sp-left">
     <div className="sp-fields">
      <PrintLine label="Nama SPA/Santri" value={detail?.requester}/>
      <PrintLine label="Divisi/Departemen" value={detail?.department||detail?.program}/>
      <PrintLine label="Amanah" value={detail?.position_title}/>
      <PrintLine label="No Hp/WA" value={detail?.phone}/>
     </div>
     <div className="sp-textbox"><span>Tujuan Transaksi</span><p>{safe(detail?.purpose,'')}</p></div>
     <div className="sp-payment-row"><span>Tujuan Transaksi</span><div>{paymentTypes.map(([v,l])=><PrintCheck key={v} checked={detail?.payment_type===v} label={l}/>)}</div></div>
     <div className="sp-fields">
      <PrintLine label="No Rekening/VA" value={detail?.account_number}/>
      <PrintLine label="Atas Nama" value={detail?.account_name}/>
      <PrintLine label="Bank" value={detail?.bank_name}/>
     </div>
     <div className="sp-statement"><b>Pernyataan :</b><ol><li>Dengan menandatangani dokumen ini, maka SPA/Santri yang mengajukan menyatakan bahwa pengisian dokumen dan pengajuan dana, sesuai dengan ketentuan/prosedur/syarat yang berlaku.</li><li>Dengan menandatangani dokumen ini, maka Pimpinan Unit Kerja telah memeriksa dengan benar pengisian dokumen serta pengajuan dana telah sesuai dengan ketentuan/prosedur yang berlaku.</li></ol></div>
     <div className="sp-validation"><span>Validasi</span><div className="sp-sign-row"><div><b>Accounting</b><em></em><i></i></div><div><b>SPA/Accounting</b><em></em><i></i></div><div><b>Manager Finance</b><em></em><i></i></div></div></div>
    </section>

    <section className="sp-right">
     <div className="sp-cost-title">Informasi Pengeluaran Biaya</div>
     <div className={`sp-cost-grid ${(detail?.request_items||[]).length>6?'dense':''}`}>
      <div className="sp-cost-head"><div>Rincian</div><div>Nominal</div><div>Qty</div><div>Jumlah</div></div>
      <div className="sp-cost-body">{(detail?.request_items||[]).length?(detail.request_items.map(it=><div className="sp-cost-row" key={it.id}><div>{it.item_name}</div><div>{rupiah(it.unit_price)}</div><div>{it.qty}<small>{it.unit}</small></div><div>{rupiah(it.subtotal)}</div></div>)):<div className="sp-cost-row blank"><div>&nbsp;</div><div></div><div></div><div></div></div>}</div>
      <div className="sp-cost-total"><div>Total Nominal</div><div>{rupiah(detail?.total_amount)}</div></div>
     </div>
     <div className="sp-purpose-right"><PrintLine label="Tujuan Transaksi" value={detail?.purpose}/></div>
     <div className="sp-fields right-info">
      <PrintLine label="Nama Vendor/Toko/Marketplace" value={detail?.vendor_name}/>
      <PrintLine label="No Invoice/Nota/Pesanan" value={detail?.invoice_no}/>
      <PrintLine label="Alamat/Link" value={detail?.vendor_address}/>
     </div>
     <div className="sp-notes-sign"><div className="sp-notes"><b>Catatan :</b><p>{safe(detail?.notes,'')}</p></div><div className="sp-mini-sign"><b>Manager/SPV</b><em>{detail?.status&&detail.status!=='pending'?statusLabel(detail.status):''}</em><i></i></div><div className="sp-mini-sign"><b>Diajukan oleh</b><em>{safe(detail?.requester,'')}</em><i></i></div></div>
     <div className="sp-adminpay"><b>SPA/Administration &amp; Payroll</b><PrintLine label="Tanggal Transaksi" value={detail?.transaction_date?dateID(detail.transaction_date):''}/><PrintLine label="Waktu Transaksi" value={timeText(detail?.transaction_time)}/></div>
    </section>
   </div>
  </div>
  <div className="detail-actions"><button onClick={printSlip}><Printer size={16}/>Cetak slip A4</button>{has('requests.approve')&&detail?.status==='pending'&&<><button className="success-btn" onClick={()=>status(detail.id,'approved')}><CheckCircle2 size={16}/>Setujui</button><button className="danger-btn" onClick={()=>status(detail.id,'rejected')}><XCircle size={16}/>Tolak</button></>}{has('requests.approve')&&detail?.status==='approved'&&<button className="success-btn" onClick={()=>status(detail.id,'completed')}><CheckCircle2 size={16}/>Tandai selesai</button>}</div>
  <div className="receipt-box"><div className="receipt-title"><div><b>Lampiran nota</b><span>JPG, PNG atau PDF</span></div>{has('requests.create')&&<label className="upload-btn"><Upload size={16}/>Unggah nota<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={uploadReceipt}/></label>}</div><div className="receipt-list">{detail?.receipts?.map(x=>(x.signed_url?<a key={x.id} href={x.signed_url} target="_blank" rel="noreferrer">{x.file_name}</a>:<span key={x.id}>{x.file_name} · tautan tidak tersedia</span>))}{!detail?.receipts?.length&&<span className="muted">Belum ada nota diunggah.</span>}</div></div>
 </Modal>
 </>
}
