-- Migrasi ke rancangan ERD VASKO (Oktober 2026).
--
-- Disunting dengan tangan dari keluaran "prisma migrate diff", karena diff
-- otomatis membuang lalu membuat ulang kolom yang sebenarnya hanya berganti
-- nama atau pindah tabel, dan itu menghapus data yang sudah ada. Di sini:
--   * kontrak.komitmenTkdn dan kontrak.batasMaksDenda diganti nama
--   * kontrak.tarifDendaHarian (teks) diubah menjadi kontrak.tarifDendaPermil (angka)
--   * kontrak.namaBerkas dan kontrak.jumlahHalaman pindah menjadi baris di tabel dokumen
--   * ekstraksi dan sorotan dihubungkan ke dokumen, bukan lagi langsung ke kontrak
--
-- Yang sengaja dibuang tanpa pengganti: vendor.klasifikasi dan
-- vendor.terdaftarSejak (sisa rancangan D11), serta kontrak.jumlahTermin
-- (dobel dengan tabel termin).
--
-- Baris dokumen untuk kontrak lama diisi sidik sementara "belum-dihitung:<id>"
-- dan ukuran 0. Jalankan scripts/lengkapi-dokumen-lama.ts untuk menghitung
-- sidik dan ukuran sebenarnya dari berkas di data/kontrak.

-- ============================================================ jenis enum

CREATE TYPE "PeranPengguna" AS ENUM ('ADMIN', 'PROCUREMENT', 'FPP');
CREATE TYPE "GolonganUsaha" AS ENUM ('KECIL', 'MENENGAH', 'BESAR', 'TANPA');
CREATE TYPE "StatusValidasiKontrak" AS ENUM ('BELUM', 'VALID', 'BELUM_VALID');
CREATE TYPE "KategoriAnggaran" AS ENUM ('ABI', 'ABO');
CREATE TYPE "JenisDokumen" AS ENUM ('KONTRAK', 'PENDUKUNG', 'AMANDEMEN', 'PENDUKUNG_AMANDEMEN');
CREATE TYPE "BagianDokumen" AS ENUM ('PPJ', 'LAMPIRAN_A', 'LAMPIRAN_B', 'LAMPIRAN_C', 'LAMPIRAN_D', 'LAMPIRAN_E', 'LAMPIRAN_F', 'LAMPIRAN_G');
CREATE TYPE "SumberDokumen" AS ENUM ('UNGGAH', 'ZIP', 'ONEDRIVE');
CREATE TYPE "StatusValidasi" AS ENUM ('BERJALAN', 'SELESAI', 'GAGAL');
CREATE TYPE "HasilValidasi" AS ENUM ('VALID', 'BELUM_VALID');
CREATE TYPE "LabelDokumen" AS ENUM ('UTAMA', 'KOMPLEMENTER', 'DIGANTIKAN');
CREATE TYPE "TingkatTemuan" AS ENUM ('MERAH', 'KUNING');
CREATE TYPE "KeputusanTemuan" AS ENUM ('BELUM', 'DITERIMA', 'DIUBAH', 'DIABAIKAN');
CREATE TYPE "JenisPerubahan" AS ENUM ('LINGKUP', 'VOLUME', 'JANGKA_WAKTU', 'HARGA');
CREATE TYPE "ProsesAI" AS ENUM ('EKSTRAKSI', 'VALIDASI', 'AMANDEMEN', 'PERBANDINGAN');

-- Nilai baru ini tidak dipakai di migrasi ini, jadi aman dalam satu transaksi.
ALTER TYPE "KelompokMedan" ADD VALUE 'PENDUKUNG';
ALTER TYPE "KelompokMedan" ADD VALUE 'AMANDEMEN';

-- ============================================================ tabel baru

CREATE TABLE "fungsi" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "namaLengkap" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fungsi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pengguna" (
    "id" TEXT NOT NULL,
    "fungsiId" TEXT,
    "nama" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashKataSandi" TEXT NOT NULL,
    "peran" "PeranPengguna" NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "wajibGantiSandi" BOOLEAN NOT NULL DEFAULT true,
    "jumlahGagalMasuk" INTEGER NOT NULL DEFAULT 0,
    "terkunciSampai" TIMESTAMP(3),
    "terakhirMasuk" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pengguna_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sesi" (
    "id" TEXT NOT NULL,
    "penggunaId" TEXT NOT NULL,
    "hashToken" TEXT NOT NULL,
    "terakhirAktif" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "berakhirPada" TIMESTAMP(3) NOT NULL,
    "alamatIp" TEXT,
    "perangkat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "riwayat_aktivitas" (
    "id" TEXT NOT NULL,
    "penggunaId" TEXT,
    "aksi" TEXT NOT NULL,
    "entitas" TEXT,
    "entitasId" TEXT,
    "rincian" JSONB,
    "alamatIp" TEXT,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riwayat_aktivitas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dokumen" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "amendemenId" TEXT,
    "jenis" "JenisDokumen" NOT NULL,
    "bagian" "BagianDokumen",
    "jenisPendukung" TEXT,
    "judulDokumen" TEXT,
    "namaBerkas" TEXT NOT NULL,
    "lokasiSimpan" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "ukuranByte" INTEGER NOT NULL,
    "jumlahHalaman" INTEGER,
    "adaLapisanTeks" BOOLEAN NOT NULL DEFAULT true,
    "tanggalDiIsi" TIMESTAMP(3),
    "tanggalEditBerkas" TIMESTAMP(3),
    "sumber" "SumberDokumen" NOT NULL DEFAULT 'UNGGAH',
    "diunggahOlehId" TEXT,
    "diunggahPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "validasi" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "status" "StatusValidasi" NOT NULL DEFAULT 'BERJALAN',
    "hasil" "HasilValidasi",
    "model" TEXT,
    "dijalankanOlehId" TEXT,
    "mulaiPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selesaiPada" TIMESTAMP(3),
    "galat" TEXT,
    "ringkasan" JSONB,

    CONSTRAINT "validasi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "penggunaan_dokumen" (
    "id" TEXT NOT NULL,
    "validasiId" TEXT NOT NULL,
    "dokumenId" TEXT NOT NULL,
    "label" "LabelDokumen" NOT NULL,
    "digantikanOlehId" TEXT,
    "alasan" TEXT,

    CONSTRAINT "penggunaan_dokumen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "temuan" (
    "id" TEXT NOT NULL,
    "validasiId" TEXT NOT NULL,
    "nomor" INTEGER NOT NULL,
    "tingkat" "TingkatTemuan" NOT NULL,
    "kodeAturan" TEXT,
    "lokasi" TEXT,
    "uraian" TEXT NOT NULL,
    "nilaiDiKontrak" TEXT,
    "nilaiSaran" TEXT,
    "dasar" TEXT,
    "keputusan" "KeputusanTemuan" NOT NULL DEFAULT 'BELUM',
    "nilaiKeputusan" TEXT,
    "alasanKeputusan" TEXT,
    "diputuskanOlehId" TEXT,
    "diputuskanPada" TIMESTAMP(3),

    CONSTRAINT "temuan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pemakaian_ai" (
    "id" TEXT NOT NULL,
    "proses" "ProsesAI" NOT NULL,
    "model" TEXT NOT NULL,
    "tokenMasuk" INTEGER NOT NULL,
    "tokenKeluar" INTEGER NOT NULL,
    "biayaUsd" DECIMAL(12,6),
    "validasiId" TEXT,
    "ekstraksiId" TEXT,
    "amendemenId" TEXT,
    "olehPenggunaId" TEXT,
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pemakaian_ai_pkey" PRIMARY KEY ("id")
);

-- ============================================================ vendor

ALTER TABLE "vendor"
    DROP COLUMN "klasifikasi",
    DROP COLUMN "terdaftarSejak",
    ADD COLUMN "bank" TEXT,
    ADD COLUMN "golonganUsaha" "GolonganUsaha" NOT NULL DEFAULT 'TANPA',
    ADD COLUMN "nomorAkta" TEXT,
    ADD COLUMN "nomorRekening" TEXT,
    ADD COLUMN "tanggalAkta" TIMESTAMP(3);

-- ============================================================ kontrak

ALTER TABLE "kontrak" RENAME COLUMN "komitmenTkdn" TO "komitmenTkdnPersen";
ALTER TABLE "kontrak" RENAME COLUMN "batasMaksDenda" TO "batasDendaPersen";

ALTER TABLE "kontrak"
    ADD COLUMN "fungsiId" TEXT,
    ADD COLUMN "modelOclc" INTEGER,
    ADD COLUMN "kategoriAnggaran" "KategoriAnggaran",
    ADD COLUMN "statusValidasi" "StatusValidasiKontrak" NOT NULL DEFAULT 'BELUM',
    ADD COLUMN "termasukPpn" BOOLEAN,
    ADD COLUMN "tarifDendaPermil" DECIMAL(8,4),
    ADD COLUMN "nilaiJaminan" DECIMAL(18,2),
    ADD COLUMN "jaminanBerlakuSampai" TIMESTAMP(3),
    ADD COLUMN "masaPemeliharaanHari" INTEGER,
    ADD COLUMN "dibuatOlehId" TEXT;

-- Tarif lama berupa teks, misalnya "1/1000 dari nilai kontrak per hari".
-- Pecahan pertama di dalamnya diubah menjadi permil: 1/1000 menjadi 1,
-- 1/2000 menjadi 0,5. Yang tidak berbentuk pecahan dibiarkan kosong.
UPDATE "kontrak"
SET "tarifDendaPermil" = ROUND(
    1000.0 * (m)[1]::numeric / NULLIF((m)[2]::numeric, 0), 4)
FROM (
    SELECT "id" AS kid,
           regexp_match("tarifDendaHarian", '(\d+(?:\.\d+)?)\s*/\s*(\d+)') AS m
    FROM "kontrak"
) AS x
WHERE "kontrak"."id" = x.kid
  AND x.m IS NOT NULL;

-- ============================================================ dokumen lama

-- Setiap kontrak yang punya berkas atau riwayat ekstraksi mendapat satu baris
-- dokumen berjenis KONTRAK. Letak berkas mengikuti aturan lama:
-- data/kontrak/<nomor dengan tanda baca diganti tanda hubung>.pdf
INSERT INTO "dokumen" (
    "id", "kontrakId", "jenis", "namaBerkas", "lokasiSimpan", "hashSha256",
    "ukuranByte", "jumlahHalaman", "adaLapisanTeks", "sumber", "diunggahPada"
)
SELECT
    'dok_lama_' || k."id",
    k."id",
    'KONTRAK',
    COALESCE(k."namaBerkas", 'tanpa-nama.pdf'),
    'data/kontrak/' || btrim(regexp_replace(k."nomor", '[^A-Za-z0-9]+', '-', 'g'), '-') || '.pdf',
    'belum-dihitung:' || k."id",
    0,
    k."jumlahHalaman",
    true,
    'UNGGAH',
    k."createdAt"
FROM "kontrak" k
WHERE k."namaBerkas" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "ekstraksi" e WHERE e."kontrakId" = k."id");

ALTER TABLE "kontrak"
    DROP COLUMN "tarifDendaHarian",
    DROP COLUMN "namaBerkas",
    DROP COLUMN "jumlahHalaman",
    DROP COLUMN "jumlahTermin";

-- ============================================================ ekstraksi dan sorotan

ALTER TABLE "ekstraksi"
    ADD COLUMN "dokumenId" TEXT,
    ADD COLUMN "dijalankanOlehId" TEXT,
    ADD COLUMN "rincian" JSONB;

UPDATE "ekstraksi" SET "dokumenId" = 'dok_lama_' || "kontrakId";

ALTER TABLE "ekstraksi" ALTER COLUMN "dokumenId" SET NOT NULL;
ALTER TABLE "ekstraksi" DROP CONSTRAINT "ekstraksi_kontrakId_fkey";
ALTER TABLE "ekstraksi" DROP COLUMN "kontrakId";

ALTER TABLE "medan_ekstraksi" ADD COLUMN "dikonfirmasiOlehId" TEXT;

ALTER TABLE "sorotan"
    ADD COLUMN "dokumenId" TEXT,
    ADD COLUMN "temuanId" TEXT;

UPDATE "sorotan" s
SET "dokumenId" = e."dokumenId"
FROM "medan_ekstraksi" m
JOIN "ekstraksi" e ON e."id" = m."ekstraksiId"
WHERE m."id" = s."medanId";

ALTER TABLE "sorotan" ALTER COLUMN "dokumenId" SET NOT NULL;
ALTER TABLE "sorotan" ALTER COLUMN "medanId" DROP NOT NULL;

-- ============================================================ amendemen

ALTER TABLE "amendemen"
    ADD COLUMN "nomor" TEXT,
    ADD COLUMN "jenisPerubahan" "JenisPerubahan"[] NOT NULL DEFAULT ARRAY[]::"JenisPerubahan"[],
    ADD COLUMN "nilaiAmandemen" DECIMAL(18,2),
    ADD COLUMN "nilaiKontrakSetelah" DECIMAL(18,2),
    ADD COLUMN "tanggalBerakhirBaru" TIMESTAMP(3),
    ADD COLUMN "hasilPerbandingan" JSONB,
    ADD COLUMN "dibuatOlehId" TEXT,
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================ indeks

CREATE UNIQUE INDEX "fungsi_kode_key" ON "fungsi"("kode");
CREATE UNIQUE INDEX "pengguna_email_key" ON "pengguna"("email");
CREATE INDEX "pengguna_fungsiId_idx" ON "pengguna"("fungsiId");
CREATE UNIQUE INDEX "sesi_hashToken_key" ON "sesi"("hashToken");
CREATE INDEX "sesi_penggunaId_idx" ON "sesi"("penggunaId");
CREATE INDEX "sesi_berakhirPada_idx" ON "sesi"("berakhirPada");
CREATE INDEX "riwayat_aktivitas_penggunaId_waktu_idx" ON "riwayat_aktivitas"("penggunaId", "waktu");
CREATE INDEX "riwayat_aktivitas_entitas_entitasId_idx" ON "riwayat_aktivitas"("entitas", "entitasId");
CREATE INDEX "riwayat_aktivitas_aksi_waktu_idx" ON "riwayat_aktivitas"("aksi", "waktu");
CREATE INDEX "dokumen_kontrakId_jenis_idx" ON "dokumen"("kontrakId", "jenis");
CREATE INDEX "dokumen_amendemenId_idx" ON "dokumen"("amendemenId");
CREATE UNIQUE INDEX "dokumen_kontrakId_hashSha256_key" ON "dokumen"("kontrakId", "hashSha256");
CREATE UNIQUE INDEX "validasi_kontrakId_urutan_key" ON "validasi"("kontrakId", "urutan");
CREATE UNIQUE INDEX "penggunaan_dokumen_validasiId_dokumenId_key" ON "penggunaan_dokumen"("validasiId", "dokumenId");
CREATE INDEX "temuan_validasiId_tingkat_idx" ON "temuan"("validasiId", "tingkat");
CREATE UNIQUE INDEX "temuan_validasiId_nomor_key" ON "temuan"("validasiId", "nomor");
CREATE INDEX "pemakaian_ai_proses_waktu_idx" ON "pemakaian_ai"("proses", "waktu");
CREATE UNIQUE INDEX "vendor_npwp_key" ON "vendor"("npwp");
CREATE INDEX "vendor_nama_idx" ON "vendor"("nama");
CREATE INDEX "kontrak_vendorId_idx" ON "kontrak"("vendorId");
CREATE INDEX "kontrak_fungsiId_idx" ON "kontrak"("fungsiId");
CREATE INDEX "kontrak_status_idx" ON "kontrak"("status");
CREATE INDEX "kontrak_tanggalBerakhir_idx" ON "kontrak"("tanggalBerakhir");
CREATE INDEX "ekstraksi_dokumenId_idx" ON "ekstraksi"("dokumenId");
CREATE INDEX "sorotan_medanId_idx" ON "sorotan"("medanId");
CREATE INDEX "sorotan_temuanId_idx" ON "sorotan"("temuanId");
CREATE INDEX "sorotan_dokumenId_idx" ON "sorotan"("dokumenId");

-- ============================================================ kunci asing

ALTER TABLE "pengguna" ADD CONSTRAINT "pengguna_fungsiId_fkey" FOREIGN KEY ("fungsiId") REFERENCES "fungsi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sesi" ADD CONSTRAINT "sesi_penggunaId_fkey" FOREIGN KEY ("penggunaId") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "riwayat_aktivitas" ADD CONSTRAINT "riwayat_aktivitas_penggunaId_fkey" FOREIGN KEY ("penggunaId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_fungsiId_fkey" FOREIGN KEY ("fungsiId") REFERENCES "fungsi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dokumen" ADD CONSTRAINT "dokumen_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dokumen" ADD CONSTRAINT "dokumen_amendemenId_fkey" FOREIGN KEY ("amendemenId") REFERENCES "amendemen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dokumen" ADD CONSTRAINT "dokumen_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ekstraksi" ADD CONSTRAINT "ekstraksi_dokumenId_fkey" FOREIGN KEY ("dokumenId") REFERENCES "dokumen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ekstraksi" ADD CONSTRAINT "ekstraksi_dijalankanOlehId_fkey" FOREIGN KEY ("dijalankanOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "medan_ekstraksi" ADD CONSTRAINT "medan_ekstraksi_dikonfirmasiOlehId_fkey" FOREIGN KEY ("dikonfirmasiOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sorotan" ADD CONSTRAINT "sorotan_temuanId_fkey" FOREIGN KEY ("temuanId") REFERENCES "temuan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sorotan" ADD CONSTRAINT "sorotan_dokumenId_fkey" FOREIGN KEY ("dokumenId") REFERENCES "dokumen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validasi" ADD CONSTRAINT "validasi_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validasi" ADD CONSTRAINT "validasi_dijalankanOlehId_fkey" FOREIGN KEY ("dijalankanOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "penggunaan_dokumen" ADD CONSTRAINT "penggunaan_dokumen_validasiId_fkey" FOREIGN KEY ("validasiId") REFERENCES "validasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "penggunaan_dokumen" ADD CONSTRAINT "penggunaan_dokumen_dokumenId_fkey" FOREIGN KEY ("dokumenId") REFERENCES "dokumen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "penggunaan_dokumen" ADD CONSTRAINT "penggunaan_dokumen_digantikanOlehId_fkey" FOREIGN KEY ("digantikanOlehId") REFERENCES "dokumen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temuan" ADD CONSTRAINT "temuan_validasiId_fkey" FOREIGN KEY ("validasiId") REFERENCES "validasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temuan" ADD CONSTRAINT "temuan_diputuskanOlehId_fkey" FOREIGN KEY ("diputuskanOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "amendemen" ADD CONSTRAINT "amendemen_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_ai_validasiId_fkey" FOREIGN KEY ("validasiId") REFERENCES "validasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_ai_ekstraksiId_fkey" FOREIGN KEY ("ekstraksiId") REFERENCES "ekstraksi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_ai_amendemenId_fkey" FOREIGN KEY ("amendemenId") REFERENCES "amendemen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_ai_olehPenggunaId_fkey" FOREIGN KEY ("olehPenggunaId") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ aturan yang tidak ada di schema.prisma

-- Peran FPP wajib punya fungsi, peran lain tidak boleh.
ALTER TABLE "pengguna" ADD CONSTRAINT "pengguna_fungsi_sesuai_peran"
    CHECK (("peran" = 'FPP') = ("fungsiId" IS NOT NULL));

ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_nilai_tak_negatif"
    CHECK ("nilaiKontrak" IS NULL OR "nilaiKontrak" >= 0);
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_jaminan_tak_negatif"
    CHECK ("nilaiJaminan" IS NULL OR "nilaiJaminan" >= 0);
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_tarif_tak_negatif"
    CHECK ("tarifDendaPermil" IS NULL OR "tarifDendaPermil" >= 0);
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_batas_denda_persen"
    CHECK ("batasDendaPersen" IS NULL OR ("batasDendaPersen" >= 0 AND "batasDendaPersen" <= 100));
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_tkdn_persen"
    CHECK ("komitmenTkdnPersen" IS NULL OR ("komitmenTkdnPersen" >= 0 AND "komitmenTkdnPersen" <= 100));
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_model_oclc"
    CHECK ("modelOclc" IS NULL OR ("modelOclc" BETWEEN 1 AND 11));
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_urutan_tanggal"
    CHECK ("tanggalMulai" IS NULL OR "tanggalBerakhir" IS NULL OR "tanggalBerakhir" >= "tanggalMulai");
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_pemeliharaan_tak_negatif"
    CHECK ("masaPemeliharaanHari" IS NULL OR "masaPemeliharaanHari" >= 0);

ALTER TABLE "dokumen" ADD CONSTRAINT "dokumen_ukuran_tak_negatif"
    CHECK ("ukuranByte" >= 0);

-- Sorotan menempel ke satu medan ekstraksi ATAU satu temuan, tidak keduanya
-- dan tidak tidak-satu-pun.
ALTER TABLE "sorotan" ADD CONSTRAINT "sorotan_satu_sasaran"
    CHECK (("medanId" IS NOT NULL)::int + ("temuanId" IS NOT NULL)::int = 1);

ALTER TABLE "medan_ekstraksi" ADD CONSTRAINT "medan_keyakinan_0_sampai_1"
    CHECK ("keyakinan" >= 0 AND "keyakinan" <= 1);

-- Dokumen DIGANTIKAN wajib menyebut penggantinya, dan hanya dokumen itu.
ALTER TABLE "penggunaan_dokumen" ADD CONSTRAINT "penggunaan_pengganti_sesuai_label"
    CHECK (("label" = 'DIGANTIKAN') = ("digantikanOlehId" IS NOT NULL));

-- Temuan yang diabaikan wajib beralasan. Temuan yang sudah diputuskan wajib
-- punya waktu keputusan.
ALTER TABLE "temuan" ADD CONSTRAINT "temuan_abaikan_wajib_alasan"
    CHECK ("keputusan" <> 'DIABAIKAN' OR length(btrim(COALESCE("alasanKeputusan", ''))) > 0);
ALTER TABLE "temuan" ADD CONSTRAINT "temuan_keputusan_wajib_waktu"
    CHECK ("keputusan" = 'BELUM' OR "diputuskanPada" IS NOT NULL);

-- Paling banyak satu rujukan pada catatan pemakaian AI.
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_satu_rujukan"
    CHECK (num_nonnulls("validasiId", "ekstraksiId", "amendemenId") <= 1);
ALTER TABLE "pemakaian_ai" ADD CONSTRAINT "pemakaian_token_tak_negatif"
    CHECK ("tokenMasuk" >= 0 AND "tokenKeluar" >= 0);

-- Riwayat aktivitas hanya bisa ditambah. Pemicu ini menolak perubahan dan
-- penghapusan dari mana pun, termasuk dari aplikasi dan dari Admin. Akibatnya
-- akun yang sudah punya riwayat tidak bisa dihapus dari tabel pengguna; akun
-- cukup dinonaktifkan.
CREATE FUNCTION "tolak_ubah_riwayat"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'riwayat_aktivitas hanya bisa ditambah, tidak bisa diubah atau dihapus'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "riwayat_hanya_tambah"
    BEFORE UPDATE OR DELETE ON "riwayat_aktivitas"
    FOR EACH ROW EXECUTE FUNCTION "tolak_ubah_riwayat"();
