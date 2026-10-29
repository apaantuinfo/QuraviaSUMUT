# Quravia

Quravia adalah PWA statis berbahasa Indonesia yang berisi:

- 114 surah Al-Qur'an dengan teks Arab, transliterasi, dan terjemahan Indonesia.
- Kumpulan surat pendek Juz Amma (surah 78–114).
- Tasbih digital dengan target 33, 99, dan 100.
- Kompas kiblat yang hanya terbuka setelah lokasi perangkat terverifikasi berada di Sumatera Utara.
- Tombol **Masjid Terdekat** yang muncul setelah arah kiblat berhasil dihitung.
- **Jadwal salat** 5 waktu per kabupaten/kota Sumatera Utara dengan kriteria Kemenag RI, termasuk **Salat Jumat** pada hari Jumat.
- **Adzan otomatis** yang bisa dinyalakan/dimatikan (juga per waktu salat): `assets/audio/adzan-subuh.mp3` untuk Subuh, `assets/audio/adzan-makkah.mp3` untuk Dzuhur, Ashar, Maghrib, dan Isya.
- **Murottal** per ayat dengan tombol putar/jeda di setiap ayat, putar berurutan, dan layar bergulir otomatis mengikuti ayat yang dibacakan.
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
- Fitur memakai geofence lokal Sumatera Utara. Pemeriksaan lokasi dan perhitungan arah kiblat dilakukan di perangkat; koordinat tidak disimpan.
- Sensor kompas hanya aktif saat layar Kiblat terbuka. Pada Android dipakai event `deviceorientationabsolute` (arah utara magnetik); pembacaan disaring per frame agar jarum tidak bergetar.
- Akurasi arah bergantung pada sensor magnetometer perangkat; kalibrasikan ponsel dengan gerakan angka delapan bila arah tidak stabil.

## Masjid terdekat

- Koordinat diambil dari **Geolocation API** bawaan browser (GPS ponsel), gratis dan tanpa API key.
- Menekan tombol langsung membuka panel **Masjid Terdekat** (ada indikator proses, tombol **Cari Ulang**, dan tautan Google Maps bila gagal).
- Data masjid dari **OpenStreetMap** lewat Overpass API (gratis, tanpa key). Beberapa server dicoba bertahap (overpass-api.de, private.coffee, maps.mail.ru, kumi.systems) karena server publik sering sibuk/429. Bila semuanya gagal, dipakai **Nominatim** sebagai cadangan. Radius: 5 km lalu 15 km.
- Hanya saat tombol ditekan, koordinat **dibulatkan ke 3 desimal (±100 m)** lalu dikirim ke Overpass. Jarak tetap dihitung di perangkat dari posisi asli.
- Tombol **Rute** dan **Cari masjid di Google Maps** hanya membuka tautan biasa (tanpa API key). Koordinat baru dikirim ke Google bila tombol itu diketuk.
- Kelengkapan data bergantung pada kontributor OpenStreetMap; di daerah tertentu sebagian masjid/musala bisa belum tercatat.
- Overpass publik punya batas pemakaian wajar. Bila trafik aplikasi tinggi, pertimbangkan menjalankan proxy/cache sendiri.

## Jadwal salat dan adzan

- Waktu salat **dihitung di perangkat** (`js/prayer-times.js`) memakai kriteria Kemenag RI/Bimas Islam: Subuh −20°, Isya −18°, Ashar mazhab Syafi'i, ihtiyath 2 menit, pembulatan ke atas, serta koreksi ketinggian tempat untuk Terbit dan Maghrib. Zona waktu WIB.
- Koordinat dan ketinggian 33 kabupaten/kota ada di `js/cities.js` (nilai perkiraan pusat kota/ibu kota kabupaten).
- Validasi: `node tools/validate-prayer-times.js` membandingkan hasil hitung dengan jadwal yang dipublikasikan Bimas Islam Kemenag (Medan, Karo, Tapanuli Utara, Pakpak Bharat, Labuhanbatu, Jakarta). Hasil saat ini: 100% selisih ≤ 1 menit, 83% persis sama. Untuk jadwal resmi yang mengikat, rujuk https://bimasislam.kemenag.go.id/jadwalshalat.
- **Pembaruan waktu nyata**: layar Salat menampilkan jam WIB yang berjalan, menandai waktu salat yang sedang berlangsung, dan otomatis berganti hari tepat pada pukul 00:00 serta saat aplikasi dibuka kembali dari latar belakang (kembali ke "hari ini").
- **Mengikuti lokasi**: bila izin lokasi sudah diberikan dan Anda belum mengunci kota secara manual, kabupaten/kota terdekat dipilih otomatis setiap aplikasi dibuka (paling cepat sekali per 15 menit). Tidak ada permintaan izin baru saat aplikasi dibuka; ikon target di layar Salat meminta izin sekali dan mengaktifkan mode ikut-lokasi. Memilih kota dari daftar mengunci pilihan manual.
- **Batasan browser**: adzan hanya dapat berbunyi saat Quravia sedang terbuka (halaman/tab aktif atau PWA terbuka). Website tidak bisa membunyikan suara saat ditutup atau saat ponsel terkunci. Opsi **Jaga layar tetap menyala** membantu bila ponsel dibiarkan terbuka (didukung sebagian besar browser modern).
- Browser mewajibkan satu sentuhan pengguna sebelum suara bisa diputar otomatis; mengaktifkan saklar adzan sudah menjadi sentuhan itu.
- Adzan tidak diputar untuk waktu salat yang sudah lewat sebelum aplikasi dibuka.

## Murottal

- Audio per ayat diputar dari EveryAyah.com (Mishary Alafasy, Al-Husary, Al-Minshawi, Abdul Basit), dengan cadangan otomatis ke Islamic Network CDN. Perlu koneksi internet.
- Basmalah di awal surah (selain Al-Fatihah) tidak diputar sebagai audio terpisah.
- Ayat berikutnya dimuat lebih dulu agar perpindahan tanpa jeda. Mode hemat data pada browser dihormati (ayat berikutnya tidak dimuat lebih dulu).

## Keamanan

- `vercel.json` memasang header keamanan: Content-Security-Policy ketat (hanya skrip dari domain sendiri; koneksi keluar dibatasi ke daftar layanan peta/audio di atas), `X-Frame-Options`/`frame-ancestors` (mencegah situs ini disematkan di situs lain), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, dan `Cross-Origin-Resource-Policy` untuk data dan audio.
- Bila menambah layanan eksternal baru, tambahkan domainnya ke `connect-src`/`media-src` di `vercel.json`.
- `.vercelignore` mencegah README, folder `tools`, tangkapan layar, dan `.git` ikut dipublikasikan.
- **Kode web tidak bisa disembunyikan dari "Inspect" / "View source"**: apa pun yang dikirim ke browser pasti bisa dibaca pengguna. Jangan menaruh kunci API atau rahasia di sisi klien. Aplikasi ini tidak memiliki rahasia semacam itu.

## Tema, donasi, dan hak cipta

- **Tema**: tombol matahari/bulan di header. Bawaan adalah mode **terang** (latar putih, aksen hijau dan emas, teks hitam); mode **gelap** berlatar hitam dengan teks putih dan aksen yang sama. Pilihan disimpan di perangkat (`QuraviaTheme`) dan diterapkan oleh `js/theme-init.js` sebelum halaman tampil, sehingga tidak ada kedipan. Warna diatur lewat variabel CSS di bagian atas `styles.css` (`:root` untuk terang, `:root[data-theme="dark"]` untuk gelap).
- **Donasi**: satu tombol hati emas di navbar (header), diletakkan setelah tombol tema dan sebelum tombol pasang aplikasi, tersedia di semua layar dan membuka halaman donasi di tab baru. **Alamat halaman donasi diatur di `js/site-config.js`** (`donationUrl`), tidak perlu mengubah kode lain. Hanya alamat `https://` atau `http://` yang diterima; bila dikosongkan atau tidak valid, tombol disembunyikan otomatis. Nilai bawaan `https://saweria.co/metaforce` perlu diganti bila alamat halaman Anda berbeda.
- **Hak cipta**: footer menampilkan "© tahun-berjalan MetaForce. Hak cipta dilindungi." (tahun mengikuti tanggal perangkat).

## Logo dan ikon

- Logo ada di `assets/icon-512.png` (sumber asli, latar transparan). Dari sana dibuat: `logo-mark-96/144.png` (header, tampil 48 px), `logo-mark-204/306.png` (layar sambutan), `favicon-32/48.png`, `apple-touch-icon.png` (latar putih karena iOS mengisi transparansi dengan hitam), dan `icon-maskable-512.png` (artwork dikecilkan ke zona aman 80% agar tidak terpotong oleh bentuk ikon Android).
- Pada mode terang logo tampil langsung di header; pada mode gelap logo diberi alas putih agar warna hijau tuanya tetap terlihat di latar hitam.
- Bila logo diganti, buat ulang ukuran-ukuran di atas dari berkas sumber, lalu naikkan nomor versi (lihat bagian di bawah) agar ikon pada perangkat yang sudah memasang aplikasi ikut diperbarui.

## Warna tajwid

- Saklar **Tajwid** ada di sisi kanan kartu surah (halaman baca Al-Qur'an maupun Surat Pendek). Saat diaktifkan, muncul panduan warna; ikon ⓘ membuka panduan itu lagi. Pilihan disimpan di perangkat.
- Warna: Ghunnah oranye, Idgham bi-ghunnah ungu, Idgham bila-ghunnah abu-abu, Idgham mithlayn kuning, Iqlab biru, Ikhfa merah, Ikhfa shafawi merah muda, Qalqalah hijau. Nilai warna ada di `styles.css` (`--tj-*`, terang dan gelap) dan di `js/tajweed.js` (dipakai gambar bagikan).
- Mesin aturan (`js/tajweed.js`) membaca penandaan mushaf pada teks itu sendiri: nun/mim tanpa tanda = idgham/ikhfa, sukun = dibaca jelas, mim kecil ۢ = iqlab, tanwin "terbuka" (ٗ ٖ ٞ) = tanwin yang bertemu huruf berikutnya. Huruf sesudahnya menentukan hukum. Akhir ayat dianggap waqaf, sehingga hukum lintas-ayat tidak diterapkan.
- Validasi: `node tools/validate-tajweed.js` memeriksa seluruh 6.236 ayat (teks tidak pernah berubah; setiap nun/mim tanpa tanda mendapat hukum; satu-satunya nun bersukun sebelum huruf idgham/ikhfa hanyalah lima kata pengecualian tradisi: دنيا، بنيان، قنوان، صنوان، ينـَٔون) dan contoh buku pelajaran.
- Cakupan sesuai daftar delapan hukum di atas. Idgham mutajanisain/mutaqaribain dan hukum lain (mad, lam syamsiyah, dll.) tidak diwarnai. Pewarnaan bersifat bantuan belajar; rujuk guru/mushaf tajwid resmi untuk hal yang menentukan.

## Bagikan ayat sebagai gambar

- Tombol bagikan ada di samping tombol simpan pada setiap kartu ayat. Pilih tujuan: **WhatsApp / TikTok = 1080 × 1920**, **Instagram / Facebook = 1080 × 1080**. Latar putih dengan aksen hijau dan emas, watermark logo + "Quravia SUMUT". Teks Latin dan terjemahan dapat dimatikan; warna tajwid ikut tampil bila saklar tajwid aktif.
- Gambar dibuat di perangkat (canvas), berfungsi offline. Tombol **Bagikan** memakai menu berbagi bawaan perangkat (Web Share API); aplikasi tujuan dipilih di menu itu karena website tidak dapat langsung mengirim ke aplikasi tertentu. Bila perangkat tidak mendukung, tersedia **Simpan gambar**.
- Ayat yang sangat panjang (mis. Al-Baqarah 282) diperkecil dan, bila perlu, dipotong dengan tanda "…".

## Memperbarui versi (penting)

Setiap kali Anda mengubah `app.js`, `styles.css`, atau berkas di folder `js/` (termasuk `js/site-config.js`) lalu men-deploy ulang, naikkan nomor versi di **dua tempat** agar pengunjung lama langsung mendapat berkas terbaru:

1. Parameter `?v=` pada tag `<link>`/`<script>` di `index.html` (contoh `?v=1.8.0`).
2. `BUILD` dan `CACHE_VERSION` di baris awal `sw.js`.

Tanpa ini, browser yang pernah membuka versi lama dapat memuat campuran berkas lama dan baru sehingga tombol tidak merespons.

## Sumber data

Teks Utsmani, transliterasi, dan terjemahan Indonesia berasal dari paket `quran-json` 3.1.2 oleh Risan Bagja Pradana, berlisensi CC BY 4.0. Jangan mengubah teks Arab tanpa proses verifikasi ilmiah.

Data batas geofence disederhanakan dari batas provinsi Sumatera Utara yang bersumber dari peta administrasi Indonesia. Geofence ditujukan untuk pembatasan fitur aplikasi, bukan penetapan batas hukum.
#   Q u r a v i a S U M U T  
 #   Q u r a v i a S U M U T  
 