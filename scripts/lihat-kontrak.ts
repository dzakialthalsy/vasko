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
      dokumen: {
        where: { jenis: "KONTRAK" },
        orderBy: { diunggahPada: "desc" },
        take: 1,
        include: { ekstraksi: { include: { medan: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      },
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
  console.log(`termasukPpn    : ${k.termasukPpn ?? "(kosong)"}`);
  console.log(`komitmenTkdn % : ${k.komitmenTkdnPersen?.toString() ?? "(kosong)"}`);
  console.log(`tarifDenda /mil: ${k.tarifDendaPermil?.toString() ?? "(kosong)"}`);
  console.log(`batasDenda %   : ${k.batasDendaPersen?.toString() ?? "(kosong)"}`);
  console.log(`nilaiJaminan   : ${k.nilaiJaminan?.toString() ?? "(kosong)"}`);
  console.log(`jaminanSampai  : ${k.jaminanBerlakuSampai?.toISOString() ?? "(kosong)"}`);
  console.log(`masaPemelihara : ${k.masaPemeliharaanHari ?? "(kosong)"}`);
  console.log(`statusValidasi : ${k.statusValidasi}`);
  console.log(`tanggalMulai   : ${k.tanggalMulai?.toISOString() ?? "(kosong)"}`);
  console.log(`tanggalBerakhir: ${k.tanggalBerakhir?.toISOString() ?? "(kosong)"}`);
  console.log("\nmedan hasil ekstraksi terakhir:");
  for (const m of k.dokumen[0]?.ekstraksi[0]?.medan ?? []) {
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
