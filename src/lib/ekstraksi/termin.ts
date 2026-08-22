// Ekstraksi rincian termin pembayaran dari Lampiran C.
//
// Berbeda dari sepuluh medan kepala kontrak yang masing-masing berupa satu
// untai, termin berbentuk DAFTAR baris. Karena itu penanganannya dipisah ke
// berkas ini.
//
// Kunci mutunya bukan konfirmasi manusia baris demi baris, melainkan
// pemeriksaan aritmetika: jumlah seluruh termin wajib sama dengan nilai
// kontrak. Satu pemeriksaan itu menangkap angka yang terbaca keliru, baris
// yang terlewat, dan baris yang terhitung dua kali, sekaligus. Meminta
// manusia memeriksa lima belas sel satu per satu jauh lebih melelahkan dan
// justru lebih mudah lolos.

import { uraiRupiah, uraiTanggal } from "./urai";

export type TerminMentah = {
  urutan: number;
  nilai: string | null;
  syarat: string | null;
  jatuh_tempo: string | null;
};

export type TerminTerurai = {
  urutan: number;
  nilaiTeks: string | null;
  nilai: number | null;
  syarat: string;
  jatuhTempoTeks: string | null;
  jatuhTempo: Date | null;
};

export type PemeriksaanTermin = {
  jumlahBaris: number;
  totalTermin: number;
  nilaiKontrak: number | null;
  /** Selisih total termin terhadap nilai kontrak, dalam rupiah. */
  selisih: number | null;
  seimbang: boolean;
  /** Baris yang nominalnya gagal diurai menjadi angka. */
  barisTanpaNilai: number[];
  /** Baris yang tanggalnya gagal diurai. */
  barisTanpaTanggal: number[];
  catatan: string;
};

function rapikanSyarat(v: string | null): string {
  const bersih = (v ?? "")
    .trim()
    .replace(/^(?:setelah|apabila|jika|bila|sesudah|pada saat)\s+/i, "")
    .replace(/[.,;]+$/, "")
    .trim();
  if (!bersih) return "Tanpa keterangan";
  // Huruf pertama dibesarkan agar seragam dengan baris lain di tabel.
  return bersih.charAt(0).toUpperCase() + bersih.slice(1);
}

export function uraiTermin(mentah: TerminMentah[]): TerminTerurai[] {
  return mentah
    .filter((t) => t && (t.nilai || t.syarat || t.jatuh_tempo))
    .map((t, i) => ({
      // Urutan dari model kadang kosong atau melompat. Nomor baris ditetapkan
      // ulang di sini supaya selalu berurutan mulai dari satu.
      urutan: Number.isInteger(t.urutan) && t.urutan > 0 ? t.urutan : i + 1,
      nilaiTeks: t.nilai,
      nilai: uraiRupiah(t.nilai),
      // Model menyalin kalimat dokumen apa adanya, sehingga syarat kerap
      // berawalan "setelah" atau "apabila". Kata itu dibuang supaya kolomnya
      // ringkas dan tidak membungkus berbaris-baris di tabel sempit.
      syarat: rapikanSyarat(t.syarat),
      jatuhTempoTeks: t.jatuh_tempo,
      jatuhTempo: uraiTanggal(t.jatuh_tempo),
    }))
    .sort((a, b) => a.urutan - b.urutan)
    .map((t, i) => ({ ...t, urutan: i + 1 }));
}

/**
 * Memeriksa apakah rincian termin dapat dipercaya.
 *
 * Toleransi satu rupiah sengaja diberikan, karena dokumen kadang menuliskan
 * pecahan sen yang dibulatkan berbeda antar baris. Selisih lebih besar dari
 * itu berarti ada yang benar-benar salah baca.
 */
export function periksaTermin(
  termin: TerminTerurai[],
  nilaiKontrak: number | null
): PemeriksaanTermin {
  const totalTermin = termin.reduce((a, t) => a + (t.nilai ?? 0), 0);
  const barisTanpaNilai = termin.filter((t) => t.nilai === null).map((t) => t.urutan);
  const barisTanpaTanggal = termin.filter((t) => t.jatuhTempo === null).map((t) => t.urutan);

  const selisih = nilaiKontrak === null ? null : totalTermin - nilaiKontrak;
  const seimbang =
    termin.length > 0 &&
    barisTanpaNilai.length === 0 &&
    selisih !== null &&
    Math.abs(selisih) <= 1;

  let catatan: string;
  if (termin.length === 0) {
    catatan = "Rincian termin tidak ditemukan pada dokumen.";
  } else if (barisTanpaNilai.length > 0) {
    catatan = `Nominal termin ${barisTanpaNilai.join(", ")} tidak terbaca sebagai angka.`;
  } else if (nilaiKontrak === null) {
    catatan = "Nilai kontrak belum diketahui, sehingga jumlah termin tidak dapat dibandingkan.";
  } else if (seimbang) {
    catatan = "Jumlah termin sama persis dengan nilai kontrak.";
  } else {
    const arah = (selisih as number) > 0 ? "lebih besar" : "lebih kecil";
    catatan = `Jumlah termin ${arah} ${Math.abs(selisih as number).toLocaleString("id-ID")} rupiah daripada nilai kontrak.`;
  }

  return {
    jumlahBaris: termin.length,
    totalTermin,
    nilaiKontrak,
    selisih,
    seimbang,
    barisTanpaNilai,
    barisTanpaTanggal,
    catatan,
  };
}
