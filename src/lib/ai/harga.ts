// Harga model AI dalam dolar AS per 1 juta token, untuk mencatat biaya nyata
// dan mencocokkannya dengan RAB.
//
// Sumber: tabel harga pada dokumen Pain and Gain AI tim, data per 7 Oktober
// 2026. Harga berubah sewaktu-waktu, jadi angka di sini perlu diperbarui
// bila RAB diperbarui.
//
// Model yang tidak dikenal menghasilkan null, BUKAN nol. Nol berarti gratis,
// null berarti harganya tidak diketahui.

type Harga = { masuk: number; keluar: number };

const DAFTAR_HARGA: { cocok: RegExp; harga: Harga }[] = [
  // Endpoint gratis OpenRouter dan klien tiruan pengujian.
  { cocok: /:free$/i, harga: { masuk: 0, keluar: 0 } },
  { cocok: /^tiruan$/i, harga: { masuk: 0, keluar: 0 } },

  // OpenAI. Pilihan tim untuk semua proses adalah GPT-6 Luna, dengan GPT-6.1
  // Sol sebagai cadangan bila uji coba menunjukkan Luna kurang teliti.
  { cocok: /gpt-?6\.1.*sol|\bsol\b/i, harga: { masuk: 2, keluar: 10 } },
  { cocok: /gpt-?6.*astra|\bastra\b/i, harga: { masuk: 10, keluar: 50 } },
  { cocok: /gpt-?6.*luna|\bluna\b/i, harga: { masuk: 0.1, keluar: 0.5 } },

  // Anthropic.
  { cocok: /claude.*opus-?5/i, harga: { masuk: 4, keluar: 20 } },
  { cocok: /claude.*sonnet-?5/i, harga: { masuk: 2, keluar: 10 } },
  { cocok: /claude.*haiku-?4/i, harga: { masuk: 1, keluar: 5 } },
];

/** Biaya dalam dolar AS, atau null bila harga model ini tidak diketahui. */
export function hitungBiayaUsd(model: string, tokenMasuk: number, tokenKeluar: number): number | null {
  const ada = DAFTAR_HARGA.find((h) => h.cocok.test(model));
  if (!ada) return null;
  return (tokenMasuk * ada.harga.masuk + tokenKeluar * ada.harga.keluar) / 1_000_000;
}
