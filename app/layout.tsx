import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YKS Tercih Uygulaması",
  description: "ÖSYM Tablo-4 verileriyle lisans programı tercih araştırma uygulaması.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
