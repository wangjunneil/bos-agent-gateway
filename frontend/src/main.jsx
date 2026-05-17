import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App.jsx";

const SAP_BLUE = "#0070F2";
const SAP_BLUE_DARK = "#0057B8";
const SAP_BLUE_LIGHT = "#4A90E2";

const theme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#F5F6F7",
      paper: "#FFFFFF",
    },
    primary: {
      main: SAP_BLUE,
      light: SAP_BLUE_LIGHT,
      dark: SAP_BLUE_DARK,
    },
    secondary: {
      main: "#475E75",
      light: "#6B8299",
      dark: "#344556",
    },
    success: {
      main: "#188918",
      dark: "#0F6A0F",
    },
    warning: {
      main: "#E78B07",
      dark: "#B26D05",
    },
    error: {
      main: "#D9364B",
      dark: "#AA2A3A",
    },
    info: {
      main: SAP_BLUE,
    },
    divider: "#D5DADD",
    text: {
      primary: "#1D2D3E",
      secondary: "#5B738B",
    },
  },
  typography: {
    fontFamily: "'Inter', '72', system-ui, -apple-system, sans-serif",
    h4: { fontWeight: 700, letterSpacing: "-0.01em", color: "#1D2D3E" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600, color: "#1D2D3E" },
    subtitle2: {
      fontWeight: 600,
      textTransform: "uppercase",
      fontSize: "0.7rem",
      letterSpacing: "0.08em",
      color: "#5B738B",
    },
    caption: { color: "#7D8D9E" },
    button: { fontWeight: 600, textTransform: "none" },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#F5F6F7" },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #D5DADD",
          borderRadius: 6,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#FFFFFF",
          border: "1px solid #D5DADD",
          borderRadius: 6,
          transition: "box-shadow 0.15s ease",
          "&:hover": {
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: "5px 14px",
          transition: "all 0.1s ease",
          fontSize: "0.8125rem",
        },
        contained: {
          boxShadow: "none",
          backgroundColor: SAP_BLUE,
          "&:hover": {
            boxShadow: "none",
            backgroundColor: SAP_BLUE_DARK,
          },
        },
        outlined: {
          borderColor: "#C5C9CE",
          color: "#1D2D3E",
          "&:hover": {
            borderColor: "#A8B0B8",
            backgroundColor: "rgba(0,0,0,0.02)",
          },
        },
        text: {
          color: SAP_BLUE,
          "&:hover": {
            backgroundColor: "rgba(0,112,242,0.06)",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.1s ease",
          color: "#5B738B",
          "&:hover": {
            backgroundColor: "rgba(0,0,0,0.04)",
            color: "#1D2D3E",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: "0.75rem",
          borderRadius: 4,
        },
        outlined: {
          borderColor: "#D5DADD",
          color: "#475E75",
        },
        filled: {
          backgroundColor: "rgba(0,112,242,0.08)",
          color: SAP_BLUE_DARK,
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "#FFFFFF",
            borderRadius: 4,
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: SAP_BLUE,
              borderWidth: 1,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#A8B0B8",
            },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "#C5C9CE",
            },
          },
          "& .MuiInputLabel-root.Mui-focused": {
            color: SAP_BLUE,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "#FFFFFF",
          border: "1px solid #D5DADD",
          borderRadius: 8,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "#EDEFF2",
          padding: "10px 16px",
        },
        head: {
          fontWeight: 600,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#5B738B",
          backgroundColor: "#F5F6F7",
          borderBottom: "2px solid #D5DADD",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 0.1s ease",
          "&:hover": {
            backgroundColor: "#F5F6F7",
          },
          "&:nth-of-type(even)": {
            backgroundColor: "#FAFAFB",
          },
          "&:nth-of-type(even):hover": {
            backgroundColor: "#F5F6F7",
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
          color: "#5B738B",
          transition: "color 0.15s ease",
          "&.Mui-selected": {
            color: SAP_BLUE,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: SAP_BLUE,
          borderRadius: 0,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-track": {
            backgroundColor: "#C5C9CE",
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: SAP_BLUE,
          "& .MuiSlider-track": {
            border: "none",
          },
          "& .MuiSlider-thumb": {
            "&.Mui-active": {
              boxShadow: `0 0 0 8px rgba(0,112,242,0.12)`,
            },
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: "background-color 0.1s ease",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          borderBottom: "1px solid #D5DADD",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1D2D3E",
          borderRadius: 4,
          fontSize: "0.75rem",
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
