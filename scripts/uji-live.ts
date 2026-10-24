// Uji LIVE seluruh alur AI: baca kontrak, simpan, baca dokumen pendukung,
// validasi, dan amendemen, dengan MODEL SUNGGUHAN dari penyedia yang diatur di
// .env.local (EKSTRAKSI_PENYEDIA).
//
// Skrip ini HANYA membaca dokumen sintetis dari public/contoh. Jangan
// mengarahkannya ke dokumen Pertamina yang sebenarnya: jalur gratis
// (OpenRouter) boleh memakai data yang dikirim ke sana. Data disimpan di
// skema PostgreSQL sementara yang dibuang di akhir, jadi skema public tidak
// tersentuh.
//
// Berbeda dari uji-basisdata.ts yang memakai AI tiruan dan hasilnya pasti,
// keluaran model bisa berbeda tiap dijalankan. Karena itu tiap pemeriksaan
// diberi tanda apakah hasilnya pasti (dari aturan kode) atau bergantung model.
// Pemeriksaan yang bergantung model yang gagal adalah informasi tentang
// kualitas model, bukan selalu tanda ada kesalahan di kode.
//
// Karena memanggil model, skrip ini lambat dan memakan kuota. Wajib --live.
//
// Untuk memeriksa alurnya saja tanpa kuota (jawaban tiruan, bukan model
// sungguhan), jalankan scripts/server-ai-palsu.ts lebih dulu. Caranya ada di
// berkas itu.
//
// Jalankan:
//   npx tsx --env-file=.env.local scripts/uji-live.ts --live mudah
//   npx tsx --env-file=.env.local scripts/uji-live.ts --live sulit
//   npx tsx --env-file=.env.local scripts/uji-live.ts --live oclc
//   npx tsx --env-file=.env.local scripts/uji-live.ts --live semua
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pilihKlien } from "../src/lib/ai";
import { unggahAmendemen } from "../src/lib/amendemen/unggah";
import { unggahDokumen } from "../src/lib/dokumen/unggah";
import { jalankanEkstraksi } from "../src/lib/ekstraksi/alur";
import { buatPenyediaDariKlien } from "../src/lib/ekstraksi/penyedia/dari-klien";
import { simpanKontrak, type MedanMasuk, type TerminMasuk } from "../src/lib/ekstraksi/simpan";
import { uraiRupiah, uraiTanggal } from "../src/lib/ekstraksi/urai";
import { prisma } from "../src/lib/prisma";
import { jalankanValidasi } from "../src/lib/validasi/jalankan";
import { rincianDariJson } from "../src/lib/validasi/siapkan";
import { buangSkema, buatSkema, namaSkemaBaru, terapkanMigrasi } from "./lib/skema-uji";

let gagal = 0;
const gagalBergantungModel: string[] = [];

/** pasti: hasil ditentukan kode. Bukan pasti: bergantung pada apa yang dibaca model. */
function cek(nama: string, lulus: boolean, catatan = "", pasti = true) {
  if (!lulus) {
    gagal++;
    if (!pasti) gagalBergantungModel.push(nama);
  }
  const label = pasti ? "" : " [bergantung model]";
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${label}${catatan ? `  (${catatan})` : ""}`);
}

const DIR_CONTOH = path.resolve("public", "contoh");
const muat = (...b: string[]) => new Uint8Array(readFileSync(path.join(DIR_CONTOH, ...b)));
const detik = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(0)} detik`;
const tgl = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

type Kunci = { medan: Record<string, string>; termin: { urutan: number; nilai: string; jatuh_tempo: string }[] };

/** Nilai yang SEHARUSNYA tersimpan di baris kontrak, ditulis tangan dari membaca PDF contoh. */
const HARAP = {
  mudah: {
    berkas: "KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf",
    kunci: "KTR-2026-0142.kunci.json",
    termasukPpn: true,
    nilaiJaminan: 242_500_000, // 5% dari Rp4.850.000.000
    jaminanSampai: "2026-09-26", // 14 hari setelah berakhir 12 September
    pemeliharaanHari: null as number | null,
    tkdn: 42,
    tarifPermil: 1,
    batasDenda: 5,
    mulai: "2026-03-15",
    berakhir: "2026-09-12",
  },
  sulit: {
    berkas: "KTR-2026-0163-Konstruksi-Tangki-Timbun-Samarinda.pdf",
    kunci: "KTR-2026-0163.kunci.json",
    termasukPpn: true,
    nilaiJaminan: 620_000_000, // 5% dari Rp12.400.000.000
    jaminanSampai: null as string | null, // pasal jaminan tidak menyebut masa berlaku
    pemeliharaanHari: 180 as number | null,
    tkdn: 38,
    tarifPermil: 1,
    batasDenda: 10,
    mulai: "2026-04-20",
    berakhir: "2026-10-05",
  },
  // Kontrak berformat template OCLC 01 (dokumen draft kontrak), dengan lima
  // kesalahan yang ditanam. Lihat scripts/generate_kontrak_oclc.py.
  oclc: {
    berkas: "KTR-2026-0187-Pemeliharaan-Perpipaan-FT-Samarinda.pdf",
    kunci: "KTR-2026-0187.kunci.json",
    termasukPpn: false,
    nilaiJaminan: 362_500_000, // 5% dari Rp7.250.000.000
    jaminanSampai: "2026-09-14" as string | null, // MPP ditambah 14 hari kalender
    pemeliharaanHari: 90 as number | null,
    tkdn: 35,
    tarifPermil: 1,
    batasDenda: 5,
    mulai: "2026-03-02",
    berakhir: "2026-08-31",
  },
} as const;

type Set = keyof typeof HARAP;

async function ujiBacaKontrak(set: Set, penggunaId: string): Promise<string> {
  const h = HARAP[set];
  const kunci = JSON.parse(readFileSync(path.join(DIR_CONTOH, h.kunci), "utf8")) as Kunci;
  console.log(`\nBaca kontrak ${set} (${h.berkas})`);

  const pdf = muat(h.berkas);
  const t0 = Date.now();
  // Ekstraksi lewat klien AI umum yang sama dengan validasi dan amendemen, bukan
  // lewat penyedia OpenRouter lama, supaya yang diuji satu jalur kode yang sama
  // dengan jalur OpenAI di produksi.
  const hasil = await jalankanEkstraksi(Uint8Array.from(pdf), { penyedia: buatPenyediaDariKlien(pilihKlien()) });
  console.log(`  Model ${hasil.model}, ${hasil.halaman.length} halaman, token ${hasil.tokenMasukan}/${hasil.tokenKeluaran}, ${detik(t0)}`);
  cek("hasil berasal dari model, bukan tiruan", !hasil.tiruan, hasil.alasanTiruan ?? "");

  const tanpaBukti = hasil.medan.filter((m) => m.nilai && m.keyakinan === 0).map((m) => m.kunci);
  cek("setiap nilai dari model ditemukan di teks PDF", tanpaBukti.length === 0, tanpaBukti.join(", "), false);
  for (const m of hasil.medan) {
    console.log(`     ${m.kunci.padEnd(26)} ${String(Math.round(m.keyakinan * 100)).padStart(3)}%  h${String(m.halaman ?? "-").padStart(2)}  ${JSON.stringify(m.nilai)}`);
  }

  const medan: MedanMasuk[] = hasil.medan.map((m) => ({
    kunci: m.kunci,
    nilai: m.nilai,
    keyakinan: m.keyakinan,
    halaman: m.halaman,
    kotak: m.kotak,
    dikonfirmasi: m.wajibKonfirmasi,
  }));
  const termin: TerminMasuk[] = hasil.termin.map((t) => ({
    urutan: t.urutan,
    nilai: t.nilai,
    syarat: t.syarat,
    jatuhTempo: t.jatuhTempo?.toISOString() ?? null,
  }));

  const simpan = await simpanKontrak({
    namaBerkas: h.berkas,
    jumlahHalaman: hasil.halaman.length,
    model: hasil.model,
    medan,
    termin,
    status: "BERJALAN",
    berkas: { data: pdf },
    penggunaId,
  });
  const k = await prisma.kontrak.findUniqueOrThrow({
    where: { id: simpan.kontrakId },
    include: { vendor: true, termin: { orderBy: { urutan: "asc" } } },
  });

  const bandingkan = (nama: string, dapat: unknown, harap: unknown) =>
    cek(nama, JSON.stringify(dapat) === JSON.stringify(harap), `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, false);

  bandingkan("nomor kontrak", k.nomor, kunci.medan.nomor_kontrak);
  bandingkan("nama vendor", k.vendor?.nama, kunci.medan.nama_vendor);
  bandingkan("nilai kontrak", Number(k.nilaiKontrak), uraiRupiah(kunci.medan.nilai_kontrak));
  bandingkan("keterangan PPN (termasuk atau tidak)", k.termasukPpn, h.termasukPpn);
  bandingkan("komitmen TKDN", Number(k.komitmenTkdnPersen), h.tkdn);
  bandingkan("tarif denda dalam permil", Number(k.tarifDendaPermil), h.tarifPermil);
  bandingkan("batas denda dalam persen", Number(k.batasDendaPersen), h.batasDenda);
  bandingkan("nilai jaminan pelaksanaan", Number(k.nilaiJaminan), h.nilaiJaminan);
  bandingkan("jaminan berlaku sampai", tgl(k.jaminanBerlakuSampai), h.jaminanSampai);
  bandingkan("tanggal mulai", tgl(k.tanggalMulai), h.mulai);
  bandingkan("tanggal berakhir", tgl(k.tanggalBerakhir), h.berakhir);
  bandingkan("masa pemeliharaan (hari)", k.masaPemeliharaanHari, h.pemeliharaanHari);
  bandingkan(
    "nilai tiap termin",
    k.termin.map((t) => Number(t.nilai)),
    kunci.termin.map((t) => uraiRupiah(t.nilai))
  );
  bandingkan(
    "tanggal jatuh tempo tiap termin",
    k.termin.map((t) => tgl(t.jatuhTempo)),
    kunci.termin.map((t) => tgl(uraiTanggal(t.jatuh_tempo)))
  );

  const sorotan = await prisma.sorotan.count({ where: { dokumenId: simpan.dokumenId } });
  const berNilai = hasil.medan.filter((m) => m.nilai).length;
  cek("setiap medan yang berisi punya sorotan di PDF", sorotan >= berNilai, `${sorotan} sorotan untuk ${berNilai} medan berisi`, false);

  return simpan.kontrakId;
}

/**
 * Validasi kontrak OCLC tanpa dokumen pendukung. Tidak ada panggilan model di
 * sini: seluruh temuan berasal dari aturan kode atas hasil baca kontrak tadi.
 */
async function ujiValidasiOclc(kontrakId: string, penggunaId: string) {
  console.log("\nValidasi kontrak OCLC (tanpa dokumen pendukung)");
  const harap = (JSON.parse(readFileSync(path.join(DIR_CONTOH, HARAP.oclc.kunci), "utf8")) as {
    validasi: { temuan: Record<string, string>; lulus: string[] };
  }).validasi;
  const v = await jalankanValidasi({ kontrakId, klien: pilihKlien(), penggunaId });
  console.log(`  Hasil ${v.hasil}: ${v.jumlahMerah} merah, ${v.jumlahKuning} kuning.`);
  for (const t of v.temuan) console.log(`     ${t.nomor}. ${t.tingkat.padEnd(6)} ${t.kode}: ${t.uraian.slice(0, 160)}`);
  console.log("  Pemeriksaan:");
  for (const p of v.pemeriksaan) console.log(`     ${p.status.padEnd(8)} ${p.kode}: ${p.catatan.slice(0, 160)}`);

  const dapat = (k: string) => v.temuan.find((t) => t.kode === k)?.tingkat;
  // Lampiran dan isian template dibaca kode langsung dari teks PDF, jadi pasti.
  // Sisanya bergantung pada frasa yang disalin model.
  const pasti = new Set(["LAMPIRAN_LENGKAP", "ISIAN_TEMPLATE"]);
  for (const [k, tingkat] of Object.entries(harap.temuan)) {
    cek(`temuan ${k} (${tingkat.toLowerCase()})`, dapat(k) === tingkat, dapat(k) ? `dapat ${dapat(k)}` : "tidak muncul", pasti.has(k));
  }
  const lebih = v.temuan.filter((t) => !(t.kode in harap.temuan)).map((t) => t.kode);
  cek("tidak ada temuan di luar kesalahan yang ditanam", lebih.length === 0, lebih.join(", "), false);
  for (const k of harap.lulus) {
    const status = v.pemeriksaan.find((p) => p.kode === k)?.status;
    cek(`${k} lulus`, status === "LULUS", status ?? "tidak ada", false);
  }
}

async function ujiPendukungDanValidasi(kontrakId: string, penggunaId: string) {
  console.log("\nDokumen pendukung dan validasi (kontrak mudah)");
  const pend = [
    "0142-TOR-1.pdf",
    "0142-TOR-2.pdf",
    "0142-BA-Prebid-1.pdf",
    "0142-BA-Prebid-2.pdf",
    "0142-BA-Negosiasi.pdf",
    "0142-Form-TKDN-A1.pdf",
    "0142-Akta-Perusahaan.pdf",
    "0142-Scan-Tanpa-Teks.pdf",
  ];
  for (const nama of pend) {
    await unggahDokumen({ kontrakId, jenis: "PENDUKUNG", data: muat("pendukung", nama), namaBerkas: nama, penggunaId, sumber: "ZIP" });
  }

  const klien = pilihKlien();
  const t0 = Date.now();
  const v = await jalankanValidasi({ kontrakId, klien, penggunaId });
  console.log(`  Selesai dalam ${detik(t0)}. ${v.dokumenDibaca} dokumen dibaca model. Hasil ${v.hasil}: ${v.jumlahMerah} merah, ${v.jumlahKuning} kuning.`);

  console.log("  Peran dokumen:");
  for (const p of v.peran) console.log(`     ${p.nama.padEnd(28)} ${p.label.padEnd(13)} ${p.alasan}`);
  console.log("  Temuan:");
  for (const t of v.temuan) console.log(`     ${t.nomor}. ${t.tingkat.padEnd(6)} ${t.kode}: ${t.uraian.slice(0, 150)}`);
  // Status setiap pemeriksaan, supaya pemeriksaan yang dilewati (misalnya
  // karena panggilan AI-nya gagal) terlihat beserta alasannya.
  console.log("  Pemeriksaan:");
  for (const p of v.pemeriksaan) console.log(`     ${p.status.padEnd(8)} ${p.kode}: ${p.catatan.slice(0, 220)}`);

  // Isi bacaan model atas tiap dokumen pendukung: dasar penentuan peran dan
  // ketetapan untuk pemeriksaan klausul.
  console.log("  Hasil baca dokumen pendukung:");
  const bacaan = await prisma.ekstraksi.findMany({
    where: { dokumen: { kontrakId, jenis: "PENDUKUNG" } },
    include: { dokumen: { select: { namaBerkas: true, tanggalDiIsi: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const e of bacaan) {
    const r = rincianDariJson(e.rincian);
    if (!r) continue;
    const tgl = e.dokumen.tanggalDiIsi?.toISOString().slice(0, 10) ?? "tidak terbaca";
    console.log(`     ${e.dokumen.namaBerkas}: jenis ${r.jenis}, tanggal "${r.tanggalDokumenTeks ?? ""}" -> ${tgl}`);
    for (const p of r.pernyataan) {
      console.log(`        ${p.terverifikasi ? "terverifikasi" : "DIBUANG     "} ${p.butir} | ${p.atribut} | ${p.jenis} | ${p.nilai}${p.satuan ? ` ${p.satuan}` : ""}`);
    }
    for (const b of r.dibuang) console.log(`        dibuang: ${b.alasan}: ${b.isi.slice(0, 120)}`);
  }

  const kode = (k: string) => v.temuan.find((t) => t.kode === k);
  // Pasti: hanya bergantung pada isi kontrak yang dibaca, atau tidak memakai model sama sekali.
  cek("temuan jaminan kurang dari masa pelaksanaan ditambah 30 hari (merah)", kode("JAMINAN_MPP30")?.tingkat === "MERAH", "", false);
  cek("temuan dasar denda sebelum PPN padahal nilai sudah termasuk PPN (kuning)", kode("DENDA_DASAR_PPN")?.tingkat === "KUNING", "", false);
  cek("temuan lampiran tidak lengkap (kuning)", kode("LAMPIRAN_LENGKAP")?.tingkat === "KUNING");
  cek("temuan dokumen hasil pindai tidak terbaca (kuning)", kode("DOKUMEN_TIDAK_TERBACA")?.tingkat === "KUNING");
  // Bergantung model: harus membaca dokumen pendukung dengan benar.
  cek("temuan nilai kontrak berbeda dari hasil negosiasi (merah)", kode("NILAI_NEGOSIASI")?.tingkat === "MERAH", kode("NILAI_NEGOSIASI")?.uraian ?? "tidak muncul", false);
  const kl = kode("KLAUSUL_BERTENTANGAN");
  cek("temuan klausul: kontrak 3 termin, ketetapan pre-bid 4 termin (merah)", kl?.tingkat === "MERAH", kl ? `${kl.nilaiDiKontrak} lawan ${kl.nilaiSaran}` : "tidak muncul", false);
  const peranDari = (n: string) => v.peran.find((p) => p.nama === n)?.label;
  cek("peran dokumen: pre-bid pertama digantikan, kedua utama", peranDari("0142-BA-Prebid-1.pdf") === "DIGANTIKAN" && peranDari("0142-BA-Prebid-2.pdf") === "UTAMA", `${peranDari("0142-BA-Prebid-1.pdf")}, ${peranDari("0142-BA-Prebid-2.pdf")}`, false);
  cek("peran dokumen: dua TOR saling melengkapi", peranDari("0142-TOR-1.pdf") === "KOMPLEMENTER" && peranDari("0142-TOR-2.pdf") === "KOMPLEMENTER", "", false);
  cek("tidak ada temuan yang berasal dari kutipan karangan model", v.temuan.every((t) => t.dasar.length > 0), "", false);

  const pakai = await prisma.pemakaianAI.aggregate({ _sum: { tokenMasuk: true, tokenKeluar: true, biayaUsd: true }, _count: true });
  console.log(`  Pemakaian AI sampai sini: ${pakai._count} panggilan, token ${pakai._sum.tokenMasuk}/${pakai._sum.tokenKeluar}, biaya USD ${pakai._sum.biayaUsd ?? "tidak diketahui"}`);
}

async function ujiAmendemen(kontrakId: string, penggunaId: string) {
  console.log("\nAmendemen (kontrak mudah)");
  const a1 = await unggahAmendemen({
    kontrakId,
    dokumen: { data: muat("pendukung", "0142-Amendemen-1.pdf"), namaBerkas: "0142-Amendemen-1.pdf" },
    pendukung: [{ data: muat("pendukung", "0142-Amendemen-1-Pendukung.pdf"), namaBerkas: "0142-Amendemen-1-Pendukung.pdf" }],
    klien: pilihKlien(),
    penggunaId,
  });
  console.log(`  Amendemen 1: nilai ${a1.baca.nilaiAmandemen}, jenis ${a1.baca.jenisPerubahan.join("+")}, nilai setelah ${a1.hitung.nilaiSetelah}, ${a1.hitung.persenAmandemen}%`);
  cek("amendemen 1: nilai tambahan Rp242.500.000", a1.baca.nilaiAmandemen === 242_500_000, `${a1.baca.nilaiAmandemen}`, false);
  cek("amendemen 1: nilai kontrak setelahnya Rp5.092.500.000", a1.hitung.nilaiSetelah === 5_092_500_000, `${a1.hitung.nilaiSetelah}`, false);
  cek("amendemen 1: jenis perubahan memuat harga", a1.baca.jenisPerubahan.includes("HARGA"), a1.baca.jenisPerubahan.join(", "), false);
  for (const a of a1.perbandingan.aspek) console.log(`     ${a.nama}: ${a.sebelum} menjadi ${a.sesudah}`);

  const a2 = await unggahAmendemen({
    kontrakId,
    dokumen: { data: muat("pendukung", "0142-Amendemen-2.pdf"), namaBerkas: "0142-Amendemen-2.pdf" },
    klien: pilihKlien(),
    penggunaId,
  });
  console.log(`  Amendemen 2: selisih hari ${a2.perbandingan.selisihHari}, jenis ${a2.baca.jenisPerubahan.join("+")}`);
  cek("amendemen 2: tanggal berakhir mundur 14 hari", a2.perbandingan.selisihHari === 14, `${a2.perbandingan.selisihHari}`, false);
  cek("amendemen 2: jenis perubahan jangka waktu", a2.baca.jenisPerubahan.includes("JANGKA_WAKTU"), a2.baca.jenisPerubahan.join(", "), false);
  const aktif = await prisma.amendemen.findMany({ where: { kontrakId, aktif: true } });
  cek("tepat satu amendemen aktif, yaitu versi 2", aktif.length === 1 && aktif[0].versi === 2, "");
}

async function main() {
  const argumen = process.argv.slice(2);
  if (!argumen.includes("--live")) {
    console.error("Skrip ini memanggil model sungguhan dan memakan kuota. Tambahkan --live untuk melanjutkan.");
    process.exit(2);
  }
  const tahap = argumen.find((a) => ["mudah", "sulit", "oclc", "semua"].includes(a)) ?? "mudah";

  // Memastikan penyedia terpilih sebelum apa pun dibuat, supaya galat konfigurasi cepat terlihat.
  const klien = pilihKlien();
  console.log(`Penyedia: ${klien.nama}`);
  console.log("Dokumen: sintetis dari public/contoh. Data disimpan di skema sementara.");

  const skema = namaSkemaBaru("uji_live");
  const dir = mkdtempSync(path.join(tmpdir(), "vasko-live-"));
  await buatSkema(skema);
  const mulai = Date.now();
  try {
    terapkanMigrasi(skema);
    process.env.DATABASE_SKEMA = skema;
    process.env.VASKO_DIR_DATA = dir;

    const p = await prisma.pengguna.create({ data: { nama: "Uji Live", email: "live@uji.id", hashKataSandi: "x", peran: "PROCUREMENT" } });

    const jalankan = async (nama: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        cek(`${nama} selesai tanpa galat`, false, e instanceof Error ? e.message.slice(0, 400) : String(e));
      }
    };

    let kontrakMudah: string | null = null;
    if (tahap === "mudah" || tahap === "semua") {
      await jalankan("baca kontrak mudah", async () => {
        kontrakMudah = await ujiBacaKontrak("mudah", p.id);
      });
    }
    if (kontrakMudah && (tahap === "mudah" || tahap === "semua")) {
      const id: string = kontrakMudah;
      await jalankan("dokumen pendukung dan validasi", () => ujiPendukungDanValidasi(id, p.id));
      await jalankan("amendemen", () => ujiAmendemen(id, p.id));
    }
    if (tahap === "sulit" || tahap === "semua") {
      await jalankan("baca kontrak sulit", () => ujiBacaKontrak("sulit", p.id));
    }
    if (tahap === "oclc" || tahap === "semua") {
      let kontrakOclc: string | null = null;
      await jalankan("baca kontrak OCLC", async () => {
        kontrakOclc = await ujiBacaKontrak("oclc", p.id);
      });
      if (kontrakOclc) {
        const id: string = kontrakOclc;
        await jalankan("validasi kontrak OCLC", () => ujiValidasiOclc(id, p.id));
      }
    }

    const total = await prisma.pemakaianAI.aggregate({ _sum: { tokenMasuk: true, tokenKeluar: true, biayaUsd: true }, _count: true });
    const modelDipakai = await prisma.pemakaianAI.groupBy({ by: ["model"], _count: true });
    console.log(
      `\nTotal ${total._count} panggilan model dalam ${detik(mulai)}, token ${total._sum.tokenMasuk}/${total._sum.tokenKeluar}, biaya USD ${total._sum.biayaUsd ?? "tidak diketahui"}.`
    );
    console.log(`Model yang menjawab: ${modelDipakai.map((m) => `${m.model} (${m._count}x)`).join(", ")}`);
  } finally {
    await prisma.$disconnect();
    await buangSkema(skema);
    rmSync(dir, { recursive: true, force: true });
    console.log(`Skema sementara ${skema} sudah dibuang.`);
  }

  if (gagal === 0) {
    console.log("\nSeluruh pemeriksaan live lulus.");
  } else {
    console.log(`\n${gagal} pemeriksaan GAGAL, ${gagalBergantungModel.length} di antaranya bergantung pada model.`);
  }
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
