// Pemeriksaan lingkungan kerja di laptop, TANPA menampilkan rahasia.
//
// Isi kunci API dan kata sandi basis data tidak pernah dicetak. Yang dicetak
// hanya nama variabel, terisi atau kosong, dan bentuknya (awalan, panjang,
// jenis alamat). Nilai yang memang bukan rahasia, seperti nama penyedia dan
// nama model, dicetak apa adanya. Untuk alamat basis data dicetak "sidik",
// yaitu 8 huruf pertama SHA-256 dari nama host. Sidik itu berubah bila alamat
// diarahkan ke cabang Neon lain, tanpa membuka alamatnya.
//
//   (tanpa pilihan)      versi Node dan isi .env.local
//   --db                 tabel di skema public, migrasi yang sudah dan belum
//                        diterapkan, sisa skema uji_, dan lama membuka koneksi.
//                        Hanya membaca, tidak mengubah apa pun.
//   --openrouter         apakah model di .env.local ada di daftar model gratis
//                        yang mendukung skema keluaran, dan keterangan batas
//                        kunci. Tidak memanggil model, jadi tidak memakai kuota.
//   --env-file <berkas>  berkas lain selain .env.local
//
// Jalankan dari folder vasko:
//   npx tsx scripts/cek-lingkungan.ts
//   npx tsx scripts/cek-lingkungan.ts --db --openrouter
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

type Env = Map<string, string>;

const argumen = process.argv.slice(2);
const iEnv = argumen.indexOf("--env-file");
const BERKAS_ENV = iEnv >= 0 ? argumen[iEnv + 1] : ".env.local";

/** Pengurai sederhana untuk berkas env: KUNCI=nilai, kutip dibuang, komentar diabaikan. */
function bacaEnv(berkas: string): Env {
  const env: Env = new Map();
  for (const baris of readFileSync(berkas, "utf8").split(/\r?\n/)) {
    const m = baris.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const kutip = v[0];
    if (kutip === '"' || kutip === "'") {
      const tutup = v.indexOf(kutip, 1);
      v = tutup > 0 ? v.slice(1, tutup) : v.slice(1);
    } else {
      v = v.replace(/\s+#.*$/, "");
    }
    env.set(m[1], v);
  }
  return env;
}

const sidik = (teks: string) => createHash("sha256").update(teks).digest("hex").slice(0, 8);

/** Membuang host, pengguna, dan kata sandi dari pesan galat sebelum dicetak. */
function samarkan(pesan: string, url: string): string {
  try {
    const u = new URL(url);
    let hasil = pesan;
    for (const [isi, ganti] of [
      [u.password, "<kata sandi>"],
      [u.hostname, "<host>"],
      [u.username, "<pengguna>"],
    ] as const) {
      if (isi) hasil = hasil.split(isi).join(ganti);
    }
    return hasil;
  } catch {
    return "(pesan disembunyikan karena alamatnya tidak sah)";
  }
}

function bentukAlamat(v: string): string {
  try {
    const u = new URL(v);
    const neon = u.hostname.endsWith(".neon.tech");
    const bagian = [
      `protokol ${u.protocol.replace(":", "")}`,
      neon ? `Neon, ${u.hostname.includes("-pooler") ? "lewat pooler" : "koneksi langsung"}` : "bukan Neon",
      `sslmode ${u.searchParams.get("sslmode") ?? "tidak diatur"}`,
      `kata sandi ${u.password ? "ada" : "TIDAK ADA"}`,
      `sidik host ${sidik(u.hostname)}`,
    ];
    return bagian.join(", ");
  } catch {
    return "BUKAN alamat yang sah";
  }
}

function bentukKunci(v: string, awalan: string): string {
  return `${v.length} karakter, awalan ${awalan} ${v.startsWith(awalan) ? "benar" : "SALAH"}`;
}

// Variabel rahasia dan cara menjelaskan bentuknya. Variabel lain yang tidak
// dikenal juga dianggap rahasia: hanya terisi atau kosong yang dicetak.
const RAHASIA: Record<string, (v: string) => string> = {
  DATABASE_URL: bentukAlamat,
  ANTHROPIC_API_KEY: (v) => bentukKunci(v, "sk-ant-"),
  OPENROUTER_API_KEY: (v) => bentukKunci(v, "sk-or-"),
  OPENAI_API_KEY: (v) => bentukKunci(v, "sk-"),
};
const BUKAN_RAHASIA = new Set([
  "EKSTRAKSI_PENYEDIA",
  "ANTHROPIC_MODEL",
  "OPENROUTER_MODEL",
  "OPENROUTER_MODEL_CADANGAN",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "DATABASE_SKEMA",
]);

function cekEnv(env: Env): string[] {
  const peringatan: string[] = [];
  console.log(`\n${BERKAS_ENV} (${env.size} variabel)`);
  for (const [k, v] of env) {
    let teks: string;
    if (!v) teks = "kosong";
    else if (RAHASIA[k]) teks = `terisi, ${RAHASIA[k](v)}`;
    else if (BUKAN_RAHASIA.has(k)) teks = v;
    else teks = "terisi";
    console.log(`  ${k.padEnd(27)} ${teks}`);
  }

  const ambil = (k: string) => env.get(k) ?? "";
  if (!ambil("DATABASE_URL")) peringatan.push("DATABASE_URL kosong. Aplikasi dan semua uji basis data butuh variabel ini.");
  if (ambil("DATABASE_SKEMA")) peringatan.push("DATABASE_SKEMA terisi. Kosongkan, variabel ini hanya untuk skrip uji.");
  const penyedia = ambil("EKSTRAKSI_PENYEDIA").toLowerCase();
  if (penyedia === "openrouter") peringatan.push("EKSTRAKSI_PENYEDIA=openrouter: hanya untuk dokumen sintetis, jangan untuk kontrak Pertamina yang sebenarnya.");
  if (penyedia === "openrouter" && !ambil("OPENROUTER_API_KEY")) peringatan.push("Penyedia openrouter tetapi OPENROUTER_API_KEY kosong.");
  if (penyedia === "anthropic" && !ambil("ANTHROPIC_API_KEY").startsWith("sk-ant-")) peringatan.push("Penyedia anthropic tetapi ANTHROPIC_API_KEY kosong atau bentuknya salah.");
  if (penyedia === "openai" && (!ambil("OPENAI_API_KEY") || !ambil("OPENAI_MODEL"))) peringatan.push("Penyedia openai tetapi OPENAI_API_KEY atau OPENAI_MODEL kosong.");
  if (!penyedia && ambil("ANTHROPIC_API_KEY")) {
    peringatan.push("EKSTRAKSI_PENYEDIA kosong dan ANTHROPIC_API_KEY terisi, jadi Anthropic yang dipakai. Pastikan kuncinya masih berlaku.");
  }
  return peringatan;
}

async function cekBasisData(url: string): Promise<string[]> {
  const peringatan: string[] = [];
  console.log("\nBasis data (hanya membaca)");
  const u = new URL(url);
  u.searchParams.delete("schema");
  const c = new pg.Client({ connectionString: u.toString() });
  const t0 = Date.now();
  await c.connect();
  const ms = Date.now() - t0;
  console.log(`  koneksi dibuka dalam ${ms} ms${ms > 2000 ? " (lebih dari 2 detik, batas bawaan Prisma untuk memulai transaksi)" : ""}`);
  try {
    const tabel = (
      await c.query<{ n: string }>(
        "SELECT table_name AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
      )
    ).rows.map((r) => r.n);
    console.log(`  skema public: ${tabel.length} tabel${tabel.length ? `: ${tabel.join(", ")}` : ""}`);

    const lokal = existsSync(path.resolve("prisma", "migrations"))
      ? readdirSync(path.resolve("prisma", "migrations"), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : [];
    let diterapkan: string[] = [];
    if (tabel.includes("_prisma_migrations")) {
      diterapkan = (
        await c.query<{ n: string }>(
          "SELECT migration_name AS n FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at"
        )
      ).rows.map((r) => r.n);
      const gagal = (
        await c.query<{ n: string }>(
          "SELECT migration_name AS n FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL"
        )
      ).rows.map((r) => r.n);
      if (gagal.length) peringatan.push(`Ada migrasi yang mulai tetapi belum selesai: ${gagal.join(", ")}. Jangan lanjut sebelum diperiksa.`);
    }
    const tertunda = lokal.filter((m) => !diterapkan.includes(m));
    console.log(`  migrasi sudah diterapkan: ${diterapkan.length ? diterapkan.join(", ") : "(belum ada)"}`);
    console.log(`  migrasi tertunda       : ${tertunda.length ? tertunda.join(", ") : "(tidak ada)"}`);

    const uji = (
      await c.query<{ n: string }>("SELECT schema_name AS n FROM information_schema.schemata WHERE schema_name LIKE 'uji\\_%' ORDER BY 1")
    ).rows.map((r) => r.n);
    console.log(`  sisa skema uji_        : ${uji.length}${uji.length ? ` (${uji.join(", ")})` : ""}`);
    if (uji.length) peringatan.push("Ada sisa skema uji_ dari uji yang terhenti. Aman dibuang, tetapi tanyakan pemiliknya dulu.");
  } finally {
    await c.end();
  }
  return peringatan;
}

type ModelOpenRouter = { id: string; supported_parameters?: string[] };

async function cekOpenRouter(env: Env): Promise<string[]> {
  const peringatan: string[] = [];
  console.log("\nOpenRouter (tidak memanggil model)");
  const r = await fetch("https://openrouter.ai/api/v1/models");
  if (!r.ok) throw new Error(`daftar model tidak bisa diambil, status ${r.status}`);
  const { data } = (await r.json()) as { data: ModelOpenRouter[] };
  const siap = new Set(
    data.filter((m) => m.id.endsWith(":free") && (m.supported_parameters ?? []).includes("structured_outputs")).map((m) => m.id)
  );

  const diatur = [
    env.get("OPENROUTER_MODEL") ?? "",
    ...(env.get("OPENROUTER_MODEL_CADANGAN") ?? "").split(","),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  if (diatur.length === 0) console.log("  OPENROUTER_MODEL dan OPENROUTER_MODEL_CADANGAN kosong, jadi nilai bawaan di kode yang dipakai.");
  for (const [i, m] of diatur.entries()) {
    const ada = data.some((x) => x.id === m);
    const keadaan = siap.has(m) ? "siap (gratis, mendukung skema)" : ada ? "ADA, tetapi bukan gratis atau tanpa skema keluaran" : "TIDAK ADA di daftar";
    console.log(`  ${i === 0 ? "utama   " : "cadangan"} ${m.padEnd(46)} ${keadaan}`);
    if (!siap.has(m)) peringatan.push(`Model ${m} tidak siap dipakai (${keadaan}).`);
  }
  console.log(`  model gratis yang mendukung skema saat ini: ${siap.size ? [...siap].join(", ") : "(tidak ada)"}`);

  const kunci = env.get("OPENROUTER_API_KEY");
  if (kunci) {
    const rk = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${kunci}` } });
    if (!rk.ok) {
      peringatan.push(`Kunci OpenRouter ditolak saat dicek (status ${rk.status}).`);
    } else {
      const { data: info } = (await rk.json()) as { data?: Record<string, unknown> };
      console.log("  keterangan kunci:");
      // Label kunci bisa memuat potongan kunci, jadi tidak dicetak.
      for (const [k, v] of Object.entries(info ?? {})) {
        if (/label|key/i.test(k)) continue;
        console.log(`    ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
  return peringatan;
}

async function main() {
  console.log(`Node ${process.version} (butuh versi 20 atau lebih baru)`);
  if (!existsSync(BERKAS_ENV)) {
    console.log(`\n${BERKAS_ENV} tidak ditemukan. Salin .env.example menjadi .env.local lalu isi nilainya sendiri.`);
    process.exit(1);
  }
  const env = bacaEnv(BERKAS_ENV);
  const peringatan = cekEnv(env);

  if (argumen.includes("--db")) {
    const url = env.get("DATABASE_URL");
    if (url) {
      try {
        peringatan.push(...(await cekBasisData(url)));
      } catch (e) {
        peringatan.push(`Basis data tidak bisa dibuka: ${samarkan((e as Error).message, url)}`);
      }
    }
  }
  if (argumen.includes("--openrouter")) {
    try {
      peringatan.push(...(await cekOpenRouter(env)));
    } catch (e) {
      peringatan.push(`Pemeriksaan OpenRouter gagal: ${(e as Error).message}`);
    }
  }

  console.log(peringatan.length ? "\nPerlu diperhatikan:" : "\nTidak ada yang perlu diperhatikan.");
  for (const p of peringatan) console.log(`  - ${p}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
