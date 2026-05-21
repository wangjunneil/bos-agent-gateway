import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Slider,
  Stack,
  TextField,
  Typography,
  InputAdornment,
} from "@mui/material";
import {
  Add,
  Delete,
  Key,
  ExpandMore,
  PersonAdd,
  LinkOff,
  Speed,
  ContentCopy,
} from "@mui/icons-material";
import { api, setApiKey } from "../api";

const DEFAULT_RPM = 60;

export default function UsersPage({ notify }) {
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [username, setUsername] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [newKeyDialog, setNewKeyDialog] = useState(null);  // { userId, key, canApply } | null
  const [assignDialog, setAssignDialog] = useState(null);
  const [rateLimitDialog, setRateLimitDialog] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = () => {
    api.listUsers().then(setUsers).catch((e) => notify(e.message, "error"));
    api.listAgents().then(setAgents).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!username.trim()) return;
    try {
      const user = await api.createUser(username.trim());
      setUsername("");
      setNewKeyDialog({ userId: user.id, key: user.api_key, canApply: false });
      notify("User created");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteUser(id);
      notify("User deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const openKeyDialog = (id) => {
    setNewKeyDialog({ userId: id, key: null, canApply: true });
  };

  const regenKey = async () => {
    const userId = newKeyDialog?.userId;
    if (!userId) return;
    try {
      const res = await api.regenerateApiKey(userId);
      setNewKeyDialog({ userId, key: res.api_key });
      notify("API key regenerated");
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <Box>
      {/* Create User */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          size="small"
          sx={{ flex: 4 }}
          placeholder="输入用户名"
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          InputProps={{
            sx: { fontSize: "0.8rem" },
            startAdornment: (
              <InputAdornment position="start">
                <PersonAdd sx={{ fontSize: 16, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={create}
          sx={{ whiteSpace: "nowrap", px: 3, display: "flex", alignItems: "center", gap: 0.5 }}
        >
          Create User
        </Button>
      </Stack>

      {/* User Cards */}
      <Stack spacing={2}>
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {u.username}
                  </Typography>
                </Box>

                {/* Role badge */}
                <Chip
                  label={u.role}
                  size="small"
                  sx={
                    u.role === "admin"
                      ? {
                          bgcolor: "rgba(0,112,242,0.08)",
                          color: "#0057B8",
                          fontWeight: 600,
                          border: "1px solid rgba(0,112,242,0.2)",
                        }
                      : {
                          bgcolor: "#F5F6F7",
                          color: "#5B738B",
                          border: "1px solid #D5DADD",
                        }
                  }
                />

                {/* Active status */}
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.5,
                    py: 0.4,
                    borderRadius: "4px",
                    bgcolor: u.is_active ? "rgba(24,137,24,0.08)" : "rgba(91,115,139,0.08)",
                    border: "1px solid",
                    borderColor: u.is_active ? "rgba(24,137,24,0.2)" : "rgba(91,115,139,0.2)",
                  }}
                >
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      bgcolor: u.is_active ? "#188918" : "#5B738B",
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: u.is_active ? "#188918" : "#5B738B",
                      lineHeight: 1,
                    }}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </Typography>
                </Box>

                {/* Rate limit */}
                <Chip
                  icon={<Speed sx={{ fontSize: 14 }} />}
                  label={`${u.rate_limit ?? DEFAULT_RPM} rpm`}
                  size="small"
                  onClick={() => setRateLimitDialog(u)}
                  sx={{
                    cursor: "pointer",
                    bgcolor: u.rate_limit != null ? "rgba(231,139,7,0.08)" : "transparent",
                    color: u.rate_limit != null ? "#B26D05" : "#5B738B",
                    border: "1px solid",
                    borderColor: u.rate_limit != null ? "rgba(231,139,7,0.2)" : "#D5DADD",
                    fontWeight: 600,
                    "&:hover": {
                      bgcolor: u.rate_limit != null
                        ? "rgba(231,139,7,0.12)"
                        : "rgba(0,0,0,0.04)",
                    },
                  }}
                />

                <IconButton
                  size="small"
                  onClick={() => openKeyDialog(u.id)}
                  title="Regenerate API Key"
                  sx={{ color: "#5B738B", "&:hover": { color: "#0070F2" } }}
                >
                  <Key sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                  sx={{
                    transition: "transform 0.2s ease",
                    transform: expanded === u.id ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <ExpandMore sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => remove(u.id)}
                  sx={{
                    color: "#D9364B",
                    opacity: 0.6,
                    "&:hover": { opacity: 1, backgroundColor: "rgba(217,54,75,0.08)" },
                  }}
                >
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>

              <Collapse in={expanded === u.id} timeout={200} key={`${u.id}-${refreshKey}`}>
                <UserAgents
                  userId={u.id}
                  allAgents={agents}
                  notify={notify}
                  onAssignOpen={() => setAssignDialog(u.id)}
                />
              </Collapse>
            </CardContent>
          </Card>
        ))}
        {users.length === 0 && (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography color="text.secondary">No users.</Typography>
          </Box>
        )}
      </Stack>

      {/* API Key Dialog */}
      <Dialog open={!!newKeyDialog} onClose={() => setNewKeyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>API Key</DialogTitle>
        <DialogContent>
          {newKeyDialog?.key ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Copy this key now. It will not be shown again.
              </Typography>
              <TextField
                fullWidth
                value={newKeyDialog.key}
                InputProps={{
                  readOnly: true,
                  sx: { fontFamily: "monospace", fontSize: "0.85rem" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => {
                          navigator.clipboard.writeText(newKeyDialog.key);
                          notify("Copied to clipboard");
                        }}
                        size="small"
                      >
                        <ContentCopy sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                onFocus={(e) => e.target.select()}
              />
            </>
          ) : (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Key sx={{ fontSize: 40, color: "#5B738B", mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                API keys cannot be retrieved after creation.<br />
                Generate a new key to replace the current one.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewKeyDialog(null)} sx={{ color: "text.secondary" }}>
            Close
          </Button>
          {newKeyDialog?.key && newKeyDialog?.canApply ? (
            <Button
              variant="contained"
              onClick={() => {
                setApiKey(newKeyDialog.key);
                setNewKeyDialog(null);
                notify("API key applied to current session");
              }}
            >
              Apply &amp; Close
            </Button>
          ) : (
            <Button variant="contained" onClick={regenKey}>
              Generate New Key
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {assignDialog && (
        <AssignDialog
          userId={assignDialog}
          agents={agents}
          onClose={() => {
            setAssignDialog(null);
            setRefreshKey((k) => k + 1);
            load();
          }}
          notify={notify}
        />
      )}

      {rateLimitDialog && (
        <RateLimitDialog
          user={rateLimitDialog}
          onClose={() => {
            setRateLimitDialog(null);
            load();
          }}
          notify={notify}
        />
      )}
    </Box>
  );
}

function RateLimitDialog({ user, onClose, notify }) {
  const [value, setValue] = useState(user.rate_limit ?? DEFAULT_RPM);
  const [preset, setPreset] = useState(user.rate_limit == null ? "default" : "custom");

  const presets = [
    { label: `Default (${DEFAULT_RPM})`, key: "default", val: null },
    { label: "Low (20)", key: "low", val: 20 },
    { label: "High (120)", key: "high", val: 120 },
    { label: "Custom", key: "custom", val: null },
  ];

  const selectPreset = (p) => {
    setPreset(p.key);
    if (p.key === "default") setValue(DEFAULT_RPM);
    else if (p.val != null) setValue(p.val);
  };

  const save = async () => {
    try {
      const rateLimit = preset === "default" ? null : value;
      await api.updateUser(user.id, { rate_limit: rateLimit });
      notify("Rate limit updated");
      onClose();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Rate Limit &mdash; {user.username}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Requests per minute
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
          {presets.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              size="small"
              variant={preset === p.key ? "filled" : "outlined"}
              color={preset === p.key ? "primary" : "default"}
              onClick={() => selectPreset(p)}
              sx={{ cursor: "pointer" }}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Slider
            value={value}
            onChange={(_, v) => {
              setValue(v);
              setPreset("custom");
            }}
            min={1}
            max={300}
            step={1}
            sx={{ flex: 1 }}
          />
          <TextField
            type="number"
            size="small"
            value={value}
            onChange={(e) => {
              setValue(Math.max(1, parseInt(e.target.value) || 1));
              setPreset("custom");
            }}
            sx={{ width: 80 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function UserAgents({ userId, allAgents, notify, onAssignOpen }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.getUser(userId).then(setDetail).catch(() => {});
  }, [userId]);

  const removeAccess = async (agentId) => {
    try {
      await api.removeAgentAccess(userId, agentId);
      notify("Access removed");
      api.getUser(userId).then(setDetail);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Assigned Agents</Typography>
        <IconButton
          size="small"
          onClick={onAssignOpen}
          sx={{ color: "#0070F2", "&:hover": { color: "#0057B8" } }}
        >
          <Add sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
      {detail?.agents?.length ? (
        <List dense sx={{ mx: -1 }}>
          {detail.agents.map((a) => (
            <ListItem
              key={a.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => removeAccess(a.id)}
                  sx={{ color: "#5B738B", "&:hover": { color: "#D9364B" } }}
                >
                  <LinkOff sx={{ fontSize: 16 }} />
                </IconButton>
              }
              sx={{
                borderRadius: 1,
                "&:hover": { bgcolor: "#F5F6F7" },
              }}
            >
              <ListItemText
                primary={a.name || a.base_url}
                secondary={a.base_url}
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                secondaryTypographyProps={{
                  variant: "caption",
                  sx: { fontFamily: "monospace", fontSize: "0.7rem" },
                }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No agents assigned.
        </Typography>
      )}
    </Box>
  );
}

function AssignDialog({ userId, agents, onClose, notify }) {
  const [selected, setSelected] = useState([]);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const assign = async () => {
    if (!selected.length) return;
    try {
      await api.assignAgents(userId, selected);
      notify("Agents assigned");
      onClose();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Assign Agents</DialogTitle>
      <DialogContent>
        <List dense>
          {agents.map((a) => (
            <ListItem
              key={a.id}
              onClick={() => toggle(a.id)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                cursor: "pointer",
                bgcolor: selected.includes(a.id) ? "rgba(0,112,242,0.06)" : "transparent",
                "&:hover": { bgcolor: selected.includes(a.id) ? "rgba(0,112,242,0.1)" : "#F5F6F7" },
              }}
            >
              <Checkbox
                checked={selected.includes(a.id)}
                size="small"
                sx={{ mr: 1, py: 0 }}
              />
              <ListItemText
                primary={a.name || a.base_url}
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
              />
            </ListItem>
          ))}
          {agents.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              No agents available.
            </Typography>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button variant="contained" onClick={assign} disabled={!selected.length}>
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
