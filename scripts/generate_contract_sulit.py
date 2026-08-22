# -*- coding: utf-8 -*-
"""Bangkitkan PDF kontrak sintetis KEDUA yang sengaja dibuat sulit.

Dokumen pertama, KTR/2026/0142, bersih dan lurus: tiap medan hanya muncul
sekali dan tanpa saingan. Dokumen ini kebalikannya, disusun untuk membongkar
kelemahan yang tidak terlihat pada dokumen mudah.

Jebakan yang ditanam, dan apa yang diujinya:

1. ENAM PERSENTASE BERSAING. TKDN 38%, PPN 11%, jaminan pelaksanaan 5%,
   uang muka 15%, retensi 5%, batas denda 10%. Menguji apakah model
   mengambil persentase yang benar, bukan yang pertama ditemuinya.

2. NILAI LAMA YANG SUDAH DIGANTI. Amendemen menyebut "semula
   Rp11.800.000.000 menjadi Rp12.400.000.000". Nilai lama itu ada di dokumen
   dan sangat mirip. Menguji apakah model tertipu nilai yang sudah mati.

3. TANGGAL BERTEBARAN. Sembilan tanggal, termasuk surat penunjukan, berita
   acara, dan jadwal mingguan. Hanya dua yang diminta.

4. ANGKA DIEJA DALAM KURUNG. "5 (lima) termin" dan nominal berikut
   terbilangnya. Menguji perapian format.

5. NILAI TERPOTONG PERGANTIAN BARIS. Disebar sepanjang dokumen, menguji
   perakitan kata yang dulu menghasilkan "denganmemenuhi".

6. NOMOR KONTRAK MIRIP. Dokumen menyebut kontrak lain KTR/2025/0163 dan
   KTR/2026/0136. Menguji ketepatan pencocokan nomor.

Jalankan: python scripts/generate_contract_sulit.py
"""
import json
import os
import sys

import pymupdf

OUT_PDF = os.path.join("public", "contoh", "KTR-2026-0163-Konstruksi-Tangki-Timbun-Samarinda.pdf")
OUT_KEY = os.path.join("public", "contoh", "KTR-2026-0163.kunci.json")

TARGET_HALAMAN = 60

KUNCI = {
    "nomor_kontrak": "KTR/2026/0163",
    "nama_vendor": "PT Bahari Nusantara Teknik",
    "nilai_kontrak": "Rp12.400.000.000",
    "lingkup_pekerjaan": "Konstruksi Tangki Timbun Samarinda",
    "komitmen_tkdn": "38%",
    "tarif_denda_harian": "1/1000 dari nilai kontrak per hari",
    "batas_maksimum_denda": "10% dari nilai kontrak",
    "jumlah_termin": "5 termin",
    "tanggal_mulai": "20 April 2026",
    "tanggal_berakhir": "5 Oktober 2026",
}

# Bentuk sebagaimana benar-benar tercetak di dokumen, untuk medan yang
# penulisannya berbeda dari bentuk baku pada KUNCI. Dipakai pemeriksaan
# mandiri di bawah, sekaligus menjadi catatan bahwa perbedaan ini disengaja.
LITERAL = {
    "jumlah_termin": "5 (lima) termin",
    "nilai_kontrak": "Rp12.400.000.000,00",
}

# Catatan untuk pembaca hasil uji: kenapa tiap medan sulit.
JEBAKAN = {
    "nomor_kontrak": "bersaing dengan KTR/2025/0163 dan KTR/2026/0136",
    "nilai_kontrak": "bersaing dengan nilai lama Rp11.800.000.000 pada amendemen",
    "komitmen_tkdn": "bersaing dengan PPN 11%, jaminan 5%, uang muka 15%, retensi 5%, denda 10%",
    "batas_maksimum_denda": "bersaing dengan jaminan pelaksanaan yang juga berupa persentase",
    "jumlah_termin": "ditulis sebagai 5 (lima) termin",
    "tanggal_mulai": "bersaing dengan tujuh tanggal lain di dokumen",
    "tanggal_berakhir": "bersaing dengan tanggal akhir masa pemeliharaan",
}

W, H = 595.0, 842.0
ML, MR, MT, MB = 72, 72, 72, 64
LEAD = 15.5
FS = 10.5
FONT_R, FONT_B, FONT_I = "helv", "hebo", "heit"


class Penulis:
    def __init__(self, doc):
        self.doc = doc
        self.page = None
        self.y = 0.0
        self._halaman_baru()

    def _halaman_baru(self):
        self.page = self.doc.new_page(width=W, height=H)
        self.y = MT
        n = self.doc.page_count
        if n > 1:
            self.page.insert_text((ML, H - MB + 24), KUNCI["nomor_kontrak"],
                                  fontname=FONT_R, fontsize=8, color=(0.55, 0.6, 0.65))
            self.page.insert_text((W - MR - 60, H - MB + 24), "Halaman %d" % n,
                                  fontname=FONT_R, fontsize=8, color=(0.55, 0.6, 0.65))

    def kosong(self, n=1):
        self.y += LEAD * n

    def baris(self, teks, font=FONT_R, size=FS, indent=0, tengah=False):
        if self.y + LEAD > H - MB:
            self._halaman_baru()
        lebar = pymupdf.get_text_length(teks, fontname=font, fontsize=size)
        x = (W - lebar) / 2 if tengah else ML + indent
        self.page.insert_text((x, self.y), teks, fontname=font, fontsize=size)
        self.y += LEAD

    def paragraf(self, teks, font=FONT_R, size=FS, indent=0, tengah=False):
        maks = W - ML - MR - indent
        baris, kini = [], ""
        for k in teks.split():
            uji = (kini + " " + k).strip()
            if pymupdf.get_text_length(uji, fontname=font, fontsize=size) <= maks:
                kini = uji
            else:
                baris.append(kini)
                kini = k
        if kini:
            baris.append(kini)
        for b in baris:
            self.baris(b, font=font, size=size, indent=indent, tengah=tengah)

    def judul(self, teks, size=11):
        if self.y + LEAD * 3 > H - MB:
            self._halaman_baru()
        self.kosong(0.5)
        self.baris(teks, font=FONT_B, size=size)
        self.kosong(0.3)


def isi(p):
    K = KUNCI

    # ------------------------------------------------------------ sampul
    p.kosong(4)
    p.baris("PERJANJIAN KONSTRUKSI TANGKI TIMBUN", font=FONT_B, size=15, tengah=True)
    p.kosong(0.6)
    p.baris("Nomor: %s" % K["nomor_kontrak"], font=FONT_B, size=12, tengah=True)
    p.kosong(2)
    p.baris("antara", tengah=True)
    p.kosong(1)
    p.baris("PT PERTAMINA PATRA NIAGA REGIONAL KALIMANTAN", font=FONT_B, size=11, tengah=True)
    p.kosong(1)
    p.baris("dengan", tengah=True)
    p.kosong(1)
    p.baris(K["nama_vendor"].upper(), font=FONT_B, size=11, tengah=True)
    p.kosong(4)
    p.baris("DOKUMEN SINTETIS UNTUK PENGUJIAN SISTEM", font=FONT_I, size=9, tengah=True)
    p.baris("Bukan dokumen operasional. Seluruh data bersifat fiktif.", font=FONT_I, size=9, tengah=True)

    # --------------------------------------------------------- pembukaan
    p._halaman_baru()
    p.paragraf(
        "Perjanjian Konstruksi Tangki Timbun ini dibuat dan ditandatangani pada hari ini, "
        "Senin, tanggal dua puluh bulan April tahun dua ribu dua puluh enam, oleh dan antara:"
    )
    p.kosong()
    p.paragraf(
        "PIHAK PERTAMA, PT Pertamina Patra Niaga Regional Kalimantan, berkedudukan di Balikpapan."
    )
    p.kosong()
    p.paragraf(
        "PIHAK KEDUA, %s, berkedudukan di Samarinda, Kalimantan Timur." % K["nama_vendor"]
    )
    p.kosong()
    # Jebakan: nomor kontrak lain yang mirip.
    p.paragraf(
        "Perjanjian ini merupakan kelanjutan kerja sama sebagaimana dituangkan dalam Perjanjian "
        "Nomor KTR/2025/0163 tentang Fabrikasi Pipa Balikpapan yang telah berakhir, dan tidak "
        "berkaitan dengan Perjanjian Nomor KTR/2026/0136 tentang Jasa Kalibrasi Instrumen yang "
        "diadakan terpisah."
    )
    p.kosong()
    # Jebakan: tanggal-tanggal pengecoh.
    p.paragraf(
        "Perjanjian ini didasarkan pada Surat Penunjukan Penyedia Barang/Jasa tanggal 2 April 2026, "
        "Berita Acara Hasil Pelelangan tanggal 27 Maret 2026, serta Berita Acara Klarifikasi dan "
        "Negosiasi tanggal 15 April 2026."
    )

    # ------------------------------------------- halaman inti, medan kunci
    p._halaman_baru()
    p.baris("POKOK-POKOK PERJANJIAN", font=FONT_B, size=12)
    p.kosong(0.5)

    p.judul("PASAL 1: LINGKUP PEKERJAAN")
    p.paragraf(
        "PIHAK KEDUA berkewajiban melaksanakan %s, meliputi pekerjaan sipil pondasi, fabrikasi "
        "dan ereksi pelat dinding, pemasangan atap apung, serta pengujian hidrostatik." % K["lingkup_pekerjaan"]
    )

    p.judul("PASAL 2: NILAI PERJANJIAN")
    p.paragraf(
        "Nilai total Perjanjian setelah Amendemen Kedua adalah sebesar %s,00 (dua belas miliar "
        "empat ratus juta rupiah), sudah termasuk Pajak Pertambahan Nilai sebesar 11%% (sebelas "
        "persen)." % K["nilai_kontrak"]
    )

    p.judul("PASAL 3: KOMITMEN TINGKAT KOMPONEN DALAM NEGERI")
    p.paragraf(
        "PIHAK KEDUA wajib memenuhi komitmen Tingkat Komponen Dalam Negeri sebesar %s dari total "
        "nilai barang dan jasa, dibuktikan dengan sertifikat yang masih berlaku." % K["komitmen_tkdn"]
    )

    p.judul("PASAL 4: JAMINAN DAN RETENSI")
    # Jebakan utama: dua persentase yang keduanya masuk akal sebagai batas denda.
    p.paragraf(
        "PIHAK KEDUA menyerahkan Jaminan Pelaksanaan sebesar 5% (lima persen) dari Nilai Perjanjian. "
        "Uang muka yang dapat ditarik paling tinggi 15% (lima belas persen) dari Nilai Perjanjian. "
        "Retensi sebesar 5% (lima persen) ditahan sampai berakhirnya masa pemeliharaan."
    )

    p.judul("PASAL 5: TATA CARA PEMBAYARAN")
    p.paragraf(
        "Pembayaran dilakukan dalam 5 (lima) termin sesuai capaian progres fisik yang diverifikasi "
        "bersama, dengan rincian pada Lampiran C."
    )

    p.judul("PASAL 6: SANKSI KETERLAMBATAN")
    p.paragraf(
        "Keterlambatan penyelesaian pekerjaan dikenakan denda sebesar %s untuk setiap hari "
        "keterlambatan. Akumulasi denda dibatasi paling tinggi %s, dan setelah batas itu tercapai "
        "PIHAK PERTAMA berhak memutuskan Perjanjian." % (K["tarif_denda_harian"], K["batas_maksimum_denda"])
    )

    p.judul("PASAL 7: JANGKA WAKTU")
    p.paragraf(
        "Pelaksanaan pekerjaan dimulai pada tanggal %s dan diselesaikan selambat-lambatnya pada "
        "tanggal %s. Masa pemeliharaan berlangsung 180 hari kalender setelahnya, berakhir pada "
        "tanggal 3 April 2027." % (K["tanggal_mulai"], K["tanggal_berakhir"])
    )

    # ----------------------------------------------- amendemen, nilai lama
    p._halaman_baru()
    p.baris("RIWAYAT AMENDEMEN", font=FONT_B, size=12)
    p.kosong(0.5)
    p.judul("AMENDEMEN PERTAMA, 12 Juni 2026")
    p.paragraf(
        "Menambah lingkup pekerjaan berupa pemasangan sistem proteksi kebakaran busa. Nilai "
        "Perjanjian berubah semula Rp11.200.000.000,00 menjadi Rp11.800.000.000,00."
    )
    p.judul("AMENDEMEN KEDUA, 30 Juli 2026")
    p.paragraf(
        "Menyesuaikan volume pekerjaan pondasi berdasarkan hasil penyelidikan tanah lanjutan. "
        "Nilai Perjanjian berubah semula Rp11.800.000.000,00 menjadi %s,00. Seluruh ketentuan "
        "lain tidak berubah." % K["nilai_kontrak"]
    )
    p.kosong()
    p.paragraf(
        "Nilai yang berlaku dan mengikat PARA PIHAK adalah nilai setelah Amendemen Kedua "
        "sebagaimana tercantum pada Pasal 2.",
        font=FONT_I,
    )

    # --------------------------------------------------------- lampiran
    lampiran = [
        ("LAMPIRAN A: KETENTUAN UMUM PERJANJIAN", [
            "Ketentuan umum mengatur definisi, hak dan kewajiban PARA PIHAK, mekanisme komunikasi "
            "resmi, keadaan kahar, serta kerahasiaan informasi.",
            "Seluruh pemberitahuan resmi disampaikan tertulis ke alamat yang tercantum pada bagian "
            "pembuka Perjanjian, dengan tembusan elektronik ke pengawas pekerjaan.",
            "Keadaan kahar meliputi bencana alam, kebakaran, huru-hara, dan kebijakan pemerintah "
            "yang secara langsung menghalangi pelaksanaan pekerjaan.",
            "PIHAK KEDUA wajib menjaga kerahasiaan seluruh data teknis dan komersial milik PIHAK "
            "PERTAMA selama dan setelah Perjanjian berakhir.",
            "Pengalihan sebagian pekerjaan kepada subkontraktor hanya dapat dilakukan dengan "
            "persetujuan tertulis PIHAK PERTAMA dan tidak mengurangi tanggung jawab PIHAK KEDUA.",
        ]),
        ("LAMPIRAN B: SPESIFIKASI TEKNIS DAN TKDN", [
            "Tangki timbun berkapasitas 5.000 kiloliter dengan diameter 22 meter dan tinggi dinding "
            "14 meter, mengikuti standar API 650 edisi terakhir.",
            "Komitmen Tingkat Komponen Dalam Negeri yang wajib dipenuhi adalah %s dari total nilai "
            "barang dan jasa." % K["komitmen_tkdn"],
            "Pelat baja yang dipakai harus bersertifikat dalam negeri dengan nilai komponen dalam "
            "negeri paling rendah 42% pada tingkat produk, sebagaimana daftar produk terlampir.",
            "PIHAK KEDUA menyampaikan laporan realisasi TKDN setiap akhir termin disertai faktur "
            "dan sertifikat pendukung.",
            "Pengujian hidrostatik dilakukan selama 48 jam penuh dengan penurunan muka air yang "
            "diizinkan paling besar 3 milimeter.",
        ]),
        ("LAMPIRAN C: RINCIAN TERMIN PEMBAYARAN", [
            "Pembayaran dilakukan dalam 5 (lima) termin berdasarkan progres fisik terverifikasi.",
            "Termin kesatu sebesar Rp1.860.000.000,00 dibayarkan setelah mobilisasi dan penyelesaian "
            "pekerjaan pondasi, jatuh tempo 30 Mei 2026.",
            "Termin kedua sebesar Rp2.480.000.000,00 dibayarkan setelah fabrikasi pelat dinding "
            "mencapai 50%, jatuh tempo 28 Juni 2026.",
            "Termin ketiga sebesar Rp3.100.000.000,00 dibayarkan setelah ereksi dinding selesai, "
            "jatuh tempo 31 Juli 2026.",
            "Termin keempat sebesar Rp3.100.000.000,00 dibayarkan setelah pemasangan atap apung "
            "selesai, jatuh tempo 30 Agustus 2026.",
            "Termin kelima sebesar Rp1.860.000.000,00 dibayarkan setelah serah terima akhir, jatuh "
            "tempo 20 Oktober 2026.",
            "Tarif denda keterlambatan ditetapkan %s, dihitung dari nilai kontrak sebelum Pajak "
            "Pertambahan Nilai." % K["tarif_denda_harian"],
            "Akumulasi denda dibatasi paling tinggi %s." % K["batas_maksimum_denda"],
        ]),
        ("LAMPIRAN D: JANGKA WAKTU DAN JADWAL", [
            "Pekerjaan dimulai pada tanggal %s terhitung sejak diterbitkannya Surat Perintah Mulai "
            "Kerja." % K["tanggal_mulai"],
            "Seluruh pekerjaan diselesaikan selambat-lambatnya pada tanggal %s." % K["tanggal_berakhir"],
            "Mobilisasi peralatan berat diselesaikan paling lambat 5 Mei 2026.",
            "Pekerjaan pondasi diselesaikan paling lambat 25 Mei 2026.",
            "Ereksi dinding diselesaikan paling lambat 26 Juli 2026.",
            "Pengujian hidrostatik dilaksanakan pada rentang 20 sampai 27 September 2026.",
            "Masa pemeliharaan berakhir pada tanggal 3 April 2027.",
        ]),
    ]
    for judul, butir in lampiran:
        p._halaman_baru()
        p.baris(judul, font=FONT_B, size=12)
        p.kosong(0.5)
        for i, b in enumerate(butir, 1):
            p.paragraf("%d. %s" % (i, b))
            p.kosong(0.4)

    # ------------------------------------- pengisi sampai panjang sasaran
    pengisi = [
        ("LAMPIRAN E: PROSEDUR MUTU DAN INSPEKSI",
         "Inspeksi dilakukan pada setiap titik tunggu yang disepakati, mencakup pemeriksaan dimensi, "
         "uji tak rusak pada sambungan las, dan verifikasi sertifikat bahan. Hasil inspeksi "
         "dituangkan dalam laporan yang ditandatangani kedua belah pihak sebelum pekerjaan "
         "berikutnya dimulai."),
        ("LAMPIRAN F: KESELAMATAN DAN LINDUNGAN LINGKUNGAN",
         "PIHAK KEDUA menerapkan seluruh ketentuan Health, Safety, Security, and Environment yang "
         "berlaku di lingkungan PIHAK PERTAMA, termasuk kewajiban pelaporan insiden dalam waktu "
         "1x24 jam, penyediaan alat pelindung diri, dan pengelolaan limbah konstruksi sesuai "
         "peraturan yang berlaku."),
        ("LAMPIRAN G: DAFTAR PERALATAN DAN PERSONEL",
         "PIHAK KEDUA menugaskan Manajer Proyek, Ahli K3 Konstruksi, Ahli Las bersertifikat, dan "
         "Pengawas Lapangan yang kualifikasinya sesuai Dokumen Pemilihan. Penggantian personel inti "
         "hanya dapat dilakukan dengan persetujuan tertulis PIHAK PERTAMA."),
        ("LAMPIRAN H: PROSEDUR SERAH TERIMA",
         "Serah terima dilakukan melalui pemeriksaan bersama, penyusunan daftar temuan, penyelesaian "
         "temuan oleh PIHAK KEDUA, dan penandatanganan berita acara serah terima akhir. Masa "
         "pemeliharaan mulai berjalan sejak tanggal berita acara ditandatangani."),
    ]
    n = 0
    while p.doc.page_count < TARGET_HALAMAN:
        p._halaman_baru()
        judul, isi_teks = pengisi[n % len(pengisi)]
        p.baris("%s (lanjutan %d)" % (judul, n // len(pengisi) + 1), font=FONT_B, size=12)
        p.kosong(0.5)
        for j in range(4):
            p.paragraf("%d.%d. %s" % (n + 1, j + 1, isi_teks))
            p.kosong(0.4)
        n += 1


def main():
    os.makedirs(os.path.dirname(OUT_PDF), exist_ok=True)
    doc = pymupdf.open()
    isi(Penulis(doc))
    doc.set_metadata({"title": "Perjanjian Konstruksi Tangki Timbun KTR/2026/0163",
                      "author": "Dokumen sintetis VASKO"})
    doc.save(OUT_PDF, garbage=4, deflate=True)

    teks = " ".join(doc[i].get_text() for i in range(doc.page_count))
    rapi = " ".join(teks.split())
    halaman = doc.page_count
    doc.close()

    hilang = []
    for k, v in KUNCI.items():
        inti = LITERAL.get(k, v).split(" dari ")[0].split(" per ")[0]
        if inti not in rapi:
            hilang.append("%s (%s)" % (k, inti))

    with open(OUT_KEY, "w", encoding="utf-8") as f:
        json.dump(KUNCI, f, ensure_ascii=False, indent=2)

    print("PDF     : %s" % OUT_PDF)
    print("Kunci   : %s" % OUT_KEY)
    print("Halaman : %d" % halaman)
    print()
    print("Jebakan yang ditanam:")
    for k, catatan in JEBAKAN.items():
        print("  %-22s %s" % (k, catatan))
    print()
    if hilang:
        print("GAGAL: nilai kunci tidak terbaca kembali dari PDF: %s" % hilang)
        sys.exit(1)
    print("Seluruh %d nilai kunci terbaca kembali dari teks PDF." % len(KUNCI))


if __name__ == "__main__":
    main()
