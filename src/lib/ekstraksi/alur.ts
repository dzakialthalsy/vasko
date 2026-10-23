// Alur lengkap ekstraksi: PDF masuk, medan bersorotan keluar.
//
// Empat langkah, dan pembagian tugasnya disengaja:
//   1. Baca kata beserta kotak batasnya           (deterministik)
//   2. Kirim teksnya ke model untuk diekstraksi   (model bahasa)
//   3. Cocokkan nilai kembali ke daftar kata      (deterministik)
//   4. Tandai medan yang wajib dikonfirmasi       (aturan tetap)
//
// Model hanya menyentuh langkah 2. Koordinat sorotan dan angka keyakinan
// tidak pernah berasal dari model.

import { bacaKata, type HalamanPdf } from "@/lib/pdf/kata";
import { cocokkan, type KotakSorotan } from "@/lib/pdf/cocok";
import { pilihPenyedia, type Penyedia } from "./penyedia";
import { ekstrakTiruan, ekstrakTerminTiruan, galatBolehDitiru, ringkasGalat } from "./tiruan";
import { uraiTermin, periksaTermin, type TerminMentah, type TerminTerurai, type PemeriksaanTermin } from "./termin";
import { uraiRupiah } from "./urai";
import { MEDAN } from "./medan";

export type MedanHasil = {
  urutan: number;
  kunci: string;
  label: string;
  kelompok: string;
  nilai: string | null;
  keyakinan: number;
  wajibKonfirmasi: boolean;
  halaman: number | null;
  kotak: KotakSorotan[];
  teksSumber: string;
};

export type HasilAlur = {
  halaman: HalamanPdf[];
  medan: MedanHasil[];
  model: string;
  tokenMasukan: number;
  tokenKeluaran: number;
  durasiMs: number;
  /** Rincian termin dari lampiran tata cara pembayaran. */
  termin: TerminTerurai[];
  /** Pemeriksaan aritmetika: jumlah termin versus nilai kontrak. */
  periksaTermin: PemeriksaanTermin;
  /** Benar bila hasil berasal dari pengekstrak tiruan, bukan dari model. */
  tiruan: boolean;
  alasanTiruan: string | null;
};

/** Menggabungkan teks per halaman dengan penanda, agar model bisa menyebut halaman. */
export function rangkaiTeks(halaman: HalamanPdf[]): string {
  return halaman.map((h) => `=== Halaman ${h.nomor} ===\n${h.teks}`).join("\n\n");
}

export async function jalankanEkstraksi(
  data: Uint8Array,
  opsi: {
    izinkanTiruan?: boolean;
    /** Penyedia yang dipakai. Bila kosong dipilih dari .env.local. Dipakai pengujian. */
    penyedia?: Penyedia;
  } = {}
): Promise<HasilAlur> {
  const t0 = Date.now();

  const { halaman, kata } = await bacaKata(data);
  const teks = rangkaiTeks(halaman);

  let nilai: Record<string, string | null>;
  let terminMentah: TerminMentah[] = [];
  let model: string;
  let tokenMasukan = 0;
  let tokenKeluaran = 0;
  let tiruan = false;
  let alasanTiruan: string | null = null;

  try {
    const penyedia = opsi.penyedia ?? pilihPenyedia();
    const r = await penyedia.ekstrak(teks);
    nilai = r.nilai;
    terminMentah = r.termin;
    model = penyedia.nama;
    tokenMasukan = r.tokenMasukan;
    tokenKeluaran = r.tokenKeluaran;
  } catch (e) {
    // Hanya galat yang memang di luar kendali kode, seperti kredit habis atau
    // kunci belum ada, yang boleh jatuh ke mode tiruan. Galat lain harus
    // muncul apa adanya supaya tidak ada cacat yang tertutupi diam-diam.
    if (!opsi.izinkanTiruan || !galatBolehDitiru(e)) throw e;
    nilai = ekstrakTiruan(teks);
    terminMentah = ekstrakTerminTiruan(teks);
    model = "tiruan";
    tiruan = true;
    alasanTiruan = ringkasGalat(e);
  }

  const medan: MedanHasil[] = MEDAN.map((def, i) => {
    const mentah = nilai[def.kunci] ?? null;
    // Nilai yang DISIMPAN adalah hasil perapian, karena itu bentuk baku yang
    // masuk basis data.
    const isi = mentah && def.rapikan ? def.rapikan(mentah) : mentah;

    // Nilai yang DICOCOKKAN ke dokumen adalah nilai mentah lebih dulu, sebab
    // itulah untai yang benar-benar tercetak di halaman. Dokumen bisa menulis
    // "5 (lima) termin" sementara bentuk bakunya "5 termin"; mencocokkan
    // bentuk baku ke halaman akan meleset. Hasil perapian dipakai sebagai
    // cadangan, untuk kasus sebaliknya ketika model menambahkan kata yang
    // tidak ada di dokumen.
    let cocok = mentah ? cocokkan(mentah, kata) : null;
    if ((!cocok || !cocok.ditemukan) && isi && isi !== mentah) {
      cocok = cocokkan(isi, kata);
    }

    return {
      urutan: i + 1,
      kunci: def.kunci,
      label: def.label,
      kelompok: def.kelompok,
      nilai: isi,
      // Medan yang tidak dikembalikan model, atau yang nilainya tidak
      // ditemukan di dokumen, berkeyakinan nol. Angka itu jujur: sistem
      // memang tidak punya bukti tekstual untuk nilai tersebut.
      keyakinan: cocok?.ditemukan ? cocok.keyakinan : 0,
      wajibKonfirmasi: def.wajibKonfirmasi,
      halaman: cocok?.halaman ?? null,
      kotak: cocok?.kotak ?? [],
      teksSumber: cocok?.teksSumber ?? "",
    };
  });

  // Pemeriksaan aritmetika dijalankan di sini, bukan di antarmuka, supaya
  // hasilnya sama entah diakses lewat halaman unggah maupun lewat API.
  const terminTerurai = uraiTermin(terminMentah);
  const cekTermin = periksaTermin(
    terminTerurai,
    uraiRupiah(medan.find((m) => m.kunci === "nilai_kontrak")?.nilai ?? null)
  );

  return {
    halaman,
    medan,
    termin: terminTerurai,
    periksaTermin: cekTermin,
    model,
    tokenMasukan,
    tokenKeluaran,
    durasiMs: Date.now() - t0,
    tiruan,
    alasanTiruan,
  };
}
