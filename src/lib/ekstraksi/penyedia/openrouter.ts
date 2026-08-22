// Penyedia OpenRouter.
//
// Dipakai untuk pengembangan dan pengujian memakai DOKUMEN SINTETIS saja.
// Endpoint gratis di OpenRouter gratis karena penyedia di baliknya umumnya
// boleh memakai data yang dikirim. Jangan pernah mengirim kontrak Pertamina
// yang sebenarnya lewat jalur ini. Untuk dokumen nyata, pakai penyedia
// Anthropic yang berbayar.
//
// API-nya mengikuti gaya OpenAI, jadi dipanggil lewat HTTP biasa. Tidak ada
// SDK yang dipasang untuk ini, supaya ketergantungan proyek tetap sedikit dan
// bentuk permintaannya terlihat apa adanya.

import { MEDAN } from "../medan";
import {
  SISTEM,
  pesanPengguna,
  rapikan,
  skemaJson,
  type HasilPenyedia,
  type Penyedia,
} from "./bersama";

const ALAMAT = "https://openrouter.ai/api/v1/chat/completions";

// Hanya model gratis yang mendukung structured outputs yang masuk akal di
// sini. Daftarnya berubah sewaktu-waktu; periksa dengan
// npx tsx scripts/model-openrouter.ts
const BAWAAN = "z-ai/glm-5.2:free";

// Endpoint gratis diperebutkan banyak pengguna, sehingga penyedia di baliknya
// kerap membalas 429 atau 503 walau kuota harian Anda sendiri masih utuh.
// Karena itu permintaan dicoba ke beberapa model berurutan, bukan menyerah
// pada model pertama yang sedang sibuk.
const CADANGAN_BAWAAN = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-9b-v2:free",
];

/** Jeda sebelum percobaan ke-1, ke-2, dan ke-3 pada satu model yang sama. */
const JEDA_MS = [0, 1500, 4000];

type BalasanOpenRouter = {
  choices?: { message?: { content?: string } }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number; metadata?: Record<string, unknown> };
};

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Merangkai keterangan galat selengkap mungkin.
 *
 * OpenRouter menaruh pesan asli dari penyedia hulu di dalam metadata. Tanpa
 * membacanya, seluruh kegagalan tampak sama, yaitu "Provider returned error",
 * yang tidak memberi tahu apa pun tentang penyebabnya.
 */
function jelaskanGalat(status: number, j: BalasanOpenRouter): string {
  const bagian = [`${status}`, j.error?.message ?? "tanpa keterangan"];
  const meta = j.error?.metadata;
  if (meta) {
    const dalam = meta.raw ?? meta.provider_name ?? meta;
    const teks = typeof dalam === "string" ? dalam : JSON.stringify(dalam);
    if (teks && teks !== "{}") bagian.push(teks.slice(0, 200));
  }
  return bagian.join(" | ");
}

/** Satu kali panggilan ke satu model. Melempar bila gagal. */
async function sekaliPanggil(
  kunci: string,
  model: string,
  teks: string
): Promise<HasilPenyedia> {
  const r = await fetch(ALAMAT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kunci}`,
      "Content-Type": "application/json",
      // Dua tajuk opsional ini dipakai OpenRouter untuk atribusi.
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "VASKO",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SISTEM },
        { role: "user", content: pesanPengguna(teks) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "medan_kontrak", strict: true, schema: skemaJson() },
      },
    }),
  });

  const j = (await r.json().catch(() => ({}))) as BalasanOpenRouter;

  if (!r.ok || j.error) {
    throw new Error(jelaskanGalat(r.status, j));
  }

  const isi = j.choices?.[0]?.message?.content;
  if (!isi) throw new Error("balasan tanpa isi jawaban");

  // OpenRouter menyatakan kepatuhan skema tidak dijamin di setiap endpoint.
  // Sebagian penyedia membungkus JSON dalam pagar kode markdown, jadi
  // pagarnya dilucuti dulu sebelum diurai.
  const bersih = isi.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let mentah: unknown;
  try {
    mentah = JSON.parse(bersih);
  } catch {
    throw new Error(`jawaban bukan JSON yang sah, cuplikan: ${bersih.slice(0, 120)}`);
  }

  const { medan, termin } = rapikan(mentah);
  if (MEDAN.every((m) => medan[m.kunci] === null)) {
    throw new Error("JSON sah tetapi seluruh medan kosong");
  }

  return {
    nilai: medan,
    termin,
    model: j.model ?? model,
    tokenMasukan: j.usage?.prompt_tokens ?? 0,
    tokenKeluaran: j.usage?.completion_tokens ?? 0,
  };
}

export function buatPenyediaOpenRouter(): Penyedia {
  const kunci = process.env.OPENROUTER_API_KEY;
  const utama = process.env.OPENROUTER_MODEL ?? BAWAAN;
  const cadangan = (process.env.OPENROUTER_MODEL_CADANGAN ?? CADANGAN_BAWAAN.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== utama);
  const daftar = [utama, ...cadangan];

  let terpakai = utama;

  return {
    get nama() {
      return `openrouter:${terpakai}`;
    },

    async ekstrak(teks: string): Promise<HasilPenyedia> {
      if (!kunci) {
        throw new Error(
          "OPENROUTER_API_KEY belum diisi. Ambil kunci gratis di openrouter.ai/keys lalu isikan ke .env.local."
        );
      }

      const kegagalan: string[] = [];

      for (const model of daftar) {
        for (let coba = 0; coba < JEDA_MS.length; coba++) {
          if (JEDA_MS[coba] > 0) await tidur(JEDA_MS[coba]);
          try {
            const hasil = await sekaliPanggil(kunci, model, teks);
            terpakai = model;
            return hasil;
          } catch (e) {
            const pesan = e instanceof Error ? e.message : String(e);
            const sibuk = /^(429|502|503|504)\b/.test(pesan);
            if (!sibuk) {
              // Galat yang bukan karena sibuk tidak akan membaik dengan
              // menunggu, jadi langsung pindah ke model berikutnya.
              kegagalan.push(`${model}: ${pesan}`);
              break;
            }
            if (coba === JEDA_MS.length - 1) {
              kegagalan.push(`${model}: sibuk setelah ${JEDA_MS.length} percobaan, ${pesan}`);
            }
          }
        }
      }

      throw new Error(
        `Seluruh ${daftar.length} model OpenRouter gagal dihubungi.\n` +
          kegagalan.map((k) => `  - ${k}`).join("\n")
      );
    },
  };
}
