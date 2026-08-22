// Memperkirakan biaya satu kali ekstraksi kontrak, untuk tiap pilihan model.
//
// Perkiraan token dihitung dari panjang teks, bukan dari penghitung resmi,
// karena penghitung resmi pun menuntut sambungan API. Untuk teks Indonesia,
// satu token kira-kira 3,5 karakter. Angkanya kasar, tetapi cukup untuk
// memutuskan model mana yang dipakai.
//
// Jalankan: npx tsx scripts/hitung-biaya.ts
import fs from "node:fs";
import path from "node:path";
import { bacaKata } from "../src/lib/pdf/kata";
import { MEDAN } from "../src/lib/ekstraksi/medan";

const PDF = path.resolve("public/contoh/KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
const KURS = 16_500; // rupiah per dolar, perkiraan

// Harga per satu juta token, dari daftar harga resmi Anthropic.
const HARGA = [
  { nama: "Claude Opus 5", id: "claude-opus-5", masuk: 5.0, keluar: 25.0 },
  { nama: "Claude Sonnet 5", id: "claude-sonnet-5", masuk: 2.0, keluar: 10.0, catatan: "harga perkenalan sampai 31 Agustus 2026, setelah itu 3 dan 15" },
  { nama: "Claude Haiku 4.5", id: "claude-haiku-4-5", masuk: 1.0, keluar: 5.0 },
];

async function main() {
  const data = new Uint8Array(fs.readFileSync(PDF));
  const { halaman } = await bacaKata(data);
  const teks = halaman.map((h) => `=== Halaman ${h.nomor} ===\n${h.teks}`).join("\n\n");

  // Sistem, petunjuk medan, dan skema keluaran ikut terhitung sebagai masukan.
  const petunjuk = MEDAN.map((m) => `${m.label}. ${m.petunjuk}`).join(" ");
  const totalKarakter = teks.length + petunjuk.length + 1200;
  const tokenMasuk = Math.ceil(totalKarakter / 3.5);
  // Keluarannya hanya sepuluh medan berisi untai pendek.
  const tokenKeluar = 400;

  console.log(`Dokumen        : ${halaman.length} halaman, ${teks.length.toLocaleString("id-ID")} karakter`);
  console.log(`Perkiraan token: ${tokenMasuk.toLocaleString("id-ID")} masuk, ${tokenKeluar} keluar\n`);

  const ANGGARAN_RP = 97_000; // Anggaran API AI pada proposal.
  console.log("Biaya satu kali ekstraksi, dan berapa kali muat dalam anggaran Rp97.000:\n");

  for (const h of HARGA) {
    const usd = (tokenMasuk / 1e6) * h.masuk + (tokenKeluar / 1e6) * h.keluar;
    const rp = usd * KURS;
    const muat = Math.floor(ANGGARAN_RP / rp);
    console.log(
      `  ${h.nama.padEnd(17)} ${("$" + usd.toFixed(4)).padStart(9)}  ` +
        `= Rp${rp.toFixed(0).padStart(4)}   ` +
        `${muat.toLocaleString("id-ID").padStart(5)} kali ekstraksi`
    );
    if (h.catatan) console.log(`  ${"".padEnd(17)} ${h.catatan}`);
  }

  console.log(
    `\nIsi ulang terkecil di Anthropic adalah $5, kira-kira Rp${(5 * KURS).toLocaleString("id-ID")}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
