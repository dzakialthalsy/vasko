// Pemilih penyedia model.
//
// Satu variabel lingkungan menentukan jalur mana yang dipakai, sehingga
// berpindah penyedia tidak menyentuh kode mana pun:
//
//   EKSTRAKSI_PENYEDIA=openrouter   gratis, HANYA untuk dokumen sintetis
//   EKSTRAKSI_PENYEDIA=anthropic    berbayar, untuk dokumen sungguhan
//   EKSTRAKSI_PENYEDIA=openai       berbayar, untuk dokumen sungguhan
//                                   (pilihan tim: GPT-6 Luna, lewat OPENAI_MODEL)
//
// Bila tidak diisi, penyedia dipilih dari kunci API yang tersedia, dengan
// OpenRouter didahulukan karena itu jalur tanpa biaya.

import { buatKlienOpenAIDariEnv } from "@/lib/ai/klien-openai";
import { buatPenyediaAnthropic } from "./anthropic";
import { buatPenyediaDariKlien } from "./dari-klien";
import { buatPenyediaOpenRouter } from "./openrouter";
import type { Penyedia } from "./bersama";

export type { Penyedia, HasilPenyedia, HasilEkstraksiModel } from "./bersama";

export function pilihPenyedia(): Penyedia {
  const pilihan = (process.env.EKSTRAKSI_PENYEDIA ?? "").trim().toLowerCase();

  if (pilihan === "openrouter") return buatPenyediaOpenRouter();
  if (pilihan === "anthropic") return buatPenyediaAnthropic();
  if (pilihan === "openai") return buatPenyediaDariKlien(buatKlienOpenAIDariEnv());
  if (pilihan !== "") {
    throw new Error(
      `EKSTRAKSI_PENYEDIA bernilai "${pilihan}", yang tidak dikenal. Isi dengan openrouter, anthropic, atau openai.`
    );
  }

  if (process.env.OPENROUTER_API_KEY) return buatPenyediaOpenRouter();
  if (process.env.ANTHROPIC_API_KEY) return buatPenyediaAnthropic();

  throw new Error(
    "Belum ada kunci API. Isi OPENROUTER_API_KEY atau ANTHROPIC_API_KEY di .env.local."
  );
}
