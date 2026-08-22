"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { KotakSorotan } from "@/lib/pdf/cocok";

export type SorotanTampil = KotakSorotan & {
  /** Nomor urut medan, tampil sebagai lencana kecil di sudut sorotan. */
  urutan: number;
  kunci: string;
  /** Kuning berarti menunggu konfirmasi manusia, teal berarti sudah pasti. */
  menunggu: boolean;
};

type Props = {
  berkas: File | Blob | null;
  sorotan: SorotanTampil[];
  tampilkanSorotan: boolean;
  onUbahTampilSorotan: (v: boolean) => void;
  /** Medan yang sedang dipilih di panel kanan, ikut digulir ke tampilan. */
  kunciTerpilih: string | null;
  onPilihSorotan: (kunci: string) => void;
};

export function PenampilPdf({
  berkas,
  sorotan,
  tampilkanSorotan,
  onUbahTampilSorotan,
  kunciTerpilih,
  onPilihSorotan,
}: Props) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const kanvasRef = useRef<HTMLCanvasElement>(null);
  const dokRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  // Yang menyimpan sumber daya adalah tugas pemuatan, bukan proksi
  // dokumennya. Sejak pdfjs 6, PDFDocumentProxy tidak lagi punya destroy().
  const tugasRef = useRef<import("pdfjs-dist").PDFDocumentLoadingTask | null>(null);
  const tugasRenderRef = useRef<import("pdfjs-dist").RenderTask | null>(null);

  const [siap, setSiap] = useState(false);
  const [halaman, setHalaman] = useState(1);
  const [jumlahHalaman, setJumlahHalaman] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Ukuran halaman dalam titik PDF, dipakai menempatkan sorotan secara relatif.
  const [ukuran, setUkuran] = useState({ lebar: 0, tinggi: 0 });

  // Muat dokumen.
  useEffect(() => {
    if (!berkas) return;
    let batal = false;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const buf = await berkas.arrayBuffer();
      const tugas = pdfjs.getDocument({ data: new Uint8Array(buf) });
      tugasRef.current = tugas;
      const dok = await tugas.promise;
      if (batal) {
        void tugas.destroy();
        return;
      }
      dokRef.current = dok;
      setJumlahHalaman(dok.numPages);
      setHalaman(1);
      setSiap(true);
    })();

    return () => {
      batal = true;
      void tugasRef.current?.destroy();
      tugasRef.current = null;
      dokRef.current = null;
      setSiap(false);
    };
  }, [berkas]);

  // Gambar halaman aktif.
  const gambar = useCallback(async () => {
    const dok = dokRef.current;
    const kanvas = kanvasRef.current;
    if (!dok || !kanvas) return;

    // Render sebelumnya harus dibatalkan. Dua render serentak pada satu
    // kanvas membuat pdf.js melempar galat dan halaman tampil separuh.
    tugasRenderRef.current?.cancel();

    const hal = await dok.getPage(halaman);
    const dasar = hal.getViewport({ scale: 1 });
    setUkuran({ lebar: dasar.width, tinggi: dasar.height });

    // Kanvas digambar pada kerapatan piksel perangkat agar teks tidak buram
    // di layar beresolusi tinggi, sementara ukuran CSS-nya tetap.
    const dpr = window.devicePixelRatio || 1;
    const viewport = hal.getViewport({ scale: zoom });
    kanvas.width = Math.floor(viewport.width * dpr);
    kanvas.height = Math.floor(viewport.height * dpr);
    kanvas.style.width = `${viewport.width}px`;
    kanvas.style.height = `${viewport.height}px`;

    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tugas = hal.render({ canvas: kanvas, canvasContext: ctx, viewport });
    tugasRenderRef.current = tugas;
    try {
      await tugas.promise;
    } catch (e) {
      // Pembatalan adalah alur normal, bukan kegagalan.
      if ((e as { name?: string }).name !== "RenderingCancelledException") throw e;
    }
  }, [halaman, zoom]);

  useEffect(() => {
    if (siap) void gambar();
  }, [siap, gambar]);

  // Saat medan dipilih di panel kanan, pindah ke halamannya lalu gulirkan
  // sorotannya ke tengah tampilan.
  useEffect(() => {
    if (!kunciTerpilih) return;
    const target = sorotan.find((s) => s.kunci === kunciTerpilih);
    if (!target) return;

    if (target.halaman !== halaman) {
      setHalaman(target.halaman);
      return;
    }
    const wadah = wadahRef.current;
    if (!wadah || ukuran.tinggi === 0) return;

    const yPiksel = (target.y / ukuran.tinggi) * (ukuran.tinggi * zoom);
    wadah.scrollTo({
      top: Math.max(0, yPiksel - wadah.clientHeight / 2),
      behavior: "smooth",
    });
  }, [kunciTerpilih, sorotan, halaman, zoom, ukuran.tinggi]);

  const sorotanHalaman = sorotan.filter((s) => s.halaman === halaman);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,31,63,0.08)]">
      {/* Bilah kendali */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg border border-line px-1 py-0.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="rounded p-1.5 hover:bg-canvas"
            aria-label="Perkecil"
          >
            <Minus size={15} aria-hidden />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="rounded p-1.5 hover:bg-canvas"
            aria-label="Perbesar"
          >
            <Plus size={15} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHalaman((h) => Math.max(1, h - 1))}
            disabled={halaman <= 1}
            className="rounded p-1.5 hover:bg-canvas disabled:opacity-30"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <input
            type="number"
            min={1}
            max={jumlahHalaman || 1}
            value={halaman}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= jumlahHalaman) setHalaman(n);
            }}
            className="w-14 rounded-lg border border-line px-2 py-1 text-center text-sm tabular-nums"
            aria-label="Nomor halaman"
          />
          <span className="text-sm text-muted">dari {jumlahHalaman || "-"}</span>
          <button
            type="button"
            onClick={() => setHalaman((h) => Math.min(jumlahHalaman, h + 1))}
            disabled={halaman >= jumlahHalaman}
            className="rounded p-1.5 hover:bg-canvas disabled:opacity-30"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
          <span className="sr-only">Tampilkan sorotan hasil ekstraksi</span>
          <button
            type="button"
            role="switch"
            aria-checked={tampilkanSorotan}
            onClick={() => onUbahTampilSorotan(!tampilkanSorotan)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              tampilkanSorotan ? "bg-teal-700" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                tampilkanSorotan ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
          <span aria-hidden>Tampilkan Sorotan</span>
        </label>
      </div>

      {/* Area dokumen */}
      <div ref={wadahRef} className="flex-1 overflow-auto bg-canvas p-6">
        <div
          className="relative mx-auto shadow-[0_2px_10px_rgba(0,31,63,0.12)]"
          style={{ width: ukuran.lebar * zoom, height: ukuran.tinggi * zoom }}
        >
          <canvas ref={kanvasRef} className="block" />

          {tampilkanSorotan &&
            sorotanHalaman.map((s, i) => {
              const terpilih = s.kunci === kunciTerpilih;
              return (
                <button
                  key={`${s.kunci}-${i}`}
                  type="button"
                  onClick={() => onPilihSorotan(s.kunci)}
                  title={`Medan ${s.urutan}`}
                  className={[
                    "absolute rounded-[3px] transition-all",
                    s.menunggu
                      ? "bg-amber-500/25 hover:bg-amber-500/40"
                      : "bg-teal-700/20 hover:bg-teal-700/35",
                    terpilih ? "ring-2 ring-offset-1" : "",
                    terpilih && s.menunggu ? "ring-amber-500" : "",
                    terpilih && !s.menunggu ? "ring-teal-700" : "",
                  ].join(" ")}
                  style={{
                    left: s.x * zoom,
                    top: s.y * zoom,
                    width: s.lebar * zoom,
                    height: s.tinggi * zoom,
                  }}
                >
                  {/* Lencana nomor hanya pada kotak pertama tiap medan. */}
                  {sorotanHalaman.findIndex((x) => x.kunci === s.kunci) === i && (
                    <span
                      className={`absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white ${
                        s.menunggu ? "bg-amber-500" : "bg-teal-700"
                      }`}
                    >
                      {s.urutan}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
