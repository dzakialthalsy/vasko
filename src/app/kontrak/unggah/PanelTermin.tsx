"use client";

import { CircleCheck, TriangleAlert, Inbox } from "lucide-react";
import { rupiah } from "@/lib/format";

export type TerminTampil = {
  urutan: number;
  nilaiTeks: string | null;
  nilai: number | null;
  syarat: string;
  jatuhTempoTeks: string | null;
  jatuhTempo: string | null;
};

export type PeriksaTampil = {
  jumlahBaris: number;
  totalTermin: number;
  nilaiKontrak: number | null;
  selisih: number | null;
  seimbang: boolean;
  barisTanpaNilai: number[];
  barisTanpaTanggal: number[];
  catatan: string;
};

/**
 * Rincian termin beserta pemeriksaan aritmetikanya.
 *
 * Mutu rincian ini TIDAK dijaga dengan meminta manusia mengonfirmasi tiap
 * sel satu per satu, melainkan dengan satu pemeriksaan: jumlah seluruh termin
 * wajib sama dengan nilai kontrak. Satu pemeriksaan itu menangkap angka yang
 * terbaca keliru, baris yang terlewat, dan baris yang terhitung dua kali,
 * sekaligus, dan tidak bisa dilewati dengan mengeklik tanpa membaca.
 */
export function PanelTermin({
  termin,
  periksa,
}: {
  termin: TerminTampil[];
  periksa: PeriksaTampil;
}) {
  if (termin.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
        <Inbox size={22} className="mx-auto text-muted" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-navy-900">Rincian termin tidak ditemukan</p>
        <p className="mt-1 text-xs text-muted">
          Dokumen ini tidak memuat lampiran tata cara pembayaran yang dapat dibaca.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-canvas text-left">
              <th className="px-2.5 py-2 font-semibold uppercase tracking-wider text-muted">#</th>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-wider text-muted">Nilai</th>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-wider text-muted">Syarat</th>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-wider text-muted">Jatuh Tempo</th>
            </tr>
          </thead>
          <tbody>
            {termin.map((t) => (
              <tr key={t.urutan} className="border-b border-line last:border-0">
                <td className="px-2.5 py-2 font-semibold text-navy-900">{t.urutan}</td>
                <td
                  className={`whitespace-nowrap px-2.5 py-2 ${
                    t.nilai === null ? "font-semibold text-danger-600" : "text-navy-900"
                  }`}
                >
                  {t.nilai === null ? (t.nilaiTeks ?? "tidak terbaca") : rupiah(t.nilai)}
                </td>
                <td className="px-2.5 py-2 text-navy-900/80">{t.syarat}</td>
                <td
                  className={`px-2.5 py-2 ${
                    t.jatuhTempo === null ? "text-danger-600" : "text-navy-900/80"
                  }`}
                >
                  {t.jatuhTempoTeks ?? "tidak ada"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-canvas">
              <td className="px-2.5 py-2 font-bold text-navy-900" colSpan={1}>
                Total
              </td>
              <td className="whitespace-nowrap px-2.5 py-2 font-bold text-navy-900" colSpan={3}>
                {rupiah(periksa.totalTermin)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        className={`mt-2.5 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
          periksa.seimbang ? "bg-teal-50 text-navy-900" : "bg-red-50 text-danger-600"
        }`}
        role={periksa.seimbang ? undefined : "alert"}
      >
        {periksa.seimbang ? (
          <CircleCheck size={14} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
        ) : (
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        )}
        <span>
          <strong>Pemeriksaan aritmetika.</strong> {periksa.catatan}
          {periksa.nilaiKontrak !== null && (
            <>
              {" "}
              Nilai kontrak {rupiah(periksa.nilaiKontrak)}, jumlah termin{" "}
              {rupiah(periksa.totalTermin)}.
            </>
          )}
        </span>
      </div>
    </div>
  );
}
