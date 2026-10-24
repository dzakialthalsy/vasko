// Jawaban AI tiruan untuk dokumen sintetis di public/contoh.
//
// Dipakai bersama oleh scripts/uji-basisdata.ts (klien tiruan di dalam proses)
// dan scripts/server-ai-palsu.ts (server HTTP bergaya OpenAI, supaya
// uji-live.ts bisa dijalankan tanpa memakai kuota). Setiap jawaban meniru
// model yang patuh pada prompt: kutipan disalin persis dari PDF sintetis,
// jadi lolos pencocokan balik ke teks PDF.

import { readFileSync } from "node:fs";
import path from "node:path";

type Peta = Record<string, unknown>;

/** Penangan AI tiruan: mengenali dokumen dari penandanya, lalu memberi jawaban yang sudah ditentukan. */
export function penangan(p: { nama: string; pengguna: string }): unknown {
  const u = p.pengguna;

  if (p.nama === "medan_kontrak") return jawabanMedanKontrak(u);

  if (p.nama === "dokumen_pendukung") {
    const kosong = { judul: null, nomor_dokumen: null, fakta: [] as Peta[], pernyataan: [] as Peta[] };
    if (u.includes("ADENDUM KERANGKA ACUAN KERJA")) {
      return { ...kosong, jenis: "RKS_TOR", tanggal_dokumen: "12 Januari 2026", pernyataan: [
        { butir: "titik pemeriksaan sistem perpipaan", atribut: "JUMLAH", jenis: "TAMBAH", nilai: "5", satuan: "titik", kutipan: "Jumlah titik pemeriksaan sistem perpipaan ditambah 5 (lima) titik pemeriksaan dari ketentuan semula." },
      ] };
    }
    if (u.includes("KERANGKA ACUAN KERJA (TOR)")) {
      return { ...kosong, jenis: "RKS_TOR", tanggal_dokumen: "5 Januari 2026", pernyataan: [
        { butir: "titik pemeriksaan sistem perpipaan", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "10", satuan: "titik", kutipan: "Pemeriksaan sistem perpipaan dilakukan pada 10 (sepuluh) titik pemeriksaan." },
      ] };
    }
    // Masa pelaksanaan ikut menjadi pernyataan di kedua BA pre-bid, sesuai
    // prompt baca pendukung. Butirnya sengaja ditulis sedikit berbeda, seperti
    // yang biasa terjadi pada model sungguhan.
    if (u.includes("PRE-BID MEETING LANJUTAN")) {
      return { ...kosong, jenis: "BA_PREBID", tanggal_dokumen: "20 Januari 2026",
        fakta: [{ kunci: "masa_pelaksanaan", nilai: "181 (seratus delapan puluh satu) hari kalender", kutipan: "Masa pelaksanaan pekerjaan ditetapkan tetap 181 (seratus delapan puluh satu) hari kalender" }],
        pernyataan: [
          { butir: "jumlah termin pembayaran", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "4", satuan: "termin", kutipan: "Jumlah termin pembayaran diubah menjadi 4 (empat) termin, mengikuti usulan calon penyedia." },
          { butir: "masa pelaksanaan", atribut: "DURASI_HARI", jenis: "NILAI_BARU", nilai: "181", satuan: "hari kalender", kutipan: "Masa pelaksanaan pekerjaan ditetapkan tetap 181 (seratus delapan puluh satu) hari kalender sejak Surat Perintah Mulai Kerja." },
        ] };
    }
    if (u.includes("BERITA ACARA PRE-BID MEETING")) {
      return { ...kosong, jenis: "BA_PREBID", tanggal_dokumen: "10 Januari 2026",
        fakta: [{ kunci: "masa_pelaksanaan", nilai: "181 (seratus delapan puluh satu) hari kalender", kutipan: "Masa pelaksanaan pekerjaan adalah 181 (seratus delapan puluh satu) hari kalender" }],
        pernyataan: [
          { butir: "jumlah termin pembayaran", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "3", satuan: "termin", kutipan: "Pembayaran pekerjaan dilakukan dalam 3 (tiga) termin sesuai progres fisik yang diverifikasi bersama." },
          { butir: "masa pelaksanaan pekerjaan", atribut: "DURASI_HARI", jenis: "NILAI_BARU", nilai: "181", satuan: "hari kalender", kutipan: "Masa pelaksanaan pekerjaan adalah 181 (seratus delapan puluh satu) hari kalender sejak Surat Perintah Mulai Kerja." },
        ] };
    }
    if (u.includes("BERITA ACARA NEGOSIASI")) {
      return { ...kosong, jenis: "BA_NEGOSIASI", tanggal_dokumen: "1 Februari 2026", fakta: [
        { kunci: "nilai_total", nilai: "Rp5.250.000.000", kutipan: "Harga akhir pekerjaan disepakati sebesar Rp5.250.000.000" },
        { kunci: "keterangan_ppn", nilai: "sudah termasuk Pajak Pertambahan Nilai (PPN)", kutipan: "sudah termasuk Pajak Pertambahan Nilai (PPN)" },
      ] };
    }
    if (u.includes("FORM A1")) {
      return { ...kosong, jenis: "FORM_TKDN", tanggal_dokumen: "20 Desember 2025", fakta: [
        { kunci: "tkdn_persen", nilai: "40%", kutipan: "yang dipersyaratkan pada pekerjaan ini adalah 40%" },
      ] };
    }
    if (u.includes("SALINAN AKTA PENDIRIAN")) {
      return { ...kosong, jenis: "AKTA_PERUSAHAAN", tanggal_dokumen: "12 Januari 2019", fakta: [
        { kunci: "nama_perusahaan", nilai: "PT Sumber Jaya Abadi", kutipan: "Perseroan ini bernama PT Sumber Jaya Abadi dan berkedudukan di Samarinda" },
      ] };
    }
    throw new Error("dokumen pendukung tidak dikenali oleh penangan tiruan");
  }

  if (p.nama === "periksa_klausul") {
    // Daftar ketetapan berbentuk "E1. butir (ATRIBUT) = nilai". Yang dicari id untuk termin.
    const baris = u.split("\n").find((b) => /^E\d+\./.test(b) && b.includes("jumlah termin pembayaran"));
    const id = baris?.match(/^(E\d+)\./)?.[1];
    return { penyebutan: id ? [{ rujukan: id, kutipan_kontrak: "Pembayaran akan dilakukan dalam 3 termin sesuai progres fisik di lapangan", angka_di_kontrak: "3" }] : [] };
  }

  if (p.nama === "amendemen") {
    if (u.includes("0142-Amendemen-3-turun.pdf")) {
      return { nomor_amendemen: "AMD-3/KTR/2026/0142", nomor_kontrak: "KTR/2026/0142", tanggal_amendemen: "14 Juli 2026", jenis_perubahan: ["VOLUME"],
        nilai_amendemen: { arah: "KURANG", nilai: "Rp100.000.000", kutipan: null }, nilai_kontrak_baru: null, tanggal_berakhir_baru: null,
        ringkasan: "Volume dikurangi dan nilai kontrak turun.", klausul_berubah: [] };
    }
    if (u.includes("0142-Amendemen-2.pdf")) {
      return { nomor_amendemen: "AMD-2/KTR/2026/0142", nomor_kontrak: "KTR/2026/0142", tanggal_amendemen: "14 Juli 2026", jenis_perubahan: ["JANGKA_WAKTU"],
        nilai_amendemen: { arah: "TETAP", nilai: null, kutipan: null }, nilai_kontrak_baru: null, tanggal_berakhir_baru: "26 September 2026",
        ringkasan: "Masa pelaksanaan diperpanjang 14 hari kalender.",
        klausul_berubah: [{ pasal: "Pasal 7", kutipan: "pekerjaan diselesaikan selambat-lambatnya pada tanggal 26 September 2026" }] };
    }
    return { nomor_amendemen: "AMD-1/KTR/2026/0142", nomor_kontrak: "KTR/2026/0142", tanggal_amendemen: "3 Mei 2026", jenis_perubahan: ["LINGKUP", "HARGA"],
      nilai_amendemen: { arah: "TAMBAH", nilai: "Rp242.500.000", kutipan: "nilai kontrak bertambah sebesar Rp242.500.000" },
      nilai_kontrak_baru: "Rp5.092.500.000", tanggal_berakhir_baru: null,
      ringkasan: "Lingkup bertambah dengan pemeliharaan manifold dan nilai kontrak naik.",
      klausul_berubah: [{ pasal: "Pasal 3", kutipan: "PASAL 3 NILAI KONTRAK yang semula Rp4.850.000.000 diubah sehingga nilai kontrak bertambah" }] };
  }

  if (p.nama === "bandingkan_versi") {
    if (u.includes("AMENDEMEN KEDUA")) {
      return { ringkasan_perubahan: "Tanggal berakhir pekerjaan diundur 14 hari.", alasan_perubahan: null, aspek: [
        { nama: "Tanggal berakhir", sebelum: "12 September 2026", sesudah: "26 September 2026", perubahan: "BERUBAH", kutipan_sesudah: "pekerjaan diselesaikan selambat-lambatnya pada tanggal 26 September 2026" },
      ] };
    }
    return { ringkasan_perubahan: "Nilai kontrak naik karena lingkup bertambah.", alasan_perubahan: "Hasil inspeksi menemukan penurunan ketebalan pipa.", aspek: [
      { nama: "Nilai kontrak", sebelum: "Rp4.850.000.000", sesudah: "Rp5.092.500.000", perubahan: "BERUBAH", kutipan_sesudah: "nilai kontrak bertambah sebesar Rp242.500.000" },
      { nama: "Karangan", sebelum: "x", sesudah: "y", perubahan: "BARU", kutipan_sesudah: "kalimat yang tidak ada di amendemen mana pun" },
    ] };
  }

  throw new Error(`penangan tiruan tidak mengenal tugas ${p.nama}`);
}

/** Keluaran ekstraksi kontrak tiruan untuk KTR/2026/0142: kunci jawaban ditambah lima frasa baru. */
export function jawabanMedanKontrak(pengguna = ""): Peta {
  const muatKunci = (nama: string) =>
    JSON.parse(readFileSync(path.resolve("public", "contoh", nama), "utf8")) as {
      medan: Record<string, string>;
      termin: { urutan: number; nilai: string; jatuh_tempo: string }[];
    };

  // Kontrak berformat template OCLC 01. Kunci jawabannya sudah memuat seluruh
  // medan dalam bentuk frasa yang tercetak di PDF, termasuk termin 3 yang
  // sengaja salah tulis.
  if (pengguna.includes("KTR/2026/0187")) {
    const kunci = muatKunci("KTR-2026-0187.kunci.json");
    const syarat = ["Prestasi fisik 30%", "Prestasi fisik 60%", "BAPP ditandatangani", "Verifikasi TKDN dan BASMP"];
    return { ...kunci.medan, termin: kunci.termin.map((t, i) => ({ ...t, syarat: syarat[i] })) };
  }

  const kunci = muatKunci("KTR-2026-0142.kunci.json");
  const syarat = ["Mobilisasi dan Tahap 1", "Pekerjaan Tahap 2", "Serah terima akhir"];
  return {
    ...kunci.medan,
    nilai_termasuk_ppn: "sudah termasuk Pajak Pertambahan Nilai (PPN)",
    nilai_jaminan_pelaksanaan: "5% dari nilai Perjanjian",
    masa_berlaku_jaminan: "sampai dengan 14 hari kalender setelah serah terima akhir pekerjaan",
    dasar_perhitungan_denda: "dihitung dari nilai kontrak sebelum Pajak Pertambahan Nilai",
    masa_pemeliharaan: null,
    termin: kunci.termin.map((t, i) => ({ ...t, syarat: syarat[i] })),
  };
}
