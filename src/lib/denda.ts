// Formula 3.1 Kalkulasi Denda Keterlambatan (modul D10).
//
//   Denda = min( V_net x 1/1000 x H , Jaminan Pelaksanaan )
//
// Keputusan penting yang tidak boleh dibalik: perhitungan ini DETERMINISTIK.
// Tidak ada model bahasa yang terlibat. Denda menyentuh pembayaran vendor dan
// berkonsekuensi hukum, sehingga hasilnya wajib sama persis dengan hitungan
// manual atas kasus uji yang sama. Lihat baris "Uji aturan perhitungan denda"
// pada Tabel 3.6 Rencana Pengujian Internal.
//
// Seluruh nilai uang diperlakukan sebagai bilangan bulat rupiah untuk
// menghindari galat pembulatan pecahan biner.

/** Tarif denda harian baku pada kontrak Pertamina: satu per seribu per hari. */
export const TARIF_HARIAN = 1 / 1000;

/** Batas maksimum denda baku, dinyatakan sebagai pecahan nilai kontrak. */
export const BATAS_MAKSIMUM = 0.05;

export type MasukanDenda = {
  /** Nilai dasar kontrak tanpa PPN, dalam rupiah penuh. */
  nilaiKontrak: number;
  /** Jumlah hari keterlambatan. Nilai negatif diperlakukan sebagai nol. */
  hariTerlambat: number;
  /** Tarif per hari. Bawaan 1/1000. */
  tarifHarian?: number;
  /** Batas maksimum sebagai pecahan nilai kontrak. Bawaan 0,05. */
  batasMaksimum?: number;
};

export type HasilDenda = {
  /** Denda setelah dibatasi ambang maksimum. */
  denda: number;
  /** Denda sebelum dibatasi, berguna untuk menjelaskan mengapa terpotong. */
  dendaSebelumBatas: number;
  /** Nominal ambang maksimum. */
  batasNominal: number;
  /** Benar bila fungsi minimum memilih ambang, bukan hasil perkalian. */
  menyentuhBatas: boolean;
  /** Denda tambahan untuk satu hari keterlambatan berikutnya. */
  tambahanPerHari: number;
  /** Jumlah hari sampai denda menyentuh ambang maksimum. */
  hariMenujuBatas: number;
};

export function hitungDenda({
  nilaiKontrak,
  hariTerlambat,
  tarifHarian = TARIF_HARIAN,
  batasMaksimum = BATAS_MAKSIMUM,
}: MasukanDenda): HasilDenda {
  if (!Number.isFinite(nilaiKontrak) || nilaiKontrak < 0) {
    throw new Error("nilaiKontrak harus bilangan tak negatif");
  }

  const hari = Math.max(0, Math.floor(hariTerlambat));
  const tambahanPerHari = Math.round(nilaiKontrak * tarifHarian);
  const batasNominal = Math.round(nilaiKontrak * batasMaksimum);
  const dendaSebelumBatas = tambahanPerHari * hari;
  const denda = Math.min(dendaSebelumBatas, batasNominal);

  return {
    denda,
    dendaSebelumBatas,
    batasNominal,
    menyentuhBatas: dendaSebelumBatas >= batasNominal && batasNominal > 0,
    tambahanPerHari,
    // Berapa hari sampai ambang tersentuh. Dipakai panel simulasi untuk
    // memberi tahu pengguna kapan denda berhenti bertambah.
    hariMenujuBatas:
      tambahanPerHari > 0 ? Math.ceil(batasNominal / tambahanPerHari) : 0,
  };
}

/**
 * Gerbang penyisih G2 pada Formula 3.4: denda sudah menyentuh ambang
 * maksimum. Sengaja diturunkan dari hasil Formula 3.1 agar kedua formula
 * tidak pernah berbeda pendapat.
 */
export function gerbangDendaMaksimum(hasil: HasilDenda): boolean {
  return hasil.menyentuhBatas;
}
