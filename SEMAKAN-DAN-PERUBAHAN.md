# Laporan Semakan dan Pembaikan — YP AGROTECH BIOFLOK BOS

## Fail asas

Pembaikan dibuat pada projek dalam ZIP yang dibekalkan. `original-app-reference.html` dikekalkan sebagai rujukan asal dan tidak dipadam.

## Perubahan yang dibuat

1. Menggantikan penyimpanan satu dokumen `appData/main` sebagai storan aktif kepada koleksi Firestore berasingan: `ponds`, `operations`, dan `inventory`.
2. Mengekalkan bacaan `appData/main` untuk migrasi data lama oleh Admin sahaja.
3. Menambah rekod `createdBy` untuk operasi baharu yang disegerakkan.
4. Menghadkan perubahan status operasi sedia ada kepada tindakan kelulusan/penolakan Admin atau Penyelia.
5. Mengukuhkan Firestore Security Rules mengikut peranan untuk kolam, inventori, operasi dan profil pengguna.
6. Menambah penyegerakan perubahan berdasarkan perbezaan data (bukan menulis semula semua koleksi bagi setiap tindakan).
7. Menambah pemadaman rekod awan yang tiada dalam sandaran semasa untuk aliran import Admin.
8. Mengubah mesej penyegerakan supaya kegagalan awan memaparkan amaran bahawa data hanya berada pada peranti.
9. Membetulkan pengendalian modal supaya borang tidak tertutup apabila validasi memulangkan `false`.
10. Menjadikan ID kolam tidak boleh diubah ketika kemas kini bagi mengelakkan perbezaan ID dokumen dan ID rekod.
11. Menambah metadata UID dan masa bagi kelulusan/penolakan.
12. Menghadkan import JSON kepada Admin dan memperketatkan semakan struktur, status, nilai angka serta ID pendua.
13. Menambah `firebase.json` untuk memudahkan penerbitan Firestore Rules melalui Firebase CLI.
14. Mengemaskini README untuk setup, peranan, migrasi, Vercel dan senarai ujian produksi.

## Fungsi asal yang dikekalkan

- Dashboard.
- 35 kolam: 32 aktif dan 3 kuarantin (A1, B1, C1).
- Rekod operasi harian.
- Pengurusan inventori.
- Semakan dan kelulusan.
- Laporan PDF dan cetakan.
- Eksport CSV.
- Eksport/import sandaran JSON.
- Reka bentuk responsif.

## Pemeriksaan yang berjaya dibuat dalam sesi ini

- `node --check src/main.js` — lulus.
- `node --check src/firebase.js` — lulus.
- Semakan rujukan ID DOM dalam `src/main.js` berbanding `index.html` — tiada ID yang dirujuk tetapi tiada dalam HTML.

## Belum dapat disahkan

- `npm install` tidak selesai dalam had masa persekitaran; percubaan mod offline pula gagal kerana pakej tiada dalam cache.
- Oleh itu `npm run build` belum dapat dijalankan.
- Firebase Authentication, Firestore Rules, migrasi pada projek sebenar, penyegerakan dua peranti, domain Vercel, PDF sebenar dan ujian peranan belum diuji terhadap projek Firebase/Vercel pemilik.
- Firestore Rules perlu diuji menggunakan Firebase Emulator atau projek ujian sebelum data operasi sebenar digunakan.

**Kesimpulan:** Ini ialah pakej sumber yang telah dibaiki berdasarkan pemeriksaan statik, bukan pengesahan bahawa sistem sudah lulus produksi. Rujuk `README-MS.md` untuk langkah setup dan ujian yang masih perlu dibuat.
