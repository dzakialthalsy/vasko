// Pembantu murni untuk menyiapkan masukan validasi dari data yang tersimpan.
// Tidak menyentuh basis data, berkas, maupun AI, sehingga bisa diuji sendiri.

import { definisiFakta } from "@/lib/dokumen/katalog";
import type { RincianBacaPendukung } from "@/lib/dokumen/baca-pendukung";
import type { DokumenUntukPeran } from "@/lib/dokumen/peran";
import { uraiAngka, uraiHari, uraiPersen, uraiRupiah, uraiTanggal } from "@/lib/ekstraksi/urai";
import type { FaktaDokumen } from "./aturan";

/**
 * Dari dokumen kontrak yang diunggah, ambil yang terbaru untuk tiap bagian.
 * Kontrak satu berkas (bagian kosong) dianggap satu bagian utuh. Kontrak
 * yang diunggah per bagian (PPJ, Lampiran A sampai G) mengambil unggahan
 * terbaru tiap bagiannya. Unggahan ulang dengan isi berbeda menggantikan
 * yang lama untuk validasi, tetapi yang lama tetap tersimpan.
 */
export function pilihDokumenKontrak<T extends { bagian: string | null; diunggahPada: Date }>(dokumen: T[]): T[] {
  const terbaru = new Map<string, T>();
  for (const d of dokumen) {
    const kunci = d.bagian ?? "UTUH";
    const ada = terbaru.get(kunci);
    if (!ada || d.diunggahPada > ada.diunggahPada) terbaru.set(kunci, d);
  }
  return [...terbaru.values()];
}

/** Memastikan JSON dari kolom rincian benar-benar berbentuk rincian baca pendukung. */
export function rincianDariJson(j: unknown): RincianBacaPendukung | null {
  if (typeof j !== "object" || j === null) return null;
  const r = j as Partial<RincianBacaPendukung>;
  if (r.versi !== 1 || !Array.isArray(r.fakta) || !Array.isArray(r.pernyataan)) return null;
  return r as RincianBacaPendukung;
}

type InfoDokumen = {
  id: string;
  nama: string;
  jenisPendukung: string | null;
  tanggalDiIsi: Date | null;
  tanggalEditBerkas: Date | null;
};

/** Dokumen untuk penentuan peran. Hanya pernyataan yang kutipannya terverifikasi yang dipakai. */
export function untukPeran(r: RincianBacaPendukung | null, d: InfoDokumen): DokumenUntukPeran {
  return {
    id: d.id,
    nama: d.nama,
    jenisPendukung: d.jenisPendukung ?? r?.jenis ?? null,
    tanggalDiIsi: d.tanggalDiIsi,
    tanggalEditBerkas: d.tanggalEditBerkas,
    pernyataan: (r?.pernyataan ?? [])
      .filter((p) => p.terverifikasi)
      .map((p) => ({ butir: p.butir, atribut: p.atribut, jenis: p.jenis, nilai: p.nilai, satuan: p.satuan })),
  };
}

/** Fakta terverifikasi dari satu dokumen, dengan nilai yang sudah diurai sesuai bentuknya. */
export function faktaDariRincian(r: RincianBacaPendukung | null, d: InfoDokumen): FaktaDokumen[] {
  if (!r) return [];
  const hasil: FaktaDokumen[] = [];
  for (const f of r.fakta) {
    if (!f.terverifikasi || f.keyakinan <= 0) continue;
    const bentuk = definisiFakta(f.kunci)?.bentuk ?? "teks";
    hasil.push({
      dokumenId: d.id,
      nama: d.nama,
      jenisPendukung: d.jenisPendukung ?? r.jenis,
      tanggalDiIsi: d.tanggalDiIsi,
      tanggalEditBerkas: d.tanggalEditBerkas,
      kunci: f.kunci,
      nilaiTeks: f.nilai,
      angka:
        bentuk === "rupiah"
          ? (uraiRupiah(f.nilai) ?? uraiAngka(f.nilai))
          : bentuk === "persen"
            ? (uraiPersen(f.nilai) ?? uraiAngka(f.nilai))
            : bentuk === "hari"
              ? uraiHari(f.nilai)
              : null,
      tanggal: bentuk === "tanggal" ? uraiTanggal(f.nilai) : null,
      keyakinan: f.keyakinan,
    });
  }
  return hasil;
}
