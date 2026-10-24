// Menguji logika inti yang murni kode: penguraian teks, penentuan peran
// dokumen pendukung, perhitungan amendemen, dan harga model AI.
//
// Tidak butuh basis data, jaringan, maupun kunci API. Tiap pemeriksaan
// memakai kasus yang bisa dihitung tangan, termasuk contoh dari Pak Rigga
// (pre-bid pertama pipa 10, pre-bid kedua pipa diubah 15 atau ditambah 15).
//
// Jalankan: npx tsx scripts/uji-inti.ts
import { MEDAN, nilaiYangDipakai } from "../src/lib/ekstraksi/medan";
import {
  selisihHari,
  tambahHari,
  uraiAngka,
  uraiDasarDenda,
  uraiHari,
  uraiMasaBerlakuJaminan,
  uraiTarifPermil,
  uraiTermasukPpn,
} from "../src/lib/ekstraksi/urai";
import {
  samaButir,
  tentukanPeran,
  type DokumenUntukPeran,
  type PernyataanTerurai,
} from "../src/lib/dokumen/peran";
import { hitungAmendemen } from "../src/lib/amendemen/hitung";
import { hitungBiayaUsd } from "../src/lib/ai/harga";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}
function sama(nama: string, nyata: unknown, harap: unknown) {
  const a = JSON.stringify(nyata);
  const b = JSON.stringify(harap);
  cek(nama, a === b, a === b ? "" : `dapat ${a}, seharusnya ${b}`);
}

// ------------------------------------------------------------- penguraian
console.log("\nPenguraian teks");
sama("angka format Indonesia", uraiAngka("1.455.000"), 1455000);
sama("angka dengan koma desimal", uraiAngka("10,5"), 10.5);
sama("angka rupiah berekor koma strip", uraiAngka("Rp 4.850.000.000,-"), 4850000000);
sama("angka format Inggris", uraiAngka("1,455,000"), 1455000);
sama("angka di tengah kalimat", uraiAngka("sebanyak 15 titik"), 15);
sama("angka negatif", uraiAngka("-3"), -3);
sama("bukan angka", uraiAngka("tidak ada"), null);

sama("PPN: sudah termasuk", uraiTermasukPpn("sudah termasuk Pajak Pertambahan Nilai (PPN) serta biaya-biaya lain"), true);
sama("PPN: termasuk PPN 11%", uraiTermasukPpn("termasuk PPN 11%"), true);
sama("PPN: belum termasuk", uraiTermasukPpn("belum termasuk PPN"), false);
sama("PPN: tidak termasuk (memuat kata termasuk)", uraiTermasukPpn("tidak termasuk Pajak Pertambahan Nilai"), false);
sama("PPN: di luar PPN", uraiTermasukPpn("di luar PPN"), false);
sama("PPN: tanpa PPN", uraiTermasukPpn("Rp100.000.000 tanpa PPN"), false);
sama("PPN: tidak disebut", uraiTermasukPpn("harga tetap dan mengikat"), null);
sama("PPN: kosong", uraiTermasukPpn(null), null);

sama("tarif 1/1000 menjadi 1 permil", uraiTarifPermil("1/1000 dari nilai kontrak per hari"), 1);
sama("tarif 1/2000 menjadi 0,5 permil", uraiTarifPermil("1/2000 dari nilai kontrak per hari"), 0.5);
sama("tarif dalam simbol permil", uraiTarifPermil("1‰ per hari"), 1);
sama("tarif dalam kata permil", uraiTarifPermil("2 permil per hari"), 2);
sama("tarif tanpa angka", uraiTarifPermil("sesuai ketentuan"), null);

sama("dasar denda sebelum PPN", uraiDasarDenda("dihitung dari nilai kontrak sebelum Pajak Pertambahan Nilai"), "SEBELUM_PPN");
sama("dasar denda tidak termasuk PPN", uraiDasarDenda("dari nilai kontrak tidak termasuk PPN"), "SEBELUM_PPN");
sama("dasar denda termasuk PPN", uraiDasarDenda("dari nilai kontrak termasuk PPN"), "SESUDAH_PPN");
sama("dasar denda tidak menyebut PPN", uraiDasarDenda("dari nilai kontrak"), null);

sama(
  "jaminan: 14 hari setelah serah terima",
  uraiMasaBerlakuJaminan("sampai dengan 14 hari kalender setelah serah terima akhir pekerjaan"),
  { jenis: "SETELAH_SELESAI", hari: 14, perkiraan: false }
);
sama(
  "jaminan: 6 bulan dihitung 180 hari dan ditandai perkiraan",
  uraiMasaBerlakuJaminan("berlaku 6 (enam) bulan setelah serah terima pekerjaan"),
  { jenis: "SETELAH_SELESAI", hari: 180, perkiraan: true }
);
const jTanggal = uraiMasaBerlakuJaminan("sampai dengan 12 Oktober 2026");
cek("jaminan: tanggal mutlak", jTanggal?.jenis === "TANGGAL" && jTanggal.tanggal.toISOString().startsWith("2026-10-12"));
sama(
  "jaminan: bunyi template OCLC, MPP ditambah 30 hari",
  uraiMasaBerlakuJaminan("selama MASA PENYELESAIAN PEKERJAAN sesuai yang ditetapkan pada LAMPIRAN D KONTRAK INI, ditambah sekurang-kurangnya 30 (tiga puluh) HARI KALENDER"),
  { jenis: "SETELAH_SELESAI", hari: 30, perkiraan: false }
);
sama(
  "jaminan: bunyi template dengan tanda hubung terpisah dari PDF",
  uraiMasaBerlakuJaminan("selama MASA PENYELESAIAN PEKERJAAN, ditambah sekurang - kurangnya 14 (empat belas) HARI KALENDER"),
  { jenis: "SETELAH_SELESAI", hari: 14, perkiraan: false }
);
sama("jaminan: frasa tak dikenal", uraiMasaBerlakuJaminan("berlaku selama kontrak"), null);

sama("hari dengan terbilang", uraiHari("60 (enam puluh) hari kalender"), 60);
sama("hari dari bulan", uraiHari("3 bulan"), 90);
sama("hari kosong", uraiHari(null), null);

// Frasa karangan model yang tidak ada di PDF tidak boleh sampai ke kolom turunan.
// Contoh nyata dari uji live: model menjawab masa pemeliharaan dengan periode
// pelaksanaan, yang tidak ada di dokumen sebagai frasa.
console.log("\nNilai medan yang boleh dipakai kode");
const tanpaBukti = { nilai: "60 hari kalender", keyakinan: 0 };
const kunciTafsiran = MEDAN.filter((m) => m.perluBukti).map((m) => m.kunci);
sama(
  "lima medan ditafsirkan kode ditandai perluBukti",
  kunciTafsiran,
  ["nilai_termasuk_ppn", "nilai_jaminan_pelaksanaan", "masa_berlaku_jaminan", "dasar_perhitungan_denda", "masa_pemeliharaan"]
);
for (const kunci of kunciTafsiran) {
  sama(`${kunci}: frasa tidak ada di PDF diabaikan`, nilaiYangDipakai(kunci, tanpaBukti), null);
  sama(`${kunci}: frasa terbukti ada di PDF dipakai`, nilaiYangDipakai(kunci, { ...tanpaBukti, keyakinan: 0.97 }), "60 hari kalender");
  sama(`${kunci}: suntingan manusia menang walau tanpa bukti`, nilaiYangDipakai(kunci, { ...tanpaBukti, nilaiSuntingan: "90 hari" }), "90 hari");
}
sama("medan lama tanpa bukti dipakai seperti sebelumnya", nilaiYangDipakai("nomor_kontrak", { nilai: "KTR/2026/0142", keyakinan: 0 }), "KTR/2026/0142");
sama("suntingan kosong dari manusia tetap menang atas nilai model", nilaiYangDipakai("nomor_kontrak", { nilai: "KTR/1", nilaiSuntingan: "", keyakinan: 1 }), "");
sama("nilai kosong tetap kosong", nilaiYangDipakai("masa_pemeliharaan", { nilai: null, keyakinan: 1 }), null);

const mulai = new Date(Date.UTC(2026, 2, 15));
const akhir = new Date(Date.UTC(2026, 8, 12));
sama("selisih 15 Maret ke 12 September 2026", selisihHari(mulai, akhir), 181);
sama("tambah 30 hari", tambahHari(akhir, 30).toISOString().slice(0, 10), "2026-10-12");

// ---------------------------------------------------------- peran dokumen
console.log("\nPeran dokumen pendukung");

const T = (s: string) => new Date(`${s}T00:00:00.000Z`);
const P = (
  butir: string,
  jenis: PernyataanTerurai["jenis"],
  nilai: number,
  atribut: PernyataanTerurai["atribut"] = "JUMLAH"
): PernyataanTerurai => ({ butir, atribut, jenis, nilai, satuan: null });
const D = (
  id: string,
  tanggal: string | null,
  pernyataan: PernyataanTerurai[],
  jenisPendukung: string | null = "BA_PREBID",
  edit: string | null = null
): DokumenUntukPeran => ({
  id,
  nama: id,
  jenisPendukung,
  tanggalDiIsi: tanggal ? T(tanggal) : null,
  tanggalEditBerkas: edit ? T(edit) : null,
  pernyataan,
});
const label = (h: ReturnType<typeof tentukanPeran>, id: string) => h.peran.find((p) => p.dokumenId === id)?.label;
const efek = (h: ReturnType<typeof tentukanPeran>, butir: string) => h.efektif.find((e) => samaButir(e.butir, butir));

// Kasus Pak Rigga bagian 1: pre-bid kedua menyebut penambahan, hasilnya 25.
{
  const h = tentukanPeran([
    D("prebid-1", "2026-01-15", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 10)]),
    D("prebid-2", "2026-01-22", [P("titik pemeriksaan perpipaan", "TAMBAH", 15)]),
  ]);
  sama("penambahan: kedua dokumen komplementer", [label(h, "prebid-1"), label(h, "prebid-2")], ["KOMPLEMENTER", "KOMPLEMENTER"]);
  sama("penambahan: nilai efektif 10 ditambah 15 menjadi 25", efek(h, "titik pemeriksaan perpipaan")?.nilai, 25);
}

// Kasus Pak Rigga bagian 2: pre-bid kedua menyebut nilai pengganti, hasilnya 15.
{
  const h = tentukanPeran([
    D("prebid-1", "2026-01-15", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 10)]),
    D("prebid-2", "2026-01-22", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 15)]),
  ]);
  sama("pengganti: dokumen lama digantikan, baru utama", [label(h, "prebid-1"), label(h, "prebid-2")], ["DIGANTIKAN", "UTAMA"]);
  sama("pengganti: dokumen lama menyebut penggantinya", h.peran[0].digantikanOlehId, "prebid-2");
  sama("pengganti: dokumen utama tidak menyebut pengganti", h.peran[1].digantikanOlehId, null);
  sama("pengganti: nilai efektif 15", efek(h, "titik pemeriksaan perpipaan")?.nilai, 15);
}

// Urutan masukan tidak boleh memengaruhi hasil.
{
  const h = tentukanPeran([
    D("prebid-2", "2026-01-22", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 15)]),
    D("prebid-1", "2026-01-15", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 10)]),
  ]);
  sama("urutan masukan terbalik tidak mengubah hasil", [label(h, "prebid-1"), label(h, "prebid-2")], ["DIGANTIKAN", "UTAMA"]);
}

// Penimpaan sebagian: dokumen lama masih menyumbang butir lain.
{
  const h = tentukanPeran([
    D("a", "2026-01-15", [P("titik pemeriksaan perpipaan", "NILAI_BARU", 10), P("masa pelaksanaan", "NILAI_BARU", 180, "DURASI_HARI")]),
    D("b", "2026-01-22", [P("masa pelaksanaan", "NILAI_BARU", 181, "DURASI_HARI")]),
  ]);
  sama("penimpaan sebagian: kedua dokumen komplementer", [label(h, "a"), label(h, "b")], ["KOMPLEMENTER", "KOMPLEMENTER"]);
  sama("penimpaan sebagian: butir yang ditimpa berubah", efek(h, "masa pelaksanaan")?.nilai, 181);
  sama("penimpaan sebagian: butir lain tetap", efek(h, "titik pemeriksaan perpipaan")?.nilai, 10);
  cek("penimpaan sebagian: alasan menyebut butir yang diganti", /1 butir isinya sudah diganti/.test(h.peran[0].alasan), h.peran[0].alasan);
}

// Jenis berbeda tidak saling memengaruhi.
{
  const h = tentukanPeran([
    D("prebid", "2026-01-15", [P("titik", "NILAI_BARU", 10)], "BA_PREBID"),
    D("nego", "2026-02-01", [P("titik", "NILAI_BARU", 12)], "BA_NEGOSIASI"),
  ]);
  sama("jenis berbeda: masing-masing utama", [label(h, "prebid"), label(h, "nego")], ["UTAMA", "UTAMA"]);
}

// Dokumen tunggal, dan dokumen tanpa jenis atau berjenis LAINNYA.
{
  const h = tentukanPeran([D("tunggal", "2026-01-15", [], "AKTA_PERUSAHAAN"), D("x", null, [], null), D("y", null, [], "LAINNYA")]);
  sama("dokumen tunggal dan tanpa pasangan: utama semua", h.peran.map((p) => p.label), ["UTAMA", "UTAMA", "UTAMA"]);
}

// Tanggal isi sama: tanggal berkas yang menentukan.
{
  const h = tentukanPeran([
    D("lama", "2026-01-15", [P("titik", "NILAI_BARU", 10)], "BA_PREBID", "2026-01-16"),
    D("baru", "2026-01-15", [P("titik", "NILAI_BARU", 15)], "BA_PREBID", "2026-01-20"),
  ]);
  sama("tanggal isi sama: tanggal berkas menentukan urutan", [label(h, "lama"), label(h, "baru")], ["DIGANTIKAN", "UTAMA"]);
}

// Tanggal isi sama dan tanggal berkas sama dengan nilai berbeda: konflik, tidak ada yang digantikan.
{
  const h = tentukanPeran([
    D("p", "2026-01-15", [P("titik", "NILAI_BARU", 10)], "BA_PREBID", "2026-01-16"),
    D("q", "2026-01-15", [P("titik", "NILAI_BARU", 15)], "BA_PREBID", "2026-01-16"),
  ]);
  sama("tidak terbedakan: tidak ada yang digantikan", [label(h, "p"), label(h, "q")], ["KOMPLEMENTER", "KOMPLEMENTER"]);
  sama("tidak terbedakan: konflik ditandai", efek(h, "titik")?.konflik, true);
}

// Tanggal isi tidak terbaca: tidak boleh menjadi dasar menggugurkan dokumen lain.
{
  const h = tentukanPeran([
    D("tanpa-tanggal", null, [P("titik", "NILAI_BARU", 10)]),
    D("bertanggal", "2026-01-22", [P("titik", "NILAI_BARU", 15)]),
  ]);
  sama("tanpa tanggal: tidak pernah digantikan", [label(h, "tanpa-tanggal"), label(h, "bertanggal")], ["KOMPLEMENTER", "KOMPLEMENTER"]);
  sama("tanpa tanggal: nilai efektif memakai yang bertanggal", efek(h, "titik")?.nilai, 15);
  sama("tanpa tanggal: hasil ditandai tidak pasti", efek(h, "titik")?.tanggalTakPasti, true);
}

// Pengurangan, dan penambahan tanpa nilai dasar.
{
  const h = tentukanPeran([
    D("p", "2026-01-15", [P("titik", "NILAI_BARU", 10)]),
    D("q", "2026-01-22", [P("titik", "KURANG", 3)]),
    D("r", "2026-01-25", [P("unit baru", "TAMBAH", 2)]),
  ]);
  sama("pengurangan: 10 dikurangi 3 menjadi 7", efek(h, "titik")?.nilai, 7);
  sama("penambahan tanpa dasar ditandai", efek(h, "unit baru")?.tanpaDasar, true);
}

// Tiga dokumen: yang ketiga hanya menimpa yang pertama.
{
  const h = tentukanPeran([
    D("p1", "2026-01-10", [P("titik", "NILAI_BARU", 10)]),
    D("p2", "2026-01-15", [P("unit", "NILAI_BARU", 4)]),
    D("p3", "2026-01-20", [P("titik", "NILAI_BARU", 12)]),
  ]);
  sama("tiga dokumen: p1 digantikan p3, p2 dan p3 komplementer", [label(h, "p1"), label(h, "p2"), label(h, "p3")], ["DIGANTIKAN", "KOMPLEMENTER", "KOMPLEMENTER"]);
  sama("tiga dokumen: p1 menyebut p3 sebagai penggantinya", h.peran[0].digantikanOlehId, "p3");
}

// Dokumen sejenis tanpa pernyataan: tetap saling melengkapi.
{
  const h = tentukanPeran([D("k1", "2026-01-10", []), D("k2", "2026-01-20", [])]);
  sama("tanpa pernyataan: komplementer", h.peran.map((p) => p.label), ["KOMPLEMENTER", "KOMPLEMENTER"]);
}

cek("butir sama walau kata disusun lain", samaButir("titik pemeriksaan perpipaan", "pemeriksaan titik sistem perpipaan"));
cek("butir sama pada singkatan yang termuat", samaButir("pipa", "pipa baja karbon"));
cek("butir berbeda tidak dianggap sama", !samaButir("pipa baja", "kabel listrik"));

// ------------------------------------------------------------- amendemen
console.log("\nPerhitungan amendemen");
const KA = 4_850_000_000;

{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 242_500_000 });
  sama("naik 5%: KT = KA + NA", h.nilaiSetelah, 5_092_500_000);
  sama("naik 5%: persen amendemen", h.persenAmandemen, 5);
  sama("naik 5%: cukup justifikasi pejabat", h.tingkat, "JUSTIFIKASI_PEJABAT");
  sama("naik 5%: belum mendekati batas", h.mendekatiBatas, false);
  sama("naik 5%: tanpa peringatan", h.peringatan.length, 0);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 388_000_000 });
  sama("naik 8%: mendekati batas 10%", [h.persenAmandemen, h.mendekatiBatas, h.tingkat], [8, true, "JUSTIFIKASI_PEJABAT"]);
  sama("naik 8%: ada satu peringatan", h.peringatan.length, 1);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 500_000_000 });
  sama("naik 10,31%: wajib izin prinsip", [h.persenAmandemen, h.tingkat], [10.31, "IZIN_PRINSIP"]);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 485_000_000 });
  sama("tepat 10%: belum melampaui batas", [h.persenAmandemen, h.tingkat], [10, "JUSTIFIKASI_PEJABAT"]);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: -100_000_000 });
  sama("nilai turun: KT berkurang", h.nilaiSetelah, 4_750_000_000);
  sama("nilai turun: tanpa syarat tambahan dan tanpa peringatan", [h.tingkat, h.peringatan.length, h.nilaiTurun], [null, 0, true]);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [300_000_000], nilaiAmandemenBaru: 250_000_000 });
  sama("akumulasi: 6,19% lalu 5,15% menjadi 11,34%", h.persenKumulatifBersih, 11.34);
  sama("akumulasi: melampaui batas walau tiap amendemen di bawahnya", h.tingkat, "IZIN_PRINSIP");
  sama("akumulasi: KT sebelum dan sesudah", [h.nilaiSebelum, h.nilaiSetelah], [5_150_000_000, 5_400_000_000]);
}
{
  const bersih = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [400_000_000, -400_000_000], nilaiAmandemenBaru: 100_000_000 });
  const kotor = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [400_000_000, -400_000_000], nilaiAmandemenBaru: 100_000_000, akumulasi: "KOTOR" });
  sama("akumulasi bersih: naik turun saling menghapus", bersih.persenKumulatifBersih, 2.06);
  sama("akumulasi kotor dilaporkan berdampingan", bersih.persenKumulatifKotor, 18.56);
  sama("akumulasi kotor menentukan bila dipilih", [bersih.tingkat, kotor.tingkat], ["JUSTIFIKASI_PEJABAT", "IZIN_PRINSIP"]);
}
{
  const h = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 970_000_000, konstruksiTerintegrasi: true });
  sama("konstruksi terintegrasi: 20% masih di bawah batas 30%", [h.persenAmandemen, h.batasPersen, h.tingkat], [20, 30, "JUSTIFIKASI_PEJABAT"]);
  const h2 = hitungAmendemen({ nilaiAwal: KA, amendemenSebelumnya: [], nilaiAmandemenBaru: 1_212_500_000, konstruksiTerintegrasi: true });
  sama("konstruksi terintegrasi: 25% mendekati batas", h2.mendekatiBatas, true);
}
{
  const h = hitungAmendemen({ nilaiAwal: 0, amendemenSebelumnya: [], nilaiAmandemenBaru: 100 });
  sama("nilai awal tidak ada: persen kosong dan ada peringatan", [h.persenAmandemen, h.tingkat, h.peringatan.length], [null, null, 1]);
}

// --------------------------------------------------------------- biaya AI
console.log("\nBiaya AI");
cek("GPT-6 Luna: 50 ribu masuk dan 2 ribu keluar", Math.abs((hitungBiayaUsd("gpt-6-luna", 50_000, 2_000) ?? -1) - 0.006) < 1e-9);
cek("model gratis OpenRouter bernilai nol, bukan tidak diketahui", hitungBiayaUsd("z-ai/glm-5.2:free", 1000, 1000) === 0);
cek("klien tiruan bernilai nol", hitungBiayaUsd("tiruan", 1000, 1000) === 0);
cek("model tidak dikenal bernilai null, bukan nol", hitungBiayaUsd("model-misterius", 1000, 1000) === null);

console.log(gagal === 0 ? "\nSeluruh pemeriksaan logika inti lulus." : `\n${gagal} pemeriksaan GAGAL.`);
process.exit(gagal === 0 ? 0 : 1);
