# Upgrade dari Dashboard v1 ke v2

Jika Dashboard Dapur Jalan Cahaya versi sebelumnya sudah terpasang:

1. Backup database Supabase bila diperlukan.
2. Jalankan seluruh `DEPLOY_SUPABASE.sql` terbaru di SQL Editor. Data transaksi, stok, pengajuan, item dan nota lama tidak dihapus.
3. Script akan mengganti policy akses lama (`authenticated_all`) dengan role/permission v2.
4. User Supabase yang paling lama otomatis dijadikan Admin jika tabel member belum pernah dibuat; user lain menjadi Viewer.
5. Redeploy seluruh folder aplikasi ke Vercel.
6. Tambahkan `VITE_SUPABASE_PUBLISHABLE_KEY` dan `SUPABASE_SECRET_KEY` bila belum ada (lihat README).
7. Login sebagai Admin, buka **Pengaturan** untuk menyesuaikan data master dan hak akses.
8. Buka **Member & Akses** untuk mengecek role semua user lama.

Tidak perlu menghapus tabel v1 atau menginput ulang transaksi lama.
