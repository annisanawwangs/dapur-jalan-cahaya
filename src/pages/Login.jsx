import React from 'react'
import { supabase } from '../lib'

export default function Login(){
  const [email,setEmail]=React.useState('')
  const [password,setPassword]=React.useState('')
  const [msg,setMsg]=React.useState('')
  const [busy,setBusy]=React.useState(false)
  const login=async(e)=>{e.preventDefault();if(!supabase){setMsg('Env Supabase belum diisi.');return}setBusy(true);setMsg('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message);setBusy(false)}
  return <div className="login-wrap"><div className="login-card"><div className="login-logo">JC</div><h1>Dapur Jalan Cahaya</h1><p>Masuk untuk mengelola keuangan, stok bahan, pengajuan, nota, dan tim sesuai hak akses Anda.</p><form onSubmit={login}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@contoh.com" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/></label>{msg&&<div className="form-error">{msg}</div>}<button className="primary full" disabled={busy}>{busy?'Memproses...':'Masuk'}</button></form><small>Member baru ditambahkan dan diatur oleh Admin dari dashboard.</small></div></div>
}
