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
