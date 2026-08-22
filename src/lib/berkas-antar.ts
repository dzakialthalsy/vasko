/**
 * Penitipan berkas antar halaman.
 *
 * Berkas dipilih di halaman daftar kontrak, lalu dibaca oleh halaman
 * verifikasi setelah navigasi. Titipannya disimpan di memori modul, bukan di
 * sessionStorage, karena sessionStorage hanya menerima teks sedangkan PDF
 * kontrak berukuran beberapa megabita. Mengubahnya menjadi base64 lebih dulu
 * akan menembus batas kuotanya.
 *
 * Nilai ini bertahan selama navigasi sisi klien, dan memang sengaja hilang
 * ketika halaman dimuat ulang. Membuka langsung halaman verifikasi tanpa
 * memilih berkas karena itu menampilkan keadaan kosong, bukan dokumen sisa
 * dari kunjungan sebelumnya.
 */
let titipan: File | null = null;

export function titipBerkas(berkas: File) {
  titipan = berkas;
}

/** Mengambil sekaligus mengosongkan titipan, supaya tidak terbaca dua kali. */
export function ambilBerkas(): File | null {
  const berkas = titipan;
  titipan = null;
  return berkas;
}
