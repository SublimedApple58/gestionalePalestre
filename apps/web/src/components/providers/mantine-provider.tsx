"use client";

import { MantineProvider } from "@mantine/core";
import { mantineTheme } from "@/lib/mantine-theme";

export function AppMantineProvider({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="dark">
      {children}
    </MantineProvider>
  );
}
