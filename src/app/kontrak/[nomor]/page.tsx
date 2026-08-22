import { notFound } from "next/navigation";
import Link from "next/link";
import {
  FileClock,
  TriangleAlert,
  GitBranch,
  Building2,
  Wallet,
  CalendarRange,
  ReceiptText,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupiah, tanggal, sisaHari } from "@/lib/format";
import { Chip } from "@/components/ui/Kartu";
import { ChipStatus, artiStatus } from "@/components/ui/StatusKontrak";
import { TabsKontrak } from "./TabsKontrak";

// Nomor kontrak memuat garis miring, yang tidak bisa dipakai langsung pada
// segmen URL. Bentuk tautannya memakai tanda hubung, lalu dipulihkan di sini.
function dariSlug(slug: string) {
  return decodeURIComponent(slug).replaceAll("-", "/");
}

export default async function HalamanDetailKontrak({
  params,
}: PageProps<"/kontrak/[nomor]">) {
  const { nomor } = await params;

  const kontrak = await prisma.kontrak.findUnique({
    where: { nomor: dariSlug(nomor) },
    include: {
      vendor: true,
      termin: { orderBy: { urutan: "asc" } },
      progres: { orderBy: { tanggal: "asc" } },
      amendemen: { orderBy: { versi: "desc" } },
    },
  });

  if (!kontrak) notFound();

  // Decimal milik Prisma tidak bisa menyeberang ke komponen klien, jadi
  // seluruhnya diubah menjadi number di batas server ini.
  const data = {
    nomor: kontrak.nomor,
    judul: kontrak.judul,
    nilaiKontrak: Number(kontrak.nilaiKontrak ?? 0),
    komitmenTkdn: Number(kontrak.komitmenTkdn ?? 0),
    batasMaksDenda: Number(kontrak.batasMaksDenda ?? 5),
    tarifDendaHarian: kontrak.tarifDendaHarian ?? "1/1000 dari nilai kontrak per hari",
    jumlahTermin: kontrak.jumlahTermin ?? kontrak.termin.length,
    tanggalMulai: kontrak.tanggalMulai?.toISOString() ?? null,
    tanggalBerakhir: kontrak.tanggalBerakhir?.toISOString() ?? null,
    namaBerkas: kontrak.namaBerkas,
    jumlahHalaman: kontrak.jumlahHalaman,
    vendor: kontrak.vendor
      ? { nama: kontrak.vendor.nama, npwp: kontrak.vendor.npwp, alamat: kontrak.vendor.alamat }
      : null,
    termin: kontrak.termin.map((t) => ({
      urutan: t.urutan,
      nilai: Number(t.nilai),
      syarat: t.syarat,
      jatuhTempo: t.jatuhTempo.toISOString(),
      status: t.status,
    })),
    progres: kontrak.progres.map((p) => ({
      tanggal: p.tanggal.toISOString(),
      keterangan: p.keterangan,
      selesai: p.selesai,
      persenTotal: p.persenTotal,
    })),
    amendemen: kontrak.amendemen.map((a) => ({
      versi: a.versi,
      tanggal: a.tanggal.toISOString(),
      ringkasan: a.ringkasan,
      aktif: a.aktif,
    })),
  };

  const sisa = kontrak.tanggalBerakhir ? sisaHari(kontrak.tanggalBerakhir) : null;
  const versiAktif = kontrak.amendemen.find((a) => a.aktif);

  return (
    <div className="px-6 py-6">
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted" aria-label="Remah roti">
        <Link href="/kontrak" className="hover:text-navy-900">
          Kontrak
        </Link>
        <span aria-hidden>&rsaquo;</span>
        <span className="font-semibold text-navy-900">{kontrak.nomor}</span>
      </nav>

      <header className="relative overflow-hidden rounded-xl bg-white px-8 py-7 shadow-[0_1px_3px_rgba(0,31,63,0.08)]">
        {/* Ikon dokumen samar di pojok kanan atas, mengikuti rancangan. */}
        <ReceiptText
          className="pointer-events-none absolute -right-2 top-4 text-line"
          size={104}
          strokeWidth={1.25}
          aria-hidden
        />

        <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">{kontrak.nomor}</h1>
        <p className="mt-1 text-xl font-semibold text-navy-900">{kontrak.judul}</p>

        {/* Ketiga butir dipisah garis tegak, bukan sekadar jarak. */}
        <dl className="mt-5 flex flex-wrap items-center rounded-lg bg-canvas px-5 py-4 text-sm">
          <div className="flex items-center gap-2 pr-6">
            <Building2 size={16} className="text-muted" aria-hidden />
            <dt className="font-semibold text-navy-900">Vendor:</dt>
            <dd>{kontrak.vendor?.nama ?? "-"}</dd>
          </div>
          <div className="flex items-center gap-2 border-l border-line px-6">
            <Wallet size={16} className="text-muted" aria-hidden />
            <dt className="font-semibold text-navy-900">Nilai Kontrak:</dt>
            <dd>{rupiah(data.nilaiKontrak)}</dd>
          </div>
          <div className="flex items-center gap-2 border-l border-line pl-6">
            <CalendarRange size={16} className="text-muted" aria-hidden />
            <dt className="font-semibold text-navy-900">Periode:</dt>
            <dd>
              {tanggal(kontrak.tanggalMulai)} sampai {tanggal(kontrak.tanggalBerakhir)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {/* Status dibaca dari basis data, bukan ditulis tetap. Sebelumnya
              chip ini selalu berbunyi Berjalan, sehingga kontrak berstatus
              draf tampak seolah sudah terverifikasi. */}
          <ChipStatus status={kontrak.status} />
          {/* Sisa hari dihitung langsung, bukan angka tetap seperti di
              wireframe, supaya selalu benar pada hari apa pun halaman dibuka. */}
          {sisa !== null && sisa >= 0 && sisa <= 30 && (
            <Chip warna="merah">
              <TriangleAlert size={14} aria-hidden /> Perhatian, berakhir dalam {sisa} hari
            </Chip>
          )}
          {versiAktif && versiAktif.versi > 0 && (
            <Chip warna="netral">
              <GitBranch size={14} aria-hidden /> Versi Aktif: Amandemen ke-{versiAktif.versi}
            </Chip>
          )}
        </div>
      </header>

      {kontrak.status === "DRAF" && (
        <p className="mt-4 flex items-start gap-2.5 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-navy-900">
          <FileClock size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <span>
            <strong>Kontrak ini masih draf.</strong> {artiStatus("DRAF")} Selesaikan verifikasinya
            lewat{" "}
            <Link href="/kontrak/unggah" className="font-semibold text-teal-700 hover:underline">
              halaman unggah
            </Link>
            , lalu simpan ke repositori.
          </span>
        </p>
      )}

      <TabsKontrak data={data} />
    </div>
  );
}
