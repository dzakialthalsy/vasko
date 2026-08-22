// Penyedia Anthropic.
//
// Jalur ini yang dipakai untuk dokumen sungguhan dan untuk demonstrasi, sebab
// datanya tidak dipakai melatih model. Berbayar, sekitar Rp127 sekali
// ekstraksi memakai Claude Haiku 4.5 pada dokumen 24 halaman.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MEDAN } from "../medan";
import {
  SISTEM,
  pesanPengguna,
  rapikan,
  type HasilPenyedia,
  type Penyedia,
} from "./bersama";

// Skema Zod disusun dari katalog medan yang sama dengan skema JSON pada
// penyedia lain, sehingga kedua jalur meminta bentuk keluaran yang identik.
function skemaZod() {
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

export function buatPenyediaAnthropic(): Penyedia {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  return {
    nama: `anthropic:${model}`,

    async ekstrak(teks: string): Promise<HasilPenyedia> {
      const client = new Anthropic();

      const respons = await client.messages.parse({
        model,
        max_tokens: 8000,
        system: SISTEM,
        // Menyalin nilai bukan pekerjaan menalar berlapis, jadi upaya rendah
        // memangkas biaya dan waktu tanpa menurunkan ketepatan.
        output_config: {
          effort: "low",
          format: zodOutputFormat(skemaZod()),
        },
        messages: [{ role: "user", content: pesanPengguna(teks) }],
      });

      if (respons.stop_reason === "refusal") {
        throw new Error(
          `Permintaan ditolak model. Kategori: ${respons.stop_details?.category ?? "tidak diketahui"}`
        );
      }
      if (!respons.parsed_output) {
        throw new Error("Model tidak mengembalikan keluaran terstruktur yang dapat dibaca.");
      }

      const { medan, termin } = rapikan(respons.parsed_output);
      return {
        nilai: medan,
        termin,
        model: respons.model,
        tokenMasukan: respons.usage.input_tokens,
        tokenKeluaran: respons.usage.output_tokens,
      };
    },
  };
}
