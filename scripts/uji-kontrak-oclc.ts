// Uji validasi kontrak terhadap kontrak sintetis berformat template OCLC 01
// (KTR/2026/0187), TANPA AI dan TANPA basis data.
//
// Kontrak ini meniru susunan dan bunyi template di folder "dokumen draft
// kontrak". Skrip ini menganggap model membaca seluruh medan dengan benar,
// yaitu menyalin frasa persis seperti di kunci jawaban, lalu menjalankan
// jalur kode yang sama dengan aplikasi:
//
//   1. setiap frasa kunci benar-benar ada di teks PDF (cocokkan), sehingga
//      lolos syarat bukti untuk medan perluBukti;
//   2. perapian medan tidak mengubah frasa yang benar;
//   3. frasa diurai menjadi angka dan tanggal (urai.ts);
//   4. lampiran dan isian template dideteksi dari teks PDF;
//   5. aturan validasi dijalankan, lalu temuannya dibandingkan dengan
//      kunci jawaban kesalahan yang ditanam.
//
// Bila uji ini lulus tetapi uji live gagal, penyebabnya ada pada bacaan
// model, bukan pada aturan.
//
// Bangkitkan PDF-nya lebih dulu: python scripts/generate_kontrak_oclc.py
// Jalankan: npx tsx scripts/uji-kontrak-oclc.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { rangkaiTeks } from "../src/lib/ekstraksi/alur";
import { MEDAN } from "../src/lib/ekstraksi/medan";
import { periksaTermin, uraiTermin } from "../src/lib/ekstraksi/termin";
import {
  tambahHari,
  uraiDasarDenda,
  uraiHari,
  uraiMasaBerlakuJaminan,
  uraiPersen,
  uraiRupiah,
  uraiTanggal,
  uraiTarifPermil,
  uraiTermasukPpn,
} from "../src/lib/ekstraksi/urai";
import { cocokkan } from "../src/lib/pdf/cocok";
import { bacaKata } from "../src/lib/pdf/kata";
import { deteksiIsianTemplate, deteksiLampiran, jalankanAturan } from "../src/lib/validasi/aturan";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}
const sama = (nama: string, dapat: unknown, harap: unknown) =>
  cek(nama, JSON.stringify(dapat) === JSON.stringify(harap), `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);
const tgl = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const BERKAS = "KTR-2026-0187-Pemeliharaan-Perpipaan-FT-Samarinda.pdf";
type Kunci = {
  medan: Record<string, string>;
  termin: { urutan: number; nilai: string; jatuh_tempo: string }[];
  validasi: { temuan: Record<string, "MERAH" | "KUNING">; lulus: string[]; lampiran_ada: string[] };
};

async function main() {
  const dir = path.resolve("public", "contoh");
  const kunci = JSON.parse(readFileSync(path.join(dir, "KTR-2026-0187.kunci.json"), "utf8")) as Kunci;
  const { halaman, kata } = await bacaKata(new Uint8Array(readFileSync(path.join(dir, BERKAS))));
  const teks = `##### Dokumen: ${BERKAS}\n${rangkaiTeks(halaman)}`;
  const m = kunci.medan;
  console.log(`Kontrak ${m.nomor_kontrak}, ${halaman.length} halaman, format template OCLC 01`);

  console.log("\n1. Frasa kunci ada di teks PDF dan lolos perapian");
  for (const def of MEDAN) {
    const nilai = m[def.kunci];
    if (nilai === undefined) {
      cek(`${def.kunci}: ada di kunci jawaban`, false);
      continue;
    }
    // Jumlah termin tertulis "4 (empat) termin"; bentuk bakunya hasil perapian.
    const dicari = def.kunci === "jumlah_termin" ? "4 (empat) termin" : nilai;
    const bukti = cocokkan(dicari, kata);
    const rapi = def.rapikan ? def.rapikan(dicari) : dicari;
    cek(`${def.kunci}: ada di PDF (halaman ${bukti.halaman ?? "-"}) dan tetap utuh setelah dirapikan`, bukti.keyakinan > 0 && rapi === nilai, rapi === nilai ? "" : `dirapikan menjadi ${JSON.stringify(rapi)}`);
  }

  console.log("\n2. Frasa template terurai menjadi angka dan tanggal");
  const nilaiKontrak = uraiRupiah(m.nilai_kontrak);
  const tanggalBerakhir = uraiTanggal(m.tanggal_berakhir);
  const masaJaminan = uraiMasaBerlakuJaminan(m.masa_berlaku_jaminan);
  sama("nilai kontrak", nilaiKontrak, 7_250_000_000);
  sama("belum termasuk PPN", uraiTermasukPpn(m.nilai_termasuk_ppn), false);
  sama("jaminan pelaksanaan dalam persen", uraiPersen(m.nilai_jaminan_pelaksanaan), 5);
  sama("masa berlaku jaminan (bunyi template: MPP ditambah 14 hari)", masaJaminan, { jenis: "SETELAH_SELESAI", hari: 14, perkiraan: false });
  sama(
    "jaminan berlaku sampai",
    tgl(masaJaminan?.jenis === "SETELAH_SELESAI" && tanggalBerakhir ? tambahHari(tanggalBerakhir, masaJaminan.hari) : null),
    "2026-09-14"
  );
  sama("tarif denda dalam permil", uraiTarifPermil(m.tarif_denda_harian), 1);
  sama("batas denda dalam persen", uraiPersen(m.batas_maksimum_denda), 5);
  sama("dasar denda sesudah PPN", uraiDasarDenda(m.dasar_perhitungan_denda), "SESUDAH_PPN");
  sama("komitmen TKDN", uraiPersen(m.komitmen_tkdn), 35);
  sama("tanggal mulai", tgl(uraiTanggal(m.tanggal_mulai)), "2026-03-02");
  sama("tanggal berakhir", tgl(tanggalBerakhir), "2026-08-31");
  sama("masa pemeliharaan (hari)", uraiHari(m.masa_pemeliharaan), 90);

  console.log("\n3. Deteksi dari teks PDF");
  const lampiranAda = deteksiLampiran(teks);
  const isianTemplate = deteksiIsianTemplate(teks);
  sama("lampiran yang ada (F sengaja tidak ada)", lampiranAda, kunci.validasi.lampiran_ada);
  sama("isian template yang tertinggal", isianTemplate.length, 3);
  for (const i of isianTemplate) console.log(`       ${i}`);

  console.log("\n4. Aturan validasi");
  const termin = uraiTermin(kunci.termin.map((t) => ({ urutan: t.urutan, nilai: t.nilai, syarat: null, jatuh_tempo: t.jatuh_tempo })));
  const hasil = jalankanAturan({
    kontrak: {
      nomor: m.nomor_kontrak,
      namaVendor: m.nama_vendor,
      nilaiKontrak,
      termasukPpn: uraiTermasukPpn(m.nilai_termasuk_ppn),
      tarifDendaPermil: uraiTarifPermil(m.tarif_denda_harian),
      batasDendaPersen: uraiPersen(m.batas_maksimum_denda),
      jaminanPersen: uraiPersen(m.nilai_jaminan_pelaksanaan),
      masaJaminan,
      dasarDenda: uraiDasarDenda(m.dasar_perhitungan_denda),
      tanggalMulai: uraiTanggal(m.tanggal_mulai),
      tanggalBerakhir,
      komitmenTkdnPersen: uraiPersen(m.komitmen_tkdn),
      lampiranAda,
      isianTemplate,
      termin: periksaTermin(termin, nilaiKontrak),
      teks: m,
    },
    fakta: [],
    efektif: [],
    dokumenTanpaTeks: [],
    namaDokumen: new Map(),
  });

  for (const t of hasil.temuan) console.log(`       ${t.tingkat.padEnd(6)} ${t.kode.padEnd(20)} ${t.uraian}`);
  const dapat = Object.fromEntries(hasil.temuan.map((t) => [t.kode, t.tingkat]));
  sama("temuan sama persis dengan kesalahan yang ditanam", dapat, kunci.validasi.temuan);
  for (const k of kunci.validasi.lulus) {
    sama(`${k} lulus`, hasil.pemeriksaan.find((p) => p.kode === k)?.status, "LULUS");
  }
  const termin3 = hasil.temuan.find((t) => t.kode === "TERMIN_SAMA_NILAI");
  cek("temuan termin menyebut selisih Rp62.500.000", !!termin3?.uraian.includes("62.500.000"), termin3?.uraian);
  const lampiran = hasil.temuan.find((t) => t.kode === "LAMPIRAN_LENGKAP");
  cek("temuan lampiran hanya menyebut F", lampiran?.uraian.startsWith("Lampiran F tidak ditemukan") ?? false, lampiran?.uraian);

  console.log(gagal === 0 ? "\nSeluruh pemeriksaan kontrak OCLC lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
