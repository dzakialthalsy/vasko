// Menampilkan model GRATIS di OpenRouter yang mendukung structured outputs.
//
// Daftarnya berubah sewaktu-waktu, jadi jangan menyalin nama model dari
// catatan lama. Jalankan skrip ini untuk melihat keadaan sekarang.
//
// Jalankan: npx tsx scripts/model-openrouter.ts
type Model = {
  id: string;
  name?: string;
  context_length?: number;
  supported_parameters?: string[];
};

async function main() {
  const r = await fetch("https://openrouter.ai/api/v1/models");
  if (!r.ok) throw new Error(`Gagal mengambil daftar model, status ${r.status}`);
  const { data } = (await r.json()) as { data: Model[] };

  const gratis = data.filter((m) => m.id.endsWith(":free"));
  const berskema = gratis.filter((m) => (m.supported_parameters ?? []).includes("structured_outputs"));

  console.log(`Total model            : ${data.length}`);
  console.log(`Gratis                 : ${gratis.length}`);
  console.log(`Gratis + skema keluaran: ${berskema.length}\n`);

  if (berskema.length === 0) {
    console.log("Tidak ada model gratis yang mendukung structured outputs saat ini.");
    console.log("Pakai penyedia anthropic, atau model OpenRouter berbayar termurah.");
    return;
  }

  console.log("Salin salah satu id di bawah ke OPENROUTER_MODEL pada .env.local:\n");
  berskema
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .forEach((m) => {
      const konteks = (m.context_length ?? 0).toLocaleString("id-ID");
      console.log(`  ${m.id.padEnd(48)} ${konteks.padStart(10)} token konteks`);
    });

  console.log(
    "\nDokumen contoh hanya sekitar 5.700 token, jadi konteks bukan penentu.\n" +
      "Yang menentukan adalah seberapa patuh model menuruti skema keluaran.\n" +
      "Uji dengan: npx tsx --env-file=.env.local scripts/uji-ekstraksi.ts"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Penanda modul, agar nama di berkas ini tidak bocor ke lingkup global
// dan bertabrakan dengan skrip lain.
export {};
