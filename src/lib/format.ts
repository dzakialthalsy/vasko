// Pemformatan tampilan. Seluruhnya memakai locale id-ID dan zona waktu
// Asia/Makassar, mengikuti wilayah operasi Regional Kalimantan, supaya
// tanggal tidak bergeser sehari saat dirender di server.

const ZONA = "Asia/Makassar";

export function rupiah(nilai: number | bigint | null | undefined): string {
  if (nilai === null || nilai === undefined) return "-";
  // Intl menyisipkan spasi tak terputus setelah "Rp". Spasi itu dibuang agar
  // sama dengan penulisan pada wireframe dan pada proposal, misalnya
  // Rp1.023.000, bukan Rp 1.023.000.
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  })
    .format(Number(nilai))
    .replace(/^Rp\s*/u, "Rp");
}

/** Bentuk ringkas untuk kartu ikhtisar, misalnya Rp128,4 M. */
export function rupiahRingkas(nilai: number): string {
  const miliar = nilai / 1_000_000_000;
  if (Math.abs(miliar) >= 1) {
    return `Rp${miliar.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  }
  const juta = nilai / 1_000_000;
  return `Rp${juta.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
}

export function tanggal(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: ZONA,
  }).format(new Date(d));
}

export function tanggalPanjang(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONA,
  }).format(new Date(d));
}

/**
 * Sisa hari menuju sebuah tanggal, dihitung pada batas hari kalender di zona
 * Asia/Makassar. Membandingkan cap waktu mentah akan salah sehari ketika jam
 * server berbeda, sehingga tanggalnya dinormalkan dulu ke tengah malam.
 */
export function sisaHari(target: Date | string, dari: Date = new Date()): number {
  const keHari = (d: Date) => {
    const s = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: ZONA,
    }).format(d);
    return Date.parse(`${s}T00:00:00Z`);
  };
  return Math.round((keHari(new Date(target)) - keHari(dari)) / 86_400_000);
}

export function persen(nilai: number, pecahan = 0): string {
  return `${nilai.toLocaleString("id-ID", {
    minimumFractionDigits: pecahan,
    maximumFractionDigits: pecahan,
  })}%`;
}
