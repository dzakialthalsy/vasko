"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  ShieldCheck,
  Users,
  Bell,
  Settings,
} from "lucide-react";

// Urutan menu dikunci mengikuti keenam wireframe. Jangan diubah tanpa
// memperbarui gambar, karena sidebar tampil di setiap layar.
const MENU = [
  { label: "Dashboard", href: "/", icon: LayoutGrid },
  { label: "Kontrak", href: "/kontrak", icon: FileText },
  { label: "Kepatuhan TKDN", href: "/tkdn", icon: ShieldCheck },
  { label: "Vendor", href: "/vendor", icon: Users },
  { label: "Notifikasi", href: "/notifikasi", icon: Bell },
  { label: "Pengaturan", href: "/pengaturan", icon: Settings },
] as const;

export function Sidebar() {
  const path = usePathname();

  return (
    // Sidebar dipasang fixed dan konten diberi padding sebesar --sidebar-w.
    // Ini jebakan yang berulang kali muncul pada rancangan: konten menyelinap
    // ke bawah sidebar. Lebarnya dikunci lewat satu variabel di globals.css.
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col bg-navy-900 text-white"
      style={{ width: "var(--sidebar-w)" }}
    >
      <div className="px-6 py-7">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          VASKO
        </Link>
      </div>

      <nav className="flex-1">
        {MENU.map(({ label, href, icon: Ikon }) => {
          const aktif = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={aktif ? "page" : undefined}
              className={[
                "relative flex items-center gap-3 px-6 py-3.5 text-sm transition-colors",
                aktif
                  ? "bg-navy-700/50 font-semibold text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {aktif && (
                <span className="absolute inset-y-0 left-0 w-1 bg-teal-700" aria-hidden />
              )}
              <Ikon size={18} strokeWidth={2} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
