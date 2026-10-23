// Antarmuka klien AI yang dipakai semua tugas baru: baca dokumen pendukung,
// pemeriksaan klausul, baca amendemen, dan perbandingan versi.
//
// Satu bentuk permintaan untuk semua penyedia: sistem prompt, pesan pengguna,
// dan skema zod keluaran. Keluaran SELALU divalidasi terhadap skema itu di
// sini, bukan dipercaya begitu saja dari penyedia, karena mode ketat tidak
// dijamin di setiap endpoint.
//
// Prinsip yang tidak berubah: model hanya membaca dan menyalin. Angka
// keyakinan, koordinat sorotan, selisih nilai, dan keputusan lulus atau tidak
// dihitung oleh kode, bukan diminta dari model.

import { z } from "zod";

export type PermintaanAI<T> = {
  /** Nama skema. Sebagian penyedia meminta nama pada json_schema. */
  nama: string;
  sistem: string;
  pengguna: string;
  skema: z.ZodType<T>;
  /** Upaya menalar, untuk penyedia yang mendukungnya. Bawaan low. */
  upaya?: "low" | "medium" | "high";
};

export type JawabanAI<T> = {
  isi: T;
  model: string;
  tokenMasuk: number;
  tokenKeluar: number;
};

export interface KlienAI {
  readonly nama: string;
  selesaikan<T>(p: PermintaanAI<T>): Promise<JawabanAI<T>>;
}

/** Galat khusus untuk keluaran yang tidak sah. Hanya jenis ini yang diulang. */
export class GalatKeluaranAI extends Error {
  constructor(
    pesan: string,
    readonly tokenMasuk = 0,
    readonly tokenKeluar = 0
  ) {
    super(pesan);
    this.name = "GalatKeluaranAI";
  }
}

/** Skema JSON dari skema zod, tanpa kunci $schema yang ditolak sebagian API. */
export function skemaJson(skema: z.ZodType): Record<string, unknown> {
  const { $schema: _abaikan, ...sisa } = z.toJSONSchema(skema, { target: "draft-7" }) as Record<string, unknown>;
  void _abaikan;
  return sisa;
}

/**
 * Mengurai teks jawaban menjadi nilai bertipe.
 *
 * Sebagian penyedia membungkus JSON dalam pagar kode markdown walau diminta
 * tidak, jadi pagarnya dilucuti dulu.
 */
export function uraiKeluaran<T>(skema: z.ZodType<T>, teks: string, tokenMasuk = 0, tokenKeluar = 0): T {
  const bersih = teks.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let mentah: unknown;
  try {
    mentah = JSON.parse(bersih);
  } catch {
    throw new GalatKeluaranAI(`jawaban bukan JSON yang sah, cuplikan: ${bersih.slice(0, 120)}`, tokenMasuk, tokenKeluar);
  }

  const hasil = skema.safeParse(mentah);
  if (!hasil.success) {
    const ringkas = hasil.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(akar)"}: ${i.message}`)
      .join("; ");
    throw new GalatKeluaranAI(`JSON tidak sesuai skema: ${ringkas}`, tokenMasuk, tokenKeluar);
  }
  return hasil.data;
}

/**
 * Membungkus klien supaya keluaran yang tidak sah diulang SEKALI, dengan
 * menyertakan alasan penolakannya. Galat lain, seperti kunci salah atau
 * kredit habis, tidak diulang karena tidak akan membaik.
 */
export function denganPerbaikan(dasar: KlienAI): KlienAI {
  return {
    get nama() {
      return dasar.nama;
    },
    async selesaikan<T>(p: PermintaanAI<T>): Promise<JawabanAI<T>> {
      try {
        return await dasar.selesaikan(p);
      } catch (e) {
        if (!(e instanceof GalatKeluaranAI)) throw e;
        const kedua = await dasar.selesaikan({
          ...p,
          pengguna:
            `${p.pengguna}\n\nCatatan: jawaban Anda sebelumnya ditolak karena ${e.message}. ` +
            "Kembalikan JSON yang sesuai skema, tanpa teks lain.",
        });
        return {
          ...kedua,
          tokenMasuk: kedua.tokenMasuk + e.tokenMasuk,
          tokenKeluar: kedua.tokenKeluar + e.tokenKeluar,
        };
      }
    },
  };
}
