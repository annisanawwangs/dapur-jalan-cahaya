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
  const {data:member,error:memberError}=await admin.from('members').select('id,active,role_id,roles(slug)').eq('id',user.id).maybeSingle()
  if(memberError) throw memberError
  if(!member?.active) throw Object.assign(new Error('Akun tidak aktif.'),{status:403})
  const {data:permission,error:permissionError}=await admin.from('role_permissions').select('allowed').eq('role_id',member.role_id).eq('permission','members.manage').eq('allowed',true).maybeSingle()
  if(permissionError) throw permissionError
  if(!permission) throw Object.assign(new Error('Anda tidak memiliki akses mengelola member.'),{status:403})
  return member
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
      const password=String(req.body?.password||'')

      if(!email||!email.includes('@')||!full_name||!role_id||!password){
        return send(res,400,{error:'Nama, email, password, dan role wajib diisi.'})
      }
      if(password.length<8){
        return send(res,400,{error:'Password minimal 8 karakter.'})
      }

      const {data:role,error:roleError}=await admin.from('roles').select('id,slug').eq('id',role_id).maybeSingle()
      if(roleError) throw roleError
      if(!role) return send(res,400,{error:'Role tidak ditemukan.'})
      if(role.slug==='admin' && actor.roles?.slug!=='admin') return send(res,403,{error:'Hanya Admin yang dapat membuat akun Admin.'})

      const {data,error}=await admin.auth.admin.createUser({
        email,
        password,
        email_confirm:true,
        user_metadata:{full_name}
      })

      if(error){
        const msg=String(error.message||'')
        return send(res,400,{error:/already|registered|exists/i.test(msg)?'Email tersebut sudah terdaftar. Edit member yang sudah ada atau gunakan email lain.':msg})
      }

      const user=data?.user
      if(!user) return send(res,500,{error:'User tidak berhasil dibuat.'})

      const {error:profileError}=await admin.from('members').upsert({
        id:user.id,
        email,
        full_name,
        role_id,
        active:true
      },{onConflict:'id'})

      if(profileError){
        // Hindari akun Auth yatim bila pembuatan profil gagal.
        await admin.auth.admin.deleteUser(user.id).catch(()=>{})
        throw profileError
      }

      return send(res,201,{ok:true,id:user.id})
    }

    if(req.method==='PATCH'){
      const body=req.body
      if(!body || typeof body!=='object' || Array.isArray(body)) return send(res,400,{error:'Data member tidak valid.'})
      const id=String(body.id||'')
      const statusOnly=Object.keys(body).every(key=>key==='id'||key==='active')
      const email=String(body.email||'').trim().toLowerCase()
      const full_name=String(body.full_name||'').trim()
      const role_id=String(body.role_id||'')
      const password=String(body.password||'')

      if(!id || (statusOnly && typeof body.active!=='boolean') ||
        (!statusOnly && (!email.includes('@')||!full_name||!role_id)) ||
        ('active' in body && typeof body.active!=='boolean')){
        return send(res,400,{error:'Data member belum lengkap atau status tidak valid.'})
      }
      if(password && password.length<8) return send(res,400,{error:'Password baru minimal 8 karakter.'})

      const {data:target,error:targetError}=await admin.from('members').select('id,email,full_name,role_id,active,roles(slug)').eq('id',id).maybeSingle()
      if(targetError) throw targetError
      if(!target) return send(res,404,{error:'Member tidak ditemukan.'})
      const active=body.active??target.active
      const targetIsAdmin=target.roles?.slug==='admin'
      let nextRole=target.roles
      if(!statusOnly && role_id!==target.role_id){
        const {data,error}=await admin.from('roles').select('id,slug').eq('id',role_id).maybeSingle()
        if(error) throw error
        if(!data) return send(res,404,{error:'Role tidak ditemukan.'})
        nextRole=data
      }
      if((targetIsAdmin||nextRole?.slug==='admin') && actor.roles?.slug!=='admin'){
        return send(res,403,{error:'Hanya Admin yang dapat mengelola akun Admin.'})
      }
      if(id===actor.id && !active) return send(res,400,{error:'Anda tidak dapat menonaktifkan akun sendiri.'})
      if(targetIsAdmin && target.active && (!active||nextRole?.slug!=='admin')){
        const {count,error}=await admin.from('members').select('*',{count:'exact',head:true}).eq('role_id',target.role_id).eq('active',true)
        if(error) throw error
        if((count||0)<=1) return send(res,400,{error:'Minimal harus ada satu Admin aktif.'})
      }

      const authChanges={}
      if(!statusOnly && email!==target.email) authChanges.email=email
      if(!statusOnly && full_name!==target.full_name) authChanges.user_metadata={full_name}
      if(password) authChanges.password=password
      if(Object.keys(authChanges).length){
        const {error:authError}=await admin.auth.admin.updateUserById(id,authChanges)
        if(authError) return send(res,400,{error:authError.message})
      }

      const changes=statusOnly?{}:{email,full_name,role_id}
      if('active' in body) changes.active=active
      const {data:updated,error}=await admin.from('members').update(changes).eq('id',id).select('id').maybeSingle()
      if(error) throw error
      if(!updated) return send(res,404,{error:'Member tidak ditemukan.'})
      return send(res,200,{ok:true})
    }

    res.setHeader('Allow','GET, POST, PATCH')
    return send(res,405,{error:'Method tidak didukung.'})
  }catch(e){
    return send(res,e.status||500,{error:e.message||'Terjadi kesalahan server.'})
  }
}
