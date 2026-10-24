// Menguji aturan validasi, pengolahan keluaran AI terhadap PDF sungguhan,
// pembacaan amendemen, klien AI, dan penyimpanan berkas.
//
// Tidak butuh basis data, jaringan, maupun kunci API. Keluaran "AI" yang
// dipakai adalah keluaran tiruan yang sudah ditentukan, tetapi PDF-nya
// sungguhan (kontrak sintetis dan dokumen pendukung sintetis), supaya
// verifikasi kutipan dan pencocokan sorotan benar-benar teruji.
//
// Tiga temuan yang diketahui pada kontrak sintetis KTR/2026/0142 adalah
// kasus utamanya: Jaminan Pelaksanaan 14 hari (checklist butir 18), dasar
// denda sebelum PPN padahal nilai sudah termasuk PPN, dan Lampiran E, F, G
// yang tidak ada.
//
// Jalankan: npx tsx scripts/uji-aturan.ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  GalatKeluaranAI,
  denganPerbaikan,
  uraiKeluaran,
  type KlienAI,
  type PermintaanAI,
} from "../src/lib/ai/klien";
import { buatKlienTiruan } from "../src/lib/ai/klien-tiruan";
import { olahAmendemen, SkemaBacaAmendemen } from "../src/lib/amendemen/baca";
import { ambilPasal } from "../src/lib/amendemen/bandingkan";
import { olahKeluaran, sistemBacaPendukung } from "../src/lib/dokumen/baca-pendukung";
import { analisisBerkas, adalahPdf } from "../src/lib/dokumen/unggah";
import { rangkaiTeks } from "../src/lib/ekstraksi/alur";
import { periksaTermin } from "../src/lib/ekstraksi/termin";
import { bacaKata } from "../src/lib/pdf/kata";
import { bacaBerkas, simpanBerkas, sidikSha256 } from "../src/lib/penyimpanan";
import {
  deteksiIsianTemplate,
  deteksiLampiran,
  jalankanAturan,
  type FaktaDokumen,
  type FaktaKontrak,
  type MasukanAturan,
} from "../src/lib/validasi/aturan";
import { olahPenyebutan, pilihKetetapan } from "../src/lib/validasi/periksa-klausul";
import { faktaDariRincian, pilihDokumenKontrak, untukPeran } from "../src/lib/validasi/siapkan";

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

const T = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DIR_CONTOH = path.resolve("public", "contoh");

async function muatPdf(...bagian: string[]) {
  const data = new Uint8Array(readFileSync(path.join(DIR_CONTOH, ...bagian)));
  const { halaman, kata } = await bacaKata(Uint8Array.from(data));
  return { data, halaman, kata, teks: rangkaiTeks(halaman) };
}

// ----------------------------------------------------- bahan aturan

/** Kontrak sintetis KTR/2026/0142 apa adanya, sebagaimana hasil ekstraksinya. */
function kontrak0142(ganti: Partial<FaktaKontrak> = {}): FaktaKontrak {
  return {
    nomor: "KTR/2026/0142",
    namaVendor: "PT Sumber Jaya Abadi",
    nilaiKontrak: 4_850_000_000,
    termasukPpn: true,
    tarifDendaPermil: 1,
    batasDendaPersen: 5,
    jaminanPersen: 5,
    masaJaminan: { jenis: "SETELAH_SELESAI", hari: 14, perkiraan: false },
    dasarDenda: "SEBELUM_PPN",
    tanggalMulai: T("2026-03-15"),
    tanggalBerakhir: T("2026-09-12"),
    komitmenTkdnPersen: 42,
    lampiranAda: ["A", "B", "C", "D"],
    termin: periksaTermin(
      [1_455_000_000, 1_940_000_000, 1_455_000_000].map((n, i) => ({
        urutan: i + 1,
        nilaiTeks: null,
        nilai: n,
        syarat: "x",
        jatuhTempoTeks: null,
        jatuhTempo: T("2026-05-25"),
      })),
      4_850_000_000
    ),
    teks: {
      nilai_kontrak: "Rp4.850.000.000",
      nilai_termasuk_ppn: "sudah termasuk Pajak Pertambahan Nilai (PPN)",
      nilai_jaminan_pelaksanaan: "5% dari nilai Perjanjian",
      masa_berlaku_jaminan: "sampai dengan 14 hari kalender setelah serah terima akhir pekerjaan",
      tarif_denda_harian: "1/1000 dari nilai kontrak per hari",
      batas_maksimum_denda: "5% dari nilai kontrak",
      dasar_perhitungan_denda: "dihitung dari nilai kontrak sebelum Pajak Pertambahan Nilai",
      komitmen_tkdn: "42%",
    },
    ...ganti,
  };
}

function masukan(k: FaktaKontrak, tambahan: Partial<MasukanAturan> = {}): MasukanAturan {
  return { kontrak: k, fakta: [], efektif: [], dokumenTanpaTeks: [], namaDokumen: new Map(), ...tambahan };
}

function fakta(
  kunci: string,
  nilaiTeks: string,
  angka: number | null,
  jenisPendukung: string,
  tambahan: Partial<FaktaDokumen> = {}
): FaktaDokumen {
  return {
    dokumenId: `dok-${jenisPendukung}`,
    nama: `${jenisPendukung}.pdf`,
    jenisPendukung,
    tanggalDiIsi: T("2026-02-01"),
    tanggalEditBerkas: null,
    kunci,
    nilaiTeks,
    angka,
    tanggal: null,
    keyakinan: 1,
    ...tambahan,
  };
}

const kode = (h: ReturnType<typeof jalankanAturan>) => h.temuan.map((t) => `${t.tingkat}:${t.kode}`);
const status = (h: ReturnType<typeof jalankanAturan>, k: string) => h.pemeriksaan.find((p) => p.kode === k)?.status;

async function main() {
  // ===================================================== aturan dasar
  console.log("\nTiga temuan yang diketahui pada kontrak sintetis KTR/2026/0142");
  {
    const h = jalankanAturan(masukan(kontrak0142()));
    sama("tepat tiga temuan, merah lebih dulu", kode(h), ["MERAH:JAMINAN_MPP30", "KUNING:DENDA_DASAR_PPN", "KUNING:LAMPIRAN_LENGKAP"]);
    const jaminan = h.temuan.find((t) => t.kode === "JAMINAN_MPP30")!;
    cek("jaminan: dasarnya butir 18 checklist", jaminan.dasar.includes("butir 18"), jaminan.dasar);
    cek("jaminan: saran menyebut 30 hari kalender", (jaminan.nilaiSaran ?? "").includes("30 hari kalender"));
    sama("jaminan: sorotan dari medan masa berlaku jaminan", jaminan.medanSorotan, ["masa_berlaku_jaminan"]);
    const lampiran = h.temuan.find((t) => t.kode === "LAMPIRAN_LENGKAP")!;
    cek("lampiran: menyebut E, F, dan G", lampiran.uraian.includes("E, F, G"), lampiran.uraian);
    sama("aturan yang lulus ditandai lulus", [status(h, "TERMIN_SAMA_NILAI"), status(h, "URUTAN_TANGGAL"), status(h, "JAMINAN_NILAI"), status(h, "DENDA_MINIMAL"), status(h, "DENDA_BATAS_JAMINAN")], ["LULUS", "LULUS", "LULUS", "LULUS", "LULUS"]);
    sama(
      "aturan yang butuh dokumen pendukung dilewati, bukan lulus",
      [status(h, "TKDN_MINIMUM"), status(h, "NILAI_NEGOSIASI"), status(h, "MASA_PELAKSANAAN"), status(h, "VENDOR_AKTA")],
      ["DILEWATI", "DILEWATI", "DILEWATI", "DILEWATI"]
    );
  }

  console.log("\nBatas tiap aturan");
  {
    const j = (hari: number) => kode(jalankanAturan(masukan(kontrak0142({ masaJaminan: { jenis: "SETELAH_SELESAI", hari, perkiraan: false } }))));
    cek("jaminan 30 hari lulus", !j(30).includes("MERAH:JAMINAN_MPP30"));
    cek("jaminan 29 hari merah", j(29).includes("MERAH:JAMINAN_MPP30"));

    const tgl = (s: string) => kode(jalankanAturan(masukan(kontrak0142({ masaJaminan: { jenis: "TANGGAL", tanggal: T(s) } }))));
    cek("jaminan bertanggal tepat berakhir + 30 hari lulus", !tgl("2026-10-12").includes("MERAH:JAMINAN_MPP30"));
    cek("jaminan bertanggal sehari kurang merah", tgl("2026-10-11").includes("MERAH:JAMINAN_MPP30"));

    const hasilTanpaJaminan = jalankanAturan(masukan(kontrak0142({ masaJaminan: null, jaminanPersen: null })));
    cek("pasal jaminan tidak ditemukan menjadi kuning", kode(hasilTanpaJaminan).includes("KUNING:JAMINAN_TIDAK_DITEMUKAN"));
    cek("persen jaminan ada tetapi masa tidak terbaca dilewati", status(jalankanAturan(masukan(kontrak0142({ masaJaminan: null }))), "JAMINAN_MPP30") === "DILEWATI");

    const p = (n: number) => kode(jalankanAturan(masukan(kontrak0142({ jaminanPersen: n, batasDendaPersen: n }))));
    cek("jaminan 4% merah", p(4).includes("MERAH:JAMINAN_NILAI"));
    cek("jaminan 5% lulus", !p(5).some((x) => x.endsWith("JAMINAN_NILAI")));
    cek("jaminan 7% kuning (bukan 5 atau 10)", p(7).includes("KUNING:JAMINAN_NILAI"));
    cek("jaminan 10% lulus", !p(10).some((x) => x.endsWith("JAMINAN_NILAI")));
    cek("jaminan 11% kuning (perlu justifikasi)", p(11).includes("KUNING:JAMINAN_NILAI"));

    cek("denda 0,5 permil merah", kode(jalankanAturan(masukan(kontrak0142({ tarifDendaPermil: 0.5 })))).includes("MERAH:DENDA_MINIMAL"));
    cek("denda 1 permil lulus", !kode(jalankanAturan(masukan(kontrak0142()))).includes("MERAH:DENDA_MINIMAL"));

    cek("batas denda berbeda dari jaminan kuning", kode(jalankanAturan(masukan(kontrak0142({ jaminanPersen: 10 })))).includes("KUNING:DENDA_BATAS_JAMINAN"));

    cek("nilai tanpa PPN tetapi denda sesudah PPN kuning", kode(jalankanAturan(masukan(kontrak0142({ termasukPpn: false, dasarDenda: "SESUDAH_PPN" })))).includes("KUNING:DENDA_DASAR_PPN"));
    cek("nilai termasuk PPN dan denda sesudah PPN konsisten", !kode(jalankanAturan(masukan(kontrak0142({ dasarDenda: "SESUDAH_PPN" })))).includes("KUNING:DENDA_DASAR_PPN"));
    cek("dasar denda tidak terbaca dilewati", status(jalankanAturan(masukan(kontrak0142({ dasarDenda: null }))), "DENDA_DASAR_PPN") === "DILEWATI");

    cek("lampiran A sampai G lengkap lulus", !kode(jalankanAturan(masukan(kontrak0142({ lampiranAda: ["A", "B", "C", "D", "E", "F", "G"] })))).includes("KUNING:LAMPIRAN_LENGKAP"));
    sama("tanpa lampiran terdeteksi dilewati", status(jalankanAturan(masukan(kontrak0142({ lampiranAda: [] }))), "LAMPIRAN_LENGKAP"), "DILEWATI");
    cek("hanya A dan B: C sampai G disebut hilang", jalankanAturan(masukan(kontrak0142({ lampiranAda: ["A", "B"] }))).temuan.find((t) => t.kode === "LAMPIRAN_LENGKAP")!.uraian.includes("C, D, E, F, G"));

    const termin = periksaTermin([{ urutan: 1, nilaiTeks: null, nilai: 4_000_000_000, syarat: "x", jatuhTempoTeks: null, jatuhTempo: T("2026-05-25") }], 4_850_000_000);
    cek("jumlah termin tidak sama dengan nilai merah", kode(jalankanAturan(masukan(kontrak0142({ termin })))).includes("MERAH:TERMIN_SAMA_NILAI"));
    cek("tanggal berakhir sebelum mulai merah", kode(jalankanAturan(masukan(kontrak0142({ tanggalBerakhir: T("2026-03-01") })))).includes("MERAH:URUTAN_TANGGAL"));
  }

  console.log("\nAturan yang memakai dokumen pendukung");
  {
    const k = kontrak0142();
    const tkdn = (nilai: number, tkdnKontrak = 42, jenis = "FORM_TKDN") =>
      kode(jalankanAturan(masukan(kontrak0142({ komitmenTkdnPersen: tkdnKontrak }), { fakta: [fakta("tkdn_persen", `${nilai}%`, nilai, jenis)] })));
    cek("TKDN 42% terhadap minimum 40% lulus", !tkdn(40).includes("MERAH:TKDN_MINIMUM"));
    cek("TKDN 35% terhadap minimum 40% merah", tkdn(40, 35).includes("MERAH:TKDN_MINIMUM"));
    cek("TKDN dari dokumen yang bukan Form TKDN tidak dipakai", !tkdn(60, 42, "RKS_TOR").includes("MERAH:TKDN_MINIMUM"));

    const nego = (angka: number, ppnDok: string | null, ganti: Partial<FaktaKontrak> = {}) =>
      jalankanAturan(
        masukan(kontrak0142(ganti), {
          fakta: [fakta("nilai_total", `Rp${angka}`, angka, "BA_NEGOSIASI"), ...(ppnDok ? [fakta("keterangan_ppn", ppnDok, null, "BA_NEGOSIASI")] : [])],
        })
      );
    sama("nilai kontrak sama dengan hasil negosiasi lulus", status(nego(4_850_000_000, "sudah termasuk PPN"), "NILAI_NEGOSIASI"), "LULUS");
    sama("selisih Rp400 juta, status PPN jelas: merah", kode(nego(5_250_000_000, "sudah termasuk PPN")).filter((x) => x.endsWith("NILAI_NEGOSIASI")), ["MERAH:NILAI_NEGOSIASI"]);
    sama("selisih tetapi status PPN dokumen tidak jelas: kuning", kode(nego(5_250_000_000, null)).filter((x) => x.endsWith("NILAI_NEGOSIASI")), ["KUNING:NILAI_NEGOSIASI"]);
    sama(
      "dokumen tanpa PPN disetarakan: 4.369.369.369 ditambah PPN 11% sama dengan kontrak",
      status(nego(4_369_369_369, "belum termasuk PPN"), "NILAI_NEGOSIASI"),
      "LULUS"
    );
    const nilaiSelisih = nego(5_250_000_000, "sudah termasuk PPN").temuan.find((t) => t.kode === "NILAI_NEGOSIASI")!;
    cek("temuan nilai menyebut selisih dan saran nilai dokumen", /400\.000\.000/.test(nilaiSelisih.uraian) && /5\.250\.000\.000/.test(nilaiSelisih.nilaiSaran ?? ""), nilaiSelisih.uraian);

    const masa = (angka: number | null, dariPernyataan: number | null = null) =>
      jalankanAturan(
        masukan(k, {
          fakta: angka === null ? [] : [fakta("masa_pelaksanaan", `${angka} hari kalender`, angka, "BA_PREBID")],
          efektif: dariPernyataan === null ? [] : [{ butir: "masa pelaksanaan pekerjaan", atribut: "DURASI_HARI", satuan: "hari", nilai: dariPernyataan, dokumenId: ["d"], tanpaDasar: false, konflik: false, tanggalTakPasti: false }],
        })
      );
    sama("masa pelaksanaan 181 hari sama dengan kontrak (15 Maret sampai 12 September)", status(masa(181), "MASA_PELAKSANAAN"), "LULUS");
    sama("selisih satu hari masih dianggap sama", status(masa(182), "MASA_PELAKSANAAN"), "LULUS");
    sama("selisih sembilan hari merah", kode(masa(190)).filter((x) => x.endsWith("MASA_PELAKSANAAN")), ["MERAH:MASA_PELAKSANAAN"]);
    sama("pernyataan perubahan didahulukan dari fakta", kode(masa(181, 195)).filter((x) => x.endsWith("MASA_PELAKSANAAN")), ["MERAH:MASA_PELAKSANAAN"]);

    const akta = (nama: string) => jalankanAturan(masukan(k, { fakta: [fakta("nama_perusahaan", nama, null, "AKTA_PERUSAHAAN")] }));
    sama("nama pada akta sama persis lulus", status(akta("PT Sumber Jaya Abadi"), "VENDOR_AKTA"), "LULUS");
    sama("perbedaan tanda baca dan huruf besar lulus", status(akta("P.T. SUMBER JAYA ABADI"), "VENDOR_AKTA"), "LULUS");
    sama("nama berbeda merah", kode(akta("PT Sumber Jaya Abadi Utama")).filter((x) => x.endsWith("VENDOR_AKTA")), ["MERAH:VENDOR_AKTA"]);

    const hasilScan = jalankanAturan(masukan(k, { dokumenTanpaTeks: [{ id: "x", nama: "scan.pdf" }] }));
    cek("dokumen hasil pindai kuning dan menyebut tidak memakai OCR", hasilScan.temuan.some((t) => t.kode === "DOKUMEN_TIDAK_TERBACA" && t.uraian.includes("OCR")));

    const konflik = jalankanAturan(
      masukan(k, {
        efektif: [{ butir: "titik", atribut: "JUMLAH", satuan: null, nilai: 15, dokumenId: ["a", "b"], tanpaDasar: false, konflik: true, tanggalTakPasti: false }],
        namaDokumen: new Map([["a", "A.pdf"], ["b", "B.pdf"]]),
      })
    );
    cek("dua dokumen bernilai berbeda pada tanggal sama jadi kuning", konflik.temuan.some((t) => t.kode === "NILAI_BERTENTANGAN" && t.uraian.includes("A.pdf")));
  }

  console.log("\nDeteksi lampiran");
  sama("judul LAMPIRAN B: terdeteksi", deteksiLampiran("PASAL 1 ... LAMPIRAN A: KETENTUAN UMUM ... LAMPIRAN B: LINGKUP ... LAMPIRAN D: JANGKA WAKTU"), ["A", "B", "D"]);
  sama("kalimat rujukan tidak dianggap lampiran ada", deteksiLampiran("sebagaimana dirinci pada Lampiran B dan Lampiran C"), []);
  sama("urutan hasil selalu A sampai G", deteksiLampiran("LAMPIRAN G: x LAMPIRAN A: y"), ["A", "G"]);
  sama(
    "kepala halaman template OCLC terdeteksi tanpa titik dua",
    deteksiLampiran("=== Halaman 1 ===\nModel OCLC 01 Lampiran A 1 Office of Legal Counsel\n\n=== Halaman 2 ===\nLampiran C Judul PARAF PARAF LAMPIRAN C HARGA KONTRAK"),
    ["A", "C"]
  );
  sama(
    "daftar lampiran di Pokok-Pokok Perjanjian tidak dihitung",
    deteksiLampiran("=== Halaman 1 ===\nJudul Pekerjaan PARAF 1. A. Lampiran A : Syarat-syarat B. Lampiran B : Lingkup Pekerjaan"),
    []
  );
  sama("Lampiran A-1 bukan Lampiran A", deteksiLampiran("=== Halaman 1 ===\nLampiran A-1 Pengecualian Lampiran A"), []);
  sama("nama berkas Lampiran C.pdf tidak dihitung", deteksiLampiran("##### Dokumen: Lampiran C.pdf\n=== Halaman 1 ===\nPOKOK-POKOK PERJANJIAN"), []);
  sama("rujukan di awal halaman tanpa kepala tidak dihitung", deteksiLampiran("=== Halaman 3 ===\nsebagaimana diatur dalam Lampiran D."), []);

  console.log("\nIsian template yang tertinggal");
  sama(
    "isian berkurung dan persentase kosong tertangkap beserta halamannya",
    deteksiIsianTemplate("=== Halaman 1 ===\nadalah sebesar (nilai kontrak) ( terbilang ) belum termasuk\n\n=== Halaman 2 ===\nJaminan sebesar ….% (….. persen) dari HARGA KONTRAK"),
    ['"(nilai kontrak)" (halaman 1)', '"( terbilang )" (halaman 1)', '"….%" (halaman 2)', '"(….. persen)" (halaman 2)']
  );
  sama("tanggal kosong tertangkap", deteksiIsianTemplate("ditandatangani pada tanggal .… bulan ……….….. tahun 2022").length, 2);
  sama("bunyi yang sama hanya dicatat sekali", deteksiIsianTemplate("(Jabatan) dan (Jabatan) serta (jabatan)").length, 1);
  sama(
    "teks kontrak yang sudah lengkap tidak tertangkap",
    deteksiIsianTemplate("Jaminan sebesar 5% (lima persen). Nilai Rp1.087.500.000. Pasal 2.1. 30% prestasi. Lihat Lampiran C. PT X (\"KONTRAKTOR\")"),
    []
  );
  {
    const k = (isianTemplate?: string[]) => jalankanAturan(masukan(kontrak0142({ isianTemplate })));
    sama("isian template: teks tidak dibaca dilewati", status(k(undefined), "ISIAN_TEMPLATE"), "DILEWATI");
    sama("isian template: tidak ada isian lulus", status(k([]), "ISIAN_TEMPLATE"), "LULUS");
    const t = k(['"(nilai kontrak)" (halaman 1)']).temuan.find((x) => x.kode === "ISIAN_TEMPLATE");
    cek("isian template: ada isian jadi kuning dan disebut", t?.tingkat === "KUNING" && t.uraian.includes("(nilai kontrak)"), t?.uraian);
  }

  // ================================================ PDF sungguhan
  console.log("\nKontrak sintetis: deteksi lampiran dan pasal dari PDF sungguhan");
  const kontrakPdf = await muatPdf("KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
  sama("lampiran yang ada di KTR/2026/0142 adalah A, B, C, D", deteksiLampiran(kontrakPdf.teks), ["A", "B", "C", "D"]);
  sama("KTR/2026/0142 tidak memuat isian template", deteksiIsianTemplate(kontrakPdf.teks), []);
  const oclcPdf = await muatPdf("KTR-2026-0187-Pemeliharaan-Perpipaan-FT-Samarinda.pdf");
  sama("KTR/2026/0187 (format OCLC 01): lampiran F sengaja tidak ada", deteksiLampiran(oclcPdf.teks), ["A", "B", "C", "D", "E", "G"]);
  sama("KTR/2026/0187: tiga isian template yang ditanam tertangkap", deteksiIsianTemplate(oclcPdf.teks).length, 3);
  const pasal7 = ambilPasal(kontrakPdf.teks, "Pasal 7");
  cek("Pasal 7 diambil sampai sebelum Pasal 8", !!pasal7 && pasal7.includes("12 September 2026") && !pasal7.includes("PASAL 8"), pasal7?.slice(0, 120));
  cek("pasal yang tidak ada menghasilkan null", ambilPasal(kontrakPdf.teks, "Pasal 99") === null);
  cek("nama tanpa nomor menghasilkan null", ambilPasal(kontrakPdf.teks, "Lampiran") === null);

  // ----------------------------------------------- baca dokumen pendukung
  console.log("\nPengolahan keluaran baca dokumen pendukung (PDF sungguhan)");
  const tor1 = await muatPdf("pendukung", "0142-TOR-1.pdf");
  {
    const r = olahKeluaran(
      {
        jenis: "RKS_TOR",
        judul: "KERANGKA ACUAN KERJA (TOR)",
        nomor_dokumen: "TOR/KTR-0142/I/2026",
        tanggal_dokumen: "5 Januari 2026",
        fakta: [{ kunci: "masa_pelaksanaan", nilai: "181 hari kalender", kutipan: "Masa pelaksanaan pekerjaan adalah 181 hari kalender" }],
        pernyataan: [
          { butir: "Titik Pemeriksaan Perpipaan", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "10", satuan: "titik", kutipan: "Pemeriksaan sistem perpipaan dilakukan pada 10 (sepuluh) titik pemeriksaan." },
          { butir: "titik karangan", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "99", satuan: null, kutipan: "Pemeriksaan dilakukan pada 99 titik di seluruh terminal secara bergiliran." },
          { butir: "angka rusak", atribut: "JUMLAH", jenis: "TAMBAH", nilai: "banyak", satuan: null, kutipan: "Hasil pemeriksaan dilaporkan kepada Fungsi Peminta Pengadaan" },
        ],
      },
      tor1.kata
    );
    sama("tanggal isi diurai dari tanggal dokumen", r.tanggalDiIsi?.toISOString().slice(0, 10), "2026-01-05");
    sama("pernyataan asli terverifikasi, huruf butir dirapikan", [r.rincian.pernyataan[0].terverifikasi, r.rincian.pernyataan[0].butir, r.rincian.pernyataan[0].nilai], [true, "titik pemeriksaan perpipaan", 10]);
    sama("pernyataan karangan kutipannya tidak terverifikasi", r.rincian.pernyataan.find((p) => p.butir === "titik karangan")?.terverifikasi, false);
    cek("pernyataan dengan angka rusak dibuang", !r.rincian.pernyataan.some((p) => p.butir === "angka rusak") && r.rincian.dibuang.some((d) => d.alasan.includes("angka")));
  }
  {
    // TOR-1 tidak memuat masa pelaksanaan, jadi fakta itu memang tidak bisa diverifikasi.
    const r = olahKeluaran(
      { jenis: "RKS_TOR", judul: null, nomor_dokumen: null, tanggal_dokumen: null, fakta: [{ kunci: "masa_pelaksanaan", nilai: "181 hari kalender", kutipan: "Masa pelaksanaan pekerjaan adalah 181 hari kalender" }], pernyataan: [] },
      tor1.kata
    );
    sama("fakta yang tidak ada di dokumen: keyakinan nol dan tidak terverifikasi", [r.rincian.fakta[0].terverifikasi, r.rincian.fakta[0].keyakinan], [false, 0]);
    sama("tanggal kosong tetap kosong", r.tanggalDiIsi, null);
  }
  {
    const prebid1 = await muatPdf("pendukung", "0142-BA-Prebid-1.pdf");
    const r = olahKeluaran(
      {
        jenis: "BA_PREBID",
        judul: null,
        nomor_dokumen: null,
        tanggal_dokumen: "10 Januari 2026",
        fakta: [
          { kunci: "masa_pelaksanaan", nilai: "181 hari kalender", kutipan: "Masa pelaksanaan pekerjaan adalah 181 (seratus delapan puluh satu) hari kalender" },
          { kunci: "masa_pelaksanaan", nilai: "181 hari", kutipan: "181 (seratus delapan puluh satu) hari kalender" },
        ],
        pernyataan: [],
      },
      prebid1.kata
    );
    sama("kunci ganda: hanya satu yang disimpan", r.rincian.fakta.length, 1);
    cek("kunci ganda: yang dibuang tercatat", r.rincian.dibuang.some((d) => d.alasan.includes("kunci ganda")));
    cek("fakta terverifikasi punya kotak sorotan", (r.sorotanFakta.get("masa_pelaksanaan") ?? []).length > 0);
  }

  // ------------------------------------------- peran dari rincian tersimpan
  console.log("\nMenyiapkan masukan dari rincian tersimpan");
  {
    const rincian = olahKeluaran(
      {
        jenis: "BA_PREBID",
        judul: null,
        nomor_dokumen: null,
        tanggal_dokumen: "10 Januari 2026",
        fakta: [],
        pernyataan: [
          { butir: "titik", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "10", satuan: null, kutipan: "Pemeriksaan sistem perpipaan dilakukan pada 10 (sepuluh) titik pemeriksaan." },
          { butir: "karangan", atribut: "JUMLAH", jenis: "NILAI_BARU", nilai: "50", satuan: null, kutipan: "kalimat yang sama sekali tidak ada di dokumen ini" },
        ],
      },
      tor1.kata
    ).rincian;
    const dok = { id: "d1", nama: "d1.pdf", jenisPendukung: null, tanggalDiIsi: T("2026-01-10"), tanggalEditBerkas: null };
    const u = untukPeran(rincian, dok);
    sama("hanya pernyataan terverifikasi yang masuk penentuan peran", u.pernyataan.map((p) => p.butir), ["titik"]);
    sama("jenis dokumen diambil dari hasil baca bila belum ada", u.jenisPendukung, "BA_PREBID");
    sama("tanpa rincian: dokumen tetap ada tanpa pernyataan", untukPeran(null, dok).pernyataan, []);
    const f = faktaDariRincian(
      { ...rincian, fakta: [{ kunci: "nilai_total", label: "Nilai Total", nilai: "Rp5.250.000.000", kutipan: "x", keyakinan: 1, terverifikasi: true }, { kunci: "tkdn_persen", label: "TKDN", nilai: "40%", kutipan: "x", keyakinan: 0, terverifikasi: false }, { kunci: "tanggal_akta", label: "Tanggal Akta", nilai: "12 Januari 2019", kutipan: "x", keyakinan: 1, terverifikasi: true }] },
      dok
    );
    sama("fakta tidak terverifikasi dibuang, yang lain diurai sesuai bentuk", f.map((x) => [x.kunci, x.angka, x.tanggal?.toISOString().slice(0, 10) ?? null]), [["nilai_total", 5_250_000_000, null], ["tanggal_akta", null, "2019-01-12"]]);

    const dokumenKontrak = pilihDokumenKontrak([
      { id: "u1", bagian: null, diunggahPada: T("2026-03-01") },
      { id: "u2", bagian: null, diunggahPada: T("2026-04-01") },
      { id: "p1", bagian: "PPJ", diunggahPada: T("2026-03-01") },
      { id: "a1", bagian: "LAMPIRAN_A", diunggahPada: T("2026-03-02") },
      { id: "a2", bagian: "LAMPIRAN_A", diunggahPada: T("2026-03-09") },
    ]);
    sama("per bagian diambil unggahan terbaru", dokumenKontrak.map((d) => d.id).sort(), ["a2", "p1", "u2"]);
  }

  // ------------------------------------------------ pemeriksaan klausul
  console.log("\nPemeriksaan klausul terhadap kontrak sungguhan");
  {
    const efektif = [
      { butir: "jumlah termin pembayaran", atribut: "JUMLAH" as const, satuan: "termin", nilai: 4, dokumenId: ["prebid-2"], tanpaDasar: false, konflik: false, tanggalTakPasti: false },
      { butir: "jaminan pelaksanaan", atribut: "PERSEN" as const, satuan: "%", nilai: 5, dokumenId: ["x"], tanpaDasar: false, konflik: false, tanggalTakPasti: false },
      { butir: "masa pelaksanaan", atribut: "DURASI_HARI" as const, satuan: "hari", nilai: 181, dokumenId: ["prebid-1"], tanpaDasar: false, konflik: false, tanggalTakPasti: false },
      { butir: "titik pemeriksaan", atribut: "JUMLAH" as const, satuan: null, nilai: 7, dokumenId: ["tor"], tanpaDasar: false, konflik: true, tanggalTakPasti: false },
    ];
    const ket = pilihKetetapan(efektif, new Map([["prebid-2", "BA-Prebid-2.pdf"]]));
    sama("masa pelaksanaan dan yang berkonflik tidak diserahkan ke AI", ket.map((k) => k.butir), ["jumlah termin pembayaran", "jaminan pelaksanaan"]);

    const sumber = [{ dokumenId: "kontrak", nama: "KTR-0142.pdf", kata: kontrakPdf.kata }];
    const r = olahPenyebutan(
      {
        penyebutan: [
          { rujukan: "E1", kutipan_kontrak: "Pembayaran akan dilakukan dalam 3 termin sesuai progres fisik di lapangan", angka_di_kontrak: "3" },
          { rujukan: "E2", kutipan_kontrak: "Jaminan Pelaksanaan sebesar 5% dari nilai Perjanjian", angka_di_kontrak: "5%" },
          { rujukan: "E1", kutipan_kontrak: "Pembayaran dilakukan dalam 3 termin berdasarkan progres fisik yang diverifikasi bersama", angka_di_kontrak: "3" },
          { rujukan: "E1", kutipan_kontrak: "kontrak mewajibkan sembilan termin pembayaran di seluruh kawasan", angka_di_kontrak: "9" },
          { rujukan: "E9", kutipan_kontrak: "Jaminan Pelaksanaan sebesar 5% dari nilai Perjanjian", angka_di_kontrak: "5" },
          { rujukan: "E2", kutipan_kontrak: "Jaminan Pelaksanaan sebesar 5% dari nilai Perjanjian", angka_di_kontrak: "lima" },
        ],
      },
      ket,
      sumber
    );
    sama("hanya satu temuan: termin 3 lawan 4 (laporan ganda digabung)", r.temuan.length, 1);
    const t = r.temuan[0];
    cek("temuan bertingkat merah dan berkode klausul", t.tingkat === "MERAH" && t.kode === "KLAUSUL_BERTENTANGAN");
    cek("temuan menyebut angka kontrak dan ketetapan", t.uraian.includes("3 termin") && t.uraian.includes("4 termin") && t.nilaiSaran === "4 termin", t.uraian);
    cek("temuan memuat lokasi halaman dan dasar dokumen", /halaman \d+/.test(t.lokasi ?? "") && (t.dasar ?? "").includes("BA-Prebid-2.pdf"), `${t.lokasi} | ${t.dasar}`);
    cek("temuan membawa kotak sorotan dari kutipan yang terverifikasi", (t.sorotanLangsung?.kotak.length ?? 0) > 0 && t.sorotanLangsung?.dokumenId === "kontrak");
    sama("penyebutan yang cocok dihitung (E2 persen jaminan)", r.cocok, 1);
    cek("kutipan karangan, rujukan tak dikenal, dan angka rusak dibuang", r.dibuang.length === 3, r.dibuang.map((d) => d.alasan).join(" | "));
  }

  // ----------------------------------------------------- amendemen
  console.log("\nPengolahan keluaran baca amendemen (PDF sungguhan)");
  {
    const am1 = await muatPdf("pendukung", "0142-Amendemen-1.pdf");
    const sumber = [{ dokumenId: "am1", nama: "Amendemen-1.pdf", kata: am1.kata }];
    const dasar = {
      nomor_amendemen: "AMD-1/KTR/2026/0142",
      nomor_kontrak: "KTR/2026/0142",
      tanggal_amendemen: "3 Mei 2026",
      jenis_perubahan: ["LINGKUP", "HARGA", "HARGA"] as ("LINGKUP" | "HARGA")[],
      nilai_kontrak_baru: "Rp5.092.500.000",
      tanggal_berakhir_baru: null,
      ringkasan: "Lingkup bertambah dengan pemeliharaan manifold dan nilai kontrak naik.",
      klausul_berubah: [
        { pasal: "Pasal 3", kutipan: "nilai kontrak bertambah sebesar Rp242.500.000" },
        { pasal: "Pasal 99", kutipan: "klausul yang tidak pernah ada di dokumen amendemen ini" },
      ],
    };
    const tambah = olahAmendemen({ ...dasar, nilai_amendemen: { arah: "TAMBAH", nilai: "Rp242.500.000", kutipan: "nilai kontrak bertambah sebesar Rp242.500.000" } }, sumber);
    sama("tambah: nilai positif dari angka tertulis", tambah.nilaiAmandemen, 242_500_000);
    sama("tanggal amendemen diurai", tambah.tanggal?.toISOString().slice(0, 10), "2026-05-03");
    sama("nilai kontrak baru diurai", tambah.nilaiKontrakBaru, 5_092_500_000);
    sama("jenis perubahan tanpa duplikat", tambah.jenisPerubahan, ["LINGKUP", "HARGA"]);
    sama("klausul karangan dibuang, yang asli dipertahankan", tambah.klausul.map((k) => k.pasal), ["Pasal 3"]);
    cek("klausul karangan tercatat sebagai dibuang", tambah.dibuang.some((d) => d.alasan.includes("klausul")));

    const kurang = olahAmendemen({ ...dasar, nilai_amendemen: { arah: "KURANG", nilai: "Rp100.000.000", kutipan: null } }, sumber);
    sama("kurang: nilai negatif walau angka tertulis tanpa tanda", kurang.nilaiAmandemen, -100_000_000);
    const tetap = olahAmendemen({ ...dasar, nilai_amendemen: { arah: "TETAP", nilai: null, kutipan: null } }, sumber);
    sama("tetap: nilai nol", tetap.nilaiAmandemen, 0);
    const kosong = olahAmendemen({ ...dasar, nilai_amendemen: { arah: "TAMBAH", nilai: null, kutipan: null } }, sumber);
    cek("tambah tanpa angka: nilai kosong dan ada catatan", kosong.nilaiAmandemen === null && kosong.catatan.length > 0);
    const kutipanPalsu = olahAmendemen({ ...dasar, nilai_amendemen: { arah: "TAMBAH", nilai: "Rp242.500.000", kutipan: "kalimat yang tidak ada di dokumen mana pun" } }, sumber);
    cek("kutipan nilai tidak ditemukan: angka tetap dipakai tetapi diberi catatan", kutipanPalsu.nilaiAmandemen === 242_500_000 && kutipanPalsu.catatan.some((c) => c.includes("Kutipan")));
    const tanpaTanggal = olahAmendemen({ ...dasar, tanggal_amendemen: "tidak jelas", nilai_amendemen: { arah: "TETAP", nilai: null, kutipan: null } }, sumber);
    cek("tanggal tidak terbaca: kosong dan ada catatan", tanpaTanggal.tanggal === null && tanpaTanggal.catatan.some((c) => c.includes("Tanggal")));
    cek("skema amendemen menerima keluaran yang sah", SkemaBacaAmendemen.safeParse({ ...dasar, nilai_amendemen: { arah: "TETAP", nilai: null, kutipan: null } }).success);
  }

  // ---------------------------------------------------------- klien AI
  console.log("\nKlien AI");
  {
    const Skema = z.object({ a: z.number(), b: z.string().nullable() });
    sama("keluaran berpagar kode markdown tetap terbaca", uraiKeluaran(Skema, '```json\n{"a": 1, "b": null}\n```'), { a: 1, b: null });
    let galat1: unknown;
    try { uraiKeluaran(Skema, "bukan json"); } catch (e) { galat1 = e; }
    cek("bukan JSON menjadi GalatKeluaranAI", galat1 instanceof GalatKeluaranAI);
    let galat2: unknown;
    try { uraiKeluaran(Skema, '{"a": "bukan angka", "b": null}'); } catch (e) { galat2 = e; }
    cek("JSON tidak sesuai skema menjadi GalatKeluaranAI dengan keterangan bidang", galat2 instanceof GalatKeluaranAI && String((galat2 as Error).message).includes("a:"), String((galat2 as Error)?.message));

    // Pembungkus perbaikan: ulang SEKALI untuk keluaran tidak sah, dan jumlahkan token.
    let panggilan = 0;
    const rapuh: KlienAI = {
      nama: "rapuh",
      async selesaikan<T>(p: PermintaanAI<T>) {
        panggilan++;
        if (panggilan === 1) throw new GalatKeluaranAI("keluaran rusak", 100, 10);
        return { isi: { a: 1, b: null } as T, model: "rapuh", tokenMasuk: 200, tokenKeluar: 20 };
      },
    };
    const j = await denganPerbaikan(rapuh).selesaikan({ nama: "x", sistem: "s", pengguna: "u", skema: Skema });
    sama("diulang sekali dan token dijumlahkan", [panggilan, j.tokenMasuk, j.tokenKeluar], [2, 300, 30]);

    let panggilan2 = 0;
    const mati: KlienAI = { nama: "mati", async selesaikan() { panggilan2++; throw new Error("401 kunci salah"); } };
    let galat3: unknown;
    try { await denganPerbaikan(mati).selesaikan({ nama: "x", sistem: "s", pengguna: "u", skema: Skema }); } catch (e) { galat3 = e; }
    sama("galat selain keluaran tidak sah tidak diulang", [panggilan2, galat3 instanceof Error && galat3.message.includes("401")], [1, true]);

    let panggilan3 = 0;
    const selaluRusak: KlienAI = { nama: "rusak", async selesaikan() { panggilan3++; throw new GalatKeluaranAI("rusak terus"); } };
    let galat4: unknown;
    try { await denganPerbaikan(selaluRusak).selesaikan({ nama: "x", sistem: "s", pengguna: "u", skema: Skema }); } catch (e) { galat4 = e; }
    sama("keluaran tetap rusak setelah diulang: berhenti pada dua panggilan", [panggilan3, galat4 instanceof GalatKeluaranAI], [2, true]);

    const tiruan = buatKlienTiruan(() => ({ a: 5, b: "x" }));
    const jt = await tiruan.selesaikan({ nama: "x", sistem: "sistem", pengguna: "pengguna", skema: Skema });
    sama("klien tiruan: nama model, isi, dan permintaan terekam", [jt.model, jt.isi, tiruan.permintaan.length], ["tiruan", { a: 5, b: "x" }, 1]);
    const tiruanRusak = buatKlienTiruan(() => ({ a: "salah" }));
    let galat5: unknown;
    try { await tiruanRusak.selesaikan({ nama: "x", sistem: "s", pengguna: "u", skema: Skema }); } catch (e) { galat5 = e; }
    cek("klien tiruan tetap memvalidasi skema", galat5 instanceof GalatKeluaranAI);

    const sistem = sistemBacaPendukung();
    cek("prompt baca pendukung memuat daftar jenis, fakta, dan aturan kutipan", sistem.includes("BA_PREBID") && sistem.includes("nilai_total") && sistem.includes("PERSIS"));
    cek("prompt tidak memuat tanda pisah panjang", !new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`).test(sistem));
  }

  // ------------------------------------------------------ penyimpanan
  console.log("\nPenyimpanan berkas dan analisis PDF");
  {
    const dir = mkdtempSync(path.join(tmpdir(), "vasko-uji-"));
    const awal = process.env.VASKO_DIR_DATA;
    process.env.VASKO_DIR_DATA = dir;
    try {
      const data = new Uint8Array(readFileSync(path.join(DIR_CONTOH, "pendukung", "0142-Akta-Perusahaan.pdf")));
      const sidik = sidikSha256(data);
      cek("sidik SHA-256 64 karakter heksadesimal", /^[0-9a-f]{64}$/.test(sidik));
      const lokasi = await simpanBerkas(data);
      sama("letak berbasis sidik di bawah data/dokumen", lokasi, `data/dokumen/${sidik}.pdf`);
      sama("menyimpan berkas yang sama lagi mengembalikan letak yang sama", await simpanBerkas(data), lokasi);
      const balik = await bacaBerkas(lokasi);
      cek("isi yang dibaca kembali sama persis", sidikSha256(balik) === sidik);

      for (const jahat of ["data/../../rahasia.txt", "/etc/passwd", "../rahasia", "data/dokumen/../../../x"]) {
        let ditolak = false;
        try { await bacaBerkas(jahat); } catch { ditolak = true; }
        cek(`jalur berbahaya ditolak: ${jahat}`, ditolak);
      }
      let sidikBuruk = false;
      try { await simpanBerkas(data, "../../x"); } catch { sidikBuruk = true; }
      cek("sidik yang bukan heksadesimal ditolak", sidikBuruk);
    } finally {
      if (awal === undefined) delete process.env.VASKO_DIR_DATA;
      else process.env.VASKO_DIR_DATA = awal;
      rmSync(dir, { recursive: true, force: true });
    }

    const akta = new Uint8Array(readFileSync(path.join(DIR_CONTOH, "pendukung", "0142-Akta-Perusahaan.pdf")));
    const a = await analisisBerkas(akta);
    sama("PDF bertulisan: punya lapisan teks", [a.adaLapisanTeks, a.jumlahHalaman, a.halamanTanpaTeks], [true, 1, []]);
    const scan = new Uint8Array(readFileSync(path.join(DIR_CONTOH, "pendukung", "0142-Scan-Tanpa-Teks.pdf")));
    const s = await analisisBerkas(scan);
    sama("PDF hasil pindai: tidak punya lapisan teks, halaman 1 tanpa teks", [s.adaLapisanTeks, s.halamanTanpaTeks], [false, [1]]);
    cek("tanda tangan PDF dikenali", adalahPdf(akta) && !adalahPdf(new TextEncoder().encode("bukan pdf")));
    let bukanPdf: unknown;
    try { await analisisBerkas(new TextEncoder().encode("ini dokumen word, bukan pdf")); } catch (e) { bukanPdf = e; }
    cek("berkas bukan PDF ditolak dengan petunjuk", bukanPdf instanceof Error && bukanPdf.message.includes("PDF"), (bukanPdf as Error)?.message);
    sama("sidik dari analisis sama dengan sidik berkas", a.sidik, sidikSha256(akta));
  }

  console.log(gagal === 0 ? "\nSeluruh pemeriksaan aturan dan pengolahan AI lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
