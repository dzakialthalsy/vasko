// Uji akurasi fitur AI Document Extraction, memenuhi baris berjudul sama
// pada Tabel 3.6 Rencana Pengujian Internal. Kriteria lulusnya: akurasi
// diukur PER MEDAN terhadap kumpulan kontrak contoh.
//
// Uji ini benar-benar memanggil model, jadi memakan kuota API.
// Jalankan: npx tsx --env-file=.env.local scripts/uji-ekstraksi.ts
import fs from "node:fs";
import path from "node:path";
import { jalankanEkstraksi } from "../src/lib/ekstraksi/alur";
import { uraiTanggal, uraiRupiah } from "../src/lib/ekstraksi/urai";

// Dokumen uji dapat dipilih lewat argumen, sehingga satu skrip melayani
// dokumen mudah maupun dokumen sulit:
//   npx tsx --env-file=.env.local scripts/uji-ekstraksi.ts             mudah
//   npx tsx --env-file=.env.local scripts/uji-ekstraksi.ts sulit       sulit
//   npx tsx --env-file=.env.local scripts/uji-ekstraksi.ts oclc        format template OCLC 01
const BERKAS: Record<string, { pdf: string; kunci: string }> = {
  mudah: {
    pdf: "public/contoh/KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf",
    kunci: "public/contoh/KTR-2026-0142.kunci.json",
  },
  sulit: {
    pdf: "public/contoh/KTR-2026-0163-Konstruksi-Tangki-Timbun-Samarinda.pdf",
    kunci: "public/contoh/KTR-2026-0163.kunci.json",
  },
  oclc: {
    pdf: "public/contoh/KTR-2026-0187-Pemeliharaan-Perpipaan-FT-Samarinda.pdf",
    kunci: "public/contoh/KTR-2026-0187.kunci.json",
  },
};

const pilihan = process.argv[2] ?? "mudah";
const set = BERKAS[pilihan];
if (!set) {
  console.error(`Dokumen "${pilihan}" tidak dikenal. Pilih: ${Object.keys(BERKAS).join(", ")}`);
  process.exit(1);
}
const PDF = path.resolve(set.pdf);
const KUNCI = path.resolve(set.kunci);

const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Tiga tingkat kecocokan, bukan sekadar benar atau salah.
 *
 * Sebelumnya perbandingan memakai includes dua arah, sehingga "minimal 42%"
 * dan uraian panjang dari lampiran ikut dihitung benar padahal keduanya bukan
 * nilai yang diminta. Selisih semacam itu harus terlihat, karena yang masuk
 * basis data adalah untai apa adanya.
 */
function nilaiKecocokan(dapat: string | null, harap: string): "TEPAT" | "DEKAT" | "SALAH" {
  if (!dapat) return "SALAH";
  if (n(dapat) === n(harap)) return "TEPAT";
  if (n(dapat).includes(n(harap)) || n(harap).includes(n(dapat))) return "DEKAT";
  return "SALAH";
}

async function main() {
  const berkasKunci = JSON.parse(fs.readFileSync(KUNCI, "utf8")) as {
    medan: Record<string, string>;
    termin: { urutan: number; nilai: string; jatuh_tempo: string }[];
  };
  const kunci = berkasKunci.medan;
  const kunciTermin = berkasKunci.termin ?? [];
  const data = new Uint8Array(fs.readFileSync(PDF));

  const h = await jalankanEkstraksi(data, { izinkanTiruan: true });

  console.log(`Model     : ${h.model}${h.tiruan ? "  (TIRUAN, bukan hasil model)" : ""}`);
  if (h.tiruan) console.log(`Alasan    : ${h.alasanTiruan}`);
  console.log(`Token     : ${h.tokenMasukan} masuk, ${h.tokenKeluaran} keluar`);
  console.log(`Durasi    : ${(h.durasiMs / 1000).toFixed(1)} detik`);
  console.log(`Halaman   : ${h.halaman.length}\n`);

  let tepat = 0;
  let dekat = 0;
  let bersorot = 0;
  let total = 0;
  let baruTanpaSorotan = 0;
  for (const m of h.medan) {
    const harap: string | undefined = kunci[m.kunci];

    // Medan yang ditambahkan sesudah kunci ini ditulis berisi frasa dari pasal,
    // bukan nilai pendek, dan hasil tafsirannya yang penting. Itu diperiksa di
    // scripts/uji-live.ts terhadap baris kontrak yang tersimpan.
    if (harap === undefined) {
      console.log(`  BARU  ${m.label.padEnd(22)} ${(m.keyakinan * 100).toFixed(0).padStart(3)}%  hal ${String(m.halaman ?? "-").padStart(2)}  ${JSON.stringify(m.nilai)}`);
      // Tetap wajib punya sorotan bila berisi nilai.
      if (m.nilai && !(m.kotak.length > 0 && m.halaman !== null)) {
        console.log("         nilai ada tetapi sorotan tidak terpasang");
        baruTanpaSorotan++;
      }
      continue;
    }

    total++;
    const tingkat = nilaiKecocokan(m.nilai, harap);
    const sorotOk = m.kotak.length > 0 && m.halaman !== null;
    if (tingkat === "TEPAT") tepat++;
    if (tingkat === "DEKAT") dekat++;
    if (sorotOk) bersorot++;

    console.log(
      `  ${tingkat.padEnd(5)} ${m.label.padEnd(22)} ` +
        `${(m.keyakinan * 100).toFixed(0).padStart(3)}%  ` +
        `hal ${String(m.halaman ?? "-").padStart(2)}  ` +
        `${m.wajibKonfirmasi ? "wajib konfirmasi" : "otomatis        "}  ` +
        `${JSON.stringify(m.nilai)}`
    );
    if (tingkat !== "TEPAT") console.log(`         harap: ${JSON.stringify(harap)}`);
  }

  const wajib = h.medan.filter((m) => m.wajibKonfirmasi).length;
  console.log(`\nTepat              : ${tepat}/${total} medan`);
  console.log(`Dekat tapi meleset : ${dekat}/${total} medan`);
  console.log(`Sorotan terpasang  : ${bersorot}/${total} medan`);
  console.log(`Menunggu konfirmasi: ${wajib} dari ${total} medan`);

  // Kriteria lulus menuntut TEPAT, bukan sekadar mendekati. Yang tersimpan
  // ke basis data adalah untai apa adanya, jadi "minimal 42%" bukan jawaban
  // yang bisa diterima untuk medan yang seharusnya berisi "42%".
  // --- Rincian termin ---
  console.log("\nRincian termin:");
  const t = h.termin;
  const cekTermin: [string, boolean, string][] = [];

  cekTermin.push([
    "jumlah baris termin",
    t.length === kunciTermin.length,
    `${t.length} baris, harap ${kunciTermin.length}`,
  ]);

  let nilaiTepat = 0;
  let tanggalTepat = 0;
  for (const [i, harap] of kunciTermin.entries()) {
    const dapat = t[i];
    if (!dapat) continue;
    // Nominal juga dibandingkan sebagai ANGKA, bukan untai. Dokumen menulis
    // "Rp1.860.000.000,00" sementara kunci menulis "Rp1.860.000.000". Nilainya
    // sama, dan angka itulah yang tersimpan ke basis data serta dipakai
    // menghitung denda.
    if (dapat.nilai !== null && dapat.nilai === uraiRupiah(harap.nilai)) nilaiTepat++;
    // Tanggal dibandingkan setelah diurai, bukan sebagai untai. Dokumen
    // menulis "09 Agustus 2026" sementara kunci menulis "9 Agustus 2026";
    // keduanya tanggal yang sama, dan yang tersimpan ke basis data adalah
    // hasil penguraiannya.
    const tglDapat = dapat.jatuhTempo?.toISOString() ?? null;
    const tglHarap = uraiTanggal(harap.jatuh_tempo)?.toISOString() ?? null;
    if (tglDapat !== null && tglDapat === tglHarap) tanggalTepat++;
  }
  cekTermin.push(["nominal tiap termin tepat", nilaiTepat === kunciTermin.length, `${nilaiTepat}/${kunciTermin.length}`]);
  cekTermin.push(["tanggal jatuh tempo tepat", tanggalTepat === kunciTermin.length, `${tanggalTepat}/${kunciTermin.length}`]);

  // Pemeriksaan aritmetika adalah penjaga mutu utama rincian termin.
  cekTermin.push([
    "jumlah termin sama dengan nilai kontrak",
    h.periksaTermin.seimbang,
    h.periksaTermin.catatan,
  ]);

  let gagalTermin = 0;
  for (const [nama, ok, catatan] of cekTermin) {
    if (!ok) gagalTermin++;
    console.log(`  ${ok ? "OK   " : "GAGAL"} ${nama.padEnd(40)} ${catatan}`);
  }

  const lulus = tepat === total && bersorot === total && baruTanpaSorotan === 0 && gagalTermin === 0;
  console.log(lulus ? "\nUji akurasi ekstraksi LULUS." : "\nUji akurasi ekstraksi GAGAL.");
  process.exit(lulus ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
