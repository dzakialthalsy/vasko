// Menyalin worker pdf.js dari node_modules ke public/.
//
// Penampil PDF di peramban memuat worker lewat URL "/pdf.worker.min.mjs",
// sehingga berkasnya harus ada di public/. Berkas itu TIDAK disimpan di
// repositori, melainkan disalin ulang setiap kali dependensi dipasang.
//
// Alasannya versi. pdf.js menolak bekerja bila versi worker berbeda dari
// versi pustaka utamanya, dan salinan yang diversikan di repositori akan
// tertinggal diam-diam setiap kali pdfjs-dist diperbarui.
//
// Dijalankan otomatis oleh "npm install" lewat skrip postinstall.
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tujuan = path.join(akar, "public", "pdf.worker.min.mjs");

// pdfjs-dist menaruh worker pada dua tempat berbeda antar versi, jadi
// keduanya dicoba sebelum menyerah.
const kandidat = [
  path.join(akar, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(akar, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"),
];

const sumber = kandidat.find((p) => existsSync(p));

if (!sumber) {
  // Bukan galat yang mematikan pemasangan. Pesan ini cukup, supaya
  // "npm install" tidak gagal hanya karena penampil PDF belum siap.
  console.warn(
    "[salin-worker] Worker pdf.js tidak ditemukan di node_modules. " +
      "Penampil PDF tidak akan berjalan sampai berkasnya tersedia."
  );
  process.exit(0);
}

mkdirSync(path.dirname(tujuan), { recursive: true });
copyFileSync(sumber, tujuan);
console.log(`[salin-worker] Worker pdf.js disalin dari ${path.relative(akar, sumber)}`);
