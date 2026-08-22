// Klien Prisma tunggal.
//
// Sejak Prisma 7, PrismaClient menuntut driver adapter, bukan lagi alamat
// sambungan yang tertulis di schema.prisma.
//
// Klien disimpan pada globalThis supaya hot reload Next.js pada mode
// pengembangan tidak membuka sambungan baru setiap kali berkas berubah,
// yang cepat menghabiskan kuota sambungan basis data terkelola.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function buatKlien() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum diisi. Salin .env.example menjadi .env.local lalu isi alamat sambungan PostgreSQL."
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

const wadah = globalThis as unknown as { prisma?: ReturnType<typeof buatKlien> };

export const prisma = wadah.prisma ?? buatKlien();

if (process.env.NODE_ENV !== "production") {
  wadah.prisma = prisma;
}
