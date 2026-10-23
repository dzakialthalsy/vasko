# -*- coding: utf-8 -*-
"""Bangkitkan PDF dokumen pendukung dan amendemen SINTETIS untuk menguji
validasi kontrak KTR/2026/0142.

Seluruh isi dokumen ini fiktif dan disusun tim, bukan dokumen operasional
PT Pertamina Patra Niaga. Setiap halaman diberi tanda itu.

Dokumen disusun sebagai skenario yang jawabannya sudah diketahui:

  Dokumen ganda, komplementer (nilai dijumlahkan):
    0142-TOR-1 (5 Jan)        pemeriksaan perpipaan 10 titik
    0142-TOR-2 (12 Jan)       ditambah 5 titik        -> efektif 15, keduanya komplementer
  Dokumen ganda, pengganti (nilai diganti):
    0142-BA-Prebid-1 (10 Jan) 3 termin, masa 181 hari
    0142-BA-Prebid-2 (20 Jan) termin diubah menjadi 4, masa ditetapkan tetap 181 hari
                              -> seluruh isi Prebid-1 diganti, Prebid-1 digantikan, efektif 4 termin
    Prebid-2 sengaja menyebut ulang masa pelaksanaan. Bila hanya termin yang
    diganti, Prebid-1 masih menyumbang masa pelaksanaan, dan menurut aturan
    peran (src/lib/dokumen/peran.ts, uji "penimpaan sebagian" di uji-inti.ts)
    kedua dokumen menjadi komplementer, bukan digantikan.
  Ketidaksesuaian dengan kontrak (kontrak: Rp4.850.000.000, 3 termin, TKDN 42%):
    0142-BA-Negosiasi         harga Rp5.250.000.000   -> bertentangan dengan nilai kontrak
  Sesuai dengan kontrak:
    0142-Form-TKDN-A1         TKDN minimum 40%        -> kontrak 42% memenuhi
    0142-Akta-Perusahaan      PT Sumber Jaya Abadi    -> sama dengan vendor di kontrak
  Tidak bisa dibaca:
    0142-Scan-Tanpa-Teks      gambar saja, tanpa lapisan teks
  Amendemen:
    0142-Amendemen-1 (3 Mei)  tambah lingkup, nilai +Rp242.500.000 (5%)
    0142-Amendemen-1-Pendukung  evaluasi perubahan lingkup
    0142-Amendemen-2 (14 Jul) perpanjangan 14 hari, tanggal berakhir 12 Sep -> 26 Sep 2026

Jalankan: python scripts/generate_dokumen_pendukung.py
Keluaran: public/contoh/pendukung/*.pdf
"""
import os

import pymupdf

KELUAR = os.path.join("public", "contoh", "pendukung")
W, H = 595.0, 842.0
ML, MR, MT, MB = 72, 72, 72, 64
TANDA = "DOKUMEN SINTETIS UNTUK PENGUJIAN SISTEM. Bukan dokumen operasional. Seluruh data bersifat fiktif."


def buat_pdf(nama, judul, nomor, paragraf):
    doc = pymupdf.open()
    halaman = doc.new_page(width=W, height=H)
    y = MT
    halaman.insert_text((ML, y), judul, fontsize=14, fontname="hebo")
    y += 20
    if nomor:
        halaman.insert_text((ML, y), nomor, fontsize=11, fontname="helv")
        y += 18
    halaman.insert_text((ML, y), TANDA, fontsize=8, fontname="helv")
    y += 24

    for p in paragraf:
        tebal = p.startswith("##")
        teks = p[2:].strip() if tebal else p
        font = "hebo" if tebal else "helv"
        ukuran = 11 if tebal else 10.5
        # Perkiraan tinggi: 15,5 titik per baris, ~92 karakter per baris.
        baris = max(1, -(-len(teks) // 88)) + teks.count("\n")
        tinggi = baris * 15.5 + 6
        if y + tinggi > H - MB:
            halaman = doc.new_page(width=W, height=H)
            y = MT
        rc = halaman.insert_textbox(pymupdf.Rect(ML, y, W - MR, y + tinggi + 30), teks, fontsize=ukuran, fontname=font)
        if rc < 0:
            raise RuntimeError(f"teks tidak muat pada {nama}: {teks[:60]}")
        y += tinggi
    os.makedirs(KELUAR, exist_ok=True)
    jalur = os.path.join(KELUAR, nama)
    doc.save(jalur)
    doc.close()
    print("ok", jalur)


def buat_pindai(nama, judul, paragraf):
    """PDF berisi gambar saja, tanpa lapisan teks. Meniru hasil pindai."""
    sementara = nama + ".sementara.pdf"
    buat_pdf(sementara, judul, None, paragraf)
    sumber = pymupdf.open(os.path.join(KELUAR, sementara))
    gambar = sumber[0].get_pixmap(dpi=110)
    sumber.close()
    os.remove(os.path.join(KELUAR, sementara))

    doc = pymupdf.open()
    halaman = doc.new_page(width=W, height=H)
    halaman.insert_image(halaman.rect, pixmap=gambar)
    doc.save(os.path.join(KELUAR, nama))
    doc.close()
    print("ok", os.path.join(KELUAR, nama), "(gambar saja)")


PEMBUKA = (
    "Pada hari ini, {hari}, tanggal {tanggal_huruf} ({tanggal}), bertempat di Balikpapan, "
    "telah dilaksanakan {kegiatan} Pemeliharaan Terminal BBM Balikpapan antara Panitia Pengadaan "
    "PT Pertamina Patra Niaga Regional Kalimantan dengan calon penyedia."
)

# ------------------------------------------------------------ dokumen ganda

buat_pdf(
    "0142-TOR-1.pdf",
    "KERANGKA ACUAN KERJA (TOR)",
    "Nomor: TOR/KTR-0142/I/2026",
    [
        "Tanggal dokumen: 5 Januari 2026",
        "##Lingkup Pekerjaan",
        "1. Pekerjaan meliputi Pemeliharaan Terminal BBM Balikpapan.",
        "2. Pemeriksaan sistem perpipaan dilakukan pada 10 (sepuluh) titik pemeriksaan.",
        "3. Hasil pemeriksaan dilaporkan kepada Fungsi Peminta Pengadaan paling lambat tujuh hari setelah pemeriksaan.",
    ],
)

buat_pdf(
    "0142-TOR-2.pdf",
    "ADENDUM KERANGKA ACUAN KERJA (TOR)",
    "Nomor: TOR/KTR-0142/I/2026-ADD1",
    [
        "Tanggal dokumen: 12 Januari 2026",
        "##Perubahan Lingkup Pekerjaan",
        "1. Jumlah titik pemeriksaan sistem perpipaan ditambah 5 (lima) titik pemeriksaan dari ketentuan semula.",
        "2. Ketentuan lain pada TOR tanggal 5 Januari 2026 tidak berubah.",
    ],
)

buat_pdf(
    "0142-BA-Prebid-1.pdf",
    "BERITA ACARA PRE-BID MEETING",
    "Nomor: BA-PB/KTR-0142/I/2026",
    [
        PEMBUKA.format(hari="Sabtu", tanggal_huruf="sepuluh bulan Januari tahun dua ribu dua puluh enam",
                       tanggal="10 Januari 2026", kegiatan="rapat penjelasan pekerjaan (Pre-bid Meeting)"),
        "##Hasil Rapat Penjelasan",
        "1. Pembayaran pekerjaan dilakukan dalam 3 (tiga) termin sesuai progres fisik yang diverifikasi bersama.",
        "2. Masa pelaksanaan pekerjaan adalah 181 (seratus delapan puluh satu) hari kalender sejak Surat Perintah Mulai Kerja.",
        "Demikian berita acara ini dibuat dengan sebenarnya.",
    ],
)

buat_pdf(
    "0142-BA-Prebid-2.pdf",
    "BERITA ACARA PRE-BID MEETING LANJUTAN",
    "Nomor: BA-PB/KTR-0142/I/2026-2",
    [
        PEMBUKA.format(hari="Selasa", tanggal_huruf="dua puluh bulan Januari tahun dua ribu dua puluh enam",
                       tanggal="20 Januari 2026", kegiatan="rapat penjelasan lanjutan (Pre-bid Meeting)"),
        "##Hasil Rapat Penjelasan Lanjutan",
        "1. Jumlah termin pembayaran diubah menjadi 4 (empat) termin, mengikuti usulan calon penyedia.",
        "2. Masa pelaksanaan pekerjaan ditetapkan tetap 181 (seratus delapan puluh satu) hari kalender sejak Surat Perintah Mulai Kerja.",
        "Demikian berita acara ini dibuat dengan sebenarnya.",
    ],
)

# -------------------------------------------------------- dokumen tunggal

buat_pdf(
    "0142-BA-Negosiasi.pdf",
    "BERITA ACARA NEGOSIASI",
    "Nomor: BA-NG/KTR-0142/II/2026",
    [
        PEMBUKA.format(hari="Minggu", tanggal_huruf="satu bulan Februari tahun dua ribu dua puluh enam",
                       tanggal="1 Februari 2026", kegiatan="negosiasi harga dan syarat pekerjaan"),
        "##Hasil Negosiasi",
        "1. Harga akhir pekerjaan disepakati sebesar Rp5.250.000.000,- (Lima Miliar Dua Ratus Lima Puluh Juta Rupiah), sudah termasuk Pajak Pertambahan Nilai (PPN).",
        "2. Penyedia yang bernegosiasi adalah PT Sumber Jaya Abadi.",
        "Demikian berita acara ini dibuat dengan sebenarnya.",
    ],
)

buat_pdf(
    "0142-Form-TKDN-A1.pdf",
    "FORM A1 IDENTIFIKASI KEBUTUHAN BARANG/JASA DAN TKDN",
    "Nomor: A1/KTR-0142/XII/2025",
    [
        "Tanggal dokumen: 20 Desember 2025",
        "##Identifikasi Kebutuhan",
        "Pekerjaan: Pemeliharaan Terminal BBM Balikpapan.",
        "Nilai minimum Tingkat Komponen Dalam Negeri (TKDN) yang dipersyaratkan pada pekerjaan ini adalah 40%.",
    ],
)

buat_pdf(
    "0142-Akta-Perusahaan.pdf",
    "SALINAN AKTA PENDIRIAN PERSEROAN TERBATAS",
    "Nomor: 12",
    [
        "Pada hari ini, tanggal dua belas bulan Januari tahun dua ribu sembilan belas (12 Januari 2019), "
        "dihadapan saya, Notaris di Samarinda, telah hadir para penghadap yang mendirikan perseroan terbatas.",
        "##Nama dan Tempat Kedudukan",
        "Perseroan ini bernama PT Sumber Jaya Abadi dan berkedudukan di Samarinda, Kalimantan Timur.",
        "Nomor akta: 12. NPWP perseroan: 02.345.678.9-091.000.",
    ],
)

buat_pindai(
    "0142-Scan-Tanpa-Teks.pdf",
    "FORM CHECKLIST HC TAD (HASIL PINDAI)",
    [
        "Tanggal dokumen: 3 Februari 2026",
        "Dokumen ini hanya berisi gambar. Tidak ada lapisan teks yang bisa dibaca sistem.",
    ],
)

# -------------------------------------------------------------- amendemen

buat_pdf(
    "0142-Amendemen-1.pdf",
    "AMENDEMEN PERTAMA PERJANJIAN",
    "Nomor: AMD-1/KTR/2026/0142",
    [
        "Amendemen Pertama ini dibuat pada tanggal 3 Mei 2026 atas Perjanjian Pemeliharaan Terminal BBM Nomor KTR/2026/0142 "
        "antara PT Pertamina Patra Niaga Regional Kalimantan dengan PT Sumber Jaya Abadi.",
        "##Perubahan",
        "1. Lingkup pekerjaan ditambah dengan pemeliharaan manifold sebagaimana dirinci pada dokumen pendukung amendemen.",
        "2. PASAL 3 NILAI KONTRAK yang semula Rp4.850.000.000 diubah sehingga nilai kontrak bertambah sebesar Rp242.500.000,- "
        "(Dua Ratus Empat Puluh Dua Juta Lima Ratus Ribu Rupiah) menjadi Rp5.092.500.000.",
        "3. Jangka waktu pelaksanaan pekerjaan tidak berubah.",
    ],
)

buat_pdf(
    "0142-Amendemen-1-Pendukung.pdf",
    "HASIL EVALUASI PERUBAHAN LINGKUP KERJA",
    "Nomor: EV-LK/KTR-0142/V/2026",
    [
        "Tanggal dokumen: 28 April 2026",
        "##Analisis Teknis",
        "Pemeliharaan manifold perlu ditambahkan ke lingkup pekerjaan karena hasil inspeksi menemukan penurunan "
        "ketebalan pipa pada jalur manifold. Penambahan ini mengubah lingkup pekerjaan dan menambah biaya pekerjaan.",
    ],
)

buat_pdf(
    "0142-Amendemen-2.pdf",
    "AMENDEMEN KEDUA PERJANJIAN",
    "Nomor: AMD-2/KTR/2026/0142",
    [
        "Amendemen Kedua ini dibuat pada tanggal 14 Juli 2026 atas Perjanjian Pemeliharaan Terminal BBM Nomor KTR/2026/0142 "
        "antara PT Pertamina Patra Niaga Regional Kalimantan dengan PT Sumber Jaya Abadi.",
        "##Perubahan",
        "1. PASAL 7 JANGKA WAKTU: pekerjaan diselesaikan selambat-lambatnya pada tanggal 26 September 2026, "
        "yang semula 12 September 2026, sehingga masa pelaksanaan diperpanjang 14 hari kalender.",
        "2. Nilai kontrak tidak berubah.",
    ],
)

print("selesai")
