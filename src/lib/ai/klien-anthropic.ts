// Klien Anthropic. Berbayar, dan datanya tidak dipakai melatih model, sehingga
// aman untuk dokumen sungguhan.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GalatKeluaranAI, denganPerbaikan, type JawabanAI, type KlienAI, type PermintaanAI } from "./klien";

export function buatKlienAnthropic(): KlienAI {
  // Variabel kosong di .env.local terbaca teks kosong, jadi dipakai || bukan ??.
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5";

  const dasar: KlienAI = {
    nama: `anthropic:${model}`,

    async selesaikan<T>(p: PermintaanAI<T>): Promise<JawabanAI<T>> {
      const client = new Anthropic();

      const respons = await client.messages.parse({
        model,
        max_tokens: 8000,
        system: p.sistem,
        output_config: {
          effort: p.upaya ?? "low",
          format: zodOutputFormat(p.skema as never),
        },
        messages: [{ role: "user", content: p.pengguna }],
      });

      if (respons.stop_reason === "refusal") {
        throw new Error(`Permintaan ditolak model. Kategori: ${respons.stop_details?.category ?? "tidak diketahui"}`);
      }
      if (!respons.parsed_output) {
        throw new GalatKeluaranAI(
          "model tidak mengembalikan keluaran terstruktur yang dapat dibaca",
          respons.usage.input_tokens,
          respons.usage.output_tokens
        );
      }

      // Sudah diurai SDK dengan skema yang sama, tetapi tetap divalidasi ulang
      // supaya aturan tambahan pada skema (refine) ikut berlaku.
      const sah = p.skema.safeParse(respons.parsed_output);
      if (!sah.success) {
        throw new GalatKeluaranAI(
          `JSON tidak sesuai skema: ${sah.error.issues.slice(0, 3).map((i) => i.message).join("; ")}`,
          respons.usage.input_tokens,
          respons.usage.output_tokens
        );
      }

      return {
        isi: sah.data,
        model: respons.model,
        tokenMasuk: respons.usage.input_tokens,
        tokenKeluar: respons.usage.output_tokens,
      };
    },
  };

  return denganPerbaikan(dasar);
}
