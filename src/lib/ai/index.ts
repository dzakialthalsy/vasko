// Pemilih klien AI untuk tugas-tugas baru.
//
// Memakai variabel EKSTRAKSI_PENYEDIA yang sama dengan ekstraksi kontrak,
// sehingga satu pengaturan menentukan semua jalur:
//
//   EKSTRAKSI_PENYEDIA=openai       berbayar, untuk dokumen sungguhan
//   EKSTRAKSI_PENYEDIA=anthropic    berbayar, untuk dokumen sungguhan
//   EKSTRAKSI_PENYEDIA=openrouter   gratis, HANYA untuk dokumen sintetis
//
// Bila tidak diisi, penyedia dipilih dari kunci yang tersedia. Yang berbayar
// didahulukan, supaya dokumen sungguhan tidak pernah lewat jalur gratis
// karena kelalaian.

import { buatKlienAnthropic } from "./klien-anthropic";
import { buatKlienOpenAIDariEnv, buatKlienOpenRouterDariEnv } from "./klien-openai";
import type { KlienAI } from "./klien";

export type { KlienAI, PermintaanAI, JawabanAI } from "./klien";

export function pilihKlien(): KlienAI {
  const pilihan = (process.env.EKSTRAKSI_PENYEDIA ?? "").trim().toLowerCase();

  if (pilihan === "openai") return buatKlienOpenAIDariEnv();
  if (pilihan === "anthropic") return buatKlienAnthropic();
  if (pilihan === "openrouter") return buatKlienOpenRouterDariEnv();
  if (pilihan !== "") {
    throw new Error(
      `EKSTRAKSI_PENYEDIA bernilai "${pilihan}", yang tidak dikenal. Isi dengan openai, anthropic, atau openrouter.`
    );
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) return buatKlienOpenAIDariEnv();
  if (process.env.ANTHROPIC_API_KEY) return buatKlienAnthropic();
  if (process.env.OPENROUTER_API_KEY) return buatKlienOpenRouterDariEnv();

  throw new Error(
    "Belum ada kunci API. Isi OPENAI_API_KEY dan OPENAI_MODEL, atau ANTHROPIC_API_KEY, atau OPENROUTER_API_KEY di .env.local."
  );
}
