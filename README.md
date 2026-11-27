# Dashboard Dapur Jalan Cahaya v2

Dashboard operasional dapur berbasis **React/Vite + Supabase + Vercel**. Versi ini sudah dibuat self-service: Admin dapat mengelola member, role/hak akses, data master, serta identitas dashboard langsung dari aplikasi tanpa mengubah source code.

## Modul

1. **Ringkasan** — saldo bulan berjalan, pemasukan, pengeluaran, stok minimum, pengajuan pending, grafik arus kas.
2. **Catatan Keuangan** — pemasukan/pengeluaran, kategori, merchant, program, metode pembayaran, edit/hapus sesuai permission, print dan CSV.
3. **Stok Bahan** — master bahan, stok minimum, stok masuk/keluar, histori mutasi, harga beli acuan.
4. **Pengajuan & Nota** — nomor slip otomatis, impor slip PDF, DOCX, TXT, dan gambar, rincian barang, approval, print slip, upload nota private, serta pencatatan pencairan ke keuangan saat pengajuan ditandai selesai.
5. **Member & Akses** — buat akun member dengan password awal, ubah role, aktif/nonaktifkan member.
6. **Pengaturan** — identitas dashboard, kategori/program/merchant/metode pembayaran/kategori bahan/satuan, matriks hak akses role.
7. **Akun Saya** — ubah nama tampilan dan atur/ganti password.

## Role bawaan

- **Admin**: akses penuh. Permission Admin dikunci penuh di UI untuk mencegah lockout.
- **Manager**: seluruh operasional dan approval, tanpa pengaturan/member secara default.
- **Keuangan**: kelola keuangan dan melihat/membuat pengajuan.
- **Stok / Dapur**: kelola stok dan melihat/membuat pengajuan.
- **Viewer**: baca ringkasan, keuangan, stok, dan pengajuan.

Admin dapat mengubah permission role non-Admin dari menu **Pengaturan > Hak akses per role**.

## A. Deploy / Upgrade Supabase

1. Buat project Supabase khusus Dashboard Dapur Jalan Cahaya.
2. Jika project baru: **Authentication > Users > Add user** dan buat akun utama Anda terlebih dahulu. Jika SQL dijalankan sebelum user dibuat, user pertama yang dibuat sesudahnya otomatis menjadi Admin.
3. Buka **SQL Editor > New query**.
4. Salin seluruh isi `DEPLOY_SUPABASE.sql`, lalu **Run**.
5. Script bersifat upgrade-friendly: tabel operasional lama dipertahankan, policy v1 diganti dengan role-based access.
6. Cek tabel `members`: user pertama/tertua akan menjadi **Admin**. User lain yang sudah ada akan menjadi **Viewer** dan dapat diubah dari dashboard.

> Bucket `receipts` dibuat private. Hak akses file mengikuti permission Pengajuan.

## B. Environment Variables Vercel

Tambahkan di **Vercel > Project > Settings > Environment Variables**:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxx
```

- `VITE_SUPABASE_PUBLISHABLE_KEY` aman untuk frontend.
- `SUPABASE_SECRET_KEY` **server-only** dan digunakan fungsi `/api/members` untuk membuat dan memperbarui akun member. Jangan pernah beri prefix `VITE_` pada secret key.
- Jika project Supabase lama belum menyediakan `sb_publishable_` / `sb_secret_`, frontend masih menerima `VITE_SUPABASE_ANON_KEY` dan server dapat memakai `SUPABASE_SERVICE_ROLE_KEY` sebagai fallback. Jangan menaruh service role di variable `VITE_*`.

## C. Deploy ke Vercel

1. Ekstrak ZIP.
2. Upload/import folder `dapur-jalan-cahaya` ke project Vercel pada akun yang Anda inginkan.
3. Framework terdeteksi sebagai **Vite**. Build command: `npm run build`, output: `dist`.
4. Isi environment variables pada bagian B.
5. Deploy / Redeploy.

## D. Cara Menambah Member

1. Login sebagai Admin.
2. Buka **Member & Akses**.
3. Klik **Tambah member**.
4. Isi nama, email, password awal, dan role. Pilihan awal adalah Viewer.
5. Member masuk memakai email dan password awal, lalu mengganti password dari **Akun Saya**.
6. Admin dapat mengubah role atau menonaktifkan member kapan saja.

## E. Data yang Bisa Diedit Mandiri

Dari menu **Pengaturan**, Admin dapat mengelola:

- Nama aplikasi, subjudul, inisial logo.
- Kategori pengeluaran & pemasukan.
- Program.
- Merchant / pemasok.
- Metode pembayaran.
- Kategori bahan.
- Satuan bahan/barang.
- Hak akses tiap role non-Admin.

Perubahan data master otomatis dipakai pada form Keuangan, Stok, dan Pengajuan. Impor slip membaca dokumen di browser. Jika tanggal, pemohon, tujuan, dan nominal terbaca, slip masuk ke rekap pengajuan dengan status Menunggu. Slip yang belum lengkap dibuka untuk diperiksa. Pencairan tetap dicatat setelah pengajuan selesai.

## Keamanan

- Semua tabel pada schema `public` memakai Row Level Security (RLS).
- Permission dicek kembali di database, jadi menyembunyikan tombol di UI bukan satu-satunya lapisan keamanan.
- Role/permission disimpan di database, bukan `user_metadata` yang dapat diedit user.
- Secret key Supabase hanya dipakai oleh Vercel Serverless Function `/api/members`.
- Sistem mencegah Admin menonaktifkan dirinya sendiri dan mencegah penghapusan/demotion Admin aktif terakhir melalui endpoint member.

## Struktur penting

```text
api/members.js             # pembuatan akun & administrasi member server-side
src/pages/Members.jsx      # UI member
src/pages/Settings.jsx     # data master + permission
src/pages/Account.jsx      # profil & password
supabase/schema.sql        # schema lengkap v2
DEPLOY_SUPABASE.sql        # salinan SQL siap paste
.env.example               # daftar env Vercel
vercel.json                # SPA + serverless API routing
```

Jalankan `npm ci`, `node --test`, dan `npm run build` untuk memeriksa build dan tes regresi.
