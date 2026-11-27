import React from 'react'
import { supabase } from './lib'
import Shell, { items } from './components/Shell'
import { useInstallApp } from './components/InstallApp'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Finance from './pages/Finance'
import Stock from './pages/Stock'
import Requests from './pages/Requests'
import Members from './pages/Members'
import Settings from './pages/Settings'
import Account from './pages/Account'

export default function App(){
  const [session,setSession]=React.useState(undefined)
  const [page,setPage]=React.useState('dashboard')
  const [access,setAccess]=React.useState(null)
  const [accessError,setAccessError]=React.useState(null)
  const request=React.useRef(0)
  const installApp=useInstallApp()
  const userId=session?.user?.id

  React.useEffect(()=>{
    if(!supabase){setSession(null);return}
    const {data:sub}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
    return ()=>sub.subscription.unsubscribe()
  },[])

  const loadAccess=React.useCallback(async()=>{
    if(!userId) return
    const current=++request.current
    setAccessError(null)
    try{
      const {data:profile,error}=await supabase.from('members')
        .select('id,email,full_name,active,role_id,roles(id,name,slug)').eq('id',userId).maybeSingle()
      if(error) throw error
      let permissions=new Set()
      let config=null
      if(profile?.active){
        const [permRes,configRes]=await Promise.all([
          supabase.from('role_permissions').select('permission,allowed').eq('role_id',profile.role_id).eq('allowed',true),
          supabase.from('app_config').select('*').eq('id',true).maybeSingle()
        ])
        if(permRes.error || configRes.error) throw permRes.error || configRes.error
        permissions=new Set((permRes.data||[]).map(row=>row.permission))
        config=configRes.data
      }
      if(current===request.current) setAccess({userId,profile,permissions,config})
    }catch(error){
      if(current===request.current) setAccessError({userId,message:error.message})
    }
  },[userId])

  React.useEffect(()=>{
    loadAccess()
    return ()=>{request.current++}
  },[loadAccess])

  if(session===undefined) return <div className="loading">Memuat Dapur Jalan Cahaya...</div>
  if(!session) return <Login/>
  if(accessError?.userId===userId) return <div className="login-wrap"><div className="login-card">
    <h1>Gagal memuat hak akses</h1><p role="alert">{accessError.message}</p>
    <button className="primary full" onClick={loadAccess}>Coba lagi</button>
    <button className="full" onClick={()=>supabase.auth.signOut()}>Keluar</button>
  </div></div>
  if(access?.userId!==userId) return <div className="loading">Menyiapkan hak akses...</div>
  if(!access.profile) return <div className="login-wrap"><div className="login-card"><div className="login-logo">JC</div><h1>Akun belum terdaftar</h1><p>Akun Anda sudah login, tetapi belum tercatat sebagai member Dashboard Dapur Jalan Cahaya. Hubungi Admin.</p><button className="primary full" onClick={()=>supabase.auth.signOut()}>Keluar</button></div></div>
  if(!access.profile.active) return <div className="login-wrap"><div className="login-card"><div className="login-logo">JC</div><h1>Akun dinonaktifkan</h1><p>Akses dashboard untuk akun ini sedang nonaktif. Hubungi Admin jika perlu diaktifkan kembali.</p><button className="primary full" onClick={()=>supabase.auth.signOut()}>Keluar</button></div></div>

  const has=(permission)=>permission==='account.view' || access.permissions.has(permission)
  const visible=items.filter(item=>has(item[3]))
  const activePage=visible.some(item=>item[0]===page)?page:visible[0][0]
  const pages={
    dashboard:<Dashboard/>,
    finance:<Finance has={has}/>,
    stock:<Stock has={has}/>,
    requests:<Requests has={has} userId={session.user.id}/>,
    members:<Members session={session}/>,
    settings:<Settings onChanged={loadAccess}/>,
    account:<Account profile={access.profile} onChanged={loadAccess} installApp={installApp}/>,
  }
  return <Shell key={userId} page={activePage} setPage={setPage} user={session.user} profile={access.profile} has={has} config={access.config} onLogout={()=>supabase.auth.signOut()}>{pages[activePage]}</Shell>
}
