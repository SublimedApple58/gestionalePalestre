import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { AppMantineProvider } from "@/components/providers/mantine-provider";
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
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body className={openSans.className}>
        <AppMantineProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppMantineProvider>
      </body>
    </html>
  );
}
