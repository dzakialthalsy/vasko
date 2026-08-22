import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupiah, tanggal, sisaHari } from "@/lib/format";
import { Kartu, Chip } from "@/components/ui/Kartu";
import { ChipStatus } from "@/components/ui/StatusKontrak";
import { TombolUnggah } from "./TombolUnggah";

export const dynamic = "force-dynamic";

/** Nomor kontrak memuat garis miring, jadi diubah jadi tanda hubung di URL. */
export function keSlug(nomor: string) {
  return nomor.replaceAll("/", "-");
}

export default async function HalamanDaftarKontrak() {
  const kontrak = await prisma.kontrak.findMany({
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">Kontrak</h1>
          <p className="text-sm text-muted">
            Repositori kontrak beserta status pelaksanaannya
          </p>
        </div>
        <TombolUnggah />
      </div>

      <Kartu>
        {kontrak.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Belum ada kontrak. Jalankan skrip seed atau unggah dokumen kontrak.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Nomor", "Pekerjaan", "Vendor", "Nilai", "Berakhir", "Status"].map((h) => (
                    <th
                      key={h}
                      className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kontrak.map((k) => {
                  const sisa = k.tanggalBerakhir ? sisaHari(k.tanggalBerakhir) : null;
                  return (
                    <tr key={k.id} className="border-b border-line last:border-0">
                      <td className="py-3.5 pr-4">
                        <Link
                          href={`/kontrak/${keSlug(k.nomor)}`}
                          className="inline-flex items-center gap-2 font-mono font-semibold text-teal-700 hover:underline"
                        >
                          <FileText size={15} aria-hidden />
                          {k.nomor}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-4 text-navy-900">{k.judul}</td>
                      <td className="py-3.5 pr-4 text-navy-900/80">{k.vendor?.nama ?? "-"}</td>
                      <td className="py-3.5 pr-4">{rupiah(Number(k.nilaiKontrak ?? 0))}</td>
                      <td className="py-3.5 pr-4">{tanggal(k.tanggalBerakhir)}</td>
                      <td className="py-3.5">
                        {/* Status kontrak dan peringatan tenggat adalah dua hal
                            berbeda. Draf yang mendekati tenggat harus tetap
                            terlihat sebagai draf. */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChipStatus status={k.status} />
                          {k.status === "BERJALAN" && sisa !== null && sisa >= 0 && sisa <= 30 && (
                            <Chip warna="amber">{sisa} hari lagi</Chip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>
    </div>
  );
}
