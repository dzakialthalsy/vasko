// Perhitungan nilai amendemen. Murni kode: tidak ada AI dan tidak ada basis data.
//
// Dasar aturannya Checklist Kontrak dan Amandemen butir 66 sampai 70
// (TKO B3.2.4-04 Pasal 16.9):
//
//   KT = KA + NA     nilai kontrak total sama dengan nilai kontrak awal
//                    ditambah nilai amendemen
//   NA <= 10%        (30% untuk konstruksi terintegrasi): cukup justifikasi
//                    pejabat berwenang
//   NA >  10%        wajib Izin Prinsip dari pejabat satu tingkat di atasnya
//   butir 70         persentase seluruh amendemen dijumlahkan terhadap nilai
//                    kontrak AWAL, dan nilai kumulatif yang melebihi batas
//                    juga memerlukan Izin Prinsip
//
// Arahan Pak Rahman 9 Oktober: amendemen mengenal "tambah kurang". Bila
// nilainya turun, tidak perlu keterangan apa pun dan prosesnya dilanjutkan.
//
// Yang BELUM diketahui dan sengaja tidak ditebak:
//   - Rentang otorisasi tiap pejabat. Tanpa itu, pilihan antara justifikasi
//     pejabat semula dan pejabat baru (butir 67 dan 68) tidak bisa ditentukan
//     di sini, jadi hasilnya hanya menyebut "justifikasi pejabat berwenang".
//   - Apakah akumulasi dihitung bersih (+8% lalu -8% menjadi 0) atau kotor.
//     Bawaannya bersih, dan keduanya selalu dilaporkan.

/** Batas persentase untuk kontrak biasa. */
export const BATAS_PERSEN_BIASA = 10;
/** Batas persentase untuk konstruksi terintegrasi. */
export const BATAS_PERSEN_KONSTRUKSI_TERINTEGRASI = 30;
/**
 * Peringatan "mendekati batas" muncul saat akumulasi mencapai bagian ini dari
 * batas. Angka 80% adalah USULAN tim, belum divalidasi ke Pertamina. Angka
 * persis yang disebut di rekaman bimbingan 25 September kurang jelas.
 */
export const AMBANG_MENDEKATI_BATAS = 0.8;

export type TingkatOtorisasi = "JUSTIFIKASI_PEJABAT" | "IZIN_PRINSIP";

export type MasukanHitung = {
  /** Nilai kontrak awal (KA), dalam rupiah. */
  nilaiAwal: number;
  /** Nilai amendemen (NA) dari semua amendemen sebelumnya, boleh negatif. */
  amendemenSebelumnya: number[];
  /** Nilai amendemen yang sedang dihitung (NA), boleh negatif. */
  nilaiAmandemenBaru: number;
  konstruksiTerintegrasi?: boolean;
  /** Cara menjumlah persentase seluruh amendemen. Bawaan BERSIH. */
  akumulasi?: "BERSIH" | "KOTOR";
};

export type HasilHitung = {
  /** KT sebelum amendemen ini. */
  nilaiSebelum: number;
  /** KT sesudah amendemen ini: KA ditambah seluruh NA. */
  nilaiSetelah: number;
  /** NA amendemen ini terhadap KA, dalam persen. Null bila KA tidak valid. */
  persenAmandemen: number | null;
  persenKumulatifBersih: number | null;
  persenKumulatifKotor: number | null;
  batasPersen: number;
  /** Null bila nilai tidak naik: tidak ada syarat tambahan. */
  tingkat: TingkatOtorisasi | null;
  mendekatiBatas: boolean;
  nilaiTurun: boolean;
  peringatan: string[];
};

/** Membulatkan persen ke dua desimal supaya tampil dan dibandingkan stabil. */
const bulat2 = (n: number) => Math.round(n * 100) / 100;

export function hitungAmendemen(m: MasukanHitung): HasilHitung {
  const batas = m.konstruksiTerintegrasi ? BATAS_PERSEN_KONSTRUKSI_TERINTEGRASI : BATAS_PERSEN_BIASA;
  const jumlahSebelum = m.amendemenSebelumnya.reduce((a, n) => a + n, 0);
  const nilaiSebelum = m.nilaiAwal + jumlahSebelum;
  const nilaiSetelah = nilaiSebelum + m.nilaiAmandemenBaru;
  const nilaiTurun = m.nilaiAmandemenBaru < 0;

  const dasarValid = Number.isFinite(m.nilaiAwal) && m.nilaiAwal > 0;
  if (!dasarValid) {
    return {
      nilaiSebelum,
      nilaiSetelah,
      persenAmandemen: null,
      persenKumulatifBersih: null,
      persenKumulatifKotor: null,
      batasPersen: batas,
      tingkat: null,
      mendekatiBatas: false,
      nilaiTurun,
      peringatan: ["Nilai kontrak awal belum diketahui, jadi persentase dan batas otorisasi tidak dapat dihitung."],
    };
  }

  const persenAmandemen = bulat2((m.nilaiAmandemenBaru / m.nilaiAwal) * 100);
  const semua = [...m.amendemenSebelumnya, m.nilaiAmandemenBaru];
  const persenKumulatifBersih = bulat2((semua.reduce((a, n) => a + n, 0) / m.nilaiAwal) * 100);
  const persenKumulatifKotor = bulat2((semua.reduce((a, n) => a + Math.abs(n), 0) / m.nilaiAwal) * 100);

  // Nilai turun atau tetap: tidak ada syarat tambahan, tidak ada peringatan.
  if (m.nilaiAmandemenBaru <= 0) {
    return {
      nilaiSebelum,
      nilaiSetelah,
      persenAmandemen,
      persenKumulatifBersih,
      persenKumulatifKotor,
      batasPersen: batas,
      tingkat: null,
      mendekatiBatas: false,
      nilaiTurun,
      peringatan: [],
    };
  }

  const kumulatif = m.akumulasi === "KOTOR" ? persenKumulatifKotor : persenKumulatifBersih;
  // Yang menentukan adalah yang terbesar dari NA amendemen ini dan akumulasi,
  // supaya syarat tidak terlewat karena amendemen penurunan sebelumnya.
  const acuan = Math.max(persenAmandemen, kumulatif);

  const peringatan: string[] = [];
  let tingkat: TingkatOtorisasi;
  let mendekatiBatas = false;

  if (acuan > batas) {
    tingkat = "IZIN_PRINSIP";
    peringatan.push(
      `Kenaikan ${acuan.toLocaleString("id-ID")}% melampaui batas ${batas}%. Wajib dilengkapi Izin Prinsip dari pejabat satu tingkat di atas pejabat yang menandatangani amendemen.`
    );
  } else {
    tingkat = "JUSTIFIKASI_PEJABAT";
    if (acuan >= batas * AMBANG_MENDEKATI_BATAS) {
      mendekatiBatas = true;
      peringatan.push(
        `Kenaikan ${acuan.toLocaleString("id-ID")}% sudah mendekati batas ${batas}%. Amendemen berikutnya bisa memerlukan Izin Prinsip.`
      );
    }
  }

  return {
    nilaiSebelum,
    nilaiSetelah,
    persenAmandemen,
    persenKumulatifBersih,
    persenKumulatifKotor,
    batasPersen: batas,
    tingkat,
    mendekatiBatas,
    nilaiTurun,
    peringatan,
  };
}
