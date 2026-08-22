"use client";

import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { titipBerkas } from "@/lib/berkas-antar";

/**
 * Tombol unggah pada daftar kontrak.
 *
 * Menekannya langsung membuka pemilih berkas dan halaman tidak berpindah.
 * Perpindahan ke layar verifikasi baru terjadi setelah berkas benar-benar
 * dipilih, sehingga pengguna tidak pernah mendarat di layar verifikasi yang
 * kosong. Dibungkus label supaya medan berkasnya dapat disembunyikan tanpa
 * kehilangan aksesibilitas keyboard.
 */
export function TombolUnggah() {
  const router = useRouter();

  return (
    <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy-900">
      <Upload size={16} aria-hidden /> Unggah Kontrak
      <input
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => {
          const berkas = e.target.files?.[0];
          if (!berkas) return;
          titipBerkas(berkas);
          // Medan dikosongkan supaya memilih berkas yang sama dua kali
          // berturut-turut tetap memicu perubahan.
          e.target.value = "";
          router.push("/kontrak/unggah");
        }}
      />
    </label>
  );
}
