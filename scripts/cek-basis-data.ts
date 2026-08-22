// Pemeriksaan cepat: pastikan seluruh tabel skema benar-benar terbentuk
// di basis data, dan klien Prisma bisa menyambung lewat driver adapter.
//
// Jalankan: npx tsx scripts/cek-basis-data.ts
import { prisma } from "../src/lib/prisma";

const DIHARAPKAN = [
  "vendor",
  "kontrak",
  "ekstraksi",
  "medan_ekstraksi",
  "sorotan",
  "termin",
  "amendemen",
  "progres",
];

async function main() {
  const baris = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const ada = new Set(baris.map((b) => b.table_name));

  let gagal = 0;
  for (const t of DIHARAPKAN) {
    const ok = ada.has(t);
    if (!ok) gagal++;
    console.log(`  ${ok ? "OK   " : "GAGAL"} tabel ${t}`);
  }

  const enums = await prisma.$queryRaw<{ typname: string }[]>`
    SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname
  `;
  console.log(`\n  enum terpasang: ${enums.map((e) => e.typname).join(", ")}`);

  await prisma.$disconnect();
  if (gagal > 0) {
    console.error(`\n${gagal} tabel belum terbentuk.`);
    process.exit(1);
  }
  console.log(`\nSeluruh ${DIHARAPKAN.length} tabel terbentuk dan klien tersambung.`);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
