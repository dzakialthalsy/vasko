// Klien untuk API bergaya OpenAI (chat completions dengan json_schema).
//
// Dipakai untuk dua tujuan lewat satu kode:
//   - OpenAI langsung, untuk dokumen sungguhan (pilihan tim: GPT-6 Luna)
//   - OpenRouter, HANYA untuk dokumen sintetis. Endpoint gratisnya boleh
//     memakai data yang dikirim, jadi jangan pernah dipakai untuk kontrak
//     Pertamina yang sebenarnya.
//
// Dipanggil lewat HTTP biasa tanpa SDK, supaya bentuk permintaannya terlihat
// apa adanya dan ketergantungan proyek tetap sedikit.

import {
  GalatKeluaranAI,
  denganPerbaikan,
  skemaJson,
  uraiKeluaran,
  type JawabanAI,
  type KlienAI,
  type PermintaanAI,
} from "./klien";

export type OpsiKlienOpenAI = {
  nama: string;
  alamat: string;
  kunci: string;
  model: string;
  /** Model cadangan, dicoba berurutan bila model utama gagal. */
  cadangan?: string[];
  header?: Record<string, string>;
  /**
   * Suhu pengambilan sampel. Null berarti tidak dikirim. Sebagian model
   * penalaran menolak parameter ini, jadi bawaan untuk OpenAI adalah tidak
   * mengirimnya.
   */
  suhu?: number | null;
  /**
   * Batas token keluaran, dikirim sebagai max_tokens. Kosong berarti tidak
   * dikirim. Model penalaran menghabiskan sebagian jatah ini untuk berpikir;
   * bila jatahnya kecil, isi jawaban bisa kosong sama sekali.
   */
  maxTokens?: number | null;
  /** Jeda sebelum percobaan ke-1, ke-2, dan ke-3 pada satu model yang sama. */
  jedaMs?: number[];
};

type Balasan = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number | string; metadata?: Record<string, unknown> };
};

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jelaskanGalat(status: number, j: Balasan): string {
  const bagian = [`${status}`, j.error?.message ?? "tanpa keterangan"];
  const meta = j.error?.metadata;
  if (meta) {
    const dalam = meta.raw ?? meta.provider_name ?? meta;
    const teks = typeof dalam === "string" ? dalam : JSON.stringify(dalam);
    if (teks && teks !== "{}") bagian.push(teks.slice(0, 200));
  }
  return bagian.join(" | ");
}

async function sekaliPanggil<T>(opsi: OpsiKlienOpenAI, model: string, p: PermintaanAI<T>): Promise<JawabanAI<T>> {
  const badan: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: p.sistem },
      { role: "user", content: p.pengguna },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: p.nama, strict: true, schema: skemaJson(p.skema) },
    },
  };
  if (opsi.suhu !== null && opsi.suhu !== undefined) badan.temperature = opsi.suhu;
  if (opsi.maxTokens !== null && opsi.maxTokens !== undefined) badan.max_tokens = opsi.maxTokens;

  const r = await fetch(opsi.alamat, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opsi.kunci}`,
      "Content-Type": "application/json",
      ...opsi.header,
    },
    body: JSON.stringify(badan),
  });

  const j = (await r.json().catch(() => ({}))) as Balasan;
  if (!r.ok || j.error) throw new Error(jelaskanGalat(r.status, j));

  const isi = j.choices?.[0]?.message?.content;
  const tokenMasuk = j.usage?.prompt_tokens ?? 0;
  const tokenKeluar = j.usage?.completion_tokens ?? 0;
  if (!isi) {
    // finish_reason "length" berarti jatah token habis sebelum jawaban selesai.
    const sebab = j.choices?.[0]?.finish_reason;
    throw new Error(`balasan tanpa isi jawaban${sebab ? ` (finish_reason ${sebab}, ${tokenKeluar} token keluar)` : ""}`);
  }

  return {
    isi: uraiKeluaran(p.skema, isi, tokenMasuk, tokenKeluar),
    model: j.model ?? model,
    tokenMasuk,
    tokenKeluar,
  };
}

export function buatKlienOpenAI(opsi: OpsiKlienOpenAI): KlienAI {
  const daftar = [opsi.model, ...(opsi.cadangan ?? []).filter((m) => m && m !== opsi.model)];
  const jeda = opsi.jedaMs ?? [0, 1500, 4000];
  let terpakai = opsi.model;

  const dasar: KlienAI = {
    get nama() {
      return `${opsi.nama}:${terpakai}`;
    },

    async selesaikan<T>(p: PermintaanAI<T>): Promise<JawabanAI<T>> {
      const kegagalan: string[] = [];

      for (const model of daftar) {
        for (let coba = 0; coba < jeda.length; coba++) {
          if (jeda[coba] > 0) await tidur(jeda[coba]);
          try {
            const hasil = await sekaliPanggil(opsi, model, p);
            terpakai = model;
            return hasil;
          } catch (e) {
            // Keluaran tidak sah diteruskan ke pembungkus perbaikan, yang akan
            // mengulang dengan alasannya. Berpindah model tidak menolong.
            if (e instanceof GalatKeluaranAI) throw e;

            const pesan = e instanceof Error ? e.message : String(e);
            const sibuk = /^(429|502|503|504)\b/.test(pesan);
            if (!sibuk) {
              kegagalan.push(`${model}: ${pesan}`);
              break;
            }
            if (coba === jeda.length - 1) {
              kegagalan.push(`${model}: sibuk setelah ${jeda.length} percobaan, ${pesan}`);
            }
          }
        }
      }

      throw new Error(
        `Seluruh ${daftar.length} model gagal dihubungi.\n` + kegagalan.map((k) => `  - ${k}`).join("\n")
      );
    },
  };

  return denganPerbaikan(dasar);
}

/** OpenAI langsung. Model WAJIB diisi lewat OPENAI_MODEL, tidak ada bawaan. */
export function buatKlienOpenAIDariEnv(): KlienAI {
  const kunci = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL?.trim();
  if (!kunci) throw new Error("OPENAI_API_KEY belum diisi di .env.local.");
  if (!model) {
    throw new Error(
      "OPENAI_MODEL belum diisi di .env.local. Isi dengan ID model sesuai daftar di platform OpenAI, " +
        "misalnya model GPT-6 Luna pilihan tim."
    );
  }
  // Variabel yang dibiarkan kosong di .env.local terbaca sebagai teks kosong,
  // bukan undefined, jadi ?? saja tidak cukup.
  const alamatDasar = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  return buatKlienOpenAI({
    nama: "openai",
    alamat: `${alamatDasar}/chat/completions`,
    kunci,
    model,
    suhu: null,
  });
}

/** OpenRouter. Hanya untuk dokumen sintetis. */
export function buatKlienOpenRouterDariEnv(): KlienAI {
  const kunci = process.env.OPENROUTER_API_KEY;
  if (!kunci) {
    throw new Error(
      "OPENROUTER_API_KEY belum diisi. Ambil kunci gratis di openrouter.ai/keys lalu isikan ke .env.local."
    );
  }
  // Seperti OPENAI_BASE_URL di atas: variabel kosong terbaca teks kosong, jadi dipakai || bukan ??.
  const utama = process.env.OPENROUTER_MODEL?.trim() || "z-ai/glm-5.2:free";
  const cadangan = (
    process.env.OPENROUTER_MODEL_CADANGAN?.trim() ||
    "nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free,nvidia/nemotron-nano-9b-v2:free"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return buatKlienOpenAI({
    nama: "openrouter",
    alamat: "https://openrouter.ai/api/v1/chat/completions",
    kunci,
    model: utama,
    cadangan,
    header: { "HTTP-Referer": "http://localhost:3000", "X-Title": "VASKO" },
    suhu: 0,
    // Model gratis di sini umumnya model penalaran. Tanpa batas yang longgar,
    // jatah bawaan penyedia bisa habis untuk berpikir dan jawabannya kosong.
    maxTokens: 16000,
  });
}
