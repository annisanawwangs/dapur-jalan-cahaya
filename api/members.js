import { createClient } from '@supabase/supabase-js'

const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function client(){
  if(!url||!secret) throw new Error('Server env SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi.')
  return createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}})
}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):''}
function send(res,status,data){res.status(status).json(data)}

async function requireManager(admin,token){
  if(!token) throw Object.assign(new Error('Sesi tidak ditemukan.'),{status:401})
  const {data:{user},error}=await admin.auth.getUser(token)
  if(error||!user) throw Object.assign(new Error('Sesi tidak valid.'),{status:401})
  const {data:member}=await admin.from('members').select('id,active,role_id').eq('id',user.id).maybeSingle()
  if(!member?.active) throw Object.assign(new Error('Akun tidak aktif.'),{status:403})
  const {data:permission}=await admin.from('role_permissions').select('allowed').eq('role_id',member.role_id).eq('permission','members.manage').eq('allowed',true).maybeSingle()
  if(!permission) throw Object.assign(new Error('Anda tidak memiliki akses mengelola member.'),{status:403})
  return user
}

export default async function handler(req,res){
  try{
    const admin=client()
    const actor=await requireManager(admin,bearer(req))

    if(req.method==='GET'){
      const {data,error}=await admin.from('members').select('id,email,full_name,role_id,active,created_at,roles(name,slug)').order('created_at',{ascending:true})
      if(error) throw error
      return send(res,200,{members:(data||[]).map(m=>({...m,role_name:m.roles?.name||'',role_slug:m.roles?.slug||''}))})
    }

    if(req.method==='POST'){
      const email=String(req.body?.email||'').trim().toLowerCase()
      const full_name=String(req.body?.full_name||'').trim()
      const role_id=String(req.body?.role_id||'')
      if(!email||!email.includes('@')||!full_name||!role_id) return send(res,400,{error:'Nama, email, dan role wajib diisi.'})
      const {data:role}=await admin.from('roles').select('id').eq('id',role_id).maybeSingle()
      if(!role) return send(res,400,{error:'Role tidak ditemukan.'})
      const redirectTo=(process.env.APP_URL||'').replace(/\/$/,'') || undefined
      const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name},...(redirectTo?{redirectTo}:{})})
      if(error) return send(res,400,{error:error.message.includes('already')?'Email tersebut sudah terdaftar. Edit role member yang sudah ada atau gunakan email lain.':error.message})
      const user=data?.user
      if(!user) return send(res,500,{error:'User tidak berhasil dibuat.'})
      const {error:profileError}=await admin.from('members').upsert({id:user.id,email,full_name,role_id,active:true},{onConflict:'id'})
      if(profileError) throw profileError
      return send(res,201,{ok:true,id:user.id})
    }

    if(req.method==='PATCH'){
      const id=String(req.body?.id||'')
      const email=String(req.body?.email||'').trim().toLowerCase()
      const full_name=String(req.body?.full_name||'').trim()
      const role_id=String(req.body?.role_id||'')
      const active=req.body?.active!==false
      if(!id||!email||!email.includes('@')||!full_name||!role_id) return send(res,400,{error:'Data member belum lengkap.'})
      const [{data:target},{data:newRole},{data:adminRole}]=await Promise.all([
        admin.from('members').select('id,role_id,active').eq('id',id).maybeSingle(),
        admin.from('roles').select('id,slug').eq('id',role_id).maybeSingle(),
        admin.from('roles').select('id').eq('slug','admin').maybeSingle()
      ])
      if(!target||!newRole) return send(res,404,{error:'Member atau role tidak ditemukan.'})
      if(id===actor.id && !active) return send(res,400,{error:'Anda tidak dapat menonaktifkan akun sendiri.'})
      if(adminRole && target.role_id===adminRole.id && (!active||role_id!==adminRole.id)){
        const {count}=await admin.from('members').select('*',{count:'exact',head:true}).eq('role_id',adminRole.id).eq('active',true)
        if((count||0)<=1) return send(res,400,{error:'Minimal harus ada satu Admin aktif.'})
      }
      const {error:authError}=await admin.auth.admin.updateUserById(id,{email,user_metadata:{full_name}})
      if(authError) return send(res,400,{error:authError.message})
      const {error}=await admin.from('members').update({email,full_name,role_id,active}).eq('id',id)
      if(error) throw error
      return send(res,200,{ok:true})
    }

    res.setHeader('Allow','GET, POST, PATCH')
    return send(res,405,{error:'Method tidak didukung.'})
  }catch(e){
    return send(res,e.status||500,{error:e.message||'Terjadi kesalahan server.'})
  }
}
