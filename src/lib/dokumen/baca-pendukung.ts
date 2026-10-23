// Tugas AI: membaca SATU dokumen pendukung pengadaan.
//
// Model hanya membaca dan menyalin: jenis dokumen (dari daftar tetap), judul,
// nomor, tanggal yang tertulis di isi dokumen, fakta bernilai, dan pernyataan
// perubahan. Sesudah itu kode yang bekerja:
//   - tanggal dan angka diurai kode
//   - setiap kutipan dicocokkan balik ke teks PDF, dan yang tidak ditemukan
//     dibuang, supaya karangan model tidak ikut menentukan hasil validasi
//   - kotak sorotan dan angka keyakinan dihitung dari kecocokan itu
//
// Hasilnya disimpan sebagai Ekstraksi atas dokumen tersebut: fakta menjadi
// baris MedanEkstraksi (kelompok PENDUKUNG) lengkap dengan sorotan, sisanya
// disimpan apa adanya di kolom rincian.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { pilihKlien } from "@/lib/ai";
import { catatPemakaian } from "@/lib/ai/pemakaian";
import type { KlienAI } from "@/lib/ai/klien";
import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { rangkaiTeks } from "@/lib/ekstraksi/alur";
import { uraiAngka, uraiTanggal } from "@/lib/ekstraksi/urai";
import { bacaBerkas } from "@/lib/penyimpanan";
import { bacaKata } from "@/lib/pdf/kata";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";
import {
  ATRIBUT_PERNYATAAN,
  FAKTA,
  JENIS_PENDUKUNG,
  JENIS_PERNYATAAN,
  KUNCI_FAKTA,
  KUNCI_JENIS_PENDUKUNG,
  definisiFakta,
} from "./katalog";
import type { PernyataanTerurai } from "./peran";
import { kotakUntukSimpan, verifikasiKutipan } from "./verifikasi";

// ------------------------------------------------------------------ skema

export const SkemaBacaPendukung = z.object({
  jenis: z.enum(KUNCI_JENIS_PENDUKUNG).describe("Jenis dokumen, dipilih dari daftar."),
  judul: z.string().nullable().describe("Judul dokumen apa adanya. Null bila tidak ada."),
  nomor_dokumen: z.string().nullable().describe("Nomor dokumen apa adanya. Null bila tidak ada."),
  tanggal_dokumen: z
    .string()
    .nullable()
    .describe("Tanggal pembuatan atau penandatanganan dokumen yang tertulis di isinya, apa adanya. Null bila tidak ada."),
  fakta: z.array(
    z.object({
      kunci: z.enum(KUNCI_FAKTA),
      nilai: z.string().describe("Nilai disalin apa adanya dari dokumen."),
      kutipan: z.string().describe("Potongan kalimat PERSIS dari dokumen yang memuat nilai ini."),
    })
  ),
  pernyataan: z.array(
    z.object({
      butir: z.string().describe("Hal yang dibicarakan, 2 sampai 5 kata huruf kecil, tanpa angka."),
      atribut: z.enum(ATRIBUT_PERNYATAAN),
      jenis: z.enum(JENIS_PERNYATAAN),
      nilai: z.string().describe("Angka saja seperti tertulis, tanpa satuan dan tanpa tanda."),
      satuan: z.string().nullable(),
      kutipan: z.string().describe("Potongan kalimat PERSIS dari dokumen yang memuat pernyataan ini."),
    })
  ),
});

export type KeluaranBacaPendukung = z.infer<typeof SkemaBacaPendukung>;

export function sistemBacaPendukung(): string {
  const jenis = JENIS_PENDUKUNG.map((j) => `- ${j.kunci}: ${j.label}. ${j.ciri}`).join("\n");
  const fakta = FAKTA.map((f) => `- ${f.kunci}: ${f.petunjuk}`).join("\n");

  return `Anda membaca SATU dokumen pendukung pengadaan berbahasa Indonesia milik PT Pertamina Patra Niaga.

Tugas Anda hanya menyalin. Jangan menghitung, jangan menyimpulkan, jangan menebak.

1. jenis: pilih SATU jenis dokumen dari daftar berikut. Bila tidak ada yang cocok, pilih LAINNYA.
${jenis}

2. judul, nomor_dokumen, tanggal_dokumen: salin apa adanya. tanggal_dokumen adalah tanggal pembuatan atau penandatanganan dokumen itu sendiri, bukan tanggal lain yang disebut di dalam isinya. Kembalikan null bila tidak tertulis.

3. fakta: salin nilai untuk kunci berikut bila tercantum di dokumen. Lewati kunci yang tidak tercantum. Satu kunci cukup satu kali, ambil yang paling menentukan.
${fakta}

4. pernyataan: salin setiap kalimat yang menyebut ANGKA tentang suatu hal pekerjaan yang ditetapkan atau diubah, misalnya jumlah titik, harga, masa pelaksanaan, atau persentase.
   - butir: nama singkat hal yang dibicarakan, 2 sampai 5 kata huruf kecil, tanpa angka, dan SELALU memakai istilah yang sama untuk hal yang sama.
   - atribut: JUMLAH, HARGA, DURASI_HARI, atau PERSEN.
   - jenis: NILAI_BARU bila kalimat menyebut nilai akhir (diubah menjadi, menjadi, ditetapkan sebanyak, sebanyak). TAMBAH bila menyebut penambahan (ditambah, bertambah, tambahan). KURANG bila menyebut pengurangan (dikurangi, berkurang).
   - nilai: angkanya saja seperti tertulis. Jangan memberi tanda minus dan jangan menghitung hasil penjumlahan.

Aturan untuk kutipan: kutipan harus potongan kalimat yang PERSIS ada di dokumen, panjangnya paling banyak 200 karakter, tanpa mengubah satu huruf pun, karena akan dicocokkan kembali ke dokumen. Kutipan yang tidak ditemukan di dokumen akan dibuang.

Bila dokumen tidak memuat fakta atau pernyataan apa pun, kembalikan daftar kosong.`;
}

export function penggunaBacaPendukung(teks: string): string {
  return `Berikut teks lengkap dokumen. Baca dan salin sesuai aturan.\n\n${teks}`;
}

// ----------------------------------------------------------------- hasil

export type FaktaTerbaca = {
  kunci: string;
  label: string;
  nilai: string;
  kutipan: string;
  keyakinan: number;
  terverifikasi: boolean;
};

export type PernyataanTerbaca = PernyataanTerurai & {
  nilaiTeks: string;
  kutipan: string;
  terverifikasi: boolean;
};

export type RincianBacaPendukung = {
  versi: 1;
  jenis: string;
  judul: string | null;
  nomorDokumen: string | null;
  tanggalDokumenTeks: string | null;
  fakta: FaktaTerbaca[];
  pernyataan: PernyataanTerbaca[];
  /** Isi yang dibuang beserta alasannya, disimpan sebagai jejak. */
  dibuang: { alasan: string; isi: string }[];
};

export type HasilBacaPendukung = {
  dokumenId: string;
  ekstraksiId: string;
  model: string;
  tokenMasuk: number;
  tokenKeluar: number;
  tanggalDiIsi: Date | null;
  rincian: RincianBacaPendukung;
};

/** Galat untuk dokumen yang memang tidak bisa dibaca, bukan kegagalan AI. */
export class DokumenTidakTerbaca extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "DokumenTidakTerbaca";
  }
}

// ---------------------------------------------------------- pengolahan

/**
 * Mengolah keluaran mentah model menjadi rincian terverifikasi. Dipisah dari
 * pemanggilan AI dan basis data supaya bisa diuji sendiri.
 */
export function olahKeluaran(
  keluaran: KeluaranBacaPendukung,
  kata: import("@/lib/pdf/kata").Kata[]
): {
  rincian: RincianBacaPendukung;
  tanggalDiIsi: Date | null;
  sorotanFakta: Map<string, ReturnType<typeof verifikasiKutipan>["kotak"]>;
} {
  const dibuang: RincianBacaPendukung["dibuang"] = [];
  const sorotanFakta = new Map<string, ReturnType<typeof verifikasiKutipan>["kotak"]>();

  // Fakta: satu per kunci, ambil yang keyakinannya tertinggi.
  const terbaik = new Map<string, FaktaTerbaca>();
  for (const f of keluaran.fakta) {
    const def = definisiFakta(f.kunci);
    if (!def) {
      dibuang.push({ alasan: "kunci fakta tidak dikenal", isi: f.kunci });
      continue;
    }
    // Kutipan dicoba lebih dulu. Bila gagal, nilainya sendiri dicari di
    // dokumen, karena model kadang menyalin nilai dengan benar tetapi
    // kutipannya terpotong.
    let c = verifikasiKutipan(f.kutipan, kata);
    if (!c.terverifikasi) {
      const lewatNilai = verifikasiKutipan(f.nilai, kata);
      if (lewatNilai.terverifikasi) c = lewatNilai;
    }
    const baru: FaktaTerbaca = {
      kunci: f.kunci,
      label: def.label,
      nilai: f.nilai.trim(),
      kutipan: f.kutipan.trim(),
      keyakinan: c.terverifikasi ? c.keyakinan : 0,
      terverifikasi: c.terverifikasi,
    };
    const lama = terbaik.get(f.kunci);
    if (!lama || baru.keyakinan > lama.keyakinan) {
      if (lama) dibuang.push({ alasan: "kunci ganda, dipakai yang keyakinannya lebih tinggi", isi: `${lama.kunci}: ${lama.nilai}` });
      terbaik.set(f.kunci, baru);
      sorotanFakta.set(f.kunci, c.terverifikasi ? c.kotak : []);
    } else {
      dibuang.push({ alasan: "kunci ganda, dipakai yang keyakinannya lebih tinggi", isi: `${baru.kunci}: ${baru.nilai}` });
    }
  }

  // Pernyataan: angka diurai kode, kutipan diverifikasi. Yang tidak lolos
  // salah satunya dibuang dari hitungan peran dokumen.
  const pernyataan: PernyataanTerbaca[] = [];
  for (const p of keluaran.pernyataan) {
    const angka = uraiAngka(p.nilai);
    if (angka === null) {
      dibuang.push({ alasan: "angka pernyataan tidak terbaca", isi: `${p.butir}: ${p.nilai}` });
      continue;
    }
    const c = verifikasiKutipan(p.kutipan, kata);
    if (!c.terverifikasi) {
      dibuang.push({ alasan: "kutipan pernyataan tidak ditemukan di dokumen", isi: `${p.butir}: ${p.kutipan.slice(0, 120)}` });
    }
    pernyataan.push({
      butir: p.butir.trim().toLowerCase(),
      atribut: p.atribut,
      jenis: p.jenis,
      nilai: Math.abs(angka),
      satuan: p.satuan?.trim() || null,
      nilaiTeks: p.nilai.trim(),
      kutipan: p.kutipan.trim(),
      terverifikasi: c.terverifikasi,
    });
  }

  const tanggal = uraiTanggal(keluaran.tanggal_dokumen);

  return {
    rincian: {
      versi: 1,
      jenis: keluaran.jenis,
      judul: keluaran.judul?.trim() || null,
      nomorDokumen: keluaran.nomor_dokumen?.trim() || null,
      tanggalDokumenTeks: keluaran.tanggal_dokumen?.trim() || null,
      fakta: [...terbaik.values()],
      pernyataan,
      dibuang,
    },
    tanggalDiIsi: tanggal,
    sorotanFakta,
  };
}

// ------------------------------------------------------------- layanan

export async function bacaDokumenPendukung(opsi: {
  dokumenId: string;
  klien?: KlienAI;
  penggunaId?: string | null;
}): Promise<HasilBacaPendukung> {
  const dokumen = await prisma.dokumen.findUniqueOrThrow({ where: { id: opsi.dokumenId } });

  if (dokumen.jenis !== "PENDUKUNG" && dokumen.jenis !== "PENDUKUNG_AMANDEMEN") {
    throw new Error(`Dokumen ${dokumen.namaBerkas} berjenis ${dokumen.jenis}, bukan dokumen pendukung.`);
  }

  if (!dokumen.adaLapisanTeks) {
    // Dicatat supaya terlihat di riwayat bahwa dokumennya sudah dicoba dibaca.
    await prisma.ekstraksi.create({
      data: {
        dokumenId: dokumen.id,
        model: "tidak dijalankan",
        selesaiPada: new Date(),
        galat: "PDF tidak punya lapisan teks (hasil pindai). VASKO tidak memakai OCR, jadi berkas ini tidak bisa dibaca.",
        dijalankanOlehId: opsi.penggunaId ?? null,
      },
    });
    throw new DokumenTidakTerbaca(
      `${dokumen.namaBerkas} adalah hasil pindai tanpa lapisan teks, sehingga tidak bisa dibaca. Unggah versi PDF yang teksnya bisa dipilih.`
    );
  }

  const data = await bacaBerkas(dokumen.lokasiSimpan);
  const { halaman, kata } = await bacaKata(Uint8Array.from(data));
  const teks = rangkaiTeks(halaman);

  const klien = opsi.klien ?? pilihKlien();
  const jawaban = await klien.selesaikan({
    nama: "dokumen_pendukung",
    sistem: sistemBacaPendukung(),
    pengguna: penggunaBacaPendukung(teks),
    skema: SkemaBacaPendukung,
  });

  const { rincian, tanggalDiIsi, sorotanFakta } = olahKeluaran(jawaban.isi, kata);

  const ekstraksiId = await prisma.$transaction(
    async (tx) => {
      const ekstraksi = await tx.ekstraksi.create({
        data: {
          dokumenId: dokumen.id,
          model: jawaban.model,
          dijalankanOlehId: opsi.penggunaId ?? null,
          selesaiPada: new Date(),
          rincian: rincian as unknown as Prisma.InputJsonValue,
        },
      });

      for (const [i, f] of rincian.fakta.entries()) {
        const medan = await tx.medanEkstraksi.create({
          data: {
            ekstraksiId: ekstraksi.id,
            urutan: i + 1,
            kunci: f.kunci,
            label: f.label,
            kelompok: "PENDUKUNG",
            nilai: f.nilai,
            keyakinan: f.keyakinan,
            wajibKonfirmasi: false,
          },
        });
        const kotak = kotakUntukSimpan({ kotak: sorotanFakta.get(f.kunci) ?? [] }, dokumen.id);
        if (kotak.length > 0) {
          await tx.sorotan.createMany({ data: kotak.map((k) => ({ ...k, medanId: medan.id })) });
        }
      }

      await tx.dokumen.update({
        where: { id: dokumen.id },
        data: {
          jenisPendukung: rincian.jenis,
          judulDokumen: rincian.judul,
          // Tanggal isi yang sudah ada tidak ditimpa dengan kosong.
          ...(tanggalDiIsi ? { tanggalDiIsi } : {}),
        },
      });

      await catatPemakaian(tx, "EKSTRAKSI", jawaban, { ekstraksiId: ekstraksi.id }, opsi.penggunaId);
      await catatAktivitas(tx, {
        penggunaId: opsi.penggunaId,
        aksi: AKSI.BACA_DOKUMEN,
        entitas: "dokumen",
        entitasId: dokumen.id,
        rincian: {
          jenis: rincian.jenis,
          model: jawaban.model,
          fakta: rincian.fakta.length,
          pernyataan: rincian.pernyataan.length,
          dibuang: rincian.dibuang.length,
        },
      });
      return ekstraksi.id;
    },
    OPSI_TRANSAKSI
  );

  return {
    dokumenId: dokumen.id,
    ekstraksiId,
    model: jawaban.model,
    tokenMasuk: jawaban.tokenMasuk,
    tokenKeluar: jawaban.tokenKeluar,
    tanggalDiIsi,
    rincian,
  };
}
