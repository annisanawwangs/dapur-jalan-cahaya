import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null

export const rupiah = (value = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(Number(value || 0))

export const num = (value = 0) => new Intl.NumberFormat('id-ID').format(Number(value || 0))

export const dateID = (value) => value ? new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date(value)) : '-'

export const downloadCSV = (filename, rows) => {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl; a.download = filename; a.click(); URL.revokeObjectURL(blobUrl)
}

export async function getMasterOptions(types=[]){
  if(!supabase) return []
  let q=supabase.from('master_options').select('*').eq('active',true).order('sort_order').order('name')
  if(types.length) q=q.in('type',types)
  const {data}=await q
  return data||[]
}

export const groupOptions=(rows=[])=>rows.reduce((a,r)=>{(a[r.type] ||= []).push(r.name);return a},{})
