// Menguji dua interaksi wajib pada halaman Verifikasi Hasil Ekstraksi AI:
//   1. Mengklik medan di panel kanan membuat dokumen berpindah ke halaman
//      yang memuat sorotannya.
//   2. Tombol Konfirmasi mengubah keadaan medan, mengurangi penghitung di
//      bilah bawah, dan menyalakan tombol Simpan ke Repositori.
//
// Jalankan dengan server pengembangan menyala:
//   npx tsx scripts/uji-interaksi.ts
import { chromium } from "playwright";
import path from "node:path";

const ALAMAT = "http://localhost:3000/kontrak/unggah";
const PDF = path.resolve("public/contoh/KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
let gagal = 0;

function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await page.goto(ALAMAT, { waitUntil: "domcontentloaded" });
  // Halaman tidak lagi memuat dokumen contoh sendiri. Berkasnya dimasukkan
  // dari sini, setelah kode klien dipastikan sudah hidup, supaya berkas yang
  // dikirim benar-benar memicu penangannya.
  await page.waitForSelector('[data-siap="1"]', { timeout: 30_000 });
  await page.setInputFiles('input[type="file"]', PDF);
  await page.waitForSelector("text=Nomor Kontrak", { timeout: 180_000 });

  // --- 1. Klik medan, dokumen berpindah halaman ---
  const nomorHalaman = page.getByLabel("Nomor halaman");
  cek("dokumen mulai di halaman 1", (await nomorHalaman.inputValue()) === "1");

  const sorotanAwal = await page.locator('[title^="Medan "]').count();
  cek("sorotan tampil di halaman 1", sorotanAwal > 0, `${sorotanAwal} kotak`);

  // Medan ke-6 adalah Tarif Denda Harian. Halaman tempatnya bergantung pada
  // kalimat mana yang dipilih model, jadi yang diuji bukan nomor halaman
  // tertentu, melainkan perilakunya: dokumen berpindah, dan sorotan milik
  // medan itu benar-benar tergambar di halaman yang dituju.
  await page.getByText("Tarif Denda Harian").click();
  await page.waitForTimeout(900);

  const halamanSetelah = await nomorHalaman.inputValue();
  cek("klik medan memindahkan dokumen ke halaman lain", halamanSetelah !== "1", `halaman ${halamanSetelah}`);

  const sorotanMedan6 = await page.locator('[title="Medan 6"]').count();
  cek("sorotan milik medan itu tergambar di halaman tujuan", sorotanMedan6 > 0, `${sorotanMedan6} kotak`);

  // --- 2. Tombol Konfirmasi ---
  const bilahHitung = page.locator("text=/dari \\d+ medan menunggu konfirmasi/");
  const teksAwal = await bilahHitung.textContent();
  cek("penghitung awal menunjukkan 6", teksAwal?.includes("dari 6") ?? false, teksAwal?.trim());

  const simpan = page.getByRole("button", { name: /Simpan ke Repositori/ });
  cek("tombol Simpan ke Repositori mula-mula mati", await simpan.isDisabled());

  let sisa = await page.getByRole("button", { name: "Konfirmasi" }).count();
  cek("ada 6 tombol Konfirmasi", sisa === 6, `${sisa} tombol`);

  let langkah = 0;
  while ((await page.getByRole("button", { name: "Konfirmasi" }).count()) > 0 && langkah < 10) {
    await page.getByRole("button", { name: "Konfirmasi" }).first().click();
    await page.waitForTimeout(120);
    langkah++;
  }
  cek("seluruh 6 medan terkonfirmasi dalam 6 klik", langkah === 6, `${langkah} klik`);

  const angka = await page.locator("[data-uji=sisa-konfirmasi]").textContent();
  cek("penghitung turun menjadi 0", angka?.trim() === "0", `terbaca ${angka?.trim()}`);

  cek("tombol Simpan ke Repositori menyala", await simpan.isEnabled());

  const centang = await page.getByLabel("Terverifikasi").count();
  cek("kesepuluh medan bertanda terverifikasi", centang === 10, `${centang} centang`);

  await page.screenshot({ path: "potret/unggah-terkonfirmasi.png" });
  await browser.close();

  console.log(gagal === 0 ? "\nSeluruh interaksi lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
