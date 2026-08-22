// Pembacaan kata beserta kotak batasnya dari berkas PDF, dijalankan di sisi
// server.
//
// Ini fondasi seluruh fitur sorotan. Model bahasa TIDAK mengembalikan
// koordinat, jadi koordinat harus dihitung sendiri di sini, lalu nilai yang
// dikembalikan model dicocokkan balik ke daftar kata ini.
//
// Koordinat memakai satuan titik PDF dengan titik asal di KIRI ATAS, searah
// dengan sumbu peramban, supaya lapisan sorotan di frontend tidak perlu
// membalik sumbu y. Skala tampilan tidak ikut disimpan, sehingga sorotan
// tetap tepat pada tingkat perbesaran berapa pun.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// Jalur berkas pendukung pdf.js diselesaikan saat program berjalan, bukan
// dengan new URL relatif terhadap import.meta.url. Bentuk relatif itu
// dianggap Turbopack sebagai impor modul dan menggagalkan build. Menelusuri
// dari package.json pdfjs-dist juga membuatnya benar tanpa bergantung pada
// direktori kerja, sehingga tetap jalan setelah dipasang di VPS.
function cariAkarPdfjs(): string {
  // Di dalam bundel server Turbopack, import.meta.url ditulis ulang menjadi
  // jalur maya berisi segmen "[project]", sehingga createRequire menghasilkan
  // jalur yang tidak ada di cakram. Karena itu hasilnya selalu diperiksa
  // keberadaannya, dan bila gagal ditelusuri lagi dari direktori kerja.
  try {
    const p = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
    if (existsSync(path.join(p, "legacy", "build", "pdf.worker.mjs"))) return p;
  } catch {
    // Lanjut ke cara berikutnya.
  }

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, "node_modules", "pdfjs-dist");
    if (existsSync(path.join(p, "legacy", "build", "pdf.worker.mjs"))) return p;
    const naik = path.dirname(dir);
    if (naik === dir) break;
    dir = naik;
  }
  throw new Error("Berkas pendukung pdfjs-dist tidak ditemukan. Jalankan npm install.");
}

const AKAR_PDFJS = cariAkarPdfjs();

/** pdf.js menuntut jalur diakhiri garis miring biasa, termasuk di Windows. */
function jalurDirektori(...bagian: string[]): string {
  return path.join(AKAR_PDFJS, ...bagian).replaceAll("\\", "/").replace(/\/?$/, "/");
}

export type Kata = {
  teks: string;
  halaman: number;
  x: number;
  y: number;
  lebar: number;
  tinggi: number;
  /** Urutan global, dipakai memastikan kecocokan frasa bersambung. */
  urutan: number;
};

export type HalamanPdf = {
  nomor: number;
  lebar: number;
  tinggi: number;
  teks: string;
};

export type HasilBaca = {
  halaman: HalamanPdf[];
  kata: Kata[];
};

/** Memuat pdfjs versi legacy, satu-satunya yang berjalan di Node. */
async function muatPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Node tidak punya Web Worker. pdf.js tetap menuntut workerSrc terisi,
  // lalu memuat berkas itu sebagai worker tiruan di utas yang sama. Untai
  // kosong akan gagal dengan pesan "Setting up fake worker failed".
  // Pemuat ESM Node menolak jalur Windows semacam C:\... dan menuntut URL
  // berskema file://. Ini berbeda dari standardFontDataUrl di bawah, yang
  // justru harus berupa jalur berkas biasa. Keduanya memang tidak seragam.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(AKAR_PDFJS, "legacy", "build", "pdf.worker.mjs")
  ).href;
  return pdfjs;
}

/**
 * Memecah satu potongan teks pdf.js menjadi kata beserta kotak batasnya.
 *
 * pdf.js memberi kotak batas per POTONGAN, bukan per kata. Lebar tiap kata
 * diperkirakan sebanding dengan jumlah karakternya. Perkiraan ini tidak
 * sempurna untuk fonta proporsional, tetapi sorotan berbentuk kotak di
 * belakang teks memang memaafkan selisih beberapa titik. Yang penting kata
 * pertama dan terakhir sebuah frasa jatuh pada baris dan posisi yang benar.
 */
function pecahJadiKata(
  item: TextItem,
  halaman: number,
  tinggiHalaman: number,
  mulaiUrutan: number
): Kata[] {
  const teks = item.str;
  if (!teks.trim()) return [];

  const [, , , , e, f] = item.transform as number[];
  const tinggi = Math.abs(item.height) || 10;
  // pdf.js memakai titik asal kiri BAWAH. Diubah ke kiri atas.
  const yAtas = tinggiHalaman - f - tinggi;
  const lebarTotal = item.width;
  const perKarakter = teks.length > 0 ? lebarTotal / teks.length : 0;

  const hasil: Kata[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(teks)) !== null) {
    hasil.push({
      teks: m[0],
      halaman,
      x: e + m.index * perKarakter,
      y: yAtas,
      lebar: m[0].length * perKarakter,
      tinggi,
      urutan: mulaiUrutan + n,
    });
    n++;
  }
  return hasil;
}

export async function bacaKata(data: Uint8Array): Promise<HasilBaca> {
  const pdfjs = await muatPdfjs();
  // Tanpa standardFontDataUrl, pdf.js memperingatkan pada tiap fonta baku
  // dan metrik lebar teksnya jadi kurang tepat, yang langsung merusak posisi
  // kotak sorotan.
  const fontaBaku = jalurDirektori("standard_fonts");

  const tugas = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    disableFontFace: true,
    standardFontDataUrl: fontaBaku,
  });
  const dok = await tugas.promise;

  const halaman: HalamanPdf[] = [];
  const kata: Kata[] = [];
  let urutan = 0;

  for (let i = 1; i <= dok.numPages; i++) {
    const hal = await dok.getPage(i);
    const viewport = hal.getViewport({ scale: 1 });
    const isi = await hal.getTextContent();

    const potongan = isi.items.filter((it): it is TextItem => "str" in it);
    const kataHalaman: Kata[] = [];
    for (const it of potongan) {
      const kk = pecahJadiKata(it, i, viewport.height, urutan);
      kataHalaman.push(...kk);
      urutan += kk.length;
    }
    kata.push(...kataHalaman);

    halaman.push({
      nomor: i,
      lebar: viewport.width,
      tinggi: viewport.height,
      // Teks halaman dirakit dari daftar kata, bukan dari penggabungan
      // potongan pdf.js. Menggabungkan potongan begitu saja melekatkan kata
      // terakhir sebuah baris ke kata pertama baris berikutnya, misalnya
      // "denganmemenuhi". Teks rusak itu ikut terkirim ke model dan juga
      // membuat pencocokan meleset. Merakit dari kata menjamin teks yang
      // dibaca model sama persis dengan yang ditelusuri pencocok.
      teks: kataHalaman.map((k) => k.teks).join(" "),
    });
    hal.cleanup();
  }

  // Tugas pemuatan yang menyimpan sumber daya, bukan proksi dokumennya.
  await tugas.destroy();
  return { halaman, kata };
}
