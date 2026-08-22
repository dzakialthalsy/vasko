-- CreateEnum
CREATE TYPE "StatusKontrak" AS ENUM ('DRAF', 'BERJALAN', 'SELESAI', 'DIPUTUS');

-- CreateEnum
CREATE TYPE "KelompokMedan" AS ENUM ('POKOK_PERJANJIAN', 'LAMPIRAN_B', 'LAMPIRAN_C', 'LAMPIRAN_D');

-- CreateEnum
CREATE TYPE "StatusTermin" AS ENUM ('MENUNGGU', 'JATUH_TEMPO', 'DIBAYAR');

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "npwp" TEXT,
    "alamat" TEXT,
    "klasifikasi" TEXT,
    "terdaftarSejak" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kontrak" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "status" "StatusKontrak" NOT NULL DEFAULT 'DRAF',
    "vendorId" TEXT,
    "nilaiKontrak" DECIMAL(18,2),
    "komitmenTkdn" DECIMAL(5,2),
    "tarifDendaHarian" TEXT,
    "batasMaksDenda" DECIMAL(5,2),
    "jumlahTermin" INTEGER,
    "tanggalMulai" TIMESTAMP(3),
    "tanggalBerakhir" TIMESTAMP(3),
    "namaBerkas" TEXT,
    "jumlahHalaman" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kontrak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ekstraksi" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "selesaiPada" TIMESTAMP(3),
    "galat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ekstraksi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medan_ekstraksi" (
    "id" TEXT NOT NULL,
    "ekstraksiId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "kunci" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kelompok" "KelompokMedan" NOT NULL,
    "nilai" TEXT,
    "keyakinan" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wajibKonfirmasi" BOOLEAN NOT NULL DEFAULT false,
    "dikonfirmasi" BOOLEAN NOT NULL DEFAULT false,
    "dikonfirmasiPada" TIMESTAMP(3),
    "nilaiSuntingan" TEXT,

    CONSTRAINT "medan_ekstraksi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sorotan" (
    "id" TEXT NOT NULL,
    "medanId" TEXT NOT NULL,
    "halaman" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "lebar" DOUBLE PRECISION NOT NULL,
    "tinggi" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "sorotan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termin" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "nilai" DECIMAL(18,2) NOT NULL,
    "syarat" TEXT NOT NULL,
    "jatuhTempo" TIMESTAMP(3) NOT NULL,
    "status" "StatusTermin" NOT NULL DEFAULT 'MENUNGGU',

    CONSTRAINT "termin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amendemen" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "versi" INTEGER NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "ringkasan" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "amendemen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progres" (
    "id" TEXT NOT NULL,
    "kontrakId" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "keterangan" TEXT NOT NULL,
    "selesai" BOOLEAN NOT NULL DEFAULT false,
    "persenTotal" INTEGER,

    CONSTRAINT "progres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kontrak_nomor_key" ON "kontrak"("nomor");

-- CreateIndex
CREATE UNIQUE INDEX "medan_ekstraksi_ekstraksiId_kunci_key" ON "medan_ekstraksi"("ekstraksiId", "kunci");

-- CreateIndex
CREATE UNIQUE INDEX "termin_kontrakId_urutan_key" ON "termin"("kontrakId", "urutan");

-- CreateIndex
CREATE UNIQUE INDEX "amendemen_kontrakId_versi_key" ON "amendemen"("kontrakId", "versi");

-- AddForeignKey
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ekstraksi" ADD CONSTRAINT "ekstraksi_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medan_ekstraksi" ADD CONSTRAINT "medan_ekstraksi_ekstraksiId_fkey" FOREIGN KEY ("ekstraksiId") REFERENCES "ekstraksi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorotan" ADD CONSTRAINT "sorotan_medanId_fkey" FOREIGN KEY ("medanId") REFERENCES "medan_ekstraksi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termin" ADD CONSTRAINT "termin_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendemen" ADD CONSTRAINT "amendemen_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progres" ADD CONSTRAINT "progres_kontrakId_fkey" FOREIGN KEY ("kontrakId") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;
