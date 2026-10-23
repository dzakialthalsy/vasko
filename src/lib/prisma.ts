// Klien Prisma tunggal.
//
// Sejak Prisma 7, PrismaClient menuntut driver adapter, bukan lagi alamat
// sambungan yang tertulis di schema.prisma.
//
// Klien dibuat saat PERTAMA DIPAKAI, bukan saat modul ini diimpor. Dengan
// begitu mengimpor modul apa pun yang memakai prisma tidak gagal ketika
// DATABASE_URL belum diisi, misalnya pada pengujian logika murni atau saat
// build. Galat yang jelas baru muncul ketika basis data benar-benar dibutuhkan.
//
// Klien disimpan pada globalThis di mode pengembangan supaya hot reload
// Next.js tidak membuka sambungan baru setiap kali berkas berubah, yang cepat
// menghabiskan kuota sambungan basis data terkelola.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function buatKlien(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum diisi. Salin .env.example menjadi .env.local lalu isi alamat sambungan PostgreSQL."
    );
  }
  // DATABASE_SKEMA hanya dipakai skrip pengujian, supaya uji berjalan di skema
  // sementara dan tidak menyentuh data di skema public. Kosong di produksi.
  const skema = process.env.DATABASE_SKEMA?.trim();
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, skema ? { schema: skema } : undefined),
  });
}

const wadah = globalThis as unknown as { prisma?: PrismaClient };
let instansi: PrismaClient | undefined = wadah.prisma;

function klien(): PrismaClient {
  if (!instansi) {
    instansi = buatKlien();
    if (process.env.NODE_ENV !== "production") wadah.prisma = instansi;
  }
  return instansi;
}

// Pembungkus yang meneruskan setiap akses ke klien asli. Fungsi diikat ke
// klien asli supaya "this" di dalam Prisma tetap benar.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, properti) {
    const k = klien();
    const nilai = Reflect.get(k, properti, k);
    return typeof nilai === "function" ? nilai.bind(k) : nilai;
  },
});

/**
 * Opsi untuk setiap prisma.$transaction interaktif. Pakai ini, jangan bawaan.
 *
 * maxWait adalah batas waktu untuk MEMULAI transaksi: mendapat koneksi dari
 * pool lalu menjalankan BEGIN. Bawaannya hanya 2 detik. Pool menutup koneksi
 * yang menganggur lebih dari 10 detik, padahal sebagian besar transaksi di
 * sini berjalan setelah menunggu jawaban AI selama puluhan detik, jadi
 * koneksinya harus dibuka ulang. Ke Neon dari Indonesia itu bisa lebih dari
 * 2 detik, dan transaksi gagal dengan "Unable to start a transaction in the
 * given time". Itulah yang terjadi pada amendemen kedua di uji live 20 Oktober.
 *
 * timeout adalah batas waktu seluruh isi transaksi. Bawaannya 5 detik, terlalu
 * ketat untuk menyimpan hasil validasi yang menjalankan puluhan query.
 */
export const OPSI_TRANSAKSI = { maxWait: 20_000, timeout: 60_000 };
