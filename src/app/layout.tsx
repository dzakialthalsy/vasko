import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import "./globals.css";

// Plus Jakarta Sans dipilih karena bentuk geometrisnya paling dekat dengan
// tipografi pada wireframe. Nomor kontrak dan NPWP memakai mono agar
// digitnya sejajar dan mudah dibandingkan antar baris tabel.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VASKO",
  description:
    "Platform pemantauan fase pasca-kontrak procurement: kontrak, kepatuhan TKDN, dan performa vendor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Sidebar />
        {/* Padding kiri sebesar lebar sidebar. Konten tidak pernah berada
            di bawah sidebar, berapa pun lebar jendelanya. */}
        <div className="flex min-h-full flex-col" style={{ paddingLeft: "var(--sidebar-w)" }}>
          <Topbar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
