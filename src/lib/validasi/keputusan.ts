// Keputusan pengguna atas temuan validasi: terima, ubah, atau abaikan.
//
// Web adalah tempat memutuskan. Keputusan TIDAK mengubah isi kontrak di PDF,
// karena perbaikan teks dilakukan di berkas sumber. Yang dicatat: siapa
// memutuskan, kapan, apa keputusannya, nilai yang dipilih, dan alasannya.
// Dari catatan itulah PDF hasil validasi dibuat saat diunduh.
//
// Aturan dari rancangan:
//   DITERIMA   saran sistem dipakai
//   DIUBAH     pengguna mengetik nilai sendiri (nilai wajib diisi)
//   DIABAIKAN  temuan tidak dipakai (alasan wajib diisi)

import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";

export type MasukanKeputusan = {
  temuanId: string;
  keputusan: "DITERIMA" | "DIUBAH" | "DIABAIKAN";
  /** Nilai pilihan pengguna. Wajib untuk DIUBAH. */
  nilai?: string | null;
  /** Alasan. Wajib untuk DIABAIKAN. */
  alasan?: string | null;
  penggunaId?: string | null;
};

export async function putuskanTemuan(m: MasukanKeputusan) {
  const nilai = m.nilai?.trim() || null;
  const alasan = m.alasan?.trim() || null;

  if (m.keputusan === "DIUBAH" && !nilai) {
    throw new Error("Keputusan Ubah wajib disertai nilai yang dipilih.");
  }
  if (m.keputusan === "DIABAIKAN" && !alasan) {
    throw new Error("Temuan yang diabaikan wajib disertai alasan.");
  }

  return prisma.$transaction(async (tx) => {
    const sebelum = await tx.temuan.findUniqueOrThrow({ where: { id: m.temuanId } });

    const sesudah = await tx.temuan.update({
      where: { id: m.temuanId },
      data: {
        keputusan: m.keputusan,
        // Pada DITERIMA nilai yang berlaku adalah saran sistem.
        nilaiKeputusan: m.keputusan === "DITERIMA" ? (nilai ?? sebelum.nilaiSaran) : nilai,
        alasanKeputusan: alasan,
        diputuskanOlehId: m.penggunaId ?? null,
        diputuskanPada: new Date(),
      },
    });

    await catatAktivitas(tx, {
      penggunaId: m.penggunaId,
      aksi: AKSI.PUTUSKAN_TEMUAN,
      entitas: "temuan",
      entitasId: m.temuanId,
      rincian: {
        nomor: sebelum.nomor,
        lama: { keputusan: sebelum.keputusan, nilai: sebelum.nilaiKeputusan, alasan: sebelum.alasanKeputusan },
        baru: { keputusan: sesudah.keputusan, nilai: sesudah.nilaiKeputusan, alasan: sesudah.alasanKeputusan },
      },
    });

    return sesudah;
  }, OPSI_TRANSAKSI);
}
