// Menguji satu per satu model GRATIS di OpenRouter yang mendukung structured
// outputs, memakai permintaan kecil, lalu melaporkan mana yang benar-benar
// hidup dan patuh pada skema.
//
// Berguna karena endpoint gratis diperebutkan banyak pengguna: model yang
// kemarin lancar bisa menolak hari ini. Jalankan ini lebih dulu sebelum
// menebak-nebak isi OPENROUTER_MODEL.
//
// Jalankan: npx tsx --env-file=.env.local scripts/coba-model-openrouter.ts
const ALAMAT = "https://openrouter.ai/api/v1/chat/completions";

type Model = { id: string; context_length?: number; supported_parameters?: string[] };

// Permintaan sengaja dibuat sangat kecil, supaya pengujian ini nyaris tidak
// memotong kuota 50 permintaan per hari.
const SKEMA = {
  type: "object",
  properties: {
    nomor_kontrak: { type: ["string", "null"] },
    nilai_kontrak: { type: ["string", "null"] },
  },
  required: ["nomor_kontrak", "nilai_kontrak"],
  additionalProperties: false,
};

const CONTOH =
  "PERJANJIAN Nomor: KTR/2026/0142. Nilai total Perjanjian adalah sebesar Rp4.850.000.000,- (Empat Miliar Delapan Ratus Lima Puluh Juta Rupiah).";

async function coba(kunci: string, model: string) {
  const mulai = Date.now();
  const r = await fetch(ALAMAT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kunci}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "VASKO",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "Salin nilai medan apa adanya dari teks. Kembalikan null bila tidak ada." },
        { role: "user", content: CONTOH },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "uji", strict: true, schema: SKEMA },
      },
    }),
  });

  const j = await r.json().catch(() => ({}));
  const durasi = Date.now() - mulai;

  if (!r.ok || j.error) {
    const meta = j.error?.metadata;
    const dalam = meta ? ` | ${JSON.stringify(meta).slice(0, 110)}` : "";
    return { ok: false, durasi, catatan: `${r.status} ${j.error?.message ?? ""}${dalam}` };
  }

  const isi: string | undefined = j.choices?.[0]?.message?.content;
  if (!isi) return { ok: false, durasi, catatan: "balasan tanpa isi" };

  const bersih = isi.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const p = JSON.parse(bersih);
    const benar = String(p.nomor_kontrak ?? "").includes("KTR/2026/0142");
    return {
      ok: true,
      durasi,
      catatan: benar ? "JSON sah, nilai tepat" : `JSON sah tetapi nilai meleset: ${bersih.slice(0, 70)}`,
    };
  } catch {
    return { ok: false, durasi, catatan: `bukan JSON: ${bersih.slice(0, 70)}` };
  }
}

async function main() {
  const kunci = process.env.OPENROUTER_API_KEY;
  if (!kunci) {
    console.error("OPENROUTER_API_KEY belum diisi di .env.local.");
    process.exit(1);
  }

  const r = await fetch("https://openrouter.ai/api/v1/models");
  const { data } = (await r.json()) as { data: Model[] };
  const kandidat = data
    .filter((m) => m.id.endsWith(":free"))
    .filter((m) => (m.supported_parameters ?? []).includes("structured_outputs"))
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0));

  console.log(`Menguji ${kandidat.length} model gratis berskema, satu permintaan kecil masing-masing.\n`);

  const berhasil: string[] = [];
  for (const m of kandidat) {
    const h = await coba(kunci, m.id);
    if (h.ok && h.catatan.startsWith("JSON sah, nilai tepat")) berhasil.push(m.id);
    console.log(`  ${h.ok ? "HIDUP" : "GAGAL"} ${m.id.padEnd(46)} ${String(h.durasi).padStart(6)} ms  ${h.catatan}`);
    // Jeda kecil agar tidak menabrak batas 20 permintaan per menit.
    await new Promise((s) => setTimeout(s, 800));
  }

  console.log();
  if (berhasil.length === 0) {
    console.log("Tidak ada model gratis yang berhasil saat ini.");
    console.log("Coba lagi beberapa saat lagi, atau beralih ke EKSTRAKSI_PENYEDIA=anthropic.");
    process.exit(1);
  }

  console.log("Yang siap dipakai, urut prioritas. Salin ke .env.local:\n");
  console.log(`OPENROUTER_MODEL=${berhasil[0]}`);
  if (berhasil.length > 1) {
    console.log(`OPENROUTER_MODEL_CADANGAN=${berhasil.slice(1).join(",")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Penanda modul, agar nama di berkas ini tidak bocor ke lingkup global
// dan bertabrakan dengan skrip lain.
export {};
