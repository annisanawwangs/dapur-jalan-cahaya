import React from 'react'
import { supabase, rupiah, num } from '../lib'
import { monthRange } from '../domain'
import { Card, Stat } from '../components/UI'
import { Wallet, ArrowDownCircle, ArrowUpCircle, TriangleAlert, ClipboardList } from 'lucide-react'

export default function Dashboard(){
  const [error,setError]=React.useState('')
  const [stats,setStats]=React.useState({income:0,expense:0,balance:0,low:0,pending:0})
  const [expenseCats,setExpenseCats]=React.useState([])
  const [monthly,setMonthly]=React.useState([])
  React.useEffect(()=>{load()},[])
  async function load(){
    if(!supabase)return
    const {from,to}=monthRange()
    const [t,m,r]=await Promise.all([
      supabase.from('transactions').select('type,amount,category,transaction_date').gte('transaction_date',from).lt('transaction_date',to),
      supabase.from('materials').select('current_stock,min_stock'),
      supabase.from('purchase_requests').select('status')
    ])
    const failed=[t,m,r].find(result=>result.error)
    if(failed){setError(failed.error.message);return}
    const tx=t.data||[]; const income=tx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount),0); const expense=tx.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount),0)
    const cats=Object.create(null); tx.filter(x=>x.type==='expense').forEach(x=>cats[x.category]=(cats[x.category]||0)+Number(x.amount))
    const days={}; tx.forEach(x=>{const d=Number(x.transaction_date.slice(-2)); if(!days[d])days[d]={day:d,income:0,expense:0}; days[d][x.type]+=Number(x.amount)})
    setStats({income,expense,balance:income-expense,low:(m.data||[]).filter(x=>Number(x.current_stock)<=Number(x.min_stock)).length,pending:(r.data||[]).filter(x=>x.status==='pending').length})
    setExpenseCats(Object.entries(cats).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,6))
    setMonthly(Object.values(days).sort((a,b)=>a.day-b.day))
  }
  const maxDay=Math.max(1,...monthly.flatMap(x=>[x.income,x.expense]))
  const maxCat=Math.max(1,...expenseCats.map(x=>x.value))
  if(error) return <Card><p role="alert">Gagal memuat ringkasan. {error}</p><button onClick={()=>{setError('');load()}}>Coba lagi</button></Card>
  return <>
    <div className="stats-grid">
      <Stat label="Saldo bulan ini" value={rupiah(stats.balance)} icon={<Wallet size={20}/>}/>
      <Stat label="Pemasukan" value={rupiah(stats.income)} icon={<ArrowDownCircle size={20}/>}/>
      <Stat label="Pengeluaran" value={rupiah(stats.expense)} icon={<ArrowUpCircle size={20}/>}/>
      <Stat label="Stok perlu perhatian" value={num(stats.low)} hint="stok ≤ batas minimum" icon={<TriangleAlert size={20}/>}/>
      <Stat label="Pengajuan pending" value={num(stats.pending)} icon={<ClipboardList size={20}/>}/>
    </div>
    <div className="chart-grid">
      <Card><div className="card-title"><div><h3>Arus kas bulan ini</h3><p>Pemasukan dan pengeluaran per tanggal</p></div></div>{monthly.length?<div className="cash-bars">{monthly.map(x=><div className="cash-day" key={x.day} title={`Tgl ${x.day} · Masuk ${rupiah(x.income)} · Keluar ${rupiah(x.expense)}`}><div className="bar-pair"><i className="bar-in" style={{height:`${Math.max(3,(x.income/maxDay)*100)}%`}}/><i className="bar-out" style={{height:`${Math.max(3,(x.expense/maxDay)*100)}%`}}/></div><span>{x.day}</span></div>)}</div>:<div className="empty-chart">Belum ada transaksi bulan ini.</div>}<div className="chart-key"><span><i className="dot in"/>Pemasukan</span><span><i className="dot out"/>Pengeluaran</span></div></Card>
      <Card><div className="card-title"><div><h3>Pengeluaran terbesar</h3><p>Menurut kategori</p></div></div>{expenseCats.length?<div className="category-bars">{expenseCats.map(x=><div key={x.name}><div><span>{x.name}</span><b>{rupiah(x.value)}</b></div><em><i style={{width:`${(x.value/maxCat)*100}%`}}/></em></div>)}</div>:<div className="empty-chart">Belum ada pengeluaran.</div>}</Card>
    </div>
  </>
}
