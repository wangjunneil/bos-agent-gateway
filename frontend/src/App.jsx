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
import { VpnKey, Logout, GitHub, Api as ApiIcon } from "@mui/icons-material";
import { setApiKey, validateKey, onAuthError } from "./api";
import DashboardPage from "./pages/Dashboard";
import AgentsPage from "./pages/Agents";
import UsersPage from "./pages/Users";
import AgentDetail from "./pages/AgentDetail";

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
            width: 56,
            height: 56,
            mx: "auto",
            mb: 2,
            borderRadius: "8px",
            background: "linear-gradient(135deg, #0070F2 0%, #0057B8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <VpnKey sx={{ fontSize: 28, color: "#fff" }} />
        </Box>
        <DialogTitle sx={{ p: 0, mb: 1, fontSize: "1.1rem", fontWeight: 700, color: "#1D2D3E" }}>
          BOS AGENT GATEWAY
        </DialogTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your API key to continue
        </Typography>
        <TextField
          autoFocus
          fullWidth
          placeholder="sk-..."
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setError("");
          }}
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
          sx={{ py: 1.2, fontWeight: 600 }}
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
  const [agentDetail, setAgentDetail] = useState(null);

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
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress sx={{ color: "#0070F2" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F5F6F7" }}>
      {/* Header */}
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ minHeight: "52px !important", px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexGrow: 1 }}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #0070F2 0%, #0057B8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                B
              </Typography>
            </Box>
            <Typography
              variant="body1"
              sx={{ fontWeight: 600, color: "#1D2D3E", letterSpacing: "-0.01em" }}
            >
              BOS Agent Gateway
            </Typography>
          </Box>
          {loggedIn && (
            <>
              <Button
                size="small"
                component="a"
                href="/redoc"
                target="_blank"
                startIcon={<ApiIcon sx={{ fontSize: 16 }} />}
                sx={{
                  color: "#5B738B",
                  minWidth: 0,
                  mr: 0.5,
                  fontSize: "0.75rem",
                  "&:hover": { color: "#1D2D3E", backgroundColor: "rgba(0,0,0,0.04)" },
                }}
              >
                API
              </Button>
              <Button
                size="small"
                component="a"
                href="https://github.com/wangjunneil"
                target="_blank"
                startIcon={<GitHub sx={{ fontSize: 16 }} />}
                sx={{
                  color: "#5B738B",
                  minWidth: 0,
                  mr: 0.5,
                  fontSize: "0.75rem",
                  "&:hover": { color: "#1D2D3E", backgroundColor: "rgba(0,0,0,0.04)" },
                }}
              >
                GitHub
              </Button>
              <Button
                size="small"
                color="inherit"
                startIcon={<Logout sx={{ fontSize: 16 }} />}
                onClick={logout}
                sx={{
                  color: "#5B738B",
                  minWidth: 0,
                  "&:hover": { color: "#1D2D3E", backgroundColor: "rgba(0,0,0,0.04)" },
                }}
              >
                Logout
              </Button>
            </>
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
            {agentDetail ? (
              <AgentDetail
                agentId={agentDetail.agentId}
                agentName={agentDetail.agentName}
                onBack={() => setAgentDetail(null)}
              />
            ) : (
              <>
                {tab === 0 && (
                  <DashboardPage
                    notify={notify}
                    onAgentClick={(agentId, agentName) => setAgentDetail({ agentId, agentName })}
                  />
                )}
                {tab === 1 && <AgentsPage notify={notify} />}
                {tab === 2 && <UsersPage notify={notify} />}
              </>
            )}
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
