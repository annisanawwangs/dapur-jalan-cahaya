-- =============================================================
-- DAPUR JALAN CAHAYA - SUPABASE SCHEMA v2
-- Self-service admin, member, role/permission, master data.
-- Jalankan seluruh file ini di Supabase > SQL Editor.
-- Aman dijalankan untuk upgrade dari schema v1.
-- =============================================================

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------- ROLE & MEMBER -------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.roles(slug,name,description,is_system) values
 ('admin','Admin','Akses penuh termasuk member dan pengaturan',true),
 ('manager','Manager','Kelola operasional, stok, keuangan dan approval',true),
 ('finance','Keuangan','Kelola transaksi dan melihat pengajuan',true),
 ('stock','Stok / Dapur','Kelola bahan, mutasi stok dan membuat pengajuan',true),
 ('viewer','Viewer','Akses baca dashboard',true)
on conflict (slug) do update set name=excluded.name, description=excluded.description;

create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role_id uuid not null references public.roles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists members_role_idx on public.members(role_id);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  allowed boolean not null default false,
  primary key(role_id,permission)
);

with permissions(permission) as (values
 ('dashboard.view'),('finance.view'),('finance.create'),('finance.edit'),('finance.delete'),
 ('stock.view'),('stock.manage'),('stock.delete'),
 ('requests.view'),('requests.create'),('requests.approve'),('requests.delete'),
 ('members.manage'),('settings.manage')
)
insert into public.role_permissions(role_id,permission,allowed)
select r.id,p.permission,
  case
    when r.slug='admin' then true
    when r.slug='manager' then p.permission not in ('members.manage','settings.manage')
    when r.slug='finance' then p.permission in ('dashboard.view','finance.view','finance.create','finance.edit','finance.delete','requests.view','requests.create')
    when r.slug='stock' then p.permission in ('dashboard.view','stock.view','stock.manage','stock.delete','requests.view','requests.create')
    when r.slug='viewer' then p.permission in ('dashboard.view','finance.view','stock.view','requests.view')
    else false
  end
from public.roles r cross join permissions p
where r.slug in ('admin','manager','finance','stock','viewer')
on conflict(role_id,permission) do nothing;

-- Admin selalu punya akses penuh agar tidak terjadi lockout dari UI.
update public.role_permissions rp set allowed=true
from public.roles r where rp.role_id=r.id and r.slug='admin';

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.members m
    where m.id=(select auth.uid()) and m.active=true
  );
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.members m
    join public.role_permissions rp on rp.role_id=m.role_id
    where m.id=(select auth.uid())
      and m.active=true
      and rp.permission=p_permission
      and rp.allowed=true
  );
$$;
revoke all on function private.is_active_member() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.has_permission(text) to authenticated;

-- Otomatis buat profil ketika user baru dibuat/diundang.
-- User pertama menjadi Admin, user berikutnya Viewer (role bisa diubah Admin).
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role_id uuid;
  v_role_slug text;
begin
  if exists(select 1 from public.members) then v_role_slug := 'viewer'; else v_role_slug := 'admin'; end if;
  select id into v_role_id from public.roles where slug=v_role_slug;
  insert into public.members(id,email,full_name,role_id,active)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),v_role_id,true)
  on conflict(id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_dapur on auth.users;
create trigger on_auth_user_created_dapur
after insert on auth.users for each row execute function private.handle_new_auth_user();

-- Backfill user yang sudah ada. User tertua menjadi Admin jika belum ada member.
do $$
declare v_admin_role uuid; v_viewer_role uuid; v_first uuid;
begin
  select id into v_admin_role from public.roles where slug='admin';
  select id into v_viewer_role from public.roles where slug='viewer';
  if not exists(select 1 from public.members) then
    select id into v_first from auth.users order by created_at asc limit 1;
    if v_first is not null then
      insert into public.members(id,email,full_name,role_id,active)
      select u.id,coalesce(u.email,''),coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),v_admin_role,true
      from auth.users u where u.id=v_first on conflict(id) do nothing;
    end if;
  end if;
  insert into public.members(id,email,full_name,role_id,active)
  select u.id,coalesce(u.email,''),coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),v_viewer_role,true
  from auth.users u where not exists(select 1 from public.members m where m.id=u.id)
  on conflict(id) do nothing;
end $$;

-- ---------------------- APP CONFIG ----------------------------
create table if not exists public.app_config (
  id boolean primary key default true check(id=true),
  app_name text not null default 'Dapur Jalan Cahaya',
  app_subtitle text not null default 'Operasional dapur',
  brand_initials text not null default 'JC',
  updated_at timestamptz not null default now()
);
insert into public.app_config(id,app_name,app_subtitle,brand_initials)
values(true,'Dapur Jalan Cahaya','Operasional dapur','JC') on conflict(id) do nothing;

create table if not exists public.master_options (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists master_options_type_name_uidx on public.master_options(type,lower(name));
create index if not exists master_options_type_idx on public.master_options(type,active,sort_order);

insert into public.master_options(type,name,sort_order) values
 ('expense_category','Bahan Pokok',10),('expense_category','Protein',20),('expense_category','Bumbu',30),('expense_category','Sayur',40),('expense_category','Kebersihan',50),('expense_category','Alat Dapur',60),('expense_category','Bahan Tambahan',70),('expense_category','Minuman',80),('expense_category','Kemasan',90),('expense_category','Jasa',100),('expense_category','Lainnya',110),
 ('income_category','Top Up Kas',10),('income_category','Donasi',20),('income_category','Penggantian',30),('income_category','Pendapatan Lain',40),
 ('payment_method','Cash',10),('payment_method','Transfer',20),('payment_method','QRIS',30),
 ('program','Makan TIM',10),('program','Makan SBQ',20),('program','Majelis Keluarga Bahagia',30),('program','Weekend di Masjid',40),
 ('material_category','Bahan Pokok',10),('material_category','Protein',20),('material_category','Bumbu',30),('material_category','Sayur',40),('material_category','Kebersihan',50),('material_category','Alat Dapur',60),('material_category','Bahan Tambahan',70),('material_category','Minuman',80),('material_category','Kemasan',90),('material_category','Lainnya',100),
 ('unit','gram',10),('unit','kg',20),('unit','ml',30),('unit','liter',40),('unit','pcs',50),('unit','pack',60),('unit','ikat',70),('unit','butir',80)
on conflict do nothing;

-- ------------------------- KEUANGAN ----------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income','expense')),
  amount numeric(15,2) not null check (amount >= 0),
  category text not null,
  description text,
  merchant text,
  program text,
  payment_method text not null default 'Cash',
  transaction_date date not null default current_date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_date_idx on public.transactions(transaction_date desc);
create index if not exists transactions_type_idx on public.transactions(type);

-- --------------------------- STOK ------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'Lainnya',
  unit text not null default 'gram',
  current_stock numeric(15,3) not null default 0,
  min_stock numeric(15,3) not null default 0,
  purchase_price numeric(15,2) not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  movement_type text not null check (movement_type in ('in','out')),
  quantity numeric(15,3) not null check (quantity > 0),
  unit_cost numeric(15,2) not null default 0,
  note text,
  movement_date date not null default current_date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_material_idx on public.stock_movements(material_id,movement_date desc);

create or replace function public.record_stock_movement(
  p_material_id uuid,p_type text,p_quantity numeric,p_unit_cost numeric default 0,p_note text default null,p_movement_date date default current_date
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_stock numeric; v_id uuid;
begin
  if not private.has_permission('stock.manage') then raise exception 'Anda tidak memiliki akses mengelola stok'; end if;
  if p_type not in ('in','out') then raise exception 'Jenis mutasi tidak valid'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select current_stock into v_stock from public.materials where id=p_material_id for update;
  if v_stock is null then raise exception 'Bahan tidak ditemukan'; end if;
  if p_type='out' and v_stock<p_quantity then raise exception 'Stok tidak cukup. Tersedia: %',v_stock; end if;
  insert into public.stock_movements(material_id,movement_type,quantity,unit_cost,note,movement_date)
  values(p_material_id,p_type,p_quantity,coalesce(p_unit_cost,0),p_note,coalesce(p_movement_date,current_date)) returning id into v_id;
  update public.materials set current_stock=current_stock+case when p_type='in' then p_quantity else -p_quantity end,
    purchase_price=case when p_type='in' and coalesce(p_unit_cost,0)>0 then p_unit_cost else purchase_price end,updated_at=now()
  where id=p_material_id;
  return v_id;
end;$$;

-- --------------------- PENGAJUAN & NOTA ------------------------
create sequence if not exists public.dapur_request_seq start 1;
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),request_no text unique,request_date date not null default current_date,requester text not null,program text,purpose text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','completed')),total_amount numeric(15,2) not null default 0,notes text,
  created_by uuid references auth.users(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create or replace function public.set_request_no() returns trigger language plpgsql set search_path=public as $$
begin if new.request_no is null or btrim(new.request_no)='' then new.request_no:='DJC-'||to_char(coalesce(new.request_date,current_date),'YYYYMM')||'-'||lpad(nextval('public.dapur_request_seq')::text,4,'0'); end if; return new; end;$$;
drop trigger if exists trg_set_request_no on public.purchase_requests;
create trigger trg_set_request_no before insert on public.purchase_requests for each row execute function public.set_request_no();

create table if not exists public.request_items (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.purchase_requests(id) on delete cascade,item_name text not null,qty numeric(15,3) not null default 1,unit text not null default 'pcs',unit_price numeric(15,2) not null default 0,subtotal numeric(15,2) not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.receipts (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.purchase_requests(id) on delete cascade,file_name text not null,file_path text not null,created_by uuid references auth.users(id) default auth.uid(),created_at timestamptz not null default now()
);
create index if not exists receipts_request_idx on public.receipts(request_id);

-- updated_at otomatis
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

do $$ declare t text; begin
  foreach t in array array['members','app_config','master_options','transactions','materials','purchase_requests'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I',t,t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
  end loop;
end $$;

-- --------------------------- RLS -------------------------------
alter table public.roles enable row level security;
alter table public.members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_config enable row level security;
alter table public.master_options enable row level security;
alter table public.transactions enable row level security;
alter table public.materials enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.request_items enable row level security;
alter table public.receipts enable row level security;

-- Hapus policy lama v1 dan policy v2 bila script dijalankan ulang.
do $$ declare t text; p record; begin
  foreach t in array array['roles','members','role_permissions','app_config','master_options','transactions','materials','stock_movements','purchase_requests','request_items','receipts'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $$;

create policy members_select on public.members for select to authenticated using ((select auth.uid())=id or private.has_permission('members.manage'));
create policy members_self_name_update on public.members for update to authenticated using ((select auth.uid())=id and active=true) with check ((select auth.uid())=id and active=true);

create policy roles_select on public.roles for select to authenticated using (private.is_active_member());
create policy role_permissions_select on public.role_permissions for select to authenticated using (private.is_active_member());
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (private.has_permission('settings.manage'));
create policy role_permissions_update on public.role_permissions for update to authenticated using (private.has_permission('settings.manage')) with check (private.has_permission('settings.manage'));
create policy role_permissions_delete on public.role_permissions for delete to authenticated using (private.has_permission('settings.manage'));

create policy app_config_select on public.app_config for select to authenticated using (private.is_active_member());
create policy app_config_update on public.app_config for update to authenticated using (private.has_permission('settings.manage')) with check (private.has_permission('settings.manage'));

create policy master_options_select on public.master_options for select to authenticated using (private.is_active_member());
create policy master_options_insert on public.master_options for insert to authenticated with check (private.has_permission('settings.manage'));
create policy master_options_update on public.master_options for update to authenticated using (private.has_permission('settings.manage')) with check (private.has_permission('settings.manage'));
create policy master_options_delete on public.master_options for delete to authenticated using (private.has_permission('settings.manage'));

create policy transactions_select on public.transactions for select to authenticated using (private.has_permission('finance.view'));
create policy transactions_insert on public.transactions for insert to authenticated with check (private.has_permission('finance.create'));
create policy transactions_update on public.transactions for update to authenticated using (private.has_permission('finance.edit')) with check (private.has_permission('finance.edit'));
create policy transactions_delete on public.transactions for delete to authenticated using (private.has_permission('finance.delete'));

create policy materials_select on public.materials for select to authenticated using (private.has_permission('stock.view'));
create policy materials_insert on public.materials for insert to authenticated with check (private.has_permission('stock.manage'));
create policy materials_update on public.materials for update to authenticated using (private.has_permission('stock.manage')) with check (private.has_permission('stock.manage'));
create policy materials_delete on public.materials for delete to authenticated using (private.has_permission('stock.delete'));
create policy stock_movements_select on public.stock_movements for select to authenticated using (private.has_permission('stock.view'));
create policy stock_movements_insert on public.stock_movements for insert to authenticated with check (private.has_permission('stock.manage'));

create policy purchase_requests_select on public.purchase_requests for select to authenticated using (private.has_permission('requests.view'));
create policy purchase_requests_insert on public.purchase_requests for insert to authenticated with check (private.has_permission('requests.create'));
create policy purchase_requests_update on public.purchase_requests for update to authenticated using (private.has_permission('requests.approve')) with check (private.has_permission('requests.approve'));
create policy purchase_requests_delete on public.purchase_requests for delete to authenticated using (private.has_permission('requests.delete'));
create policy request_items_select on public.request_items for select to authenticated using (private.has_permission('requests.view'));
create policy request_items_insert on public.request_items for insert to authenticated with check (private.has_permission('requests.create'));
create policy request_items_delete on public.request_items for delete to authenticated using (private.has_permission('requests.delete'));
create policy receipts_select on public.receipts for select to authenticated using (private.has_permission('requests.view'));
create policy receipts_insert on public.receipts for insert to authenticated with check (private.has_permission('requests.create'));
create policy receipts_delete on public.receipts for delete to authenticated using (private.has_permission('requests.delete'));

-- -------------------------- GRANTS -----------------------------
revoke all on public.roles,public.members,public.role_permissions,public.app_config,public.master_options,public.transactions,public.materials,public.stock_movements,public.purchase_requests,public.request_items,public.receipts from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.roles to authenticated;
grant select on public.members to authenticated;
grant update(full_name) on public.members to authenticated;
grant select,insert,update,delete on public.role_permissions to authenticated;
grant select,update on public.app_config to authenticated;
grant select,insert,update,delete on public.master_options to authenticated;
grant select,insert,update,delete on public.transactions,public.materials,public.purchase_requests to authenticated;
grant select,insert on public.stock_movements to authenticated;
grant select,insert,delete on public.request_items,public.receipts to authenticated;
grant usage,select on sequence public.dapur_request_seq to authenticated;
revoke all on function public.record_stock_movement(uuid,text,numeric,numeric,text,date) from public,anon;
grant execute on function public.record_stock_movement(uuid,text,numeric,numeric,text,date) to authenticated;

-- -------------------------- STORAGE ----------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'receipts_%' loop
    execute format('drop policy if exists %I on storage.objects',p.policyname);
  end loop;
end $$;
create policy receipts_select_auth on storage.objects for select to authenticated using (bucket_id='receipts' and private.has_permission('requests.view'));
create policy receipts_insert_auth on storage.objects for insert to authenticated with check (bucket_id='receipts' and private.has_permission('requests.create'));
create policy receipts_update_auth on storage.objects for update to authenticated using (bucket_id='receipts' and private.has_permission('requests.create')) with check (bucket_id='receipts' and private.has_permission('requests.create'));
create policy receipts_delete_auth on storage.objects for delete to authenticated using (bucket_id='receipts' and private.has_permission('requests.delete'));

-- ------------------------ SAMPLE BAHAN -------------------------
insert into public.materials(name,category,unit,min_stock,purchase_price)
select * from (values ('Beras','Bahan Pokok','kg',20,0),('Minyak Goreng','Bahan Pokok','liter',10,0),('Bawang Merah','Bumbu','kg',3,0),('Bawang Putih','Bumbu','kg',3,0),('Telur','Protein','butir',60,0)) v(name,category,unit,min_stock,purchase_price)
where not exists(select 1 from public.materials limit 1);
