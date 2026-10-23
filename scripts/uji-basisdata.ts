// Menguji basis data dan seluruh alur dokumen sampai validasi dan amendemen,
// di skema PostgreSQL sementara, dengan AI TIRUAN (tanpa jaringan).
//
// Dua bagian:
//   A. Aturan di basis data: CHECK, pemicu append-only pada riwayat aktivitas,
//      kunci unik, dan cascade. Setiap aturan diuji dengan data yang
//      melanggarnya dan harus ditolak oleh BASIS DATA, bukan oleh aplikasi.
//   B. Alur penuh pada kontrak sintetis KTR/2026/0142: ekstraksi, simpan,
//      unggah dokumen pendukung, baca, peran dokumen, validasi, keputusan
//      pengguna, validasi ulang, dua amendemen, dan catatan biaya AI.
//
// Seluruh data berasal dari dokumen sintetis di public/contoh. Skema
// sementara dibuang di akhir, sehingga data di skema public tidak tersentuh.
//
// Jalankan: npx tsx --env-file=.env.local scripts/uji-basisdata.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buatKlienTiruan } from "../src/lib/ai/klien-tiruan";
import { catatAktivitas } from "../src/lib/aktivitas";
import { unggahAmendemen } from "../src/lib/amendemen/unggah";
import { bacaDokumenPendukung, DokumenTidakTerbaca } from "../src/lib/dokumen/baca-pendukung";
import { unggahDokumen } from "../src/lib/dokumen/unggah";
import { jalankanEkstraksi } from "../src/lib/ekstraksi/alur";
import { MEDAN } from "../src/lib/ekstraksi/medan";
import { buatPenyediaDariKlien } from "../src/lib/ekstraksi/penyedia/dari-klien";
import { simpanKontrak, type MedanMasuk, type TerminMasuk } from "../src/lib/ekstraksi/simpan";
import { prisma } from "../src/lib/prisma";
import { jalankanValidasi } from "../src/lib/validasi/jalankan";
import { putuskanTemuan } from "../src/lib/validasi/keputusan";
import { penangan } from "./lib/ai-tiruan";
import { buangSkema, buatSkema, namaSkemaBaru, terapkanMigrasi } from "./lib/skema-uji";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}
/** JSON dengan kunci objek terurut, supaya urutan kunci tidak memengaruhi perbandingan. */
function kanonik(nilai: unknown): string {
  return JSON.stringify(nilai, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}
function sama(nama: string, nyata: unknown, harap: unknown) {
  const a = kanonik(nyata);
  const b = kanonik(harap);
  cek(nama, a === b, a === b ? "" : `dapat ${a}, seharusnya ${b}`);
}

/** Menjalankan sesuatu yang HARUS ditolak. Lulus bila ditolak dan pesannya memuat pola. */
async function tolak(nama: string, fn: () => Promise<unknown>, pola: RegExp) {
  try {
    await fn();
    cek(nama, false, "tidak ditolak");
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    cek(nama, pola.test(pesan), pola.test(pesan) ? "" : `ditolak, tetapi pesannya lain: ${pesan.slice(-220)}`);
  }
}

const T = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DIR_CONTOH = path.resolve("public", "contoh");
const muat = (...b: string[]) => new Uint8Array(readFileSync(path.join(DIR_CONTOH, ...b)));
// Kueri mentah tidak memakai opsi skema milik adapter, jadi nama skema ditulis
// langsung. Nama tabel dan skema berasal dari kode ini, bukan dari masukan luar.
const hitung = async (n: string): Promise<number> => {
  const skema = process.env.DATABASE_SKEMA;
  const nama = skema ? `"${skema}"."${n}"` : `"${n}"`;
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${nama}`);
  return r[0].n;
};

// ===================================================================== AI tiruan
// Jawaban tiruan ada di scripts/lib/ai-tiruan.ts, dipakai juga oleh server-ai-palsu.ts.

const klienTiruan = () => buatKlienTiruan(penangan);

/** Ekstraksi kontrak tiruan: kunci jawaban ditambah lima frasa baru. */
const penyediaTiruan = () => buatPenyediaDariKlien(buatKlienTiruan(penangan));

// =============================================================== bagian A

async function aturanBasisData() {
  console.log("\nA. Aturan di basis data");

  const dre = await prisma.fungsi.create({ data: { kode: "DRE", namaLengkap: "Distribution Reliability & Engineering" } });
  await prisma.fungsi.createMany({ data: [{ kode: "SnD", namaLengkap: "Supply & Distribution" }, { kode: "Asset", namaLengkap: "Asset Operation" }] });
  sama("tiga fungsi FPP tersimpan", await hitung("fungsi"), 3);
  await tolak("kode fungsi harus unik", () => prisma.fungsi.create({ data: { kode: "DRE", namaLengkap: "x" } }), /Unique|unique|fungsi_kode_key/);

  const admin = await prisma.pengguna.create({ data: { nama: "Admin", email: "admin@uji.id", hashKataSandi: "x", peran: "ADMIN" } });
  await prisma.pengguna.create({ data: { nama: "Proc", email: "proc@uji.id", hashKataSandi: "x", peran: "PROCUREMENT" } });
  const fpp = await prisma.pengguna.create({ data: { nama: "FPP DRE", email: "dre@uji.id", hashKataSandi: "x", peran: "FPP", fungsiId: dre.id } });
  cek("akun ADMIN, PROCUREMENT, dan FPP berfungsi tersimpan", (await hitung("pengguna")) === 3);
  await tolak("FPP tanpa fungsi ditolak", () => prisma.pengguna.create({ data: { nama: "x", email: "x1@uji.id", hashKataSandi: "x", peran: "FPP" } }), /pengguna_fungsi_sesuai_peran/);
  await tolak("PROCUREMENT dengan fungsi ditolak", () => prisma.pengguna.create({ data: { nama: "x", email: "x2@uji.id", hashKataSandi: "x", peran: "PROCUREMENT", fungsiId: dre.id } }), /pengguna_fungsi_sesuai_peran/);
  await tolak("email harus unik", () => prisma.pengguna.create({ data: { nama: "x", email: "admin@uji.id", hashKataSandi: "x", peran: "ADMIN" } }), /Unique|unique|pengguna_email_key/);
  await tolak("fungsi yang masih dipakai akun FPP tidak bisa dihapus", () => prisma.fungsi.delete({ where: { id: dre.id } }), /foreign key|fkey|restrict/i);
  sama("fungsi itu tetap ada setelah percobaan hapus", await hitung("fungsi"), 3);

  // Riwayat aktivitas hanya bisa ditambah.
  await prisma.$transaction((tx) => catatAktivitas(tx, { penggunaId: admin.id, aksi: "MASUK", rincian: { ip: "uji" } }));
  const baris = await prisma.riwayatAktivitas.findFirstOrThrow();
  await tolak("riwayat aktivitas tidak bisa diubah", () => prisma.riwayatAktivitas.update({ where: { id: baris.id }, data: { aksi: "KELUAR" } }), /hanya bisa ditambah/);
  await tolak("riwayat aktivitas tidak bisa dihapus", () => prisma.riwayatAktivitas.delete({ where: { id: baris.id } }), /hanya bisa ditambah/);
  await tolak("akun yang punya riwayat tidak bisa dihapus, hanya dinonaktifkan", () => prisma.pengguna.delete({ where: { id: admin.id } }), /hanya bisa ditambah/);
  await prisma.pengguna.update({ where: { id: admin.id }, data: { aktif: false } });
  cek("akun bisa dinonaktifkan", (await prisma.pengguna.findUniqueOrThrow({ where: { id: admin.id } })).aktif === false);
  cek("riwayat tetap utuh setelah semua percobaan", (await hitung("riwayat_aktivitas")) === 1);

  // Kontrak.
  const dasar = { judul: "Kontrak uji" };
  const k = await prisma.kontrak.create({ data: { nomor: "UJI/1", ...dasar, nilaiKontrak: 1000, tanggalMulai: T("2026-01-01"), tanggalBerakhir: T("2026-02-01") } });
  await tolak("nomor kontrak harus unik", () => prisma.kontrak.create({ data: { nomor: "UJI/1", ...dasar } }), /Unique|unique|kontrak_nomor_key/);
  await tolak("nilai kontrak negatif ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/2", ...dasar, nilaiKontrak: -1 } }), /kontrak_nilai_tak_negatif/);
  await tolak("batas denda di atas 100% ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/3", ...dasar, batasDendaPersen: 150 } }), /kontrak_batas_denda_persen/);
  await tolak("model OCLC 12 ditolak (hanya 1 sampai 11)", () => prisma.kontrak.create({ data: { nomor: "UJI/4", ...dasar, modelOclc: 12 } }), /kontrak_model_oclc/);
  await tolak("TKDN di atas 100% ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/5", ...dasar, komitmenTkdnPersen: 120 } }), /kontrak_tkdn_persen|numeric field overflow|out of range/i);
  await tolak("tanggal berakhir sebelum tanggal mulai ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/6", ...dasar, tanggalMulai: T("2026-05-01"), tanggalBerakhir: T("2026-04-01") } }), /kontrak_urutan_tanggal/);
  await tolak("tarif denda negatif ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/7", ...dasar, tarifDendaPermil: -1 } }), /kontrak_tarif_tak_negatif/);
  await tolak("masa pemeliharaan negatif ditolak", () => prisma.kontrak.create({ data: { nomor: "UJI/8", ...dasar, masaPemeliharaanHari: -5 } }), /kontrak_pemeliharaan_tak_negatif/);

  // Dokumen dan turunannya.
  const dok = await prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "KONTRAK", namaBerkas: "a.pdf", lokasiSimpan: "data/dokumen/a.pdf", hashSha256: "h1", ukuranByte: 10 } });
  await tolak("berkas yang sama persis pada kontrak yang sama ditolak", () => prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "PENDUKUNG", namaBerkas: "b.pdf", lokasiSimpan: "data/dokumen/b.pdf", hashSha256: "h1", ukuranByte: 10 } }), /Unique|unique|dokumen_kontrakId_hashSha256_key/);
  await tolak("ukuran berkas negatif ditolak", () => prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "PENDUKUNG", namaBerkas: "c.pdf", lokasiSimpan: "x", hashSha256: "h2", ukuranByte: -1 } }), /dokumen_ukuran_tak_negatif/);
  const dok2 = await prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "PENDUKUNG", namaBerkas: "d.pdf", lokasiSimpan: "data/dokumen/d.pdf", hashSha256: "h3", ukuranByte: 10 } });

  const eks = await prisma.ekstraksi.create({ data: { dokumenId: dok.id, model: "uji" } });
  const medan = await prisma.medanEkstraksi.create({ data: { ekstraksiId: eks.id, urutan: 1, kunci: "x", label: "X", kelompok: "PENDUKUNG", keyakinan: 0.5 } });
  await tolak("keyakinan di atas 1 ditolak", () => prisma.medanEkstraksi.create({ data: { ekstraksiId: eks.id, urutan: 2, kunci: "y", label: "Y", kelompok: "POKOK_PERJANJIAN", keyakinan: 1.5 } }), /medan_keyakinan_0_sampai_1/);
  await tolak("kunci medan harus unik per ekstraksi", () => prisma.medanEkstraksi.create({ data: { ekstraksiId: eks.id, urutan: 3, kunci: "x", label: "X", kelompok: "PENDUKUNG" } }), /Unique|unique|medan_ekstraksi_ekstraksiId_kunci_key/);

  const val = await prisma.validasi.create({ data: { kontrakId: k.id, urutan: 1 } });
  await tolak("urutan validasi harus unik per kontrak", () => prisma.validasi.create({ data: { kontrakId: k.id, urutan: 1 } }), /Unique|unique|validasi_kontrakId_urutan_key/);
  const tem = await prisma.temuan.create({ data: { validasiId: val.id, nomor: 1, tingkat: "MERAH", uraian: "u" } });
  await tolak("nomor temuan harus unik per validasi", () => prisma.temuan.create({ data: { validasiId: val.id, nomor: 1, tingkat: "KUNING", uraian: "u" } }), /Unique|unique|temuan_validasiId_nomor_key/);

  // Sorotan: tepat satu sasaran.
  const kotak = { dokumenId: dok.id, halaman: 1, x: 1, y: 1, lebar: 1, tinggi: 1 };
  await prisma.sorotan.create({ data: { ...kotak, medanId: medan.id } });
  await prisma.sorotan.create({ data: { ...kotak, temuanId: tem.id } });
  await tolak("sorotan tanpa sasaran ditolak", () => prisma.sorotan.create({ data: { ...kotak } }), /sorotan_satu_sasaran/);
  await tolak("sorotan dengan dua sasaran ditolak", () => prisma.sorotan.create({ data: { ...kotak, medanId: medan.id, temuanId: tem.id } }), /sorotan_satu_sasaran/);

  // Peran dokumen.
  await tolak("dokumen DIGANTIKAN tanpa penggantinya ditolak", () => prisma.penggunaanDokumen.create({ data: { validasiId: val.id, dokumenId: dok2.id, label: "DIGANTIKAN" } }), /penggunaan_pengganti_sesuai_label/);
  await tolak("dokumen UTAMA yang menyebut pengganti ditolak", () => prisma.penggunaanDokumen.create({ data: { validasiId: val.id, dokumenId: dok2.id, label: "UTAMA", digantikanOlehId: dok.id } }), /penggunaan_pengganti_sesuai_label/);
  await prisma.penggunaanDokumen.create({ data: { validasiId: val.id, dokumenId: dok2.id, label: "DIGANTIKAN", digantikanOlehId: dok.id } });
  cek("dokumen DIGANTIKAN dengan penggantinya tersimpan", (await hitung("penggunaan_dokumen")) === 1);
  await tolak("peran satu dokumen hanya sekali per validasi", () => prisma.penggunaanDokumen.create({ data: { validasiId: val.id, dokumenId: dok2.id, label: "UTAMA" } }), /Unique|unique|penggunaan_dokumen_validasiId_dokumenId_key/);

  // Menghapus dokumen pengganti ikut menghapus baris "diganti oleh"-nya, bukan melanggar aturan di atas.
  const lama = await prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "PENDUKUNG", namaBerkas: "lama.pdf", lokasiSimpan: "data/dokumen/lama.pdf", hashSha256: "h-lama", ukuranByte: 1 } });
  const baru = await prisma.dokumen.create({ data: { kontrakId: k.id, jenis: "PENDUKUNG", namaBerkas: "baru.pdf", lokasiSimpan: "data/dokumen/baru.pdf", hashSha256: "h-baru", ukuranByte: 1 } });
  await prisma.penggunaanDokumen.create({ data: { validasiId: val.id, dokumenId: lama.id, label: "DIGANTIKAN", digantikanOlehId: baru.id } });
  const sebelumHapus = await hitung("penggunaan_dokumen");
  await prisma.dokumen.delete({ where: { id: baru.id } });
  sama("menghapus dokumen pengganti ikut menghapus baris yang menyebutnya", [await hitung("penggunaan_dokumen"), await prisma.dokumen.count({ where: { id: lama.id } })], [sebelumHapus - 1, 1]);
  await prisma.dokumen.delete({ where: { id: lama.id } });

  // Keputusan temuan.
  await tolak("temuan diabaikan tanpa alasan ditolak", () => prisma.temuan.update({ where: { id: tem.id }, data: { keputusan: "DIABAIKAN", diputuskanPada: new Date() } }), /temuan_abaikan_wajib_alasan/);
  await tolak("temuan diabaikan dengan alasan kosong spasi ditolak", () => prisma.temuan.update({ where: { id: tem.id }, data: { keputusan: "DIABAIKAN", alasanKeputusan: "   ", diputuskanPada: new Date() } }), /temuan_abaikan_wajib_alasan/);
  await tolak("keputusan tanpa waktu ditolak", () => prisma.temuan.update({ where: { id: tem.id }, data: { keputusan: "DITERIMA" } }), /temuan_keputusan_wajib_waktu/);
  await prisma.temuan.update({ where: { id: tem.id }, data: { keputusan: "DIABAIKAN", alasanKeputusan: "sudah disetujui lisan", diputuskanPada: new Date(), diputuskanOlehId: fpp.id } });
  cek("temuan diabaikan dengan alasan diterima", true);

  // Catatan biaya AI.
  await tolak("pemakaian AI dengan dua rujukan ditolak", () => prisma.pemakaianAI.create({ data: { proses: "VALIDASI", model: "m", tokenMasuk: 1, tokenKeluar: 1, validasiId: val.id, ekstraksiId: eks.id } }), /pemakaian_satu_rujukan/);
  await tolak("token negatif ditolak", () => prisma.pemakaianAI.create({ data: { proses: "VALIDASI", model: "m", tokenMasuk: -1, tokenKeluar: 1 } }), /pemakaian_token_tak_negatif/);
  const tanpaHarga = await prisma.pemakaianAI.create({ data: { proses: "VALIDASI", model: "model-misterius", tokenMasuk: 1, tokenKeluar: 1, biayaUsd: null } });
  sama("biaya tidak diketahui tersimpan sebagai null, bukan nol", tanpaHarga.biayaUsd, null);

  // Termin dan amendemen.
  await prisma.termin.create({ data: { kontrakId: k.id, urutan: 1, nilai: 100, syarat: "a", jatuhTempo: T("2026-01-10") } });
  await tolak("urutan termin harus unik per kontrak", () => prisma.termin.create({ data: { kontrakId: k.id, urutan: 1, nilai: 1, syarat: "b", jatuhTempo: T("2026-01-10") } }), /Unique|unique|termin_kontrakId_urutan_key/);
  const am = await prisma.amendemen.create({ data: { kontrakId: k.id, versi: 1, tanggal: T("2026-01-15"), ringkasan: "r", jenisPerubahan: ["LINGKUP", "HARGA"], nilaiAmandemen: -50 } });
  sama("amendemen menyimpan banyak jenis perubahan dan nilai negatif", [am.jenisPerubahan, Number(am.nilaiAmandemen)], [["LINGKUP", "HARGA"], -50]);
  await tolak("versi amendemen harus unik per kontrak", () => prisma.amendemen.create({ data: { kontrakId: k.id, versi: 1, tanggal: T("2026-01-16"), ringkasan: "r2" } }), /Unique|unique|amendemen_kontrakId_versi_key/);

  // Cascade: menghapus kontrak menghapus seluruh turunannya, tetapi tidak riwayat.
  await prisma.kontrak.delete({ where: { id: k.id } });
  const sisa = await Promise.all(["dokumen", "ekstraksi", "medan_ekstraksi", "sorotan", "validasi", "temuan", "penggunaan_dokumen", "termin", "amendemen"].map(hitung));
  sama("menghapus kontrak ikut menghapus seluruh turunannya", sisa, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  cek("catatan biaya AI tetap ada walau rujukannya terhapus", (await hitung("pemakaian_ai")) === 1);
  cek("riwayat aktivitas tidak ikut terhapus", (await hitung("riwayat_aktivitas")) === 1);
}

// =============================================================== bagian B

async function alurPenuh() {
  console.log("\nB. Alur penuh pada kontrak sintetis KTR/2026/0142");

  const proc = await prisma.pengguna.findUniqueOrThrow({ where: { email: "proc@uji.id" } });

  // ---- 1. ekstraksi dan simpan kontrak
  const pdfKontrak = muat("KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
  const hasil = await jalankanEkstraksi(Uint8Array.from(pdfKontrak), { penyedia: penyediaTiruan() });
  cek("ekstraksi memakai penyedia yang diberikan", hasil.model === "tiruan" && !hasil.tiruan);
  sama("seluruh medan katalog terbaca", hasil.medan.length, MEDAN.length);
  const tanpaKeyakinan = hasil.medan.filter((m) => m.nilai && m.keyakinan === 0).map((m) => m.kunci);
  sama("setiap nilai yang diberikan model ditemukan di PDF (keyakinan di atas nol)", tanpaKeyakinan, []);
  const jaminan = hasil.medan.find((m) => m.kunci === "masa_berlaku_jaminan")!;
  cek("frasa masa berlaku jaminan punya sorotan", jaminan.kotak.length > 0 && jaminan.halaman === 4, `halaman ${jaminan.halaman}`);

  const medan: MedanMasuk[] = hasil.medan.map((m) => ({ kunci: m.kunci, nilai: m.nilai, keyakinan: m.keyakinan, halaman: m.halaman, kotak: m.kotak, dikonfirmasi: m.wajibKonfirmasi }));
  const termin: TerminMasuk[] = hasil.termin.map((t) => ({ urutan: t.urutan, nilai: t.nilai, syarat: t.syarat, jatuhTempo: t.jatuhTempo?.toISOString() ?? null }));

  await tolak("kontrak tanpa berkas bukan PDF ditolak", () => simpanKontrak({ namaBerkas: "x.docx", jumlahHalaman: 1, model: "uji", medan, status: "DRAF", berkas: { data: new TextEncoder().encode("bukan pdf") } }), /bukan PDF/);
  await tolak("kontrak tanpa nomor ditolak", () => simpanKontrak({ namaBerkas: "x.pdf", jumlahHalaman: 1, model: "uji", medan: medan.filter((m) => m.kunci !== "nomor_kontrak"), status: "DRAF", berkas: { data: pdfKontrak } }), /Nomor kontrak tidak ditemukan/);
  sama("penolakan di atas tidak meninggalkan kontrak setengah jadi", await hitung("kontrak"), 0);

  const simpan = await simpanKontrak({ namaBerkas: "KTR-2026-0142.pdf", jumlahHalaman: hasil.halaman.length, model: hasil.model, medan, termin, status: "BERJALAN", berkas: { data: pdfKontrak }, penggunaId: proc.id });
  sama("kontrak baru tersimpan", [simpan.nomor, simpan.baru], ["KTR/2026/0142", true]);

  const k = await prisma.kontrak.findUniqueOrThrow({ where: { id: simpan.kontrakId }, include: { vendor: true, termin: true } });
  sama("nilai, vendor, dan TKDN", [Number(k.nilaiKontrak), k.vendor?.nama, Number(k.komitmenTkdnPersen)], [4_850_000_000, "PT Sumber Jaya Abadi", 42]);
  sama("tarif denda 1/1000 menjadi 1 permil dan batas 5%", [Number(k.tarifDendaPermil), Number(k.batasDendaPersen)], [1, 5]);
  sama("nilai sudah termasuk PPN terbaca dari frasa", k.termasukPpn, true);
  sama("nilai jaminan 5% dari nilai kontrak", Number(k.nilaiJaminan), 242_500_000);
  sama("jaminan berlaku sampai tanggal berakhir ditambah 14 hari", k.jaminanBerlakuSampai?.toISOString().slice(0, 10), "2026-09-26");
  sama("masa pemeliharaan kosong karena tidak tertulis", k.masaPemeliharaanHari, null);
  sama("tanggal mulai dan berakhir", [k.tanggalMulai?.toISOString().slice(0, 10), k.tanggalBerakhir?.toISOString().slice(0, 10)], ["2026-03-15", "2026-09-12"]);
  sama("tiga termin berjumlah sama dengan nilai kontrak", [k.termin.length, k.termin.reduce((a, t) => a + Number(t.nilai), 0)], [3, 4_850_000_000]);
  sama("kontrak baru belum divalidasi", [k.statusValidasi, k.dibuatOlehId], ["BELUM", proc.id]);

  const dokKontrak = await prisma.dokumen.findUniqueOrThrow({ where: { id: simpan.dokumenId } });
  cek("berkas kontrak tersimpan di folder data berbasis sidik", dokKontrak.lokasiSimpan === `data/dokumen/${dokKontrak.hashSha256}.pdf` && existsSync(path.join(process.env.VASKO_DIR_DATA!, "dokumen", `${dokKontrak.hashSha256}.pdf`)));
  sama("dokumen kontrak mencatat siapa yang mengunggah, halaman, dan lapisan teks", [dokKontrak.diunggahOlehId, dokKontrak.jumlahHalaman, dokKontrak.adaLapisanTeks, dokKontrak.jenis], [proc.id, 24, true, "KONTRAK"]);
  const medanTersimpan = await prisma.medanEkstraksi.findMany({ where: { ekstraksi: { dokumenId: dokKontrak.id } }, include: { sorotan: true } });
  sama("seluruh medan tersimpan", medanTersimpan.length, MEDAN.length);
  cek("sorotan tersimpan dengan dokumen asalnya", medanTersimpan.flatMap((m) => m.sorotan).length > 10 && medanTersimpan.flatMap((m) => m.sorotan).every((s) => s.dokumenId === dokKontrak.id));
  sama("medan wajib yang dikonfirmasi mencatat siapa", medanTersimpan.filter((m) => m.wajibKonfirmasi).every((m) => m.dikonfirmasi && m.dikonfirmasiOlehId === proc.id), true);

  const ulang = await simpanKontrak({ namaBerkas: "KTR-2026-0142.pdf", jumlahHalaman: 24, model: hasil.model, medan, termin, status: "BERJALAN", berkas: { data: pdfKontrak }, penggunaId: proc.id });
  sama("unggah ulang berkas yang sama: kontrak dan dokumen dipakai kembali", [ulang.baru, ulang.dokumenId === simpan.dokumenId, await hitung("kontrak"), await hitung("dokumen")], [false, true, 1, 1]);
  sama("unggah ulang meninggalkan jejak ekstraksi kedua", await hitung("ekstraksi"), 2);
  sama("termin tidak berlipat setelah unggah ulang", await hitung("termin"), 3);

  // ---- 2. dokumen pendukung
  const pend = ["0142-TOR-1.pdf", "0142-TOR-2.pdf", "0142-BA-Prebid-1.pdf", "0142-BA-Prebid-2.pdf", "0142-BA-Negosiasi.pdf", "0142-Form-TKDN-A1.pdf", "0142-Akta-Perusahaan.pdf", "0142-Scan-Tanpa-Teks.pdf"];
  const idPend: Record<string, string> = {};
  for (const nama of pend) {
    const u = await unggahDokumen({ kontrakId: simpan.kontrakId, jenis: "PENDUKUNG", data: muat("pendukung", nama), namaBerkas: nama, penggunaId: proc.id, sumber: "ZIP" });
    idPend[nama] = u.dokumen.id;
    if (nama.includes("Scan")) cek("hasil pindai disimpan tetapi diberi peringatan tanpa OCR", !u.dokumen.adaLapisanTeks && u.peringatan.some((p) => p.includes("OCR")), u.peringatan.join(" "));
  }
  sama("delapan dokumen pendukung tersimpan", await prisma.dokumen.count({ where: { jenis: "PENDUKUNG" } }), 8);
  const dup = await unggahDokumen({ kontrakId: simpan.kontrakId, jenis: "PENDUKUNG", data: muat("pendukung", "0142-TOR-1.pdf"), namaBerkas: "salinan.pdf" });
  cek("berkas yang sama persis tidak diunggah dua kali", !dup.baru && dup.dokumen.id === idPend["0142-TOR-1.pdf"] && dup.peringatan.length === 1);
  sama("sumber unggahan dan pengunggah tercatat", (await prisma.dokumen.findUniqueOrThrow({ where: { id: idPend["0142-TOR-1.pdf"] } })).sumber, "ZIP");

  await tolak("membaca dokumen hasil pindai ditolak dengan alasan, bukan gagal diam-diam", () => bacaDokumenPendukung({ dokumenId: idPend["0142-Scan-Tanpa-Teks.pdf"], klien: klienTiruan() }), /hasil pindai/);
  const galatScan = await prisma.ekstraksi.findFirstOrThrow({ where: { dokumenId: idPend["0142-Scan-Tanpa-Teks.pdf"] } });
  cek("percobaan baca dokumen pindai tercatat sebagai ekstraksi bergalat", !!galatScan.galat && galatScan.galat.includes("OCR"));
  await tolak("dokumen kontrak tidak bisa dibaca sebagai dokumen pendukung", () => bacaDokumenPendukung({ dokumenId: simpan.dokumenId, klien: klienTiruan() }), /bukan dokumen pendukung/);

  // Satu dokumen dibaca langsung untuk memeriksa hasil simpannya.
  const bacaTor1 = await bacaDokumenPendukung({ dokumenId: idPend["0142-TOR-1.pdf"], klien: klienTiruan(), penggunaId: proc.id });
  sama("jenis, tanggal isi, dan judul dokumen terisi dari hasil baca", await prisma.dokumen.findUniqueOrThrow({ where: { id: idPend["0142-TOR-1.pdf"] }, select: { jenisPendukung: true, tanggalDiIsi: true } }).then((d) => [d.jenisPendukung, d.tanggalDiIsi?.toISOString().slice(0, 10)]), ["RKS_TOR", "2026-01-05"]);
  sama("pernyataan terverifikasi tersimpan di rincian", bacaTor1.rincian.pernyataan.map((p) => [p.butir, p.nilai, p.terverifikasi]), [["titik pemeriksaan sistem perpipaan", 10, true]]);
  const pemakaianBaca = await prisma.pemakaianAI.findFirstOrThrow({ where: { ekstraksiId: bacaTor1.ekstraksiId } });
  sama("pemakaian AI tercatat dengan model tiruan berbiaya nol", [pemakaianBaca.proses, pemakaianBaca.model, Number(pemakaianBaca.biayaUsd)], ["EKSTRAKSI", "tiruan", 0]);

  // ---- 3. validasi
  console.log("\n  Validasi pertama");
  const klien1 = klienTiruan();
  const v1 = await jalankanValidasi({ kontrakId: simpan.kontrakId, klien: klien1, penggunaId: proc.id });
  sama("tujuh dokumen lain dibaca saat validasi (TOR-1 sudah dibaca, pindai dilewati)", v1.dokumenDibaca, 6);
  sama("hasil BELUM_VALID dengan tiga merah dan tiga kuning", [v1.hasil, v1.jumlahMerah, v1.jumlahKuning], ["BELUM_VALID", 3, 3]);
  sama(
    "temuan: merah lebih dulu, lalu kuning, bernomor berurutan",
    v1.temuan.map((t) => `${t.nomor}:${t.tingkat}:${t.kode}`),
    ["1:MERAH:JAMINAN_MPP30", "2:MERAH:NILAI_NEGOSIASI", "3:MERAH:KLAUSUL_BERTENTANGAN", "4:KUNING:DENDA_DASAR_PPN", "5:KUNING:LAMPIRAN_LENGKAP", "6:KUNING:DOKUMEN_TIDAK_TERBACA"]
  );

  const label = (n: string) => v1.peran.find((p) => p.nama === n);
  sama(
    "peran dokumen: komplementer, digantikan, dan utama",
    pend.map((n) => label(n)?.label),
    ["KOMPLEMENTER", "KOMPLEMENTER", "DIGANTIKAN", "UTAMA", "UTAMA", "UTAMA", "UTAMA", "UTAMA"]
  );
  sama("pre-bid pertama menyebut pre-bid kedua sebagai penggantinya", label("0142-BA-Prebid-1.pdf")?.digantikanOlehId, idPend["0142-BA-Prebid-2.pdf"]);

  const nego = v1.temuan.find((t) => t.kode === "NILAI_NEGOSIASI")!;
  cek("temuan nilai menyebut selisih Rp400.000.000 dan saran Rp5.250.000.000", nego.uraian.includes("Rp400.000.000") && nego.nilaiSaran === "Rp5.250.000.000", nego.uraian);
  const klausul = v1.temuan.find((t) => t.kode === "KLAUSUL_BERTENTANGAN")!;
  cek("temuan klausul: kontrak 3 termin lawan ketetapan 4 termin dari pre-bid kedua", klausul.nilaiDiKontrak === "3 termin" && klausul.nilaiSaran === "4 termin" && klausul.dasar.includes("0142-BA-Prebid-2.pdf"), `${klausul.nilaiDiKontrak} | ${klausul.nilaiSaran} | ${klausul.dasar}`);
  const kts = klien1.permintaan.filter((p) => p.nama === "periksa_klausul")[0];
  cek("AI diberi dua ketetapan, tanpa masa pelaksanaan", !!kts && (kts.pengguna.match(/^E\d+\./gm) ?? []).length === 2 && !kts.pengguna.includes("masa pelaksanaan ="), kts?.pengguna.split("\nTEKS KONTRAK")[0]);

  // Yang tersimpan di basis data.
  const val = await prisma.validasi.findUniqueOrThrow({ where: { id: v1.validasiId } });
  sama("validasi tersimpan SELESAI dengan urutan 1", [val.status, val.hasil, val.urutan, val.model], ["SELESAI", "BELUM_VALID", 1, "tiruan"]);
  const ringkasan = val.ringkasan as { pemeriksaan: { kode: string; status: string }[]; jumlahMerah: number } | null;
  cek("ringkasan menyimpan daftar pemeriksaan beserta statusnya", !!ringkasan && ringkasan.pemeriksaan.length >= 14 && ringkasan.pemeriksaan.some((p) => p.kode === "TKDN_MINIMUM" && p.status === "LULUS"), `${ringkasan?.pemeriksaan.length} pemeriksaan`);
  sama("TKDN 42% terhadap minimum 40%, nama vendor, dan masa pelaksanaan lulus", ["TKDN_MINIMUM", "VENDOR_AKTA", "MASA_PELAKSANAAN"].map((k) => ringkasan?.pemeriksaan.find((p) => p.kode === k)?.status), ["LULUS", "LULUS", "LULUS"]);
  const temuanDb = await prisma.temuan.findMany({ where: { validasiId: v1.validasiId }, include: { sorotan: true }, orderBy: { nomor: "asc" } });
  sama("enam temuan tersimpan, semuanya belum diputuskan", [temuanDb.length, temuanDb.every((t) => t.keputusan === "BELUM")], [6, true]);
  cek("temuan jaminan membawa sorotan dari medan ekstraksi di dokumen kontrak", temuanDb[0].sorotan.length > 0 && temuanDb[0].sorotan.every((s) => s.dokumenId === simpan.dokumenId));
  cek("temuan klausul membawa sorotan dari kutipan terverifikasi", temuanDb[2].sorotan.length > 0);
  sama("temuan tanpa lokasi di teks tidak punya sorotan", temuanDb[4].sorotan.length, 0);
  const pd = await prisma.penggunaanDokumen.findMany({ where: { validasiId: v1.validasiId } });
  sama("delapan baris peran dokumen tersimpan", pd.length, 8);
  const kAkhir = await prisma.kontrak.findUniqueOrThrow({ where: { id: simpan.kontrakId } });
  sama("status validasi kontrak mengikuti hasil", kAkhir.statusValidasi, "BELUM_VALID");
  // Hanya baris dari klien tiruan: bagian A meninggalkan satu catatan model lain.
  const pem = await prisma.pemakaianAI.groupBy({ by: ["proses"], _count: true, where: { model: "tiruan" } });
  sama("biaya AI tercatat per proses: tujuh baca dokumen dan satu validasi", Object.fromEntries(pem.map((p) => [p.proses, p._count])), { EKSTRAKSI: 7, VALIDASI: 1 });
  const aktivitas = await prisma.riwayatAktivitas.groupBy({ by: ["aksi"], _count: true });
  const peta = Object.fromEntries(aktivitas.map((a) => [a.aksi, a._count]));
  sama("riwayat aktivitas: simpan kontrak, unggah dokumen, baca dokumen, validasi", [peta.SIMPAN_KONTRAK, peta.UNGGAH_DOKUMEN, peta.BACA_DOKUMEN, peta.JALANKAN_VALIDASI], [2, 8, 7, 1]);

  // ---- 4. keputusan
  console.log("\n  Keputusan pengguna");
  const [t1, t2, t3, t4] = temuanDb;
  await tolak("mengabaikan temuan tanpa alasan ditolak aplikasi", () => putuskanTemuan({ temuanId: t1.id, keputusan: "DIABAIKAN" }), /wajib disertai alasan/);
  await tolak("mengubah temuan tanpa nilai ditolak aplikasi", () => putuskanTemuan({ temuanId: t1.id, keputusan: "DIUBAH", nilai: "  " }), /wajib disertai nilai/);
  const diterima = await putuskanTemuan({ temuanId: t1.id, keputusan: "DITERIMA", penggunaId: proc.id });
  sama("diterima: nilai yang berlaku adalah saran sistem", [diterima.keputusan, diterima.nilaiKeputusan, diterima.diputuskanOlehId], ["DITERIMA", t1.nilaiSaran, proc.id]);
  const diubah = await putuskanTemuan({ temuanId: t2.id, keputusan: "DIUBAH", nilai: "Rp4.900.000.000", alasan: "disepakati ulang", penggunaId: proc.id });
  sama("diubah: nilai ketikan pengguna dipakai", [diubah.keputusan, diubah.nilaiKeputusan], ["DIUBAH", "Rp4.900.000.000"]);
  const diabaikan = await putuskanTemuan({ temuanId: t4.id, keputusan: "DIABAIKAN", alasan: "dasar denda memang disepakati begitu", penggunaId: proc.id });
  sama("diabaikan: alasan dan waktu tercatat", [diabaikan.keputusan, diabaikan.alasanKeputusan, diabaikan.diputuskanPada !== null], ["DIABAIKAN", "dasar denda memang disepakati begitu", true]);
  const ubahLagi = await putuskanTemuan({ temuanId: t2.id, keputusan: "DIABAIKAN", alasan: "tidak jadi diubah", penggunaId: proc.id });
  sama("keputusan bisa diganti", ubahLagi.keputusan, "DIABAIKAN");
  const jejak = await prisma.riwayatAktivitas.findMany({ where: { aksi: "PUTUSKAN_TEMUAN", entitasId: t2.id }, orderBy: { waktu: "asc" } });
  const r2 = jejak[1]?.rincian as { lama: { keputusan: string; nilai: string }; baru: { keputusan: string } } | null;
  cek("setiap keputusan tercatat lengkap dengan nilai lama dan baru", jejak.length === 2 && r2?.lama.keputusan === "DIUBAH" && r2?.lama.nilai === "Rp4.900.000.000" && r2?.baru.keputusan === "DIABAIKAN");
  void t3;

  // ---- 5. validasi ulang
  console.log("\n  Validasi ulang");
  const klien2 = klienTiruan();
  const v2 = await jalankanValidasi({ kontrakId: simpan.kontrakId, klien: klien2, penggunaId: proc.id });
  sama("validasi kedua berurutan 2, tidak membaca ulang dokumen, hasil sama", [v2.urutan, v2.dokumenDibaca, v2.hasil, v2.jumlahMerah, v2.jumlahKuning], [2, 0, "BELUM_VALID", 3, 3]);
  sama("validasi ulang tidak memanggil AI untuk membaca dokumen lagi, hanya pemeriksaan klausul", klien2.permintaan.map((p) => p.nama), ["periksa_klausul"]);
  sama("hasil validasi pertama tetap utuh", await prisma.temuan.count({ where: { validasiId: v1.validasiId } }), 6);
  sama("keputusan pada validasi pertama tidak terbawa ke validasi kedua", (await prisma.temuan.findMany({ where: { validasiId: v2.validasiId } })).every((t) => t.keputusan === "BELUM"), true);
  sama("dua baris validasi untuk satu kontrak", await prisma.validasi.count({ where: { kontrakId: simpan.kontrakId } }), 2);

  // Tanpa AI: pemeriksaan klausul dimatikan, aturan tetap jalan.
  const v3 = await jalankanValidasi({ kontrakId: simpan.kontrakId, penggunaId: proc.id, periksaKlausulAI: false, bacaPendukungBelumTerbaca: false });
  sama("tanpa AI: aturan tetap jalan, klausul dilewati dan terlihat dilewati", [v3.urutan, v3.jumlahMerah, v3.pemeriksaan.find((p) => p.kode === "KLAUSUL_BERTENTANGAN")?.status], [3, 2, "DILEWATI"]);

  // ---- 6. kegagalan validasi tercatat
  const kosong = await prisma.kontrak.create({ data: { nomor: "UJI/TANPA-BERKAS", judul: "x" } });
  await tolak("kontrak tanpa berkas tidak bisa divalidasi", () => jalankanValidasi({ kontrakId: kosong.id, klien: klienTiruan() }), /belum punya berkas kontrak/);

  // ---- 7. amendemen
  console.log("\n  Amendemen");
  const am1 = await unggahAmendemen({
    kontrakId: simpan.kontrakId,
    dokumen: { data: muat("pendukung", "0142-Amendemen-1.pdf"), namaBerkas: "0142-Amendemen-1.pdf" },
    pendukung: [{ data: muat("pendukung", "0142-Amendemen-1-Pendukung.pdf"), namaBerkas: "0142-Amendemen-1-Pendukung.pdf" }],
    klien: klienTiruan(),
    penggunaId: proc.id,
  });
  sama("amendemen pertama: versi 1, nilai +Rp242,5 juta, KT Rp5.092.500.000", [am1.versi, am1.baca.nilaiAmandemen, am1.hitung.nilaiSetelah], [1, 242_500_000, 5_092_500_000]);
  sama("amendemen pertama: 5%, cukup justifikasi pejabat, belum mendekati batas", [am1.hitung.persenAmandemen, am1.hitung.tingkat, am1.hitung.mendekatiBatas], [5, "JUSTIFIKASI_PEJABAT", false]);
  sama("nilai kontrak baru yang tertulis cocok dengan hitungan", am1.perbandingan.nilaiTertulisCocok, true);
  sama("klausul karangan dari AI dibuang dari perbandingan", am1.perbandingan.aspek.map((a) => a.nama), ["Nilai kontrak"]);
  cek("perbandingan memuat ringkasan dan alasan dari dokumen", am1.perbandingan.ringkasan.includes("naik") && !!am1.perbandingan.alasan);

  const dbAm1 = await prisma.amendemen.findFirstOrThrow({ where: { kontrakId: simpan.kontrakId, versi: 1 }, include: { dokumen: true } });
  sama("amendemen 1 tersimpan: jenis, nilai, aktif", [dbAm1.jenisPerubahan, Number(dbAm1.nilaiAmandemen), Number(dbAm1.nilaiKontrakSetelah), dbAm1.aktif], [["LINGKUP", "HARGA"], 242_500_000, 5_092_500_000, true]);
  sama("kedua dokumen amendemen tertaut ke amendemen itu", dbAm1.dokumen.map((d) => d.jenis).sort(), ["AMANDEMEN", "PENDUKUNG_AMANDEMEN"]);
  cek("hasil perbandingan tersimpan sekali di basis data", (dbAm1.hasilPerbandingan as { versi: number } | null)?.versi === 1);

  const am2 = await unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: muat("pendukung", "0142-Amendemen-2.pdf"), namaBerkas: "0142-Amendemen-2.pdf" }, klien: klienTiruan(), penggunaId: proc.id });
  sama("amendemen kedua: versi 2, nilai tetap, diperpanjang 14 hari", [am2.versi, am2.baca.nilaiAmandemen, am2.perbandingan.selisihHari, am2.perbandingan.ke.tanggalBerakhir], [2, 0, 14, "2026-09-26"]);
  sama("amendemen kedua: jenis perubahan hanya jangka waktu, tanpa peringatan nilai", [am2.baca.jenisPerubahan, am2.hitung.tingkat], [["JANGKA_WAKTU"], null]);
  sama("tepat satu amendemen aktif, yaitu yang terbaru", (await prisma.amendemen.findMany({ where: { kontrakId: simpan.kontrakId }, orderBy: { versi: "asc" } })).map((a) => a.aktif), [false, true]);
  sama("perbandingan amendemen kedua dimulai dari nilai amendemen pertama", [am2.perbandingan.dari.versi, am2.perbandingan.dari.nilai], [1, 5_092_500_000]);

  // Dokumen berbeda sedikit (isi PDF sama, byte berbeda) agar bukan duplikat.
  const varian = Uint8Array.from([...muat("pendukung", "0142-Amendemen-2.pdf"), ...new TextEncoder().encode("\n%varian uji penurunan nilai\n")]);
  const am3 = await unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: varian, namaBerkas: "0142-Amendemen-3-turun.pdf" }, klien: klienTiruan(), penggunaId: proc.id });
  sama("amendemen ketiga turun: KT berkurang Rp100 juta, diproses tanpa peringatan", [am3.versi, am3.hitung.nilaiSetelah, am3.hitung.nilaiTurun, am3.hitung.tingkat, am3.hitung.peringatan.length], [3, 4_992_500_000, true, null, 0]);
  sama("akumulasi bersih 5% turun menjadi 2,94%", am3.hitung.persenKumulatifBersih, 2.94);

  await tolak("amendemen yang sama persis tidak bisa diunggah dua kali", () => unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: muat("pendukung", "0142-Amendemen-2.pdf"), namaBerkas: "salinan.pdf" }, klien: klienTiruan() }), /sama persis/);
  await tolak("amendemen berupa hasil pindai ditolak sebelum ada yang tersimpan", () => unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: muat("pendukung", "0142-Scan-Tanpa-Teks.pdf"), namaBerkas: "pindai.pdf" }, klien: klienTiruan() }), /hasil pindai/);
  sama("tiga amendemen tersimpan", await prisma.amendemen.count({ where: { kontrakId: simpan.kontrakId } }), 3);
  const pemAm = await prisma.pemakaianAI.groupBy({ by: ["proses"], _count: true, where: { amendemenId: { not: null } } });
  sama("biaya AI amendemen: tiga baca dan tiga perbandingan", Object.fromEntries(pemAm.map((p) => [p.proses, p._count])), { AMANDEMEN: 3, PERBANDINGAN: 3 });

  // Sisa unggahan yang gagal: berkasnya sudah tercatat, tetapi transaksi akhir
  // gagal sehingga belum tertaut ke amendemen mana pun. Unggah ulang harus
  // diterima dan memakai berkas yang sama, bukan ditolak sebagai duplikat.
  const dataSisa = Uint8Array.from([...muat("pendukung", "0142-Amendemen-2.pdf"), ...new TextEncoder().encode("\n%sisa unggahan gagal\n")]);
  const sisa = await unggahDokumen({ kontrakId: simpan.kontrakId, jenis: "AMANDEMEN", data: dataSisa, namaBerkas: "0142-Amendemen-4-ulang.pdf" });
  const am4 = await unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: dataSisa, namaBerkas: "0142-Amendemen-4-ulang.pdf" }, klien: klienTiruan(), penggunaId: proc.id });
  const dokSisa = await prisma.dokumen.findMany({ where: { kontrakId: simpan.kontrakId, hashSha256: sisa.dokumen.hashSha256 } });
  sama("unggah ulang setelah transaksi gagal: berkas sisa dipakai lagi, tanpa baris ganda", [am4.versi, dokSisa.length, dokSisa[0]?.amendemenId === am4.amendemenId], [4, 1, true]);
  const dataPendukung = Uint8Array.from([...muat("pendukung", "0142-Amendemen-2.pdf"), ...new TextEncoder().encode("\n%pendukung validasi\n")]);
  await unggahDokumen({ kontrakId: simpan.kontrakId, jenis: "PENDUKUNG", data: dataPendukung, namaBerkas: "pendukung.pdf" });
  await tolak("berkas sama yang tercatat sebagai jenis lain tetap ditolak", () => unggahAmendemen({ kontrakId: simpan.kontrakId, dokumen: { data: dataPendukung, namaBerkas: "x.pdf" }, klien: klienTiruan() }), /sama persis/);

  const tanpaNilai = await prisma.kontrak.create({ data: { nomor: "UJI/TANPA-NILAI", judul: "x" } });
  await tolak("amendemen pada kontrak tanpa nilai awal ditolak dengan petunjuk", () => unggahAmendemen({ kontrakId: tanpaNilai.id, dokumen: { data: muat("pendukung", "0142-Amendemen-2.pdf"), namaBerkas: "x.pdf" }, klien: klienTiruan() }), /Nilai kontrak awal/);
  void kosong;

  // ---- 8. frasa tanpa bukti di PDF tidak boleh masuk ke kolom turunan
  console.log("\n  Frasa tanpa bukti di PDF");
  // Kontrak lain dengan PDF yang sama, supaya kontrak di atas tidak terganggu.
  // Frasa yang dikarang model (tidak ada di PDF) punya keyakinan 0 dan tanpa sorotan.
  const medanBukti = (ubahan: Partial<MedanMasuk>) =>
    medan.map((m): MedanMasuk => {
      if (m.kunci === "nomor_kontrak") return { ...m, nilai: "KTR/2026/BUKTI" };
      if (m.kunci === "masa_pemeliharaan") return { ...m, nilai: "60 hari kalender", keyakinan: 0, halaman: null, kotak: [], ...ubahan };
      if (m.kunci === "nilai_termasuk_ppn") return { ...m, nilai: "sudah termasuk PPN", keyakinan: 0, halaman: null, kotak: [], ...ubahan };
      return m;
    });
  const baca = async () => {
    const x = await prisma.kontrak.findUniqueOrThrow({ where: { nomor: "KTR/2026/BUKTI" } });
    return [x.masaPemeliharaanHari, x.termasukPpn];
  };
  const simpanVarian = (medanVarian: MedanMasuk[]) =>
    simpanKontrak({ namaBerkas: "bukti.pdf", jumlahHalaman: hasil.halaman.length, model: "uji", medan: medanVarian, termin, status: "BERJALAN", berkas: { data: pdfKontrak }, penggunaId: proc.id });

  await simpanVarian(medanBukti({}));
  sama("frasa karangan model (keyakinan 0) diabaikan, kolom turunan kosong", await baca(), [null, null]);
  await simpanVarian(medanBukti({ keyakinan: 1 }));
  sama("frasa yang terbukti ada di PDF (keyakinan 1) dipakai", await baca(), [60, true]);
  await simpanVarian(medanBukti({ nilaiSuntingan: "90 hari", keyakinan: 0 }));
  sama("suntingan manusia dipakai walau tanpa bukti", (await baca())[0], 90);
  const mentah = await prisma.medanEkstraksi.findFirst({ where: { kunci: "masa_pemeliharaan", ekstraksi: { dokumen: { kontrak: { nomor: "KTR/2026/BUKTI" } } } }, orderBy: { ekstraksi: { createdAt: "asc" } } });
  sama("hasil mentah model tetap tersimpan apa adanya untuk ditinjau", [mentah?.nilai, Number(mentah?.keyakinan)], ["60 hari kalender", 0]);
}

// ======================================================= seed.ts di skema baru

function ujiSeed() {
  console.log("\nC. scripts/seed.ts berjalan di skema baru");
  const r = spawnSync(process.execPath, [path.resolve("node_modules", "tsx", "dist", "cli.mjs"), "scripts/seed.ts"], {
    env: { ...process.env },
    encoding: "utf8",
  });
  cek("seed.ts selesai tanpa galat", r.status === 0, (r.stderr || r.stdout).slice(-300));
  return r.stdout;
}

async function sesudahSeed() {
  const k = await prisma.kontrak.findUnique({ where: { nomor: "KTR/2026/0142" }, include: { dokumen: true, vendor: true, termin: true, amendemen: true } });
  // Pada bagian B nomor yang sama sudah dipakai oleh alur penuh, jadi seed memperbarui, bukan membuat baru.
  cek("kontrak contoh tetap satu dan berdokumen", !!k && k.dokumen.length >= 1);
}

// ================================================================== utama

async function main() {
  const skema = namaSkemaBaru("uji_basisdata");
  const dir = mkdtempSync(path.join(tmpdir(), "vasko-data-"));
  console.log(`Skema sementara: ${skema}`);
  await buatSkema(skema);
  try {
    terapkanMigrasi(skema);
    process.env.DATABASE_SKEMA = skema;
    process.env.VASKO_DIR_DATA = dir;

    await aturanBasisData();
    // Bagian B memakai akun dari bagian A, jadi dibuat ulang bila perlu.
    await prisma.pengguna.upsert({ where: { email: "proc@uji.id" }, update: {}, create: { nama: "Proc", email: "proc@uji.id", hashKataSandi: "x", peran: "PROCUREMENT" } });
    await alurPenuh();
    ujiSeed();
    await sesudahSeed();
  } finally {
    await prisma.$disconnect();
    await buangSkema(skema);
    rmSync(dir, { recursive: true, force: true });
    console.log(`\nSkema sementara ${skema} sudah dibuang.`);
  }

  console.log(gagal === 0 ? "\nSeluruh pemeriksaan basis data dan alur penuh lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
