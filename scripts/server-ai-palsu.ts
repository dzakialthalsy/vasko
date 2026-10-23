// Server AI PALSU bergaya OpenAI, supaya uji-live.ts bisa dijalankan tanpa
// memakai kuota. Jawabannya dari scripts/lib/ai-tiruan.ts, sama dengan jawaban
// tiruan di uji-basisdata.ts, jadi hanya cocok untuk dokumen sintetis di
// public/contoh.
//
// Gunanya memeriksa ALUR, bukan kualitas model: penyimpanan, transaksi,
// validasi, dan amendemen berjalan sungguhan terhadap basis data di
// .env.local, termasuk jeda koneksi ke Neon. Pemeriksaan bertanda
// [bergantung model] di uji-live tidak berarti apa-apa saat memakai server ini.
//
// Dengan --jeda di atas 10 detik, pool koneksi sempat menutup koneksi yang
// menganggur di antara jawaban, seperti saat menunggu model gratis yang
// lambat. Itulah keadaan yang dulu membuat transaksi gagal dimulai.
//
// Jalankan di satu terminal:
//   npx tsx scripts/server-ai-palsu.ts
//   npx tsx scripts/server-ai-palsu.ts --jeda 12000 --port 5435
// Lalu di terminal lain (Git Bash), dari folder vasko:
//   EKSTRAKSI_PENYEDIA=openai OPENAI_API_KEY=palsu OPENAI_MODEL=tiruan-lokal \
//   OPENAI_BASE_URL=http://localhost:5435/v1 \
//   npx tsx --env-file=.env.local scripts/uji-live.ts --live mudah
//
// Variabel di baris perintah menang atas .env.local, jadi kunci OpenAI
// sungguhan (bila nanti ada) tidak terpakai.
import http from "node:http";
import { penangan } from "./lib/ai-tiruan";

function pilihan(nama: string, bawaan: number): number {
  const i = process.argv.indexOf(nama);
  if (i < 0) return bawaan;
  const n = Number(process.argv[i + 1]);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${nama} harus berupa angka, misalnya ${nama} ${bawaan}`);
  return n;
}

const PORT = pilihan("--port", 5435);
const JEDA = pilihan("--jeda", 0);

/** Perkiraan kasar token, 3,5 huruf per token, sama dengan klien tiruan. */
const kiraToken = (teks: string) => Math.ceil(teks.length / 3.5);
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nomor = 0;

const server = http.createServer((req, res) => {
  const kirim = (status: number, isi: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(isi));
  };
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    kirim(404, { error: { message: "Hanya POST .../chat/completions yang dilayani." } });
    return;
  }

  let badan = "";
  req.on("data", (c) => (badan += c));
  req.on("end", async () => {
    const n = ++nomor;
    try {
      const j = JSON.parse(badan) as {
        messages?: { role: string; content: string }[];
        response_format?: { json_schema?: { name?: string } };
      };
      const nama = j.response_format?.json_schema?.name;
      if (!nama) throw new Error("permintaan tanpa response_format.json_schema.name");
      const sistem = j.messages?.find((m) => m.role === "system")?.content ?? "";
      const pengguna = j.messages?.find((m) => m.role === "user")?.content ?? "";

      const isi = penangan({ nama, pengguna });
      await tidur(JEDA);
      console.log(`[${n}] ${nama}${JEDA ? `, dijawab setelah ${JEDA} ms` : ""}`);
      kirim(200, {
        model: "tiruan-lokal",
        choices: [{ message: { content: JSON.stringify(isi) }, finish_reason: "stop" }],
        usage: { prompt_tokens: kiraToken(sistem) + kiraToken(pengguna), completion_tokens: kiraToken(JSON.stringify(isi)) },
      });
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      console.log(`[${n}] galat: ${pesan}`);
      kirim(500, { error: { message: pesan } });
    }
  });
});

server.on("error", (e) => {
  console.error(`Server gagal berjalan: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Server AI palsu berjalan di http://localhost:${PORT}/v1 (jeda ${JEDA} ms). Hentikan dengan Ctrl+C.`);
});
