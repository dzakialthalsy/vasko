// Catatan siapa melakukan apa (tabel riwayat_aktivitas).
//
// Tabelnya hanya bisa ditambah: pemicu di basis data menolak UPDATE dan
// DELETE. Karena itu fungsi di sini hanya ada satu, yaitu mencatat.
//
// Rincian disimpan sebagai JSON berisi nilai lama dan nilai baru bila ada,
// supaya setiap perubahan bisa ditelusuri tanpa membuka tabel asalnya.

import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient;

export const AKSI = {
  MASUK: "MASUK",
  GAGAL_MASUK: "GAGAL_MASUK",
  KELUAR: "KELUAR",
  SIMPAN_KONTRAK: "SIMPAN_KONTRAK",
  UNGGAH_DOKUMEN: "UNGGAH_DOKUMEN",
  BACA_DOKUMEN: "BACA_DOKUMEN",
  JALANKAN_VALIDASI: "JALANKAN_VALIDASI",
  PUTUSKAN_TEMUAN: "PUTUSKAN_TEMUAN",
  UNGGAH_AMENDEMEN: "UNGGAH_AMENDEMEN",
  UBAH_AKUN: "UBAH_AKUN",
} as const;

export type Aksi = (typeof AKSI)[keyof typeof AKSI];

export type KejadianAktivitas = {
  penggunaId?: string | null;
  aksi: Aksi;
  entitas?: string;
  entitasId?: string;
  rincian?: Prisma.InputJsonValue;
  alamatIp?: string | null;
};

export async function catatAktivitas(db: Db, k: KejadianAktivitas) {
  return db.riwayatAktivitas.create({
    data: {
      penggunaId: k.penggunaId ?? null,
      aksi: k.aksi,
      entitas: k.entitas ?? null,
      entitasId: k.entitasId ?? null,
      rincian: k.rincian,
      alamatIp: k.alamatIp ?? null,
    },
  });
}
