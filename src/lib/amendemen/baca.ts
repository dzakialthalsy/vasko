// Tugas AI: membaca dokumen amendemen beserta dokumen pendukungnya.
//
// Model hanya menyalin: nomor, tanggal, jenis perubahan, nilai amendemen
// dengan ARAH-nya (tambah, kurang, atau tetap), nilai kontrak baru bila
// tertulis, tanggal berakhir baru, dan pasal yang berubah. Tanda plus atau
// minus, penjumlahan, persentase, dan batas otorisasi dihitung kode di
// hitung.ts.
//
// Jenis perubahan (lingkup, volume, jangka waktu, harga) dibaca dari dokumen
// pendukung amendemen, sesuai jawaban Pak Rahman pada 9 Oktober 2026.
//
// Sama seperti tugas lain, setiap kutipan dicocokkan balik ke teks PDF dan
// yang tidak ditemukan tidak dipercaya.

import { z } from "zod";
import type { KlienAI } from "@/lib/ai/klien";
import { verifikasiKutipan } from "@/lib/dokumen/verifikasi";
import { uraiAngka, uraiRupiah, uraiTanggal } from "@/lib/ekstraksi/urai";
import type { Kata } from "@/lib/pdf/kata";

const JENIS = ["LINGKUP", "VOLUME", "JANGKA_WAKTU", "HARGA"] as const;
export type JenisPerubahan = (typeof JENIS)[number];

export const SkemaBacaAmendemen = z.object({
  nomor_amendemen: z.string().nullable().describe("Nomor amendemen apa adanya. Null bila tidak ada."),
  nomor_kontrak: z.string().nullable().describe("Nomor kontrak induk yang diamendemen, apa adanya."),
  tanggal_amendemen: z
    .string()
    .nullable()
    .describe("Tanggal amendemen ditandatangani yang tertulis di dokumen, apa adanya."),
  jenis_perubahan: z
    .array(z.enum(JENIS))
    .describe(
      "Hal yang diubah: LINGKUP (lingkup kerja), VOLUME, JANGKA_WAKTU (masa pelaksanaan atau tanggal berakhir), HARGA (nilai kontrak). Satu amendemen boleh mengubah lebih dari satu hal. Daftar kosong bila tidak jelas."
    ),
  nilai_amendemen: z.object({
    arah: z
      .enum(["TAMBAH", "KURANG", "TETAP"])
      .describe("TAMBAH bila nilai kontrak bertambah, KURANG bila berkurang, TETAP bila tidak berubah."),
    nilai: z
      .string()
      .nullable()
      .describe("Besar perubahan nilai dalam rupiah, apa adanya, tanpa tanda. Contoh Rp242.500.000. Null bila arah TETAP."),
    kutipan: z.string().nullable().describe("Potongan kalimat PERSIS yang menyebut perubahan nilai."),
  }),
  nilai_kontrak_baru: z
    .string()
    .nullable()
    .describe("Nilai kontrak sesudah amendemen BILA tertulis di dokumen, apa adanya. Jangan menghitung sendiri."),
  tanggal_berakhir_baru: z
    .string()
    .nullable()
    .describe("Tanggal berakhir pekerjaan yang baru BILA tertulis, apa adanya. Null bila tidak berubah atau tidak disebut."),
  ringkasan: z.string().describe("Ringkasan perubahan dalam 1 sampai 3 kalimat sederhana."),
  klausul_berubah: z.array(
    z.object({
      pasal: z.string().describe("Pasal atau lampiran yang diubah, misalnya Pasal 7."),
      kutipan: z.string().describe("Potongan kalimat PERSIS dari dokumen amendemen tentang perubahan pasal itu."),
    })
  ),
});

export type KeluaranBacaAmendemen = z.infer<typeof SkemaBacaAmendemen>;

export const SISTEM_BACA_AMENDEMEN = `Anda membaca dokumen AMENDEMEN kontrak pengadaan berbahasa Indonesia milik PT Pertamina Patra Niaga, beserta dokumen pendukungnya bila ada.

Tugas Anda hanya menyalin. Jangan menghitung, jangan menyimpulkan nilai yang tidak tertulis.

- nilai_amendemen: tentukan ARAH perubahan nilai kontrak (TAMBAH, KURANG, atau TETAP) dan salin besar perubahannya tanpa tanda plus atau minus. Jangan menghitung selisih sendiri. Bila dokumen hanya menulis nilai kontrak baru tanpa menyebut besar perubahannya, isi nilai dengan null dan isi nilai_kontrak_baru.
- jenis_perubahan: baca dari isi amendemen dan dokumen pendukungnya. Amendemen jangka waktu biasanya hanya mengubah waktu. Amendemen lingkup biasanya ikut mengubah waktu dan harga.
- klausul_berubah: satu baris untuk tiap pasal atau lampiran yang disebut berubah.

Aturan untuk setiap kutipan: harus potongan kalimat yang PERSIS ada di dokumen, paling banyak 200 karakter, tanpa mengubah satu huruf pun, karena akan dicocokkan kembali ke dokumen. Kutipan yang tidak ditemukan akan dibuang.`;

export function penggunaBacaAmendemen(teks: string): string {
  return `Berikut teks dokumen amendemen dan dokumen pendukungnya. Baca dan salin sesuai aturan.\n\n${teks}`;
}

export type SumberDokumen = { dokumenId: string; nama: string; kata: Kata[] };

export type HasilBacaAmendemen = {
  nomorAmendemen: string | null;
  nomorKontrak: string | null;
  tanggal: Date | null;
  jenisPerubahan: JenisPerubahan[];
  /** Positif untuk tambah, negatif untuk kurang, nol untuk tetap, null bila tidak terbaca. */
  nilaiAmandemen: number | null;
  nilaiKontrakBaru: number | null;
  tanggalBerakhirBaru: Date | null;
  ringkasan: string;
  klausul: { pasal: string; kutipan: string; terverifikasi: boolean }[];
  /** Hal yang perlu diperhatikan pengguna, mis. angka yang tidak terbaca. */
  catatan: string[];
  dibuang: { alasan: string; isi: string }[];
};

/** Mengolah keluaran model. Dipisah dari pemanggilan AI supaya bisa diuji sendiri. */
export function olahAmendemen(keluaran: KeluaranBacaAmendemen, sumber: SumberDokumen[]): HasilBacaAmendemen {
  const catatan: string[] = [];
  const dibuang: HasilBacaAmendemen["dibuang"] = [];

  const ada = (kutipan: string) => sumber.some((s) => verifikasiKutipan(kutipan, s.kata).terverifikasi);

  // Nilai amendemen: ARAH dari model, angka dan tandanya dari kode.
  const { arah, nilai, kutipan } = keluaran.nilai_amendemen;
  let nilaiAmandemen: number | null = null;
  if (arah === "TETAP") {
    nilaiAmandemen = 0;
  } else {
    const besar = nilai ? (uraiRupiah(nilai) ?? uraiAngka(nilai)) : null;
    if (besar === null) {
      catatan.push("Besar perubahan nilai tidak tertulis atau tidak terbaca. Isi manual, atau gunakan nilai kontrak baru.");
    } else {
      nilaiAmandemen = arah === "KURANG" ? -Math.abs(besar) : Math.abs(besar);
      if (kutipan && !ada(kutipan)) {
        dibuang.push({ alasan: "kutipan nilai amendemen tidak ditemukan di dokumen", isi: kutipan.slice(0, 120) });
        catatan.push("Kutipan yang menyebut perubahan nilai tidak ditemukan di dokumen. Periksa angkanya.");
      }
    }
  }

  const klausul = keluaran.klausul_berubah.map((k) => ({
    pasal: k.pasal.trim(),
    kutipan: k.kutipan.trim(),
    terverifikasi: ada(k.kutipan),
  }));
  for (const k of klausul.filter((x) => !x.terverifikasi)) {
    dibuang.push({ alasan: "kutipan klausul tidak ditemukan di dokumen", isi: `${k.pasal}: ${k.kutipan.slice(0, 100)}` });
  }

  const tanggal = uraiTanggal(keluaran.tanggal_amendemen);
  if (!tanggal) catatan.push("Tanggal amendemen tidak terbaca dari dokumen.");

  return {
    nomorAmendemen: keluaran.nomor_amendemen?.trim() || null,
    nomorKontrak: keluaran.nomor_kontrak?.trim() || null,
    tanggal,
    jenisPerubahan: [...new Set(keluaran.jenis_perubahan)],
    nilaiAmandemen,
    nilaiKontrakBaru: keluaran.nilai_kontrak_baru ? uraiRupiah(keluaran.nilai_kontrak_baru) : null,
    tanggalBerakhirBaru: uraiTanggal(keluaran.tanggal_berakhir_baru),
    ringkasan: keluaran.ringkasan.trim(),
    klausul: klausul.filter((k) => k.terverifikasi),
    catatan,
    dibuang,
  };
}

export async function bacaAmendemen(opsi: { klien: KlienAI; teks: string; sumber: SumberDokumen[] }) {
  const jawaban = await opsi.klien.selesaikan({
    nama: "amendemen",
    sistem: SISTEM_BACA_AMENDEMEN,
    pengguna: penggunaBacaAmendemen(opsi.teks),
    skema: SkemaBacaAmendemen,
  });
  return { jawaban, hasil: olahAmendemen(jawaban.isi, opsi.sumber) };
}
