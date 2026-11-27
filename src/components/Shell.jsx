import React from 'react'
import { LayoutDashboard, WalletCards, Boxes, ReceiptText, LogOut, Menu, X, Users, Settings, CircleUserRound } from 'lucide-react'

export const items = [
  ['dashboard','Ringkasan',LayoutDashboard,'dashboard.view'],
  ['finance','Catatan Keuangan',WalletCards,'finance.view'],
  ['stock','Stok Bahan',Boxes,'stock.view'],
  ['requests','Pengajuan & Nota',ReceiptText,'requests.view'],
  ['members','Member & Akses',Users,'members.manage'],
  ['settings','Pengaturan',Settings,'settings.manage'],
  ['account','Akun Saya',CircleUserRound,'account.view'],
]

export default function Shell({page,setPage,user,profile,has,config,onLogout,children}){
  const [open,setOpen]=React.useState(false)
  const visible=items.filter(i=>has(i[3]))
  const current=items.find(i=>i[0]===page)
  const appName=config?.app_name||'Dapur Jalan Cahaya'
  const appSubtitle=config?.app_subtitle||'Operasional dapur'
  const initials=config?.brand_initials||'JC'
  return <div className="app-shell">
    <aside className={`sidebar ${open?'open':''}`}>
      <div className="brand"><div className="brand-mark">{initials}</div><div><b>{appName}</b><span>{appSubtitle}</span></div></div>
      <button className="mobile-close" onClick={()=>setOpen(false)}><X size={20}/></button>
      <nav>{visible.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setOpen(false)}}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot"><div className="user-chip"><div className="avatar">{(profile?.full_name||user?.email||'U')[0].toUpperCase()}</div><div><b>{profile?.full_name||user?.email?.split('@')[0]}</b><span>{profile?.roles?.name||user?.email}</span></div></div><button onClick={onLogout}><LogOut size={18}/>Keluar</button></div>
    </aside>
    <main className="main"><header className="topbar"><button className="hamb" onClick={()=>setOpen(true)}><Menu size={22}/></button><div><h1>{current?.[1]}</h1><p>{appName}</p></div><div className="top-email">{profile?.roles?.name} · {profile?.email||user?.email}</div></header><section className="content">{children}</section></main>
  </div>
}
