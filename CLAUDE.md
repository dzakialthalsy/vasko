@AGENTS.md

# VASKO

**Baca `RINGKASAN-VASKO.md` di awal sesi.** Berkas itu memuat keadaan tiap
halaman, keputusan penting beserta alasannya, jebakan yang sudah pernah
memakan waktu, palet warna, daftar skrip, dan sisa pekerjaan.

Aplikasi pendukung proposal Pertamina Camp 2026 di direktori induk. Untuk
konteks proposalnya, baca `../CLAUDE.md` dan
`../RINGKASAN-SESI-2-UNTUK-LANJUTAN.md`.

## Tiga aturan yang paling sering dilanggar

1. **Tidak boleh ada tanda pisah panjang** (em dash maupun en dash) dalam teks
   apa pun yang dihasilkan untuk user. Susun ulang dengan koma, tanda kurung,
   atau kalimat baru. Rentang angka pakai tanda hubung biasa.

2. **Verifikasi rupa dengan mata, bukan hanya struktur DOM.** Potret dan
   bandingkan dengan rancangan sebelum menyatakan selesai:
   ```bash
   MSYS_NO_PATHCONV=1 npx tsx scripts/potret.ts "/kontrak/KTR-2026-0142" hasil
   ```

3. **Jangan pernah meminta user menempelkan kunci API atau alamat basis data**
   ke percakapan. Arahkan mengisi `.env.local` sendiri.

## Batas peran model bahasa

Model hanya dipakai pada satu langkah, yaitu membaca teks kontrak dan
mengembalikan nilai medan. Koordinat sorotan, angka keyakinan, perhitungan
denda, dan pemeriksaan aritmetika termin seluruhnya deterministik. **Jangan
memindahkan salah satunya ke model.**
