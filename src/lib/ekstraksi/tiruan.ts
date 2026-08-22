// Pengekstrak tiruan, dipakai HANYA ketika API model tidak dapat dihubungi,
// misalnya saat kredit habis atau saat mengembangkan antarmuka tanpa perlu
// membakar kuota.
//
// Perhatian, ini disengaja dibuat jujur:
//   - Hasilnya selalu menandai diri dengan model "tiruan", sehingga antarmuka
//     dapat menampilkan peringatan dan tidak ada yang salah mengira ini
//     keluaran AI sungguhan.
//   - Cara kerjanya pencocokan pola tetap, bukan pemahaman bahasa. Ia akan
//     gagal pada kontrak dengan susunan kalimat berbeda, dan memang harus
//     begitu, supaya keterbatasannya kelihatan.

import type { HasilEkstraksiModel } from "./penyedia";
import type { TerminMentah } from "./termin";

type Pola = { kunci: string; re: RegExp; ambil?: (m: RegExpMatchArray) => string };

const POLA: Pola[] = [
  { kunci: "nomor_kontrak", re: /Nomor:\s*([A-Z]{2,4}\/\d{4}\/\d{3,5})/i },
  {
    kunci: "nama_vendor",
    re: /PIHAK KEDUA,\s*(PT [A-Za-z ]+?),\s*suatu perseroan/i,
  },
  {
    kunci: "nilai_kontrak",
    re: /sebesar\s+(Rp[\d.]+)\s*,-\s*\(/i,
  },
  {
    kunci: "lingkup_pekerjaan",
    re: /berkewajiban melaksanakan\s+(.+?)\s+dengan memenuhi komitmen/i,
  },
  { kunci: "komitmen_tkdn", re: /sebesar minimal\s+(\d{1,3}%)/i },
  {
    kunci: "tarif_denda_harian",
    re: /denda sebesar\s+(1\/\d+\s+dari nilai kontrak per hari)/i,
  },
  {
    kunci: "batas_maksimum_denda",
    re: /batas maksimum denda sebesar\s+(\d{1,3}%\s+dari nilai kontrak)/i,
  },
  { kunci: "jumlah_termin", re: /dalam\s+(\d+\s+termin)/i },
  {
    kunci: "tanggal_mulai",
    re: /dimulai pada tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i,
  },
  {
    kunci: "tanggal_berakhir",
    re: /selambat-?\s*lambatnya pada tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i,
  },
];

const URUT = ["kesatu", "pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh"];

/**
 * Membaca rincian termin dengan pola tetap. Sama seperti sisa pengekstrak
 * tiruan, ini hanya mengenali susunan kalimat dokumen contoh dan akan gagal
 * pada kontrak lain. Keterbatasannya memang disengaja.
 */
export function ekstrakTerminTiruan(teks: string): TerminMentah[] {
  const rapi = teks.replace(/\s+/g, " ");
  const hasil: TerminMentah[] = [];
  const re = /Termin\s+(\w+)\s+sebesar\s+(Rp[\d.]+)(?:,\d+)?\s+dibayarkan\s+(.+?),\s*jatuh tempo\s+(\d{1,2}\s+\w+\s+\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rapi)) !== null) {
    const kata = m[1].toLowerCase();
    const idx = URUT.indexOf(kata);
    hasil.push({
      urutan: idx >= 0 ? (idx === 0 ? 1 : idx) : hasil.length + 1,
      nilai: m[2],
      syarat: m[3].replace(/^setelah\s+/i, "").trim(),
      jatuh_tempo: m[4],
    });
  }
  return hasil;
}

export function ekstrakTiruan(teks: string): HasilEkstraksiModel {
  // Pemenggalan baris pada PDF menyisipkan spasi di tempat tak terduga,
  // jadi seluruh runtun spasi diseragamkan lebih dulu.
  const rapi = teks.replace(/\s+/g, " ");
  const hasil: HasilEkstraksiModel = {};
  for (const p of POLA) {
    const m = rapi.match(p.re);
    hasil[p.kunci] = m ? (p.ambil ? p.ambil(m) : m[1]).trim() : null;
  }
  return hasil;
}

/** Menentukan apakah sebuah galat pantas dijawab dengan mode tiruan. */
export function galatBolehDitiru(e: unknown): boolean {
  const pesan = e instanceof Error ? e.message : String(e);
  return (
    /credit balance is too low/i.test(pesan) ||
    /rate.?limit/i.test(pesan) ||
    /\b429\b/.test(pesan) ||
    /OPENROUTER_API_KEY/i.test(pesan) ||
    /Belum ada kunci API/i.test(pesan) ||
    /ANTHROPIC_API_KEY/i.test(pesan) ||
    /authentication/i.test(pesan) ||
    /Could not resolve authentication/i.test(pesan)
  );
}

/**
 * Menerjemahkan galat API menjadi penjelasan yang bisa ditindaklanjuti.
 *
 * Membuang JSON galat mentah ke layar pengguna tidak membantu siapa pun.
 * Yang perlu diketahui pembaca hanyalah apa yang terjadi dan apa langkah
 * berikutnya.
 */
export function ringkasGalat(e: unknown): string {
  const pesan = e instanceof Error ? e.message : String(e);

  if (/credit balance is too low/i.test(pesan)) {
    return "Saldo kredit Anthropic habis. Isi ulang di console.anthropic.com pada menu Plans & Billing. Satu kali ekstraksi dokumen ini berbiaya sekitar Rp127 memakai Claude Haiku 4.5.";
  }
  if (/OPENROUTER_API_KEY/i.test(pesan)) {
    return "Kunci API OpenRouter belum terpasang. Ambil kunci gratis di openrouter.ai/keys lalu isikan ke OPENROUTER_API_KEY pada .env.local.";
  }
  if (/rate.?limit/i.test(pesan) || /\b429\b/.test(pesan)) {
    return "Batas laju permintaan terlampaui. Endpoint gratis OpenRouter dibatasi 20 permintaan per menit dan 50 per hari. Tunggu sejenak, atau beralih ke penyedia anthropic.";
  }
  if (/tidak menegakkan skema/i.test(pesan) || /bukan JSON yang sah/i.test(pesan)) {
    return "Model tidak menuruti skema keluaran. Ganti OPENROUTER_MODEL dengan pilihan lain, lihat daftarnya lewat npx tsx scripts/model-openrouter.ts.";
  }
  if (/ANTHROPIC_API_KEY/i.test(pesan) || /authentication/i.test(pesan)) {
    return "Kunci API Anthropic belum terpasang atau tidak sah. Salin .env.example menjadi .env.local lalu isi ANTHROPIC_API_KEY.";
  }
  return pesan.length > 200 ? `${pesan.slice(0, 200)}...` : pesan;
}
