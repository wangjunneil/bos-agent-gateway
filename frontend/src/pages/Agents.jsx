import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
  FormControlLabel,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import {
  Add,
  Delete,
  ExpandMore,
  ContentCopy,
  Edit,
  Check,
  Close,
  VpnKey as VpnKeyIcon,
} from "@mui/icons-material";
import { api } from "../api";

const STATUS_COLORS = {
  online: "#188918",
  offline: "#5B738B",
  error: "#D9364B",
  unknown: "#E78B07",
};

const STATUS_BG = {
  online: "rgba(24,137,24,0.08)",
  offline: "rgba(91,115,139,0.08)",
  error: "rgba(217,54,75,0.08)",
  unknown: "rgba(231,139,7,0.08)",
};

function StatusBadge({ status }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 0.4,
        borderRadius: "4px",
        bgcolor: STATUS_BG[status] || STATUS_BG.unknown,
        border: "1px solid",
        borderColor: `${STATUS_COLORS[status] || STATUS_COLORS.unknown}30`,
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: STATUS_COLORS[status] || STATUS_COLORS.unknown,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: STATUS_COLORS[status] || STATUS_COLORS.unknown,
          lineHeight: 1,
        }}
      >
        {status}
      </Typography>
    </Box>
  );
}

export default function AgentsPage({ notify }) {
  const [agents, setAgents] = useState([]);
  const [difyUrl, setDifyUrl] = useState("");
  const [difyApiKey, setDifyApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [commandModeEnabled, setCommandModeEnabled] = useState(false);

  const load = () => {
    api.listAgents().then(setAgents).catch((e) => notify(e.message, "error"));
  };

  useEffect(() => {
    load();
    api
      .getPublicSettings()
      .then((data) => {
        setCommandModeEnabled(!!data?.command_mode_enabled);
      })
      .catch(() => {});
  }, []);

  const register = async () => {
    if (!difyUrl.trim() || !difyApiKey.trim()) return;
    setLoading(true);
    try {
      await api.registerAgent(difyUrl.trim(), difyApiKey.trim());
      setDifyUrl("");
      setDifyApiKey("");
      notify("Dify app registered");
      load();
    } catch (e) {
      if (e.validationErrors?.length) {
        notify(`${e.message}:\n${e.validationErrors.join("\n")}`, "error");
      } else {
        notify(e.message, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const remove = async (agent) => {
    setConfirmDelete(null);
    try {
      await api.deleteAgent(agent.id);
      notify("Agent deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const togglePublic = async (agent) => {
    try {
      await api.updateAgent(agent.id, { is_public: !agent.is_public });
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const toggleCommand = async (agent) => {
    try {
      await api.updateAgent(agent.id, { command_enabled: !agent.command_enabled });
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const copyGatewayUrl = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/agent/${id}/`);
    notify("Gateway URL copied");
  };

  return (
    <Box>
      {/* Register Bar */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          size="small"
          sx={{ flex: 4 }}
          placeholder="https://xxx.xxx.xxx/v1"
          label="BASE URL"
          value={difyUrl}
          onChange={(e) => setDifyUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && register()}
          InputProps={{
            sx: { fontSize: "0.8rem" },
            startAdornment: (
              <InputAdornment position="start">
                <VpnKeyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          size="small"
          sx={{ flex: 2 }}
          placeholder="app-xxxxxxxxxxxx"
          label="API Key"
          value={difyApiKey}
          onChange={(e) => setDifyApiKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && register()}
          InputProps={{
            sx: { fontSize: "0.8rem" },
            startAdornment: (
              <InputAdornment position="start">
                <VpnKeyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={register}
          disabled={loading}
          sx={{ whiteSpace: "nowrap", px: 3, display: "flex", alignItems: "center", gap: 0.5 }}
        >
          Register
        </Button>
      </Stack>

      {/* Agent Cards */}
      <Stack spacing={2}>
        {agents.map((a) => (
          <Card
            key={a.id}
            sx={{
              borderLeft: "3px solid",
              borderLeftColor: STATUS_COLORS[a.status] || STATUS_COLORS.unknown,
            }}
          >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, fontSize: "0.8rem" }}>
                    {a.name || a.base_url}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {`${window.location.origin}/agent/${a.id}/`}
                    </Typography>
                    <Tooltip title="Copy gateway URL" arrow>
                      <IconButton size="small" onClick={() => copyGatewayUrl(a.id)} sx={{ p: 0.3 }}>
                        <ContentCopy sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.3 }}>
                    <Typography
                      variant="caption"
                      component="a"
                      href={a.base_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                        "&:hover": { color: "primary.main", textDecoration: "underline" },
                      }}
                    >
                      {a.base_url}
                    </Typography>
                  </Stack>
                </Box>

                <StatusBadge status={a.status} />

                <Tooltip title="命令模式：开启后 /chat-messages 请求先经命令服务审批，返回 PASS 才放行" arrow>
                <FormControlLabel
                  control={
                    <Switch checked={a.command_enabled} onChange={() => toggleCommand(a)} size="small" disabled={!commandModeEnabled} />
                  }
                  label={
                    <Typography variant="caption" color={commandModeEnabled ? "text.secondary" : "#D5DADD"}>
                      CMD
                    </Typography>
                  }
                  sx={{ ml: 0 }}
                />
                </Tooltip>

                <Tooltip title="公开访问：开启后所有认证用户可用；关闭后仅 admin 和已分配用户可用" arrow>
                <FormControlLabel
                  control={
                    <Switch checked={a.is_public} onChange={() => togglePublic(a)} size="small" />
                  }
                  label={
                    <Typography variant="caption" color="text.secondary">
                      Public
                    </Typography>
                  }
                  sx={{ ml: 0 }}
                />
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  sx={{
                    transition: "transform 0.2s ease",
                    transform: expanded === a.id ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <ExpandMore sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setConfirmDelete(a)}
                  sx={{
                    color: "#D9364B",
                    opacity: 0.6,
                    "&:hover": { opacity: 1, backgroundColor: "rgba(217,54,75,0.08)" },
                  }}
                >
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>

              <Collapse in={expanded === a.id} timeout={200}>
                <AgentCardView agentId={a.id} notify={notify} onChanged={load} />
              </Collapse>
            </CardContent>
          </Card>
        ))}
        {agents.length === 0 && (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">No agents registered yet.</Typography>
          </Box>
        )}
      </Stack>

      {/* Delete Confirm */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Agent</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete{" "}
            <strong>{confirmDelete?.name || confirmDelete?.base_url}</strong>? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} variant="outlined">
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => remove(confirmDelete)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ minWidth: 120, color: "text.secondary", fontSize: "0.8rem" }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>{value}</Typography>
    </Stack>
  );
}

function AgentCardView({ agentId, notify, onChanged }) {
  const [card, setCard] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editingKey, setEditingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");

  useEffect(() => {
    api
      .getAgent(agentId)
      .then((d) => {
        setCard(d.agent_info);
        setDetail(d);
      })
      .catch(() => {});
  }, [agentId]);

  const startEditKey = () => {
    setNewApiKey("");
    setEditingKey(true);
  };

  const saveKey = async () => {
    if (!newApiKey.trim()) return;
    try {
      await api.updateAgent(agentId, { dify_api_key: newApiKey.trim() });
      notify("API Key updated");
      setEditingKey(false);
      onChanged();
      api.getAgent(agentId).then((d) => {
        setCard(d.agent_info);
        setDetail(d);
      });
    } catch (e) {
      notify(e.message, "error");
    }
  };

  if (!card) return null;

  return (
    <Box
      sx={{
        mt: 2,
        p: 2.5,
        bgcolor: "#F5F6F7",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <InfoRow label="Name" value={card.name} />
      <InfoRow label="Description" value={card.description} />
      <InfoRow label="Mode" value={card.mode} />
      <InfoRow label="Author" value={card.author_name} />

      {detail?.last_seen && (
        <InfoRow
          label="Last Seen"
          value={new Date(detail.last_seen).toLocaleString()}
        />
      )}

      {/* API Key */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120, color: "text.secondary" }}>
          API Key
        </Typography>
        {editingKey ? (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1 }}>
            <TextField
              size="small"
              placeholder="app-xxxxxxxxxxxx"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveKey();
                if (e.key === "Escape") setEditingKey(false);
              }}
              autoFocus
              sx={{ flex: 1, "& .MuiOutlinedInput-root": { fontSize: "0.8rem" } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <VpnKeyIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                  </InputAdornment>
                ),
              }}
            />
            <IconButton size="small" onClick={saveKey} color="primary">
              <Check sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={() => setEditingKey(false)}>
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
              ********
            </Typography>
            <IconButton size="small" onClick={startEditKey} sx={{ ml: 0.5 }}>
              <Edit sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
