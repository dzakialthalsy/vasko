// Memverifikasi kutipan dari AI terhadap teks PDF yang sebenarnya.
//
// Setiap temuan, fakta, dan pernyataan yang dikembalikan model wajib disertai
// kutipan yang disalin dari dokumen. Kutipan itu dicocokkan balik ke daftar
// kata PDF. Yang tidak ditemukan dianggap karangan model dan tidak dipakai
// untuk keputusan apa pun. Dari kecocokan itu juga diperoleh kotak sorotan
// dan angka keyakinan, tanpa pernah menanyakannya kepada model.

import { cocokkan, type HasilCocok } from "@/lib/pdf/cocok";
import type { Kata } from "@/lib/pdf/kata";

/**
 * Kutipan harus nyaris persis. Ambang pada cocokkan() yang bawaannya 0,72
 * terlalu longgar untuk klaim "disalin apa adanya", jadi dinaikkan.
 */
export const AMBANG_KUTIPAN = 0.85;

export type HasilKutipan = HasilCocok & {
  /** Benar bila kutipan ditemukan cukup mirip di dokumen. */
  terverifikasi: boolean;
};

export function verifikasiKutipan(kutipan: string, kata: Kata[]): HasilKutipan {
  const bersih = kutipan.trim();
  // Kutipan terlalu pendek mudah cocok secara kebetulan di mana saja.
  if (bersih.length < 6) {
    return { ditemukan: false, keyakinan: 0, teksSumber: "", halaman: null, kotak: [], terverifikasi: false };
  }
  const c = cocokkan(bersih, kata);
  return { ...c, terverifikasi: c.ditemukan && c.keyakinan >= AMBANG_KUTIPAN };
}

/** Menyalin kotak sorotan dengan nomor dokumen, siap disimpan ke tabel sorotan. */
export function kotakUntukSimpan(hasil: Pick<HasilCocok, "kotak">, dokumenId: string) {
  return hasil.kotak.map((k) => ({
    dokumenId,
    halaman: k.halaman,
    x: k.x,
    y: k.y,
    lebar: k.lebar,
    tinggi: k.tinggi,
  }));
}
