# Quran Sumut

Quran Sumut adalah PWA statis berbahasa Indonesia yang berisi:

- 114 surah Al-Qur'an dengan teks Arab, transliterasi, dan terjemahan Indonesia.
- Kumpulan surat pendek Juz Amma (surah 78–114).
- Tasbih digital dengan target 33, 99, dan 100.
- Kompas kiblat yang hanya terbuka setelah lokasi perangkat terverifikasi berada di Sumatera Utara.
- Dukungan pemasangan ke layar utama dan pembacaan offline.

## Publikasi ke GitHub Pages

1. Buat repository GitHub baru.
2. Unggah seluruh isi folder ini ke bagian paling atas repository, bukan folder pembungkusnya.
3. Buka **Settings → Pages**.
4. Pada **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch `main`, folder `/ (root)`, lalu **Save**.
6. Setelah alamat HTTPS aktif, buka di ponsel dan pilih **Tambahkan ke Layar Utama / Instal aplikasi**.

Semua alamat aset memakai jalur relatif sehingga aplikasi tetap berjalan bila GitHub Pages menaruhnya di subfolder nama repository.

## Publikasi ke Vercel

1. Impor repository yang berisi folder ini ke Vercel, atau unggah project statis ini.
2. Pilih **Framework Preset: Other**.
3. Kosongkan Build Command dan gunakan folder root sebagai Output Directory.
4. Tekan **Deploy**.

## Catatan kompas kiblat

- Lokasi dan sensor orientasi hanya tersedia pada HTTPS, sehingga jangan menguji fitur kompas dengan membuka `index.html` langsung dari File Explorer.
- Pengguna harus memberi izin lokasi. Pada iPhone, izin **Motion & Orientation Access** juga diperlukan.
- Fitur memakai geofence lokal Sumatera Utara. Koordinat tidak dikirim atau disimpan ke server.
- Akurasi arah bergantung pada sensor magnetometer perangkat; kalibrasikan ponsel dengan gerakan angka delapan bila arah tidak stabil.

## Sumber data

Teks Utsmani, transliterasi, dan terjemahan Indonesia berasal dari paket `quran-json` 3.1.2 oleh Risan Bagja Pradana, berlisensi CC BY 4.0. Jangan mengubah teks Arab tanpa proses verifikasi ilmiah.

Data batas geofence disederhanakan dari batas provinsi Sumatera Utara yang bersumber dari peta administrasi Indonesia. Geofence ditujukan untuk pembatasan fitur aplikasi, bukan penetapan batas hukum.
