// Memotret halaman untuk dibandingkan dengan rancangan.
//
// Lebarnya dikunci 1300 piksel, sama dengan lebar berkas PNG rancangan,
// supaya perbandingannya adil dan tidak tertipu perbedaan skala.
//
// Jalankan: npx tsx scripts/potret.ts [jalur] [namaKeluaran]
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const LEBAR = 1300;
const KELUARAN = path.resolve("potret");

async function main() {
  const jalur = process.argv[2] ?? "/kontrak/KTR-2026-0142";
  const nama = process.argv[3] ?? "detail-kontrak";

  fs.mkdirSync(KELUARAN, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: LEBAR, height: 1000 },
    deviceScaleFactor: 1,
  });

  await page.goto(`http://localhost:3000${jalur}`, { waitUntil: "networkidle" });
  // Tunggu font web selesai dimuat, kalau tidak potretnya memakai font
  // cadangan dan perbandingan tipografinya jadi keliru.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // Argumen ketiga berupa angka menggulir halaman lalu memotret hanya
  // seukuran viewport. Berguna memeriksa elemen ber-posisi fixed, yang pada
  // potret satu halaman penuh selalu tampak terpotong padahal sebenarnya
  // tidak.
  const gulir = Number(process.argv[4]);
  if (Number.isFinite(gulir) && gulir > 0) {
    await page.evaluate((y) => window.scrollTo(0, y), gulir);
    await page.waitForTimeout(300);
    const sidebar = await page.evaluate(() => {
      const a = document.querySelector("aside")!.getBoundingClientRect();
      return {
        menutupViewport: a.top <= 0 && a.bottom >= window.innerHeight,
        atas: a.top,
        bawah: a.bottom,
        tinggiViewport: window.innerHeight,
      };
    });
    console.log("sidebar:", JSON.stringify(sidebar));
  }

  const berkas = path.join(KELUARAN, `${nama}.png`);
  await page.screenshot({ path: berkas, fullPage: !(Number.isFinite(gulir) && gulir > 0) });
  const { width, height } = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  console.log(`${berkas}  (${width}x${height})`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
