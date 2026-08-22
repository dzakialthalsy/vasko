import { Search, Bell, User } from "lucide-react";

// Bilah atas dikunci mengikuti wireframe: kolom pencarian berteks "Cari...",
// lonceng dengan penghitung, lalu chip pengguna. Nama pengguna masih contoh
// sampai autentikasi dan kendali akses berbasis peran dikerjakan.
export function Topbar({ jumlahNotifikasi = 6 }: { jumlahNotifikasi?: number }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-white px-6 py-3.5">
      <label className="relative flex-1 max-w-xl">
        <span className="sr-only">Cari kontrak, vendor, atau sertifikat</span>
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Cari..."
          className="w-full rounded-lg bg-canvas py-2.5 pl-11 pr-4 text-sm text-navy-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-700/40"
        />
      </label>

      <div className="ml-auto flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-full p-2 text-navy-900 hover:bg-canvas"
          aria-label={`Notifikasi, ${jumlahNotifikasi} belum dibaca`}
        >
          <Bell size={20} aria-hidden />
          {jumlahNotifikasi > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-danger-600 text-[11px] font-bold text-white">
              {jumlahNotifikasi}
            </span>
          )}
        </button>

        <div className="flex items-center gap-3 rounded-full border border-line py-1.5 pl-4 pr-1.5">
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold text-navy-900">Rina Marlina</div>
            <div className="text-[11px] font-medium tracking-wide text-teal-700">
              TIM PROCUREMENT
            </div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-900 text-white">
            <User size={18} aria-hidden />
          </span>
        </div>
      </div>
    </header>
  );
}
