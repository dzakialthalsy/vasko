# -*- coding: utf-8 -*-
"""Bangkitkan PDF kontrak sintetis untuk menguji alur ekstraksi.

Seluruh isi dokumen ini fiktif dan disusun tim, bukan dokumen operasional
PT Pertamina Patra Niaga. Ini sejalan dengan rencana pengujian memakai data
sintetis pada bagian 3.d proposal.

Nilai medan kuncinya sengaja dibuat sama persis dengan yang tampil pada
rancangan layar Verifikasi Hasil Ekstraksi AI, sehingga hasil ekstraksi
dapat dibandingkan terhadap kunci jawaban yang sudah diketahui.

Jalankan: python scripts/generate_sample_contract.py
"""
import json
import os
import sys

import pymupdf

OUT_PDF = os.path.join("public", "contoh", "KTR-2026-0142-Pemeliharaan-Terminal-BBM-Balikpapan.pdf")
OUT_KEY = os.path.join("public", "contoh", "KTR-2026-0142.kunci.json")

# Kunci jawaban. Dipakai menghitung akurasi per medan pada uji ekstraksi.
KUNCI = {
    "nomor_kontrak": "KTR/2026/0142",
    "nama_vendor": "PT Sumber Jaya Abadi",
    "nilai_kontrak": "Rp4.850.000.000",
    "lingkup_pekerjaan": "Pemeliharaan Terminal BBM Balikpapan",
    "komitmen_tkdn": "42%",
    "tarif_denda_harian": "1/1000 dari nilai kontrak per hari",
    "batas_maksimum_denda": "5% dari nilai kontrak",
    "jumlah_termin": "3 termin",
    "tanggal_mulai": "15 Maret 2026",
    "tanggal_berakhir": "12 September 2026",
}

W, H = 595.0, 842.0          # A4 potret, satuan titik
ML, MR, MT, MB = 72, 72, 72, 64
LEAD = 15.5
FS = 10.5

FONT_R = "helv"
FONT_B = "hebo"
FONT_I = "heit"


class Penulis:
    """Penata letak sederhana yang mengalir antar halaman."""

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
            self.page.insert_text(
                (W - MR - 60, H - MB + 24), "Halaman %d" % n,
                fontname=FONT_R, fontsize=8, color=(0.55, 0.6, 0.65),
            )
            self.page.insert_text(
                (ML, H - MB + 24), "KTR/2026/0142",
                fontname=FONT_R, fontsize=8, color=(0.55, 0.6, 0.65),
            )

    def ruang(self, tinggi):
        if self.y + tinggi > H - MB:
            self._halaman_baru()

    def kosong(self, n=1):
        self.y += LEAD * n

    def baris(self, teks, font=FONT_R, size=FS, indent=0, tengah=False):
        self.ruang(LEAD)
        lebar = pymupdf.get_text_length(teks, fontname=font, fontsize=size)
        x = (W - lebar) / 2 if tengah else ML + indent
        self.page.insert_text((x, self.y), teks, fontname=font, fontsize=size)
        self.y += LEAD

    def paragraf(self, teks, font=FONT_R, size=FS, indent=0, rata_tengah=False):
        maks = W - ML - MR - indent
        kata = teks.split()
        baris, kini = [], ""
        for k in kata:
            uji = (kini + " " + k).strip()
            if pymupdf.get_text_length(uji, fontname=font, fontsize=size) <= maks:
                kini = uji
            else:
                baris.append(kini)
                kini = k
        if kini:
            baris.append(kini)
        for b in baris:
            self.baris(b, font=font, size=size, indent=indent, tengah=rata_tengah)

    def judul_pasal(self, teks):
        self.ruang(LEAD * 3)
        self.kosong(0.5)
        self.baris(teks, font=FONT_B, size=11)
        self.kosong(0.3)


def isi_dokumen(p):
    # ---------------------------------------------------------- sampul
    p.kosong(4)
    p.baris("PERJANJIAN PEMELIHARAAN TERMINAL BBM", font=FONT_B, size=15, tengah=True)
    p.kosong(0.6)
    p.baris("Nomor: %s" % KUNCI["nomor_kontrak"], font=FONT_B, size=12, tengah=True)
    p.kosong(2)
    p.baris("antara", font=FONT_R, size=11, tengah=True)
    p.kosong(1)
    p.baris("PT PERTAMINA PATRA NIAGA REGIONAL KALIMANTAN", font=FONT_B, size=11, tengah=True)
    p.kosong(1)
    p.baris("dengan", font=FONT_R, size=11, tengah=True)
    p.kosong(1)
    p.baris(KUNCI["nama_vendor"].upper(), font=FONT_B, size=11, tengah=True)
    p.kosong(4)
    p.baris("DOKUMEN SINTETIS UNTUK PENGUJIAN SISTEM", font=FONT_I, size=9, tengah=True)
    p.baris("Bukan dokumen operasional. Seluruh data bersifat fiktif.", font=FONT_I, size=9, tengah=True)

    # ---------------------------------------------------------- halaman 2
    p._halaman_baru()
    p.paragraf(
        "Perjanjian Pemeliharaan Terminal BBM ini, selanjutnya disebut Perjanjian, "
        "dibuat dan ditandatangani pada hari ini, Minggu, tanggal lima belas bulan Maret "
        "tahun dua ribu dua puluh enam, oleh dan antara:"
    )
    p.kosong()
    p.paragraf(
        "PIHAK PERTAMA, bertindak untuk dan atas nama Perusahaan, PT Pertamina Patra Niaga "
        "Regional Kalimantan, berkedudukan di Balikpapan, selanjutnya disebut PIHAK PERTAMA."
    )
    p.kosong()
    p.paragraf(
        "PIHAK KEDUA, %s, suatu perseroan terbatas yang didirikan menurut hukum "
        "Negara Republik Indonesia, berkedudukan di Samarinda, Kalimantan Timur, "
        "selanjutnya disebut PIHAK KEDUA." % KUNCI["nama_vendor"]
    )
    p.kosong()
    p.paragraf(
        "PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama selanjutnya disebut PARA PIHAK "
        "dan masing-masing disebut PIHAK. PARA PIHAK sepakat untuk mengikatkan diri dalam "
        "Perjanjian ini dengan syarat dan ketentuan sebagaimana diatur di bawah ini."
    )

    # ------------------------------------------- halaman 3, medan kunci
    p._halaman_baru()
    p.baris("POKOK-POKOK PERJANJIAN", font=FONT_B, size=12)
    p.kosong(0.5)

    p.judul_pasal("PASAL 1: DEFINISI")
    p.paragraf(
        "Istilah yang dipakai dalam Perjanjian ini memiliki arti sebagaimana diuraikan "
        "pada Lampiran A Ketentuan Umum, kecuali ditentukan lain secara tegas."
    )

    p.judul_pasal("PASAL 2: DASAR PERJANJIAN")
    p.paragraf(
        "Perjanjian ini didasarkan pada Dokumen Pemilihan, Berita Acara Hasil Pelelangan, "
        "dan Surat Penunjukan Penyedia Barang/Jasa yang merupakan satu kesatuan yang tidak "
        "terpisahkan dari Perjanjian ini."
    )

    p.judul_pasal("PASAL 3: NILAI KONTRAK")
    p.paragraf(
        "Nilai total Perjanjian untuk pelaksanaan pekerjaan sebagaimana diatur dalam Pasal 1 "
        "adalah sebesar %s,- (Empat Miliar Delapan Ratus Lima Puluh Juta Rupiah), sudah "
        "termasuk Pajak Pertambahan Nilai (PPN) serta biaya-biaya lain yang timbul."
        % KUNCI["nilai_kontrak"]
    )

    p.judul_pasal("PASAL 4: LINGKUP PEKERJAAN DAN TKDN")
    p.paragraf(
        "PIHAK KEDUA berkewajiban melaksanakan %s dengan memenuhi komitmen Tingkat Komponen "
        "Dalam Negeri (TKDN) sebesar minimal %s dari total nilai barang/jasa, sebagaimana "
        "dirinci pada Lampiran B."
        % (KUNCI["lingkup_pekerjaan"], KUNCI["komitmen_tkdn"])
    )

    p.judul_pasal("PASAL 5: HAK DAN KEWAJIBAN")
    p.paragraf(
        "Hak dan kewajiban masing-masing PIHAK diatur lebih lanjut pada Lampiran A "
        "Ketentuan Umum Perjanjian."
    )

    p.judul_pasal("PASAL 6: TATA CARA PEMBAYARAN DAN SANKSI")
    p.paragraf(
        "Keterlambatan penyelesaian pekerjaan akan dikenakan denda sebesar %s untuk setiap "
        "hari keterlambatan, dengan batas maksimum denda sebesar %s. Pembayaran akan "
        "dilakukan dalam %s sesuai progres fisik di lapangan sebagaimana dirinci pada "
        "Lampiran C."
        % (KUNCI["tarif_denda_harian"], KUNCI["batas_maksimum_denda"], KUNCI["jumlah_termin"])
    )

    p.judul_pasal("PASAL 7: JANGKA WAKTU")
    p.paragraf(
        "Pelaksanaan pekerjaan harus dimulai pada tanggal %s dan diselesaikan selambat-"
        "lambatnya pada tanggal %s, sebagaimana dirinci pada Lampiran D."
        % (KUNCI["tanggal_mulai"], KUNCI["tanggal_berakhir"])
    )

    # ---------------------------------------------------------- pasal sisa
    p._halaman_baru()
    sisa = [
        ("PASAL 8: JAMINAN PELAKSANAAN",
         "PIHAK KEDUA wajib menyerahkan Jaminan Pelaksanaan sebesar 5% dari nilai Perjanjian "
         "yang diterbitkan oleh bank umum, berlaku sejak tanggal penandatanganan sampai dengan "
         "14 hari kalender setelah serah terima akhir pekerjaan."),
        ("PASAL 9: KESELAMATAN DAN KESEHATAN KERJA",
         "PIHAK KEDUA wajib menerapkan seluruh ketentuan Health, Safety, Security, and "
         "Environment yang berlaku di lingkungan PIHAK PERTAMA, termasuk kewajiban pelaporan "
         "insiden dalam waktu 1x24 jam."),
        ("PASAL 10: PERUBAHAN PERJANJIAN",
         "Setiap perubahan atas Perjanjian ini hanya berlaku apabila dituangkan dalam "
         "amendemen tertulis yang ditandatangani PARA PIHAK, dan diberi penomoran versi "
         "secara berurutan."),
        ("PASAL 11: PEMUTUSAN PERJANJIAN",
         "PIHAK PERTAMA berhak memutuskan Perjanjian secara sepihak apabila akumulasi denda "
         "keterlambatan telah mencapai batas maksimum sebagaimana diatur dalam Pasal 6."),
        ("PASAL 12: PENYELESAIAN PERSELISIHAN",
         "Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah. Apabila tidak "
         "tercapai kesepakatan, perselisihan diselesaikan melalui Badan Arbitrase Nasional "
         "Indonesia."),
        ("PASAL 13: KETENTUAN PENUTUP",
         "Perjanjian ini dibuat dalam rangkap dua bermeterai cukup, masing-masing mempunyai "
         "kekuatan hukum yang sama."),
    ]
    for judul, isi in sisa:
        p.judul_pasal(judul)
        p.paragraf(isi)

    # ---------------------------------------------------------- lampiran
    lampiran = [
        ("LAMPIRAN A: KETENTUAN UMUM PERJANJIAN", [
            "Ketentuan umum ini mengatur definisi, hak dan kewajiban PARA PIHAK, mekanisme "
            "komunikasi resmi, serta ketentuan keadaan kahar.",
            "Seluruh pemberitahuan resmi antar PARA PIHAK disampaikan secara tertulis ke "
            "alamat yang tercantum pada bagian pembuka Perjanjian.",
            "Keadaan kahar meliputi bencana alam, kebakaran, huru-hara, dan kebijakan "
            "pemerintah yang secara langsung menghalangi pelaksanaan pekerjaan.",
            "PIHAK KEDUA wajib menjaga kerahasiaan seluruh data dan informasi milik PIHAK "
            "PERTAMA yang diperoleh selama pelaksanaan pekerjaan.",
        ]),
        ("LAMPIRAN B: LINGKUP PEKERJAAN DAN TKDN", [
            "Lingkup pekerjaan meliputi %s yang mencakup pemeliharaan preventif tangki timbun, "
            "pemeriksaan sistem perpipaan, kalibrasi instrumen ukur, serta perbaikan korektif "
            "sesuai temuan inspeksi." % KUNCI["lingkup_pekerjaan"],
            "Komitmen TKDN yang wajib dipenuhi PIHAK KEDUA adalah sebesar minimal %s dari "
            "total nilai barang/jasa." % KUNCI["komitmen_tkdn"],
            "PIHAK KEDUA wajib menyampaikan laporan realisasi TKDN secara berkala setiap "
            "akhir termin, disertai bukti pendukung berupa faktur dan sertifikat.",
            "Sertifikat TKDN atas produk yang dipakai wajib masih berlaku selama masa "
            "pelaksanaan pekerjaan.",
        ]),
        ("LAMPIRAN C: TATA CARA PEMBAYARAN", [
            "Pembayaran dilakukan dalam %s berdasarkan progres fisik yang diverifikasi "
            "bersama." % KUNCI["jumlah_termin"],
            "Termin 1 sebesar Rp1.455.000.000 dibayarkan setelah mobilisasi dan penyelesaian "
            "pekerjaan Tahap 1, dengan jatuh tempo 25 Mei 2026.",
            "Termin 2 sebesar Rp1.940.000.000 dibayarkan setelah penyelesaian pekerjaan "
            "Tahap 2, dengan jatuh tempo 09 Agustus 2026.",
            "Termin 3 sebesar Rp1.455.000.000 dibayarkan setelah serah terima akhir, dengan "
            "jatuh tempo 19 September 2026.",
            "Tarif denda keterlambatan ditetapkan sebesar %s, dihitung dari nilai kontrak "
            "sebelum Pajak Pertambahan Nilai." % KUNCI["tarif_denda_harian"],
            "Akumulasi denda keterlambatan dibatasi paling tinggi %s."
            % KUNCI["batas_maksimum_denda"],
        ]),
        ("LAMPIRAN D: JANGKA WAKTU PELAKSANAAN", [
            "Pekerjaan dimulai pada tanggal %s terhitung sejak diterbitkannya Surat Perintah "
            "Mulai Kerja." % KUNCI["tanggal_mulai"],
            "Seluruh pekerjaan harus diselesaikan selambat-lambatnya pada tanggal %s."
            % KUNCI["tanggal_berakhir"],
            "Mobilisasi peralatan dan personel diselesaikan paling lambat 20 Maret 2026.",
            "Pekerjaan Tahap 1 diselesaikan paling lambat 18 Mei 2026.",
            "Pekerjaan Tahap 2 diselesaikan paling lambat 02 Agustus 2026.",
            "Serah terima akhir dijadwalkan pada 12 September 2026.",
        ]),
    ]
    for judul, butir in lampiran:
        p._halaman_baru()
        p.baris(judul, font=FONT_B, size=12)
        p.kosong(0.5)
        for i, b in enumerate(butir, 1):
            p.paragraf("%d. %s" % (i, b))
            p.kosong(0.4)

    # Padatkan sampai 24 halaman agar sesuai rancangan layar.
    lanjutan = [
        ("LAMPIRAN D: JADWAL RINCI PER MINGGU",
         "Rincian jadwal mingguan disusun PIHAK KEDUA dan disetujui pengawas pekerjaan "
         "PIHAK PERTAMA sebelum mobilisasi dimulai. Perubahan jadwal yang berdampak pada "
         "tanggal serah terima akhir hanya dapat dilakukan melalui amendemen."),
        ("LAMPIRAN D: PROSEDUR SERAH TERIMA",
         "Serah terima pekerjaan dilakukan melalui pemeriksaan bersama, penyusunan daftar "
         "temuan, penyelesaian temuan oleh PIHAK KEDUA, dan penandatanganan berita acara "
         "serah terima akhir oleh PARA PIHAK."),
        ("LAMPIRAN D: DAFTAR PERSONEL INTI",
         "PIHAK KEDUA menugaskan Manajer Proyek, Ahli K3 Konstruksi, dan Pengawas Lapangan "
         "yang kualifikasinya sesuai Dokumen Pemilihan, serta tidak boleh diganti tanpa "
         "persetujuan tertulis PIHAK PERTAMA."),
    ]
    while p.doc.page_count < 24:
        p._halaman_baru()
        judul, isi = lanjutan[(p.doc.page_count - 1) % len(lanjutan)]
        p.baris(judul, font=FONT_B, size=12)
        p.kosong(0.5)
        for _ in range(3):
            p.paragraf(isi)
            p.kosong(0.5)


def main():
    os.makedirs(os.path.dirname(OUT_PDF), exist_ok=True)
    doc = pymupdf.open()
    isi_dokumen(Penulis(doc))
    doc.set_metadata({"title": "Perjanjian Pemeliharaan Terminal BBM KTR/2026/0142",
                      "author": "Dokumen sintetis VASKO"})
    doc.save(OUT_PDF, garbage=4, deflate=True)

    teks = "\n".join(doc[i].get_text() for i in range(doc.page_count))
    hilang = [k for k, v in KUNCI.items()
              if v.split(" per ")[0].split(" dari ")[0] not in teks]
    doc.close()

    with open(OUT_KEY, "w", encoding="utf-8") as f:
        json.dump(KUNCI, f, ensure_ascii=False, indent=2)

    print("PDF   : %s" % OUT_PDF)
    print("Kunci : %s" % OUT_KEY)
    print("Halaman: %d" % pymupdf.open(OUT_PDF).page_count)
    if hilang:
        print("GAGAL: nilai kunci tidak ditemukan di teks PDF: %s" % hilang)
        sys.exit(1)
    print("Seluruh %d nilai kunci terbaca kembali dari teks PDF." % len(KUNCI))


if __name__ == "__main__":
    main()
