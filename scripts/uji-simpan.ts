// Menguji alur penuh: unggah PDF, konfirmasi seluruh medan, simpan ke
// repositori, lalu pastikan kontraknya muncul di daftar dan halaman
// detailnya terisi.
//
// Menguji apa yang benar-benar dialami pengguna, bukan hanya potongan API.
//
// Jalankan dengan server pengembangan menyala:
//   npx tsx scripts/uji-simpan.ts
import { chromium } from "playwright";
import path from "node:path";

const ASAL = "http://localhost:3000";
const PDF = path.resolve("public/contoh/KTR-2026-0163-Konstruksi-Tangki-Timbun-Samarinda.pdf");
const NOMOR = "KTR/2026/0163";
const SLUG = "KTR-2026-0163";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // --- 1. Unggah dokumen sulit ---
  // Halaman unggah memanggil ekstraksi begitu dimuat, sehingga jaringan
  // tidak pernah senggang. Menunggu networkidle di sini selalu kehabisan
  // waktu; yang ditunggu cukup DOM-nya, lalu hasil ekstraksinya sendiri.
  await page.goto(`${ASAL}/kontrak/unggah`, { waitUntil: "domcontentloaded" });
  // Menunggu kendali unggah "attached" saja TIDAK cukup: markah HTML-nya
  // sudah ada sebelum React hidrasi, sehingga berkas yang dikirim pada saat
  // itu tidak memicu penangan apa pun dan diam-diam hilang. Yang ditunggu
  // adalah tanda bahwa kode klien sudah hidup. Halaman tidak lagi memuat
  // dokumen contoh sendiri, jadi indikator pembacaan tidak bisa dipakai lagi
  // sebagai penanda; yang dipakai penanda hidrasi yang eksplisit.
  await page.waitForSelector('[data-siap="1"]', { timeout: 60_000 });

  await page.setInputFiles('input[type="file"]', PDF);
  // Ekstraksi dokumen 60 halaman lewat model gratis bisa lama.
  // Parameter kedua waitForFunction adalah ARGUMEN untuk fungsinya, bukan
  // opsi. Menaruh opsi di posisi itu membuat batas waktunya diabaikan dan
  // yang berlaku bawaan 30 detik, terlalu pendek untuk dokumen 60 halaman.
  await page.waitForFunction(
    () => document.body.innerText.includes("60 halaman"),
    null,
    { timeout: 180_000 }
  );
  cek("dokumen sulit terunggah dan terekstraksi", true, "60 halaman");

  const nomorTampil = await page.locator("text=KTR/2026/0163").count();
  cek("nomor kontrak dokumen sulit terbaca", nomorTampil > 0);

  // Medan kosong harus terlihat sebagai kosong, bukan diam-diam ikut
  // tersimpan. Bila model melewatkan sesuatu, isi manual di sini, persis
  // seperti yang akan dilakukan pengguna.
  const kosong = await page.getByLabel("Belum terisi").count();
  console.log(`         medan kosong setelah ekstraksi: ${kosong}`);
  if (kosong > 0) {
    // Selalu ambil isian PERTAMA yang masih kosong. Daftar isian menyusut
    // setiap kali satu medan terisi, sehingga mengunci indeks di awal akan
    // menunjuk elemen yang sudah tidak ada.
    let terisi = 0;
    while (terisi < 12) {
      const isian = page.locator('input[placeholder^="Ketik nilai dari dokumen"]');
      if ((await isian.count()) === 0) break;
      await isian.first().fill("DIISI MANUAL SAAT UJI");
      await page.waitForTimeout(120);
      terisi++;
    }
    cek(
      "medan kosong dapat diisi manual",
      (await page.getByLabel("Belum terisi").count()) === 0,
      `${terisi} medan diisi`
    );
  }

  // --- 2. Simpan sebagai draf harus bisa tanpa konfirmasi ---
  const draf = page.getByRole("button", { name: /Simpan sebagai Draf/ });
  cek("tombol Simpan sebagai Draf aktif sejak awal", await draf.isEnabled());

  // --- 3. Konfirmasi seluruh medan wajib ---
  let klik = 0;
  while ((await page.getByRole("button", { name: "Konfirmasi" }).count()) > 0 && klik < 12) {
    await page.getByRole("button", { name: "Konfirmasi" }).first().click();
    await page.waitForTimeout(120);
    klik++;
  }
  cek("seluruh medan wajib terkonfirmasi", klik === 6, `${klik} klik`);

  // --- 4. Simpan ke repositori ---
  const simpan = page.getByRole("button", { name: /Simpan ke Repositori/ });
  cek("tombol Simpan ke Repositori menyala", await simpan.isEnabled());

  await simpan.click();
  await page.waitForURL(`${ASAL}/kontrak/${SLUG}`, { timeout: 60_000 });
  cek("berpindah ke halaman detail kontrak", page.url().endsWith(SLUG), page.url());

  const teksDetail = await page.locator("main").innerText();
  cek("halaman detail memuat nomor kontrak", teksDetail.includes(NOMOR));
  // Nilai dan vendor hanya dapat diperiksa bila model memang menemukannya.
  // Bila diisi manual saat uji, penandanya berbeda, jadi cukup dipastikan
  // kolomnya tidak kosong.
  cek(
    "halaman detail memuat nilai kontrak",
    /Nilai Kontrak:\s*Rp[\d.]+/.test(teksDetail),
    teksDetail.match(/Nilai Kontrak:.*/)?.[0] ?? "kosong"
  );
  cek(
    "halaman detail memuat nama vendor",
    /Vendor:\s*\S/.test(teksDetail) && !/Vendor:\s*-/.test(teksDetail),
    teksDetail.match(/Vendor:.*/)?.[0] ?? "kosong"
  );
  // --- Rincian termin harus ikut tersimpan dan tampil ---
  cek("tabel termin terisi, bukan keadaan kosong", !teksDetail.includes("Belum ada rincian termin"));
  cek("baris Termin 1 tampil", teksDetail.includes("Termin 1"));
  cek("baris Termin 5 tampil", teksDetail.includes("Termin 5"));
  cek(
    "total termin sama dengan nilai kontrak",
    teksDetail.includes("Rp12.400.000.000"),
    teksDetail.match(/Total.*/)?.[0] ?? "tidak ketemu"
  );

  cek(
    "halaman detail memuat periode hasil ekstraksi",
    teksDetail.includes("20 Apr 2026") && teksDetail.includes("05 Okt 2026"),
    teksDetail.match(/Periode:[^\n]*/)?.[0] ?? "tidak ketemu"
  );

  // --- 5. Muncul di daftar kontrak ---
  await page.goto(`${ASAL}/kontrak`, { waitUntil: "networkidle" });
  const teksDaftar = await page.locator("main").innerText();
  cek("kontrak baru muncul di daftar", teksDaftar.includes(NOMOR));
  cek("kontrak lama tetap ada di daftar", teksDaftar.includes("KTR/2026/0142"));

  // --- 6. Berkas PDF tersimpan dan dapat diambil kembali ---
  const r = await page.request.get(`${ASAL}/api/kontrak/${SLUG}/berkas`);
  const tipe = r.headers()["content-type"] ?? "";
  cek("berkas PDF tersimpan dan dapat diunduh", r.ok() && tipe.includes("application/pdf"),
      `${r.status()} ${tipe}`);

  await page.screenshot({ path: "potret/daftar-setelah-simpan.png", fullPage: true });
  await browser.close();

  console.log(gagal === 0 ? "\nSeluruh alur penyimpanan lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
