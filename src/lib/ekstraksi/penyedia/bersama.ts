// Bagian yang dipakai bersama seluruh penyedia model.
//
// Sistem prompt dan skema keluaran sengaja ditaruh di sini, bukan disalin ke
// tiap penyedia. Kalau keduanya berbeda antar penyedia, hasil ekstraksinya
// tidak bisa dibandingkan secara adil, dan uji akurasi kehilangan artinya.

import { z } from "zod";

import { MEDAN } from "../medan";

import type { TerminMentah } from "../termin";

export type HasilEkstraksiModel = Record<string, string | null>;

/** Keluaran penuh model: sepuluh medan kepala plus daftar termin. */
export type KeluaranModel = {
  medan: HasilEkstraksiModel;
  termin: TerminMentah[];
};

export type HasilPenyedia = {
  nilai: HasilEkstraksiModel;
  termin: TerminMentah[];
  model: string;
  tokenMasukan: number;
  tokenKeluaran: number;
};

export type Penyedia = {
  nama: string;
  ekstrak(teks: string): Promise<HasilPenyedia>;
};

export const SISTEM = `Anda membaca dokumen kontrak pengadaan berbahasa Indonesia milik PT Pertamina Patra Niaga.

Tugas Anda hanya satu: menyalin nilai medan yang diminta dari teks dokumen.

Aturan yang mengikat:
1. Salin nilai APA ADANYA seperti tertulis di dokumen. Jangan mengubah format angka, jangan mengubah nama bulan, jangan membulatkan, dan jangan menerjemahkan.
2. Bila sebuah medan tidak tercantum di dokumen, kembalikan null. Jangan menebak dan jangan menyimpulkan dari medan lain.
3. Jangan menghitung apa pun. Bila dokumen menyebut tarif denda, salin tarifnya, jangan menghitung nominal dendanya.
4. Untuk nilai uang, sertakan awalan Rp dan titik pemisah ribuan seperti di dokumen, tanpa terbilang dalam kurung dan tanpa akhiran koma strip.
5. PIHAK PERTAMA adalah PT Pertamina Patra Niaga. PIHAK KEDUA adalah vendor penyedia. Yang diminta sebagai nama vendor adalah PIHAK KEDUA.

Selain medan kepala kontrak, ekstraksi juga daftar TERMIN PEMBAYARAN dari lampiran tata cara pembayaran:
6. Ambil SELURUH termin yang tercantum, satu baris untuk tiap termin, berurutan dari termin pertama.
7. Nominal tiap termin disalin apa adanya beserta awalan Rp dan titik pemisah ribuan.
8. Syarat diisi ringkas, yaitu peristiwa yang memicu pembayaran termin itu, misalnya Mobilisasi dan Tahap 1.
9. Jatuh tempo disalin apa adanya seperti tertulis, misalnya 25 Mei 2026. Kembalikan null bila tanggalnya tidak disebutkan.
10. Jangan menjumlahkan, jangan menghitung ulang, dan jangan mengarang termin yang tidak tercantum. Bila dokumen tidak memuat rincian termin, kembalikan daftar kosong.`;

export function pesanPengguna(teks: string): string {
  return `Berikut teks lengkap dokumen kontrak. Ekstraksi medan yang diminta.\n\n${teks}`;
}

/**
 * Skema JSON keluaran, disusun dari katalog medan.
 *
 * additionalProperties false dan seluruh kunci wajib ada, karena mode ketat
 * pada penyedia yang mengikuti gaya OpenAI menuntut keduanya. Nilai boleh
 * null supaya model punya jalan keluar yang jujur ketika medan memang tidak
 * tercantum, alih-alih mengarang isian.
 */
export function skemaJson() {
  const properties: Record<string, unknown> = {};
  for (const m of MEDAN) {
    properties[m.kunci] = {
      type: ["string", "null"],
      description: `${m.label}. ${m.petunjuk} Kembalikan null bila tidak tercantum.`,
    };
  }
  return {
    type: "object",
    properties: {
      ...properties,
      termin: {
        type: "array",
        description:
          "Daftar termin pembayaran dari lampiran tata cara pembayaran, berurutan. Kosongkan bila dokumen tidak memuatnya.",
        items: {
          type: "object",
          properties: {
            urutan: { type: "integer", description: "Nomor termin, mulai dari 1." },
            nilai: { type: ["string", "null"], description: "Nominal termin apa adanya, contoh Rp1.455.000.000." },
            syarat: { type: ["string", "null"], description: "Peristiwa yang memicu pembayaran termin ini." },
            jatuh_tempo: { type: ["string", "null"], description: "Tanggal jatuh tempo apa adanya, contoh 25 Mei 2026." },
          },
          required: ["urutan", "nilai", "syarat", "jatuh_tempo"],
          additionalProperties: false,
        },
      },
    },
    required: [...MEDAN.map((m) => m.kunci), "termin"],
    additionalProperties: false,
  };
}

/** Menyaring keluaran mentah menjadi bentuk yang dijanjikan tipe. */
export function rapikan(mentah: unknown): KeluaranModel {
  const isi = (mentah ?? {}) as Record<string, unknown>;

  const medan: HasilEkstraksiModel = {};
  for (const m of MEDAN) {
    const v = isi[m.kunci];
    medan[m.kunci] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }

  // Daftar termin disaring apa adanya. Baris yang bentuknya tidak sesuai
  // dibuang di sini, bukan dibiarkan menjalar ke lapisan berikutnya.
  const mentahTermin = Array.isArray(isi.termin) ? isi.termin : [];
  const termin: TerminMentah[] = mentahTermin
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .map((t, i) => ({
      urutan: typeof t.urutan === "number" ? t.urutan : i + 1,
      nilai: typeof t.nilai === "string" && t.nilai.trim() !== "" ? t.nilai.trim() : null,
      syarat: typeof t.syarat === "string" && t.syarat.trim() !== "" ? t.syarat.trim() : null,
      jatuh_tempo:
        typeof t.jatuh_tempo === "string" && t.jatuh_tempo.trim() !== ""
          ? t.jatuh_tempo.trim()
          : null,
    }));

  return { medan, termin };
}

// Skema Zod disusun dari katalog medan yang sama dengan skema JSON pada
// penyedia lain, sehingga kedua jalur meminta bentuk keluaran yang identik.
export function skemaZod() {
  const bentuk: Record<string, z.ZodTypeAny> = {};
  for (const m of MEDAN) {
    bentuk[m.kunci] = z
      .string()
      .nullable()
      .describe(`${m.label}. ${m.petunjuk} Kembalikan null bila tidak tercantum.`);
  }
  // Daftar termin, bentuknya harus sama dengan skema JSON pada penyedia lain
  // supaya kedua jalur meminta keluaran yang identik.
  bentuk.termin = z
    .array(
      z.object({
        urutan: z.number().int().describe("Nomor termin, mulai dari 1."),
        nilai: z.string().nullable().describe("Nominal termin apa adanya, contoh Rp1.455.000.000."),
        syarat: z.string().nullable().describe("Peristiwa yang memicu pembayaran termin ini."),
        jatuh_tempo: z.string().nullable().describe("Tanggal jatuh tempo apa adanya, contoh 25 Mei 2026."),
      })
    )
    .describe("Daftar termin pembayaran dari lampiran tata cara pembayaran, berurutan.");
  return z.object(bentuk);
}
