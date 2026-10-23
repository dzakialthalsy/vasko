// Katalog medan yang diekstraksi dari dokumen kontrak.
//
// Satu tempat ini menjadi sumber kebenaran untuk: skema yang dikirim ke
// model, label di panel kanan, pengelompokan menurut bagian dokumen, dan
// penentuan medan mana yang wajib dikonfirmasi manusia.

export type KelompokMedan =
  | "POKOK_PERJANJIAN"
  | "LAMPIRAN_B"
  | "LAMPIRAN_C"
  | "LAMPIRAN_D";

export const JUDUL_KELOMPOK: Record<KelompokMedan, string> = {
  POKOK_PERJANJIAN: "Pokok-Pokok Perjanjian",
  LAMPIRAN_B: "Lampiran B, Lingkup Pekerjaan dan TKDN",
  LAMPIRAN_C: "Lampiran C, Tata Cara Pembayaran",
  LAMPIRAN_D: "Lampiran D, Jangka Waktu",
};

export type DefinisiMedan = {
  kunci: string;
  label: string;
  kelompok: KelompokMedan;
  /** Petunjuk untuk model tentang apa yang harus diambil dan bentuknya. */
  petunjuk: string;
  /**
   * Medan yang memuat nilai uang atau tanggal kritis wajib dikonfirmasi
   * manusia sebelum kontrak boleh disimpan ke repositori. Ini penerapan
   * langsung dari mitigasi risiko: seluruh keluaran AI berkedudukan sebagai
   * rekomendasi, bukan keputusan.
   */
  wajibKonfirmasi: boolean;
  /**
   * Nilai medan ini ditafsirkan kode menjadi kolom turunan atau bahan aturan
   * validasi, sedangkan manusia tidak wajib meninjaunya. Karena itu nilainya
   * hanya dipakai bila frasanya terbukti ada di teks PDF (keyakinan di atas
   * nol) atau sudah disunting manusia. Frasa yang tidak ada di PDF, misalnya
   * karangan model, tetap tersimpan sebagai hasil mentah tetapi diabaikan.
   */
  perluBukti?: boolean;
  /**
   * Perapian deterministik atas nilai yang dikembalikan model.
   *
   * Model yang baik justru setia pada teks dokumen: bila kontrak menulis
   * "sebesar minimal 42%", model mengembalikan "minimal 42%". Yang perlu
   * disimpan sebagai data adalah "42%". Menyuruh model membuang kata itu
   * lewat prompt terbukti tidak dipatuhi, sedangkan aturan tetap di sini
   * selalu memberi hasil yang sama dan dapat diuji.
   *
   * Kembalikan null bila nilainya tidak dapat dirapikan, sehingga medan itu
   * dilaporkan tidak ditemukan alih-alih tersimpan dalam bentuk keliru.
   */
  rapikan?: (nilai: string) => string | null;
};

/**
 * Membuang kata pengiring di depan tanggal, lalu menyisakan bentuk baku
 * "15 Maret 2026". Dipakai bersama oleh tanggal mulai dan tanggal berakhir.
 */
function rapikanTanggal(v: string): string | null {
  const m = v.match(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/);
  return m ? m[0] : null;
}

export const MEDAN: DefinisiMedan[] = [
  {
    kunci: "nomor_kontrak",
    label: "Nomor Kontrak",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk: "Nomor perjanjian apa adanya, contoh KTR/2026/0142.",
    wajibKonfirmasi: false,
  },
  {
    kunci: "nama_vendor",
    label: "Nama Vendor",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk:
      "Nama badan usaha PIHAK KEDUA, yaitu penyedia barang atau jasa. Bukan PT Pertamina Patra Niaga yang berkedudukan sebagai PIHAK PERTAMA.",
    wajibKonfirmasi: false,
  },
  {
    kunci: "nilai_kontrak",
    label: "Nilai Kontrak",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk:
      "Nilai total perjanjian dalam rupiah, disalin apa adanya termasuk titik pemisah ribuan, contoh Rp4.850.000.000.",
    wajibKonfirmasi: true,
    // Dokumen menulis "Rp4.850.000.000,- (Empat Miliar ...)". Yang disimpan
    // cukup nominalnya, tanpa ekor koma strip dan tanpa terbilang.
    rapikan: (v) => v.match(/Rp\s*[\d.]+\d/)?.[0].replace(/\s+/g, "") ?? null,
  },
  // Lima medan berikut dibaca sebagai FRASA, bukan nilai jadi. Frasanya disalin
  // apa adanya, lalu kode (urai.ts) yang menafsirkannya. Hasil tafsirannya
  // dipakai pemeriksaan validasi kontrak.
  {
    kunci: "nilai_termasuk_ppn",
    label: "Keterangan PPN pada Nilai Kontrak",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk:
      "Frasa pada pasal nilai kontrak yang menyatakan nilai itu sudah atau belum termasuk Pajak Pertambahan Nilai (PPN), disalin apa adanya. Contoh: sudah termasuk Pajak Pertambahan Nilai (PPN).",
    wajibKonfirmasi: false,
    perluBukti: true,
  },
  {
    kunci: "nilai_jaminan_pelaksanaan",
    label: "Nilai Jaminan Pelaksanaan",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk:
      "Besar Jaminan Pelaksanaan seperti tertulis pada pasal jaminan, contoh 5% dari nilai Perjanjian. Null bila tidak ada pasal jaminan.",
    wajibKonfirmasi: false,
    perluBukti: true,
  },
  {
    kunci: "masa_berlaku_jaminan",
    label: "Masa Berlaku Jaminan Pelaksanaan",
    kelompok: "POKOK_PERJANJIAN",
    petunjuk:
      "Frasa yang menyatakan sampai kapan Jaminan Pelaksanaan berlaku, disalin apa adanya. Contoh: sampai dengan 14 hari kalender setelah serah terima akhir pekerjaan.",
    wajibKonfirmasi: false,
    perluBukti: true,
  },
  {
    kunci: "lingkup_pekerjaan",
    label: "Lingkup Pekerjaan",
    kelompok: "LAMPIRAN_B",
    petunjuk:
      "Nama pekerjaan sebagaimana disebut pada Pasal Lingkup Pekerjaan, ringkas dan berdiri sendiri. Contoh jawaban benar: Pemeliharaan Terminal BBM Balikpapan.",
    wajibKonfirmasi: false,
    // Model kerap melanjutkan dengan rincian dari lampiran. Potong pada kata
    // penyambung yang menandai awal rincian itu.
    rapikan: (v) => {
      const potong = v.split(
        /(?:\s+|,\s*)(?:yang\s+)?(?:mencakup|meliputi|terdiri\s+atas)\b|\s+dengan memenuhi\b|,\s*sebagaimana\b/i
      )[0];
      return potong.trim().replace(/[.,;]+$/, "") || null;
    },
  },
  {
    kunci: "komitmen_tkdn",
    label: "Komitmen TKDN",
    kelompok: "LAMPIRAN_B",
    petunjuk:
      "Persentase komitmen Tingkat Komponen Dalam Negeri. Hanya angka dan tanda persen. Contoh jawaban benar: 42%.",
    wajibKonfirmasi: true,
    // Ambil persentase pertama, buang kata pengiring seperti minimal dan
    // ekor seperti dari total nilai barang/jasa.
    rapikan: (v) => v.match(/\d+(?:[.,]\d+)?\s*%/)?.[0].replace(/\s+/g, "") ?? null,
  },
  {
    kunci: "tarif_denda_harian",
    label: "Tarif Denda Harian",
    kelompok: "LAMPIRAN_C",
    petunjuk:
      "Tarif denda keterlambatan per hari beserta dasar perhitungannya, contoh 1/1000 dari nilai kontrak per hari.",
    wajibKonfirmasi: true,
    rapikan: (v) => {
      const potong = v
        .split(/\s*,\s*(?:dihitung|yang dihitung)\b/i)[0]
        // Model kerap menambahkan keterangan dalam kurung di ekor,
        // misalnya "(sebelum Pajak Pertambahan Nilai)".
        .replace(/\s*\([^)]*\)\s*$/, "");
      return potong.trim().replace(/[.,;]+$/, "") || null;
    },
  },
  {
    kunci: "batas_maksimum_denda",
    label: "Batas Maksimum Denda",
    kelompok: "LAMPIRAN_C",
    petunjuk: "Batas tertinggi akumulasi denda, contoh 5% dari nilai kontrak.",
    wajibKonfirmasi: true,
  },
  {
    kunci: "dasar_perhitungan_denda",
    label: "Dasar Perhitungan Denda",
    kelompok: "LAMPIRAN_C",
    petunjuk:
      "Frasa yang menyatakan dari nilai apa denda dihitung, disalin apa adanya. Contoh: dihitung dari nilai kontrak sebelum Pajak Pertambahan Nilai. Null bila tidak disebut.",
    wajibKonfirmasi: false,
    perluBukti: true,
  },
  {
    kunci: "jumlah_termin",
    label: "Jumlah Termin",
    kelompok: "LAMPIRAN_C",
    petunjuk: "Banyaknya termin pembayaran. Contoh jawaban benar: 3 termin.",
    wajibKonfirmasi: false,
    // Model kadang menjawab "3" saja, kadang "3 termin". Keduanya diseragamkan.
    rapikan: (v) => {
      const n = v.match(/\d+/)?.[0];
      return n ? `${n} termin` : null;
    },
  },
  {
    kunci: "tanggal_mulai",
    label: "Tanggal Mulai",
    kelompok: "LAMPIRAN_D",
    petunjuk:
      "Tanggal mulai pelaksanaan pekerjaan, disalin apa adanya seperti tertulis di dokumen, contoh 15 Maret 2026.",
    wajibKonfirmasi: true,
    // Model kadang menyalin kata pengiring di depan tanggal, misalnya
    // "pada tanggal 15 Maret 2026". Yang disimpan cukup tanggalnya.
    rapikan: rapikanTanggal,
  },
  {
    kunci: "tanggal_berakhir",
    label: "Tanggal Berakhir",
    kelompok: "LAMPIRAN_D",
    petunjuk:
      "Tanggal paling lambat PEKERJAAN harus selesai, disalin apa adanya. Bukan tanggal berakhirnya masa pemeliharaan, masa garansi, masa retensi, atau masa berlaku jaminan, yang biasanya jatuh beberapa bulan sesudahnya. Contoh jawaban benar: 12 September 2026.",
    wajibKonfirmasi: true,
    // Model kadang menyalin kata pengiring di depan tanggal, misalnya
    // "pada tanggal 15 Maret 2026". Yang disimpan cukup tanggalnya.
    rapikan: rapikanTanggal,
  },
  {
    kunci: "masa_pemeliharaan",
    label: "Masa Pemeliharaan",
    kelompok: "LAMPIRAN_D",
    petunjuk:
      "Lamanya masa pemeliharaan, contoh 60 hari kalender. Null bila tidak disebut atau kolomnya masih kosong.",
    wajibKonfirmasi: false,
    perluBukti: true,
  },
];

const PERLU_BUKTI = new Set(MEDAN.filter((m) => m.perluBukti).map((m) => m.kunci));

/**
 * Nilai medan yang boleh dipakai kode: untuk kolom turunan dan aturan validasi.
 *
 * Suntingan manusia selalu menang. Untuk medan yang perluBukti, nilai dari
 * model hanya dipakai bila frasanya ditemukan di teks PDF (keyakinan di atas
 * nol). Medan lain berperilaku seperti sebelumnya: nilai model dipakai apa adanya.
 */
export function nilaiYangDipakai(
  kunci: string,
  m: { nilai: string | null; nilaiSuntingan?: string | null; keyakinan: number }
): string | null {
  if (m.nilaiSuntingan != null) return m.nilaiSuntingan;
  if (PERLU_BUKTI.has(kunci) && !(m.keyakinan > 0)) return null;
  return m.nilai;
}

export const URUTAN_KELOMPOK: KelompokMedan[] = [
  "POKOK_PERJANJIAN",
  "LAMPIRAN_B",
  "LAMPIRAN_C",
  "LAMPIRAN_D",
];

export const JUMLAH_WAJIB_KONFIRMASI = MEDAN.filter((m) => m.wajibKonfirmasi).length;
