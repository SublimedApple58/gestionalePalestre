import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestionale Palestre",
  description: "Boilerplate gestionale palestre con Next.js, Neon e Prisma"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
