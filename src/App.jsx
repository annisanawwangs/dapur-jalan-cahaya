import React from 'react'
import { supabase } from './lib'
import Shell from './components/Shell'
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
  const [access,setAccess]=React.useState({loading:true,profile:null,permissions:new Set(),config:null})

  React.useEffect(()=>{
    if(!supabase){setSession(null);return}
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:sub}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s))
    return ()=>sub.subscription.unsubscribe()
  },[])

  const loadAccess=React.useCallback(async()=>{
    if(!session?.user || !supabase){setAccess({loading:false,profile:null,permissions:new Set(),config:null});return}
    setAccess(a=>({...a,loading:true}))
    const {data:profile,error}=await supabase.from('members').select('id,email,full_name,active,role_id,roles(id,name,slug)').eq('id',session.user.id).maybeSingle()
    if(error || !profile){setAccess({loading:false,profile:null,permissions:new Set(),config:null});return}
    if(!profile.active){setAccess({loading:false,profile,permissions:new Set(),config:null});return}
    const [permRes,configRes]=await Promise.all([
      supabase.from('role_permissions').select('permission,allowed').eq('role_id',profile.role_id).eq('allowed',true),
      supabase.from('app_config').select('*').eq('id',true).maybeSingle()
    ])
    setAccess({loading:false,profile,permissions:new Set((permRes.data||[]).map(x=>x.permission)),config:configRes.data||null})
  },[session?.user?.id])

  React.useEffect(()=>{ if(session) loadAccess() },[session,loadAccess])

  if(session===undefined) return <div className="loading">Memuat Dapur Jalan Cahaya...</div>
  if(!session) return <Login/>
  if(access.loading) return <div className="loading">Menyiapkan hak akses...</div>
  if(!access.profile) return <div className="login-wrap"><div className="login-card"><div className="login-logo">JC</div><h1>Akun belum terdaftar</h1><p>Akun Anda sudah login, tetapi belum tercatat sebagai member Dashboard Dapur Jalan Cahaya. Hubungi Admin.</p><button className="primary full" onClick={()=>supabase.auth.signOut()}>Keluar</button></div></div>
  if(!access.profile.active) return <div className="login-wrap"><div className="login-card"><div className="login-logo">JC</div><h1>Akun dinonaktifkan</h1><p>Akses dashboard untuk akun ini sedang nonaktif. Hubungi Admin jika perlu diaktifkan kembali.</p><button className="primary full" onClick={()=>supabase.auth.signOut()}>Keluar</button></div></div>

  const has=(permission)=>permission==='account.view' || access.permissions.has(permission)
  const pages={
    dashboard:<Dashboard/>,
    finance:<Finance has={has}/>,
    stock:<Stock has={has}/>,
    requests:<Requests has={has}/>,
    members:<Members session={session}/>,
    settings:<Settings onChanged={loadAccess}/>,
    account:<Account profile={access.profile} onChanged={loadAccess}/>,
  }
  return <Shell page={page} setPage={setPage} user={session.user} profile={access.profile} has={has} config={access.config} onLogout={()=>supabase.auth.signOut()}>{pages[page]}</Shell>
}
