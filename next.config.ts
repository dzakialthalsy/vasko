import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ada package-lock.json nyasar di direktori home pengguna. Tanpa akar yang
  // dikunci, Turbopack menelusuri ke atas dan memungut berkas itu, lalu
  // memperingatkan bahwa letaknya di luar repositori. Mengunci akar ke folder
  // proyek menghilangkan ketidakpastian resolusi modul.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  // Tombol bundar Next.js di pojok kiri bawah ikut terpotret saat
  // membandingkan tampilan dengan rancangan, sehingga dimatikan.
  devIndicators: false,
  // pdfjs-dist membaca berkas pendukungnya sendiri dari node_modules saat
  // berjalan. Membundelnya membuat jalur itu ditulis ulang menjadi jalur
  // maya yang tidak ada di cakram. Dibiarkan eksternal, resolusinya kembali
  // wajar dan penelusuran berkas proyek tidak lagi melebar.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
