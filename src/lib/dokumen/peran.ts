// Menentukan peran setiap dokumen pendukung dalam satu kali validasi: utama,
// komplementer, atau digantikan. Murni kode, tanpa AI dan tanpa basis data.
//
// Dasarnya keputusan tim sesudah masukan Pak Rigga pada progress report 2
// Oktober 2026 dan arahan Pak Rahman 9 Oktober:
//
//   - Dua dokumen sejenis TIDAK saling menggugurkan. Yang dilihat substansi
//     isinya, bukan tanggalnya, dan tidak ada dokumen yang "tidak valid".
//   - Dokumen baru yang menyebut perubahan ("ditambah 5", "dikurangi 3"):
//     kedua dokumen sama-sama KOMPLEMENTER, nilainya dijumlahkan.
//   - Dokumen baru yang menyebut nilai pengganti ("diubah menjadi 15"):
//     dokumen lama DIGANTIKAN, nilainya diganti.
//   - Urutan memakai tanggal yang tertulis di ISI dokumen. Tanggal berkas
//     terakhir diubah hanya dipakai bila dua dokumen bertanggal isi sama.
//   - Dokumen utama tidak diberi label di tampilan.
//
// AI hanya membaca pernyataan dari tiap dokumen (butir, atribut, cara
// menyebut angka, angkanya). Penentuan label, urutan, dan penjumlahan nilai
// dikerjakan di sini, supaya hasilnya selalu sama dan bisa diuji.

import type { AtributPernyataan, JenisPernyataan } from "./katalog";

export type PernyataanTerurai = {
  /** Hal yang diubah, misalnya "titik pemeriksaan perpipaan". */
  butir: string;
  atribut: AtributPernyataan;
  jenis: JenisPernyataan;
  /** Angka mutlak seperti tertulis. Tandanya ditentukan oleh jenis. */
  nilai: number;
  satuan: string | null;
};

export type DokumenUntukPeran = {
  id: string;
  nama: string;
  jenisPendukung: string | null;
  tanggalDiIsi: Date | null;
  tanggalEditBerkas: Date | null;
  pernyataan: PernyataanTerurai[];
};

export type LabelPeran = "UTAMA" | "KOMPLEMENTER" | "DIGANTIKAN";

export type HasilPeran = {
  dokumenId: string;
  label: LabelPeran;
  digantikanOlehId: string | null;
  alasan: string;
};

export type NilaiEfektif = {
  butir: string;
  atribut: AtributPernyataan;
  satuan: string | null;
  nilai: number;
  /** Dokumen yang menyumbang pada nilai ini, berurutan. */
  dokumenId: string[];
  /** Benar bila ada TAMBAH atau KURANG tanpa nilai dasar sebelumnya. */
  tanpaDasar: boolean;
  /** Benar bila dua dokumen menyebut nilai pengganti berbeda pada waktu yang sama. */
  konflik: boolean;
  /** Benar bila nilainya ikut dipengaruhi dokumen yang tanggal isinya tidak terbaca. */
  tanggalTakPasti: boolean;
};

// ------------------------------------------------------------ pencocokan butir

const KATA_BANTU = new Set([
  "dan", "di", "ke", "dari", "yang", "untuk", "pada", "dengan", "atau", "serta", "the",
  "jumlah", "total", "banyaknya", "sebanyak", "nilai", "harga", "masa", "lama", "durasi",
]);

function tokenButir(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !KATA_BANTU.has(t));
}

/**
 * Apakah dua penyebutan butir menunjuk hal yang sama. Model kadang menulis
 * "titik pemeriksaan perpipaan" pada satu dokumen dan "pemeriksaan titik
 * sistem perpipaan" pada dokumen lain, jadi kecocokan persis terlalu ketat.
 * Dianggap sama bila himpunan kata kuncinya sama, yang satu memuat seluruh
 * yang lain, atau irisannya mencapai 60 persen gabungan.
 */
export function samaButir(a: string, b: string): boolean {
  const ta = new Set(tokenButir(a));
  const tb = new Set(tokenButir(b));
  if (ta.size === 0 || tb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();

  const irisan = [...ta].filter((t) => tb.has(t)).length;
  if (irisan === 0) return false;
  if (irisan === ta.size || irisan === tb.size) return true;
  const gabungan = new Set([...ta, ...tb]).size;
  return irisan / gabungan >= 0.6;
}

function samaKunci(p: PernyataanTerurai, q: PernyataanTerurai): boolean {
  return p.atribut === q.atribut && samaButir(p.butir, q.butir);
}

// ------------------------------------------------------------------ urutan

type Peringkat = { tanggal: number | null; edit: number | null };

const peringkat = (d: DokumenUntukPeran): Peringkat => ({
  tanggal: d.tanggalDiIsi ? d.tanggalDiIsi.getTime() : null,
  edit: d.tanggalEditBerkas ? d.tanggalEditBerkas.getTime() : null,
});

/**
 * Membandingkan dua dokumen: negatif bila a lebih lama dari b, positif bila
 * lebih baru, nol bila tidak bisa dibedakan. Tanggal isi lebih dulu. Tanggal
 * berkas hanya menentukan bila tanggal isi KEDUANYA ada dan sama.
 * Bila salah satu tanggal isinya tidak terbaca, urutannya tidak bisa
 * dipastikan dan hasilnya nol.
 */
export function bandingkanUrutan(a: DokumenUntukPeran, b: DokumenUntukPeran): number {
  const pa = peringkat(a);
  const pb = peringkat(b);
  if (pa.tanggal === null || pb.tanggal === null) return 0;
  if (pa.tanggal !== pb.tanggal) return pa.tanggal < pb.tanggal ? -1 : 1;
  if (pa.edit === null || pb.edit === null || pa.edit === pb.edit) return 0;
  return pa.edit < pb.edit ? -1 : 1;
}

function tanggalTeks(d: DokumenUntukPeran): string {
  return d.tanggalDiIsi ? d.tanggalDiIsi.toISOString().slice(0, 10) : "tanggal tidak terbaca";
}

// -------------------------------------------------------------------- peran

function kelompokkan(dokumen: DokumenUntukPeran[]): DokumenUntukPeran[][] {
  const kelompok = new Map<string, DokumenUntukPeran[]>();
  const sendiri: DokumenUntukPeran[][] = [];
  for (const d of dokumen) {
    // Dokumen tanpa jenis atau berjenis LAINNYA tidak punya pasangan yang
    // pasti, jadi masing-masing berdiri sendiri.
    if (!d.jenisPendukung || d.jenisPendukung === "LAINNYA") {
      sendiri.push([d]);
      continue;
    }
    const daftar = kelompok.get(d.jenisPendukung);
    if (daftar) daftar.push(d);
    else kelompok.set(d.jenisPendukung, [d]);
  }
  return [...kelompok.values(), ...sendiri];
}

function peranKelompok(grup: DokumenUntukPeran[]): HasilPeran[] {
  if (grup.length === 1) {
    return [
      { dokumenId: grup[0].id, label: "UTAMA", digantikanOlehId: null, alasan: "Satu-satunya dokumen sejenis." },
    ];
  }

  // Untuk tiap dokumen: kunci mana yang sudah ditimpa dokumen yang lebih baru,
  // dan dokumen terbaru mana yang menimpanya.
  const ditimpa = new Map<string, Set<number>>();
  const penimpa = new Map<string, DokumenUntukPeran>();

  for (const lama of grup) {
    ditimpa.set(lama.id, new Set());
    lama.pernyataan.forEach((pl, iLama) => {
      for (const baru of grup) {
        if (baru.id === lama.id || bandingkanUrutan(lama, baru) >= 0) continue; // baru harus lebih baru
        const menimpa = baru.pernyataan.some((pb) => pb.jenis === "NILAI_BARU" && samaKunci(pl, pb));
        if (!menimpa) continue;
        ditimpa.get(lama.id)!.add(iLama);
        const sebelumnya = penimpa.get(lama.id);
        if (!sebelumnya || bandingkanUrutan(sebelumnya, baru) < 0) penimpa.set(lama.id, baru);
      }
    });
  }

  const digantikan = (d: DokumenUntukPeran) =>
    d.pernyataan.length > 0 && ditimpa.get(d.id)!.size === d.pernyataan.length;

  const hidup = grup.filter((d) => !digantikan(d));

  return grup.map((d): HasilPeran => {
    if (digantikan(d)) {
      const peng = penimpa.get(d.id)!;
      return {
        dokumenId: d.id,
        label: "DIGANTIKAN",
        digantikanOlehId: peng.id,
        alasan: `Seluruh isinya sudah diganti nilai baru pada ${peng.nama} (${tanggalTeks(peng)}).`,
      };
    }

    if (hidup.length === 1) {
      const yangDiganti = grup.filter((x) => digantikan(x)).map((x) => x.nama);
      return {
        dokumenId: d.id,
        label: "UTAMA",
        digantikanOlehId: null,
        alasan: yangDiganti.length
          ? `Dokumen terbaru yang berlaku. Menggantikan ${yangDiganti.join(", ")}.`
          : "Satu-satunya dokumen sejenis yang berlaku.",
      };
    }

    const lainnya = hidup.filter((x) => x.id !== d.id).map((x) => x.nama);
    const sebagian = ditimpa.get(d.id)!.size;
    const catatan: string[] = [`Saling melengkapi dengan ${lainnya.join(", ")}.`];
    if (sebagian > 0) catatan.push(`${sebagian} butir isinya sudah diganti dokumen yang lebih baru.`);
    if (d.tanggalDiIsi === null) catatan.push("Tanggal di isi dokumen tidak terbaca, urutannya tidak bisa dipastikan.");
    return { dokumenId: d.id, label: "KOMPLEMENTER", digantikanOlehId: null, alasan: catatan.join(" ") };
  });
}

// ------------------------------------------------------------- nilai efektif

/**
 * Nilai akhir tiap butir setelah seluruh dokumen sejenis diterapkan berurutan.
 * Nilai pengganti menimpa, penambahan dan pengurangan dijumlahkan.
 */
export function hitungNilaiEfektif(dokumen: DokumenUntukPeran[]): NilaiEfektif[] {
  const hasil: NilaiEfektif[] = [];

  for (const grup of kelompokkan(dokumen)) {
    // Dokumen tanpa tanggal isi diterapkan lebih dulu sebagai dasar, dan
    // hasilnya ditandai tidak pasti. Sisanya menurut tanggal isi lalu tanggal berkas.
    const urut = [...grup].sort((a, b) => {
      const pa = peringkat(a);
      const pb = peringkat(b);
      if (pa.tanggal === null && pb.tanggal !== null) return -1;
      if (pa.tanggal !== null && pb.tanggal === null) return 1;
      if (pa.tanggal !== null && pb.tanggal !== null && pa.tanggal !== pb.tanggal) return pa.tanggal - pb.tanggal;
      return (pa.edit ?? 0) - (pb.edit ?? 0);
    });

    const dalamKelompok: NilaiEfektif[] = [];
    const terakhirPeringkat = new Map<NilaiEfektif, Peringkat>();

    for (const d of urut) {
      const tanpaTanggal = d.tanggalDiIsi === null;
      for (const p of d.pernyataan) {
        let ada = dalamKelompok.find((e) => e.atribut === p.atribut && samaButir(e.butir, p.butir));
        if (!ada) {
          ada = {
            butir: p.butir,
            atribut: p.atribut,
            satuan: p.satuan,
            nilai: 0,
            dokumenId: [],
            tanpaDasar: false,
            konflik: false,
            tanggalTakPasti: false,
          };
          dalamKelompok.push(ada);
          if (p.jenis !== "NILAI_BARU") ada.tanpaDasar = true;
        }

        const ini = peringkat(d);
        if (p.jenis === "NILAI_BARU") {
          const sebelumnya = terakhirPeringkat.get(ada);
          const sebangun =
            sebelumnya !== undefined &&
            sebelumnya.tanggal !== null &&
            sebelumnya.tanggal === ini.tanggal &&
            (sebelumnya.edit ?? 0) === (ini.edit ?? 0);
          if (sebangun && ada.nilai !== p.nilai) ada.konflik = true;
          ada.nilai = p.nilai;
          ada.tanpaDasar = false;
          terakhirPeringkat.set(ada, ini);
        } else if (p.jenis === "TAMBAH") {
          ada.nilai += p.nilai;
        } else {
          ada.nilai -= p.nilai;
        }

        if (p.satuan) ada.satuan = p.satuan;
        if (tanpaTanggal) ada.tanggalTakPasti = true;
        if (!ada.dokumenId.includes(d.id)) ada.dokumenId.push(d.id);
      }
    }

    hasil.push(...dalamKelompok);
  }

  return hasil;
}

/** Menentukan peran semua dokumen pendukung dan nilai efektif tiap butir. */
export function tentukanPeran(dokumen: DokumenUntukPeran[]): { peran: HasilPeran[]; efektif: NilaiEfektif[] } {
  const peran = kelompokkan(dokumen).flatMap(peranKelompok);
  // Urutan hasil mengikuti urutan masukan.
  const urutan = new Map(dokumen.map((d, i) => [d.id, i]));
  peran.sort((a, b) => (urutan.get(a.dokumenId) ?? 0) - (urutan.get(b.dokumenId) ?? 0));
  return { peran, efektif: hitungNilaiEfektif(dokumen) };
}
