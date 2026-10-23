// Trial urutan dokumen pendukung untuk ditunjukkan ke Pak Rahman (to-do #47 dan #48).
//
// Permintaan Pak Rahman pada bimbingan 9 Oktober 2026: tanggal yang dipakai
// untuk mengurutkan dokumen pendukung adalah tanggal yang TERTULIS DI ISI
// dokumen, bukan tanggal berkas terakhir diedit. Lalu coba dengan 3 sampai 4
// dokumen dan tunjukkan contoh hasilnya.
//
// Yang dikerjakan skrip ini:
//   1. Menyalin 4 PDF sintetis ke folder hasil, lalu mengatur tanggal terakhir
//      diedit tiap salinan dengan urutan yang SENGAJA terbalik dari tanggal di
//      isinya.
//   2. AI membaca tiap dokumen, satu permintaan per dokumen, dengan prompt dan
//      skema yang sama dengan aplikasi.
//   3. Kode aplikasi menentukan urutan, label, dan nilai akhir. Sebagai
//      pembanding, kode yang sama dijalankan seolah-olah memakai tanggal berkas,
//      supaya terlihat apa yang salah bila tanggal berkas yang dipakai.
//   4. Hasilnya ditulis ke halaman HTML sederhana yang bisa dibuka di browser,
//      dicetak, atau disalin ke Word.
//
// Dokumen DP3 yang ada tidak bisa dipakai: TOR IT Ponti.pdf hasil scan tanpa
// teks, sisanya Excel dan Word. Dokumen Pertamina yang asli juga tidak boleh
// lewat OpenRouter gratis. Karena itu trial memakai dokumen sintetis.
//
// Jalankan dari folder vasko:
//   npx tsx --env-file=.env.local scripts/trial-urutan-dokumen.ts --live       (4 permintaan)
//   npx tsx scripts/trial-urutan-dokumen.ts --dari <keluaran-mentah.json>     (tanpa kuota)
// Pilihan: --keluar <folder>, bawaannya ../hasil-trial-urutan-dokumen.
// Berkas --dari boleh dari skrip ini atau dari cek-baca-pendukung.ts, karena
// bacaan AI tidak bergantung pada tanggal berkas.
import { copyFileSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pilihKlien } from "../src/lib/ai";
import {
  olahKeluaran,
  penggunaBacaPendukung,
  sistemBacaPendukung,
  SkemaBacaPendukung,
  type KeluaranBacaPendukung,
  type RincianBacaPendukung,
} from "../src/lib/dokumen/baca-pendukung";
import { labelJenisPendukung } from "../src/lib/dokumen/katalog";
import {
  samaButir,
  tentukanPeran,
  type DokumenUntukPeran,
  type HasilPeran,
  type NilaiEfektif,
} from "../src/lib/dokumen/peran";
import { rangkaiTeks } from "../src/lib/ekstraksi/alur";
import { tanggalPanjang } from "../src/lib/format";
import { bacaKata } from "../src/lib/pdf/kata";
import { untukPeran } from "../src/lib/validasi/siapkan";

const DIR_PENDUKUNG = path.resolve("public", "contoh", "pendukung");

// Dalam tiap pasangan, dokumen yang isinya lebih baru justru berkasnya lebih
// lama diedit. Tanggal di isi: TOR-1 5 Januari, TOR-2 12 Januari, Prebid-1
// 10 Januari, Prebid-2 20 Januari 2026.
const DOKUMEN = [
  { nama: "0142-TOR-1.pdf", diedit: "2026-01-18T09:15:00+07:00" },
  { nama: "0142-TOR-2.pdf", diedit: "2026-01-06T14:40:00+07:00" },
  { nama: "0142-BA-Prebid-1.pdf", diedit: "2026-01-22T10:05:00+07:00" },
  { nama: "0142-BA-Prebid-2.pdf", diedit: "2026-01-11T16:20:00+07:00" },
];

type Simpanan = { model: string; dokumen: { nama: string; keluaran: KeluaranBacaPendukung }[] };

type Bacaan = {
  nama: string;
  diedit: Date;
  rincian: RincianBacaPendukung;
  tanggalDiIsi: Date | null;
  peran: DokumenUntukPeran;
};

type Cara = {
  judul: string;
  /** Sebutan singkat tanggal itu di kalimat hasil, misalnya "tanggal isi". */
  sebutan: string;
  /** Tanggal yang dipakai untuk mengurutkan menurut cara ini. */
  tanggal: (b: Bacaan) => Date | null;
  hasil: { peran: HasilPeran[]; efektif: NilaiEfektif[] };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tgl = (d: Date | null | undefined) => (d ? tanggalPanjang(d) : "tidak terbaca");
const angka = (nilai: number, satuan: string | null) => `${nilai.toLocaleString("id-ID")}${satuan ? ` ${satuan}` : ""}`;

function pilihan(nama: string): string | null {
  const i = process.argv.indexOf(nama);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** Urutan tampilan sama dengan urutan penerapan di peran.ts: tanpa tanggal lebih dulu, lalu menurut tanggal. */
function urutkan(daftar: Bacaan[], tanggal: (b: Bacaan) => Date | null): Bacaan[] {
  return [...daftar].sort((a, b) => {
    const ta = tanggal(a)?.getTime() ?? null;
    const tb = tanggal(b)?.getTime() ?? null;
    if (ta === null && tb !== null) return -1;
    if (ta !== null && tb === null) return 1;
    return (ta ?? 0) - (tb ?? 0);
  });
}

function kelompok(bacaan: Bacaan[]): [string, Bacaan[]][] {
  const peta = new Map<string, Bacaan[]>();
  for (const b of bacaan) {
    const k = b.peran.jenisPendukung ?? "LAINNYA";
    peta.set(k, [...(peta.get(k) ?? []), b]);
  }
  return [...peta.entries()];
}

function teksPeran(p: HasilPeran, anggota: Bacaan[], semua: HasilPeran[], cara: Cara, bacaan: Bacaan[]): string {
  if (p.label === "DIGANTIKAN") {
    const pengganti = bacaan.find((b) => b.nama === p.digantikanOlehId);
    return `Digantikan oleh ${p.digantikanOlehId} (${cara.sebutan} ${tgl(pengganti ? cara.tanggal(pengganti) : null)})`;
  }
  if (p.label === "KOMPLEMENTER") {
    const lain = anggota
      .filter((b) => b.nama !== p.dokumenId && semua.find((x) => x.dokumenId === b.nama)?.label !== "DIGANTIKAN")
      .map((b) => b.nama);
    return `Komplementer, saling melengkapi dengan ${lain.join(", ")}`;
  }
  const diganti = semua.filter((x) => x.label === "DIGANTIKAN" && x.digantikanOlehId === p.dokumenId).map((x) => x.dokumenId);
  return diganti.length
    ? `Utama (tanpa label), menggantikan ${diganti.join(", ")}`
    : "Utama (tanpa label), satu-satunya dokumen sejenis";
}

/** Langkah terbentuknya nilai akhir, misalnya "TOR-1 menetapkan 10 titik, lalu TOR-2 menambah 5 titik". */
function langkahNilai(e: NilaiEfektif, urut: Bacaan[]): string {
  const langkah: string[] = [];
  let sekarang: number | null = null;
  for (const b of urut) {
    for (const p of b.peran.pernyataan) {
      if (p.atribut !== e.atribut || !samaButir(e.butir, p.butir)) continue;
      const nilai = angka(p.nilai, p.satuan);
      if (p.jenis === "NILAI_BARU") {
        const kata = sekarang === null ? "menetapkan" : sekarang === p.nilai ? "menegaskan tetap" : "mengganti menjadi";
        langkah.push(`${b.nama} ${kata} ${nilai}`);
        sekarang = p.nilai;
      } else if (p.jenis === "TAMBAH") {
        langkah.push(`${b.nama} menambah ${nilai}`);
        sekarang = (sekarang ?? 0) + p.nilai;
      } else {
        langkah.push(`${b.nama} mengurangi ${nilai}`);
        sekarang = (sekarang ?? 0) - p.nilai;
      }
    }
  }
  return langkah.join(", lalu ");
}

function catatanNilai(e: NilaiEfektif): string {
  const catatan = [
    e.konflik && "dua dokumen menyebut nilai berbeda pada tanggal yang sama",
    e.tanpaDasar && "ada penambahan atau pengurangan tanpa nilai awal",
    e.tanggalTakPasti && "ikut dipengaruhi dokumen yang tanggalnya tidak terbaca",
  ].filter(Boolean);
  return catatan.length ? ` (perlu dicek: ${catatan.join("; ")})` : "";
}

/** Bagian urutan, label, dan nilai akhir untuk satu cara mengurutkan. */
function bagianCara(cara: Cara, bacaan: Bacaan[]): { html: string; teks: string[] } {
  let html = "";
  const teks: string[] = [];
  for (const [jenis, anggota] of kelompok(bacaan)) {
    const urut = urutkan(anggota, cara.tanggal);
    html += `<h3>${esc(labelJenisPendukung(jenis))}</h3>\n<ol>\n`;
    teks.push(`  ${labelJenisPendukung(jenis)}`);
    for (const b of urut) {
      const p = cara.hasil.peran.find((x) => x.dokumenId === b.nama)!;
      const kalimat = `${b.nama}, ${cara.sebutan} ${tgl(cara.tanggal(b))}: ${teksPeran(p, anggota, cara.hasil.peran, cara, bacaan)}.`;
      html += `<li>${esc(kalimat)}</li>\n`;
      teks.push(`    ${kalimat}`);
    }
    html += "</ol>\n";
    const efektif = cara.hasil.efektif.filter((e) => e.dokumenId.some((id) => anggota.some((b) => b.nama === id)));
    if (efektif.length) {
      html += "<p>Nilai akhir:</p>\n<ul>\n";
      for (const e of efektif) {
        const kalimat = `${e.butir}: ${angka(e.nilai, e.satuan)}. ${langkahNilai(e, urut)}.${catatanNilai(e)}`;
        html += `<li>${esc(kalimat)}</li>\n`;
        teks.push(`    nilai akhir ${kalimat}`);
      }
      html += "</ul>\n";
    }
  }
  return { html, teks };
}

/** Perbedaan hasil pembanding terhadap hasil yang benar, dalam kalimat. */
function perbedaan(benar: Cara, salah: Cara): string[] {
  const beda: string[] = [];
  for (const p of salah.hasil.peran) {
    const q = benar.hasil.peran.find((x) => x.dokumenId === p.dokumenId);
    if (!q || q.label === p.label) continue;
    if (p.label === "DIGANTIKAN") {
      beda.push(`${p.dokumenId} dianggap digantikan oleh ${p.digantikanOlehId}, padahal menurut isinya ${p.dokumenId} yang lebih baru.`);
    } else {
      beda.push(`${p.dokumenId} berlabel ${p.label.toLowerCase()}, seharusnya ${q.label.toLowerCase()}.`);
    }
  }
  for (const e of salah.hasil.efektif) {
    const f = benar.hasil.efektif.find((x) => x.atribut === e.atribut && samaButir(x.butir, e.butir));
    if (f && f.nilai !== e.nilai) {
      beda.push(`Nilai akhir ${e.butir} menjadi ${angka(e.nilai, e.satuan)}, seharusnya ${angka(f.nilai, f.satuan)}.`);
    }
  }
  return beda;
}

async function bacaPdf(jalur: string) {
  const { halaman, kata } = await bacaKata(new Uint8Array(readFileSync(jalur)));
  return { teks: rangkaiTeks(halaman), kata };
}

async function main() {
  const dari = pilihan("--dari");
  if (!dari && !process.argv.includes("--live")) {
    console.error("Skrip ini memanggil model sungguhan (4 permintaan). Tambahkan --live, atau --dari <berkas.json> untuk memakai bacaan yang sudah ada.");
    process.exit(2);
  }
  const keluar = path.resolve(pilihan("--keluar") ?? path.join("..", "hasil-trial-urutan-dokumen"));
  mkdirSync(path.join(keluar, "dokumen"), { recursive: true });

  const simpanan: Simpanan = dari ? JSON.parse(readFileSync(dari, "utf8")) : { model: "", dokumen: [] };
  const klien = dari ? null : pilihKlien();

  const bacaan: Bacaan[] = [];
  for (const d of DOKUMEN) {
    // Salinan dengan tanggal terakhir diedit yang sengaja diatur. Tanggal itu
    // dibaca kembali dari berkas di disk, sama seperti saat diunggah.
    const salinan = path.join(keluar, "dokumen", d.nama);
    copyFileSync(path.join(DIR_PENDUKUNG, d.nama), salinan);
    const waktu = new Date(d.diedit);
    utimesSync(salinan, waktu, waktu);
    const diedit = statSync(salinan).mtime;

    const { teks, kata } = await bacaPdf(salinan);
    let keluaran = simpanan.dokumen.find((x) => x.nama === d.nama)?.keluaran;
    if (!keluaran) {
      if (!klien) throw new Error(`${d.nama} tidak ada di ${dari}.`);
      const jawaban = await klien.selesaikan({
        nama: "dokumen_pendukung",
        sistem: sistemBacaPendukung(),
        pengguna: penggunaBacaPendukung(teks),
        skema: SkemaBacaPendukung,
      });
      keluaran = jawaban.isi;
      simpanan.model = jawaban.model;
      simpanan.dokumen.push({ nama: d.nama, keluaran });
      console.log(`(${d.nama} dibaca model ${jawaban.model}, token ${jawaban.tokenMasuk}/${jawaban.tokenKeluar})`);
    }
    const { rincian, tanggalDiIsi } = olahKeluaran(keluaran, kata);
    const peran = untukPeran(rincian, { id: d.nama, nama: d.nama, jenisPendukung: null, tanggalDiIsi, tanggalEditBerkas: diedit });
    bacaan.push({ nama: d.nama, diedit, rincian, tanggalDiIsi, peran });
  }

  const benar: Cara = {
    judul: "tanggal di isi dokumen",
    sebutan: "tanggal isi",
    tanggal: (b) => b.tanggalDiIsi,
    hasil: tentukanPeran(bacaan.map((b) => b.peran)),
  };
  const pembanding: Cara = {
    judul: "tanggal berkas terakhir diedit",
    sebutan: "diedit",
    tanggal: (b) => b.diedit,
    hasil: tentukanPeran(bacaan.map((b) => ({ ...b.peran, tanggalDiIsi: b.diedit, tanggalEditBerkas: null }))),
  };
  const bagianBenar = bagianCara(benar, bacaan);
  const bagianPembanding = bagianCara(pembanding, bacaan);
  const beda = perbedaan(benar, pembanding);
  const tanpaTanggal = bacaan.filter((b) => !b.tanggalDiIsi).map((b) => b.nama);
  // Jawaban dari server AI palsu atau klien tiruan tidak boleh tertukar dengan hasil trial sungguhan.
  const tiruan = /tiruan/i.test(simpanan.model);

  // ---------------------------------------------------------------- HTML
  const baris = bacaan
    .map(
      (b, i) =>
        `<tr><td>${i + 1}</td><td>${esc(b.nama)}</td><td>${esc(labelJenisPendukung(b.rincian.jenis))}</td>` +
        `<td>${esc(tgl(b.diedit))}</td><td>${esc(tgl(b.tanggalDiIsi))}</td><td>${esc(b.rincian.tanggalDokumenTeks ?? "")}</td></tr>`
    )
    .join("\n");
  const JENIS_KATA = { NILAI_BARU: "menetapkan nilai", TAMBAH: "menambah", KURANG: "mengurangi" } as const;
  const barisIsi = bacaan
    .flatMap((b) =>
      b.rincian.pernyataan.map(
        (p) =>
          `<tr><td>${esc(b.nama)}</td><td>${esc(p.kutipan)}</td>` +
          `<td>${esc(`${p.butir}: ${JENIS_KATA[p.jenis]} ${angka(p.nilai, p.satuan)}`)}${p.terverifikasi ? "" : " (tidak ditemukan di PDF, tidak dihitung)"}</td></tr>`
      )
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="author" content="Tim POKBAI">
<title>Contoh hasil trial urutan dokumen pendukung</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; max-width: 960px; margin: 32px auto; padding: 0 16px; line-height: 1.5; font-size: 15px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; }
  h3 { font-size: 16px; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: top; font-weight: normal; }
  em, i { font-style: normal; }
</style>
</head>
<body>
<h1>Contoh hasil trial: AI mengurutkan dokumen pendukung</h1>
${tiruan ? "<p>PERHATIAN: halaman ini dibuat dari jawaban AI tiruan untuk memeriksa tampilan. Ini BUKAN hasil trial sungguhan dan jangan ditunjukkan sebagai hasil AI.</p>\n" : ""}<p>Tanggal trial: ${esc(tanggalPanjang(new Date()))}. Model AI: ${esc(simpanan.model || "tidak diketahui")}. Jumlah dokumen: ${bacaan.length}.</p>

<h2>Yang diuji</h2>
<p>Untuk dokumen pendukung yang dobel, urutan dokumen ditentukan dari tanggal yang tertulis di isi dokumen, bukan dari tanggal berkas terakhir diedit. AI membaca tanggal dan isi setiap dokumen. Program yang menentukan urutan, label, dan nilai akhir.</p>
<p>Untuk membuktikannya, tanggal terakhir diedit keempat berkas sengaja dibuat terbalik: dalam tiap pasangan, dokumen yang isinya lebih baru justru berkasnya lebih lama diedit.</p>

<h2>1. Tanggal yang dibaca</h2>
<table>
<tr><th>No</th><th>Dokumen</th><th>Jenis menurut AI</th><th>Terakhir diedit (berkas)</th><th>Tanggal di isi dokumen (dibaca AI)</th><th>Teks tanggal yang disalin AI</th></tr>
${baris}
</table>

<h2>2. Isi yang dibaca AI</h2>
<p>Kalimat di kolom tengah disalin AI apa adanya dari dokumen, lalu dicocokkan kembali ke teks PDF.</p>
<table>
<tr><th>Dokumen</th><th>Kalimat di dokumen</th><th>Dibaca sebagai</th></tr>
${barisIsi}
</table>

<h2>3. Urutan, label, dan nilai akhir (memakai tanggal di isi dokumen)</h2>
${bagianBenar.html}
<h2>4. Pembanding: bila yang dipakai tanggal berkas terakhir diedit</h2>
${bagianPembanding.html}
<p>${beda.length ? "Hasil pembanding ini salah:" : "Pada dokumen ini, hasil pembanding kebetulan sama dengan hasil yang benar."}</p>
${beda.length ? `<ul>\n${beda.map((s) => `<li>${esc(s)}</li>`).join("\n")}\n</ul>` : ""}

<h2>Catatan</h2>
<ul>
<li>Dokumen yang dipakai adalah dokumen sintetis yang disusun tim, isinya fiktif. Dokumen di folder DP3 tidak bisa dipakai: TOR IT Ponti.pdf hasil scan tanpa teks, sedangkan BOQ, EE, dan Evaluasi Teknis berbentuk Excel dan Word.</li>
<li>Tanggal berkas terakhir diedit hanya dipakai bila tanggal di isi dua dokumen sama persis.</li>
<li>AI hanya membaca dan menyalin. Urutan, label, dan perhitungan nilai dikerjakan program, jadi bacaan yang sama selalu menghasilkan urutan yang sama.</li>
<li>Setiap kutipan dari AI dicocokkan kembali ke teks PDF. Pernyataan yang kutipannya tidak ditemukan tidak ikut dihitung.</li>
${tanpaTanggal.length ? `<li>Tanggal di isi ${esc(tanpaTanggal.join(", "))} tidak terbaca, sehingga urutannya tidak bisa dipastikan.</li>\n` : ""}</ul>
</body>
</html>
`;

  const berkasHtml = path.join(keluar, "hasil-trial-urutan-dokumen.html");
  writeFileSync(berkasHtml, html, "utf8");
  if (!dari) writeFileSync(path.join(keluar, "keluaran-mentah-ai.json"), JSON.stringify(simpanan, null, 1));

  // -------------------------------------------------------------- konsol
  console.log("\nTanggal yang dibaca:");
  for (const b of bacaan) {
    console.log(`  ${b.nama.padEnd(22)} diedit ${tgl(b.diedit).padEnd(18)} isi ${tgl(b.tanggalDiIsi).padEnd(18)} "${b.rincian.tanggalDokumenTeks ?? ""}"`);
  }
  console.log(`\nMemakai ${benar.judul}:`);
  for (const t of bagianBenar.teks) console.log(t);
  console.log(`\nPembanding, memakai ${pembanding.judul}:`);
  for (const t of bagianPembanding.teks) console.log(t);
  for (const s of beda) console.log(`  SALAH: ${s}`);
  if (tiruan) console.log("\nPERHATIAN: jawaban berasal dari AI tiruan. Halaman ini hanya untuk memeriksa tampilan, bukan hasil trial.");
  console.log(`\nHalaman hasil: ${berkasHtml}`);
  console.log(`Salinan PDF dengan tanggal diedit yang diatur: ${path.join(keluar, "dokumen")}`);
  if (!dari) console.log(`Keluaran mentah model: ${path.join(keluar, "keluaran-mentah-ai.json")} (ulangi tanpa kuota dengan --dari)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
