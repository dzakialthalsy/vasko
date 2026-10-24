// Mengubah untai hasil ekstraksi menjadi tipe yang dituntut basis data.
//
// Hasil ekstraksi selalu berupa teks, misalnya "Rp12.400.000.000" dan
// "20 April 2026". Kolom basis data menuntut angka dan tanggal. Penguraian
// dikerjakan di sini, terpisah, supaya dapat diuji sendiri tanpa menyentuh
// basis data maupun model.
//
// Seluruh fungsi mengembalikan null bila gagal, bukan melempar. Medan yang
// tidak dapat diurai disimpan sebagai kosong, dan untai aslinya tetap
// tersimpan pada tabel medan ekstraksi sehingga tidak ada informasi hilang.

const BULAN: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  // Bentuk singkat yang lazim dipakai pada dokumen.
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, ags: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
};

/** "Rp12.400.000.000" atau "Rp 12.400.000.000,00" menjadi 12400000000. */
export function uraiRupiah(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/Rp\s*([\d.]+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const utuh = Number(m[1].replace(/\./g, ""));
  if (!Number.isFinite(utuh)) return null;
  const pecahan = m[2] ? Number(`0.${m[2]}`) : 0;
  return utuh + pecahan;
}

/** "38%" atau "minimal 38 %" menjadi 38. */
export function uraiPersen(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "5 termin" menjadi 5. */
export function uraiCacah(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) ? n : null;
}

/**
 * "20 April 2026" menjadi Date pada tengah malam UTC.
 *
 * Sengaja UTC, bukan zona waktu setempat. Tanggal kontrak adalah tanggal
 * kalender, bukan momen tertentu; menyimpannya di zona setempat membuatnya
 * bergeser sehari ketika dibaca di zona lain.
 */
export function uraiTanggal(v: string | null): Date | null {
  if (!v) return null;

  const teks = v.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (teks) {
    const bulan = BULAN[teks[2].toLowerCase()];
    if (!bulan) return null;
    return bentukTanggal(Number(teks[3]), bulan, Number(teks[1]));
  }

  // Bentuk angka, misalnya 20-04-2026 atau 20/4/2026.
  const angka = v.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (angka) {
    return bentukTanggal(Number(angka[3]), Number(angka[2]), Number(angka[1]));
  }
  return null;
}

function bentukTanggal(tahun: number, bulan: number, hari: number): Date | null {
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31) return null;
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  // Menolak tanggal yang bergeser, misalnya 31 April yang menjadi 1 Mei.
  if (d.getUTCMonth() !== bulan - 1 || d.getUTCDate() !== hari) return null;
  return d;
}

/** Mengubah nomor kontrak menjadi bentuk yang aman dipakai pada URL dan nama berkas. */
export function keSlug(nomor: string): string {
  return nomor.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ------------------------------------------------------------------
// Penguraian untuk medan yang diperiksa oleh validasi kontrak.
//
// Pola yang sama dengan di atas: model hanya menyalin frasa dari dokumen,
// kode yang menafsirkannya. Semuanya mengembalikan null bila frasanya tidak
// dikenali, jadi pemeriksaan yang bergantung padanya dilewati, bukan salah.

/**
 * Angka berformat Indonesia atau Inggris menjadi number.
 * "1.455.000" menjadi 1455000, "10,5" menjadi 10.5, "1,455,000" menjadi 1455000.
 */
export function uraiAngka(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/-?\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]+$/, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const PPN = String.raw`(?:ppn|pajak\s+pertambahan\s+nilai)`;

/**
 * Apakah nilai sudah termasuk PPN, menurut frasa pada pasal nilai kontrak.
 * "sudah termasuk Pajak Pertambahan Nilai (PPN)" menjadi true, "belum termasuk
 * PPN" menjadi false, frasa tanpa PPN menjadi null.
 */
export function uraiTermasukPpn(v: string | null): boolean | null {
  if (!v) return null;
  const t = v.toLowerCase();
  if (!new RegExp(PPN).test(t)) return null;
  // Yang negatif diperiksa lebih dulu, sebab "tidak termasuk" memuat "termasuk".
  if (new RegExp(String.raw`(belum|tidak|di\s*luar|tanpa|exclude|eksklusif)\s+(?:termasuk\s+)?(?:\w+\s+){0,2}${PPN}`).test(t)) return false;
  if (new RegExp(String.raw`(sudah|telah|termasuk|include|inklusif)\s+(?:\w+\s+){0,2}${PPN}`).test(t)) return true;
  return null;
}

/** Tarif denda per hari dalam permil. "1/1000 dari nilai kontrak per hari" menjadi 1. */
export function uraiTarifPermil(v: string | null): number | null {
  if (!v) return null;
  const pecahan = v.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (pecahan) {
    const a = Number(pecahan[1].replace(",", "."));
    const b = Number(pecahan[2].replace(",", "."));
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return Math.round((1000 * a / b) * 10000) / 10000;
  }
  const permil = v.match(/(\d+(?:[.,]\d+)?)\s*(?:‰|permil|per\s*mil|per\s*seribu)/i);
  if (permil) {
    const n = Number(permil[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type DasarDenda = "SEBELUM_PPN" | "SESUDAH_PPN";

/** Dasar nilai untuk menghitung denda: sebelum atau sesudah PPN. */
export function uraiDasarDenda(v: string | null): DasarDenda | null {
  if (!v) return null;
  const t = v.toLowerCase();
  if (!new RegExp(PPN).test(t)) return null;
  if (new RegExp(String.raw`(sebelum|belum\s+termasuk|tidak\s+termasuk|di\s*luar|tanpa)\s+(?:\w+\s+){0,2}${PPN}`).test(t)) {
    return "SEBELUM_PPN";
  }
  if (new RegExp(String.raw`(setelah|sesudah|termasuk|dengan)\s+(?:\w+\s+){0,2}${PPN}`).test(t)) {
    return "SESUDAH_PPN";
  }
  return null;
}

export type MasaBerlakuJaminan =
  /** "14 hari kalender setelah serah terima akhir". Bulan dihitung 30 hari. */
  | { jenis: "SETELAH_SELESAI"; hari: number; perkiraan: boolean }
  /** "sampai dengan 12 Oktober 2026". */
  | { jenis: "TANGGAL"; tanggal: Date };

/**
 * Masa berlaku Jaminan Pelaksanaan menurut frasa pada pasal jaminan.
 *
 * Bentuk relatif ("N hari setelah ...") dihitung dari serah terima akhir
 * pekerjaan, yang pada kontrak Pertamina berimpit dengan tanggal berakhirnya
 * pekerjaan. Itu asumsi yang disengaja dan dicatat di sini.
 */
export function uraiMasaBerlakuJaminan(v: string | null): MasaBerlakuJaminan | null {
  if (!v) return null;

  const relatif =
    v.match(/(\d+)\s*(?:\([^)]*\)\s*)?(hari|bulan)(?:\s+kalender)?\s+(?:setelah|sesudah|sejak|terhitung\s+sejak)/i) ??
    // Bunyi template Pertamina: "selama MASA PENYELESAIAN PEKERJAAN ...,
    // ditambah sekurang-kurangnya 30 (tiga puluh) HARI KALENDER". Artinya
    // sama dengan 30 hari kalender setelah pekerjaan selesai.
    v.match(/ditambah\s+(?:(?:sekurang\s*-\s*kurangnya|paling\s+sedikit|minimal|minimum)\s+)?(\d+)\s*(?:\([^)]*\)\s*)?(hari|bulan)/i);
  if (relatif) {
    const n = Number(relatif[1]);
    const bulan = relatif[2].toLowerCase() === "bulan";
    return { jenis: "SETELAH_SELESAI", hari: bulan ? n * 30 : n, perkiraan: bulan };
  }

  const tanggal = uraiTanggal(v);
  if (tanggal) return { jenis: "TANGGAL", tanggal };
  return null;
}

/** "60 (enam puluh) hari kalender" menjadi 60. Bulan dihitung 30 hari. */
export function uraiHari(v: string | null): number | null {
  if (!v) return null;
  const hari = v.match(/(\d+)\s*(?:\([^)]*\)\s*)?hari/i);
  if (hari) return Number(hari[1]);
  const bulan = v.match(/(\d+)\s*(?:\([^)]*\)\s*)?bulan/i);
  if (bulan) return Number(bulan[1]) * 30;
  return null;
}

/** Selisih hari kalender antara dua tanggal. Positif bila kedua lebih akhir. */
export function selisihHari(dari: Date, ke: Date): number {
  return Math.round((ke.getTime() - dari.getTime()) / 86_400_000);
}

/** Menambah hari kalender pada tanggal UTC. */
export function tambahHari(tanggal: Date, hari: number): Date {
  return new Date(tanggal.getTime() + hari * 86_400_000);
}
