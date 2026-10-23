// Tugas AI: memeriksa teks kontrak terhadap ketetapan dari dokumen pendukung.
//
// Ini bagian "benar-benar validasi isi" yang diminta Pak Rahman, bukan sekadar
// merangkum. Contoh dari Pak Rigga: BA pre-bid menetapkan 15 titik pemeriksaan
// perpipaan, tetapi kontrak menyebut 10.
//
// Pembagian tugasnya sengaja dibatasi supaya AI tidak bisa mengarang temuan:
//   - Model hanya MENCARI di kontrak penyebutan angka untuk hal yang sama
//     dengan sebuah ketetapan, lalu menyalin kutipan dan angkanya.
//   - Kode yang MEMBANDINGKAN angkanya. Model tidak pernah diminta menyatakan
//     "sama" atau "berbeda".
//   - Kutipan dicocokkan balik ke teks PDF kontrak. Yang tidak ditemukan
//     dibuang, dan dari kecocokan itu diperoleh kotak sorotannya.

import { z } from "zod";
import type { KlienAI } from "@/lib/ai/klien";
import type { NilaiEfektif } from "@/lib/dokumen/peran";
import { verifikasiKutipan } from "@/lib/dokumen/verifikasi";
import { uraiAngka } from "@/lib/ekstraksi/urai";
import type { Kata } from "@/lib/pdf/kata";
import type { TemuanAturan } from "./aturan";

export const SkemaPeriksaKlausul = z.object({
  penyebutan: z.array(
    z.object({
      rujukan: z.string().describe("Nomor ketetapan yang dibahas, misalnya E3."),
      kutipan_kontrak: z
        .string()
        .describe("Potongan kalimat PERSIS dari teks kontrak yang menyebut angka untuk hal ini."),
      angka_di_kontrak: z.string().describe("Angka saja seperti tertulis di kontrak, tanpa satuan."),
    })
  ),
});

export type KeluaranPeriksaKlausul = z.infer<typeof SkemaPeriksaKlausul>;

export type Ketetapan = {
  id: string;
  butir: string;
  atribut: string;
  nilai: number;
  satuan: string | null;
  dokumen: string[];
};

/** Ketetapan yang diperiksa AI. Masa pelaksanaan sudah punya aturan tersendiri. */
export function pilihKetetapan(efektif: NilaiEfektif[], namaDokumen: Map<string, string>): Ketetapan[] {
  return efektif
    .filter((e) => !(e.atribut === "DURASI_HARI" && /pelaksanaan|penyelesaian|pekerjaan/i.test(e.butir)))
    .filter((e) => !e.konflik)
    .map((e, i) => ({
      id: `E${i + 1}`,
      butir: e.butir,
      atribut: e.atribut,
      nilai: e.nilai,
      satuan: e.satuan,
      dokumen: e.dokumenId.map((d) => namaDokumen.get(d) ?? d),
    }));
}

export const SISTEM_PERIKSA_KLAUSUL = `Anda memeriksa isi kontrak pengadaan berbahasa Indonesia milik PT Pertamina Patra Niaga terhadap daftar KETETAPAN dari dokumen pendukung.

Tugas Anda hanya mencari dan menyalin. JANGAN menilai sendiri apakah angka di kontrak sama atau berbeda dengan ketetapan, karena itu dikerjakan program.

Untuk setiap ketetapan pada daftar:
1. Cari di teks kontrak kalimat yang menyebut ANGKA untuk hal yang SAMA dengan ketetapan itu.
2. Bila ada, salin kalimatnya sebagai kutipan_kontrak, dan salin angka yang tertulis di kontrak sebagai angka_di_kontrak.
3. Bila kontrak tidak membahas hal itu, lewati ketetapannya. Jangan menebak dan jangan mengarang.

Aturan untuk kutipan_kontrak: harus potongan kalimat yang PERSIS ada di teks kontrak, paling banyak 200 karakter, tanpa mengubah satu huruf pun, karena akan dicocokkan kembali ke dokumen. Kutipan yang tidak ditemukan akan dibuang.

Satu ketetapan boleh muncul lebih dari satu kali bila kontrak menyebutnya di beberapa tempat.`;

export function penggunaPeriksaKlausul(ketetapan: Ketetapan[], teksKontrak: string): string {
  const daftar = ketetapan
    .map((k) => `${k.id}. ${k.butir} (${k.atribut}) = ${k.nilai}${k.satuan ? ` ${k.satuan}` : ""}`)
    .join("\n");
  return `KETETAPAN dari dokumen pendukung:\n${daftar}\n\nTEKS KONTRAK:\n${teksKontrak}`;
}

export type SumberKontrak = { dokumenId: string; nama: string; kata: Kata[] };

export type HasilPeriksaKlausul = {
  temuan: TemuanAturan[];
  /** Penyebutan yang dibuang beserta alasannya, sebagai jejak. */
  dibuang: { alasan: string; isi: string }[];
  /** Jumlah penyebutan yang sudah cocok dengan ketetapan. */
  cocok: number;
};

const sama = (a: number, b: number, atribut: string) =>
  Math.abs(a - b) <= (atribut === "HARGA" ? 1000 : 1e-9);

/**
 * Mengolah keluaran model menjadi temuan. Dipisah dari pemanggilan AI supaya
 * bisa diuji dengan keluaran tiruan.
 */
export function olahPenyebutan(
  keluaran: KeluaranPeriksaKlausul,
  ketetapan: Ketetapan[],
  sumber: SumberKontrak[]
): HasilPeriksaKlausul {
  const temuan: TemuanAturan[] = [];
  const dibuang: HasilPeriksaKlausul["dibuang"] = [];
  let cocok = 0;
  const sudahDilaporkan = new Set<string>();

  for (const p of keluaran.penyebutan) {
    const k = ketetapan.find((x) => x.id === p.rujukan.trim().toUpperCase());
    if (!k) {
      dibuang.push({ alasan: "rujukan ketetapan tidak dikenal", isi: p.rujukan });
      continue;
    }

    const angka = uraiAngka(p.angka_di_kontrak);
    if (angka === null) {
      dibuang.push({ alasan: "angka di kontrak tidak terbaca", isi: `${k.id}: ${p.angka_di_kontrak}` });
      continue;
    }

    // Kutipan dicari di setiap dokumen kontrak sampai ketemu.
    let temu: { dokumenId: string; nama: string; hasil: ReturnType<typeof verifikasiKutipan> } | null = null;
    for (const s of sumber) {
      const hasil = verifikasiKutipan(p.kutipan_kontrak, s.kata);
      if (hasil.terverifikasi) {
        temu = { dokumenId: s.dokumenId, nama: s.nama, hasil };
        break;
      }
    }
    if (!temu) {
      dibuang.push({ alasan: "kutipan kontrak tidak ditemukan di dokumen", isi: `${k.id}: ${p.kutipan_kontrak.slice(0, 120)}` });
      continue;
    }

    if (sama(angka, k.nilai, k.atribut)) {
      cocok++;
      continue;
    }

    // Satu ketetapan dan satu angka yang sama dilaporkan sekali saja.
    const kunciLapor = `${k.id}|${angka}`;
    if (sudahDilaporkan.has(kunciLapor)) continue;
    sudahDilaporkan.add(kunciLapor);

    const satuan = k.satuan ? ` ${k.satuan}` : "";
    temuan.push({
      kode: "KLAUSUL_BERTENTANGAN",
      tingkat: "MERAH",
      lokasi: temu.hasil.halaman ? `${temu.nama}, halaman ${temu.hasil.halaman}` : temu.nama,
      uraian: `Kontrak menyebut ${angka.toLocaleString("id-ID")}${satuan} untuk "${k.butir}", sedangkan dokumen pendukung menetapkan ${k.nilai.toLocaleString("id-ID")}${satuan}.`,
      nilaiDiKontrak: `${angka.toLocaleString("id-ID")}${satuan}`,
      nilaiSaran: `${k.nilai.toLocaleString("id-ID")}${satuan}`,
      dasar: `Dokumen pendukung: ${k.dokumen.join(", ")}`,
      medanSorotan: [],
      sorotanLangsung: { dokumenId: temu.dokumenId, kotak: temu.hasil.kotak },
    });
  }

  return { temuan, dibuang, cocok };
}

export async function periksaKlausul(opsi: {
  klien: KlienAI;
  ketetapan: Ketetapan[];
  teksKontrak: string;
  sumber: SumberKontrak[];
}) {
  const jawaban = await opsi.klien.selesaikan({
    nama: "periksa_klausul",
    sistem: SISTEM_PERIKSA_KLAUSUL,
    pengguna: penggunaPeriksaKlausul(opsi.ketetapan, opsi.teksKontrak),
    skema: SkemaPeriksaKlausul,
    upaya: "medium",
  });
  return { jawaban, hasil: olahPenyebutan(jawaban.isi, opsi.ketetapan, opsi.sumber) };
}
