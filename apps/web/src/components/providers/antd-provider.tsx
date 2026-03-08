"use client";

import { ConfigProvider, App, theme } from "antd";
import itIT from "antd/locale/it_IT";
import { antdTheme } from "@/lib/antd-theme";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        ...antdTheme,
        algorithm: theme.darkAlgorithm
      }}
      locale={itIT}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
