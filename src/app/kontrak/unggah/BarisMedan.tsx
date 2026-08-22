"use client";

import { useState } from "react";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import type { KotakSorotan } from "@/lib/pdf/cocok";
import type { KelompokMedan } from "@/lib/ekstraksi/medan";

export type Medan = {
  urutan: number;
  kunci: string;
  label: string;
  kelompok: KelompokMedan;
  nilai: string | null;
  keyakinan: number;
  wajibKonfirmasi: boolean;
  halaman: number | null;
  kotak: KotakSorotan[];
  teksSumber: string;
};

/**
 * Satu baris medan pada panel Hasil Ekstraksi AI.
 *
 * Tiga keadaan yang dibedakan tegas:
 *   kosong        model tidak menemukan nilainya, wajib diisi manusia
 *   menunggu      nilai ada tetapi memuat uang atau tanggal kritis
 *   terverifikasi sudah pasti, entah otomatis atau setelah dikonfirmasi
 *
 * Medan kosong TIDAK dapat dikonfirmasi. Mengonfirmasi ruang kosong tidak
 * bermakna apa pun, dan sebelumnya justru menghasilkan kontrak tersimpan
 * dengan medan null yang bertanda sudah diverifikasi.
 */
export function BarisMedan({
  medan,
  suntingan,
  onSunting,
  sudah,
  terpilih,
  onPilih,
  onKonfirmasi,
}: {
  medan: Medan;
  suntingan: string;
  onSunting: (v: string) => void;
  sudah: boolean;
  terpilih: boolean;
  onPilih: () => void;
  onKonfirmasi: () => void;
}) {
  const [menyunting, setMenyunting] = useState(false);

  const nilai = suntingan.trim() || medan.nilai;
  const kosong = !nilai;
  const dikoreksi = suntingan.trim() !== "" && suntingan.trim() !== medan.nilai;
  const menunggu = !kosong && medan.wajibKonfirmasi && !sudah;
  const persen = Math.round(medan.keyakinan * 100);

  const bingkai = kosong
    ? "border-danger-600/40 bg-red-50"
    : menunggu
      ? "border-amber-500/50 bg-amber-50"
      : "border-line bg-white";

  return (
    <li
      className={`rounded-lg border px-3 py-2.5 transition-colors ${bingkai} ${
        terpilih ? "ring-2 ring-teal-700/40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPilih}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Tampilkan ${medan.label} pada dokumen`}
        >
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
              kosong ? "bg-danger-600" : menunggu ? "bg-amber-500" : "bg-teal-700"
            }`}
            aria-hidden
          >
            {medan.urutan}
          </span>

          <span className="w-28 shrink-0 text-xs text-muted">{medan.label}</span>

          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-900">
            {nilai ?? (
              <span className="font-normal italic text-danger-600">tidak ditemukan</span>
            )}
          </span>
        </button>

        {/* Keyakinan hanya bermakna untuk nilai yang berasal dari dokumen.
            Nilai yang diketik manusia tidak punya angka keyakinan. */}
        {!dikoreksi && !kosong && (
          <span
            className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-navy-900"
            title="Keyakinan dihitung dari kecocokan nilai terhadap teks dokumen"
          >
            {persen}%
          </span>
        )}
        {dikoreksi && (
          <span className="shrink-0 rounded bg-plum-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Manual
          </span>
        )}

        <button
          type="button"
          onClick={() => setMenyunting((v) => !v)}
          className="shrink-0 rounded p-1 text-muted hover:bg-canvas hover:text-navy-900"
          aria-label={`Sunting nilai ${medan.label}`}
          aria-expanded={menyunting}
        >
          <Pencil size={14} aria-hidden />
        </button>

        {kosong ? (
          <TriangleAlert
            size={18}
            className="shrink-0 text-danger-600"
            aria-label="Belum terisi"
          />
        ) : menunggu ? (
          <button
            type="button"
            onClick={onKonfirmasi}
            className="shrink-0 rounded-md border border-amber-500 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/10"
          >
            Konfirmasi
          </button>
        ) : (
          <Check size={18} className="shrink-0 text-teal-700" aria-label="Terverifikasi" />
        )}
      </div>

      {(menyunting || kosong) && (
        <div className="mt-2 flex items-center gap-2 border-t border-line/70 pt-2">
          <input
            type="text"
            value={suntingan}
            onChange={(e) => {
              // Begitu huruf pertama diketik, medan tidak lagi kosong,
              // sehingga baris isian ini akan hilang di tengah pengetikan
              // bila keadaannya hanya bergantung pada kosong. Menyalakan
              // penanda menyunting membuatnya bertahan.
              setMenyunting(true);
              onSunting(e.target.value);
            }}
            placeholder={
              kosong
                ? "Ketik nilai dari dokumen, medan ini wajib diisi"
                : medan.nilai ?? "Ketik nilai pengganti"
            }
            className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-sm text-navy-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-700/30"
            aria-label={`Nilai ${medan.label}`}
          />
          {suntingan.trim() !== "" && (
            <button
              type="button"
              onClick={() => onSunting("")}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-canvas"
            >
              Kembalikan
            </button>
          )}
        </div>
      )}
    </li>
  );
}
