// Melengkapi baris dokumen milik kontrak yang sudah ada sebelum rancangan ERD.
//
// Migrasi 20261020120000_rancangan_erd membuat satu baris dokumen untuk tiap
// kontrak lama, dengan sidik sementara "belum-dihitung:<id>" dan ukuran 0,
// karena SQL tidak bisa membaca berkas di disk. Skrip ini membaca berkas lama
// di data/kontrak, menghitung sidik dan ukuran yang sebenarnya, menyalinnya ke
// letak baru berbasis sidik (data/dokumen/<sidik>.pdf), lalu memperbarui barisnya.
//
// Berkas lama tidak dihapus. Tanpa --terapkan, skrip hanya menampilkan
// rencananya dan tidak mengubah apa pun.
//
// Baris yang tidak bisa dilengkapi dilewati dan dilaporkan, lalu skrip keluar
// dengan kode 1 supaya terlihat. Penyebabnya bisa berkas lama sudah tidak ada
// di disk, atau sudah ada dokumen lain pada kontrak yang sama dengan isi
// persis sama (diunggah ulang setelah migrasi). Keduanya perlu diputuskan
// manusia, jadi skrip tidak menghapus atau menggabungkan apa pun sendiri.
//
// Jalankan:
//   npx tsx --env-file=.env.local scripts/lengkapi-dokumen-lama.ts
//   npx tsx --env-file=.env.local scripts/lengkapi-dokumen-lama.ts --terapkan
import { bacaBerkas, sidikSha256, simpanBerkas } from "../src/lib/penyimpanan";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<number> {
  const terapkan = process.argv.includes("--terapkan");

  const sementara = await prisma.dokumen.findMany({
    where: { hashSha256: { startsWith: "belum-dihitung:" } },
    include: { kontrak: { select: { nomor: true } } },
    orderBy: { diunggahPada: "asc" },
  });

  if (sementara.length === 0) {
    console.log("Tidak ada dokumen lama yang perlu dilengkapi.");
    return 0;
  }

  console.log(
    `${sementara.length} dokumen lama bersidik sementara. ${terapkan ? "Menerapkan perubahan." : "Hanya melihat, tambahkan --terapkan untuk mengubah."}`
  );

  let masalah = 0;
  for (const d of sementara) {
    const nama = `${d.kontrak.nomor} (${d.lokasiSimpan})`;

    let data: Buffer;
    try {
      data = await bacaBerkas(d.lokasiSimpan);
    } catch (e) {
      masalah++;
      const sebab = e instanceof Error ? e.message : String(e);
      console.log(`  LEWAT   ${nama}: berkas tidak ditemukan atau tidak bisa dibaca (${sebab})`);
      continue;
    }

    const sidik = sidikSha256(data);
    const kembar = await prisma.dokumen.findFirst({
      where: { kontrakId: d.kontrakId, hashSha256: sidik, id: { not: d.id } },
      select: { id: true },
    });
    if (kembar) {
      masalah++;
      console.log(`  LEWAT   ${nama}: pada kontrak ini sudah ada dokumen dengan isi sama persis (id ${kembar.id}). Putuskan sendiri mana yang dipakai.`);
      continue;
    }

    if (!terapkan) {
      console.log(`  AKAN    ${nama}: ${data.length} byte, sidik ${sidik.slice(0, 12)}...`);
      continue;
    }

    const lokasi = await simpanBerkas(data, sidik);
    await prisma.dokumen.update({
      where: { id: d.id },
      data: { hashSha256: sidik, ukuranByte: data.length, lokasiSimpan: lokasi },
    });
    console.log(`  SELESAI ${nama} menjadi ${lokasi}`);
  }

  if (masalah > 0) console.log(`${masalah} dokumen dilewati. Lihat pesan di atas.`);
  return masalah > 0 ? 1 : 0;
}

main()
  .then(async (kode) => {
    await prisma.$disconnect();
    process.exit(kode);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
