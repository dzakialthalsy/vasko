# -*- coding: utf-8 -*-
"""Bangkitkan kontrak sintetis berformat template OCLC 01 (dokumen draft kontrak).

Dua kontrak contoh sebelumnya (KTR/2026/0142 dan KTR/2026/0163) disusun
bebas. Kontrak ini meniru susunan dan bunyi template Pertamina di folder
"dokumen draft kontrak": Pokok-Pokok Perjanjian, lalu Lampiran A sampai G
dengan kepala halaman "Lampiran X" dan kotak paraf di kaki halaman.
Placeholder template diisi data fiktif, lalu beberapa kesalahan ditanam
dengan sengaja.

Kesalahan yang ditanam, dan pemeriksaan yang seharusnya menangkapnya:

1. TERMIN_SAMA_NILAI. Termin 3 tertulis Rp1.875.000.000, padahal
   seharusnya Rp1.812.500.000 (25%). Jumlah termin jadi lebih besar
   Rp62.500.000 dari harga kontrak.
2. JAMINAN_MPP30. Pasal 5.9 Lampiran C memakai bunyi template, tetapi
   angkanya 14 hari kalender, bukan sekurang-kurangnya 30.
3. DENDA_DASAR_PPN. Harga kontrak belum termasuk PPN, tetapi denda
   dihitung dari harga kontrak yang sudah termasuk PPN.
4. LAMPIRAN_LENGKAP. Lampiran F (Asuransi) disebut di Pokok-Pokok
   Perjanjian tetapi halamannya tidak ada.
5. ISIAN_TEMPLATE. Dua isian template tertinggal: "(Fungsi Pemilik
   Pekerjaan)" di Lampiran B dan persentase Jaminan Pemeliharaan "....%"
   di Lampiran C.

Pemeriksaan yang seharusnya LULUS: URUTAN_TANGGAL, JAMINAN_NILAI (5%),
DENDA_MINIMAL (1/1000), DENDA_BATAS_JAMINAN (5% sama dengan jaminan).

Seluruh data fiktif. Jalankan: python scripts/generate_kontrak_oclc.py
"""
import json
import os
import sys

import pymupdf

NAMA_BERKAS = "KTR-2026-0187-Pemeliharaan-Perpipaan-FT-Samarinda.pdf"
OUT_PDF = os.path.join("public", "contoh", NAMA_BERKAS)
OUT_KEY = os.path.join("public", "contoh", "KTR-2026-0187.kunci.json")

# Frasa yang seharusnya disalin model untuk tiap medan (sesudah dirapikan
# kode), persis seperti tercetak di dokumen.
MEDAN = {
    "nomor_kontrak": "KTR/2026/0187",
    "nama_vendor": "PT Mitra Rekayasa Borneo",
    "nilai_kontrak": "Rp7.250.000.000",
    "nilai_termasuk_ppn": "belum termasuk Pajak Pertambahan Nilai (PPN)",
    "nilai_jaminan_pelaksanaan": "5% (lima persen) dari HARGA KONTRAK",
    "masa_berlaku_jaminan": (
        "selama MASA PENYELESAIAN PEKERJAAN sesuai yang ditetapkan pada Lampiran D KONTRAK ini, "
        "ditambah sekurang-kurangnya 14 (empat belas) HARI KALENDER"
    ),
    "lingkup_pekerjaan": "Pemeliharaan Perpipaan Fuel Terminal Samarinda",
    "komitmen_tkdn": "35%",
    "tarif_denda_harian": "1/1000 (satu per seribu) dari HARGA KONTRAK untuk setiap HARI KALENDER keterlambatan",
    "batas_maksimum_denda": "5% (lima persen) dari HARGA KONTRAK",
    "dasar_perhitungan_denda": "dihitung dari HARGA KONTRAK yang sudah termasuk Pajak Pertambahan Nilai",
    "jumlah_termin": "4 termin",
    "tanggal_mulai": "2 Maret 2026",
    "tanggal_berakhir": "31 Agustus 2026",
    "masa_pemeliharaan": "90 (sembilan puluh) HARI KALENDER",
}

# Termin sebagaimana TERTULIS di dokumen, termasuk kesalahan pada termin 3.
TERMIN = [
    {"urutan": 1, "persen": "30%", "nilai": "Rp2.175.000.000", "jatuh_tempo": "30 April 2026",
     "syarat": "setelah prestasi fisik PEKERJAAN mencapai 30% (tiga puluh persen)"},
    {"urutan": 2, "persen": "30%", "nilai": "Rp2.175.000.000", "jatuh_tempo": "30 Juni 2026",
     "syarat": "setelah prestasi fisik PEKERJAAN mencapai 60% (enam puluh persen)"},
    {"urutan": 3, "persen": "25%", "nilai": "Rp1.875.000.000", "jatuh_tempo": "15 September 2026",
     "syarat": "setelah BERITA ACARA PENYELESAIAN PEKERJAAN (BAPP) ditandatangani PARA PIHAK"},
    {"urutan": 4, "persen": "15%", "nilai": "Rp1.087.500.000", "jatuh_tempo": "15 Desember 2026",
     "syarat": "setelah verifikasi TKDN dan BERITA ACARA SELESAI MASA PEMELIHARAAN (BASMP)"},
]

# Hasil validasi yang seharusnya keluar bila seluruh medan terbaca benar dan
# tidak ada dokumen pendukung yang diunggah.
VALIDASI = {
    "temuan": {
        "TERMIN_SAMA_NILAI": "MERAH",
        "JAMINAN_MPP30": "MERAH",
        "DENDA_DASAR_PPN": "KUNING",
        "LAMPIRAN_LENGKAP": "KUNING",
        "ISIAN_TEMPLATE": "KUNING",
    },
    "lulus": ["URUTAN_TANGGAL", "JAMINAN_NILAI", "DENDA_MINIMAL", "DENDA_BATAS_JAMINAN"],
    "lampiran_ada": ["A", "B", "C", "D", "E", "G"],
}

JUDUL = MEDAN["lingkup_pekerjaan"]

W, H = 595.0, 842.0
ML, MR, MT, MB = 64, 64, 70, 96
LEAD = 14.0
FS = 10
FONT_R, FONT_B = "helv", "hebo"


class Penulis:
    """Menulis baris demi baris. Kepala halaman "Lampiran X" ditulis paling
    dulu di tiap halaman, seperti urutan teks pada PDF template asli."""

    def __init__(self, doc):
        self.doc = doc
        self.page = None
        self.y = 0.0
        self.bagian = None
        self.halaman_bagian = {}

    def bagian_baru(self, nama):
        self.bagian = nama
        self.halaman_baru()

    def halaman_baru(self):
        self.page = self.doc.new_page(width=W, height=H)
        self.halaman_bagian.setdefault(self.bagian, []).append(self.page.number)
        self.y = MT
        if self.bagian and self.bagian.startswith("Lampiran"):
            lebar = pymupdf.get_text_length(self.bagian, fontname=FONT_R, fontsize=9)
            self.page.insert_text((W - MR - lebar, 44), self.bagian, fontname=FONT_R, fontsize=9)

    def kosong(self, n=1):
        self.y += LEAD * n

    def baris(self, teks, font=FONT_R, size=FS, indent=0, tengah=False):
        if self.y + LEAD > H - MB:
            self.halaman_baru()
        lebar = pymupdf.get_text_length(teks, fontname=font, fontsize=size)
        x = (W - lebar) / 2 if tengah else ML + indent
        self.page.insert_text((x, self.y), teks, fontname=font, fontsize=size)
        self.y += LEAD

    def paragraf(self, teks, indent=0, gantung=0, font=FONT_R):
        """gantung: lebar nomor butir, supaya baris lanjutan menjorok."""
        maks = W - ML - MR - indent
        baris, kini = [], ""
        for k in teks.split():
            uji = (kini + " " + k).strip()
            batas = maks - (gantung if baris else 0)
            if pymupdf.get_text_length(uji, fontname=font, fontsize=FS) <= batas:
                kini = uji
            else:
                baris.append(kini)
                kini = k
        if kini:
            baris.append(kini)
        # Butir pendek tidak dipotong pergantian halaman, supaya frasa kunci
        # tidak terbelah oleh kepala dan kaki halaman.
        if len(baris) <= 6 and self.y + LEAD * len(baris) > H - MB:
            self.halaman_baru()
        for i, b in enumerate(baris):
            self.baris(b, font=font, indent=indent + (gantung if i else 0))

    def butir(self, nomor, teks, indent=0):
        lebar = 24 if len(nomor) <= 3 else 30
        self.paragraf("%s %s" % (nomor, teks), indent=indent, gantung=lebar)
        self.kosong(0.25)

    def judul(self, teks):
        if self.y + LEAD * 4 > H - MB:
            self.halaman_baru()
        self.kosong(0.4)
        self.baris(teks, font=FONT_B, size=10.5, tengah=True)

    def pasal(self, nomor, nama):
        if self.y + LEAD * 5 > H - MB:
            self.halaman_baru()
        self.kosong(0.5)
        self.baris("PASAL %d" % nomor, font=FONT_B, tengah=True)
        self.baris(nama, font=FONT_B, tengah=True)
        self.kosong(0.3)

    def kaki_halaman(self):
        """Kotak paraf dan nomor halaman per bagian, seperti template asli."""
        for bagian, nomor_halaman in self.halaman_bagian.items():
            jumlah = len(nomor_halaman)
            for urut, n in enumerate(nomor_halaman, start=1):
                pg = self.doc[n]
                y0 = H - 82
                pg.draw_rect(pymupdf.Rect(ML, y0, W - MR, y0 + 50), width=0.6)
                pg.insert_text((ML + 6, y0 + 14), JUDUL, fontname=FONT_R, fontsize=7.5)
                pg.insert_text((ML + 6, y0 + 28), "PARAF KONTRAKTOR", fontname=FONT_B, fontsize=7.5)
                pg.insert_text((ML + 6, y0 + 42), "Dokumen sintetis, data fiktif", fontname=FONT_R, fontsize=6.5)
                pg.insert_text((ML + 170, y0 + 28), "PARAF PERUSAHAAN", fontname=FONT_B, fontsize=7.5)
                pg.insert_text((ML + 170, y0 + 42), "Fungsi User    Fungsi Procurement    Fungsi Legal",
                               fontname=FONT_R, fontsize=7.5)
                teks = "Hal %d dari %d" % (urut, jumlah)
                lebar = pymupdf.get_text_length(teks, fontname=FONT_R, fontsize=7.5)
                pg.insert_text((W - MR - lebar - 6, y0 + 14), teks, fontname=FONT_R, fontsize=7.5)


def pokok_perjanjian(p):
    M = MEDAN
    p.bagian_baru("Pokok-Pokok Perjanjian")
    p.baris("POKOK-POKOK PERJANJIAN", font=FONT_B, size=11, tengah=True)
    p.baris(JUDUL.upper(), font=FONT_B, size=11, tengah=True)
    p.baris("(MODEL OCLC 01)", font=FONT_B, tengah=True)
    p.kosong(0.5)
    p.baris("No. Kontrak : %s" % M["nomor_kontrak"], font=FONT_B, tengah=True)
    p.baris("No. PO : 4510298871", font=FONT_B, tengah=True)
    p.kosong()
    p.paragraf(
        "Perjanjian ini (\"KONTRAK\") dibuat dan ditandatangani pada tanggal 23 Februari 2026 "
        "(\"TANGGAL KONTRAK\"), oleh:"
    )
    p.kosong(0.5)
    p.butir("I.", (
        "PT Pertamina Patra Niaga, suatu perusahaan yang didirikan berdasarkan hukum Indonesia, berkedudukan "
        "dan berkantor pusat di Jakarta Selatan, dalam hal ini diwakili oleh Hendra Kusumawardana selaku "
        "Manager Procurement Regional Kalimantan, selanjutnya dalam KONTRAK ini disebut \"PERUSAHAAN\", dan"
    ))
    p.butir("II.", (
        "%s, suatu perusahaan yang didirikan berdasarkan hukum Indonesia, berkedudukan dan berkantor pusat di "
        "Samarinda, dalam hal ini diwakili oleh Rizal Pratama Siregar selaku Direktur Utama, selanjutnya dalam "
        "KONTRAK ini disebut \"KONTRAKTOR\"." % M["nama_vendor"]
    ))
    p.paragraf(
        "Selanjutnya PERUSAHAAN dan KONTRAKTOR secara sendiri-sendiri disebut \"PIHAK\" dan secara "
        "bersama-sama disebut \"PARA PIHAK\"."
    )
    p.judul("BAHWASANYA;")
    p.paragraf(
        "PERUSAHAAN mempunyai kegiatan usaha di bidang energi yaitu minyak dan gas bumi, energi baru dan "
        "terbarukan, dan dalam kaitannya dengan hal tersebut PERUSAHAAN memerlukan dilakukannya pekerjaan "
        "sebagaimana diatur dalam KONTRAK ini; dan"
    )
    p.paragraf(
        "KONTRAKTOR adalah perusahaan yang mempunyai kemampuan dan pengalaman serta sanggup untuk "
        "melaksanakan pekerjaan yang diperlukan oleh PERUSAHAAN."
    )
    p.judul("BERDASARKAN PERTIMBANGAN DI ATAS, PARA PIHAK MENYEPAKATI HAL-HAL BERIKUT:")
    p.butir("1.", "Dokumen-dokumen yang disebut di bawah merupakan bagian yang tidak terpisahkan dari KONTRAK ini:")
    for huruf, isi in [
        ("A.", "Lampiran A : Syarat-syarat dan Ketentuan-ketentuan Umum."),
        ("B.", "Lampiran B : Lingkup Pekerjaan."),
        ("C.", "Lampiran C : Harga Kontrak dan Ketentuan Pembayaran."),
        ("D.", "Lampiran D : Jangka Waktu dan Jadwal Pelaksanaan Pekerjaan."),
        ("E.", "Lampiran E : Health, Safety, Environment (HSE) dan Contractor Safety Management System (CSMS)."),
        ("F.", "Lampiran F : Asuransi."),
        ("G.", "Lampiran G : Lain-lain."),
    ]:
        p.butir(huruf, isi, indent=24)
    p.butir("2.", (
        "Pekerjaan yang harus dilaksanakan oleh KONTRAKTOR adalah %s dengan ruang lingkup sebagaimana "
        "diuraikan dalam Lampiran B dan harus diselesaikan sesuai dengan jadwal yang diuraikan dalam "
        "Lampiran D (\"PEKERJAAN\")." % JUDUL
    ))
    p.butir("3.", (
        "Nilai PEKERJAAN yang harus dibayar oleh PERUSAHAAN adalah sebesar %s,00 (tujuh miliar dua ratus "
        "lima puluh juta Rupiah) %s sebesar 11%% dengan tata cara pembayaran sebagaimana diuraikan dalam "
        "Lampiran C (\"HARGA KONTRAK\")." % (M["nilai_kontrak"], M["nilai_termasuk_ppn"])
    ))
    p.butir("4.", (
        "KONTRAK ini mulai berlaku pada TANGGAL KONTRAK dan akan tetap berlaku sampai dengan 6 (enam) bulan "
        "setelah berakhirnya MASA PENYELESAIAN PEKERJAAN dan Masa Pemeliharaan sebagaimana diuraikan dalam "
        "Lampiran D (\"JANGKA WAKTU KONTRAK\"), kecuali diakhiri lebih awal sesuai dengan ketentuan KONTRAK ini."
    ))
    p.paragraf(
        "KONTRAK ini dibuat dalam rangkap 2 (dua), masing-masing mempunyai kekuatan hukum yang sama, dan "
        "ditandatangani di atas meterai cukup oleh PARA PIHAK."
    )
    p.kosong()
    p.baris("PERUSAHAAN", font=FONT_B, indent=40)
    p.y -= LEAD
    p.baris("KONTRAKTOR", font=FONT_B, indent=290)
    p.kosong(2.5)
    p.baris("Nama : Hendra Kusumawardana", indent=0)
    p.y -= LEAD
    p.baris("Nama : Rizal Pratama Siregar", indent=250)
    p.baris("Jabatan : Manager Procurement Regional Kalimantan", indent=0)
    p.y -= LEAD
    p.baris("Jabatan : Direktur Utama", indent=250)


def lampiran_a(p):
    p.bagian_baru("Lampiran A")
    p.baris("SYARAT-SYARAT DAN KETENTUAN-KETENTUAN UMUM", font=FONT_B, size=10.5, tengah=True)
    p.pasal(1, "DEFINISI")
    p.paragraf(
        "Kata-kata dan/atau istilah-istilah di bawah yang digunakan dalam KONTRAK ini mempunyai arti "
        "sebagai berikut:"
    )
    for n, isi in [
        ("a.", "HARGA KONTRAK adalah nilai yang disebut dalam Pokok-Pokok Perjanjian dan dirinci dalam Lampiran C."),
        ("b.", "JAMINAN PELAKSANAAN adalah jaminan tertulis yang diserahkan oleh KONTRAKTOR kepada PERUSAHAAN "
               "sebagaimana diatur dalam Lampiran C."),
        ("c.", "MASA PENYELESAIAN PEKERJAAN yaitu jangka waktu yang diperlukan untuk menyelesaikan PEKERJAAN "
               "sebagaimana diatur dalam Lampiran D."),
        ("d.", "TANGGAL DIMULAINYA PEKERJAAN adalah tanggal sebagaimana diatur dalam Lampiran D."),
        ("e.", "TANGGAL SELESAINYA PEKERJAAN adalah tanggal sebagaimana diatur dalam Lampiran D."),
    ]:
        p.butir(n, isi, indent=12)
    p.pasal(2, "ISI DAN PENAFSIRAN ISI KONTRAK")
    p.butir("2.1", (
        "Apabila terdapat perbedaan atau pertentangan antara Pokok-Pokok Perjanjian dengan Lampiran-lampiran "
        "KONTRAK, maka yang berlaku adalah Pokok-Pokok Perjanjian."
    ))
    p.butir("2.2", (
        "Judul pasal dalam KONTRAK ini hanya untuk memudahkan pembacaan dan tidak mempengaruhi penafsiran "
        "isi KONTRAK."
    ))
    p.pasal(16, "PEMBAYARAN")
    p.butir("16.1", (
        "PERUSAHAAN akan membayar HARGA KONTRAK kepada KONTRAKTOR sesuai dengan tata cara pembayaran yang "
        "diatur di dalam Lampiran C."
    ))
    p.butir("16.2", (
        "PERUSAHAAN berhak untuk menolak membayar tagihan apabila dokumen tagihan tidak lengkap atau tidak "
        "sesuai dengan ketentuan KONTRAK."
    ))
    p.pasal(18, "PENILAIAN KINERJA DAN DENDA")
    p.butir("18.1", (
        "PERUSAHAAN berhak memberikan penghargaan dan/atau sanksi administratif sesuai TABEL PENILAIAN KINERJA."
    ))
    p.butir("18.2", "PERUSAHAAN berhak memberikan denda finansial seperti diatur dalam Lampiran C terhadap KONTRAKTOR.")
    p.butir("18.3", "PERUSAHAAN berhak memotong sanksi atau denda yang berbentuk uang dari pembayaran HARGA KONTRAK.")
    p.butir("18.4", (
        "Pengenaan satu sanksi atau denda tidak mengecualikan pengenaan sanksi atau denda lainnya. Pengenaan "
        "denda dan/atau sanksi administratif tidak meniadakan hak PERUSAHAAN untuk juga melakukan pemutusan "
        "KONTRAK dan/atau pencairan JAMINAN."
    ))


def lampiran_b(p):
    M = MEDAN
    p.bagian_baru("Lampiran B")
    p.baris("LINGKUP PEKERJAAN", font=FONT_B, size=10.5, tengah=True)
    p.pasal(1, "DEFINISI TAMBAHAN")
    # Kesalahan 5a: isian template yang tertinggal.
    p.butir("1.", (
        "PENGGUNA BARANG/JASA adalah fungsi pemilik pekerjaan yaitu (Fungsi Pemilik Pekerjaan) PERUSAHAAN."
    ))
    p.butir("2.", "LOKASI PEKERJAAN adalah Fuel Terminal Samarinda, Jalan Cendana Nomor 1, Samarinda, milik PERUSAHAAN.")
    p.butir("3.", (
        "LAPORAN HARIAN merupakan laporan yang memuat rencana kegiatan dan hasil pekerjaan yang telah "
        "dilaksanakan oleh KONTRAKTOR, dibuat setiap hari dan disampaikan kepada Pengawas Pekerjaan."
    ))
    p.butir("4.", (
        "BERITA ACARA PENYELESAIAN PEKERJAAN (BAPP) adalah berita acara yang menyatakan kemajuan pekerjaan "
        "telah mencapai 100% secara fisik dan diterima oleh PERUSAHAAN."
    ))
    p.pasal(2, "RUANG LINGKUP PEKERJAAN")
    p.butir("1.", (
        "KONTRAKTOR wajib melaksanakan PEKERJAAN di LOKASI PEKERJAAN sesuai ketentuan KONTRAK dan DOKUMEN "
        "PENGADAAN dengan lingkup PEKERJAAN sebagai berikut:"
    ))
    for n, isi in [
        ("a.", "penggantian pipa distribusi 8 inci sepanjang 420 meter beserta flange dan gasket;"),
        ("b.", "pengecatan ulang dan perbaikan coating pipa di atas tanah sepanjang 1.150 meter;"),
        ("c.", "pemeriksaan ketebalan dinding pipa dengan metode ultrasonic pada 24 titik; dan"),
        ("d.", "uji tekan hidrostatik seluruh jalur yang diganti."),
    ]:
        p.butir(n, isi, indent=24)
    p.butir("2.", (
        "Rincian lingkup dan tahapan seluruh PEKERJAAN mengacu pada dokumen Bill of Quantity (BoQ) dan Rencana "
        "Kerja dan Syarat-syarat (RKS) yang merupakan bagian tidak terpisahkan dari KONTRAK ini."
    ))
    p.pasal(7, "MASA PEMELIHARAAN")
    p.butir("1.", (
        "KONTRAKTOR wajib melaksanakan pemeliharaan atas hasil PEKERJAAN dan fasilitas yang dipasang selama "
        "jangka waktu sebagaimana diatur dalam Lampiran D."
    ))
    p.butir("2.", (
        "Apabila terdapat perbaikan atau penggantian material pada Masa Pemeliharaan, maka Masa Pemeliharaan "
        "untuk material tersebut diperpanjang 1 (satu) kali untuk jangka waktu maksimum 30 (tiga puluh) "
        "HARI KALENDER."
    ))
    p.pasal(9, "PEMENUHAN KETENTUAN TINGKAT KOMPONEN DALAM NEGERI")
    p.paragraf(
        "PERUSAHAAN memiliki komitmen untuk menerapkan ketentuan Tingkat Komponen Dalam Negeri pada project "
        "atau pengadaan sesuai dengan ketentuan dan perundangan yang berlaku. Untuk memenuhi hal tersebut, "
        "KONTRAKTOR wajib mematuhi dan menjalankan ketentuan terkait dengan TKDN sebagai berikut:"
    )
    p.kosong(0.3)
    p.butir("1.", (
        "Nilai minimum TKDN (%% TKDN) yang wajib dipenuhi oleh KONTRAKTOR adalah sebesar %s (tiga puluh lima "
        "persen) sebagaimana dicantumkan pada Form A4: Pernyataan Komitmen TKDN dalam Penawaran Jasa, serta "
        "Form A6 Peta Jalur (Roadmap) Komitmen TKDN." % M["komitmen_tkdn"]
    ))
    p.butir("2.", (
        "Verifikasi TKDN dilaksanakan setelah masa penyelesaian pekerjaan berakhir sampai dengan maksimum 3 "
        "(tiga) bulan setelah masa penyelesaian pekerjaan berakhir."
    ))
    p.butir("3.", (
        "Besaran persentase sanksi finansial atas ketidaktercapaian komitmen TKDN adalah maksimal 15% dari "
        "harga penawaran setelah negosiasi."
    ))
    p.butir("4.", (
        "Untuk memastikan proses verifikasi TKDN maka pembayaran atas tagihan terakhir akan ditahan senilai "
        "15% dari nilai kontrak."
    ))


def lampiran_c(p):
    M = MEDAN
    p.bagian_baru("Lampiran C")
    p.baris("LAMPIRAN C", font=FONT_B, size=10.5, tengah=True)
    p.baris("HARGA KONTRAK DAN KETENTUAN PEMBAYARAN", font=FONT_B, size=10.5, tengah=True)
    p.pasal(1, "HARGA KONTRAK")
    p.butir("1.1.", (
        "HARGA KONTRAK dinyatakan dalam mata uang RUPIAH, adalah sebesar %s,00 (tujuh miliar dua ratus lima "
        "puluh juta Rupiah) belum termasuk Pajak Pertambahan Nilai, dengan rincian sebagaimana tertuang "
        "dalam Bill of Quantity yang merupakan bagian tidak terpisahkan dari KONTRAK ini." % M["nilai_kontrak"]
    ))
    p.pasal(2, "TATA CARA PEMBAYARAN")
    p.butir("2.1.", (
        "Pembayaran kepada KONTRAKTOR dilakukan dalam 4 (empat) termin berdasarkan prestasi PEKERJAAN "
        "sebagai berikut:"
    ))
    for t in TERMIN:
        p.butir("%s." % "abcd"[t["urutan"] - 1], (
            "Termin %d sebesar %s dari HARGA KONTRAK, yaitu %s, dibayarkan %s, paling lambat tanggal %s."
            % (t["urutan"], t["persen"], t["nilai"], t["syarat"], t["jatuh_tempo"])
        ), indent=30)
    p.butir("2.2.", (
        "KONTRAKTOR wajib menagih kepada PERUSAHAAN untuk PEKERJAAN yang telah dilaksanakan dan diterima "
        "dengan baik selambat-lambatnya 30 (tiga puluh) HARI KALENDER setelah ditandatanganinya Berita Acara "
        "Serah Terima Pekerjaan."
    ))
    p.butir("2.3.", (
        "Pembayaran akan dilakukan dengan transfer ke rekening Bank KONTRAKTOR: Bank Mandiri Cabang "
        "Samarinda, No. Rekening 148-00-2231987-4, atas nama %s." % M["nama_vendor"]
    ))
    p.pasal(3, "PAJAK DAN PUNGUTAN")
    p.paragraf(
        "Semua pajak, bea meterai, iuran, retribusi dan/atau pungutan lain dalam pelaksanaan KONTRAK ini "
        "menjadi beban dan tanggung jawab masing-masing PIHAK sesuai ketentuan peraturan perundang-undangan "
        "perpajakan yang berlaku di Indonesia."
    )
    p.pasal(4, "DENDA")
    p.paragraf(
        "Dalam hal terdapat keterlambatan penyelesaian PEKERJAAN, KONTRAKTOR akan dikenakan denda yang "
        "dikurangkan langsung dari nilai pembayaran atau dengan cara mencairkan sebagian atau seluruh nilai "
        "Jaminan Pelaksanaan."
    )
    p.kosong(0.3)
    p.butir("4.1.", "Denda keterlambatan dikenakan sebesar %s." % M["tarif_denda_harian"])
    # Kesalahan 3: dasar denda bertentangan dengan keterangan PPN harga kontrak.
    p.butir("4.2.", "Denda keterlambatan %s." % M["dasar_perhitungan_denda"])
    p.butir("4.3.", "Jumlah denda keterlambatan paling banyak sebesar %s." % M["batas_maksimum_denda"])
    p.pasal(5, "JAMINAN PELAKSANAAN")
    p.butir("5.1.", (
        "Sebelum penandatanganan KONTRAK, KONTRAKTOR wajib menyerahkan kepada PERUSAHAAN Jaminan Pelaksanaan "
        "sebesar %s yang dibuat dengan mengacu kepada informasi atau identitas terkait KONTRAK meliputi "
        "sekurang-kurangnya judul KONTRAK." % M["nilai_jaminan_pelaksanaan"]
    ))
    p.butir("5.2.", "JAMINAN PELAKSANAAN disampaikan selambat-lambatnya pada saat penandatanganan KONTRAK.")
    p.butir("5.3.", (
        "Jaminan Pelaksanaan harus diterbitkan oleh bank yang berstatus BUMN/BUMD atau Bank Umum Swasta "
        "Nasional yang beroperasi di wilayah Negara Republik Indonesia."
    ))
    p.butir("5.4.", "Nilai pencairan JAMINAN PELAKSANAAN paling tinggi sebesar nilai JAMINAN PELAKSANAAN.")
    # Kesalahan 2: bunyi template, angka di bawah 30 hari kalender.
    p.butir("5.9.", "Masa berlaku JAMINAN PELAKSANAAN adalah %s." % M["masa_berlaku_jaminan"])
    p.pasal(6, "JAMINAN PEMELIHARAAN")
    # Kesalahan 5b: persentase Jaminan Pemeliharaan belum diisi.
    p.butir("6.1.", (
        "Sebelum penandatanganan Berita Acara Serah Terima Pekerjaan, KONTRAKTOR wajib menyerahkan Jaminan "
        "Pemeliharaan sebesar ....% (...... persen) dari HARGA KONTRAK."
    ))
    p.butir("6.2.", (
        "Masa berlaku JAMINAN PEMELIHARAAN adalah selama MASA PEMELIHARAAN sesuai yang ditetapkan pada "
        "Lampiran D KONTRAK ini ditambah sekurang-kurangnya 30 (tiga puluh) HARI KALENDER."
    ))


def lampiran_d(p):
    M = MEDAN
    p.bagian_baru("Lampiran D")
    p.baris("JANGKA WAKTU DAN JADWAL PELAKSANAAN PEKERJAAN", font=FONT_B, size=10.5, tengah=True)
    p.kosong(0.5)
    p.butir("1.", (
        "JANGKA WAKTU KONTRAK terhitung sejak TANGGAL DIMULAINYA PEKERJAAN dan akan tetap berlaku sampai "
        "dengan 6 (enam) BULAN KALENDER setelah berakhirnya MASA PENYELESAIAN PEKERJAAN dan Masa "
        "Pemeliharaan, kecuali dilakukan pemutusan lebih awal sesuai yang diatur dalam KONTRAK ini."
    ))
    p.butir("2.", (
        "TANGGAL DIMULAINYA PEKERJAAN adalah terhitung sejak ditandatanganinya Surat Perintah Pelaksanaan "
        "Pekerjaan Mendahului Kontrak (SP3MK) yaitu pada tanggal %s." % M["tanggal_mulai"]
    ))
    p.butir("3.", "MASA PENYELESAIAN PEKERJAAN adalah selama 213 HARI KALENDER dengan rincian sebagai berikut:")
    p.butir("a.", (
        "Masa Penyelesaian Lingkup adalah selama 6 (enam) BULAN KALENDER sejak TANGGAL DIMULAINYA PEKERJAAN."
    ), indent=24)
    p.butir("b.", (
        "Masa Penyelesaian Administrasi adalah selama 30 (tiga puluh) HARI KALENDER terhitung setelah "
        "berakhirnya Masa Penyelesaian Lingkup."
    ), indent=24)
    p.butir("4.", (
        "Masa Pemeliharaan adalah selama %s terhitung setelah berakhirnya Masa Penyelesaian Lingkup."
        % M["masa_pemeliharaan"]
    ))
    p.butir("5.", (
        "TANGGAL SELESAINYA PEKERJAAN adalah 6 (enam) BULAN KALENDER terhitung sejak TANGGAL DIMULAINYA "
        "PEKERJAAN yaitu pada tanggal %s." % M["tanggal_berakhir"]
    ))
    p.butir("6.", (
        "Tanggal berakhirnya JANGKA WAKTU KONTRAK adalah saat Masa Penyelesaian Lingkup ditambah Masa "
        "Pemeliharaan ditambah 6 (enam) BULAN KALENDER, yaitu pada tanggal 29 Mei 2027."
    ))


def lampiran_e(p):
    p.bagian_baru("Lampiran E")
    p.baris("HEALTH, SAFETY, SECURITY & ENVIRONMENTAL (HSSE)", font=FONT_B, size=10.5, tengah=True)
    p.kosong(0.5)
    for n, isi in [
        ("1.", "KONTRAKTOR wajib mematuhi seluruh ketentuan HSSE PERUSAHAAN yang berlaku di LOKASI PEKERJAAN."),
        ("2.", "KONTRAKTOR wajib memiliki sertifikat CSMS yang masih berlaku dengan nilai paling rendah kategori "
               "sedang selama MASA PENYELESAIAN PEKERJAAN."),
        ("3.", "Pekerjaan panas di area tangki dan perpipaan hanya boleh dilakukan setelah izin kerja panas "
               "diterbitkan oleh Pengawas Pekerjaan."),
        ("4.", "Setiap kecelakaan kerja wajib dilaporkan kepada Direksi Pekerjaan paling lambat 1 x 24 (satu kali "
               "dua puluh empat) jam sejak kejadian."),
    ]:
        p.butir(n, isi)


def lampiran_g(p):
    p.bagian_baru("Lampiran G")
    p.baris("LAIN-LAIN", font=FONT_B, size=10.5, tengah=True)
    p.kosong(0.5)
    p.butir("1.", "DIREKSI PEKERJAAN")
    p.butir("1.1", (
        "Pejabat yang mewakili PERUSAHAAN selaku Direksi Pekerjaan adalah Fuel Terminal Manager Samarinda."
    ), indent=24)
    p.butir("1.2", (
        "Pejabat yang mewakili PERUSAHAAN selaku Pengawas Pekerjaan adalah Supervisor Maintenance Planning "
        "and Support Fuel Terminal Samarinda."
    ), indent=24)
    p.butir("2.", "DOKUMEN PENGADAAN")
    p.paragraf(
        "Dokumen pengadaan yang menjadi bagian tidak terpisahkan dari KONTRAK ini meliputi Rencana Kerja dan "
        "Syarat-syarat, Berita Acara Rapat Penjelasan, Berita Acara Klarifikasi dan Negosiasi, serta "
        "Penawaran KONTRAKTOR.", indent=24
    )
    p.kosong(0.3)
    p.butir("3.", "ALAMAT KORESPONDENSI")
    p.paragraf(
        "PERUSAHAAN: Fuel Terminal Samarinda, Jalan Cendana Nomor 1, Samarinda. KONTRAKTOR: %s, Jalan "
        "Juanda Nomor 77, Samarinda." % MEDAN["nama_vendor"], indent=24
    )


def main():
    os.makedirs(os.path.dirname(OUT_PDF), exist_ok=True)
    doc = pymupdf.open()
    p = Penulis(doc)
    pokok_perjanjian(p)
    lampiran_a(p)
    lampiran_b(p)
    lampiran_c(p)
    lampiran_d(p)
    lampiran_e(p)
    # Kesalahan 4: Lampiran F (Asuransi) sengaja tidak dibuat.
    lampiran_g(p)
    p.kaki_halaman()
    doc.set_metadata({
        "title": "Kontrak %s %s" % (MEDAN["nomor_kontrak"], JUDUL),
        "author": "Dokumen sintetis VASKO, format OCLC 01",
    })
    doc.save(OUT_PDF, garbage=4, deflate=True)

    rapi = " ".join(" ".join(doc[i].get_text() for i in range(doc.page_count)).split())
    halaman = doc.page_count
    doc.close()

    hilang = [k for k, v in MEDAN.items() if v not in rapi and k != "jumlah_termin"]
    hilang += ["termin %d" % t["urutan"] for t in TERMIN if t["nilai"] not in rapi]

    kunci = {
        "medan": MEDAN,
        "termin": [{"urutan": t["urutan"], "nilai": t["nilai"], "jatuh_tempo": t["jatuh_tempo"]} for t in TERMIN],
        "validasi": VALIDASI,
    }
    with open(OUT_KEY, "w", encoding="utf-8") as f:
        json.dump(kunci, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("PDF     : %s" % OUT_PDF)
    print("Kunci   : %s" % OUT_KEY)
    print("Halaman : %d" % halaman)
    print("Temuan yang seharusnya keluar: %s" % ", ".join(VALIDASI["temuan"]))
    if hilang:
        print("GAGAL: frasa kunci tidak terbaca kembali dari PDF: %s" % hilang)
        sys.exit(1)
    print("Seluruh frasa kunci terbaca kembali dari teks PDF.")


if __name__ == "__main__":
    main()
