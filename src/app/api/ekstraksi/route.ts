import { NextResponse } from "next/server";
import { jalankanEkstraksi } from "@/lib/ekstraksi/alur";

// pdf.js dan SDK Anthropic menuntut runtime Node, bukan Edge.
export const runtime = "nodejs";
// Ekstraksi dokumen panjang bisa memakan waktu lebih dari batas bawaan.
export const maxDuration = 120;

const BATAS_BYTE = 25 * 1024 * 1024;

export async function POST(req: Request) {
  let berkas: File | null = null;

  try {
    const form = await req.formData();
    const f = form.get("berkas");
    if (f instanceof File) berkas = f;
  } catch {
    return NextResponse.json({ galat: "Badan permintaan bukan form-data yang sah." }, { status: 400 });
  }

  if (!berkas) {
    return NextResponse.json({ galat: "Berkas belum disertakan." }, { status: 400 });
  }
  if (berkas.size > BATAS_BYTE) {
    return NextResponse.json(
      { galat: `Ukuran berkas melebihi batas ${BATAS_BYTE / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const data = new Uint8Array(await berkas.arrayBuffer());

  // Pemeriksaan tanda tangan berkas, bukan sekadar percaya pada akhiran nama
  // atau pada tipe MIME yang dikirim peramban.
  const tandaTangan = String.fromCharCode(...data.slice(0, 5));
  if (tandaTangan !== "%PDF-") {
    return NextResponse.json({ galat: "Berkas bukan dokumen PDF yang sah." }, { status: 415 });
  }

  try {
    const hasil = await jalankanEkstraksi(data, { izinkanTiruan: true });
    return NextResponse.json({
      namaBerkas: berkas.name,
      ukuran: berkas.size,
      ...hasil,
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("Ekstraksi gagal:", pesan);
    return NextResponse.json({ galat: `Ekstraksi gagal. ${pesan}` }, { status: 500 });
  }
}
