// Penyimpanan berkas dokumen di server.
//
// Berkas disimpan DI LUAR folder public. Menaruhnya di public berarti siapa
// pun yang menebak nama berkas dapat mengunduh kontrak tanpa melewati kendali
// akses. Berkas dilayani lewat rute tersendiri yang memeriksa basis data.
//
// Nama berkas di disk adalah sidik SHA-256 isinya, bukan nama dari pengguna.
// Akibatnya: berkas yang sama persis tersimpan sekali, nama dari pengguna
// tidak pernah menjadi bagian jalur (tidak ada celah ../), dan versi lama
// kontrak yang diunggah ulang tetap utuh.
//
// Letak yang disimpan di basis data berbentuk "data/<subfolder>/<nama>".
// Akar sebenarnya di disk bisa diganti lewat VASKO_DIR_DATA, dipakai pengujian.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

function akarData(): string {
  const dariEnv = process.env.VASKO_DIR_DATA?.trim();
  // Akar data baru diketahui saat berjalan. Komentar turbopackIgnore mencegah
  // Next menyertakan seluruh proyek ke hasil build gara-gara jalur dinamis ini.
  return path.resolve(/*turbopackIgnore: true*/ dariEnv || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
}

export function sidikSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Mengubah letak di basis data menjadi jalur di disk, dan menolak apa pun yang
 * keluar dari akar data.
 */
function jalurDisk(lokasi: string): string {
  if (!lokasi.startsWith("data/")) {
    throw new Error(`Letak berkas tidak sah: ${lokasi}`);
  }
  const akar = akarData();
  const jalur = path.resolve(akar, lokasi.slice("data/".length));
  if (jalur !== akar && !jalur.startsWith(akar + path.sep)) {
    throw new Error(`Letak berkas keluar dari folder data: ${lokasi}`);
  }
  return jalur;
}

/**
 * Menyimpan berkas berdasarkan sidiknya dan mengembalikan letaknya.
 * Aman dipanggil berulang untuk berkas yang sama.
 */
export async function simpanBerkas(data: Uint8Array, sidik: string = sidikSha256(data)): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(sidik)) throw new Error("Sidik berkas harus 64 karakter heksadesimal.");
  const lokasi = `data/dokumen/${sidik}.pdf`;
  const jalur = jalurDisk(lokasi);

  try {
    await access(jalur);
    return lokasi; // sudah ada, isinya pasti sama karena namanya sidik isi
  } catch {
    // belum ada, lanjut menulis
  }

  await mkdir(path.dirname(jalur), { recursive: true });
  await writeFile(jalur, data);
  return lokasi;
}

export async function bacaBerkas(lokasi: string): Promise<Buffer> {
  return readFile(/*turbopackIgnore: true*/ jalurDisk(lokasi));
}

export async function berkasAda(lokasi: string): Promise<boolean> {
  try {
    await access(jalurDisk(lokasi));
    return true;
  } catch {
    return false;
  }
}
