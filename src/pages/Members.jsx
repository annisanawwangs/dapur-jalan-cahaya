import React from 'react'
import { Plus, Pencil, Search, UserCheck, UserX } from 'lucide-react'
import { supabase } from '../lib'
import { Card, Empty, Modal, Toast } from '../components/UI'

export default function Members({session}){
  const [rows,setRows]=React.useState([]),[roles,setRoles]=React.useState([]),[q,setQ]=React.useState(''),[open,setOpen]=React.useState(false),[edit,setEdit]=React.useState(null),[toast,setToast]=React.useState(''),[busy,setBusy]=React.useState(false)
  const [form,setForm]=React.useState({email:'',full_name:'',role_id:''})
  React.useEffect(()=>{load()},[])
  async function api(method,body){
    const res=await fetch('/api/members',{method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:body?JSON.stringify(body):undefined})
    const json=await res.json().catch(()=>({}))
    if(!res.ok) throw new Error(json.error||'Gagal memproses member.')
    return json
  }
  async function load(){
    try{
      const [memberData,roleRes]=await Promise.all([api('GET'),supabase.from('roles').select('*').order('name')])
      setRows(memberData.members||[]);setRoles(roleRes.data||[])
    }catch(e){setToast(e.message)}
  }
  function add(){setEdit(null);setForm({email:'',full_name:'',role_id:roles[0]?.id||''});setOpen(true)}
  function editRow(r){setEdit(r);setForm({email:r.email,full_name:r.full_name||'',role_id:r.role_id});setOpen(true)}
  async function save(e){e.preventDefault();setBusy(true);try{
    if(edit) await api('PATCH',{id:edit.id,email:form.email,full_name:form.full_name,role_id:form.role_id,active:edit.active})
    else await api('POST',form)
    setOpen(false);setToast(edit?'Member diperbarui.':'Undangan member dikirim.');await load()
  }catch(e){setToast(e.message)}finally{setBusy(false)}}
  async function toggle(r){
    const next=!r.active
    if(!confirm(`${next?'Aktifkan':'Nonaktifkan'} akses ${r.full_name||r.email}?`))return
    try{await api('PATCH',{id:r.id,email:r.email,full_name:r.full_name||r.email.split('@')[0],role_id:r.role_id,active:next});setToast(next?'Member diaktifkan.':'Member dinonaktifkan.');load()}catch(e){setToast(e.message)}
  }
  const filtered=rows.filter(r=>[r.full_name,r.email,r.role_name].join(' ').toLowerCase().includes(q.toLowerCase()))
  return <><Toast message={toast}/><div className="toolbar"><div className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari member..."/></div><button className="primary" onClick={add}><Plus size={17}/>Tambah member</button></div>
  <div className="info-banner"><b>Kelola tim dari sini.</b><span>Tambah member akan mengirim undangan email. Role menentukan menu dan tindakan yang boleh diakses.</span></div>
  <Card className="table-card"><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.full_name||'-'}</b>{r.id===session.user.id&&<small>Akun Anda</small>}</td><td>{r.email}</td><td><span className="badge">{r.role_name||'-'}</span></td><td><span className={`badge ${r.active?'success':'danger'}`}>{r.active?'Aktif':'Nonaktif'}</span></td><td><div className="row-actions"><button title="Edit" onClick={()=>editRow(r)}><Pencil size={15}/></button><button title={r.active?'Nonaktifkan':'Aktifkan'} onClick={()=>toggle(r)}>{r.active?<UserX size={15}/>:<UserCheck size={15}/>}</button></div></td></tr>)}</tbody></table>{!filtered.length&&<Empty title="Belum ada member" text="Tambahkan anggota tim agar dapat mengakses dashboard sesuai role."/>}</div></Card>
  <Modal open={open} title={edit?'Edit member':'Tambah member'} onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={save}><label className="span2">Nama lengkap<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required placeholder="Nama anggota tim"/></label><label className="span2">Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required placeholder="nama@email.com"/></label><label className="span2">Role<select value={form.role_id} onChange={e=>setForm({...form,role_id:e.target.value})} required>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{!edit&&<div className="span2 helper-text">Member akan menerima email undangan Supabase. Setelah membuka tautan undangan, ia bisa masuk ke dashboard dan mengatur password dari menu Akun Saya.</div>}<div className="form-actions span2"><button type="button" onClick={()=>setOpen(false)}>Batal</button><button className="primary" disabled={busy}>{busy?'Memproses...':edit?'Simpan':'Kirim undangan'}</button></div></form></Modal></>
}
