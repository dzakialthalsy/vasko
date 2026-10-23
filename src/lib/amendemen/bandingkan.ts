// Tugas AI: menyusun perbandingan klausul antara versi sebelumnya dan amendemen.
//
// Untuk halaman Bandingkan Versi. Angkanya (selisih nilai, persen, selisih
// hari) dihitung kode di hitung.ts dan hanya diteruskan ke sini sebagai
// konteks. AI hanya merangkum klausul yang berubah dan alasannya.
//
// Pasal versi sebelumnya TIDAK dicari oleh model. Kode yang mengambilnya dari
// teks kontrak berdasarkan nama pasal yang disebut amendemen, lalu menyerahkan
// potongannya. Dengan begitu bagian "sebelum" selalu berasal dari kontrak
// yang sebenarnya, bukan dari ingatan model.

import { z } from "zod";
import type { KlienAI } from "@/lib/ai/klien";
import { verifikasiKutipan } from "@/lib/dokumen/verifikasi";
import type { Kata } from "@/lib/pdf/kata";

export const SkemaBandingkan = z.object({
  ringkasan_perubahan: z.string().describe("2 sampai 4 kalimat sederhana tentang apa yang berubah."),
  alasan_perubahan: z
    .string()
    .nullable()
    .describe("Alasan perubahan BILA tertulis di amendemen atau dokumen pendukungnya. Null bila tidak disebut."),
  aspek: z.array(
    z.object({
      nama: z.string().describe("Nama singkat hal yang berubah, misalnya Masa penyelesaian."),
      sebelum: z.string().describe("Isi pada versi sebelumnya, disalin dari potongan pasal yang diberikan."),
      sesudah: z.string().describe("Isi pada amendemen, disalin dari teks amendemen."),
      perubahan: z.enum(["BERUBAH", "BARU", "DIHAPUS"]),
      kutipan_sesudah: z.string().describe("Potongan kalimat PERSIS dari teks amendemen yang memuat isi sesudah."),
    })
  ),
});

export type KeluaranBandingkan = z.infer<typeof SkemaBandingkan>;

export const SISTEM_BANDINGKAN = `Anda menyusun perbandingan antara versi sebelumnya sebuah kontrak pengadaan dan amendemennya, dalam bahasa Indonesia yang sederhana.

Anda diberi: (1) POTONGAN PASAL versi sebelumnya yang diambil dari kontrak, (2) TEKS AMENDEMEN, dan (3) angka perubahan yang SUDAH dihitung program.

Aturan:
- Jangan menghitung ulang dan jangan mengubah angka yang diberikan.
- Untuk tiap hal yang berubah, salin isi sebelumnya dari potongan pasal dan isi sesudahnya dari teks amendemen, apa adanya.
- Jangan menambahkan hal yang tidak disebut amendemen.
- kutipan_sesudah harus potongan kalimat yang PERSIS ada di teks amendemen, paling banyak 200 karakter. Yang tidak ditemukan akan dibuang.
- alasan_perubahan hanya diisi bila tertulis di dokumen. Jangan menebak alasan.`;

export type KonteksBandingkan = {
  potonganPasal: { pasal: string; isi: string }[];
  teksAmendemen: string;
  angka: {
    selisihNilai: number | null;
    persenAmandemen: number | null;
    selisihHari: number | null;
    jenisPerubahan: string[];
  };
};

export function penggunaBandingkan(k: KonteksBandingkan): string {
  const pasal = k.potonganPasal.length
    ? k.potonganPasal.map((p) => `### ${p.pasal}\n${p.isi}`).join("\n\n")
    : "(tidak ada potongan pasal yang dapat diambil)";
  return [
    "POTONGAN PASAL VERSI SEBELUMNYA:",
    pasal,
    "",
    "ANGKA YANG SUDAH DIHITUNG PROGRAM:",
    JSON.stringify(k.angka),
    "",
    "TEKS AMENDEMEN:",
    k.teksAmendemen,
  ].join("\n");
}

/**
 * Mengambil potongan sebuah pasal dari teks kontrak, sejak judul pasalnya
 * sampai judul pasal berikutnya. Teks halaman dirakit dari daftar kata tanpa
 * pergantian baris, jadi pencarian memakai pola "PASAL <nomor>" huruf besar.
 */
export function ambilPasal(teksKontrak: string, namaPasal: string, panjangMaks = 1500): string | null {
  const nomor = namaPasal.match(/\d+/)?.[0];
  if (!nomor) return null;
  const awal = new RegExp(String.raw`\bPASAL\s+${nomor}\b\s*[:.]?`, "g");
  const m = awal.exec(teksKontrak);
  if (!m) return null;
  const sisa = teksKontrak.slice(m.index);
  const berikut = sisa.slice(m[0].length).search(/\bPASAL\s+\d+\b|\bLAMPIRAN\s+[A-G]\s*:/);
  const potong = berikut >= 0 ? sisa.slice(0, m[0].length + berikut) : sisa;
  return potong.slice(0, panjangMaks).trim();
}

export type AspekPerbandingan = {
  nama: string;
  sebelum: string;
  sesudah: string;
  perubahan: "BERUBAH" | "BARU" | "DIHAPUS";
};

export type HasilBandingkan = {
  ringkasan: string;
  alasan: string | null;
  aspek: AspekPerbandingan[];
  dibuang: { alasan: string; isi: string }[];
};

export function olahBandingan(
  keluaran: KeluaranBandingkan,
  sumberAmendemen: { kata: Kata[] }[]
): HasilBandingkan {
  const dibuang: HasilBandingkan["dibuang"] = [];
  const aspek: AspekPerbandingan[] = [];

  for (const a of keluaran.aspek) {
    const ada = sumberAmendemen.some((s) => verifikasiKutipan(a.kutipan_sesudah, s.kata).terverifikasi);
    if (!ada) {
      dibuang.push({ alasan: "kutipan sesudah tidak ditemukan di amendemen", isi: `${a.nama}: ${a.kutipan_sesudah.slice(0, 100)}` });
      continue;
    }
    aspek.push({ nama: a.nama.trim(), sebelum: a.sebelum.trim(), sesudah: a.sesudah.trim(), perubahan: a.perubahan });
  }

  return {
    ringkasan: keluaran.ringkasan_perubahan.trim(),
    alasan: keluaran.alasan_perubahan?.trim() || null,
    aspek,
    dibuang,
  };
}

export async function bandingkanVersi(opsi: {
  klien: KlienAI;
  konteks: KonteksBandingkan;
  sumberAmendemen: { kata: Kata[] }[];
}) {
  const jawaban = await opsi.klien.selesaikan({
    nama: "bandingkan_versi",
    sistem: SISTEM_BANDINGKAN,
    pengguna: penggunaBandingkan(opsi.konteks),
    skema: SkemaBandingkan,
  });
  return { jawaban, hasil: olahBandingan(jawaban.isi, opsi.sumberAmendemen) };
}
