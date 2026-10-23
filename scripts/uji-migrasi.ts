// Menguji migrasi ke rancangan ERD, di skema sementara.
//
// Dua pemeriksaan:
//   A. Migrasi dari isi LAMA. Skema lama dibuat, diisi data seperti yang ada
//      di basis data sekarang (kontrak dengan berkas, ekstraksi, sorotan),
//      lalu migrasi baru dijalankan. Yang dicek: tidak ada data yang hilang
//      dan semuanya pindah ke tempat yang benar.
//   B. Migrasi dari kosong, memakai "prisma migrate deploy" seperti di
//      produksi. Yang dicek: skema hidup sama persis dengan schema.prisma.
//
// Jalankan: npx tsx --env-file=.env.local scripts/uji-migrasi.ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  bacaMigrasi,
  buangSkema,
  buatSkema,
  cekPenyimpangan,
  daftarMigrasi,
  jalankanSql,
  namaSkemaBaru,
  terapkanMigrasi,
} from "./lib/skema-uji";

let gagal = 0;
function cek(nama: string, lulus: boolean, catatan = "") {
  if (!lulus) gagal++;
  console.log(`  ${lulus ? "OK   " : "GAGAL"} ${nama}${catatan ? `  (${catatan})` : ""}`);
}

async function ambil<T extends Record<string, unknown>>(skema: string, sql: string): Promise<T[]> {
  return (await jalankanSql<T>(skema, sql)).rows;
}

async function ujiDariIsiLama() {
  console.log("\nA. Migrasi dari isi lama");
  const migrasi = daftarMigrasi();
  const awal = migrasi[0];
  const baru = migrasi[migrasi.length - 1];
  cek("urutan migrasi: awal lalu rancangan ERD", awal.endsWith("_awal") && baru.endsWith("_rancangan_erd"), migrasi.join(", "));

  const skema = namaSkemaBaru("uji_migrasi_lama");
  await buatSkema(skema);
  try {
    await jalankanSql(skema, bacaMigrasi(awal));

    // Data lama: dua kontrak, satu dengan tarif denda tidak lazim, satu tanpa
    // berkas sama sekali, lengkap dengan ekstraksi, medan, dan sorotan.
    await jalankanSql(
      skema,
      `
      INSERT INTO vendor (id, nama, npwp, alamat, klasifikasi, "terdaftarSejak", "updatedAt")
        VALUES ('v1', 'PT Sumber Jaya Abadi', '02.345.678.9-091.000', 'Samarinda', 'Pemeliharaan', 2021, now());
      INSERT INTO kontrak (id, nomor, judul, status, "vendorId", "nilaiKontrak", "komitmenTkdn",
                           "tarifDendaHarian", "batasMaksDenda", "jumlahTermin", "tanggalMulai",
                           "tanggalBerakhir", "namaBerkas", "jumlahHalaman", "updatedAt")
        VALUES ('k1', 'KTR/2026/0142', 'Pemeliharaan Terminal BBM Balikpapan', 'BERJALAN', 'v1',
                4850000000, 42, '1/1000 dari nilai kontrak per hari', 5, 3,
                '2026-03-15', '2026-09-12', 'KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf', 24, now()),
               ('k2', 'KTR/2026/0200', 'Kontrak tanpa berkas', 'DRAF', NULL,
                1000000000, NULL, '1/2000 dari nilai kontrak per hari', NULL, NULL,
                NULL, NULL, NULL, NULL, now()),
               ('k3', 'KTR/2026/0300', 'Kontrak tarif tidak berbentuk pecahan', 'DRAF', NULL,
                NULL, NULL, 'sesuai ketentuan', NULL, NULL, NULL, NULL, NULL, NULL, now());
      INSERT INTO ekstraksi (id, "kontrakId", model, "selesaiPada") VALUES ('e1', 'k1', 'uji', now());
      INSERT INTO medan_ekstraksi (id, "ekstraksiId", urutan, kunci, label, kelompok, nilai, keyakinan)
        VALUES ('m1', 'e1', 1, 'nomor_kontrak', 'Nomor Kontrak', 'POKOK_PERJANJIAN', 'KTR/2026/0142', 1),
               ('m2', 'e1', 2, 'nilai_kontrak', 'Nilai Kontrak', 'POKOK_PERJANJIAN', 'Rp4.850.000.000', 1);
      INSERT INTO sorotan (id, "medanId", halaman, x, y, lebar, tinggi)
        VALUES ('s1', 'm1', 2, 10, 20, 100, 12), ('s2', 'm2', 3, 10, 40, 150, 12);
      INSERT INTO termin (id, "kontrakId", urutan, nilai, syarat, "jatuhTempo")
        VALUES ('t1', 'k1', 1, 1455000000, 'Mobilisasi', '2026-05-25');
      INSERT INTO amendemen (id, "kontrakId", versi, tanggal, ringkasan, aktif)
        VALUES ('a1', 'k1', 1, '2026-05-03', 'Penambahan lingkup', true);
      INSERT INTO progres (id, "kontrakId", tanggal, keterangan) VALUES ('p1', 'k1', '2026-03-20', 'Mobilisasi');
      `
    );

    await jalankanSql(skema, bacaMigrasi(baru));
    cek("migrasi baru berjalan di atas data lama", true);

    const k = await ambil<{ nomor: string; tarif: string | null; tkdn: string | null; batas: string | null; fungsi: string | null }>(
      skema,
      `SELECT nomor, "tarifDendaPermil"::text AS tarif, "komitmenTkdnPersen"::text AS tkdn,
              "batasDendaPersen"::text AS batas, "fungsiId" AS fungsi
       FROM kontrak ORDER BY nomor`
    );
    cek("tiga kontrak lama masih ada", k.length === 3);
    cek("tarif 1/1000 menjadi 1 permil", Number(k[0].tarif) === 1, `${k[0].tarif}`);
    cek("tarif 1/2000 menjadi 0,5 permil", Number(k[1].tarif) === 0.5, `${k[1].tarif}`);
    cek("tarif yang bukan pecahan dibiarkan kosong", k[2].tarif === null);
    cek("komitmen TKDN ikut pindah ke kolom baru", Number(k[0].tkdn) === 42);
    cek("batas denda ikut pindah ke kolom baru", Number(k[0].batas) === 5);

    const d = await ambil<{ kontrakId: string; jenis: string; namaBerkas: string; lokasiSimpan: string; hashSha256: string; jumlahHalaman: number | null }>(
      skema,
      `SELECT "kontrakId", jenis::text, "namaBerkas", "lokasiSimpan", "hashSha256", "jumlahHalaman" FROM dokumen ORDER BY "kontrakId"`
    );
    cek("kontrak yang punya berkas atau ekstraksi mendapat satu dokumen", d.length === 1 && d[0].kontrakId === "k1", `${d.length} dokumen`);
    cek("dokumen lama berjenis KONTRAK", d[0]?.jenis === "KONTRAK");
    cek("nama berkas dan jumlah halaman terbawa", d[0]?.namaBerkas.startsWith("KTR-2026-0142") && d[0]?.jumlahHalaman === 24);
    cek("letak berkas mengikuti aturan lama data/kontrak/<slug>.pdf", d[0]?.lokasiSimpan === "data/kontrak/KTR-2026-0142.pdf", d[0]?.lokasiSimpan);
    cek("sidik sementara ditandai jelas", d[0]?.hashSha256.startsWith("belum-dihitung:"));

    const e = await ambil<{ dokumenId: string }>(skema, `SELECT "dokumenId" FROM ekstraksi`);
    cek("ekstraksi lama tersambung ke dokumen", e.length === 1 && e[0].dokumenId === "dok_lama_k1");
    const m = await ambil<{ n: number }>(skema, `SELECT count(*)::int AS n FROM medan_ekstraksi`);
    cek("dua medan ekstraksi tetap ada", m[0].n === 2);
    const s = await ambil<{ dokumenId: string; medanId: string }>(skema, `SELECT "dokumenId", "medanId" FROM sorotan ORDER BY id`);
    cek("dua sorotan tetap ada dan tersambung ke dokumen", s.length === 2 && s.every((x) => x.dokumenId === "dok_lama_k1"));
    const t = await ambil<{ n: number }>(skema, `SELECT (SELECT count(*) FROM termin)::int + (SELECT count(*) FROM progres)::int AS n`);
    cek("termin dan progres tidak tersentuh", t[0].n === 2);
    const a = await ambil<{ jenis: string[] | string | null; aktif: boolean }>(
      skema,
      `SELECT "jenisPerubahan"::text AS jenis, aktif FROM amendemen`
    );
    cek("amendemen lama tetap ada dengan daftar jenis perubahan kosong", a.length === 1 && a[0].jenis === "{}", String(a[0]?.jenis));
    const v = await ambil<{ golongan: string }>(skema, `SELECT "golonganUsaha"::text AS golongan FROM vendor`);
    cek("vendor lama mendapat golongan usaha bawaan TANPA", v[0].golongan === "TANPA");

    await ujiLengkapiDokumenLama(skema);
  } finally {
    await buangSkema(skema);
  }
}

/** Menjalankan scripts/lengkapi-dokumen-lama.ts terhadap skema yang baru dimigrasi dari data lama. */
async function ujiLengkapiDokumenLama(skema: string) {
  console.log("\n  Skrip lengkapi-dokumen-lama");
  const dir = mkdtempSync(path.join(tmpdir(), "vasko-lama-"));
  try {
    // Berkas lama diletakkan di tempat yang dicatat migrasi: data/kontrak/<slug>.pdf
    const isi = readFileSync(path.join("public", "contoh", "KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf"));
    mkdirSync(path.join(dir, "kontrak"), { recursive: true });
    writeFileSync(path.join(dir, "kontrak", "KTR-2026-0142.pdf"), isi);
    const sidik = createHash("sha256").update(isi).digest("hex");

    const jalankan = (...argumen: string[]) => {
      const r = spawnSync(process.execPath, [path.resolve("node_modules", "tsx", "dist", "cli.mjs"), "scripts/lengkapi-dokumen-lama.ts", ...argumen], {
        env: { ...process.env, DATABASE_SKEMA: skema, VASKO_DIR_DATA: dir },
        encoding: "utf8",
      });
      return { kode: r.status ?? 1, keluaran: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const baris = async (id: string) =>
      (await ambil<{ hashSha256: string; ukuranByte: number; lokasiSimpan: string }>(
        skema,
        `SELECT "hashSha256", "ukuranByte", "lokasiSimpan" FROM dokumen WHERE id = '${id}'`
      ))[0];
    const masihSementara = async (id: string) => (await baris(id)).hashSha256.startsWith("belum-dihitung:");

    const lihat = jalankan();
    cek("tanpa --terapkan: hanya menampilkan rencana, kode keluar 0", lihat.kode === 0 && lihat.keluaran.includes("AKAN"), lihat.keluaran.slice(-200));
    cek("tanpa --terapkan: tidak ada yang berubah di basis data", await masihSementara("dok_lama_k1"));
    cek("tanpa --terapkan: tidak ada berkas baru di disk", !existsSync(path.join(dir, "dokumen")));

    // Dokumen kembar: kontrak yang sama sudah punya dokumen dengan isi persis sama.
    await jalankanSql(
      skema,
      `INSERT INTO dokumen (id, "kontrakId", jenis, "namaBerkas", "lokasiSimpan", "hashSha256", "ukuranByte")
       VALUES ('dok_kembar', 'k1', 'PENDUKUNG', 'salinan.pdf', 'data/dokumen/${sidik}.pdf', '${sidik}', ${isi.length})`
    );
    const kembar = jalankan("--terapkan");
    cek("dokumen kembar: dilewati dan dilaporkan dengan kode keluar 1", kembar.kode === 1 && kembar.keluaran.includes("sama persis"), kembar.keluaran.slice(-200));
    cek("dokumen kembar: baris lama dibiarkan", await masihSementara("dok_lama_k1"));
    await jalankanSql(skema, `DELETE FROM dokumen WHERE id = 'dok_kembar'`);

    const terap = jalankan("--terapkan");
    const lama = await baris("dok_lama_k1");
    cek("--terapkan berhasil dengan kode keluar 0", terap.kode === 0 && terap.keluaran.includes("SELESAI"), terap.keluaran.slice(-200));
    cek("sidik dan ukuran sebenarnya terisi", lama.hashSha256 === sidik && lama.ukuranByte === isi.length, `${lama.hashSha256.slice(0, 12)} ${lama.ukuranByte}`);
    cek("letak berpindah ke data/dokumen/<sidik>.pdf", lama.lokasiSimpan === `data/dokumen/${sidik}.pdf`, lama.lokasiSimpan);
    const baru = path.join(dir, "dokumen", `${sidik}.pdf`);
    cek("salinan di letak baru identik dengan berkas asli", existsSync(baru) && readFileSync(baru).equals(isi));
    cek("berkas lama tidak dihapus", existsSync(path.join(dir, "kontrak", "KTR-2026-0142.pdf")));

    const ulang = jalankan("--terapkan");
    cek("dijalankan lagi: tidak ada yang perlu dilengkapi, kode keluar 0", ulang.kode === 0 && ulang.keluaran.includes("Tidak ada"), ulang.keluaran.slice(-200));

    // Berkas lama yang sudah hilang dari disk.
    await jalankanSql(
      skema,
      `INSERT INTO dokumen (id, "kontrakId", jenis, "namaBerkas", "lokasiSimpan", "hashSha256", "ukuranByte")
       VALUES ('dok_hilang', 'k2', 'KONTRAK', 'hilang.pdf', 'data/kontrak/KTR-2026-0200.pdf', 'belum-dihitung:k2', 0)`
    );
    const hilang = jalankan("--terapkan");
    cek("berkas lama yang hilang: dilaporkan dengan kode keluar 1", hilang.kode === 1 && hilang.keluaran.includes("tidak ditemukan"), hilang.keluaran.slice(-200));
    cek("berkas lama yang hilang: baris dibiarkan", await masihSementara("dok_hilang"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function ujiDariKosong() {
  console.log("\nB. Migrasi dari kosong dengan prisma migrate deploy");
  const skema = namaSkemaBaru("uji_migrasi_baru");
  await buatSkema(skema);
  try {
    terapkanMigrasi(skema);
    cek("prisma migrate deploy berhasil", true);

    const tabel = await ambil<{ table_name: string }>(
      skema,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${skema}' AND table_type = 'BASE TABLE' ORDER BY 1`
    );
    const ada = new Set(tabel.map((x) => x.table_name));
    const harus = [
      "fungsi", "pengguna", "sesi", "riwayat_aktivitas", "vendor", "kontrak", "termin", "progres",
      "dokumen", "ekstraksi", "medan_ekstraksi", "sorotan", "validasi", "penggunaan_dokumen",
      "temuan", "amendemen", "pemakaian_ai",
    ];
    const hilang = harus.filter((t) => !ada.has(t));
    cek(`seluruh ${harus.length} tabel rancangan terbentuk`, hilang.length === 0, hilang.join(", "));

    const selisih = cekPenyimpangan(skema);
    cek(
      "skema hidup sama persis dengan schema.prisma (tidak ada penyimpangan)",
      selisih === "",
      selisih ? `\n${selisih.slice(0, 600)}` : ""
    );

    // Kontrol negatif: alat pemeriksa harus benar-benar bisa melihat
    // perbedaan. Tanpa ini, hasil kosong di atas bisa saja berarti alatnya
    // tidak bekerja.
    await jalankanSql(skema, `ALTER TABLE kontrak ADD COLUMN kolom_liar integer`);
    const selisihLiar = cekPenyimpangan(skema);
    cek("kontrol negatif: kolom liar terdeteksi sebagai penyimpangan", selisihLiar.includes("kolom_liar"));
  } finally {
    await buangSkema(skema);
  }
}

async function main() {
  await ujiDariIsiLama();
  await ujiDariKosong();
  console.log(gagal === 0 ? "\nSeluruh pemeriksaan migrasi lulus." : `\n${gagal} pemeriksaan GAGAL.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
