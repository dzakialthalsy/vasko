// Membersihkan sisa data dari uji otomatis, yaitu baris bertanda
// "DIISI MANUAL SAAT UJI" yang dibuat scripts/uji-simpan.ts.
//
// Jalankan: npx tsx --env-file=.env.local scripts/bersihkan-uji.ts
import { prisma } from "../src/lib/prisma";

const PENANDA = "DIISI MANUAL SAAT UJI";

async function main() {
  const kontrak = await prisma.kontrak.deleteMany({ where: { judul: PENANDA } });
  const vendor = await prisma.vendor.deleteMany({ where: { nama: PENANDA } });
  console.log(`kontrak dihapus: ${kontrak.count}`);
  console.log(`vendor dihapus : ${vendor.count}`);
  const sisa = await prisma.kontrak.findMany({ select: { nomor: true, judul: true } });
  console.log("\nkontrak tersisa:");
  for (const k of sisa) console.log(`  ${k.nomor}  ${k.judul}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
