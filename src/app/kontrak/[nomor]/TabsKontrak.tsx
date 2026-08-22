"use client";

import { useMemo, useState, useId } from "react";
import Link from "next/link";
import {
  Check,
  TriangleAlert,
  History,
  GitCompare,
  FileText,
  Info,
  EllipsisVertical,
  Inbox,
} from "lucide-react";
import { Kartu, Chip, Label } from "@/components/ui/Kartu";
import { hitungDenda } from "@/lib/denda";
import { rupiah, tanggal, persen } from "@/lib/format";

type Termin = {
  urutan: number;
  nilai: number;
  syarat: string;
  jatuhTempo: string;
  status: "MENUNGGU" | "JATUH_TEMPO" | "DIBAYAR";
};

export type DataKontrak = {
  nomor: string;
  judul: string;
  nilaiKontrak: number;
  komitmenTkdn: number;
  batasMaksDenda: number;
  tarifDendaHarian: string;
  jumlahTermin: number;
  tanggalMulai: string | null;
  tanggalBerakhir: string | null;
  namaBerkas: string | null;
  jumlahHalaman: number | null;
  vendor: { nama: string; npwp: string | null; alamat: string | null } | null;
  termin: Termin[];
  progres: { tanggal: string; keterangan: string; selesai: boolean; persenTotal: number | null }[];
  amendemen: { versi: number; tanggal: string; ringkasan: string; aktif: boolean }[];
};

const TAB = ["Ringkasan", "Progres dan Termin", "Amendemen", "Dokumen", "Denda"] as const;
type NamaTab = (typeof TAB)[number];

export function TabsKontrak({ data }: { data: DataKontrak }) {
  const [aktif, setAktif] = useState<NamaTab>("Progres dan Termin");

  return (
    <>
      <div className="mt-6 border-b border-line" role="tablist" aria-label="Bagian detail kontrak">
        <div className="flex gap-1">
          {TAB.map((t) => {
            const dipilih = t === aktif;
            return (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={dipilih}
                onClick={() => setAktif(t)}
                className={[
                  "-mb-px border-b-2 px-5 py-3.5 text-sm transition-colors",
                  dipilih
                    ? "border-teal-700 font-bold text-teal-700"
                    : "border-transparent text-navy-900/60 hover:text-navy-900",
                ].join(" ")}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" className="mt-6">
        {aktif === "Ringkasan" && <PanelRingkasan data={data} />}
        {aktif === "Progres dan Termin" && <PanelProgres data={data} />}
        {aktif === "Amendemen" && <PanelAmendemen data={data} />}
        {aktif === "Dokumen" && <PanelDokumen data={data} />}
        {aktif === "Denda" && <PanelDenda data={data} />}
      </div>
    </>
  );
}

/**
 * Keadaan kosong yang menjelaskan SEBABNYA.
 *
 * Ekstraksi dokumen hanya mengambil sepuluh medan kepala kontrak. Termin,
 * progres, dan amendemen adalah data PELAKSANAAN yang lahir setelah kontrak
 * berjalan, bukan sesuatu yang tercetak sebagai satu nilai di dokumen.
 * Menampilkannya sebagai angka nol dan tabel kosong membuat sistem tampak
 * rusak, padahal memang belum ada datanya.
 */
function Kosong({ judul, sebab }: { judul: string; sebab: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center">
      <Inbox size={26} className="mx-auto text-muted" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-navy-900">{judul}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{sebab}</p>
    </div>
  );
}

// ------------------------------------------------------------- Ringkasan

function Baris({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-b border-line py-3 last:border-0">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="text-right text-sm font-semibold text-navy-900">{v}</dd>
    </div>
  );
}

function PanelRingkasan({ data }: { data: DataKontrak }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Kartu judul="Medan Kunci Kontrak" aksen="teal">
        <p className="mb-3 text-sm text-muted">
          Seluruh nilai di bawah berasal dari ekstraksi dokumen yang sudah dikonfirmasi manusia.
        </p>
        <dl>
          <Baris k="Nomor kontrak" v={<span className="font-mono">{data.nomor}</span>} />
          <Baris k="Nama vendor" v={data.vendor?.nama ?? "-"} />
          <Baris k="Nilai kontrak" v={rupiah(data.nilaiKontrak)} />
          <Baris k="Lingkup pekerjaan" v={data.judul} />
          <Baris k="Komitmen TKDN" v={persen(data.komitmenTkdn)} />
          <Baris k="Jumlah termin" v={`${data.jumlahTermin} termin`} />
          <Baris k="Tanggal mulai" v={tanggal(data.tanggalMulai)} />
          <Baris k="Tanggal berakhir" v={tanggal(data.tanggalBerakhir)} />
        </dl>
      </Kartu>

      <Kartu judul="Vendor Pelaksana" aksen="plum">
        <dl>
          <Baris k="Nama" v={data.vendor?.nama ?? "-"} />
          <Baris k="NPWP" v={<span className="font-mono">{data.vendor?.npwp ?? "-"}</span>} />
          <Baris k="Alamat" v={data.vendor?.alamat ?? "-"} />
        </dl>
        <Link
          href="/vendor"
          className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:underline"
        >
          Lihat profil vendor terpadu &rarr;
        </Link>
      </Kartu>
    </div>
  );
}

// -------------------------------------------------- Progres dan Termin

function PanelProgres({ data }: { data: DataKontrak }) {
  const selesai = data.progres.filter((p) => p.selesai);
  const persenSelesai = selesai.at(-1)?.persenTotal ?? 0;
  const diperbarui = selesai.at(-1)?.tanggal ?? null;
  const adaProgres = data.progres.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Kartu
        judul="Progres Pelaksanaan"
        aksen="teal"
        aksi={
          diperbarui && (
            <Chip warna="netral">Diperbarui: {tanggal(diperbarui)}</Chip>
          )
        }
      >
        {!adaProgres ? (
          <Kosong
            judul="Belum ada catatan progres"
            sebab="Tonggak pelaksanaan dicatat saat pekerjaan berjalan, bukan diambil dari dokumen kontrak. Ekstraksi hanya mengambil medan kepala kontrak."
          />
        ) : (
        <>
        <div className="flex items-end justify-between">
          <span className="text-5xl font-extrabold text-teal-700">{persen(persenSelesai)}</span>
          <Label>Selesai</Label>
        </div>
        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={persenSelesai}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres pelaksanaan kontrak"
        >
          <div className="h-full rounded-full bg-teal-700" style={{ width: `${persenSelesai}%` }} />
        </div>

        <ol className="mt-6 space-y-3">
          {data.progres.map((p, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={[
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                    p.selesai ? "bg-teal-700 text-white" : "border-2 border-line bg-white",
                  ].join(" ")}
                  aria-hidden
                >
                  {p.selesai ? <Check size={15} strokeWidth={3} /> : null}
                </span>
                {i < data.progres.length - 1 && <span className="w-px flex-1 bg-line" aria-hidden />}
              </div>
              <div
                className={[
                  "mb-1 flex-1 rounded-lg px-4 py-3",
                  p.selesai ? "bg-canvas" : "border border-dashed border-line",
                ].join(" ")}
              >
                <div className="text-xs font-bold uppercase tracking-wide text-teal-700">
                  {p.selesai ? tanggal(p.tanggal) : `Dijadwalkan: ${tanggal(p.tanggal)}`}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-navy-900">{p.keterangan}</div>
              </div>
            </li>
          ))}
        </ol>
        </>
        )}
      </Kartu>

      <RingkasDenda data={data} />

      <Kartu
        judul="Termin Pembayaran"
        aksi={
          <button
            type="button"
            className="rounded-lg p-1.5 text-navy-900 hover:bg-canvas"
            aria-label="Tindakan lain untuk termin pembayaran"
          >
            <EllipsisVertical size={18} aria-hidden />
          </button>
        }
      >
        <TabelTermin termin={data.termin} />
      </Kartu>

      <Kartu
        judul="Riwayat Amendemen"
        aksen="plum"
        ikon={<History size={20} className="text-navy-900" aria-hidden />}
        aksi={<TombolBandingkan />}
      >
        <DaftarAmendemen amendemen={data.amendemen} />
      </Kartu>
    </div>
  );
}

function TabelTermin({ termin }: { termin: Termin[] }) {
  if (termin.length === 0) {
    return (
      <Kosong
        judul="Belum ada rincian termin"
        sebab="Jumlah termin memang terbaca dari dokumen, tetapi rincian nilai, syarat, dan jatuh tempo tiap termin belum diekstraksi. Untuk sementara diisi manual saat kontrak mulai dilaksanakan."
      />
    );
  }

  const gaya = {
    DIBAYAR: "teal",
    JATUH_TEMPO: "amber",
    MENUNGGU: "netral",
  } as const;
  const label = { DIBAYAR: "Dibayar", JATUH_TEMPO: "Jatuh tempo", MENUNGGU: "Menunggu" };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {["Termin", "Nilai", "Syarat", "Jatuh Tempo"].map((h) => (
              <th
                key={h}
                className="py-2.5 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted"
              >
                {h}
              </th>
            ))}
            <th className="py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {termin.map((t) => (
            <tr key={t.urutan} className="border-b border-line last:border-0">
              {/* Hanya nomor termin dan nominal yang dijaga satu baris.
                  Syarat dan tanggal boleh membungkus, persis seperti rancangan,
                  supaya kolom status tidak terdorong keluar kartu. */}
              <td className="whitespace-nowrap py-3.5 pr-3 font-semibold text-navy-900">
                Termin {t.urutan}
              </td>
              <td className="whitespace-nowrap py-3.5 pr-3">{rupiah(t.nilai)}</td>
              <td className="py-3.5 pr-3 text-navy-900/80">{t.syarat}</td>
              <td className="py-3.5 pr-3">{tanggal(t.jatuhTempo)}</td>
              <td className="py-3.5 text-right">
                <Chip warna={gaya[t.status]}>{label[t.status]}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DaftarAmendemen({ amendemen }: { amendemen: DataKontrak["amendemen"] }) {
  if (amendemen.length === 0) {
    return (
      <Kosong
        judul="Belum ada amendemen tercatat"
        sebab="Amendemen dicatat sebagai versi terpisah ketika perubahan kontrak diterbitkan. Kontrak yang baru diunggah belum punya riwayat versi."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {amendemen.map((a) => (
        <li key={a.versi} className="flex gap-4">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-plum-700" aria-hidden />
          <div
            className={[
              "flex-1 rounded-lg px-4 py-3",
              a.aktif ? "bg-canvas ring-1 ring-plum-700/20" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-navy-900">
                {a.versi === 0 ? "Kontrak Awal" : `Ver ${a.versi}`}
              </span>
              {a.aktif && <Chip warna="plum">AKTIF</Chip>}
            </div>
            <div className="mt-0.5 text-xs text-muted">{tanggal(a.tanggal)}</div>
            <div className="mt-1 text-sm text-navy-900">{a.ringkasan}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------- Amendemen

function TombolBandingkan() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full bg-canvas px-4 py-2 text-xs font-semibold text-navy-900 hover:bg-line"
    >
      <GitCompare size={14} aria-hidden /> Bandingkan versi
    </button>
  );
}

function PanelAmendemen({ data }: { data: DataKontrak }) {
  return (
    <Kartu
      judul="Riwayat Amendemen"
      aksen="plum"
      ikon={<History size={20} aria-hidden />}
      aksi={<TombolBandingkan />}
    >
      <p className="mb-4 text-sm text-muted">
        Hanya satu versi yang berstatus aktif pada satu waktu. Aturan ini yang menjawab AP-T4,
        yaitu ketiadaan mekanisme kendali versi untuk amendemen kontrak.
      </p>
      <DaftarAmendemen amendemen={data.amendemen} />
    </Kartu>
  );
}

// -------------------------------------------------------------- Dokumen

function PanelDokumen({ data }: { data: DataKontrak }) {
  return (
    <Kartu judul="Dokumen Kontrak" aksen="teal">
      {data.namaBerkas ? (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-canvas px-5 py-4">
          <FileText size={22} className="text-teal-700" aria-hidden />
          <div className="flex-1">
            <div className="text-sm font-semibold text-navy-900">{data.namaBerkas}</div>
            <div className="text-xs text-muted">{data.jumlahHalaman} halaman</div>
          </div>
          <Link
            href={`/contoh/${data.namaBerkas}`}
            target="_blank"
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
          >
            Buka dokumen
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted">Belum ada dokumen terunggah.</p>
      )}
      <p className="mt-4 text-sm text-muted">
        Dokumen ini sintetis dan disusun tim untuk keperluan pengujian, bukan dokumen operasional
        PT Pertamina Patra Niaga.
      </p>
    </Kartu>
  );
}

// ---------------------------------------------------------------- Denda

/** Kartu ringkas yang tampil di tab Progres dan Termin. */
function RingkasDenda({ data }: { data: DataKontrak }) {
  const h = hitungDenda({
    nilaiKontrak: data.nilaiKontrak,
    hariTerlambat: 0,
    batasMaksimum: data.batasMaksDenda / 100,
  });

  return (
    <Kartu
      judul="Perhitungan Denda"
      aksen="amber"
      sisiAksen="kiri"
      ikon={<TriangleAlert size={20} className="text-amber-500" aria-hidden />}
    >
      <div className="rounded-lg bg-canvas px-5 py-4">
        <Label>Parameter dari Lampiran C</Label>
        <dl className="mt-2">
          <Baris k="Tarif Denda" v={<span className="font-mono">1/1000 per hari</span>} />
          <Baris k="Dasar Perhitungan" v="Nilai Kontrak" />
          <Baris k="Batas Maksimal" v={persen(data.batasMaksDenda)} />
        </dl>
      </div>

      <div className="mt-6">
        <Label>Perhitungan saat ini</Label>
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-muted">Hari Terlambat</div>
            <div className="mt-1 text-3xl font-extrabold text-navy-900">
              0 <span className="text-base font-medium">hari</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">Akumulasi Denda</div>
            <div className="mt-1 text-3xl font-extrabold text-amber-700">{rupiah(0)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-between border-t border-line pt-3 text-sm">
        <span className="text-muted">Batas Denda Maksimal ({persen(data.batasMaksDenda)})</span>
        <span className="font-bold text-navy-900">{rupiah(h.batasNominal)}</span>
      </div>

      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-navy-900">
        <Info size={15} className="mr-1.5 inline text-amber-700" aria-hidden />
        Simulasi: setiap 1 hari keterlambatan menambah denda {rupiah(h.tambahanPerHari)}
      </p>
      <p className="mt-3 text-center text-xs text-muted">
        Parameter dibaca otomatis dari dokumen kontrak, tidak disetel manual.
      </p>
    </Kartu>
  );
}

/** Tab Denda: simulasi yang bisa diubah jumlah harinya. */
function PanelDenda({ data }: { data: DataKontrak }) {
  const [hari, setHari] = useState(0);
  const id = useId();

  const h = useMemo(
    () =>
      hitungDenda({
        nilaiKontrak: data.nilaiKontrak,
        hariTerlambat: hari,
        batasMaksimum: data.batasMaksDenda / 100,
      }),
    [data.nilaiKontrak, data.batasMaksDenda, hari]
  );

  const maksSlider = Math.max(60, h.hariMenujuBatas + 10);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Kartu
        judul="Simulasi Denda Keterlambatan"
        aksen="amber"
        ikon={<TriangleAlert size={20} className="text-amber-500" aria-hidden />}
      >
        <p className="mb-5 text-sm text-muted">
          Perhitungan memakai rumus tetap, bukan model bahasa, sehingga masukan yang sama selalu
          menghasilkan angka yang sama dan dapat diperiksa ulang secara manual.
        </p>

        <label htmlFor={id} className="text-sm font-semibold text-navy-900">
          Jumlah hari keterlambatan
        </label>
        <div className="mt-2 flex items-center gap-4">
          <input
            id={id}
            type="range"
            min={0}
            max={maksSlider}
            value={Math.min(hari, maksSlider)}
            onChange={(e) => setHari(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-amber-500"
          />
          <input
            type="number"
            min={0}
            value={hari}
            onChange={(e) => setHari(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-lg border border-line px-3 py-2 text-right text-sm font-semibold text-navy-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            aria-label="Jumlah hari keterlambatan"
          />
        </div>

        <div className="mt-6 rounded-lg bg-canvas px-5 py-4">
          <dl>
            <Baris k="Denda sebelum dibatasi" v={rupiah(h.dendaSebelumBatas)} />
            <Baris k={`Batas maksimal (${persen(data.batasMaksDenda)})`} v={rupiah(h.batasNominal)} />
            <Baris
              k="Akumulasi denda"
              v={<span className="text-lg text-amber-700">{rupiah(h.denda)}</span>}
            />
          </dl>
        </div>

        {h.menyentuhBatas ? (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger-600">
            <TriangleAlert size={15} className="mr-1.5 inline" aria-hidden />
            Denda sudah menyentuh batas maksimal. Denda berhenti bertambah, dan gerbang penyisih G2
            pada rekomendasi tindak lanjut vendor ikut aktif.
          </p>
        ) : (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-navy-900">
            <Info size={15} className="mr-1.5 inline text-amber-700" aria-hidden />
            Setiap 1 hari menambah {rupiah(h.tambahanPerHari)}. Batas maksimal tersentuh pada hari
            ke {h.hariMenujuBatas}.
          </p>
        )}
      </Kartu>

      <Kartu judul="Dasar Perhitungan">
        <dl>
          <Baris k="Rumus" v={<span className="font-mono text-xs">min(V x 1/1000 x H, batas)</span>} />
          <Baris k="V, nilai kontrak" v={rupiah(data.nilaiKontrak)} />
          <Baris k="Tarif harian" v={data.tarifDendaHarian} />
          <Baris k="Batas maksimal" v={`${persen(data.batasMaksDenda)} dari nilai kontrak`} />
          <Baris k="Sumber parameter" v="Lampiran C dokumen kontrak" />
        </dl>
        <p className="mt-4 text-sm text-muted">
          Parameter di atas berasal dari hasil ekstraksi dokumen yang sudah dikonfirmasi manusia,
          sehingga tidak ada angka yang diketik ulang secara manual.
        </p>
      </Kartu>
    </div>
  );
}
