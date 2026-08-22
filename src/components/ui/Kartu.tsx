import type { ReactNode } from "react";

// Primitif kartu. Radius, bayangan, dan garis tepi dikunci di satu tempat
// supaya seluruh layar memakai bentuk yang sama, sesuai wireframe.
export function Kartu({
  judul,
  aksi,
  aksen,
  sisiAksen = "atas",
  ikon,
  className = "",
  children,
}: {
  judul?: ReactNode;
  aksi?: ReactNode;
  aksen?: "teal" | "amber" | "plum";
  /** Rancangan memakai garis atas untuk kartu progres dan amendemen, tetapi
   *  garis KIRI untuk kartu perhitungan denda. Bedanya disengaja. */
  sisiAksen?: "atas" | "kiri";
  ikon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const warnaAksen = {
    teal: "bg-teal-700",
    amber: "bg-amber-500",
    plum: "bg-plum-700",
  };

  return (
    <section
      className={`relative overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,31,63,0.08)] ${className}`}
    >
      {aksen && (
        <span
          className={`absolute ${
            sisiAksen === "kiri" ? "inset-y-0 left-0 w-1" : "inset-x-0 top-0 h-1"
          } ${warnaAksen[aksen]}`}
          aria-hidden
        />
      )}
      {(judul || aksi) && (
        <header className="flex items-center gap-3 px-6 pb-2 pt-6">
          {ikon}
          {judul && <h2 className="text-lg font-bold text-navy-900">{judul}</h2>}
          {aksi && <div className="ml-auto">{aksi}</div>}
        </header>
      )}
      <div className="px-6 pb-6 pt-2">{children}</div>
    </section>
  );
}

export function Chip({
  warna = "netral",
  children,
}: {
  warna?: "teal" | "amber" | "merah" | "plum" | "netral";
  children: ReactNode;
}) {
  const gaya = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    merah: "bg-red-50 text-danger-600",
    plum: "bg-plum-700 text-white",
    netral: "bg-canvas text-navy-900",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${gaya[warna]}`}
    >
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
      {children}
    </div>
  );
}
