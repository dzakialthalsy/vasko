import Link from "next/link";
import { FileText, ShieldCheck, Users } from "lucide-react";
import { Kartu } from "@/components/ui/Kartu";

// Dashboard penuh menyusul. Halaman ini sementara menjadi pintu masuk ke
// modul yang sudah dikerjakan.
const MODUL = [
  {
    kode: "D10",
    nama: "Smart Contract Management System",
    href: "/kontrak",
    icon: FileText,
    siap: true,
    ket: "Repositori kontrak, ekstraksi dokumen, kalkulasi denda, kendali versi amendemen",
  },
  {
    kode: "D7",
    nama: "TKDN Real-Time Monitoring",
    href: "/tkdn",
    icon: ShieldCheck,
    siap: false,
    ket: "Master data sertifikat, status kepatuhan berjenjang, notifikasi H-30, H-14, dan H-7",
  },
  {
    kode: "D11",
    nama: "Vendor Performance Ecosystem",
    href: "/vendor",
    icon: Users,
    siap: false,
    ket: "Profil vendor terpadu, skor performa berbobot, rekomendasi tindak lanjut vendor",
  },
];

export default function Beranda() {
  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-extrabold text-navy-900">Dashboard</h1>
      <p className="text-sm text-muted">
        Ringkasan kontrak, kepatuhan TKDN, dan performa vendor
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {MODUL.map((m) => (
          <Kartu key={m.kode} aksen={m.siap ? "teal" : undefined}>
            <m.icon size={24} className={m.siap ? "text-teal-700" : "text-muted"} aria-hidden />
            <div className="mt-3 text-xs font-bold uppercase tracking-wider text-muted">
              Modul {m.kode}
            </div>
            <h2 className="mt-1 text-lg font-bold text-navy-900">{m.nama}</h2>
            <p className="mt-2 text-sm text-muted">{m.ket}</p>
            {m.siap ? (
              <Link
                href={m.href}
                className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:underline"
              >
                Buka modul &rarr;
              </Link>
            ) : (
              <span className="mt-4 inline-block text-sm text-muted">Belum dikerjakan</span>
            )}
          </Kartu>
        ))}
      </div>
    </div>
  );
}
