// Klien tiruan untuk pengujian, TANPA memanggil jaringan.
//
// Penangan menerima permintaan lalu mengembalikan keluaran yang sudah
// ditentukan. Keluarannya tetap divalidasi terhadap skema zod seperti pada
// klien sungguhan, sehingga kesalahan bentuk keluaran tetap tertangkap.
//
// Hasilnya selalu bernama model "tiruan". Biaya model ini 0, dan tidak ada
// yang boleh mengira keluarannya berasal dari AI sungguhan.

import { GalatKeluaranAI, type JawabanAI, type KlienAI, type PermintaanAI } from "./klien";

export type PenganganTiruan = (p: PermintaanAI<unknown>) => unknown | Promise<unknown>;

export type KlienTiruan = KlienAI & {
  /** Seluruh permintaan yang diterima, berurutan. Berguna untuk menguji prompt. */
  readonly permintaan: PermintaanAI<unknown>[];
};

/** Perkiraan kasar token, 3,5 huruf per token, sama dengan asumsi pada RAB. */
const kiraToken = (teks: string) => Math.ceil(teks.length / 3.5);

export function buatKlienTiruan(penangan: PenganganTiruan): KlienTiruan {
  const permintaan: PermintaanAI<unknown>[] = [];

  return {
    nama: "tiruan",
    permintaan,

    async selesaikan<T>(p: PermintaanAI<T>): Promise<JawabanAI<T>> {
      permintaan.push(p as PermintaanAI<unknown>);
      const mentah = await penangan(p as PermintaanAI<unknown>);

      const sah = p.skema.safeParse(mentah);
      if (!sah.success) {
        throw new GalatKeluaranAI(
          `keluaran tiruan tidak sesuai skema ${p.nama}: ` +
            sah.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(akar)"}: ${i.message}`).join("; ")
        );
      }

      return {
        isi: sah.data,
        model: "tiruan",
        tokenMasuk: kiraToken(p.sistem) + kiraToken(p.pengguna),
        tokenKeluar: kiraToken(JSON.stringify(mentah)),
      };
    },
  };
}
