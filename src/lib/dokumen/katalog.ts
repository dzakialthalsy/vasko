// Katalog jenis dokumen pendukung dan fakta yang dibaca dari dokumen itu.
//
// Dua daftar tetap ini membatasi apa yang boleh dikembalikan AI. Model
// diminta memilih dari daftar, bukan menciptakan nama sendiri, supaya hasil
// antar dokumen dan antar penyedia bisa dibandingkan dan diproses kode.
//
// Jenis dokumen sumber: sembilan dokumen pendukung pemilihan (DP3) pada
// Tahap Proses Pengadaan PPN Kalimantan, ditambah berita acara dan surat yang
// disebut dalam Checklist Kontrak dan Amandemen (butir 8) dan dalam arahan
// mentor. Daftar ini akan bertambah seiring dokumen baru dari Pertamina.

export type JenisPendukung = {
  kunci: string;
  label: string;
  /** Petunjuk singkat untuk model tentang ciri dokumen ini. */
  ciri: string;
  /** Untuk kontrak, untuk amendemen, atau keduanya. */
  untuk: "KONTRAK" | "AMENDEMEN" | "KEDUANYA";
};

export const JENIS_PENDUKUNG: readonly JenisPendukung[] = [
  { kunci: "OWNER_ESTIMATE_BOQ", label: "Owner Estimate dan Bill of Quantity", ciri: "Rincian item pekerjaan, volume, harga satuan, dan total perkiraan biaya.", untuk: "KONTRAK" },
  { kunci: "RISK_ASSESSMENT_DENDA", label: "Risk Assessment Penetapan Denda", ciri: "Penilaian risiko yang menetapkan jenis, cara hitung, dan nilai maksimal denda.", untuk: "KONTRAK" },
  { kunci: "RISK_ASSESSMENT_PEKERJAAN", label: "Risk Assessment Risiko Pekerjaan", ciri: "Penilaian risiko pelaksanaan pekerjaan.", untuk: "KONTRAK" },
  { kunci: "PURCHASE_REQUISITION", label: "Purchase Requisition", ciri: "Permintaan pengadaan dari fungsi peminta, memuat kebutuhan dan anggaran.", untuk: "KONTRAK" },
  { kunci: "PAKTA_INTEGRITAS", label: "Pakta Integritas", ciri: "Pernyataan komitmen integritas yang ditandatangani.", untuk: "KONTRAK" },
  { kunci: "FORM_TKDN", label: "Form TKDN (A1, A2, B1)", ciri: "Formulir identifikasi kebutuhan, nilai minimum, atau rencana monitoring TKDN.", untuk: "KONTRAK" },
  { kunci: "AKTA_PERUSAHAAN", label: "Akta Perusahaan", ciri: "Akta pendirian atau perubahan perusahaan: nama, nomor akta, tanggal akta, pengurus.", untuk: "KONTRAK" },
  { kunci: "JUSTIFIKASI_PENGADAAN", label: "Justifikasi Pengadaan", ciri: "Alasan dan dasar pengadaan, sering memuat nilai dan jangka waktu.", untuk: "KONTRAK" },
  { kunci: "CHECKLIST_HC_TAD", label: "Form Checklist HC TAD", ciri: "Daftar periksa tenaga alih daya dari fungsi Human Capital.", untuk: "KONTRAK" },
  { kunci: "BA_PREBID", label: "Berita Acara Pre-bid Meeting", ciri: "Hasil rapat penjelasan sebelum penawaran, bisa mengubah lingkup, volume, atau jadwal.", untuk: "KONTRAK" },
  { kunci: "BA_NEGOSIASI", label: "Berita Acara Negosiasi", ciri: "Hasil negosiasi harga dan syarat dengan penyedia, memuat harga akhir.", untuk: "KONTRAK" },
  { kunci: "SURAT_PENEGASAN_HARGA", label: "Surat Penegasan Harga", ciri: "Surat dari penyedia yang menegaskan harga akhir penawaran.", untuk: "KONTRAK" },
  { kunci: "SURAT_PENAWARAN", label: "Surat Penawaran", ciri: "Penawaran harga dan teknis dari penyedia.", untuk: "KONTRAK" },
  { kunci: "RKS_TOR", label: "RKS atau TOR", ciri: "Rencana kerja dan syarat atau kerangka acuan kerja: lingkup, jadwal, persyaratan.", untuk: "KONTRAK" },
  // Dokumen pendukung amendemen, mengikuti butir 71 sampai 74 Checklist Kontrak dan Amandemen.
  { kunci: "EVALUASI_PERUBAHAN_LINGKUP", label: "Hasil Evaluasi Perubahan Lingkup Kerja", ciri: "Analisis teknis yang membenarkan perubahan lingkup.", untuk: "AMENDEMEN" },
  { kunci: "PERHITUNGAN_VOLUME", label: "Hasil Perhitungan Perubahan Volume", ciri: "Perbandingan volume baru dengan volume kontrak awal.", untuk: "AMENDEMEN" },
  { kunci: "PERHITUNGAN_WAKTU", label: "Hasil Perhitungan Perubahan Jangka Waktu", ciri: "Perhitungan perubahan masa pelaksanaan beserta penyebab teknisnya.", untuk: "AMENDEMEN" },
  { kunci: "REFERENSI_HARGA", label: "Referensi Harga", ciri: "Dasar harga untuk item baru atau perubahan harga.", untuk: "AMENDEMEN" },
  { kunci: "IZIN_PRINSIP", label: "Izin Prinsip", ciri: "Persetujuan pejabat yang lebih tinggi atas amendemen bernilai besar.", untuk: "AMENDEMEN" },
  { kunci: "LAINNYA", label: "Lainnya", ciri: "Dokumen yang tidak cocok dengan jenis mana pun di atas.", untuk: "KEDUANYA" },
];

export const KUNCI_JENIS_PENDUKUNG = JENIS_PENDUKUNG.map((j) => j.kunci) as [string, ...string[]];

export function labelJenisPendukung(kunci: string | null): string {
  return JENIS_PENDUKUNG.find((j) => j.kunci === kunci)?.label ?? "Tidak diketahui";
}

// ---------------------------------------------------------------- fakta

export type BentukNilai = "rupiah" | "persen" | "hari" | "tanggal" | "teks";

export type DefinisiFakta = {
  kunci: string;
  label: string;
  bentuk: BentukNilai;
  /** Petunjuk untuk model tentang apa yang harus disalin. */
  petunjuk: string;
};

/**
 * Fakta yang boleh dikembalikan model dari dokumen pendukung. Nilainya selalu
 * disalin apa adanya, lalu diurai kode sesuai bentuknya.
 */
export const FAKTA: readonly DefinisiFakta[] = [
  { kunci: "nomor_kontrak", label: "Nomor Kontrak", bentuk: "teks", petunjuk: "Nomor kontrak yang disebut dokumen, apa adanya." },
  { kunci: "nama_perusahaan", label: "Nama Perusahaan", bentuk: "teks", petunjuk: "Nama badan usaha penyedia, lengkap dengan bentuk badannya (PT, CV), apa adanya." },
  { kunci: "nomor_akta", label: "Nomor Akta", bentuk: "teks", petunjuk: "Nomor akta perusahaan." },
  { kunci: "tanggal_akta", label: "Tanggal Akta", bentuk: "tanggal", petunjuk: "Tanggal akta, apa adanya, contoh 12 Januari 2019." },
  { kunci: "npwp", label: "NPWP", bentuk: "teks", petunjuk: "NPWP perusahaan, apa adanya." },
  { kunci: "nilai_total", label: "Nilai Total", bentuk: "rupiah", petunjuk: "Nilai atau harga TOTAL pekerjaan yang dicantumkan dokumen, contoh Rp4.850.000.000. Bukan harga satuan." },
  { kunci: "keterangan_ppn", label: "Keterangan PPN", bentuk: "teks", petunjuk: "Frasa yang menyatakan nilai total sudah atau belum termasuk PPN, apa adanya." },
  { kunci: "masa_pelaksanaan", label: "Masa Pelaksanaan", bentuk: "hari", petunjuk: "Lamanya masa pelaksanaan pekerjaan, apa adanya, contoh 181 hari kalender." },
  { kunci: "tanggal_mulai", label: "Tanggal Mulai", bentuk: "tanggal", petunjuk: "Tanggal mulai pekerjaan, apa adanya." },
  { kunci: "tanggal_selesai", label: "Tanggal Selesai", bentuk: "tanggal", petunjuk: "Tanggal paling lambat pekerjaan selesai, apa adanya." },
  { kunci: "tkdn_persen", label: "TKDN", bentuk: "persen", petunjuk: "Persentase TKDN yang dipersyaratkan atau dijanjikan, contoh 42%." },
  { kunci: "jaminan_pelaksanaan_persen", label: "Jaminan Pelaksanaan", bentuk: "persen", petunjuk: "Persentase Jaminan Pelaksanaan yang disebut dokumen, contoh 5%." },
];

export const KUNCI_FAKTA = FAKTA.map((f) => f.kunci) as [string, ...string[]];

export function definisiFakta(kunci: string): DefinisiFakta | undefined {
  return FAKTA.find((f) => f.kunci === kunci);
}

// ----------------------------------------------------------- pernyataan

/**
 * Atribut yang boleh dipakai pada pernyataan perubahan. Hanya yang berupa
 * angka, supaya perubahan bisa dihitung kode tanpa menebak maksud kalimat.
 */
export const ATRIBUT_PERNYATAAN = ["JUMLAH", "HARGA", "DURASI_HARI", "PERSEN"] as const;
export type AtributPernyataan = (typeof ATRIBUT_PERNYATAAN)[number];

/**
 * Cara sebuah kalimat menyebut angka:
 *   NILAI_BARU  menyebut nilai akhir ("diubah menjadi 15", "sebanyak 10")
 *   TAMBAH      menyebut penambahan ("ditambah 5", "bertambah 5")
 *   KURANG      menyebut pengurangan ("dikurangi 3", "berkurang 3")
 *
 * Model hanya memilih salah satu dari ketiganya dan menyalin angkanya. Tanda
 * plus atau minus dan hasil penjumlahannya dihitung kode.
 */
export const JENIS_PERNYATAAN = ["NILAI_BARU", "TAMBAH", "KURANG"] as const;
export type JenisPernyataan = (typeof JENIS_PERNYATAAN)[number];
