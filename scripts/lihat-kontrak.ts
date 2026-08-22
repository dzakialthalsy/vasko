// Menampilkan isi satu kontrak apa adanya dari basis data, untuk memeriksa
// apakah penguraian nilai benar-benar tersimpan.
//
// Jalankan: npx tsx --env-file=.env.local scripts/lihat-kontrak.ts KTR/2026/0163
import { prisma } from "../src/lib/prisma";

async function main() {
  const nomor = process.argv[2] ?? "KTR/2026/0163";
  const k = await prisma.kontrak.findUnique({
    where: { nomor },
    include: {
      vendor: true,
      ekstraksi: { include: { medan: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!k) {
    console.log(`Kontrak ${nomor} tidak ada di basis data.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`nomor          : ${k.nomor}`);
  console.log(`judul          : ${k.judul}`);
  console.log(`status         : ${k.status}`);
  console.log(`vendorId       : ${k.vendorId ?? "(kosong)"}`);
  console.log(`vendor         : ${k.vendor?.nama ?? "(kosong)"}`);
  console.log(`nilaiKontrak   : ${k.nilaiKontrak?.toString() ?? "(kosong)"}`);
  console.log(`komitmenTkdn   : ${k.komitmenTkdn?.toString() ?? "(kosong)"}`);
  console.log(`batasMaksDenda : ${k.batasMaksDenda?.toString() ?? "(kosong)"}`);
  console.log(`jumlahTermin   : ${k.jumlahTermin ?? "(kosong)"}`);
  console.log(`tanggalMulai   : ${k.tanggalMulai?.toISOString() ?? "(kosong)"}`);
  console.log(`tanggalBerakhir: ${k.tanggalBerakhir?.toISOString() ?? "(kosong)"}`);
  console.log("\nmedan hasil ekstraksi terakhir:");
  for (const m of k.ekstraksi[0]?.medan ?? []) {
    console.log(
      `  ${m.kunci.padEnd(22)} ${m.dikonfirmasi ? "terkonfirmasi" : "belum        "} ${JSON.stringify(m.nilai)}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
