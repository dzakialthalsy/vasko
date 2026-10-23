// Mengubah klien AI umum (src/lib/ai) menjadi penyedia ekstraksi kontrak.
//
// Dengan adaptor ini, penyedia baru cukup ditulis sekali sebagai klien AI dan
// otomatis bisa dipakai untuk ekstraksi kontrak maupun tugas validasi dan
// amendemen. Prompt dan skema ekstraksi tetap yang di bersama.ts, jadi hasil
// antar penyedia tetap bisa dibandingkan secara adil.

import type { KlienAI } from "@/lib/ai/klien";
import { SISTEM, pesanPengguna, rapikan, skemaZod, type HasilPenyedia, type Penyedia } from "./bersama";

export function buatPenyediaDariKlien(klien: KlienAI): Penyedia {
  return {
    get nama() {
      return klien.nama;
    },

    async ekstrak(teks: string): Promise<HasilPenyedia> {
      const j = await klien.selesaikan({
        nama: "medan_kontrak",
        sistem: SISTEM,
        pengguna: pesanPengguna(teks),
        skema: skemaZod(),
      });
      const { medan, termin } = rapikan(j.isi);
      return {
        nilai: medan,
        termin,
        model: j.model,
        tokenMasukan: j.tokenMasuk,
        tokenKeluaran: j.tokenKeluar,
      };
    },
  };
}
