"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, TriangleAlert, Loader2, Save, Upload } from "lucide-react";
import { PenampilPdf, type SorotanTampil } from "@/components/pdf/PenampilPdf";
import { tanggal } from "@/lib/format";
import { JUDUL_KELOMPOK, URUTAN_KELOMPOK } from "@/lib/ekstraksi/medan";
import { ambilBerkas } from "@/lib/berkas-antar";
import { BarisMedan, type Medan } from "./BarisMedan";
// PanelTermin tidak lagi dirender di layar verifikasi atas permintaan
// rancangan, namun tipenya tetap dipakai karena rincian termin masih ikut
// diekstraksi dan disimpan untuk tab Progres dan Termin di halaman detail.
import type { TerminTampil, PeriksaTampil } from "./PanelTermin";

type Hasil = {
  namaBerkas: string;
  halaman: { nomor: number }[];
  medan: Medan[];
  termin: TerminTampil[];
  periksaTermin: PeriksaTampil;
  model: string;
  tiruan: boolean;
  alasanTiruan: string | null;
  durasiMs: number;
  // Disetel di klien saat hasil diterima, bukan dikirim server. Yang
  // ditampilkan wireframe adalah kapan berkas diunggah, bukan berapa lama
  // ekstraksinya berjalan.
  diunggahPada: string;
};

export function PapanUnggah() {
  const [berkas, setBerkas] = useState<File | Blob | null>(null);
  const [namaBerkas, setNamaBerkas] = useState<string>("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const router = useRouter();
  const [menyimpan, setMenyimpan] = useState<null | "DRAF" | "BERJALAN">(null);
  const [dikonfirmasi, setDikonfirmasi] = useState<Set<string>>(new Set());
  // Koreksi manual per medan. Dipakai ketika model tidak menemukan nilainya,
  // atau ketika nilai temuannya keliru dan diperbaiki manusia.
  const [suntingan, setSuntingan] = useState<Record<string, string>>({});
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const [tampilSorotan, setTampilSorotan] = useState(true);
  // Penanda bahwa kode klien sudah hidup. Markah HTML-nya sudah ada sebelum
  // React hidrasi, sehingga berkas yang dikirim skrip uji pada saat itu tidak
  // memicu penangan apa pun dan diam-diam hilang.
  const [siap, setSiap] = useState(false);
  // Penanda permintaan terakhir. Ekstraksi dokumen panjang bisa memakan
  // puluhan detik, dan pengguna dapat mengunggah berkas lain sebelum yang
  // pertama selesai. Tanpa penanda ini, hasil permintaan LAMA yang datang
  // belakangan akan menimpa hasil berkas yang baru.
  const permintaanRef = useRef(0);

  async function proses(f: File | Blob, nama: string) {
    const ini = ++permintaanRef.current;
    setMemuat(true);
    setGalat(null);
    setHasil(null);
    setDikonfirmasi(new Set());
    setTerpilih(null);
    setBerkas(f);
    setNamaBerkas(nama);

    const form = new FormData();
    form.append("berkas", f, nama);
    try {
      const r = await fetch("/api/ekstraksi", { method: "POST", body: form });
      const j = await r.json();
      // Permintaan yang sudah tidak relevan diabaikan diam-diam, termasuk
      // galatnya, supaya tidak memunculkan pesan yang membingungkan tentang
      // berkas yang sudah tidak dilihat pengguna.
      if (ini !== permintaanRef.current) return;
      if (!r.ok) throw new Error(j.galat ?? `Permintaan gagal dengan status ${r.status}`);
      setHasil({ ...j, namaBerkas: nama, diunggahPada: new Date().toISOString() });
    } catch (e) {
      if (ini !== permintaanRef.current) return;
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      if (ini === permintaanRef.current) setMemuat(false);
    }
  }

  // Berkas datang dari halaman daftar kontrak, bukan dari dokumen contoh yang
  // dimuat sendiri. Penjaga ref diperlukan karena Strict Mode menjalankan
  // efek dua kali; tanpa itu pembacaan kedua mendapat titipan yang sudah
  // kosong dan halaman tampak gagal memuat berkas.
  const sudahAmbil = useRef(false);
  useEffect(() => {
    if (sudahAmbil.current) return;
    sudahAmbil.current = true;
    // Dijalankan di luar badan efek. Memanggil setState langsung di dalamnya
    // memicu render berantai dan ditolak aturan react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      setSiap(true);
      const berkasTitipan = ambilBerkas();
      if (berkasTitipan) void proses(berkasTitipan, berkasTitipan.name);
    });
  }, []);

  // Nilai yang berlaku: suntingan manusia bila ada, selain itu keluaran model.
  const nilaiBerlaku = (m: Medan) => suntingan[m.kunci]?.trim() || m.nilai;

  const medanWajib = hasil?.medan.filter((m) => m.wajibKonfirmasi) ?? [];
  const sisaKonfirmasi = medanWajib.filter((m) => !dikonfirmasi.has(m.kunci)).length;
  // Medan kosong tidak boleh ikut disimpan sebagai kontrak berjalan, sebab
  // mengonfirmasi ruang kosong tidak bermakna apa pun.
  const medanKosong = hasil?.medan.filter((m) => !nilaiBerlaku(m)) ?? [];
  const semuaBeres = hasil !== null && sisaKonfirmasi === 0 && medanKosong.length === 0;

  const sorotan: SorotanTampil[] = useMemo(() => {
    if (!hasil) return [];
    return hasil.medan.flatMap((m) =>
      m.kotak.map((k) => ({
        ...k,
        urutan: m.urutan,
        kunci: m.kunci,
        menunggu: m.wajibKonfirmasi && !dikonfirmasi.has(m.kunci),
      }))
    );
  }, [hasil, dikonfirmasi]);

  async function simpan(status: "DRAF" | "BERJALAN") {
    if (!hasil || !berkas) return;
    setMenyimpan(status);
    setGalat(null);

    const form = new FormData();
    form.append(
      "hasil",
      JSON.stringify({
        namaBerkas,
        jumlahHalaman: hasil.halaman.length,
        model: hasil.model,
        status,
        medan: hasil.medan.map((m) => ({
          kunci: m.kunci,
          // Nilai mentah dari model tetap dikirim apa adanya, supaya jejak
          // asalnya tersimpan walau manusia mengoreksinya.
          nilai: m.nilai,
          nilaiSuntingan: suntingan[m.kunci]?.trim() || null,
          keyakinan: m.keyakinan,
          halaman: m.halaman,
          kotak: m.kotak,
          dikonfirmasi: !m.wajibKonfirmasi || dikonfirmasi.has(m.kunci),
        })),
        termin: hasil.termin.map((t) => ({
          urutan: t.urutan,
          nilai: t.nilai,
          syarat: t.syarat,
          jatuhTempo: t.jatuhTempo,
        })),
      })
    );
    form.append("berkas", berkas, namaBerkas);

    try {
      const r = await fetch("/api/kontrak", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.galat ?? `Penyimpanan gagal dengan status ${r.status}`);
      // Daftar kontrak dirender di server, jadi cache-nya harus disegarkan
      // sebelum berpindah halaman, kalau tidak kontrak baru belum tampak.
      router.refresh();
      router.push(`/kontrak/${j.slug}`);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
      setMenyimpan(null);
    }
  }

  function konfirmasi(kunci: string) {
    setDikonfirmasi((s) => new Set(s).add(kunci));
    setTerpilih(kunci);
  }

  return (
    <div className="flex h-[calc(100vh-61px)] flex-col px-6 py-5" data-siap={siap ? "1" : "0"}>
      {/* Kepala halaman */}
      <div className="mb-4">
        <nav className="mb-2 flex items-center gap-2 text-sm text-muted" aria-label="Remah roti">
          <Link href="/kontrak" className="hover:text-navy-900">
            Kontrak
          </Link>
          <span aria-hidden>&rsaquo;</span>
          <span className="font-semibold text-navy-900">Unggah Baru</span>
        </nav>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-navy-900">Verifikasi Hasil Ekstraksi AI</h1>
            {/* Wireframe menampilkan tanggal unggah, bukan lama proses maupun
                nama model. Keduanya tetap berguna saat menelusuri hasil yang
                berbeda antar percobaan, karena sistem dapat berpindah ke model
                cadangan sendiri, jadi dipindahkan ke tooltip alih-alih
                dihapus. */}
            <p
              className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted"
              title={
                hasil
                  ? `Diekstraksi ${(hasil.durasiMs / 1000).toFixed(1)} detik dengan ${hasil.model}`
                  : undefined
              }
            >
              <FileText size={15} aria-hidden />
              <span className="font-medium text-navy-900">{namaBerkas || "Belum ada berkas"}</span>
              {hasil && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>{hasil.halaman.length} halaman</span>
                  <span aria-hidden>&middot;</span>
                  <span>diunggah {tanggal(hasil.diunggahPada)}</span>
                </>
              )}
            </p>
          </div>

          {/* Wireframe tidak memuat tombol unggah di layar ini, sebab berkas
              sudah terunggah sebelum layar verifikasi terbuka. Medan berkasnya
              tetap ada namun tersembunyi, supaya skrip uji-simpan.ts dapat
              memasukkan berkas dan alur unggahnya tetap teruji. */}
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void proses(f, f.name);
            }}
          />
        </div>
      </div>

      {hasil?.tiruan && (
        <p className="mb-4 flex items-start gap-2.5 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-navy-900">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <span>
            <strong>Mode tiruan.</strong> Nilai di panel kanan berasal dari pencocokan pola
            tetap, bukan dari model bahasa. {hasil.alasanTiruan}
          </span>
        </p>
      )}

      {galat && (
        <p className="mb-4 rounded-lg border-l-4 border-danger-600 bg-red-50 px-4 py-3 text-sm text-danger-600">
          {galat}
        </p>
      )}

      {/* Layar ini tidak lagi memuat dokumen contoh sendiri, jadi membukanya
          langsung lewat URL atau memuat ulang halaman menyisakan keadaan
          kosong. Yang ditawarkan adalah jalan kembali ke tempat berkas
          dipilih, bukan tombol unggah kedua. */}
      {!berkas && !memuat ? (
        <div className="grid flex-1 place-items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(0,31,63,0.08)]">
          <div className="max-w-md px-6 text-center">
            <Upload size={28} className="mx-auto text-muted" aria-hidden />
            <p className="mt-3 font-semibold text-navy-900">
              Belum ada dokumen untuk diverifikasi
            </p>
            <p className="mt-1.5 text-sm text-muted">
              Pilih berkas kontrak lewat tombol Unggah Kontrak pada daftar kontrak. Setelah
              berkasnya terpilih, layar ini akan langsung menampilkan hasil ekstraksinya.
            </p>
            <Link
              href="/kontrak"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
            >
              Kembali ke daftar kontrak
            </Link>
          </div>
        </div>
      ) : (
      /* Dua kolom: dokumen di kiri, hasil ekstraksi di kanan */
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_420px]">
        <PenampilPdf
          berkas={berkas}
          sorotan={sorotan}
          tampilkanSorotan={tampilSorotan}
          onUbahTampilSorotan={setTampilSorotan}
          kunciTerpilih={terpilih}
          onPilihSorotan={setTerpilih}
        />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,31,63,0.08)]">
          <h2 className="px-6 pb-3 pt-6 text-lg font-bold text-navy-900">Hasil Ekstraksi AI</h2>

          <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-navy-900">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
            <span>
              Medan yang memuat nilai uang dan tanggal kritis wajib dikonfirmasi manusia sebelum
              disimpan.
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {memuat && (
              <p className="flex items-center gap-2 py-8 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Membaca dokumen dan mengekstraksi medan...
              </p>
            )}

            {hasil &&
              URUTAN_KELOMPOK.map((kel) => {
                const daftar = hasil.medan.filter((m) => m.kelompok === kel);
                if (daftar.length === 0) return null;
                return (
                  <div key={kel} className="mb-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-px w-4 bg-line" aria-hidden />
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {JUDUL_KELOMPOK[kel]}
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {daftar.map((m) => (
                        <BarisMedan
                          key={m.kunci}
                          medan={m}
                          suntingan={suntingan[m.kunci] ?? ""}
                          onSunting={(v) =>
                            setSuntingan((s) => ({ ...s, [m.kunci]: v }))
                          }
                          sudah={dikonfirmasi.has(m.kunci)}
                          terpilih={terpilih === m.kunci}
                          onPilih={() => setTerpilih(m.kunci)}
                          onKonfirmasi={() => konfirmasi(m.kunci)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}

          </div>
        </section>
      </div>
      )}

      {/* Bilah bawah. Disembunyikan pada keadaan kosong, sebab penghitung
          "0 dari 0 medan" dan dua tombol simpan yang mati tidak memberi
          keterangan apa pun ketika belum ada dokumen. */}
      {(berkas || memuat) && (
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,31,63,0.08)]">
        <span
          data-uji="sisa-konfirmasi"
          className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold text-white ${
            sisaKonfirmasi > 0 ? "bg-amber-500" : "bg-teal-700"
          }`}
        >
          {sisaKonfirmasi}
        </span>
        <span className="text-sm text-navy-900">
          dari {medanWajib.length} medan menunggu konfirmasi
        </span>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => void simpan("DRAF")}
            disabled={!hasil || menyimpan !== null}
            className="rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
          >
            {menyimpan === "DRAF" ? "Menyimpan..." : "Simpan sebagai Draf"}
          </button>
          <button
            type="button"
            onClick={() => void simpan("BERJALAN")}
            disabled={!semuaBeres || menyimpan !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            <Save size={16} aria-hidden />
            {menyimpan === "BERJALAN" ? "Menyimpan..." : "Simpan ke Repositori"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

