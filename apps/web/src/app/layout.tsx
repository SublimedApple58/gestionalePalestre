import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";

import { ToastProvider } from "@/components/ui/toast-provider";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Gestionale Palestre",
  description: "Gestionale palestre role-based con admin, istruttori e iscritti"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={openSans.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
