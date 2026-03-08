import { createTheme, type MantineColorsTuple } from "@mantine/core";

// 10 shades per il brand rosso #df2531
const brand: MantineColorsTuple = [
  "#fff0f0",
  "#ffdcdc",
  "#ffb5b5",
  "#ff8787",
  "#f75557",
  "#df2531",
  "#c41f2a",
  "#a81922",
  "#8c141b",
  "#700e14"
];

export const mantineTheme = createTheme({
  primaryColor: "brand",
  primaryShade: { dark: 5 },
  colors: { brand },

  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

  defaultRadius: "md",

  // Forza dark ovunque — non usiamo light mode
  components: {
    AppShell: {
      styles: {
        main: {
          background: "transparent",
          minHeight: "100vh"
        },
        navbar: {
          borderRight: "1px solid rgba(223,37,49,0.28)",
          background:
            "radial-gradient(circle at 10% -4%, rgba(223,37,49,0.28), transparent 35%), linear-gradient(180deg, rgba(15,15,22,0.98), rgba(8,8,12,0.98))",
          backdropFilter: "blur(6px)",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.05)"
        },
        header: {
          background: "rgba(8,8,12,0.92)",
          borderBottom: "1px solid rgba(223,37,49,0.2)",
          backdropFilter: "blur(12px)"
        },
        footer: {
          background: "rgba(8,8,12,0.94)",
          borderTop: "1px solid rgba(223,37,49,0.2)",
          backdropFilter: "blur(12px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)"
        }
      }
    },

    NavLink: {
      styles: {
        root: {
          borderRadius: "var(--mantine-radius-md)",
          fontWeight: 600,
          fontSize: 14,
          transition: "all 150ms ease"
        }
      }
    },

    Modal: {
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.65, blur: 6 },
        transitionProps: {
          transition: "pop",
          duration: 300,
          timingFunction: "cubic-bezier(0.34, 1.4, 0.64, 1)"
        }
      },
      styles: {
        content: {
          background:
            "radial-gradient(ellipse at 20% -10%, rgba(223,37,49,0.18), transparent 45%), linear-gradient(180deg, rgba(22,22,30,0.99), rgba(10,10,16,0.99))",
          border: "1px solid rgba(223,37,49,0.28)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 56px rgba(0,0,0,0.6)"
        },
        header: {
          background: "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "20px 20px 16px"
        },
        title: {
          fontWeight: 600,
          fontSize: "15px",
          color: "var(--mantine-color-gray-1)"
        },
        body: {
          padding: "16px 20px 20px"
        },
        close: {
          color: "rgba(255,255,255,0.5)"
        }
      }
    },

    Drawer: {
      defaultProps: {
        overlayProps: { backgroundOpacity: 0.62, blur: 6 },
        transitionProps: {
          transition: "slide-left",
          duration: 320,
          timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
        },
        size: "md"
      },
      styles: {
        content: {
          background:
            "radial-gradient(ellipse at 100% 0%, rgba(223,37,49,0.12), transparent 50%), linear-gradient(180deg,rgba(18,18,26,0.99) 0%,rgba(10,10,16,1) 100%)",
          borderLeft: "1px solid rgba(223,37,49,0.22)",
          display: "flex",
          flexDirection: "column"
        },
        header: {
          background: "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "20px 20px 16px"
        },
        title: {
          fontWeight: 600,
          fontSize: "15px",
          color: "var(--mantine-color-gray-1)"
        },
        body: {
          padding: 0,
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }
      }
    },

    Tabs: {
      styles: {
        root: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
        list: {
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          gap: 0,
          padding: "0 20px",
          flexShrink: 0
        },
        tab: {
          padding: "12px 16px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--mantine-color-gray-4)",
          borderBottom: "2px solid transparent",
          borderRadius: 0,
          "&[data-active]": {
            color: "#df2531",
            borderBottomColor: "#df2531"
          }
        },
        panel: {
          flex: 1,
          overflowY: "auto",
          padding: "20px"
        }
      }
    },

    Button: {
      defaultProps: { radius: "md" },
      styles: {
        root: {
          fontWeight: 500,
          fontSize: "13px",
          transition: "background 150ms ease, opacity 150ms ease"
        }
      }
    },

    Badge: {
      defaultProps: { radius: "sm", size: "sm" }
    },

    TextInput: {
      styles: {
        input: {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "var(--mantine-color-gray-1)",
          fontSize: "14px",
          "&:focus": {
            borderColor: "#df2531"
          },
          "&::placeholder": {
            color: "var(--mantine-color-gray-5)"
          }
        },
        label: {
          color: "var(--mantine-color-gray-3)",
          fontSize: "12px",
          fontWeight: 500,
          marginBottom: "6px"
        }
      }
    },

    Select: {
      styles: {
        input: {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "var(--mantine-color-gray-1)",
          "&:focus": { borderColor: "#df2531" }
        },
        dropdown: {
          background: "rgba(18,18,26,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)"
        }
      }
    },

    Notification: {
      styles: {
        root: {
          background: "rgba(18,18,26,0.95)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
        }
      }
    }
  }
});
