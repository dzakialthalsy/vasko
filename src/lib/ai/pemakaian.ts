// Mencatat setiap pemakaian AI ke tabel pemakaian_ai, supaya biaya nyata bisa
// dibandingkan dengan RAB.

import type { Prisma } from "@/generated/prisma/client";
import { hitungBiayaUsd } from "./harga";
import type { JawabanAI } from "./klien";

type Db = Prisma.TransactionClient;

export type RujukanPemakaian = {
  validasiId?: string;
  ekstraksiId?: string;
  amendemenId?: string;
};

export async function catatPemakaian(
  db: Db,
  proses: "EKSTRAKSI" | "VALIDASI" | "AMANDEMEN" | "PERBANDINGAN",
  jawaban: Pick<JawabanAI<unknown>, "model" | "tokenMasuk" | "tokenKeluar">,
  rujukan: RujukanPemakaian = {},
  olehPenggunaId?: string | null
) {
  const biaya = hitungBiayaUsd(jawaban.model, jawaban.tokenMasuk, jawaban.tokenKeluar);
  return db.pemakaianAI.create({
    data: {
      proses,
      model: jawaban.model,
      tokenMasuk: jawaban.tokenMasuk,
      tokenKeluar: jawaban.tokenKeluar,
      biayaUsd: biaya,
      validasiId: rujukan.validasiId ?? null,
      ekstraksiId: rujukan.ekstraksiId ?? null,
      amendemenId: rujukan.amendemenId ?? null,
      olehPenggunaId: olehPenggunaId ?? null,
    },
  });
}
