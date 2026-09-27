# Upgrade dari Dashboard v1 ke v2

Jika Dashboard Dapur Jalan Cahaya versi sebelumnya sudah terpasang:

1. Backup database Supabase bila diperlukan.
2. Jalankan seluruh `DEPLOY_SUPABASE.sql` terbaru di SQL Editor. Data transaksi, stok, pengajuan, item dan nota lama tidak dihapus.
3. Script akan mengganti policy akses lama (`authenticated_all`) dengan role/permission v2.
4. User Supabase yang paling lama otomatis dijadikan Admin jika tabel member belum pernah dibuat; user lain menjadi Viewer.
5. Redeploy seluruh folder aplikasi ke Vercel.
6. Tambahkan tiga env server/client baru bila belum ada: `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, dan `APP_URL` (lihat README).
7. Atur Site URL / Redirect URL Supabase ke domain Vercel untuk invitation member.
8. Login sebagai Admin, buka **Pengaturan** untuk menyesuaikan data master dan hak akses.
9. Buka **Member & Akses** untuk mengecek role semua user lama.

Tidak perlu menghapus tabel v1 atau menginput ulang transaksi lama.
