// Menyimpan hasil ekstraksi yang sudah diverifikasi ke basis data.
//
// Yang disimpan bukan hanya nilai akhirnya, melainkan seluruh jejaknya:
// nilai mentah dari model, nilai hasil suntingan manusia bila ada, angka
// keyakinan, dan kotak sorotan tempat nilai itu ditemukan. Tanpa jejak itu,
// tidak ada yang bisa menjawab pertanyaan "dari mana angka ini" enam bulan
// kemudian, padahal Satuan Pengawasan Intern dan BPK adalah pemangku
// kepentingan yang tercatat di proposal.
//
// Semuanya ditulis dalam SATU transaksi: kontrak, dokumen, ekstraksi, medan,
// sorotan, dan termin berhasil bersama atau gagal bersama.

import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { analisisBerkas } from "@/lib/dokumen/unggah";
import { simpanBerkas } from "@/lib/penyimpanan";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";
import { MEDAN, nilaiYangDipakai } from "./medan";
import {
  tambahHari,
  uraiHari,
  uraiMasaBerlakuJaminan,
  uraiPersen,
  uraiRupiah,
  uraiTanggal,
  uraiTarifPermil,
  uraiTermasukPpn,
} from "./urai";
import type { KotakSorotan } from "@/lib/pdf/cocok";

export type MedanMasuk = {
  kunci: string;
  nilai: string | null;
  keyakinan: number;
  halaman: number | null;
  kotak: KotakSorotan[];
  /** Nilai hasil koreksi manusia, bila berbeda dari keluaran model. */
  nilaiSuntingan?: string | null;
  dikonfirmasi: boolean;
};

export type TerminMasuk = {
  urutan: number;
  nilai: number | null;
  syarat: string;
  jatuhTempo: string | null;
};

export type MasukanSimpan = {
  namaBerkas: string;
  jumlahHalaman: number;
  model: string;
  medan: MedanMasuk[];
  termin?: TerminMasuk[];
  /** DRAF bila belum semua medan wajib dikonfirmasi. */
  status: "DRAF" | "BERJALAN";
  /**
   * Berkas PDF sumber. Wajib: kontrak tidak boleh tersimpan tanpa berkas yang
   * bisa ditelusuri, karena sorotan dan hasil ekstraksi menempel pada berkas itu.
   */
  berkas: {
    data: Uint8Array;
    tanggalEditBerkas?: Date | null;
  };
  /** Pengguna yang mengunggah dan menyimpan. Kosong sampai login selesai dibangun. */
  penggunaId?: string | null;
  /** FPP pemilik kontrak, dipakai untuk filter awal dasbor. */
  fungsiId?: string | null;
};

export type HasilSimpan = {
  nomor: string;
  judul: string;
  baru: boolean;
  kontrakId: string;
  dokumenId: string;
  ekstraksiId: string;
};

const bulat2 = (n: number) => Math.round(n * 100) / 100;

export async function simpanKontrak(masuk: MasukanSimpan): Promise<HasilSimpan> {
  const per = new Map(masuk.medan.map((m) => [m.kunci, m]));
  // Suntingan manusia menang atas keluaran model. Medan yang ditafsirkan kode
  // tanpa ditinjau manusia hanya dipakai bila frasanya terbukti ada di PDF.
  const ambil = (k: string) => {
    const m = per.get(k);
    return m ? nilaiYangDipakai(k, m) : null;
  };

  const nomor = ambil("nomor_kontrak");
  if (!nomor) {
    throw new Error(
      "Nomor kontrak tidak ditemukan pada dokumen. Kontrak tidak dapat disimpan tanpa nomor, karena nomor itu yang menjadi kuncinya."
    );
  }

  const namaVendor = ambil("nama_vendor");
  const judul = ambil("lingkup_pekerjaan") ?? "Tanpa judul";

  // Berkas dianalisis dan disimpan sebelum transaksi. Nama berkas di disk
  // adalah sidik isinya, jadi berkas yatim bila transaksi gagal tidak
  // berbahaya: unggahan berikutnya yang sama persis memakainya kembali.
  const analisis = await analisisBerkas(masuk.berkas.data);
  const lokasi = await simpanBerkas(masuk.berkas.data, analisis.sidik);

  const nilaiKontrak = uraiRupiah(ambil("nilai_kontrak"));
  const tanggalBerakhir = uraiTanggal(ambil("tanggal_berakhir"));

  // Jaminan Pelaksanaan: besarnya dalam rupiah dihitung dari persentase bila
  // dokumen menyebut persentase. Berakhirnya dihitung dari tanggal berakhir
  // pekerjaan bila dokumen menyebut "N hari setelah serah terima".
  const jaminanPersen = uraiPersen(ambil("nilai_jaminan_pelaksanaan"));
  const nilaiJaminan =
    jaminanPersen !== null && nilaiKontrak !== null
      ? bulat2((nilaiKontrak * jaminanPersen) / 100)
      : uraiRupiah(ambil("nilai_jaminan_pelaksanaan"));
  const masaJaminan = uraiMasaBerlakuJaminan(ambil("masa_berlaku_jaminan"));
  const jaminanBerlakuSampai =
    masaJaminan?.jenis === "TANGGAL"
      ? masaJaminan.tanggal
      : masaJaminan?.jenis === "SETELAH_SELESAI" && tanggalBerakhir
        ? tambahHari(tanggalBerakhir, masaJaminan.hari)
        : null;

  const kolom = {
    judul,
    status: masuk.status,
    nilaiKontrak,
    termasukPpn: uraiTermasukPpn(ambil("nilai_termasuk_ppn")),
    komitmenTkdnPersen: uraiPersen(ambil("komitmen_tkdn")),
    tarifDendaPermil: uraiTarifPermil(ambil("tarif_denda_harian")),
    batasDendaPersen: uraiPersen(ambil("batas_maksimum_denda")),
    nilaiJaminan,
    jaminanBerlakuSampai,
    tanggalMulai: uraiTanggal(ambil("tanggal_mulai")),
    tanggalBerakhir,
    masaPemeliharaanHari: uraiHari(ambil("masa_pemeliharaan")),
  };

  return prisma.$transaction(
    async (tx) => {
      // Vendor dicari berdasarkan nama. Bila belum ada, dibuat. Ini
      // penyederhanaan yang disengaja: master data vendor yang lengkap
      // (akta, NPWP, golongan usaha) diisi terpisah dan akan menggantikan
      // pencarian berdasarkan nama ini.
      let vendorId: string | null = null;
      if (namaVendor) {
        const ada = await tx.vendor.findFirst({ where: { nama: namaVendor } });
        vendorId = ada ? ada.id : (await tx.vendor.create({ data: { nama: namaVendor } })).id;
      }

      const sebelum = await tx.kontrak.findUnique({ where: { nomor } });

      const kontrak = await tx.kontrak.upsert({
        where: { nomor },
        update: { ...kolom, vendorId, ...(masuk.fungsiId ? { fungsiId: masuk.fungsiId } : {}) },
        create: {
          nomor,
          ...kolom,
          vendorId,
          fungsiId: masuk.fungsiId ?? null,
          dibuatOlehId: masuk.penggunaId ?? null,
        },
      });

      // Rincian termin ditulis ulang seluruhnya, bukan ditambahkan, sebab yang
      // berlaku adalah hasil ekstraksi terakhir yang sudah diverifikasi. Baris
      // tanpa nominal dibuang, karena termin tanpa nilai tidak berguna sebagai
      // dasar pembayaran.
      const terminSah = (masuk.termin ?? []).filter((t) => t.nilai !== null && t.nilai > 0);
      if (terminSah.length > 0) {
        await tx.termin.deleteMany({ where: { kontrakId: kontrak.id } });
        await tx.termin.createMany({
          data: terminSah.map((t, i) => ({
            kontrakId: kontrak.id,
            urutan: i + 1,
            nilai: t.nilai as number,
            syarat: t.syarat,
            // Termin tanpa tanggal tetap disimpan, memakai tanggal berakhir
            // kontrak sebagai perkiraan, supaya barisnya tidak hilang begitu saja.
            jatuhTempo: t.jatuhTempo ? new Date(t.jatuhTempo) : (kolom.tanggalBerakhir ?? new Date()),
          })),
        });
      }

      // Berkas yang sama persis pada kontrak yang sama memakai kembali baris
      // dokumennya. Isinya berbeda berarti versi baru, dan versi lama tetap ada.
      const dokumen =
        (await tx.dokumen.findUnique({
          where: { kontrakId_hashSha256: { kontrakId: kontrak.id, hashSha256: analisis.sidik } },
        })) ??
        (await tx.dokumen.create({
          data: {
            kontrakId: kontrak.id,
            jenis: "KONTRAK",
            namaBerkas: masuk.namaBerkas,
            lokasiSimpan: lokasi,
            hashSha256: analisis.sidik,
            ukuranByte: analisis.ukuranByte,
            jumlahHalaman: analisis.jumlahHalaman,
            adaLapisanTeks: analisis.adaLapisanTeks,
            tanggalEditBerkas: masuk.berkas.tanggalEditBerkas ?? null,
            diunggahOlehId: masuk.penggunaId ?? null,
          },
        }));

      // Riwayat ekstraksi ditulis sebagai baris baru setiap kali, tidak
      // menimpa. Unggah ulang dokumen yang sama harus meninggalkan jejak keduanya.
      const ekstraksi = await tx.ekstraksi.create({
        data: {
          dokumenId: dokumen.id,
          model: masuk.model,
          dijalankanOlehId: masuk.penggunaId ?? null,
          selesaiPada: new Date(),
        },
      });

      for (const [i, def] of MEDAN.entries()) {
        const m = per.get(def.kunci);
        if (!m) continue;

        const baris = await tx.medanEkstraksi.create({
          data: {
            ekstraksiId: ekstraksi.id,
            urutan: i + 1,
            kunci: def.kunci,
            label: def.label,
            kelompok: def.kelompok,
            nilai: m.nilai,
            nilaiSuntingan: m.nilaiSuntingan ?? null,
            keyakinan: m.keyakinan,
            wajibKonfirmasi: def.wajibKonfirmasi,
            dikonfirmasi: m.dikonfirmasi,
            dikonfirmasiPada: m.dikonfirmasi ? new Date() : null,
            dikonfirmasiOlehId: m.dikonfirmasi ? (masuk.penggunaId ?? null) : null,
          },
        });

        if (m.kotak.length > 0) {
          await tx.sorotan.createMany({
            data: m.kotak.map((k) => ({
              medanId: baris.id,
              dokumenId: dokumen.id,
              halaman: k.halaman,
              x: k.x,
              y: k.y,
              lebar: k.lebar,
              tinggi: k.tinggi,
            })),
          });
        }
      }

      await catatAktivitas(tx, {
        penggunaId: masuk.penggunaId,
        aksi: AKSI.SIMPAN_KONTRAK,
        entitas: "kontrak",
        entitasId: kontrak.id,
        rincian: {
          nomor,
          status: masuk.status,
          baru: sebelum === null,
          dokumenId: dokumen.id,
          model: masuk.model,
        },
      });

      return {
        nomor,
        judul,
        baru: sebelum === null,
        kontrakId: kontrak.id,
        dokumenId: dokumen.id,
        ekstraksiId: ekstraksi.id,
      };
    },
    OPSI_TRANSAKSI
  );
}
