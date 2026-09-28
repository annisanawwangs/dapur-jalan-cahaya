import React from 'react'
import { Plus, Search, Eye, Trash2, Upload, Printer, CheckCircle2, XCircle } from 'lucide-react'
import { supabase, rupiah, dateID, getMasterOptions, groupOptions } from '../lib'
import { Card, Empty, Modal, Toast } from '../components/UI'

const localTime=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})
const blank=()=>({
  request_date:new Date().toISOString().slice(0,10),request_time:localTime(),requester:'',program:'',purpose:'',status:'pending',notes:'',
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

export default function Requests({has}){
 const [rows,setRows]=React.useState([]),[q,setQ]=React.useState(''),[open,setOpen]=React.useState(false),[detailOpen,setDetailOpen]=React.useState(false),[form,setForm]=React.useState(blank()),[items,setItems]=React.useState([{item_name:'',qty:1,unit:'pcs',unit_price:0}]),[detail,setDetail]=React.useState(null),[toast,setToast]=React.useState(''),[masters,setMasters]=React.useState(fallback)
 React.useEffect(()=>{load()},[])
 async function load(){if(!supabase)return;const [r,o]=await Promise.all([supabase.from('purchase_requests').select('*, request_items(*)').order('request_date',{ascending:false}).order('created_at',{ascending:false}),getMasterOptions(['program','unit'])]);setRows(r.data||[]);const g=groupOptions(o);setMasters({...fallback,...Object.fromEntries(Object.entries(g).filter(([,v])=>v.length))})}
 const filtered=rows.filter(r=>[r.request_no,r.requester,r.program,r.department,r.purpose,r.status].join(' ').toLowerCase().includes(q.toLowerCase()))
 const total=items.reduce((a,b)=>a+Number(b.qty||0)*Number(b.unit_price||0),0)
 function add(){setForm({...blank(),program:masters.program?.[0]||''});setItems([{item_name:'',qty:1,unit:masters.unit?.[0]||'pcs',unit_price:0}]);setOpen(true)}
 async function save(e){
   e.preventDefault()
   const payload={...form,total_amount:total,request_time:form.request_time||null}
   const {data:req,error}=await supabase.from('purchase_requests').insert(payload).select().single()
   if(error){setToast(error.message);return}
   const itemPayload=items.filter(x=>x.item_name.trim()).map(x=>({...x,request_id:req.id,qty:Number(x.qty),unit_price:Number(x.unit_price),subtotal:Number(x.qty)*Number(x.unit_price)}))
   if(itemPayload.length){const {error:e2}=await supabase.from('request_items').insert(itemPayload);if(e2){setToast(e2.message);return}}
   setOpen(false);setForm(blank());setItems([{item_name:'',qty:1,unit:'pcs',unit_price:0}]);setToast('Pengajuan tersimpan.');load()
 }
 async function remove(id){if(!confirm('Hapus pengajuan ini?'))return;const {error}=await supabase.from('purchase_requests').delete().eq('id',id);if(error)setToast(error.message);else load()}
 async function status(id,value){
   const update={status:value}
   if(value==='completed'){const now=new Date();update.transaction_date=now.toISOString().slice(0,10);update.transaction_time=localTime()}
   const {error}=await supabase.from('purchase_requests').update(update).eq('id',id)
   if(error){setToast(error.message);return}
   load(); if(detail?.id===id)setDetail({...detail,...update})
 }
 async function view(r){const {data:receipts}=await supabase.from('receipts').select('*').eq('request_id',r.id).order('created_at',{ascending:false});const signed=await Promise.all((receipts||[]).map(async x=>{const {data}=await supabase.storage.from('receipts').createSignedUrl(x.file_path,3600);return {...x,signed_url:data?.signedUrl||'#'}}));setDetail({...r,receipts:signed});setDetailOpen(true)}
 async function uploadReceipt(e){const file=e.target.files?.[0];if(!file||!detail)return;const path=`${detail.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabase.storage.from('receipts').upload(path,file);if(error){setToast(error.message);return}const {error:e2}=await supabase.from('receipts').insert({request_id:detail.id,file_name:file.name,file_path:path});if(e2){setToast(e2.message);return}setToast('Nota diunggah.');view(detail)}
 const change=k=>e=>setForm({...form,[k]:e.target.value})
 return <>
 <Toast message={toast}/>
 <div className="toolbar"><div className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari no, pemohon, program..."/></div>{has('requests.create')&&<button className="primary" onClick={add}><Plus size={17}/>Pengajuan</button>}</div>
 <Card className="table-card"><div className="table-wrap"><table><thead><tr><th>No.</th><th>Tanggal</th><th>Pemohon</th><th>Program / Keperluan</th><th>Status</th><th className="right">Total</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.request_no}</b></td><td>{dateID(r.request_date)}</td><td>{r.requester}</td><td><b>{r.program||r.department||'-'}</b><small>{r.purpose}</small></td><td><span className={`badge status-${r.status}`}>{r.status==='pending'?'Menunggu':r.status==='approved'?'Disetujui':r.status==='rejected'?'Ditolak':'Selesai'}</span></td><td className="right amount">{rupiah(r.total_amount)}</td><td><div className="row-actions"><button onClick={()=>view(r)}><Eye size={15}/></button>{has('requests.delete')&&<button onClick={()=>remove(r.id)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table>{!filtered.length&&<Empty title="Belum ada pengajuan"/>}</div></Card>

 <Modal open={open} title="Buat pengajuan baru" onClose={()=>setOpen(false)}><form className="form-grid wide-form request-form" onSubmit={save}>
  <label>Tanggal<input type="date" value={form.request_date} onChange={change('request_date')} required/></label>
  <label>Jam<input type="time" value={form.request_time} onChange={change('request_time')}/></label>
  <label className="span2">Jenis transaksi<select value={form.transaction_type} onChange={change('transaction_type')}>{transactionTypes.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
  <label>Nama SPA/Santri / Pemohon<input value={form.requester} onChange={change('requester')} required/></label>
  <label>Divisi/Departemen<input value={form.department} onChange={change('department')} placeholder="Dapur / Pendidikan / Baitulmal"/></label>
  <label>Amanah / Jabatan<input value={form.position_title} onChange={change('position_title')} placeholder="PIC Dapur"/></label>
  <label>No HP/WA<input value={form.phone} onChange={change('phone')} placeholder="08xxxxxxxxxx"/></label>
  <label>Program internal<select value={form.program} onChange={change('program')}><option value="">-</option>{(masters.program||[]).map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Cara pembayaran<select value={form.payment_type} onChange={change('payment_type')}>{paymentTypes.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
  <label className="span2">Tujuan transaksi<textarea value={form.purpose} onChange={change('purpose')} required placeholder="Belanja bahan pekanan"/></label>
  <label>No Rekening / VA<input value={form.account_number} onChange={change('account_number')}/></label>
  <label>Atas Nama<input value={form.account_name} onChange={change('account_name')}/></label>
  <label className="span2">Bank<input value={form.bank_name} onChange={change('bank_name')}/></label>
  <div className="span2 request-items"><div className="request-head"><b>Informasi pengeluaran biaya</b><button type="button" onClick={()=>setItems([...items,{item_name:'',qty:1,unit:masters.unit?.[0]||'pcs',unit_price:0}])}><Plus size={15}/>Baris</button></div>{items.map((it,i)=><div className="item-row" key={i}><input placeholder="Rincian / nama barang" value={it.item_name} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,item_name:e.target.value}:x))}/><input type="number" min="0" step="0.01" placeholder="Qty" value={it.qty} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/><select value={it.unit} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}>{(masters.unit||[]).map(x=><option key={x}>{x}</option>)}</select><input type="number" min="0" step="100" placeholder="Nominal" value={it.unit_price} onChange={e=>setItems(items.map((x,j)=>j===i?{...x,unit_price:e.target.value}:x))}/><button type="button" className="danger-icon" onClick={()=>setItems(items.filter((_,j)=>j!==i))}>×</button></div>)}<div className="request-total"><span>Total pengajuan</span><b>{rupiah(total)}</b></div></div>
  <label>Nama Vendor/Toko/Marketplace<input value={form.vendor_name} onChange={change('vendor_name')}/></label>
  <label>No Invoice/Nota/Pesanan<input value={form.invoice_no} onChange={change('invoice_no')}/></label>
  <label className="span2">Alamat/Link<input value={form.vendor_address} onChange={change('vendor_address')}/></label>
  <label className="span2">Catatan<textarea value={form.notes} onChange={change('notes')}/></label>
  <div className="form-actions span2"><button type="button" onClick={()=>setOpen(false)}>Batal</button><button className="primary">Simpan pengajuan</button></div>
 </form></Modal>

 <Modal open={detailOpen} title={`Slip ${detail?.request_no||''}`} onClose={()=>setDetailOpen(false)}>
  <div className="sp-slip" id="print-slip">
   <div className="sp-topbar"><div className="sp-brand"><div className="sp-logo">JC</div><div><strong>DAPUR</strong><span>JALAN CAHAYA</span></div></div><div className="sp-title">SLIP PENGAJUAN</div></div>
   <div className="sp-body">
    <section className="sp-left">
     <div className="sp-fields compact">
      <PrintLine label="Tanggal" value={dateID(detail?.request_date)}/>
      <PrintLine label="Jam" value={timeText(detail?.request_time)}/>
     </div>
     <div className="sp-transaction-row"><span>Jenis Transaksi</span><div>{transactionTypes.map(([v,l])=><PrintCheck key={v} checked={detail?.transaction_type===v} label={l}/>)}</div></div>
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
     <div className="sp-statement"><b>Pernyataan :</b><ol><li>Dengan pengajuan ini, pemohon menyatakan bahwa data dan pengajuan dana telah diisi sesuai ketentuan/prosedur/syariat yang berlaku.</li><li>Pimpinan unit kerja telah memeriksa kebenaran pengisian dokumen dan pengajuan dana.</li></ol></div>
     <div className="sp-validation"><span>Validasi</span><div className="sp-sign-row"><div><b>Accounting</b><em></em><i></i></div><div><b>SPA/Accounting</b><em></em><i></i></div><div><b>Manager Finance</b><em></em><i></i></div></div></div>
    </section>

    <section className="sp-right">
     <div className="sp-adminbox"><b>Diisi Oleh Admin</b><div><span>Nomor SP</span><strong>{safe(detail?.request_no,'')}</strong><em>{detail?.request_date?new Date(detail.request_date+'T00:00:00').getFullYear():new Date().getFullYear()}</em></div></div>
     <div className="sp-cost-title">Informasi Pengeluaran Biaya</div>
     <table className="sp-cost-table"><thead><tr><th>Rincian</th><th>Nominal</th><th>Qty</th><th>Jumlah</th></tr></thead><tbody>{(detail?.request_items||[]).map(it=><tr key={it.id}><td>{it.item_name}</td><td>{rupiah(it.unit_price)}</td><td>{it.qty} {it.unit}</td><td>{rupiah(it.subtotal)}</td></tr>)}{!(detail?.request_items||[]).length&&<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>}</tbody><tfoot><tr><td>Total Nominal</td><td colSpan="3">{rupiah(detail?.total_amount)}</td></tr></tfoot></table>
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
  <div className="detail-actions"><button onClick={()=>window.print()}><Printer size={16}/>Cetak slip A4</button>{has('requests.approve')&&detail?.status==='pending'&&<><button className="success-btn" onClick={()=>status(detail.id,'approved')}><CheckCircle2 size={16}/>Setujui</button><button className="danger-btn" onClick={()=>status(detail.id,'rejected')}><XCircle size={16}/>Tolak</button></>}{has('requests.approve')&&detail?.status==='approved'&&<button className="success-btn" onClick={()=>status(detail.id,'completed')}><CheckCircle2 size={16}/>Tandai selesai</button>}</div>
  <div className="receipt-box"><div className="receipt-title"><div><b>Lampiran nota</b><span>JPG, PNG atau PDF</span></div>{has('requests.create')&&<label className="upload-btn"><Upload size={16}/>Unggah nota<input type="file" accept="image/*,.pdf" onChange={uploadReceipt}/></label>}</div><div className="receipt-list">{detail?.receipts?.map(x=><a key={x.id} href={x.signed_url} target="_blank" rel="noreferrer">{x.file_name}</a>)}{!detail?.receipts?.length&&<span className="muted">Belum ada nota diunggah.</span>}</div></div>
 </Modal>
 </>
}
