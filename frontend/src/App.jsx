import { useState, useCallback, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Tabs,
  Tab,
  Box,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  CircularProgress,
  Fade,
  InputAdornment,
} from "@mui/material";
import { VpnKey, Logout } from "@mui/icons-material";
import { setApiKey, validateKey, onAuthError } from "./api";
import DashboardPage from "./pages/Dashboard";
import AgentsPage from "./pages/Agents";
import UsersPage from "./pages/Users";

function LoginDialog({ open, onLogin }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    const valid = await validateKey(key.trim());
    setLoading(false);
    if (valid) {
      setApiKey(key.trim());
      onLogin();
    } else {
      setError("Invalid API key");
    }
  };

  return (
    <Dialog open={open} maxWidth="xs" fullWidth>
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Box
          sx={{
            width: 56, height: 56, mx: "auto", mb: 2,
            borderRadius: "14px",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <VpnKey sx={{ fontSize: 28, color: "#fff" }} />
        </Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          BOS AGENT GATEWAY
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your API key to continue
        </Typography>
        <TextField
          autoFocus
          fullWidth
          placeholder="sk-..."
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          error={!!error}
          helperText={error}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <VpnKey sx={{ fontSize: 18, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={submit}
          disabled={loading}
          sx={{ py: 1.2 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : "Connect"}
        </Button>
      </Box>
    </Dialog>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem("apiKey");
    setLoggedIn(false);
  }, []);

  useEffect(() => {
    onAuthError(logout);
    const saved = localStorage.getItem("apiKey");
    if (saved) {
      validateKey(saved).then((valid) => {
        if (valid) setLoggedIn(true);
        else localStorage.removeItem("apiKey");
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, [logout]);

  const notify = useCallback((msg, severity = "success") => {
    setToast({ msg, severity });
  }, []);

  if (checking) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Header */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "rgba(15,17,23,0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ minHeight: "52px !important", px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexGrow: 1 }}>
            <Box
              sx={{
                width: 28, height: 28, borderRadius: "7px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>B</Typography>
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
              BOS AGENT GATEWAY
            </Typography>
          </Box>
          {loggedIn && (
            <Button
              size="small"
              color="inherit"
              startIcon={<Logout sx={{ fontSize: 16 }} />}
              onClick={logout}
              sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}
            >
              Logout
            </Button>
          )}
        </Toolbar>

        {/* Tabs inside header */}
        {loggedIn && (
          <Box sx={{ px: { xs: 2, md: 3 } }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                minHeight: 40,
                "& .MuiTab-root": { minHeight: 40, py: 0 },
              }}
            >
              <Tab label="Dashboard" />
              <Tab label="Agents" />
              <Tab label="Users" />
            </Tabs>
          </Box>
        )}
      </AppBar>

      <LoginDialog open={!loggedIn} onLogin={() => setLoggedIn(true)} />

      {loggedIn && (
        <Fade in timeout={300}>
          <Container maxWidth="lg" sx={{ py: 4 }}>
            {tab === 0 && <DashboardPage notify={notify} />}
            {tab === 1 && <AgentsPage notify={notify} />}
            {tab === 2 && <UsersPage notify={notify} />}
          </Container>
        </Fade>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === "error" ? 10000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast && (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            variant="filled"
            sx={{ whiteSpace: "pre-line", maxWidth: 600 }}
          >
            {toast.msg}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
