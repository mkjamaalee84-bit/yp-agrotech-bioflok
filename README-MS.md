# YP AGROTECH | BIOFLOK BOS

Aplikasi web pengurusan operasi akuakultur. Antara muka asal dikekalkan dan lapisan simpanan awan menggunakan Firebase Authentication + Cloud Firestore. Aplikasi dibina dengan HTML, CSS, JavaScript ES Modules dan Vite.

## Fungsi yang dikekalkan

- Dashboard operasi dan ringkasan mengikut Bahagian A–G.
- 35 kolam: 32 kolam operasi dan 3 kolam kuarantin (A1, B1, C1).
- Rekod operasi harian: makanan, ujian kualiti air, mortaliti, penyelenggaraan, rawatan dan lain-lain.
- Pengurusan inventori dan paras stok minimum.
- Semakan serta kelulusan/penolakan rekod.
- Laporan PDF, cetakan, eksport CSV dan sandaran/pemulihan JSON.
- Reka bentuk responsif untuk komputer dan telefon.

## Struktur data Firestore

Versi ini tidak lagi menggunakan satu dokumen `appData/main` untuk semua data. Data aktif disimpan dalam koleksi:

- `users/{uid}` — profil dan peranan pengguna.
- `ponds/{pondId}` — satu dokumen bagi setiap kolam.
- `operations/{operationId}` — satu dokumen bagi setiap rekod operasi.
- `inventory/{itemId}` — satu dokumen bagi setiap item inventori.

`appData/main` hanya dibaca sebagai sumber migrasi lama oleh Admin. Aplikasi tidak menulis semula dokumen legacy.

## 1. Sediakan Firebase

1. Buka Firebase Console dan pilih projek yang hendak digunakan.
2. Aktifkan **Authentication → Sign-in method → Email/Password**.
3. Daftarkan akaun pengguna di **Authentication → Users**.
4. Cipta **Cloud Firestore**.
5. Untuk setiap akaun, cipta dokumen `users/{UID}`. Contoh medan:
   - `name`: `Admin YP` (string)
   - `role`: `Admin` (string)
6. Nilai `role` yang diterima: `Admin`, `Penyelia`, `Operator`.
7. Terbitkan rules daripada fail `firestore.rules` menggunakan Firebase Console atau Firebase CLI.

**Penting:** Jangan beri pengguna biasa hak untuk mengubah dokumen profil `users`. Pengurusan akaun/peranan dibuat oleh pentadbir melalui Firebase Console atau proses pentadbiran yang dipercayai.

## 2. Peranan dan akses

| Fungsi | Admin | Penyelia | Operator |
|---|---:|---:|---:|
| Baca data operasi | Ya | Ya | Ya |
| Tambah/ubah kolam | Ya | Tidak | Tidak |
| Tambah/ubah inventori | Ya | Ya | Tidak |
| Hantar rekod operasi | Ya | Ya | Ya |
| Lulus/tolak rekod | Ya | Ya | Tidak |
| Import/pulih sandaran penuh | Ya | Tidak | Tidak |

Kawalan ini dilaksanakan pada antaramuka dan Firestore Security Rules. Operator hanya boleh mencipta rekod operasi dengan `createdBy` UID sendiri dan status `Menunggu`. Perubahan status rekod sedia ada hanya dibenarkan kepada Admin/Penyelia melalui medan audit kelulusan.

## 3. Jalankan secara tempatan

Keperluan: Node.js 20.19 atau lebih baharu.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Masukkan konfigurasi Firebase Web App dalam `.env.local`. Nilai `VITE_*` ialah konfigurasi klien; jangan letakkan service-account key, private key atau rahsia backend dalam aplikasi frontend.

## 4. Deploy ke Vercel

- Import repository projek ke Vercel.
- Framework Preset: **Vite**.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Tambah semua pembolehubah `VITE_FIREBASE_*` daripada `.env.example` di Vercel Environment Variables.
- Tambah domain Vercel ke **Firebase Authentication → Settings → Authorized domains**.
- Deploy semula selepas perubahan environment variables.

## 5. Migrasi data versi terdahulu

Apabila Admin log masuk, aplikasi akan:
1. Membaca koleksi baharu `ponds`, `operations` dan `inventory`.
2. Jika koleksi baharu masih kosong, cuba membaca dokumen lama `appData/main`.
3. Jika dokumen legacy wujud dan strukturnya sah, Admin akan memindahkan rekod ke koleksi baharu.
4. Jika tiada data awan, Admin akan memulakan koleksi menggunakan data tempatan/default yang tersedia pada pelayar tersebut.

Sebelum migrasi, eksport JSON daripada aplikasi lama dan simpan salinan sandaran. Jangan padam dokumen lama sehingga data baharu disemak.

## 6. Nota operasi dan had

- `localStorage` masih digunakan sebagai cache/sandaran setempat. Sumber data awan selepas log masuk ialah Firestore.
- Jika penyegerakan gagal, aplikasi memaparkan amaran bahawa perubahan hanya disimpan pada peranti. Semak Rules, rangkaian dan log Firebase sebelum meneruskan operasi.
- Pengimportan JSON menggantikan set data semasa. Akses dihadkan kepada Admin; buat eksport sandaran dahulu.
- Kelulusan direkodkan bersama UID dan masa tindakan. Untuk jejak audit yang memerlukan masa dipercayai pelayan, gunakan Cloud Functions/Cloud Run dan `serverTimestamp()`.
- PDF dijana di pelayar menggunakan `html2pdf.js`. Cetakan sistem menggunakan fungsi cetak pelayar.
- Firebase Rules tidak diuji melalui Firebase Emulator dalam persekitaran penyediaan fail ini. Uji semua tiga peranan menggunakan akaun berasingan sebelum data operasi sebenar digunakan.

## 7. Senarai ujian sebelum produksi

- [ ] `npm install` berjaya.
- [ ] `npm run build` berjaya.
- [ ] Admin boleh login dan mengurus kolam.
- [ ] Penyelia boleh mengurus inventori dan meluluskan/menolak rekod.
- [ ] Operator hanya boleh menghantar rekod baharu dan tidak boleh meluluskan.
- [ ] Uji sekatan terus melalui Firestore Rules / Firebase Emulator.
- [ ] Uji penyegerakan dua peranti/pelayar.
- [ ] Uji PDF, cetak, CSV, eksport dan import JSON.
- [ ] Uji telefon, tablet dan komputer.
- [ ] Uji domain Vercel dan Authorized Domains Firebase.

**Status pengesahan pakej:** semakan sintaks JavaScript telah dibuat. Pemasangan pakej dan build Vite belum dapat disahkan dalam sesi penyediaan ini kerana `npm install` tidak selesai sebelum had masa persekitaran. Jangan anggap aplikasi sudah lulus ujian produksi sehingga senarai semak di atas dilaksanakan.
