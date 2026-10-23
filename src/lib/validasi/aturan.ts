// Aturan validasi kontrak. Murni kode: tidak ada AI, tidak ada basis data.
//
// Prinsipnya sama dengan bagian lain VASKO. AI hanya membaca dan menyalin
// (frasa dari kontrak, fakta dari dokumen pendukung). Keputusan lulus atau
// bertentangan selalu diambil di sini, dengan aturan tetap yang bisa diuji
// dan selalu memberi hasil yang sama untuk masukan yang sama.
//
// Dasar tiap aturan dicantumkan pada temuannya. Sumbernya: Checklist Kontrak
// dan Amandemen Pertamina (nomor butir diperiksa langsung ke dokumennya),
// atau arahan mentor yang tercatat di notulen bimbingan.
//
// Sebuah aturan DILEWATI, bukan dianggap lulus, bila datanya tidak ada.
// Contoh: tanpa Form TKDN yang diunggah, komitmen TKDN tidak bisa dibandingkan.
// Daftar yang dilewati ikut dilaporkan supaya pengguna tahu apa yang belum
// diperiksa.

import { rupiah, tanggal as tanggalTeks } from "@/lib/format";
import type { NilaiEfektif } from "@/lib/dokumen/peran";
import type { PemeriksaanTermin } from "@/lib/ekstraksi/termin";
import { selisihHari, tambahHari, uraiTermasukPpn, type DasarDenda, type MasaBerlakuJaminan } from "@/lib/ekstraksi/urai";
import { kemiripan, type KotakSorotan } from "@/lib/pdf/cocok";

/**
 * Tarif PPN yang dipakai untuk menyetarakan nilai dengan dan tanpa PPN.
 * Mengikuti RAB tim (PPN 11%). Perlu ditinjau bila ketentuan berubah.
 */
export const TARIF_PPN = 0.11;

/** Selisih rupiah yang masih dianggap sama, karena pembulatan antar dokumen. */
const TOLERANSI_RUPIAH = 1000;

/** Selisih hari yang masih dianggap sama, karena cara menghitung awal dan akhir berbeda. */
const TOLERANSI_HARI = 1;

export const SEMUA_LAMPIRAN = ["A", "B", "C", "D", "E", "F", "G"] as const;

// ------------------------------------------------------------------ tipe

export type FaktaKontrak = {
  nomor: string;
  namaVendor: string | null;
  nilaiKontrak: number | null;
  termasukPpn: boolean | null;
  tarifDendaPermil: number | null;
  batasDendaPersen: number | null;
  /** Persentase Jaminan Pelaksanaan menurut pasal jaminan. */
  jaminanPersen: number | null;
  masaJaminan: MasaBerlakuJaminan | null;
  dasarDenda: DasarDenda | null;
  tanggalMulai: Date | null;
  tanggalBerakhir: Date | null;
  komitmenTkdnPersen: number | null;
  /** Huruf lampiran yang terdeteksi ada, A sampai G. */
  lampiranAda: string[];
  /** Hasil pemeriksaan aritmetika termin, dari periksaTermin. */
  termin: PemeriksaanTermin;
  /** Nilai teks tiap medan, untuk ditampilkan pada temuan. */
  teks: Record<string, string | null>;
};

export type FaktaDokumen = {
  dokumenId: string;
  nama: string;
  jenisPendukung: string | null;
  tanggalDiIsi: Date | null;
  tanggalEditBerkas: Date | null;
  kunci: string;
  nilaiTeks: string;
  /** Hasil urai berbentuk angka, untuk fakta berbentuk rupiah, persen, atau hari. */
  angka: number | null;
  /** Hasil urai berbentuk tanggal, untuk fakta berbentuk tanggal. */
  tanggal: Date | null;
  keyakinan: number;
};

export type MasukanAturan = {
  kontrak: FaktaKontrak;
  /** Fakta terverifikasi dari seluruh dokumen pendukung. Untuk tiap kunci, yang terbaru dipakai. */
  fakta: FaktaDokumen[];
  efektif: NilaiEfektif[];
  dokumenTanpaTeks: { id: string; nama: string }[];
  /** Nama dokumen menurut id, untuk menyebut dokumen pada uraian temuan. */
  namaDokumen: Map<string, string>;
};

export type TemuanAturan = {
  kode: string;
  tingkat: "MERAH" | "KUNING";
  lokasi: string | null;
  uraian: string;
  nilaiDiKontrak: string | null;
  nilaiSaran: string | null;
  dasar: string;
  /** Kunci medan ekstraksi kontrak yang sorotannya dipakai pada temuan ini. */
  medanSorotan: string[];
  /** Kotak sorotan yang sudah dihitung langsung, untuk temuan hasil pemeriksaan klausul. */
  sorotanLangsung?: { dokumenId: string; kotak: KotakSorotan[] };
};

export type CatatanPemeriksaan = {
  kode: string;
  nama: string;
  status: "LULUS" | "TEMUAN" | "DILEWATI";
  catatan: string;
};

type HasilAturan = { temuan: TemuanAturan[] } | { dilewati: string };

type Aturan = {
  kode: string;
  nama: string;
  periksa: (m: MasukanAturan) => HasilAturan;
};

// ------------------------------------------------------------------ bantu

const DASAR_CHECKLIST = "Checklist Kontrak dan Amandemen";

/**
 * Nama badan usaha tanpa bentuk badannya dan tanda baca, supaya "PT Sumber
 * Jaya Abadi" dan "P.T. SUMBER JAYA ABADI" dianggap sama. Titik dibuang lebih
 * dulu supaya "P.T." menjadi "pt" dan ikut terbuang.
 */
const normalNama = (s: string) =>
  s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b(perseroan terbatas|persero|tbk|pt|cv|firma|ud)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");

/** Dari fakta berkunci sama, ambil yang paling baru menurut tanggal isi lalu tanggal berkas. */
function terbaru(fakta: FaktaDokumen[], kunci: string, jenis?: string[]) {
  const kandidat = fakta
    .filter((f) => f.kunci === kunci && f.keyakinan > 0 && (!jenis || (f.jenisPendukung && jenis.includes(f.jenisPendukung))))
    .sort((a, b) => {
      const ta = a.tanggalDiIsi?.getTime() ?? -Infinity;
      const tb = b.tanggalDiIsi?.getTime() ?? -Infinity;
      if (ta !== tb) return tb - ta;
      return (b.tanggalEditBerkas?.getTime() ?? 0) - (a.tanggalEditBerkas?.getTime() ?? 0);
    });
  return kandidat[0] ?? null;
}

const ppnDokumen = (fakta: FaktaDokumen[], dokumenId: string): boolean | null => {
  const f = fakta.find((x) => x.dokumenId === dokumenId && x.kunci === "keterangan_ppn" && x.keyakinan > 0);
  return f ? uraiTermasukPpn(f.nilaiTeks) : null;
};

const hari = (n: number) => `${n.toLocaleString("id-ID")} hari kalender`;

// ------------------------------------------------------------------ aturan

const ATURAN: Aturan[] = [
  {
    kode: "TERMIN_SAMA_NILAI",
    nama: "Jumlah termin pembayaran sama dengan nilai kontrak",
    periksa: ({ kontrak: k }) => {
      if (k.termin.jumlahBaris === 0) return { dilewati: "Kontrak ini tidak memuat rincian termin." };
      if (k.termin.nilaiKontrak === null) return { dilewati: "Nilai kontrak belum diketahui." };
      if (k.termin.seimbang) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "TERMIN_SAMA_NILAI",
            tingkat: "MERAH",
            lokasi: "Lampiran C, tata cara pembayaran",
            uraian: k.termin.catatan,
            nilaiDiKontrak: `Jumlah termin ${rupiah(k.termin.totalTermin)}`,
            nilaiSaran: `Sama dengan nilai kontrak ${rupiah(k.termin.nilaiKontrak)}`,
            dasar: "Pemeriksaan aritmetika: jumlah seluruh termin wajib sama dengan nilai kontrak",
            medanSorotan: ["jumlah_termin", "nilai_kontrak"],
          },
        ],
      };
    },
  },
  {
    kode: "URUTAN_TANGGAL",
    nama: "Tanggal berakhir tidak mendahului tanggal mulai",
    periksa: ({ kontrak: k }) => {
      if (!k.tanggalMulai || !k.tanggalBerakhir) return { dilewati: "Tanggal mulai atau tanggal berakhir belum diketahui." };
      if (k.tanggalBerakhir >= k.tanggalMulai) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "URUTAN_TANGGAL",
            tingkat: "MERAH",
            lokasi: "Jangka waktu pelaksanaan",
            uraian: "Tanggal berakhir pekerjaan lebih awal daripada tanggal mulainya.",
            nilaiDiKontrak: `${tanggalTeks(k.tanggalMulai)} sampai ${tanggalTeks(k.tanggalBerakhir)}`,
            nilaiSaran: null,
            dasar: "Konsistensi jangka waktu kontrak",
            medanSorotan: ["tanggal_mulai", "tanggal_berakhir"],
          },
        ],
      };
    },
  },
  {
    kode: "JAMINAN_MPP30",
    nama: "Masa berlaku Jaminan Pelaksanaan paling sedikit MPP ditambah 30 hari kalender",
    periksa: ({ kontrak: k }) => {
      const dasar = `${DASAR_CHECKLIST} butir 18 (TKO B3.2.4-05 Lamp. 3 Pasal 3f)`;
      if (!k.masaJaminan) {
        if (k.jaminanPersen !== null) return { dilewati: "Masa berlaku jaminan tidak terbaca dari pasal jaminan." };
        return {
          temuan: [
            {
              kode: "JAMINAN_TIDAK_DITEMUKAN",
              tingkat: "KUNING",
              lokasi: null,
              uraian:
                "Pasal Jaminan Pelaksanaan tidak ditemukan. Periksa apakah kontrak ini memang dikecualikan dari jaminan.",
              nilaiDiKontrak: null,
              nilaiSaran: null,
              dasar: `${DASAR_CHECKLIST} butir 16 dan 17`,
              medanSorotan: [],
            },
          ],
        };
      }

      const teks = k.teks.masa_berlaku_jaminan ?? null;
      const saran = "Paling sedikit 30 hari kalender setelah serah terima akhir (MPP + 30 hari kalender)";

      if (k.masaJaminan.jenis === "SETELAH_SELESAI") {
        if (k.masaJaminan.hari >= 30) return { temuan: [] };
        return {
          temuan: [
            {
              kode: "JAMINAN_MPP30",
              tingkat: "MERAH",
              lokasi: "Pasal Jaminan Pelaksanaan",
              uraian: `Jaminan Pelaksanaan hanya berlaku ${hari(k.masaJaminan.hari)} setelah serah terima akhir. Checklist mewajibkan minimum masa pelaksanaan ditambah 30 hari kalender.`,
              nilaiDiKontrak: teks ?? `${hari(k.masaJaminan.hari)} setelah serah terima akhir`,
              nilaiSaran: saran,
              dasar,
              medanSorotan: ["masa_berlaku_jaminan"],
            },
          ],
        };
      }

      if (!k.tanggalBerakhir) return { dilewati: "Tanggal berakhir pekerjaan belum diketahui, jadi batas minimum jaminan tidak bisa dihitung." };
      const minimum = tambahHari(k.tanggalBerakhir, 30);
      if (k.masaJaminan.tanggal >= minimum) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "JAMINAN_MPP30",
            tingkat: "MERAH",
            lokasi: "Pasal Jaminan Pelaksanaan",
            uraian: `Jaminan Pelaksanaan berlaku sampai ${tanggalTeks(k.masaJaminan.tanggal)}, padahal pekerjaan berakhir ${tanggalTeks(k.tanggalBerakhir)}. Checklist mewajibkan jaminan berlaku sampai paling cepat 30 hari kalender sesudahnya.`,
            nilaiDiKontrak: teks ?? tanggalTeks(k.masaJaminan.tanggal),
            nilaiSaran: `Paling cepat ${tanggalTeks(minimum)}`,
            dasar,
            medanSorotan: ["masa_berlaku_jaminan"],
          },
        ],
      };
    },
  },
  {
    kode: "JAMINAN_NILAI",
    nama: "Nilai Jaminan Pelaksanaan 5% (atau 10% untuk penawaran rendah)",
    periksa: ({ kontrak: k }) => {
      if (k.jaminanPersen === null) return { dilewati: "Persentase Jaminan Pelaksanaan tidak terbaca." };
      const dasar = `${DASAR_CHECKLIST} butir 17 (TKO B3.2.4-05 Lamp. 3 Pasal 3a-c)`;
      const teks = k.teks.nilai_jaminan_pelaksanaan ?? `${k.jaminanPersen}%`;
      if (k.jaminanPersen < 5) {
        return {
          temuan: [
            {
              kode: "JAMINAN_NILAI",
              tingkat: "MERAH",
              lokasi: "Pasal Jaminan Pelaksanaan",
              uraian: `Jaminan Pelaksanaan ${k.jaminanPersen}% lebih rendah dari standar 5% nilai kontrak.`,
              nilaiDiKontrak: teks,
              nilaiSaran: "5% dari nilai kontrak (atau 10% bila penawaran 80% atau kurang dari HPS)",
              dasar,
              medanSorotan: ["nilai_jaminan_pelaksanaan"],
            },
          ],
        };
      }
      if (k.jaminanPersen > 10) {
        return {
          temuan: [
            {
              kode: "JAMINAN_NILAI",
              tingkat: "KUNING",
              lokasi: "Pasal Jaminan Pelaksanaan",
              uraian: `Jaminan Pelaksanaan ${k.jaminanPersen}% melebihi 10%. Wajib ada justifikasi dari pejabat berwenang.`,
              nilaiDiKontrak: teks,
              nilaiSaran: "Paling banyak 10% dari nilai kontrak, kecuali ada justifikasi",
              dasar,
              medanSorotan: ["nilai_jaminan_pelaksanaan"],
            },
          ],
        };
      }
      if (k.jaminanPersen !== 5 && k.jaminanPersen !== 10) {
        return {
          temuan: [
            {
              kode: "JAMINAN_NILAI",
              tingkat: "KUNING",
              lokasi: "Pasal Jaminan Pelaksanaan",
              uraian: `Jaminan Pelaksanaan ${k.jaminanPersen}% bukan 5% maupun 10%. Pastikan memang sesuai ketentuan penawaran.`,
              nilaiDiKontrak: teks,
              nilaiSaran: "5% atau 10% dari nilai kontrak",
              dasar,
              medanSorotan: ["nilai_jaminan_pelaksanaan"],
            },
          ],
        };
      }
      return { temuan: [] };
    },
  },
  {
    kode: "DENDA_MINIMAL",
    nama: "Tarif denda paling sedikit 1 permil per hari",
    periksa: ({ kontrak: k }) => {
      if (k.tarifDendaPermil === null) return { dilewati: "Tarif denda tidak terbaca." };
      if (k.tarifDendaPermil >= 1) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "DENDA_MINIMAL",
            tingkat: "MERAH",
            lokasi: "Lampiran C, tarif denda",
            uraian: `Tarif denda ${k.tarifDendaPermil} permil per hari lebih rendah dari minimum 1 permil.`,
            nilaiDiKontrak: k.teks.tarif_denda_harian ?? `${k.tarifDendaPermil} permil per hari`,
            nilaiSaran: "Paling sedikit 1/1000 per hari",
            dasar: `${DASAR_CHECKLIST} butir 57 (TKI C3.2.3-01 Lamp. 5 Pasal 6)`,
            medanSorotan: ["tarif_denda_harian"],
          },
        ],
      };
    },
  },
  {
    kode: "DENDA_BATAS_JAMINAN",
    nama: "Batas maksimum denda sama dengan nilai Jaminan Pelaksanaan",
    periksa: ({ kontrak: k }) => {
      if (k.batasDendaPersen === null || k.jaminanPersen === null) {
        return { dilewati: "Batas denda atau persentase jaminan tidak terbaca." };
      }
      if (Math.abs(k.batasDendaPersen - k.jaminanPersen) < 0.001) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "DENDA_BATAS_JAMINAN",
            tingkat: "KUNING",
            lokasi: "Lampiran C, batas denda",
            uraian: `Batas maksimum denda ${k.batasDendaPersen}% berbeda dari Jaminan Pelaksanaan ${k.jaminanPersen}%. Batas denda mengikuti nilai Jaminan Pelaksanaan.`,
            nilaiDiKontrak: k.teks.batas_maksimum_denda ?? `${k.batasDendaPersen}%`,
            nilaiSaran: `${k.jaminanPersen}% dari nilai kontrak`,
            dasar: "Arahan mentor, bimbingan 18 September 2026: batas denda mengikuti Jaminan Pelaksanaan",
            medanSorotan: ["batas_maksimum_denda", "nilai_jaminan_pelaksanaan"],
          },
        ],
      };
    },
  },
  {
    kode: "DENDA_DASAR_PPN",
    nama: "Dasar hitung denda konsisten dengan keterangan PPN pada nilai kontrak",
    periksa: ({ kontrak: k }) => {
      if (k.termasukPpn === null || k.dasarDenda === null) return { dilewati: "Keterangan PPN atau dasar hitung denda tidak terbaca." };
      const bertentangan =
        (k.termasukPpn && k.dasarDenda === "SEBELUM_PPN") || (!k.termasukPpn && k.dasarDenda === "SESUDAH_PPN");
      if (!bertentangan) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "DENDA_DASAR_PPN",
            tingkat: "KUNING",
            lokasi: "Pasal nilai kontrak dan Lampiran C, dasar denda",
            uraian: k.termasukPpn
              ? "Nilai kontrak dinyatakan sudah termasuk PPN, tetapi denda dihitung dari nilai kontrak sebelum PPN. Dasar hitungan denda tidak konsisten."
              : "Nilai kontrak dinyatakan belum termasuk PPN, tetapi denda dihitung dari nilai sesudah PPN. Dasar hitungan denda tidak konsisten.",
            nilaiDiKontrak: `${k.teks.nilai_termasuk_ppn ?? "-"} | ${k.teks.dasar_perhitungan_denda ?? "-"}`,
            nilaiSaran: "Samakan dasar nilai yang dipakai pada pasal nilai kontrak dan pada perhitungan denda",
            dasar: `${DASAR_CHECKLIST} butir 7 (konsistensi seluruh lampiran) dan butir 11`,
            medanSorotan: ["nilai_termasuk_ppn", "dasar_perhitungan_denda"],
          },
        ],
      };
    },
  },
  {
    kode: "LAMPIRAN_LENGKAP",
    nama: "Lampiran A sampai G lengkap",
    periksa: ({ kontrak: k }) => {
      // Tanpa satu pun lampiran terdeteksi, dokumennya kemungkinan hanya
      // pokok perjanjian dan lampirannya diunggah terpisah. Tidak ada dasar
      // untuk menyebut ada yang kurang.
      if (k.lampiranAda.length === 0) return { dilewati: "Tidak ada lampiran yang terdeteksi pada dokumen kontrak yang diunggah." };
      const hilang = SEMUA_LAMPIRAN.filter((l) => !k.lampiranAda.includes(l));
      if (hilang.length === 0) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "LAMPIRAN_LENGKAP",
            tingkat: "KUNING",
            lokasi: "Seluruh dokumen kontrak",
            uraian: `Lampiran ${hilang.join(", ")} tidak ditemukan. Pastikan memang belum diunggah atau memang tidak ada.`,
            nilaiDiKontrak: `Lampiran yang ada: ${k.lampiranAda.join(", ")}`,
            nilaiSaran: "Lampiran A sampai G lengkap, atau alasan lampiran yang tidak dipakai",
            dasar: `${DASAR_CHECKLIST} butir 7 (A GTC, B Lingkup, C Keuangan, D Jangka Waktu, E HSSE, F Asuransi, G Lain-lain)`,
            medanSorotan: [],
          },
        ],
      };
    },
  },
  {
    kode: "TKDN_MINIMUM",
    nama: "Komitmen TKDN tidak lebih rendah dari nilai minimum pada Form TKDN",
    periksa: ({ kontrak: k, fakta }) => {
      const f = terbaru(fakta, "tkdn_persen", ["FORM_TKDN"]);
      if (!f || f.angka === null) return { dilewati: "Belum ada Form TKDN yang terbaca." };
      if (k.komitmenTkdnPersen === null) return { dilewati: "Komitmen TKDN pada kontrak tidak terbaca." };
      if (k.komitmenTkdnPersen >= f.angka) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "TKDN_MINIMUM",
            tingkat: "MERAH",
            lokasi: "Pasal lingkup dan TKDN, Lampiran B",
            uraian: `Komitmen TKDN pada kontrak ${k.komitmenTkdnPersen}% lebih rendah dari nilai minimum ${f.angka}% pada ${f.nama}.`,
            nilaiDiKontrak: k.teks.komitmen_tkdn ?? `${k.komitmenTkdnPersen}%`,
            nilaiSaran: `Paling sedikit ${f.angka}%`,
            dasar: `${f.nama} (${f.nilaiTeks}); ${DASAR_CHECKLIST} butir 12`,
            medanSorotan: ["komitmen_tkdn"],
          },
        ],
      };
    },
  },
  {
    kode: "NILAI_NEGOSIASI",
    nama: "Nilai kontrak sama dengan harga hasil negosiasi",
    periksa: ({ kontrak: k, fakta }) => {
      const f = terbaru(fakta, "nilai_total", ["BA_NEGOSIASI", "SURAT_PENEGASAN_HARGA"]);
      if (!f || f.angka === null) return { dilewati: "Belum ada berita acara negosiasi atau surat penegasan harga yang terbaca." };
      if (k.nilaiKontrak === null) return { dilewati: "Nilai kontrak tidak terbaca." };

      const dasar = `${f.nama} (${f.nilaiTeks}); ${DASAR_CHECKLIST} butir 8`;
      const ppnDok = ppnDokumen(fakta, f.dokumenId);

      // Setarakan nilai dokumen ke basis PPN yang dipakai kontrak, bila kedua
      // sisi menyebut status PPN-nya.
      let harapan = f.angka;
      let catatanPpn = "";
      if (ppnDok !== null && k.termasukPpn !== null && ppnDok !== k.termasukPpn) {
        harapan = k.termasukPpn ? f.angka * (1 + TARIF_PPN) : f.angka / (1 + TARIF_PPN);
        catatanPpn = k.termasukPpn
          ? ` Nilai pada dokumen belum termasuk PPN, jadi dibandingkan setelah ditambah PPN ${TARIF_PPN * 100}%.`
          : ` Nilai pada dokumen sudah termasuk PPN, jadi dibandingkan setelah dikurangi PPN ${TARIF_PPN * 100}%.`;
      }
      harapan = Math.round(harapan);

      const selisih = k.nilaiKontrak - harapan;
      if (Math.abs(selisih) <= TOLERANSI_RUPIAH) return { temuan: [] };

      const statusPpnJelas = ppnDok !== null && k.termasukPpn !== null;
      return {
        temuan: [
          {
            kode: "NILAI_NEGOSIASI",
            tingkat: statusPpnJelas ? "MERAH" : "KUNING",
            lokasi: "Pasal nilai kontrak",
            uraian:
              `Nilai kontrak ${rupiah(k.nilaiKontrak)} berbeda ${rupiah(Math.abs(selisih))} dari harga hasil negosiasi ${rupiah(harapan)}.` +
              catatanPpn +
              (statusPpnJelas ? "" : " Status PPN tidak jelas pada salah satu dokumen, jadi perbedaan ini perlu dicek manual."),
            nilaiDiKontrak: k.teks.nilai_kontrak ?? rupiah(k.nilaiKontrak),
            nilaiSaran: rupiah(harapan),
            dasar,
            medanSorotan: ["nilai_kontrak"],
          },
        ],
      };
    },
  },
  {
    kode: "MASA_PELAKSANAAN",
    nama: "Masa pelaksanaan pada kontrak sama dengan ketetapan dokumen pendukung",
    periksa: ({ kontrak: k, fakta, efektif }) => {
      if (!k.tanggalMulai || !k.tanggalBerakhir) return { dilewati: "Tanggal mulai atau berakhir pada kontrak tidak terbaca." };

      // Yang dicari: ketetapan masa pelaksanaan. Dari pernyataan perubahan
      // (sudah memperhitungkan tambahan dan pengganti) lebih dulu, lalu dari fakta.
      const dariPernyataan = efektif.find(
        (e) => e.atribut === "DURASI_HARI" && /pelaksanaan|penyelesaian|pekerjaan/i.test(e.butir)
      );
      const dariFakta = terbaru(fakta, "masa_pelaksanaan");
      const harapan = dariPernyataan?.nilai ?? (dariFakta?.angka ?? null);
      if (harapan === null) return { dilewati: "Belum ada dokumen pendukung yang menyebut masa pelaksanaan." };

      const sumber = dariPernyataan
        ? `pernyataan dokumen pendukung "${dariPernyataan.butir}"`
        : `${dariFakta!.nama} (${dariFakta!.nilaiTeks})`;
      const nyata = selisihHari(k.tanggalMulai, k.tanggalBerakhir);
      if (Math.abs(nyata - harapan) <= TOLERANSI_HARI) return { temuan: [] };

      return {
        temuan: [
          {
            kode: "MASA_PELAKSANAAN",
            tingkat: "MERAH",
            lokasi: "Jangka waktu pelaksanaan, Lampiran D",
            uraian: `Masa pelaksanaan pada kontrak ${hari(nyata)} (${tanggalTeks(k.tanggalMulai)} sampai ${tanggalTeks(k.tanggalBerakhir)}), sedangkan dokumen pendukung menetapkan ${hari(harapan)}.`,
            nilaiDiKontrak: hari(nyata),
            nilaiSaran: hari(harapan),
            dasar: `${sumber}; ${DASAR_CHECKLIST} butir 6 (jangka waktu sesuai NR Pratender)`,
            medanSorotan: ["tanggal_mulai", "tanggal_berakhir"],
          },
        ],
      };
    },
  },
  {
    kode: "VENDOR_AKTA",
    nama: "Nama vendor pada kontrak sama dengan akta perusahaan",
    periksa: ({ kontrak: k, fakta }) => {
      const f = terbaru(fakta, "nama_perusahaan", ["AKTA_PERUSAHAAN"]);
      if (!f) return { dilewati: "Belum ada akta perusahaan yang terbaca." };
      if (!k.namaVendor) return { dilewati: "Nama vendor pada kontrak tidak terbaca." };
      const a = normalNama(k.namaVendor);
      const b = normalNama(f.nilaiTeks);
      if (!a || !b) return { dilewati: "Nama vendor atau nama pada akta kosong setelah dirapikan." };
      if (kemiripan(a, b) >= 0.95) return { temuan: [] };
      return {
        temuan: [
          {
            kode: "VENDOR_AKTA",
            tingkat: "MERAH",
            lokasi: "Pihak kedua pada kontrak",
            uraian: `Nama vendor pada kontrak "${k.namaVendor}" tidak sama dengan nama pada akta perusahaan "${f.nilaiTeks}".`,
            nilaiDiKontrak: k.namaVendor,
            nilaiSaran: f.nilaiTeks,
            dasar: `${f.nama}; arahan mentor 25 September 2026: akta perusahaan menjadi master data vendor`,
            medanSorotan: ["nama_vendor"],
          },
        ],
      };
    },
  },
  {
    kode: "DOKUMEN_TIDAK_TERBACA",
    nama: "Seluruh dokumen punya lapisan teks yang bisa dibaca",
    periksa: ({ dokumenTanpaTeks }) => ({
      temuan: dokumenTanpaTeks.map((d) => ({
        kode: "DOKUMEN_TIDAK_TERBACA",
        tingkat: "KUNING" as const,
        lokasi: d.nama,
        uraian: `${d.nama} adalah hasil pindai tanpa lapisan teks, sehingga tidak bisa dibaca dan tidak ikut diperiksa. VASKO tidak memakai OCR.`,
        nilaiDiKontrak: null,
        nilaiSaran: "Unggah versi PDF yang teksnya bisa dipilih",
        dasar: "Batasan sistem: pembacaan memakai lapisan teks PDF, bukan pengenalan citra",
        medanSorotan: [],
      })),
    }),
  },
  {
    kode: "NILAI_BERTENTANGAN",
    nama: "Dokumen sejenis tidak menyebut nilai berbeda pada waktu yang sama",
    periksa: ({ efektif, namaDokumen }) => ({
      temuan: efektif
        .filter((e) => e.konflik)
        .map((e) => ({
          kode: "NILAI_BERTENTANGAN",
          tingkat: "KUNING" as const,
          lokasi: null,
          uraian: `Dua dokumen menyebut nilai pengganti yang berbeda untuk "${e.butir}" pada tanggal yang sama (${e.dokumenId
            .map((id) => namaDokumen.get(id) ?? id)
            .join(", ")}). Tentukan mana yang berlaku.`,
          nilaiDiKontrak: null,
          nilaiSaran: null,
          dasar: "Masukan Pak Rigga, progress report 2 Oktober 2026: dokumen ganda dinilai dari isinya",
          medanSorotan: [],
        })),
    }),
  },
];

export const DAFTAR_ATURAN = ATURAN.map((a) => ({ kode: a.kode, nama: a.nama }));

/**
 * Menjalankan seluruh aturan. Temuan diurutkan: merah lebih dulu, lalu kuning,
 * dengan urutan aturan dipertahankan di dalam tiap tingkat.
 */
export function jalankanAturan(m: MasukanAturan): { temuan: TemuanAturan[]; pemeriksaan: CatatanPemeriksaan[] } {
  const semua: TemuanAturan[] = [];
  const pemeriksaan: CatatanPemeriksaan[] = [];

  for (const a of ATURAN) {
    const h = a.periksa(m);
    if ("dilewati" in h) {
      pemeriksaan.push({ kode: a.kode, nama: a.nama, status: "DILEWATI", catatan: h.dilewati });
      continue;
    }
    semua.push(...h.temuan);
    pemeriksaan.push({
      kode: a.kode,
      nama: a.nama,
      status: h.temuan.length > 0 ? "TEMUAN" : "LULUS",
      catatan: h.temuan.length > 0 ? `${h.temuan.length} temuan` : "Sesuai",
    });
  }

  const urutTingkat = { MERAH: 0, KUNING: 1 } as const;
  const temuan = semua
    .map((t, i) => ({ t, i }))
    .sort((a, b) => urutTingkat[a.t.tingkat] - urutTingkat[b.t.tingkat] || a.i - b.i)
    .map((x) => x.t);

  return { temuan, pemeriksaan };
}

/**
 * Huruf lampiran yang terdeteksi ada pada teks kontrak. Hanya judul
 * berhuruf besar berpenutup titik dua yang dihitung ("LAMPIRAN B: ..."),
 * supaya kalimat rujukan seperti "sebagaimana dirinci pada Lampiran B" tidak
 * dianggap lampirannya ada.
 */
export function deteksiLampiran(teks: string): string[] {
  const ada = new Set<string>();
  for (const m of teks.matchAll(/\bLAMPIRAN\s+([A-G])\s*:/g)) ada.add(m[1]);
  return SEMUA_LAMPIRAN.filter((l) => ada.has(l));
}
