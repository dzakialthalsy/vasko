// Mencocokkan nilai hasil ekstraksi kembali ke daftar kata pada PDF, lalu
// menurunkan kotak sorotan dan angka keyakinan.
//
// Keputusan penting: angka keyakinan TIDAK ditanyakan kepada model. Model
// bahasa tidak menghasilkan angka keyakinan yang tepercaya bila sekadar
// diminta menilai dirinya sendiri. Di sini keyakinan dihitung dari kualitas
// kecocokan antara nilai yang dikembalikan model dan teks yang benar-benar
// tercetak di dokumen. Sifatnya deterministik, dapat diperiksa ulang, dan
// selaras dengan prinsip yang dipakai pada kalkulasi denda.

import type { Kata } from "./kata";

export type KotakSorotan = {
  halaman: number;
  x: number;
  y: number;
  lebar: number;
  tinggi: number;
};

export type HasilCocok = {
  ditemukan: boolean;
  keyakinan: number;
  /** Teks apa adanya dari PDF pada rentang yang cocok. */
  teksSumber: string;
  halaman: number | null;
  kotak: KotakSorotan[];
};

/** Membuang segala yang bukan huruf atau angka, lalu menyeragamkan huruf. */
function normal(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Jarak sunting Levenshtein, memakai dua baris agar hemat memori. */
function jarakSunting(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let sebelum = Array.from({ length: b.length + 1 }, (_, i) => i);
  let kini = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    kini[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const biaya = a[i - 1] === b[j - 1] ? 0 : 1;
      kini[j] = Math.min(sebelum[j] + 1, kini[j - 1] + 1, sebelum[j - 1] + biaya);
    }
    [sebelum, kini] = [kini, sebelum];
  }
  return sebelum[b.length];
}

/** Kemiripan 0 sampai 1, diturunkan dari jarak sunting. */
export function kemiripan(a: string, b: string): number {
  const maks = Math.max(a.length, b.length);
  if (maks === 0) return 1;
  return 1 - jarakSunting(a, b) / maks;
}

/**
 * Menggabungkan kata-kata yang cocok menjadi kotak sorotan, satu kotak per
 * baris. Sebuah frasa bisa terpotong pergantian baris, dan satu kotak besar
 * yang membentang dua baris akan menutupi teks yang tidak relevan di antara
 * keduanya.
 */
function jadikanKotak(kata: Kata[]): KotakSorotan[] {
  if (kata.length === 0) return [];

  const baris = new Map<string, Kata[]>();
  for (const k of kata) {
    // Kata pada baris yang sama boleh berbeda beberapa titik, jadi posisi y
    // dibulatkan agar tetap terkelompok.
    const kunci = `${k.halaman}:${Math.round(k.y / 3)}`;
    const daftar = baris.get(kunci);
    if (daftar) daftar.push(k);
    else baris.set(kunci, [k]);
  }

  const empuk = 1.5;
  return [...baris.values()].map((daftar) => {
    const x0 = Math.min(...daftar.map((k) => k.x));
    const x1 = Math.max(...daftar.map((k) => k.x + k.lebar));
    const y0 = Math.min(...daftar.map((k) => k.y));
    const y1 = Math.max(...daftar.map((k) => k.y + k.tinggi));
    return {
      halaman: daftar[0].halaman,
      x: x0 - empuk,
      y: y0 - empuk,
      lebar: x1 - x0 + empuk * 2,
      tinggi: y1 - y0 + empuk * 2,
    };
  });
}

/**
 * Mencari nilai pada daftar kata satu dokumen.
 *
 * Pencarian dilakukan atas teks yang sudah dinormalkan, sehingga perbedaan
 * tanda baca, spasi, dan besar kecil huruf tidak menggagalkan kecocokan.
 * Peta indeks menjaga jalan pulang dari posisi karakter ke kata asalnya.
 */
export function cocokkan(nilai: string, kata: Kata[]): HasilCocok {
  const kosong: HasilCocok = {
    ditemukan: false,
    keyakinan: 0,
    teksSumber: "",
    halaman: null,
    kotak: [],
  };
  const target = normal(nilai);
  if (!target || kata.length === 0) return kosong;

  // Rangkai seluruh kata menjadi satu untai ternormalkan, sambil mencatat
  // kata asal tiap karakter.
  let untai = "";
  const pemilik: number[] = [];
  for (let i = 0; i < kata.length; i++) {
    const n = normal(kata[i].teks);
    for (let c = 0; c < n.length; c++) pemilik.push(i);
    untai += n;
  }

  // Posisi karakter tempat setiap kata dimulai dan berakhir pada untai
  // ternormalkan. Dipakai menilai apakah sebuah kecocokan jatuh tepat pada
  // batas kata.
  const awalKata = new Set<number>();
  const akhirKata = new Set<number>();
  {
    let p = 0;
    for (const k of kata) {
      const n = normal(k.teks);
      if (n.length === 0) continue;
      awalKata.add(p);
      akhirKata.add(p + n.length);
      p += n.length;
    }
  }

  const susun = (mulai: number, panjang: number) => {
    const iAwal = pemilik[mulai];
    const iAkhir = pemilik[Math.min(mulai + panjang - 1, pemilik.length - 1)];
    const potong = kata.slice(iAwal, iAkhir + 1);
    return { potong, teksSumber: potong.map((k) => k.teks).join(" ") };
  };

  // Telusuri SELURUH kemunculan, bukan hanya yang pertama. Nilai pendek
  // seperti "42%" muncul sebagai potongan di dalam untai lain, misalnya di
  // dalam nomor kontrak KTR/2026/0142. Mengambil kemunculan pertama begitu
  // saja akan menaruh sorotan di tempat yang keliru.
  let terbaikPersis = { skor: -1, mulai: -1 };
  for (let i = untai.indexOf(target); i >= 0; i = untai.indexOf(target, i + 1)) {
    const { teksSumber } = susun(i, target.length);
    const mirip = Math.max(
      kemiripan(nilai.trim(), teksSumber),
      kemiripan(target, normal(teksSumber))
    );
    // Kecocokan yang jatuh tepat pada batas kata jauh lebih mungkin benar
    // daripada yang terpotong di tengah kata.
    const rapiKiri = awalKata.has(i);
    const rapiKanan = akhirKata.has(i + target.length);
    const skor = mirip + (rapiKiri ? 0.15 : 0) + (rapiKanan ? 0.15 : 0);
    if (skor > terbaikPersis.skor) terbaikPersis = { skor, mulai: i };
  }

  if (terbaikPersis.mulai >= 0) {
    const { potong, teksSumber } = susun(terbaikPersis.mulai, target.length);
    const keyakinan = Math.max(
      kemiripan(nilai.trim(), teksSumber),
      kemiripan(target, normal(teksSumber))
    );
    // Sekalipun untainya cocok persis, bila teks di sekitarnya jauh berbeda
    // berarti yang tertangkap hanyalah potongan kebetulan.
    if (keyakinan >= 0.5) {
      return {
        ditemukan: true,
        keyakinan: Math.round(keyakinan * 1000) / 1000,
        teksSumber,
        halaman: potong[0].halaman,
        kotak: jadikanKotak(potong),
      };
    }
  }

  let mulai: number;

  // Tidak cocok persis. Geser jendela sepanjang target untuk mencari rentang
  // paling mirip. Langkahnya diperbesar pada dokumen panjang agar tetap cepat.
  const panjang = target.length;
  const langkah = Math.max(1, Math.floor(panjang / 12));
  let terbaik = { skor: 0, mulai: -1 };
  for (let i = 0; i + panjang <= untai.length; i += langkah) {
    const skor = kemiripan(target, untai.slice(i, i + panjang));
    if (skor > terbaik.skor) terbaik = { skor, mulai: i };
  }

  // Di bawah ambang ini kecocokannya kebetulan belaka, lebih jujur dinyatakan
  // tidak ditemukan daripada memasang sorotan di tempat yang keliru.
  if (terbaik.skor < 0.72 || terbaik.mulai < 0) return kosong;

  mulai = terbaik.mulai;
  const { potong, teksSumber } = susun(mulai, panjang);

  return {
    ditemukan: true,
    keyakinan: Math.round(terbaik.skor * 1000) / 1000,
    teksSumber,
    halaman: potong[0].halaman,
    kotak: jadikanKotak(potong),
  };
}
