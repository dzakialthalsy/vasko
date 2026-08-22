# VASKO, Ringkasan untuk Sesi Baru

Dibuat 22 Agustus 2026. **Baca berkas ini di awal sesi**, bersama `CLAUDE.md`.

> Jangan percaya status di sini tanpa memeriksa kodenya. Jalankan
> `npm run build` dan skrip uji di bawah untuk tahu keadaan sebenarnya.

---

## 1. Apa ini

Aplikasi web pendukung proposal Pertamina Camp 2026, Tim POKBAI, Proyek 3.
Proposalnya sendiri ada di direktori induk, lihat
`../RINGKASAN-SESI-2-UNTUK-LANJUTAN.md` dan `../CLAUDE.md`.

Nama aplikasi **VASKO**. Sebelumnya SIMPAK, dan **empat wireframe lama masih
bertuliskan SIMPAK**: Dashboard, Kepatuhan TKDN, Profil Vendor, Riwayat
Notifikasi. Nama aplikasi tidak pernah muncul di teks docx, hanya di gambar.

Tiga modul yang direncanakan proposal: **D10** manajemen kontrak, **D7**
pemantauan TKDN, **D11** performa vendor. Baru D10 yang dikerjakan.

---

## 2. Keadaan per 22 Agustus 2026

| Halaman | Keadaan |
|---|---|
| `/` Dashboard | Kartu pengantar tiga modul saja, belum ada isi sungguhan |
| `/kontrak` Daftar kontrak | Jadi, lengkap dengan lencana status |
| `/kontrak/[nomor]` Detail | Jadi, lima tab berfungsi |
| `/kontrak/unggah` Verifikasi Ekstraksi | Jadi, alur penuh sampai tersimpan |
| `/tkdn`, `/vendor`, `/notifikasi`, `/pengaturan` | **Belum ada, tautan sidebar mati** |

Build bersih, tanpa galat tipe maupun peringatan.

---

## 3. Keputusan penting beserta alasannya

Bagian paling berharga, karena alasannya tidak terlihat dari kode akhir.

**Model hanya menyentuh satu langkah.** Alur ekstraksi ada empat langkah:
baca kata beserta kotak batasnya, kirim teks ke model, cocokkan nilai kembali
ke daftar kata, tandai medan wajib konfirmasi. **Hanya langkah kedua** yang
memakai model bahasa. Koordinat sorotan dan angka keyakinan tidak pernah
berasal dari model.

**Model bahasa tidak mengembalikan koordinat.** Ini kesalahpahaman umum.
Koordinat dihitung sendiri dengan mencocokkan nilai balik ke daftar kata PDF.

**Angka keyakinan dihitung dari kualitas kecocokan**, bukan ditanyakan ke
model. Model tidak menghasilkan angka keyakinan yang tepercaya bila diminta
menilai dirinya sendiri.

**Perhitungan denda deterministik, tanpa model.** Denda menyentuh pembayaran
vendor dan berkonsekuensi hukum. Ini sejalan dengan keputusan 7.A di proposal.
**Jangan pernah mengembalikan ini ke model.**

**Mutu rincian termin dijaga aritmetika, bukan konfirmasi manual.** Jumlah
seluruh termin wajib sama dengan nilai kontrak. Satu pemeriksaan itu menangkap
angka salah baca, baris terlewat, dan baris ganda sekaligus, dan tidak bisa
dilewati dengan mengeklik tanpa membaca.

**Perapian deterministik mengalahkan prompt.** Model setia pada teks dokumen,
jadi mengembalikan "minimal 42%" ketika dokumen menulis begitu. Larangan tegas
di prompt terbukti **tidak dipatuhi**. Solusinya `rapikan` per medan di
`src/lib/ekstraksi/medan.ts`, tujuh buah. Setelah itu akurasi naik dari 6 sampai
9 dari 10 menjadi **10/10 lima kali berturut-turut**.

**Nilai mentah untuk mencocokkan, nilai rapi untuk menyimpan.** Dokumen menulis
"5 (lima) termin" sedangkan bentuk bakunya "5 termin". Mencocokkan bentuk baku
ke halaman akan meleset dan sorotannya hilang.

**Berkas PDF disimpan di luar `public`.** Di `data/kontrak/`, dilayani lewat
`/api/kontrak/[nomor]/berkas` yang membentuk ulang nama berkas dari basis data,
bukan dari parameter URL.

**Riwayat ekstraksi ditambahkan, bukan ditimpa.** Unggah ulang meninggalkan
jejak keduanya, untuk audit SPI dan BPK.

**Mode tiruan menandai dirinya sendiri.** Dipakai bila API tidak dapat
dihubungi. Hanya mengenali susunan kalimat dokumen contoh pertama, dan memang
harus terlihat terbatas.

---

## 4. Jebakan yang sudah pernah memakan waktu

Jangan mengulanginya.

- **Penyuntingan berkas lewat skrip Python menyisipkan karakter backspace
  0x08** ke dalam regex, bukan `\b`. Akibatnya pola tidak pernah cocok.
  Penyebabnya `"\b"` di untai Python biasa. Pakai untai mentah, dan **selalu
  `f.flush()` lalu `os.fsync()`** sebelum membaca ulang, karena tulisan tanpa
  itu tidak tersimpan dan pemeriksaan berikutnya menipu.
- **`\n` di untai Python** menjadi baris baru sungguhan di dalam regex
  JavaScript, membuatnya tidak terkompilasi.
- **Git Bash mengubah argumen berawalan garis miring** menjadi jalur Windows.
  Pakai `MSYS_NO_PATHCONV=1`.
- **Turbopack menulis ulang `import.meta.url`** di bundel server menjadi jalur
  maya `[project]`. Untuk pdfjs dipakai `serverExternalPackages` plus penelusuran
  dari `process.cwd()`.
- **pdf.js menuntut dua bentuk jalur berbeda**: `workerSrc` harus URL `file://`,
  `standardFontDataUrl` harus jalur biasa berakhiran garis miring.
- **Menggabungkan potongan teks pdf.js tanpa spasi** melekatkan kata di
  pergantian baris, misalnya "denganmemenuhi". Teks halaman dirakit dari daftar
  kata.
- **Nilai pendek tercocokkan ke dalam untai lain.** "42%" sempat jatuh ke
  "KTR/2026/0142". Sekarang seluruh kemunculan ditelusuri dan yang jatuh tepat
  di batas kata dimenangkan.
- **Tombol bersarang di dalam tombol** pada baris medan, ARIA tidak sah.
- **Prisma 7 membuang `url` dari blok datasource.** Pindah ke `prisma.config.ts`
  dan driver adapter `@prisma/adapter-pg`.
- **Uji yang terlalu longgar menipu.** `includes` dua arah membuat "minimal 42%"
  dihitung benar. Uji sekarang membedakan TEPAT, DEKAT, dan SALAH.
- **Mematok nomor halaman di uji interaksi rapuh**, karena halaman tempat frasa
  ditemukan bergantung kalimat mana yang dipilih model.

---

## 5. Verifikasi rupa wajib dengan mata

Pernah terjadi: struktur DOM diperiksa lalu dinyatakan selesai, padahal
rupanya jauh berbeda dari rancangan. **Selalu potret dan bandingkan** sebelum
melapor selesai.

```bash
MSYS_NO_PATHCONV=1 npx tsx scripts/potret.ts "/kontrak/KTR-2026-0142" hasil
```

Lebarnya 1300 piksel, sama dengan berkas PNG rancangan, dan menunggu font web
selesai dimuat. Argumen keempat berupa angka menggulir halaman lalu memotret
seukuran viewport, berguna memeriksa elemen berposisi tetap.

Rancangan asli ada di direktori induk: `Detail Kontrak (1).png` dan
`Unggah Kontrak dan Verifikasi Hasil Ekstraksi AI (1).png`.

**Tiga penyimpangan dari rancangan yang disengaja dan sudah disetujui:** sisa
hari dihitung langsung bukan angka tetap, tanggal Diperbarui diturunkan dari
tonggak progres terakhir, dan rupiah ditulis tanpa spasi setelah "Rp".

---

## 6. Palet dan tipografi

Diambil dari piksel wireframe, bukan dikira-kira. Ada di `globals.css`.

| Peran | Warna |
|---|---|
| Navy, sidebar dan judul | `#001F3F` |
| Teal, dihitung sistem | `#006A6A` |
| Ungu, dinilai manusia | `#46265B` |
| Amber, keluaran AI menunggu konfirmasi | `#F0B429`, latar `#FEF8EA` |
| Merah, kritis | `#BA1A1A` |
| Kanvas | `#F4FBFA` |
| Garis | `#E8EFEE` |

Lebar sidebar 224px, disimpan sebagai `--sidebar-w`. Font Plus Jakarta Sans,
mono JetBrains Mono.

---

## 7. Penyedia model

Ditukar lewat `EKSTRAKSI_PENYEDIA` di `.env.local`, tanpa menyentuh kode.

**OpenRouter**, gratis, **hanya untuk dokumen sintetis**. Endpoint gratis
gratis karena penyedia di baliknya umumnya boleh memakai data yang dikirim.
Batas 20 permintaan per menit dan **50 per hari**. Dari 422 model, 19 gratis,
hanya 6 mendukung structured outputs.

Model paling konsisten: `nvidia/nemotron-3-super-120b-a12b:free`.
`dots-studio/dots-3-note-preview:free` **erratik**, tiga percobaan menghasilkan
6/10, 9/10, 7/10 pada dokumen yang sama walau suhu nol.

**Anthropic**, berbayar, untuk dokumen sungguhan dan demonstrasi. Sekali
ekstraksi kira-kira Rp127 dengan Haiku 4.5, Rp254 Sonnet 5, Rp635 Opus 5.
Hitung ulang dengan `scripts/hitung-biaya.ts`.

Docx masih menulis **GPT-4o** di Tabel 3.2 dan fitur 2.A. Sudah tidak benar.
Saran: tulis generik "integrasi API LLM".

---

## 8. Skrip

Seluruhnya di `scripts/`. Yang menyentuh basis data atau API butuh
`--env-file=.env.local`.

| Skrip | Kegunaan |
|---|---|
| `uji-denda.ts` | 12 kasus Formula 3.1, angka harapan dihitung tangan |
| `uji-urai.ts` | 24 kasus pengurai rupiah, persen, cacah, tanggal |
| `uji-pdf.ts` | Pembacaan kata dan pencocokan koordinat |
| `uji-ekstraksi.ts [mudah\|sulit]` | Akurasi per medan plus termin, **memakai kuota API** |
| `uji-interaksi.ts` | Klik medan, tombol Konfirmasi, Simpan menyala |
| `uji-simpan.ts` | Alur penuh unggah sampai muncul di daftar |
| `uji-status.ts` | Draf versus Berjalan terlihat berbeda |
| `potret.ts` | Potret untuk dibandingkan dengan rancangan |
| `seed.ts` | Mengisi KTR/2026/0142 beserta termin, progres, amendemen |
| `bersihkan-uji.ts` | Menghapus sisa data uji |
| `lihat-kontrak.ts` | Menampilkan isi satu kontrak dari basis data |
| `cek-basis-data.ts` | Memastikan kedelapan tabel ada |
| `coba-model-openrouter.ts` | Menguji model gratis mana yang sedang hidup |
| `model-openrouter.ts` | Daftar model gratis berskema |
| `hitung-biaya.ts` | Perkiraan biaya per model |
| `generate_sample_contract.py` | Kontrak mudah, 24 halaman |
| `generate_contract_sulit.py` | Kontrak sulit, 60 halaman, enam jebakan |

---

## 9. Dua dokumen uji

**KTR/2026/0142**, 24 halaman, lurus. Rp4.850.000.000, TKDN 42%, denda 1/1000,
batas 5%, 3 termin, 15 Maret sampai 12 September 2026.

**KTR/2026/0163**, 60 halaman, **sengaja menjebak**. Rp12.400.000.000, TKDN 38%,
batas denda 10%, 5 termin, 20 April sampai 5 Oktober 2026. Jebakannya: enam
persentase bersaing, nilai lama Rp11.800.000.000 pada amendemen, sembilan
tanggal termasuk akhir masa pemeliharaan 3 April 2027, angka dieja dalam
kurung, dan dua nomor kontrak mirip.

Jebakan tanggal **pernah memakan model** dua kali, menghasilkan 3 April 2027
untuk Tanggal Berakhir. Petunjuk medannya sudah dipertajam, tetapi model gratis
tetap bisa meleset.

Kunci jawaban ada di `public/contoh/*.kunci.json`, berbentuk
`{ medan: {...}, termin: [...] }`.

---

## 10. Yang belum dikerjakan

1. **Ekstraksi tidak mengambil progres dan amendemen.** Keduanya data
   pelaksanaan yang lahir setelah kontrak berjalan, butuh antarmuka input
   tersendiri. Halaman detail sudah menampilkan keadaan kosong yang menjelaskan
   ini.
2. **Gerbang konfirmasi belum menuntut medan dilihat dulu.** Pengguna bisa
   mengeklik Konfirmasi tanpa membaca, dan itu sudah terbukti meloloskan tanggal
   yang salah.
3. **Status belum memengaruhi apa pun di luar tampilan.** Draf masih akan ikut
   terhitung bila nanti ada penghitung kontrak aktif.
4. **Belum ada autentikasi dan kendali akses berbasis peran**, padahal Tabel 3.2
   menyebutnya. Nama "Rina Marlina" masih tertulis tetap.
5. **Belum ada fitur hapus kontrak.** Sengaja, atas permintaan user, yang lebih
   suka menghapus manual lewat Prisma Studio atau konsol Neon.
6. **Modul D7 dan D11 belum disentuh sama sekali.**
7. **Empat wireframe masih bertuliskan SIMPAK.**

---

## 11. Menyiapkan lingkungan

```bash
cp .env.example .env.local     # lalu isi sendiri, jangan tempel ke percakapan
npx prisma generate
npx prisma migrate dev
npx tsx --env-file=.env.local scripts/seed.ts
npm run dev
```

`.env.local` butuh `DATABASE_URL` (Neon, pakai `sslmode=verify-full`),
`EKSTRAKSI_PENYEDIA`, dan kunci penyedia yang dipilih.

Basis data: Neon PostgreSQL, wilayah ap-southeast-1. Delapan tabel: vendor,
kontrak, ekstraksi, medan_ekstraksi, sorotan, termin, amendemen, progres.
Menghapus satu kontrak ikut menghapus turunannya lewat cascade, kecuali vendor.

---

## 12. Cara kerja dengan user

- **Verifikasi dengan assert dan dengan mata, bukan dengan keyakinan.** User
  menghargai kesalahan yang ditemukan sendiri lalu dilaporkan terbuka.
- **Beri rekomendasi tegas**, bukan daftar pilihan.
- **Jujur soal batasan.** Jangan menyajikan tebakan sebagai fakta.
- **Jangan pernah meminta user menempelkan kunci API atau alamat basis data**
  ke percakapan. Arahkan mengisi `.env.local` sendiri.
- **Tanpa tanda pisah panjang** dalam teks apa pun untuk user. Ini permintaan
  eksplisit, bukan preferensi gaya.
- User mengerjakan proposal bersama dua rekan setim di Google Docs, jadi selalu
  periksa kondisi terkini sebelum menyunting docx.
