// Menguji bahwa perbedaan Simpan sebagai Draf dan Simpan ke Repositori
// benar-benar terlihat, bukan hanya tersimpan diam-diam sebagai nilai enum.
//
// Sebelumnya halaman detail selalu menulis "Berjalan" apa pun status
// sebenarnya, sehingga draf yang belum terverifikasi tampak sudah pasti.
//
// Jalankan dengan server pengembangan menyala:
//   npx tsx --env-file=.env.local scripts/uji-status.ts
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";

const ASAL = "http://localhost:3000";
const NOMOR = "KTR/2026/0142";
const SLUG = "KTR-2026-0142";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}

async function main() {
  const asli = await prisma.kontrak.findUnique({ where: { nomor: NOMOR } });
  if (!asli) throw new Error(`Kontrak ${NOMOR} belum ada. Jalankan scripts/seed.ts.`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });

  try {
    for (const status of ["DRAF", "BERJALAN"] as const) {
      await prisma.kontrak.update({ where: { nomor: NOMOR }, data: { status } });

      await page.goto(`${ASAL}/kontrak/${SLUG}`, { waitUntil: "networkidle" });
      const detail = await page.locator("main").innerText();

      if (status === "DRAF") {
        cek("detail draf menampilkan chip Draf", detail.includes("Draf"));
        cek("detail draf TIDAK menampilkan Berjalan", !detail.includes("Berjalan"));
        cek("detail draf memuat peringatan belum terverifikasi",
            detail.includes("masih draf"));
      } else {
        cek("detail berjalan menampilkan chip Berjalan", detail.includes("Berjalan"));
        cek("detail berjalan tanpa peringatan draf", !detail.includes("masih draf"));
      }

      await page.goto(`${ASAL}/kontrak`, { waitUntil: "networkidle" });
      const daftar = await page.locator("main").innerText();
      cek(
        `daftar menampilkan status ${status}`,
        status === "DRAF" ? daftar.includes("Draf") : daftar.includes("Berjalan"),
        daftar.match(new RegExp(`${NOMOR.replace(/\//g, "\\/")}[\\s\\S]{0,160}`))?.[0]?.split("\n").pop() ?? ""
      );
    }
  } finally {
    // Kembalikan ke keadaan semula apa pun yang terjadi, supaya uji ini tidak
    // meninggalkan basis data dalam keadaan berubah.
    await prisma.kontrak.update({ where: { nomor: NOMOR }, data: { status: asli.status } });
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(
    gagal === 0
      ? "\nPerbedaan draf dan repositori terlihat di kedua halaman."
      : `\n${gagal} pemeriksaan GAGAL.`
  );
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
