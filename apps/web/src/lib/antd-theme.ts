import type { ThemeConfig } from "antd";

/**
 * Ant Design theme configuration — brand red #df2531 on dark background.
 *
 * Token reference: https://ant.design/docs/react/customize-theme
 */
export const antdTheme: ThemeConfig = {
  // Force dark algorithm
  algorithm: undefined, // We use cssVar + custom dark tokens instead

  cssVar: true,

  token: {
    // ── Brand colors ────────────────────────────────────────────────────
    colorPrimary: "#df2531",
    colorPrimaryBg: "rgba(223, 37, 49, 0.12)",
    colorPrimaryBgHover: "rgba(223, 37, 49, 0.18)",
    colorPrimaryBorder: "rgba(223, 37, 49, 0.35)",
    colorPrimaryBorderHover: "rgba(223, 37, 49, 0.55)",
    colorPrimaryHover: "#f75557",
    colorPrimaryActive: "#c41f2a",
    colorPrimaryTextHover: "#f75557",
    colorPrimaryText: "#df2531",
    colorPrimaryTextActive: "#c41f2a",

    // ── Dark background palette ─────────────────────────────────────────
    colorBgContainer: "#0d0d11",
    colorBgElevated: "#14141b",
    colorBgLayout: "#050507",
    colorBgSpotlight: "rgba(223, 37, 49, 0.08)",
    colorBgMask: "rgba(3, 3, 7, 0.55)",

    // ── Text ────────────────────────────────────────────────────────────
    colorText: "#f5f5f7",
    colorTextSecondary: "#d4d4da",
    colorTextTertiary: "#adadb8",
    colorTextQuaternary: "rgba(255, 255, 255, 0.35)",
    colorTextDescription: "#adadb8",
    colorTextDisabled: "rgba(255, 255, 255, 0.25)",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.35)",

    // ── Borders ─────────────────────────────────────────────────────────
    colorBorder: "rgba(255, 255, 255, 0.14)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.09)",
    colorSplit: "rgba(255, 255, 255, 0.09)",

    // ── Surfaces ────────────────────────────────────────────────────────
    colorFill: "rgba(255, 255, 255, 0.07)",
    colorFillSecondary: "rgba(255, 255, 255, 0.05)",
    colorFillTertiary: "rgba(255, 255, 255, 0.04)",
    colorFillQuaternary: "rgba(255, 255, 255, 0.02)",

    // ── Status colors ───────────────────────────────────────────────────
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorInfo: "#3b82f6",
    colorLink: "#df2531",
    colorLinkHover: "#f75557",
    colorLinkActive: "#c41f2a",

    // ── Radius ──────────────────────────────────────────────────────────
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // ── Typography ──────────────────────────────────────────────────────
    fontFamily:
      "'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,

    // ── Motion ──────────────────────────────────────────────────────────
    motionDurationFast: "0.15s",
    motionDurationMid: "0.2s",
    motionDurationSlow: "0.3s",

    // ── Misc ────────────────────────────────────────────────────────────
    wireframe: false,
    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.4)",
    boxShadowSecondary: "0 12px 32px rgba(0, 0, 0, 0.5)"
  },

  components: {
    Layout: {
      siderBg:
        "linear-gradient(180deg, rgba(15,15,22,0.98), rgba(8,8,12,0.98))",
      headerBg: "rgba(8, 8, 12, 0.92)",
      bodyBg: "transparent",
      footerBg: "rgba(8, 8, 12, 0.94)",
      triggerBg: "rgba(223, 37, 49, 0.2)",
      triggerColor: "#fff"
    },

    Menu: {
      darkItemBg: "transparent",
      darkSubMenuItemBg: "transparent",
      darkItemColor: "#d4d4da",
      darkItemHoverBg: "rgba(223, 37, 49, 0.12)",
      darkItemHoverColor: "#ffffff",
      darkItemSelectedBg: "rgba(223, 37, 49, 0.22)",
      darkItemSelectedColor: "#ffffff",
      itemBorderRadius: 8,
      itemMarginBlock: 4,
      itemMarginInline: 8,
      itemPaddingInline: 14,
      itemHeight: 42,
      iconSize: 18,
      iconMarginInlineEnd: 10,
      fontSize: 14
    },

    Modal: {
      contentBg: "#14141b",
      headerBg: "transparent",
      titleColor: "#f5f5f7",
      titleFontSize: 16,
      colorIcon: "rgba(255, 255, 255, 0.5)",
      colorIconHover: "rgba(255, 255, 255, 0.8)"
    },

    Drawer: {
      colorBgElevated: "#14141b",
      colorIcon: "rgba(255, 255, 255, 0.5)",
      colorIconHover: "rgba(255, 255, 255, 0.8)"
    },

    Button: {
      borderRadius: 8,
      fontWeight: 500,
      primaryShadow: "none",
      defaultBg: "rgba(255, 255, 255, 0.05)",
      defaultColor: "#f5f5f7",
      defaultBorderColor: "rgba(255, 255, 255, 0.14)",
      defaultHoverBg: "rgba(255, 255, 255, 0.08)",
      defaultHoverColor: "#ffffff",
      defaultHoverBorderColor: "rgba(223, 37, 49, 0.4)"
    },

    Input: {
      colorBgContainer: "rgba(255, 255, 255, 0.05)",
      colorBorder: "rgba(255, 255, 255, 0.12)",
      activeBorderColor: "#df2531",
      hoverBorderColor: "rgba(223, 37, 49, 0.4)",
      colorText: "#f5f5f7",
      colorTextPlaceholder: "rgba(255, 255, 255, 0.35)"
    },

    Select: {
      colorBgContainer: "rgba(255, 255, 255, 0.05)",
      colorBorder: "rgba(255, 255, 255, 0.12)",
      colorBgElevated: "rgba(18, 18, 26, 0.98)",
      optionSelectedBg: "rgba(223, 37, 49, 0.18)",
      optionActiveBg: "rgba(223, 37, 49, 0.12)"
    },

    Tabs: {
      inkBarColor: "#df2531",
      itemColor: "rgba(255, 255, 255, 0.5)",
      itemHoverColor: "rgba(255, 255, 255, 0.8)",
      itemActiveColor: "#df2531",
      itemSelectedColor: "#df2531",
      cardBg: "transparent",
      colorBorderSecondary: "rgba(255, 255, 255, 0.07)"
    },

    Badge: {
      colorBgContainer: "#14141b"
    },

    Tag: {
      borderRadiusSM: 6
    },

    Notification: {
      colorBgElevated: "rgba(18, 18, 26, 0.95)",
      colorText: "#f5f5f7"
    },

    Message: {
      contentBg: "rgba(18, 18, 26, 0.95)"
    },

    Table: {
      colorBgContainer: "transparent",
      headerBg: "rgba(255, 255, 255, 0.03)",
      headerColor: "#adadb8",
      rowHoverBg: "rgba(255, 255, 255, 0.04)",
      borderColor: "rgba(255, 255, 255, 0.07)",
      colorText: "#f5f5f7"
    },

    Tooltip: {
      colorBgSpotlight: "#1a1a24",
      colorTextLightSolid: "#f5f5f7"
    }
  }
};
