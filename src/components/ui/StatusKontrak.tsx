import { CircleCheck, FileClock, CircleSlash, Archive } from "lucide-react";
import { Chip } from "./Kartu";

export type Status = "DRAF" | "BERJALAN" | "SELESAI" | "DIPUTUS";

// Satu tempat yang menentukan rupa tiap status, supaya daftar kontrak dan
// halaman detail tidak pernah menampilkan hal berbeda untuk kontrak yang sama.
const GAYA = {
  DRAF: {
    label: "Draf",
    warna: "amber",
    Ikon: FileClock,
    arti: "Belum diverifikasi sepenuhnya. Nilainya belum boleh dipakai sebagai dasar pembayaran atau perhitungan denda.",
  },
  BERJALAN: {
    label: "Berjalan",
    warna: "teal",
    Ikon: CircleCheck,
    arti: "Seluruh medan wajib sudah dikonfirmasi manusia dan kontrak sedang dilaksanakan.",
  },
  SELESAI: {
    label: "Selesai",
    warna: "netral",
    Ikon: Archive,
    arti: "Pekerjaan sudah diserahterimakan.",
  },
  DIPUTUS: {
    label: "Diputus",
    warna: "merah",
    Ikon: CircleSlash,
    arti: "Kontrak diputus sebelum jangka waktunya berakhir.",
  },
} as const;

export function ChipStatus({ status }: { status: Status }) {
  const { label, warna, Ikon, arti } = GAYA[status];
  return (
    <span title={arti}>
      <Chip warna={warna}>
        <Ikon size={14} aria-hidden /> {label}
      </Chip>
    </span>
  );
}

export function artiStatus(status: Status): string {
  return GAYA[status].arti;
}
