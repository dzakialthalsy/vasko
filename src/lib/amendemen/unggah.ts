// Mengunggah amendemen: simpan dokumennya, baca dengan AI, hitung nilainya
// dengan kode, susun perbandingan versi sekali, lalu simpan semuanya.
//
// Hasil perbandingan disimpan di kolom hasilPerbandingan dan TIDAK dibuat
// ulang tiap halaman dibuka, jadi membuka halaman Bandingkan Versi berkali-kali
// tidak menambah biaya AI.
//
// Nilai kontrak awal (KA) adalah Kontrak.nilaiKontrak. Nilai total sesudah
// amendemen (KT = KA + seluruh NA) dicatat pada amendemen yang bersangkutan.
// Tepat satu amendemen per kontrak berstatus aktif, yaitu yang terbaru.

import type { Prisma } from "@/generated/prisma/client";
import { pilihKlien } from "@/lib/ai";
import type { KlienAI } from "@/lib/ai/klien";
import { catatPemakaian } from "@/lib/ai/pemakaian";
import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { rangkaiTeks } from "@/lib/ekstraksi/alur";
import { selisihHari } from "@/lib/ekstraksi/urai";
import { pilihDokumenKontrak } from "@/lib/validasi/siapkan";
import { bacaBerkas } from "@/lib/penyimpanan";
import { bacaKata } from "@/lib/pdf/kata";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";
import { analisisBerkas, unggahDokumen } from "@/lib/dokumen/unggah";
import { bacaAmendemen, type HasilBacaAmendemen } from "./baca";
import { ambilPasal, bandingkanVersi, type HasilBandingkan } from "./bandingkan";
import { hitungAmendemen, type HasilHitung } from "./hitung";

export type BerkasMasuk = { data: Uint8Array; namaBerkas: string; tanggalEditBerkas?: Date | null };

export type OpsiUnggahAmendemen = {
  kontrakId: string;
  /** Dokumen amendemen. */
  dokumen: BerkasMasuk;
  /** Dokumen pendukung amendemen. Dari sinilah jenis perubahan dibaca. */
  pendukung?: BerkasMasuk[];
  klien?: KlienAI;
  penggunaId?: string | null;
  konstruksiTerintegrasi?: boolean;
  akumulasi?: "BERSIH" | "KOTOR";
};

/** Isi kolom hasilPerbandingan. Versi 1 dari bentuk ini. */
export type HasilPerbandingan = {
  versi: 1;
  dari: { versi: number; nilai: number; tanggalBerakhir: string | null };
  ke: { versi: number; nilai: number; tanggalBerakhir: string | null };
  selisihNilai: number | null;
  selisihHari: number | null;
  hitung: HasilHitung;
  jenisPerubahan: string[];
  /** Benar bila nilai kontrak baru yang tertulis di dokumen sama dengan KA + NA. Null bila tidak tertulis. */
  nilaiTertulisCocok: boolean | null;
  ringkasan: string;
  alasan: string | null;
  aspek: HasilBandingkan["aspek"];
  catatan: string[];
};

export type HasilUnggahAmendemen = {
  amendemenId: string;
  versi: number;
  hitung: HasilHitung;
  perbandingan: HasilPerbandingan;
  baca: HasilBacaAmendemen;
  peringatan: string[];
};

async function bacaTeks(data: Uint8Array) {
  const { halaman, kata } = await bacaKata(Uint8Array.from(data));
  return { teks: rangkaiTeks(halaman), kata };
}

export async function unggahAmendemen(opsi: OpsiUnggahAmendemen): Promise<HasilUnggahAmendemen> {
  const kontrak = await prisma.kontrak.findUniqueOrThrow({
    where: { id: opsi.kontrakId },
    include: {
      amendemen: { orderBy: { versi: "asc" } },
      dokumen: { where: { jenis: "KONTRAK" }, orderBy: { diunggahPada: "asc" } },
    },
  });

  if (kontrak.nilaiKontrak === null) {
    throw new Error(`Nilai kontrak awal ${kontrak.nomor} belum diketahui, jadi nilai amendemen tidak bisa dihitung. Lengkapi dulu nilai kontraknya.`);
  }
  const nilaiAwal = Number(kontrak.nilaiKontrak);

  // Berkas diperiksa lebih dulu, sebelum ada yang tersimpan.
  const semuaBerkas = [opsi.dokumen, ...(opsi.pendukung ?? [])];
  for (const b of semuaBerkas) {
    const a = await analisisBerkas(b.data);
    if (!a.adaLapisanTeks) {
      throw new Error(`${b.namaBerkas} adalah hasil pindai tanpa lapisan teks, sehingga tidak bisa dibaca. Unggah versi PDF yang teksnya bisa dipilih.`);
    }
  }

  const peringatan: string[] = [];
  const unggahan: Awaited<ReturnType<typeof unggahDokumen>>[] = [];
  for (const [i, b] of semuaBerkas.entries()) {
    const jenis = i === 0 ? "AMANDEMEN" : "PENDUKUNG_AMANDEMEN";
    const u = await unggahDokumen({
      kontrakId: kontrak.id,
      jenis,
      data: b.data,
      namaBerkas: b.namaBerkas,
      tanggalEditBerkas: b.tanggalEditBerkas,
      penggunaId: opsi.penggunaId,
    });
    // Berkas disimpan sebelum AI dipanggil, di luar transaksi akhir. Bila
    // transaksi akhir gagal, berkasnya tertinggal tanpa amendemen. Berkas sisa
    // seperti itu dipakai lagi, supaya amendemennya bisa diunggah ulang.
    const sisaGagal = !u.baru && u.dokumen.amendemenId === null && u.dokumen.jenis === jenis;
    if (!u.baru && !sisaGagal) {
      throw new Error(`${b.namaBerkas} sama persis dengan berkas yang sudah diunggah sebagai ${u.dokumen.namaBerkas}. Amendemen yang sama tidak bisa diunggah dua kali.`);
    }
    unggahan.push(u);
  }

  // ------------------------------------------------------ baca dengan AI
  const klien = opsi.klien ?? pilihKlien();
  const bacaan = await Promise.all(semuaBerkas.map((b) => bacaTeks(b.data)));
  const sumber = semuaBerkas.map((b, i) => ({ dokumenId: unggahan[i].dokumen.id, nama: b.namaBerkas, kata: bacaan[i].kata }));
  const teksGabungan = semuaBerkas
    .map((b, i) => `##### ${i === 0 ? "Dokumen amendemen" : "Dokumen pendukung amendemen"}: ${b.namaBerkas}\n${bacaan[i].teks}`)
    .join("\n\n");

  const { jawaban: jawabanBaca, hasil: baca } = await bacaAmendemen({ klien, teks: teksGabungan, sumber });

  // ----------------------------------------------------------- hitung
  const sebelumnya = kontrak.amendemen;
  const versi = (sebelumnya.at(-1)?.versi ?? 0) + 1;
  const naSebelumnya = sebelumnya.map((a) => (a.nilaiAmandemen === null ? 0 : Number(a.nilaiAmandemen)));

  // Bila besar perubahan tidak tertulis tetapi nilai kontrak baru tertulis,
  // selisihnya dihitung dari keduanya.
  const nilaiSebelum = nilaiAwal + naSebelumnya.reduce((a, n) => a + n, 0);
  let nilaiAmandemen = baca.nilaiAmandemen;
  const catatan = [...baca.catatan];
  if (nilaiAmandemen === null && baca.nilaiKontrakBaru !== null) {
    nilaiAmandemen = baca.nilaiKontrakBaru - nilaiSebelum;
    catatan.push("Besar perubahan dihitung dari nilai kontrak baru yang tertulis dikurangi nilai kontrak sebelumnya.");
  }
  if (nilaiAmandemen === null) {
    nilaiAmandemen = 0;
    catatan.push("Nilai amendemen dianggap 0 karena tidak terbaca. Periksa dan isi manual.");
  }

  const hitung = hitungAmendemen({
    nilaiAwal,
    amendemenSebelumnya: naSebelumnya,
    nilaiAmandemenBaru: nilaiAmandemen,
    konstruksiTerintegrasi: opsi.konstruksiTerintegrasi,
    akumulasi: opsi.akumulasi,
  });

  let nilaiTertulisCocok: boolean | null = null;
  if (baca.nilaiKontrakBaru !== null) {
    nilaiTertulisCocok = Math.abs(baca.nilaiKontrakBaru - hitung.nilaiSetelah) <= 1;
    if (!nilaiTertulisCocok) {
      catatan.push(
        `Nilai kontrak baru yang tertulis di dokumen (${baca.nilaiKontrakBaru.toLocaleString("id-ID")}) tidak sama dengan nilai kontrak sebelumnya ditambah nilai amendemen (${hitung.nilaiSetelah.toLocaleString("id-ID")}).`
      );
    }
  }

  // Tanggal berakhir sebelum amendemen ini: dari amendemen sebelumnya yang
  // menyebut tanggal baru, atau dari kontrak awal.
  const berakhirSebelum = [...sebelumnya].reverse().find((a) => a.tanggalBerakhirBaru)?.tanggalBerakhirBaru ?? kontrak.tanggalBerakhir;
  const berakhirSesudah = baca.tanggalBerakhirBaru ?? berakhirSebelum;
  const selisihTanggal = berakhirSebelum && berakhirSesudah ? selisihHari(berakhirSebelum, berakhirSesudah) : null;

  // ---------------------------------------- perbandingan klausul (AI)
  let jawabanBandingan: Awaited<ReturnType<typeof bandingkanVersi>>["jawaban"] | null = null;
  let banding: HasilBandingkan = { ringkasan: baca.ringkasan, alasan: null, aspek: [], dibuang: [] };

  try {
    const berkasKontrak = pilihDokumenKontrak(kontrak.dokumen);
    const teksKontrak: string[] = [];
    for (const d of berkasKontrak) {
      if (d.adaLapisanTeks) teksKontrak.push((await bacaTeks(await bacaBerkas(d.lokasiSimpan))).teks);
    }
    const gabungKontrak = teksKontrak.join("\n");
    const potonganPasal = baca.klausul
      .map((k) => ({ pasal: k.pasal, isi: ambilPasal(gabungKontrak, k.pasal) }))
      .filter((p): p is { pasal: string; isi: string } => p.isi !== null);

    const hasil = await bandingkanVersi({
      klien,
      konteks: {
        potonganPasal,
        teksAmendemen: teksGabungan,
        angka: {
          selisihNilai: nilaiAmandemen,
          persenAmandemen: hitung.persenAmandemen,
          selisihHari: selisihTanggal,
          jenisPerubahan: baca.jenisPerubahan,
        },
      },
      sumberAmendemen: sumber,
    });
    jawabanBandingan = hasil.jawaban;
    banding = hasil.hasil;
  } catch (e) {
    // Perbandingan klausul adalah pelengkap. Gagalnya tidak menggagalkan
    // pencatatan amendemen, tetapi harus terlihat.
    catatan.push(`Perbandingan klausul oleh AI gagal dibuat: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
  }

  const perbandingan: HasilPerbandingan = {
    versi: 1,
    dari: { versi: versi - 1, nilai: hitung.nilaiSebelum, tanggalBerakhir: berakhirSebelum?.toISOString().slice(0, 10) ?? null },
    ke: { versi, nilai: hitung.nilaiSetelah, tanggalBerakhir: berakhirSesudah?.toISOString().slice(0, 10) ?? null },
    selisihNilai: nilaiAmandemen,
    selisihHari: selisihTanggal,
    hitung,
    jenisPerubahan: baca.jenisPerubahan,
    nilaiTertulisCocok,
    ringkasan: banding.ringkasan,
    alasan: banding.alasan,
    aspek: banding.aspek,
    catatan,
  };

  // --------------------------------------------------------- simpan
  const tanggal = baca.tanggal ?? new Date();
  if (!baca.tanggal) peringatan.push("Tanggal amendemen tidak terbaca, dipakai tanggal hari ini. Perbaiki bila perlu.");
  peringatan.push(...hitung.peringatan, ...catatan);

  const amendemen = await prisma.$transaction(
    async (tx) => {
      await tx.amendemen.updateMany({ where: { kontrakId: kontrak.id, aktif: true }, data: { aktif: false } });

      const baru = await tx.amendemen.create({
        data: {
          kontrakId: kontrak.id,
          versi,
          nomor: baca.nomorAmendemen,
          tanggal,
          jenisPerubahan: baca.jenisPerubahan,
          nilaiAmandemen,
          nilaiKontrakSetelah: hitung.nilaiSetelah,
          tanggalBerakhirBaru: baca.tanggalBerakhirBaru,
          ringkasan: banding.ringkasan || baca.ringkasan || "Tanpa ringkasan",
          hasilPerbandingan: perbandingan as unknown as Prisma.InputJsonValue,
          aktif: true,
          dibuatOlehId: opsi.penggunaId ?? null,
        },
      });

      await tx.dokumen.updateMany({
        where: { id: { in: unggahan.map((u) => u.dokumen.id) } },
        data: { amendemenId: baru.id },
      });

      await catatPemakaian(tx, "AMANDEMEN", jawabanBaca, { amendemenId: baru.id }, opsi.penggunaId);
      if (jawabanBandingan) {
        await catatPemakaian(tx, "PERBANDINGAN", jawabanBandingan, { amendemenId: baru.id }, opsi.penggunaId);
      }

      await catatAktivitas(tx, {
        penggunaId: opsi.penggunaId,
        aksi: AKSI.UNGGAH_AMENDEMEN,
        entitas: "amendemen",
        entitasId: baru.id,
        rincian: {
          kontrak: kontrak.nomor,
          versi,
          nilaiAmandemen,
          nilaiSetelah: hitung.nilaiSetelah,
          persenKumulatif: hitung.persenKumulatifBersih,
          tingkat: hitung.tingkat,
          jenisPerubahan: baca.jenisPerubahan,
        },
      });
      return baru;
    },
    OPSI_TRANSAKSI
  );

  return { amendemenId: amendemen.id, versi, hitung, perbandingan, baca, peringatan };
}
