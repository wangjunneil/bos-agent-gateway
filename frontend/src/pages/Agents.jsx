import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  ExpandLess,
  Clear,
  ContentCopy,
} from "@mui/icons-material";
import { api } from "../api";

const STATUS_COLORS = {
  online: "#22c55e",
  offline: "#71717a",
  error: "#ef4444",
  unknown: "#f59e0b",
};

const STATUS_BG = {
  online: "rgba(34,197,94,0.1)",
  offline: "rgba(113,113,122,0.1)",
  error: "rgba(239,68,68,0.1)",
  unknown: "rgba(245,158,11,0.1)",
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
        borderRadius: "20px",
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
          boxShadow: `0 0 6px ${STATUS_COLORS[status] || STATUS_COLORS.unknown}80`,
        }}
      />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: STATUS_COLORS[status] || STATUS_COLORS.unknown, lineHeight: 1 }}
      >
        {status}
      </Typography>
    </Box>
  );
}

export default function AgentsPage({ notify }) {
  const [agents, setAgents] = useState([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    const tagFilter = filterTags.length > 0 ? filterTags.join(",") : undefined;
    api.listAgents(tagFilter).then(setAgents).catch((e) => notify(e.message, "error"));
    api.listTags().then(setAllTags).catch(() => {});
  };

  useEffect(() => { load(); }, [filterTags]);

  const register = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      await api.registerAgent(url.trim());
      setUrl("");
      notify("Agent registered");
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

  const toggleFilter = (tag) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const copyGatewayUrl = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/a2a/${id}`);
    notify("Gateway URL copied");
  };

  return (
    <Box>
      {/* Register Bar */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="https://agent.example.com"
          label="Agent Base URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && register()}
        />
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={register}
          disabled={loading}
          sx={{ whiteSpace: "nowrap", px: 3 }}
        >
          Register
        </Button>
      </Stack>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="subtitle2" sx={{ mr: 0.5 }}>
              Filter:
            </Typography>
            {allTags.map((t) => (
              <Chip
                key={t.tag}
                label={`${t.tag} (${t.count})`}
                size="small"
                variant={filterTags.includes(t.tag) ? "filled" : "outlined"}
                color={filterTags.includes(t.tag) ? "primary" : "default"}
                onClick={() => toggleFilter(t.tag)}
                sx={{ cursor: "pointer" }}
              />
            ))}
            {filterTags.length > 0 && (
              <Button
                size="small"
                startIcon={<Clear sx={{ fontSize: 14 }} />}
                onClick={() => setFilterTags([])}
                sx={{ color: "text.secondary" }}
              >
                Clear
              </Button>
            )}
          </Stack>
        </Box>
      )}

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
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {a.name || a.base_url}
                    </Typography>
                    {a.tags?.map((t) => (
                      <Chip
                        key={t}
                        label={t}
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() => toggleFilter(t)}
                        sx={{
                          cursor: "pointer",
                          height: 22,
                          fontSize: "0.7rem",
                          "& .MuiChip-label": { px: 1 },
                        }}
                      />
                    ))}
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {`${window.location.origin}/a2a/${a.id}`}
                    </Typography>
                    <Tooltip title="Copy gateway URL" arrow>
                      <IconButton size="small" onClick={() => copyGatewayUrl(a.id)} sx={{ p: 0.3 }}>
                        <ContentCopy sx={{ fontSize: 13, color: "text.secondary" }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>

                <StatusBadge status={a.status} />

                <FormControlLabel
                  control={
                    <Switch checked={a.is_public} onChange={() => togglePublic(a)} size="small" />
                  }
                  label={<Typography variant="caption" color="text.secondary">Public</Typography>}
                  sx={{ ml: 0 }}
                />
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
                  sx={{ color: "error.main", opacity: 0.6, "&:hover": { opacity: 1 } }}
                >
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>

              {a.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {a.description}
                </Typography>
              )}
              {a.last_seen && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Last seen: {new Date(a.last_seen).toLocaleString()}
                </Typography>
              )}

              <Collapse in={expanded === a.id} timeout={200}>
                <AgentCardView agentId={a.id} notify={notify} onTagsChanged={load} />
              </Collapse>
            </CardContent>
          </Card>
        ))}
        {agents.length === 0 && (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">
              No agents registered yet.
            </Typography>
          </Box>
        )}
      </Stack>

      {/* Delete Confirm */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Agent</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete <strong>{confirmDelete?.name || confirmDelete?.base_url}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
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
      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

function AgentCardView({ agentId, notify, onTagsChanged }) {
  const [card, setCard] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editTags, setEditTags] = useState(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    api.getAgent(agentId).then((d) => {
      setCard(d.agent_card);
      setDetail(d);
    }).catch(() => {});
  }, [agentId]);

  const startEditTags = () => setEditTags(detail?.tags || []);

  const saveTags = async () => {
    try {
      await api.updateAgent(agentId, { tags: editTags });
      setEditTags(null);
      notify("Tags updated");
      onTagsChanged();
      api.getAgent(agentId).then((d) => { setCard(d.agent_card); setDetail(d); });
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const addEditTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !editTags.includes(t) && editTags.length < 10) {
      setEditTags([...editTags, t]);
    }
    setTagInput("");
  };

  if (!card) return null;

  const skills = card.skills || [];
  const caps = card.capabilities || {};

  return (
    <Box
      sx={{
        mt: 2,
        p: 2.5,
        bgcolor: "rgba(255,255,255,0.02)",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <InfoRow label="Name" value={card.name} />
      <InfoRow label="Description" value={card.description} />
      <InfoRow label="URL" value={card.url} />
      <InfoRow label="Version" value={card.version} />
      <InfoRow label="Provider" value={card.provider?.organization} />
      <InfoRow label="Documentation" value={card.documentationUrl} />

      {/* Tags section */}
      <Box sx={{ mt: 2, mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Tags</Typography>
          {editTags === null ? (
            <Button size="small" onClick={startEditTags} sx={{ minWidth: 0, fontSize: "0.75rem" }}>
              Edit
            </Button>
          ) : (
            <>
              <Button size="small" onClick={saveTags} color="primary" sx={{ minWidth: 0, fontSize: "0.75rem" }}>Save</Button>
              <Button size="small" onClick={() => setEditTags(null)} sx={{ minWidth: 0, fontSize: "0.75rem", color: "text.secondary" }}>Cancel</Button>
            </>
          )}
        </Stack>
        {editTags !== null ? (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
            {editTags.map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                color="primary"
                onDelete={() => setEditTags(editTags.filter((x) => x !== t))}
              />
            ))}
            <TextField
              size="small"
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addEditTag(); }
              }}
              sx={{ width: 130, "& .MuiOutlinedInput-root": { fontSize: "0.8rem" } }}
            />
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {(detail?.tags || []).length > 0
              ? detail.tags.map((t) => (
                  <Chip key={t} label={t} size="small" variant="outlined" color="primary"
                    sx={{ height: 24, fontSize: "0.72rem" }}
                  />
                ))
              : <Typography variant="caption" color="text.secondary">No tags</Typography>
            }
          </Stack>
        )}
      </Box>

      {Object.keys(caps).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Capabilities</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {caps.streaming && <Chip label="Streaming" size="small" sx={{ bgcolor: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "none" }} />}
            {caps.pushNotifications && <Chip label="Push Notifications" size="small" sx={{ bgcolor: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "none" }} />}
            {caps.stateTransitionHistory && <Chip label="State History" size="small" sx={{ bgcolor: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "none" }} />}
          </Stack>
        </Box>
      )}

      {skills.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Skills ({skills.length})</Typography>
          <Stack spacing={1}>
            {skills.map((s, i) => (
              <Box
                key={i}
                sx={{
                  pl: 1.5,
                  borderLeft: "2px solid",
                  borderColor: "primary.dark",
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {s.name || s.id}
                </Typography>
                {s.description && (
                  <Typography variant="caption" color="text.secondary">
                    {s.description}
                  </Typography>
                )}
                {s.tags?.length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {s.tags.map((t) => (
                      <Chip key={t} label={t} size="small" variant="outlined"
                        sx={{ height: 22, fontSize: "0.68rem", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {card.defaultInputModes?.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <InfoRow label="Input Modes" value={card.defaultInputModes.join(", ")} />
        </Box>
      )}
      {card.defaultOutputModes?.length > 0 && (
        <InfoRow label="Output Modes" value={card.defaultOutputModes.join(", ")} />
      )}
    </Box>
  );
}
