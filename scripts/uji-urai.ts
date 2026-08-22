// Kasus uji pengurai nilai. Tidak menyentuh basis data maupun model, jadi
// cepat dan bebas biaya.
//
// Jalankan: npx tsx scripts/uji-urai.ts
import { uraiRupiah, uraiPersen, uraiCacah, uraiTanggal, keSlug } from "../src/lib/ekstraksi/urai";

let gagal = 0;
function uji(nama: string, dapat: unknown, harap: unknown) {
  const a = dapat instanceof Date ? dapat.toISOString() : dapat;
  const b = harap instanceof Date ? harap.toISOString() : harap;
  const ok = a === b;
  if (!ok) gagal++;
  console.log(`  ${ok ? "OK   " : "GAGAL"} ${nama.padEnd(46)} ${JSON.stringify(a)}`);
  if (!ok) console.log(`         harap ${JSON.stringify(b)}`);
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

console.log("Rupiah");
uji("Rp12.400.000.000", uraiRupiah("Rp12.400.000.000"), 12_400_000_000);
uji("Rp12.400.000.000,00", uraiRupiah("Rp12.400.000.000,00"), 12_400_000_000);
uji("Rp 4.850.000.000 dengan spasi", uraiRupiah("Rp 4.850.000.000"), 4_850_000_000);
uji("nilai di tengah kalimat", uraiRupiah("sebesar Rp1.455.000.000,- (satu)"), 1_455_000_000);
uji("bukan rupiah", uraiRupiah("tiga miliar"), null);
uji("null masuk", uraiRupiah(null), null);

console.log("\nPersen");
uji("38%", uraiPersen("38%"), 38);
uji("minimal 38 % berspasi", uraiPersen("minimal 38 %"), 38);
uji("desimal koma", uraiPersen("37,5%"), 37.5);
uji("tanpa persen", uraiPersen("38"), null);

console.log("\nCacah");
uji("5 termin", uraiCacah("5 termin"), 5);
uji("angka saja", uraiCacah("3"), 3);
uji("dieja dalam kurung", uraiCacah("5 (lima) termin"), 5);
uji("tanpa angka", uraiCacah("beberapa termin"), null);

console.log("\nTanggal");
uji("20 April 2026", uraiTanggal("20 April 2026"), utc(2026, 4, 20));
uji("5 Oktober 2026", uraiTanggal("5 Oktober 2026"), utc(2026, 10, 5));
uji("singkatan bulan", uraiTanggal("12 Sep 2026"), utc(2026, 9, 12));
uji("huruf besar campur", uraiTanggal("15 MARET 2026"), utc(2026, 3, 15));
uji("bentuk angka", uraiTanggal("20-04-2026"), utc(2026, 4, 20));
uji("bulan tidak dikenal", uraiTanggal("20 Aprel 2026"), null);
// Tanggal yang tidak ada harus ditolak, bukan digeser diam-diam ke 1 Mei.
uji("31 April ditolak", uraiTanggal("31 April 2026"), null);
uji("tanpa tanggal", uraiTanggal("segera"), null);

console.log("\nSlug");
uji("KTR/2026/0163", keSlug("KTR/2026/0163"), "KTR-2026-0163");
uji("tanda baca beruntun", keSlug("KTR//2026//0163"), "KTR-2026-0163");

console.log(gagal === 0 ? "\nSeluruh kasus uji lulus." : `\n${gagal} kasus uji GAGAL.`);
process.exit(gagal === 0 ? 0 : 1);
