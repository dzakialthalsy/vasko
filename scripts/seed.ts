// Mengisi basis data dengan kontrak contoh KTR/2026/0142.
//
// Seluruh isinya sinkron dengan PDF sintetis di public/contoh dan dengan
// rancangan layar Detail Kontrak. Aman dijalankan berulang: memakai upsert
// dan membersihkan baris turunan lebih dulu.
//
// Jalankan: npx tsx --env-file=.env.local scripts/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { analisisBerkas } from "../src/lib/dokumen/unggah";
import { simpanBerkas } from "../src/lib/penyimpanan";
import { prisma } from "../src/lib/prisma";

const BERKAS_CONTOH = "KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf";
const NOMOR = "KTR/2026/0142";
const NILAI = 4_850_000_000;

const TERMIN = [
  { urutan: 1, nilai: 1_455_000_000, syarat: "Mobilisasi & Tahap 1", jatuhTempo: "2026-05-25", status: "DIBAYAR" },
  { urutan: 2, nilai: 1_940_000_000, syarat: "Pekerjaan Tahap 2", jatuhTempo: "2026-08-09", status: "DIBAYAR" },
  { urutan: 3, nilai: 1_455_000_000, syarat: "Serah Terima Akhir", jatuhTempo: "2026-09-19", status: "MENUNGGU" },
] as const;

const PROGRES = [
  { tanggal: "2026-03-20", keterangan: "Mobilisasi selesai", selesai: true, persenTotal: 15 },
  { tanggal: "2026-05-18", keterangan: "Pekerjaan tahap 1 selesai", selesai: true, persenTotal: 45 },
  { tanggal: "2026-08-02", keterangan: "Pekerjaan tahap 2 selesai", selesai: true, persenTotal: 78 },
  { tanggal: "2026-09-12", keterangan: "Serah terima akhir", selesai: false, persenTotal: 100 },
] as const;

const AMENDEMEN = [
  { versi: 0, tanggal: "2026-03-15", ringkasan: "Versi original", aktif: false },
  { versi: 1, tanggal: "2026-05-03", ringkasan: "Penambahan lingkup pekerjaan", aktif: false },
  { versi: 2, tanggal: "2026-07-14", ringkasan: "Perpanjangan waktu 14 hari", aktif: true },
] as const;

async function main() {
  // Aritmetika harus benar sebelum apa pun masuk basis data: jumlah termin
  // wajib sama persis dengan nilai kontrak.
  const jumlahTermin = TERMIN.reduce((a, t) => a + t.nilai, 0);
  if (jumlahTermin !== NILAI) {
    throw new Error(
      `Jumlah termin ${jumlahTermin.toLocaleString("id-ID")} tidak sama dengan nilai kontrak ${NILAI.toLocaleString("id-ID")}`
    );
  }
  const aktif = AMENDEMEN.filter((a) => a.aktif);
  if (aktif.length !== 1) {
    throw new Error(`Tepat satu amendemen harus berstatus aktif, ditemukan ${aktif.length}`);
  }

  const vendor = await prisma.vendor.upsert({
    where: { id: "vendor-sumber-jaya" },
    update: {},
    create: {
      id: "vendor-sumber-jaya",
      nama: "PT Sumber Jaya Abadi",
      npwp: "02.345.678.9-091.000",
      alamat: "Jalan Cendana No. 45, Samarinda, Kalimantan Timur",
      golonganUsaha: "MENENGAH",
    },
  });

  const kontrak = await prisma.kontrak.upsert({
    where: { nomor: NOMOR },
    update: {},
    create: {
      nomor: NOMOR,
      judul: "Pemeliharaan Terminal BBM Balikpapan",
      status: "BERJALAN",
      vendorId: vendor.id,
      nilaiKontrak: NILAI,
      termasukPpn: true,
      komitmenTkdnPersen: 42,
      tarifDendaPermil: 1,
      batasDendaPersen: 5,
      tanggalMulai: new Date("2026-03-15T00:00:00Z"),
      tanggalBerakhir: new Date("2026-09-12T00:00:00Z"),
    },
  });

  // PDF sintetisnya disimpan ke folder data dan dicatat sebagai dokumen
  // kontrak, supaya halaman detail dan rute berkas bekerja seperti pada
  // kontrak yang diunggah sungguhan.
  const data = new Uint8Array(readFileSync(path.resolve("public", "contoh", BERKAS_CONTOH)));
  const analisis = await analisisBerkas(data);
  const lokasi = await simpanBerkas(data, analisis.sidik);
  await prisma.dokumen.upsert({
    where: { kontrakId_hashSha256: { kontrakId: kontrak.id, hashSha256: analisis.sidik } },
    update: {},
    create: {
      kontrakId: kontrak.id,
      jenis: "KONTRAK",
      namaBerkas: BERKAS_CONTOH,
      lokasiSimpan: lokasi,
      hashSha256: analisis.sidik,
      ukuranByte: analisis.ukuranByte,
      jumlahHalaman: analisis.jumlahHalaman,
      adaLapisanTeks: analisis.adaLapisanTeks,
    },
  });

  // Baris turunan dibuat ulang, supaya skrip idempoten.
  await prisma.termin.deleteMany({ where: { kontrakId: kontrak.id } });
  await prisma.progres.deleteMany({ where: { kontrakId: kontrak.id } });
  await prisma.amendemen.deleteMany({ where: { kontrakId: kontrak.id } });

  await prisma.termin.createMany({
    data: TERMIN.map((t) => ({
      kontrakId: kontrak.id,
      urutan: t.urutan,
      nilai: t.nilai,
      syarat: t.syarat,
      jatuhTempo: new Date(`${t.jatuhTempo}T00:00:00Z`),
      status: t.status,
    })),
  });

  await prisma.progres.createMany({
    data: PROGRES.map((p) => ({
      kontrakId: kontrak.id,
      tanggal: new Date(`${p.tanggal}T00:00:00Z`),
      keterangan: p.keterangan,
      selesai: p.selesai,
      persenTotal: p.persenTotal,
    })),
  });

  await prisma.amendemen.createMany({
    data: AMENDEMEN.map((a) => ({
      kontrakId: kontrak.id,
      versi: a.versi,
      tanggal: new Date(`${a.tanggal}T00:00:00Z`),
      ringkasan: a.ringkasan,
      aktif: a.aktif,
    })),
  });

  console.log(`Vendor    : ${vendor.nama}`);
  console.log(`Kontrak   : ${kontrak.nomor} ${kontrak.judul}`);
  console.log(`Termin    : ${TERMIN.length}, berjumlah Rp${jumlahTermin.toLocaleString("id-ID")}`);
  console.log(`Progres   : ${PROGRES.length} tonggak`);
  console.log(`Amendemen : ${AMENDEMEN.length} versi, aktif versi ${aktif[0].versi}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
