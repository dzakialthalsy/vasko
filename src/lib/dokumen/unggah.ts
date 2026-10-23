// Menyimpan dokumen yang diunggah: berkas ke disk, catatannya ke basis data.
//
// Yang dilakukan di sini, semuanya deterministik:
//   - menghitung sidik SHA-256 dan menolak berkas yang sama persis pada
//     kontrak yang sama
//   - memastikan berkasnya PDF, lalu memeriksa apakah punya lapisan teks
//   - menyimpan siapa yang mengunggah dan kapan (kebutuhan VK-13)
//
// VASKO tidak memakai OCR. PDF hasil pindai tetap disimpan, tetapi ditandai
// adaLapisanTeks = false supaya pengguna tahu berkas itu tidak bisa dibaca.

import type { BagianDokumen, Dokumen, JenisDokumen, SumberDokumen } from "@/generated/prisma/client";
import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { bacaKata } from "@/lib/pdf/kata";
import { sidikSha256, simpanBerkas } from "@/lib/penyimpanan";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";

/** Halaman dianggap punya teks bila memuat paling sedikit sekian karakter. */
const MINIMAL_KARAKTER_PER_HALAMAN = 30;
/** Berkas dianggap punya lapisan teks bila setidaknya separuh halamannya bertulisan. */
const MINIMAL_PROPORSI_HALAMAN_BERTEKS = 0.5;

export type AnalisisBerkas = {
  sidik: string;
  ukuranByte: number;
  jumlahHalaman: number;
  halamanTanpaTeks: number[];
  adaLapisanTeks: boolean;
};

export function adalahPdf(data: Uint8Array): boolean {
  // Tanda tangan PDF boleh didahului sampah beberapa byte, tetapi dalam 1 KB pertama.
  const kepala = Buffer.from(data.subarray(0, 1024)).toString("latin1");
  return kepala.includes("%PDF-");
}

export async function analisisBerkas(data: Uint8Array): Promise<AnalisisBerkas> {
  if (!adalahPdf(data)) {
    throw new Error("Berkas bukan PDF. VASKO hanya menerima PDF. Dokumen Word cukup disimpan sebagai PDF lebih dulu.");
  }

  let halaman;
  try {
    // Disalin karena pdf.js dapat mengambil alih penyangga data yang diberikan.
    ({ halaman } = await bacaKata(Uint8Array.from(data)));
  } catch (e) {
    const sebab = e instanceof Error ? e.message : String(e);
    throw new Error(`PDF tidak dapat dibaca (rusak atau terkunci kata sandi): ${sebab}`);
  }

  const tanpaTeks = halaman
    .filter((h) => h.teks.replace(/\s+/g, "").length < MINIMAL_KARAKTER_PER_HALAMAN)
    .map((h) => h.nomor);
  const berteks = halaman.length - tanpaTeks.length;

  return {
    sidik: sidikSha256(data),
    ukuranByte: data.byteLength,
    jumlahHalaman: halaman.length,
    halamanTanpaTeks: tanpaTeks,
    adaLapisanTeks: halaman.length > 0 && berteks / halaman.length >= MINIMAL_PROPORSI_HALAMAN_BERTEKS,
  };
}

export type MasukanUnggah = {
  kontrakId: string;
  jenis: JenisDokumen;
  data: Uint8Array;
  namaBerkas: string;
  /** Tanggal berkas terakhir diubah, dari peramban. Dipakai bila tanggal isi dua dokumen sama. */
  tanggalEditBerkas?: Date | null;
  bagian?: BagianDokumen | null;
  amendemenId?: string | null;
  sumber?: SumberDokumen;
  penggunaId?: string | null;
};

export type HasilUnggah = {
  dokumen: Dokumen;
  /** Salah bila berkas yang sama persis sudah ada pada kontrak ini. */
  baru: boolean;
  peringatan: string[];
};

export async function unggahDokumen(m: MasukanUnggah): Promise<HasilUnggah> {
  const analisis = await analisisBerkas(m.data);

  const sudahAda = await prisma.dokumen.findUnique({
    where: { kontrakId_hashSha256: { kontrakId: m.kontrakId, hashSha256: analisis.sidik } },
  });
  if (sudahAda) {
    return {
      dokumen: sudahAda,
      baru: false,
      peringatan: [`Berkas yang sama persis sudah diunggah sebagai ${sudahAda.namaBerkas}.`],
    };
  }

  const lokasi = await simpanBerkas(m.data, analisis.sidik);

  const peringatan: string[] = [];
  if (!analisis.adaLapisanTeks) {
    peringatan.push(
      "PDF ini hasil pindai tanpa lapisan teks. VASKO tidak memakai OCR, jadi isinya tidak bisa dibaca. Unggah versi PDF yang teksnya bisa dipilih."
    );
  } else if (analisis.halamanTanpaTeks.length > 0) {
    peringatan.push(
      `Halaman ${analisis.halamanTanpaTeks.join(", ")} tidak punya teks (kemungkinan hasil pindai) dan tidak akan terbaca.`
    );
  }

  const dokumen = await prisma.$transaction(async (tx) => {
    const baru = await tx.dokumen.create({
      data: {
        kontrakId: m.kontrakId,
        amendemenId: m.amendemenId ?? null,
        jenis: m.jenis,
        bagian: m.bagian ?? null,
        namaBerkas: m.namaBerkas,
        lokasiSimpan: lokasi,
        hashSha256: analisis.sidik,
        ukuranByte: analisis.ukuranByte,
        jumlahHalaman: analisis.jumlahHalaman,
        adaLapisanTeks: analisis.adaLapisanTeks,
        tanggalEditBerkas: m.tanggalEditBerkas ?? null,
        sumber: m.sumber ?? "UNGGAH",
        diunggahOlehId: m.penggunaId ?? null,
      },
    });
    await catatAktivitas(tx, {
      penggunaId: m.penggunaId,
      aksi: AKSI.UNGGAH_DOKUMEN,
      entitas: "dokumen",
      entitasId: baru.id,
      rincian: {
        kontrakId: m.kontrakId,
        jenis: m.jenis,
        namaBerkas: m.namaBerkas,
        sidik: analisis.sidik,
        halaman: analisis.jumlahHalaman,
        adaLapisanTeks: analisis.adaLapisanTeks,
      },
    });
    return baru;
  }, OPSI_TRANSAKSI);

  return { dokumen, baru: true, peringatan };
}
