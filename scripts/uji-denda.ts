// Kasus uji Formula 3.1, memenuhi baris "Uji aturan perhitungan denda" pada
// Tabel 3.6. Kriteria lulusnya: hasil sistem identik dengan perhitungan
// manual atas sekumpulan kasus uji yang disepakati.
//
// Angka harapan di bawah dihitung tangan, bukan disalin dari keluaran program.
// Jalankan: npx tsx scripts/uji-denda.ts
import { hitungDenda } from "../src/lib/denda";

const NILAI = 4_850_000_000; // KTR/2026/0142
let gagal = 0;

function uji(nama: string, dapat: number, harap: number) {
  const ok = dapat === harap;
  if (!ok) gagal++;
  console.log(
    `  ${ok ? "OK   " : "GAGAL"} ${nama}\n         dapat ${dapat.toLocaleString("id-ID")}, harap ${harap.toLocaleString("id-ID")}`
  );
}

// 4.850.000.000 / 1000 = 4.850.000 per hari. Batas 5% = 242.500.000.
// Ambang tersentuh pada hari ke 242.500.000 / 4.850.000 = 50 tepat.
uji("tanpa keterlambatan", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 0 }).denda, 0);
uji("terlambat 1 hari", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 1 }).denda, 4_850_000);
uji("terlambat 10 hari", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 10 }).denda, 48_500_000);
uji("terlambat 49 hari", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 49 }).denda, 237_650_000);
uji("terlambat 50 hari, tepat di ambang", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 50 }).denda, 242_500_000);
uji("terlambat 51 hari, tertahan ambang", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 51 }).denda, 242_500_000);
uji("terlambat 400 hari, tetap tertahan", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 400 }).denda, 242_500_000);
uji("hari negatif diperlakukan nol", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: -5 }).denda, 0);
uji("hari pecahan dibulatkan ke bawah", hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 2.9 }).denda, 9_700_000);

const h50 = hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 50 });
const h49 = hitungDenda({ nilaiKontrak: NILAI, hariTerlambat: 49 });
console.log(
  `  ${h50.menyentuhBatas && !h49.menyentuhBatas ? "OK   " : "GAGAL"} penanda menyentuhBatas menyala tepat di hari ke 50`
);
if (!(h50.menyentuhBatas && !h49.menyentuhBatas)) gagal++;
uji("hari menuju batas", h50.hariMenujuBatas, 50);
uji("tambahan per hari", h50.tambahanPerHari, 4_850_000);

console.log(gagal === 0 ? "\nSeluruh kasus uji lulus." : `\n${gagal} kasus uji GAGAL.`);
process.exit(gagal === 0 ? 0 : 1);
