import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { simpanKontrak, type MedanMasuk, type TerminMasuk } from "@/lib/ekstraksi/simpan";
import { keSlug } from "@/lib/ekstraksi/urai";
import { MEDAN } from "@/lib/ekstraksi/medan";

export const runtime = "nodejs";
export const maxDuration = 60;

// Berkas PDF disimpan DI LUAR public, lalu dilayani lewat rute tersendiri.
// Menaruhnya di public berarti siapa pun yang menebak nama berkas dapat
// mengunduh kontrak tanpa melewati kendali akses.
const DIR_BERKAS = path.join(process.cwd(), "data", "kontrak");

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ galat: "Badan permintaan bukan form-data yang sah." }, { status: 400 });
  }

  const muatan = form.get("hasil");
  const berkas = form.get("berkas");

  if (typeof muatan !== "string") {
    return NextResponse.json({ galat: "Data hasil ekstraksi belum disertakan." }, { status: 400 });
  }

  let isi: {
    namaBerkas?: string;
    jumlahHalaman?: number;
    model?: string;
    medan?: MedanMasuk[];
    termin?: TerminMasuk[];
    status?: "DRAF" | "BERJALAN";
  };
  try {
    isi = JSON.parse(muatan);
  } catch {
    return NextResponse.json({ galat: "Data hasil ekstraksi bukan JSON yang sah." }, { status: 400 });
  }

  const medan = isi.medan ?? [];
  const status = isi.status === "BERJALAN" ? "BERJALAN" : "DRAF";

  // Penjaga sisi server. Antarmuka memang mematikan tombolnya, tetapi
  // permintaan dapat dikirim langsung tanpa lewat antarmuka, jadi aturannya
  // ditegakkan di sini juga.
  if (status === "BERJALAN") {
    const wajib = new Set(MEDAN.filter((m) => m.wajibKonfirmasi).map((m) => m.kunci));
    const belum = medan.filter((m) => wajib.has(m.kunci) && !m.dikonfirmasi);
    if (belum.length > 0) {
      return NextResponse.json(
        {
          galat: `Masih ada ${belum.length} medan wajib yang belum dikonfirmasi. Simpan sebagai draf, atau konfirmasi seluruhnya lebih dulu.`,
        },
        { status: 422 }
      );
    }
  }

  try {
    const hasil = await simpanKontrak({
      namaBerkas: isi.namaBerkas ?? "tanpa-nama.pdf",
      jumlahHalaman: isi.jumlahHalaman ?? 0,
      model: isi.model ?? "tidak diketahui",
      medan,
      termin: isi.termin ?? [],
      status,
    });

    // Berkas disimpan setelah basis data berhasil, supaya tidak ada PDF
    // yatim tanpa catatan kontraknya.
    if (berkas instanceof File) {
      await mkdir(DIR_BERKAS, { recursive: true });
      const tujuan = path.join(DIR_BERKAS, `${keSlug(hasil.nomor)}.pdf`);
      await writeFile(tujuan, Buffer.from(await berkas.arrayBuffer()));
    }

    return NextResponse.json({
      nomor: hasil.nomor,
      judul: hasil.judul,
      baru: hasil.baru,
      status,
      slug: keSlug(hasil.nomor),
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("Penyimpanan kontrak gagal:", pesan);
    return NextResponse.json({ galat: pesan }, { status: 500 });
  }
}
