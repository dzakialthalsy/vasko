// Diagnosis baca dokumen pendukung dengan MODEL SUNGGUHAN, tanpa basis data.
//
// Membaca beberapa PDF pendukung sintetis (bawaan: TOR-1, TOR-2, Prebid-1,
// Prebid-2), satu permintaan AI per dokumen, dengan prompt dan skema yang sama
// persis dengan aplikasi. Lalu dicetak: isi rincian yang akan disimpan, peran
// tiap dokumen, nilai efektif tiap butir, dan ketetapan yang akan diperiksa
// terhadap kontrak. Semua langkah sesudah panggilan AI memakai kode aplikasi
// apa adanya.
//
// Dengan --klausul, ketetapan itu juga diperiksa ke teks kontrak KTR/2026/0142
// (satu permintaan lagi), seperti pemeriksaan KLAUSUL_BERTENTANGAN pada validasi.
//
// Keluaran mentah model disimpan ke berkas JSON di folder sementara. Analisis
// bisa diulang dari berkas itu tanpa memanggil AI lagi: --dari <berkas.json>
//
// HANYA untuk dokumen sintetis di public/contoh. Jalur OpenRouter gratis boleh
// memakai data yang dikirim ke sana.
//
// Jalankan:
//   npx tsx --env-file=.env.local scripts/cek-baca-pendukung.ts --live
//   npx tsx --env-file=.env.local scripts/cek-baca-pendukung.ts --live --klausul
//   npx tsx scripts/cek-baca-pendukung.ts --dari <berkas.json>
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pilihKlien } from "../src/lib/ai";
import {
  olahKeluaran,
  penggunaBacaPendukung,
  sistemBacaPendukung,
  SkemaBacaPendukung,
  type KeluaranBacaPendukung,
} from "../src/lib/dokumen/baca-pendukung";
import { tentukanPeran } from "../src/lib/dokumen/peran";
import { rangkaiTeks } from "../src/lib/ekstraksi/alur";
import { bacaKata } from "../src/lib/pdf/kata";
import {
  olahPenyebutan,
  periksaKlausul,
  pilihKetetapan,
  type KeluaranPeriksaKlausul,
} from "../src/lib/validasi/periksa-klausul";
import { untukPeran } from "../src/lib/validasi/siapkan";

const DIR_PENDUKUNG = path.resolve("public", "contoh", "pendukung");
const KONTRAK = path.resolve("public", "contoh", "KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf");
const BAWAAN = ["0142-TOR-1.pdf", "0142-TOR-2.pdf", "0142-BA-Prebid-1.pdf", "0142-BA-Prebid-2.pdf"];

type Simpanan = {
  model: string;
  dokumen: { nama: string; keluaran: KeluaranBacaPendukung }[];
  klausul?: KeluaranPeriksaKlausul;
};

async function bacaPdf(jalur: string) {
  const { halaman, kata } = await bacaKata(new Uint8Array(readFileSync(jalur)));
  return { teks: rangkaiTeks(halaman), kata };
}

async function main() {
  const argumen = process.argv.slice(2);
  const iDari = argumen.indexOf("--dari");
  const dari = iDari >= 0 ? argumen[iDari + 1] : null;
  const denganKlausul = argumen.includes("--klausul");
  if (!dari && !argumen.includes("--live")) {
    console.error("Skrip ini memanggil model sungguhan dan memakan kuota. Tambahkan --live, atau --dari <berkas.json>.");
    process.exit(2);
  }
  const nama = argumen.filter((a, i) => a.endsWith(".pdf") && argumen[i - 1] !== "--dari");
  const daftar = nama.length > 0 ? nama : BAWAAN;

  const simpanan: Simpanan = dari ? JSON.parse(readFileSync(dari, "utf8")) : { model: "", dokumen: [] };
  const klien = dari ? null : pilihKlien();
  if (klien) console.log(`Model: ${klien.nama}. ${daftar.length} permintaan${denganKlausul ? " ditambah 1 untuk klausul" : ""}.\n`);

  // ------------------------------------------------ baca tiap dokumen
  const masukanPeran = [];
  const namaDokumen = new Map<string, string>();
  for (const n of daftar) {
    const { teks, kata } = await bacaPdf(path.join(DIR_PENDUKUNG, n));
    let keluaran = simpanan.dokumen.find((d) => d.nama === n)?.keluaran;
    if (!keluaran) {
      if (!klien) throw new Error(`${n} tidak ada di ${dari}.`);
      const t0 = Date.now();
      const jawaban = await klien.selesaikan({
        nama: "dokumen_pendukung",
        sistem: sistemBacaPendukung(),
        pengguna: penggunaBacaPendukung(teks),
        skema: SkemaBacaPendukung,
      });
      keluaran = jawaban.isi;
      simpanan.model = jawaban.model;
      simpanan.dokumen.push({ nama: n, keluaran });
      console.log(`(${n}: ${Math.round((Date.now() - t0) / 1000)} detik, token ${jawaban.tokenMasuk}/${jawaban.tokenKeluar})`);
    }

    const { rincian, tanggalDiIsi } = olahKeluaran(keluaran, kata);
    console.log(`\n${n}`);
    console.log(`  jenis ${rincian.jenis}, judul "${rincian.judul ?? ""}", nomor "${rincian.nomorDokumen ?? ""}"`);
    console.log(`  tanggal "${rincian.tanggalDokumenTeks ?? ""}" -> ${tanggalDiIsi?.toISOString().slice(0, 10) ?? "TIDAK TERBACA"}`);
    for (const f of rincian.fakta) {
      console.log(`  fakta      ${f.terverifikasi ? "terverifikasi" : "TIDAK DITEMUKAN"} ${f.kunci} = "${f.nilai}"`);
    }
    for (const p of rincian.pernyataan) {
      console.log(
        `  pernyataan ${p.terverifikasi ? "terverifikasi" : "TIDAK DITEMUKAN"} butir "${p.butir}" | ${p.atribut} | ${p.jenis} | ${p.nilai}${p.satuan ? ` ${p.satuan}` : ""}`
      );
      console.log(`             kutipan "${p.kutipan.slice(0, 140)}"`);
    }
    for (const b of rincian.dibuang) console.log(`  dibuang    ${b.alasan}: ${b.isi.slice(0, 140)}`);

    namaDokumen.set(n, n);
    masukanPeran.push(untukPeran(rincian, { id: n, nama: n, jenisPendukung: null, tanggalDiIsi, tanggalEditBerkas: null }));
  }

  // --------------------------------------- peran dan nilai efektif (kode)
  const { peran, efektif } = tentukanPeran(masukanPeran);
  console.log("\nPeran dokumen (kode aplikasi):");
  for (const p of peran) console.log(`  ${p.dokumenId.padEnd(24)} ${p.label.padEnd(13)} ${p.alasan}`);

  console.log("\nNilai efektif tiap butir:");
  for (const e of efektif) {
    const tanda = [e.konflik && "KONFLIK", e.tanpaDasar && "tanpa dasar", e.tanggalTakPasti && "tanggal tak pasti"].filter(Boolean).join(", ");
    console.log(`  "${e.butir}" ${e.atribut} = ${e.nilai}${e.satuan ? ` ${e.satuan}` : ""}  dari ${e.dokumenId.join(", ")}${tanda ? `  [${tanda}]` : ""}`);
  }

  const label = new Map(peran.map((p) => [p.dokumenId, p.label]));
  const ketetapan = pilihKetetapan(
    efektif.filter((e) => e.dokumenId.some((id) => label.get(id) !== "DIGANTIKAN")),
    namaDokumen
  );
  console.log("\nKetetapan yang akan diperiksa ke kontrak:");
  if (ketetapan.length === 0) console.log("  (kosong, pemeriksaan klausul akan dilewati)");
  for (const k of ketetapan) console.log(`  ${k.id}. ${k.butir} (${k.atribut}) = ${k.nilai}${k.satuan ? ` ${k.satuan}` : ""}`);

  // ------------------------------------------- pemeriksaan klausul (opsional)
  if ((denganKlausul || simpanan.klausul) && ketetapan.length > 0) {
    const { teks, kata } = await bacaPdf(KONTRAK);
    const sumber = [{ dokumenId: "kontrak", nama: path.basename(KONTRAK), kata }];
    let hasil;
    if (simpanan.klausul) {
      hasil = olahPenyebutan(simpanan.klausul, ketetapan, sumber);
    } else if (klien) {
      const r = await periksaKlausul({ klien, ketetapan, teksKontrak: teks, sumber });
      simpanan.klausul = r.jawaban.isi;
      hasil = r.hasil;
    }
    if (hasil) {
      console.log("\nPemeriksaan klausul:");
      for (const p of simpanan.klausul?.penyebutan ?? []) {
        console.log(`  model: ${p.rujukan} angka "${p.angka_di_kontrak}" kutipan "${p.kutipan_kontrak.slice(0, 120)}"`);
      }
      console.log(`  ${hasil.cocok} cocok, ${hasil.temuan.length} bertentangan, ${hasil.dibuang.length} dibuang`);
      for (const t of hasil.temuan) console.log(`  TEMUAN ${t.uraian}`);
      for (const d of hasil.dibuang) console.log(`  dibuang ${d.alasan}: ${d.isi}`);
    }
  }

  if (!dari) {
    const berkas = path.join(tmpdir(), `vasko-cek-baca-pendukung-${Date.now()}.json`);
    writeFileSync(berkas, JSON.stringify(simpanan, null, 1));
    console.log(`\nKeluaran mentah model disimpan di ${berkas}`);
    console.log(`Ulangi analisis tanpa AI: npx tsx scripts/cek-baca-pendukung.ts --dari "${berkas}"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
