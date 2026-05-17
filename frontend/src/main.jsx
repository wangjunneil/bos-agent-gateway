import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App.jsx";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0f1117",
      paper: "#181a20",
    },
    primary: {
      main: "#6366f1",
      light: "#818cf8",
      dark: "#4f46e5",
    },
    secondary: {
      main: "#a78bfa",
    },
    success: {
      main: "#22c55e",
      dark: "#16a34a",
    },
    warning: {
      main: "#f59e0b",
      dark: "#d97706",
    },
    error: {
      main: "#ef4444",
      dark: "#dc2626",
    },
    info: {
      main: "#3b82f6",
    },
    divider: "rgba(255,255,255,0.06)",
    text: {
      primary: "#e4e4e7",
      secondary: "#a1a1aa",
    },
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.08em", color: "#a1a1aa" },
    caption: { color: "#71717a" },
    button: { fontWeight: 600, textTransform: "none" },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#0f1117" },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#181a20",
          border: "1px solid rgba(255,255,255,0.06)",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "6px 16px",
          transition: "all 0.15s ease",
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 0 20px rgba(99,102,241,0.3)",
          },
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.12)",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.24)",
            backgroundColor: "rgba(255,255,255,0.04)",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.06)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: "0.75rem",
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.12)",
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "rgba(255,255,255,0.03)",
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(255,255,255,0.2)",
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "#1e2028",
          border: "1px solid rgba(255,255,255,0.08)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255,255,255,0.04)",
        },
        head: {
          fontWeight: 600,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#a1a1aa",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 0.15s ease",
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.02)",
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: "0.85rem",
          textTransform: "none",
          minHeight: 44,
          transition: "color 0.15s ease",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-track": {
            backgroundColor: "rgba(255,255,255,0.15)",
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          "& .MuiSlider-track": {
            border: "none",
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "background-color 0.15s ease",
        },
      },
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
