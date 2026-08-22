// Menyimpan hasil ekstraksi yang sudah diverifikasi ke basis data.
//
// Yang disimpan bukan hanya nilai akhirnya, melainkan seluruh jejaknya:
// nilai mentah dari model, nilai hasil suntingan manusia bila ada, angka
// keyakinan, dan kotak sorotan tempat nilai itu ditemukan. Tanpa jejak itu,
// tidak ada yang bisa menjawab pertanyaan "dari mana angka ini" enam bulan
// kemudian, padahal Satuan Pengawasan Intern dan BPK adalah pemangku
// kepentingan yang tercatat di proposal.

import { prisma } from "@/lib/prisma";
import { MEDAN } from "./medan";
import { uraiRupiah, uraiPersen, uraiCacah, uraiTanggal } from "./urai";
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
};

export type HasilSimpan = {
  nomor: string;
  judul: string;
  baru: boolean;
};

/** Nilai yang berlaku adalah suntingan manusia bila ada, selain itu keluaran model. */
function nilaiBerlaku(m: MedanMasuk): string | null {
  return m.nilaiSuntingan ?? m.nilai;
}

export async function simpanKontrak(masuk: MasukanSimpan): Promise<HasilSimpan> {
  const per = new Map(masuk.medan.map((m) => [m.kunci, m]));
  const ambil = (k: string) => nilaiBerlaku(per.get(k) ?? ({} as MedanMasuk)) ?? null;

  const nomor = ambil("nomor_kontrak");
  if (!nomor) {
    throw new Error(
      "Nomor kontrak tidak ditemukan pada dokumen. Kontrak tidak dapat disimpan tanpa nomor, karena nomor itu yang menjadi kuncinya."
    );
  }

  const namaVendor = ambil("nama_vendor");
  const judul = ambil("lingkup_pekerjaan") ?? "Tanpa judul";

  // Vendor dicari berdasarkan nama. Bila belum ada, dibuat. Ini penyederhanaan
  // yang disengaja: master data vendor yang sebenarnya adalah pekerjaan modul
  // D11, dan akan menggantikan pencarian berdasarkan nama ini.
  let vendorId: string | null = null;
  if (namaVendor) {
    const ada = await prisma.vendor.findFirst({ where: { nama: namaVendor } });
    vendorId = ada
      ? ada.id
      : (await prisma.vendor.create({ data: { nama: namaVendor } })).id;
  }

  const sebelum = await prisma.kontrak.findUnique({ where: { nomor } });

  const kolom = {
    judul,
    status: masuk.status,
    vendorId,
    nilaiKontrak: uraiRupiah(ambil("nilai_kontrak")),
    komitmenTkdn: uraiPersen(ambil("komitmen_tkdn")),
    tarifDendaHarian: ambil("tarif_denda_harian"),
    batasMaksDenda: uraiPersen(ambil("batas_maksimum_denda")),
    jumlahTermin: uraiCacah(ambil("jumlah_termin")),
    tanggalMulai: uraiTanggal(ambil("tanggal_mulai")),
    tanggalBerakhir: uraiTanggal(ambil("tanggal_berakhir")),
    namaBerkas: masuk.namaBerkas,
    jumlahHalaman: masuk.jumlahHalaman,
  };

  const kontrak = await prisma.kontrak.upsert({
    where: { nomor },
    update: kolom,
    create: { nomor, ...kolom },
  });

  // Rincian termin ditulis ulang seluruhnya, bukan ditambahkan, sebab yang
  // berlaku adalah hasil ekstraksi terakhir yang sudah diverifikasi. Baris
  // tanpa nominal dibuang, karena termin tanpa nilai tidak berguna sebagai
  // dasar pembayaran.
  const terminSah = (masuk.termin ?? []).filter((t) => t.nilai !== null && t.nilai > 0);
  if (terminSah.length > 0) {
    await prisma.termin.deleteMany({ where: { kontrakId: kontrak.id } });
    await prisma.termin.createMany({
      data: terminSah.map((t, i) => ({
        kontrakId: kontrak.id,
        urutan: i + 1,
        nilai: t.nilai as number,
        syarat: t.syarat,
        // Termin tanpa tanggal tetap disimpan, memakai tanggal berakhir
        // kontrak sebagai perkiraan, supaya barisnya tidak hilang begitu saja.
        jatuhTempo: t.jatuhTempo
          ? new Date(t.jatuhTempo)
          : (kolom.tanggalBerakhir ?? new Date()),
      })),
    });
  }

  // Riwayat ekstraksi ditulis sebagai baris baru setiap kali, tidak menimpa.
  // Unggah ulang dokumen yang sama harus meninggalkan jejak keduanya.
  const ekstraksi = await prisma.ekstraksi.create({
    data: {
      kontrakId: kontrak.id,
      model: masuk.model,
      selesaiPada: new Date(),
    },
  });

  for (const [i, def] of MEDAN.entries()) {
    const m = per.get(def.kunci);
    if (!m) continue;

    const baris = await prisma.medanEkstraksi.create({
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
      },
    });

    if (m.kotak.length > 0) {
      await prisma.sorotan.createMany({
        data: m.kotak.map((k) => ({
          medanId: baris.id,
          halaman: k.halaman,
          x: k.x,
          y: k.y,
          lebar: k.lebar,
          tinggi: k.tinggi,
        })),
      });
    }
  }

  return { nomor, judul, baru: sebelum === null };
}
