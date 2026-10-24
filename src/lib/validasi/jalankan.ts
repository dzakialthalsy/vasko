// Menjalankan satu kali validasi kontrak dari awal sampai tersimpan.
//
// Urutan kerjanya:
//   1. Baca dokumen pendukung yang belum terbaca (AI membaca dan menyalin)
//   2. Tentukan peran tiap dokumen: utama, komplementer, atau digantikan (kode)
//   3. Jalankan aturan tetap terhadap kontrak dan dokumen pendukung (kode)
//   4. Periksa penyebutan angka di kontrak terhadap ketetapan dokumen
//      pendukung (AI mencari dan menyalin, kode membandingkan)
//   5. Simpan semuanya: peran dokumen, temuan, sorotan, ringkasan, biaya AI
//
// Hasil VALID bila tidak ada temuan merah. Temuan kuning tetap tampil dan
// perlu dilihat pengguna, tetapi tidak menahan hasil. Ini ketentuan USULAN
// tim yang belum divalidasi ke Pertamina.
//
// Tiap kali dijalankan menghasilkan baris Validasi baru (urutan 1, 2, dan
// seterusnya). Validasi ulang tidak menimpa hasil sebelumnya.

import type { Prisma } from "@/generated/prisma/client";
import { pilihKlien } from "@/lib/ai";
import type { KlienAI } from "@/lib/ai/klien";
import { catatPemakaian } from "@/lib/ai/pemakaian";
import { AKSI, catatAktivitas } from "@/lib/aktivitas";
import { bacaDokumenPendukung, DokumenTidakTerbaca } from "@/lib/dokumen/baca-pendukung";
import { tentukanPeran, type HasilPeran } from "@/lib/dokumen/peran";
import { rangkaiTeks } from "@/lib/ekstraksi/alur";
import { MEDAN, nilaiYangDipakai } from "@/lib/ekstraksi/medan";
import { periksaTermin, type TerminTerurai } from "@/lib/ekstraksi/termin";
import { uraiDasarDenda, uraiMasaBerlakuJaminan, uraiPersen } from "@/lib/ekstraksi/urai";
import { bacaBerkas } from "@/lib/penyimpanan";
import { bacaKata } from "@/lib/pdf/kata";
import { OPSI_TRANSAKSI, prisma } from "@/lib/prisma";
import {
  deteksiIsianTemplate,
  deteksiLampiran,
  jalankanAturan,
  type CatatanPemeriksaan,
  type FaktaDokumen,
  type TemuanAturan,
} from "./aturan";
import { periksaKlausul, pilihKetetapan, type SumberKontrak } from "./periksa-klausul";
import { faktaDariRincian, pilihDokumenKontrak, rincianDariJson, untukPeran } from "./siapkan";

export type OpsiValidasi = {
  kontrakId: string;
  /** Klien AI. Bila kosong dan AI dibutuhkan, dipilih dari .env.local. */
  klien?: KlienAI;
  penggunaId?: string | null;
  /** Baca dokumen pendukung yang belum pernah dibaca. Bawaan benar. */
  bacaPendukungBelumTerbaca?: boolean;
  /** Jalankan pemeriksaan klausul oleh AI. Bawaan benar. */
  periksaKlausulAI?: boolean;
};

export type HasilValidasiDijalankan = {
  validasiId: string;
  urutan: number;
  hasil: "VALID" | "BELUM_VALID";
  jumlahMerah: number;
  jumlahKuning: number;
  temuan: (TemuanAturan & { nomor: number; id: string })[];
  pemeriksaan: CatatanPemeriksaan[];
  peran: (HasilPeran & { nama: string })[];
  dokumenDibaca: number;
};

export async function jalankanValidasi(opsi: OpsiValidasi): Promise<HasilValidasiDijalankan> {
  const kontrak = await muatKontrak(opsi.kontrakId);

  const dokumenKontrak = pilihDokumenKontrak(kontrak.dokumen.filter((d) => d.jenis === "KONTRAK"));
  if (dokumenKontrak.length === 0) {
    throw new Error(`Kontrak ${kontrak.nomor} belum punya berkas kontrak. Unggah dan simpan kontraknya lebih dulu.`);
  }

  const maks = await prisma.validasi.aggregate({ where: { kontrakId: kontrak.id }, _max: { urutan: true } });
  const validasi = await prisma.validasi.create({
    data: {
      kontrakId: kontrak.id,
      urutan: (maks._max.urutan ?? 0) + 1,
      dijalankanOlehId: opsi.penggunaId ?? null,
    },
  });

  try {
    return await kerjakan(opsi, kontrak, dokumenKontrak, validasi.id, validasi.urutan);
  } catch (e) {
    await prisma.validasi.update({
      where: { id: validasi.id },
      data: { status: "GAGAL", galat: e instanceof Error ? e.message : String(e), selesaiPada: new Date() },
    });
    throw e;
  }
}

type KontrakMuat = Awaited<ReturnType<typeof muatKontrak>>;
async function muatKontrak(id: string) {
  return prisma.kontrak.findUniqueOrThrow({
    where: { id },
    include: { vendor: true, termin: { orderBy: { urutan: "asc" } }, dokumen: { orderBy: { diunggahPada: "asc" } } },
  });
}

async function kerjakan(
  opsi: OpsiValidasi,
  kontrak: KontrakMuat,
  dokumenKontrak: KontrakMuat["dokumen"],
  validasiId: string,
  urutan: number
): Promise<HasilValidasiDijalankan> {
  let klienMalas: KlienAI | undefined = opsi.klien;
  const ambilKlien = () => (klienMalas ??= pilihKlien());
  const namaModel = new Set<string>();

  // ---------------------------------------------------- 1. baca pendukung
  const pendukung = kontrak.dokumen.filter((d) => d.jenis === "PENDUKUNG");

  const ekstraksiTerbaru = async (dokumenIds: string[]) => {
    const semua = await prisma.ekstraksi.findMany({
      where: { dokumenId: { in: dokumenIds }, galat: null },
      orderBy: { createdAt: "desc" },
      include: { medan: { include: { sorotan: true } } },
    });
    const peta = new Map<string, (typeof semua)[number]>();
    for (const e of semua) if (!peta.has(e.dokumenId)) peta.set(e.dokumenId, e);
    return peta;
  };

  let dokumenDibaca = 0;
  let petaPendukung = await ekstraksiTerbaru(pendukung.map((d) => d.id));
  if (opsi.bacaPendukungBelumTerbaca !== false) {
    for (const d of pendukung) {
      if (petaPendukung.has(d.id) || !d.adaLapisanTeks) continue;
      try {
        const hasil = await bacaDokumenPendukung({ dokumenId: d.id, klien: ambilKlien(), penggunaId: opsi.penggunaId });
        namaModel.add(hasil.model);
        dokumenDibaca++;
      } catch (e) {
        if (!(e instanceof DokumenTidakTerbaca)) throw e;
      }
    }
    if (dokumenDibaca > 0) petaPendukung = await ekstraksiTerbaru(pendukung.map((d) => d.id));
  }

  // Jenis dan tanggal isi bisa baru terisi setelah dibaca, jadi dimuat ulang.
  const pendukungSegar = await prisma.dokumen.findMany({ where: { id: { in: pendukung.map((d) => d.id) } } });
  const urutPendukung = new Map(pendukung.map((d, i) => [d.id, i]));
  pendukungSegar.sort((a, b) => (urutPendukung.get(a.id) ?? 0) - (urutPendukung.get(b.id) ?? 0));

  // -------------------------------------------------- 2. peran dokumen
  const info = pendukungSegar.map((d) => ({
    id: d.id,
    nama: d.namaBerkas,
    jenisPendukung: d.jenisPendukung,
    tanggalDiIsi: d.tanggalDiIsi,
    tanggalEditBerkas: d.tanggalEditBerkas,
  }));
  const rincianPer = new Map(
    info.map((d) => [d.id, rincianDariJson(petaPendukung.get(d.id)?.rincian ?? null)] as const)
  );
  const { peran, efektif } = tentukanPeran(info.map((d) => untukPeran(rincianPer.get(d.id) ?? null, d)));
  const labelPer = new Map(peran.map((p) => [p.dokumenId, p.label]));
  const namaDokumen = new Map(info.map((d) => [d.id, d.nama]));

  // Fakta dari SEMUA dokumen dipakai, termasuk yang berlabel DIGANTIKAN. Aturan
  // memakai fakta terbaru untuk tiap kunci, jadi nilai yang sudah diganti
  // dokumen lebih baru otomatis kalah. Membuang seluruh fakta dokumen yang
  // digantikan justru menghilangkan nilai yang tidak diganti siapa pun.
  const fakta: FaktaDokumen[] = info.flatMap((d) => faktaDariRincian(rincianPer.get(d.id) ?? null, d));

  // -------------------------------------------------- data kontrak
  const petaKontrak = await ekstraksiTerbaru(dokumenKontrak.map((d) => d.id));
  if (petaKontrak.size === 0) {
    throw new Error(
      `Kontrak ${kontrak.nomor} belum punya hasil ekstraksi. Jalankan ekstraksi dan simpan kontraknya lebih dulu.`
    );
  }

  // Nilai teks tiap medan: dokumen yang lebih baru didahulukan, suntingan manusia menang.
  const teks: Record<string, string | null> = Object.fromEntries(MEDAN.map((m) => [m.kunci, null]));
  type SorotanMedan = { dokumenId: string; halaman: number; x: number; y: number; lebar: number; tinggi: number };
  const medanPer = new Map<string, { sorotan: SorotanMedan[] }>();
  for (const d of [...dokumenKontrak].reverse()) {
    const e = petaKontrak.get(d.id);
    if (!e) continue;
    for (const m of e.medan) {
      const nilai = nilaiYangDipakai(m.kunci, m);
      if (teks[m.kunci] === null && nilai) {
        teks[m.kunci] = nilai;
        medanPer.set(m.kunci, m);
      }
    }
  }

  // Teks PDF kontrak, dipakai pemeriksaan lampiran dan pemeriksaan klausul.
  const sumber: SumberKontrak[] = [];
  const teksPerDokumen: string[] = [];
  const dokumenKontrakTanpaTeks: { id: string; nama: string }[] = [];
  for (const d of dokumenKontrak) {
    if (!d.adaLapisanTeks) {
      dokumenKontrakTanpaTeks.push({ id: d.id, nama: d.namaBerkas });
      continue;
    }
    const { halaman, kata } = await bacaKata(Uint8Array.from(await bacaBerkas(d.lokasiSimpan)));
    sumber.push({ dokumenId: d.id, nama: d.namaBerkas, kata });
    teksPerDokumen.push(`##### Dokumen: ${d.namaBerkas}\n${rangkaiTeks(halaman)}`);
  }
  if (sumber.length === 0) {
    throw new Error(`Seluruh berkas kontrak ${kontrak.nomor} berupa hasil pindai tanpa teks, sehingga tidak bisa divalidasi.`);
  }
  const teksKontrak = teksPerDokumen.join("\n\n");

  const lampiranAda = new Set<string>(deteksiLampiran(teksKontrak));
  for (const d of kontrak.dokumen) {
    const m = d.bagian?.match(/^LAMPIRAN_([A-G])$/);
    if (m) lampiranAda.add(m[1]);
  }

  const nilaiKontrak = kontrak.nilaiKontrak === null ? null : Number(kontrak.nilaiKontrak);
  const terminTerurai: TerminTerurai[] = kontrak.termin.map((t) => ({
    urutan: t.urutan,
    nilaiTeks: null,
    nilai: Number(t.nilai),
    syarat: t.syarat,
    jatuhTempoTeks: null,
    jatuhTempo: t.jatuhTempo,
  }));

  // ---------------------------------------------------- 3. aturan tetap
  const dokumenTanpaTeks = [
    ...dokumenKontrakTanpaTeks,
    ...pendukungSegar.filter((d) => !d.adaLapisanTeks).map((d) => ({ id: d.id, nama: d.namaBerkas })),
  ];

  const hasilAturan = jalankanAturan({
    kontrak: {
      nomor: kontrak.nomor,
      namaVendor: kontrak.vendor?.nama ?? teks.nama_vendor,
      nilaiKontrak,
      termasukPpn: kontrak.termasukPpn,
      tarifDendaPermil: kontrak.tarifDendaPermil === null ? null : Number(kontrak.tarifDendaPermil),
      batasDendaPersen: kontrak.batasDendaPersen === null ? null : Number(kontrak.batasDendaPersen),
      jaminanPersen: uraiPersen(teks.nilai_jaminan_pelaksanaan),
      masaJaminan: uraiMasaBerlakuJaminan(teks.masa_berlaku_jaminan),
      dasarDenda: uraiDasarDenda(teks.dasar_perhitungan_denda),
      tanggalMulai: kontrak.tanggalMulai,
      tanggalBerakhir: kontrak.tanggalBerakhir,
      komitmenTkdnPersen: kontrak.komitmenTkdnPersen === null ? null : Number(kontrak.komitmenTkdnPersen),
      lampiranAda: [...lampiranAda].sort(),
      isianTemplate: deteksiIsianTemplate(teksKontrak),
      termin: periksaTermin(terminTerurai, nilaiKontrak),
      teks,
    },
    fakta,
    efektif,
    dokumenTanpaTeks,
    namaDokumen,
  });

  const temuan: TemuanAturan[] = [...hasilAturan.temuan];
  const pemeriksaan: CatatanPemeriksaan[] = [...hasilAturan.pemeriksaan];

  // ------------------------------------------------ 4. pemeriksaan klausul
  const ketetapan = pilihKetetapan(
    efektif.filter((e) => e.dokumenId.some((id) => labelPer.get(id) !== "DIGANTIKAN")),
    namaDokumen
  );
  let jawabanKlausul: Awaited<ReturnType<typeof periksaKlausul>>["jawaban"] | null = null;

  if (opsi.periksaKlausulAI === false) {
    pemeriksaan.push({ kode: "KLAUSUL_BERTENTANGAN", nama: "Isi kontrak sesuai ketetapan dokumen pendukung (AI)", status: "DILEWATI", catatan: "Dimatikan pada pengaturan validasi." });
  } else if (ketetapan.length === 0) {
    pemeriksaan.push({ kode: "KLAUSUL_BERTENTANGAN", nama: "Isi kontrak sesuai ketetapan dokumen pendukung (AI)", status: "DILEWATI", catatan: "Dokumen pendukung belum memuat ketetapan berupa angka." });
  } else {
    try {
      const { jawaban, hasil } = await periksaKlausul({ klien: ambilKlien(), ketetapan, teksKontrak, sumber });
      jawabanKlausul = jawaban;
      namaModel.add(jawaban.model);
      temuan.push(...hasil.temuan);
      pemeriksaan.push({
        kode: "KLAUSUL_BERTENTANGAN",
        nama: "Isi kontrak sesuai ketetapan dokumen pendukung (AI)",
        status: hasil.temuan.length > 0 ? "TEMUAN" : "LULUS",
        catatan: `${ketetapan.length} ketetapan diperiksa, ${hasil.cocok} cocok, ${hasil.temuan.length} bertentangan, ${hasil.dibuang.length} penyebutan dibuang.`,
      });
    } catch (e) {
      // Gagalnya pemeriksaan tambahan ini tidak menggagalkan validasi, tetapi
      // harus terlihat jelas bahwa pemeriksaannya tidak berjalan.
      pemeriksaan.push({
        kode: "KLAUSUL_BERTENTANGAN",
        nama: "Isi kontrak sesuai ketetapan dokumen pendukung (AI)",
        status: "DILEWATI",
        catatan: `Pemeriksaan AI gagal dijalankan: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`,
      });
    }
  }

  // Urutkan ulang: merah dulu, urutan aturan dipertahankan.
  const urut = { MERAH: 0, KUNING: 1 } as const;
  const terurut = temuan.map((t, i) => ({ t, i })).sort((a, b) => urut[a.t.tingkat] - urut[b.t.tingkat] || a.i - b.i).map((x) => x.t);
  const jumlahMerah = terurut.filter((t) => t.tingkat === "MERAH").length;
  const jumlahKuning = terurut.length - jumlahMerah;
  const hasil = jumlahMerah > 0 ? "BELUM_VALID" : "VALID";

  // -------------------------------------------------------- 5. simpan
  const temuanTersimpan = await prisma.$transaction(
    async (tx) => {
      for (const p of peran) {
        await tx.penggunaanDokumen.create({
          data: {
            validasiId,
            dokumenId: p.dokumenId,
            label: p.label,
            digantikanOlehId: p.digantikanOlehId,
            alasan: p.alasan,
          },
        });
      }

      const tersimpan: (TemuanAturan & { nomor: number; id: string })[] = [];
      for (const [i, t] of terurut.entries()) {
        const baris = await tx.temuan.create({
          data: {
            validasiId,
            nomor: i + 1,
            tingkat: t.tingkat,
            kodeAturan: t.kode,
            lokasi: t.lokasi,
            uraian: t.uraian,
            nilaiDiKontrak: t.nilaiDiKontrak,
            nilaiSaran: t.nilaiSaran,
            dasar: t.dasar,
          },
        });

        // Sorotan: salin dari medan ekstraksi yang jadi dasar temuan, atau
        // pakai kotak yang sudah dihitung langsung.
        const kotak: { dokumenId: string; halaman: number; x: number; y: number; lebar: number; tinggi: number }[] = [];
        for (const kunci of t.medanSorotan) {
          const m = medanPer.get(kunci);
          for (const s of m?.sorotan ?? []) {
            kotak.push({ dokumenId: s.dokumenId, halaman: s.halaman, x: s.x, y: s.y, lebar: s.lebar, tinggi: s.tinggi });
          }
        }
        if (t.sorotanLangsung) {
          for (const k of t.sorotanLangsung.kotak) kotak.push({ dokumenId: t.sorotanLangsung.dokumenId, ...k });
        }
        if (kotak.length > 0) await tx.sorotan.createMany({ data: kotak.map((k) => ({ ...k, temuanId: baris.id })) });

        tersimpan.push({ ...t, nomor: i + 1, id: baris.id });
      }

      const model = [...namaModel].join(", ") || null;
      await tx.validasi.update({
        where: { id: validasiId },
        data: {
          status: "SELESAI",
          hasil,
          model,
          selesaiPada: new Date(),
          ringkasan: {
            hasil,
            jumlahMerah,
            jumlahKuning,
            dokumenDibaca,
            dokumenPendukung: pendukungSegar.length,
            ketetapanDiperiksa: ketetapan.length,
            pemeriksaan,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.kontrak.update({
        where: { id: kontrak.id },
        data: { statusValidasi: hasil === "VALID" ? "VALID" : "BELUM_VALID" },
      });

      if (jawabanKlausul) await catatPemakaian(tx, "VALIDASI", jawabanKlausul, { validasiId }, opsi.penggunaId);

      await catatAktivitas(tx, {
        penggunaId: opsi.penggunaId,
        aksi: AKSI.JALANKAN_VALIDASI,
        entitas: "validasi",
        entitasId: validasiId,
        rincian: { kontrak: kontrak.nomor, urutan, hasil, merah: jumlahMerah, kuning: jumlahKuning, model },
      });

      return tersimpan;
    },
    OPSI_TRANSAKSI
  );

  return {
    validasiId,
    urutan,
    hasil,
    jumlahMerah,
    jumlahKuning,
    temuan: temuanTersimpan,
    pemeriksaan,
    peran: peran.map((p) => ({ ...p, nama: namaDokumen.get(p.dokumenId) ?? p.dokumenId })),
    dokumenDibaca,
  };
}
