// Menguji pembacaan kata dan pencocokan nilai terhadap PDF sintetis, memakai
// kunci jawaban yang dibangkitkan bersama dokumennya.
//
// Uji ini TIDAK memanggil model bahasa. Yang diuji adalah mesin koordinatnya:
// bila nilai yang benar diberikan, apakah sistem menemukannya di halaman yang
// benar dengan kotak sorotan yang masuk akal.
//
// Jalankan: npx tsx scripts/uji-pdf.ts
import fs from "node:fs";
import path from "node:path";
import { bacaKata } from "../src/lib/pdf/kata";
import { cocokkan } from "../src/lib/pdf/cocok";

const PDF = path.resolve("public/contoh/KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
const KUNCI = path.resolve("public/contoh/KTR-2026-0142.kunci.json");

// Halaman tempat tiap medan seharusnya ditemukan pertama kali.
// Nama vendor sudah muncul di sampul, jadi halaman 1 memang jawaban yang
// benar untuk kemunculan pertamanya.
const HALAMAN_HARAPAN: Record<string, number> = {
  nomor_kontrak: 1,
  nama_vendor: 1,
  nilai_kontrak: 3,
  lingkup_pekerjaan: 3,
  komitmen_tkdn: 3,
  tarif_denda_harian: 3,
  batas_maksimum_denda: 3,
  jumlah_termin: 3,
  tanggal_mulai: 3,
  tanggal_berakhir: 3,
};

async function main() {
  // Berkas kunci kini memuat dua bagian: medan kepala dan daftar termin.
  // Uji ini hanya menyoal pencocokan medan kepala ke koordinat halaman.
  const berkasKunci = JSON.parse(fs.readFileSync(KUNCI, "utf8")) as {
    medan: Record<string, string>;
  };
  const kunci = berkasKunci.medan;
  const data = new Uint8Array(fs.readFileSync(PDF));

  const t0 = Date.now();
  const { halaman, kata } = await bacaKata(data);
  const durasi = Date.now() - t0;

  console.log(`Halaman  : ${halaman.length}`);
  console.log(`Kata     : ${kata.length}`);
  console.log(`Ukuran   : ${halaman[0].lebar.toFixed(0)} x ${halaman[0].tinggi.toFixed(0)} titik`);
  console.log(`Durasi   : ${durasi} ms\n`);

  let gagal = 0;
  for (const [medan, nilai] of Object.entries(kunci)) {
    const h = cocokkan(nilai, kata);
    const halOk = h.halaman !== null && h.halaman >= HALAMAN_HARAPAN[medan];
    const kotakOk = h.kotak.length > 0 && h.kotak.every((k) => k.lebar > 0 && k.tinggi > 0);
    const dalamHalaman = h.kotak.every((k) => {
      const hal = halaman[k.halaman - 1];
      return k.x >= -5 && k.y >= -5 && k.x + k.lebar <= hal.lebar + 5 && k.y + k.tinggi <= hal.tinggi + 5;
    });
    const ok = h.ditemukan && halOk && kotakOk && dalamHalaman && h.keyakinan >= 0.85;
    if (!ok) gagal++;

    console.log(
      `  ${ok ? "OK   " : "GAGAL"} ${medan.padEnd(22)} ` +
        `hal ${String(h.halaman ?? "-").padStart(2)}  ` +
        `keyakinan ${(h.keyakinan * 100).toFixed(0).padStart(3)}%  ` +
        `${h.kotak.length} kotak`
    );
    if (!ok) {
      console.log(`         nilai     : ${JSON.stringify(nilai)}`);
      console.log(`         teksSumber: ${JSON.stringify(h.teksSumber)}`);
      console.log(`         dalamHalaman=${dalamHalaman} halOk=${halOk} kotakOk=${kotakOk}`);
    }
  }

  // Nilai yang memang tidak ada di dokumen harus dilaporkan tidak ditemukan,
  // bukan dipaksakan cocok ke tempat sembarang.
  const palsu = cocokkan("PT Tidak Pernah Ada Sekali Pun Dalam Dokumen Ini", kata);
  const palsuOk = !palsu.ditemukan;
  if (!palsuOk) gagal++;
  console.log(
    `\n  ${palsuOk ? "OK   " : "GAGAL"} nilai fiktif ditolak, tidak dipaksakan cocok` +
      (palsuOk ? "" : ` (keyakinan ${palsu.keyakinan}, teks ${JSON.stringify(palsu.teksSumber)})`)
  );

  console.log(gagal === 0 ? "\nSeluruh pemeriksaan lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
