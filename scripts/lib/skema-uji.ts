// Pembantu pengujian: membuat skema PostgreSQL sementara di basis data yang
// sama, supaya pengujian tidak menyentuh data di skema public.
//
// Skema sementara dibuat dengan nama unik, diisi lewat migrasi yang sama
// dengan yang dipakai di produksi, lalu dibuang seluruhnya di akhir. Karena
// skema dibuang dengan DROP SCHEMA ... CASCADE, pemicu append-only pada
// riwayat aktivitas tidak menghalangi pembersihan.
//
// Basis data tujuan dibaca dari DATABASE_URL (muat dengan --env-file=.env.local).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const DIR_MIGRASI = path.resolve("prisma", "migrations");
const CLI_PRISMA = path.resolve("node_modules", "prisma", "build", "index.js");

export function alamatDasar(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL belum diisi. Jalankan dengan: npx tsx --env-file=.env.local <skrip>");
  }
  return url;
}

/** Alamat sambungan yang diarahkan ke satu skema. Dipakai Prisma Migrate. */
export function alamatSkema(skema: string): string {
  const u = new URL(alamatDasar());
  u.searchParams.set("schema", skema);
  return u.toString();
}

function klien(): pg.Client {
  const u = new URL(alamatDasar());
  // Parameter schema bukan milik pg, dan membuat sebagian versi mengeluh.
  u.searchParams.delete("schema");
  return new pg.Client({ connectionString: u.toString() });
}

export function namaSkemaBaru(awalan: string): string {
  return `${awalan}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export async function buatSkema(skema: string): Promise<void> {
  const c = klien();
  await c.connect();
  try {
    await c.query(`CREATE SCHEMA "${skema}"`);
  } finally {
    await c.end();
  }
}

export async function buangSkema(skema: string): Promise<void> {
  // Pengaman: hanya skema sementara yang boleh dibuang lewat fungsi ini.
  if (!/^uji_[a-z0-9_]+$/.test(skema)) {
    throw new Error(`Menolak membuang skema "${skema}". Hanya skema berawalan uji_ yang boleh dibuang.`);
  }
  const c = klien();
  await c.connect();
  try {
    await c.query(`DROP SCHEMA IF EXISTS "${skema}" CASCADE`);
  } finally {
    await c.end();
  }
}

/** Menjalankan satu atau beberapa pernyataan SQL pada skema tertentu. */
export async function jalankanSql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  skema: string,
  sql: string,
  param: unknown[] = []
): Promise<pg.QueryResult<T>> {
  const c = klien();
  await c.connect();
  try {
    await c.query(`SET search_path TO "${skema}"`);
    return await c.query<T>(sql, param);
  } finally {
    await c.end();
  }
}

/** Daftar folder migrasi, urut sesuai nama (yang juga urutan waktunya). */
export function daftarMigrasi(): string[] {
  return readdirSync(DIR_MIGRASI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function bacaMigrasi(nama: string): string {
  return readFileSync(path.join(DIR_MIGRASI, nama, "migration.sql"), "utf8");
}

/** Menjalankan perintah prisma pada skema tertentu. Mengembalikan keluarannya. */
export function prismaPadaSkema(skema: string, argumen: string[]): { kode: number; keluaran: string } {
  // Memanggil CLI Prisma lewat node langsung, bukan lewat npx, supaya argumen
  // tidak melewati shell dan tidak ada masalah pengutipan di Windows.
  const r = spawnSync(process.execPath, [CLI_PRISMA, ...argumen], {
    env: { ...process.env, DATABASE_URL: alamatSkema(skema) },
    encoding: "utf8",
  });
  return { kode: r.status ?? 1, keluaran: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Menerapkan SEMUA migrasi ke skema, dengan perintah yang sama seperti di produksi. */
export function terapkanMigrasi(skema: string): void {
  const r = prismaPadaSkema(skema, ["migrate", "deploy"]);
  if (r.kode !== 0) {
    throw new Error(`prisma migrate deploy gagal:\n${r.keluaran.slice(-1500)}`);
  }
}

/**
 * Membandingkan skema basis data hidup dengan schema.prisma. Hasil kosong
 * berarti tidak ada penyimpangan, jadi migrasi tertulis sama dengan schema.
 */
export function cekPenyimpangan(skema: string): string {
  const r = prismaPadaSkema(skema, [
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ]);
  if (r.kode !== 0) throw new Error(`prisma migrate diff gagal:\n${r.keluaran.slice(-1500)}`);
  return r.keluaran
    .split("\n")
    .filter((b) => b.trim() !== "" && !b.startsWith("Loaded Prisma config") && !b.includes("empty migration"))
    .join("\n")
    .trim();
}
