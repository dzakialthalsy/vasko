import { NextResponse } from "next/server";
import { bacaBerkas } from "@/lib/penyimpanan";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Melayani PDF kontrak yang tersimpan di luar public.
//
// Letak berkas TIDAK diambil dari parameter URL, melainkan dari baris
// dokumen di basis data. Parameter hanya dipakai sebagai kunci pencarian
// kontrak. Dengan begitu jalur seperti ../../.env tidak dapat menembus keluar
// dari folder data, dan bacaBerkas() menolak jalur di luar folder itu lagi.
//
// Yang dilayani adalah berkas kontrak TERBARU. Versi lama yang pernah
// diunggah tetap tersimpan, tetapi tidak dilayani lewat rute ini.
export async function GET(_req: Request, { params }: RouteContext<"/api/kontrak/[nomor]/berkas">) {
  const { nomor } = await params;
  const dicari = decodeURIComponent(nomor).replaceAll("-", "/");

  const dokumen = await prisma.dokumen.findFirst({
    where: { jenis: "KONTRAK", kontrak: { nomor: dicari } },
    orderBy: { diunggahPada: "desc" },
    select: { namaBerkas: true, lokasiSimpan: true },
  });
  if (!dokumen) {
    return NextResponse.json({ galat: "Kontrak atau berkasnya tidak ditemukan." }, { status: 404 });
  }

  try {
    const isi = await bacaBerkas(dokumen.lokasiSimpan);
    return new NextResponse(new Uint8Array(isi), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${dokumen.namaBerkas.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ galat: "Berkas PDF kontrak ini belum tersimpan di server." }, { status: 404 });
  }
}
