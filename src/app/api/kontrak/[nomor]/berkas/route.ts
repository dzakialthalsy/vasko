import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DIR_BERKAS = path.join(process.cwd(), "data", "kontrak");

// Melayani PDF kontrak yang tersimpan di luar public.
//
// Nama berkas TIDAK diambil dari parameter URL, melainkan dibentuk ulang dari
// nomor kontrak yang ditemukan di basis data. Dengan begitu jalur seperti
// ../../.env tidak dapat menembus keluar direktori, karena parameter hanya
// dipakai sebagai kunci pencarian, bukan sebagai bagian jalur berkas.
export async function GET(_req: Request, { params }: RouteContext<"/api/kontrak/[nomor]/berkas">) {
  const { nomor } = await params;
  const dicari = decodeURIComponent(nomor).replaceAll("-", "/");

  const kontrak = await prisma.kontrak.findUnique({
    where: { nomor: dicari },
    select: { nomor: true, namaBerkas: true },
  });
  if (!kontrak) {
    return NextResponse.json({ galat: "Kontrak tidak ditemukan." }, { status: 404 });
  }

  const aman = kontrak.nomor.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  try {
    const isi = await readFile(path.join(DIR_BERKAS, `${aman}.pdf`));
    return new NextResponse(new Uint8Array(isi), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${kontrak.namaBerkas ?? aman + ".pdf"}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { galat: "Berkas PDF kontrak ini belum tersimpan di server." },
      { status: 404 }
    );
  }
}
