// Konfigurasi Prisma 7.
//
// Sejak Prisma 7, alamat sambungan tidak boleh lagi ditulis di schema.prisma.
// Untuk Prisma Migrate, alamatnya dibaca dari berkas ini.
//
// Next.js membaca .env.local secara bawaan, tetapi Prisma CLI tidak. Maka
// berkas itu dimuat secara eksplisit di sini, supaya hanya ada SATU tempat
// menyimpan rahasia dan tidak muncul kebingungan .env versus .env.local.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local", quiet: true });

const alamat = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Alamat hanya disertakan bila variabelnya memang ada.
  //
  // Memakai env("DATABASE_URL") membuat berkas ini gagal dimuat ketika
  // variabelnya kosong, dan itu ikut menggagalkan "prisma generate" yang
  // berjalan pada postinstall. Akibatnya "npm install" gagal pada klon baru
  // yang belum sempat mengisi .env.local, padahal generate sama sekali tidak
  // menyentuh basis data. Perintah yang benar-benar butuh sambungan, seperti
  // "prisma migrate", tetap mengeluh sendiri bila alamatnya belum diisi.
  ...(alamat ? { datasource: { url: alamat } } : {}),
});
