import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";

import { AntdProvider } from "@/components/providers/antd-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "House of Muscle · Gestionale",
  description: "Gestionale palestre role-based con admin, istruttori e iscritti",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }]
  },
  openGraph: {
    title: "House of Muscle · Gestionale",
    description: "Gestionale palestre role-based: admin, istruttori e iscritti in un unico posto.",
    images: [{ url: "/og-image.png", width: 1200, height: 1950, alt: "House of Muscle" }],
    locale: "it_IT",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#0c0c12"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={openSans.className}>
        <AntdProvider>
          <ToastProvider>{children}</ToastProvider>
        </AntdProvider>
      </body>
    </html>
  );
}
