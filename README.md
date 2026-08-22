# VASKO

Platform manajemen kontrak, kepatuhan TKDN, dan performa vendor untuk fase
pasca-kontrak pengadaan.

Dibangun sebagai penerapan nyata dari proposal Tim POKBAI untuk **Pertamina
Camp 2026**, program magang berbasis proyek Fakultas Ilmu Komputer Universitas
Brawijaya dengan PT Pertamina Patra Niaga Regional Kalimantan, Proyek 3.

> **Catatan data.** Seluruh dokumen kontrak di repositori ini adalah berkas
> sintetis yang disusun untuk pengujian. Tidak ada data operasional PT
> Pertamina Patra Niaga di dalamnya.

## Latar masalah

Digitalisasi pengadaan sudah ditopang tiga platform, yaitu PROMISE, DocGen, dan
SmartGEP, tetapi ketiganya berhenti tepat di titik penerbitan kontrak. Fase
sesudahnya belum punya sistem: perhitungan denda keterlambatan dan verifikasi
termin masih manual lewat Excel, masa berlaku sertifikat TKDN tidak terpantau,
dan performa vendor tidak punya rekam jejak terstruktur.

VASKO menutup celah itu lewat tiga modul:

| Modul | Cakupan | Keadaan |
| --- | --- | --- |
| **D10** | Manajemen kontrak | Berjalan |
| **D7** | Pemantauan kepatuhan TKDN | Belum dikerjakan |
| **D11** | Ekosistem performa vendor | Belum dikerjakan |

## Yang sudah berjalan

- **Daftar kontrak** beserta lencana status dan peringatan tenggat.
- **Detail kontrak** dengan lima tab: Ringkasan, Progres dan Termin, Amendemen,
  Dokumen, dan Denda.
- **Verifikasi Hasil Ekstraksi AI**: unggah PDF kontrak, model bahasa membaca
  medan kuncinya, lalu setiap nilai ditampilkan berdampingan dengan sorotan di
  dokumen aslinya untuk dikonfirmasi manusia sebelum disimpan.

Dashboard, modul D7, modul D11, dan autentikasi belum ada.

## Batas peran model bahasa

Prinsip yang paling menentukan rancangan sistem ini: **model bahasa hanya
menyentuh satu langkah.**

Alur ekstraksi terdiri atas empat langkah. Sistem membaca kata beserta kotak
batasnya dari PDF, mengirim teksnya ke model, mencocokkan nilai yang
dikembalikan ke daftar kata tadi, lalu menandai medan mana yang wajib
dikonfirmasi manusia. Hanya langkah kedua yang memakai model.

Koordinat sorotan, angka keyakinan, perhitungan denda, dan pemeriksaan
aritmetika termin seluruhnya deterministik. Perhitungan denda menyentuh
pembayaran vendor dan berkonsekuensi hukum, jadi tidak pernah diserahkan ke
model. Medan yang memuat nilai uang dan tanggal kritis tidak bisa tersimpan
tanpa dikonfirmasi manusia lebih dulu.

## Teknologi

Next.js 16 dengan App Router, TypeScript, Tailwind CSS 4, Prisma 7 di atas
PostgreSQL, dan pdf.js untuk membaca dokumen. Ekstraksi dapat memakai
OpenRouter atau Anthropic, ditukar lewat satu variabel lingkungan.

## Menjalankan secara lokal

Butuh Node.js 20 atau lebih baru dan satu basis data PostgreSQL. Basis data
gratis dari Neon sudah memadai.

```bash
git clone <url-repositori-anda> vasko
cd vasko
npm install
```

`npm install` sekaligus membangkitkan klien Prisma dan menyalin worker pdf.js
ke `public/`. Keduanya tidak disimpan di repositori.

Selanjutnya salin berkas contoh variabel lingkungan, lalu isi sendiri:

```bash
cp .env.example .env.local
```

Isi `.env.local` dengan editor Anda. Berkas itu diabaikan Git dan tidak boleh
pernah ikut ter-commit.

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Alamat sambungan PostgreSQL |
| `EKSTRAKSI_PENYEDIA` | `openrouter` atau `anthropic` |
| `OPENROUTER_API_KEY` | Kunci OpenRouter, bila memakai penyedia itu |
| `OPENROUTER_MODEL` | Model utama |
| `OPENROUTER_MODEL_CADANGAN` | Model cadangan saat model utama sibuk |
| `ANTHROPIC_API_KEY` | Kunci Anthropic, bila memakai penyedia itu |
| `ANTHROPIC_MODEL` | Model Anthropic yang dipakai |

Siapkan skema basis datanya, lalu jalankan:

```bash
npx prisma migrate deploy
npm run dev
```

Buka `http://localhost:3000`. Untuk mengisi satu kontrak contoh beserta termin,
progres, dan amendemennya:

```bash
npx tsx --env-file=.env.local scripts/seed.ts
```

## Dua penyedia model

`EKSTRAKSI_PENYEDIA` menentukan mana yang dipakai, tanpa menyentuh kode.

**OpenRouter** menyediakan endpoint gratis, dibatasi 20 permintaan per menit
dan 50 per hari. Endpoint gratis umumnya mengizinkan penyedia di baliknya
memakai data yang dikirim, jadi **pakailah hanya untuk dokumen sintetis**.

**Anthropic** berbayar dan dipakai untuk dokumen sungguhan. Perkiraan biayanya
dapat dihitung dengan `scripts/hitung-biaya.ts`.

## Dokumen uji

Dua kontrak sintetis tersedia di `public/contoh/`, lengkap dengan kunci
jawabannya.

- **KTR/2026/0142**, 24 halaman, susunan lurus.
- **KTR/2026/0163**, 60 halaman, sengaja menjebak. Memuat enam persentase yang
  bersaing, nilai lama pada amendemen, sembilan tanggal termasuk akhir masa
  pemeliharaan yang jatuh di tahun berikutnya, angka yang dieja dalam kurung,
  dan dua nomor kontrak yang mirip.

## Skrip

Seluruhnya di `scripts/`, dijalankan dengan `npx tsx`. Yang menyentuh basis
data atau API perlu tambahan `--env-file=.env.local`.

| Skrip | Kegunaan |
| --- | --- |
| `uji-denda.ts` | 12 kasus perhitungan denda |
| `uji-urai.ts` | 24 kasus pengurai rupiah, persen, cacah, dan tanggal |
| `uji-pdf.ts` | Pembacaan kata dan pencocokan koordinat |
| `uji-ekstraksi.ts` | Akurasi per medan, memakai kuota API |
| `uji-interaksi.ts` | Klik medan, konfirmasi, tombol simpan menyala |
| `uji-simpan.ts` | Alur penuh dari unggah sampai muncul di daftar |
| `uji-status.ts` | Draf dan Berjalan tampil berbeda |
| `potret.ts` | Potret layar untuk dibandingkan dengan rancangan |
| `seed.ts` | Mengisi satu kontrak contoh |
| `hitung-biaya.ts` | Perkiraan biaya per model |

Skrip uji yang memakai peramban butuh server pengembangan yang sudah menyala.

## Tim

Tim POKBAI, Program Studi Sistem Informasi, Fakultas Ilmu Komputer,
Universitas Brawijaya.

- Dzaki Althalsyah, ketua
- Ihsan Ramadhan
- Muhammad Farrel Aria Akbar
