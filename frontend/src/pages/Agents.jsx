import { useState, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Select,
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
  Chat,
  Close,
  ContentCopy,
  Delete,
  Edit,
  ExpandMore,
  Send,
  Terminal,
  VpnKey as VpnKeyIcon,
} from "@mui/icons-material";
import { api, streamChat } from "../api";

function MarkdownContent({ text }) {
  const parts = useMemo(() => {
    const result = [];
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let lastIndex = 0;
    let match;

    while ((match = thinkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      result.push({ type: "think", content: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      result.push({ type: "text", content: text.slice(lastIndex) });
    }
    return result;
  }, [text]);

  return (
    <Box>
      {parts.map((part, i) =>
        part.type === "think" ? (
          <Box
            key={i}
            sx={{
              bgcolor: "#EDEFF2",
              color: "#7D8D9E",
              p: 1.5,
              borderRadius: 1,
              mb: 1,
              fontSize: "0.8rem",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {part.content}
          </Box>
        ) : (
          <Box
            key={i}
            sx={{
              fontSize: "0.8rem",
              lineHeight: 1.6,
              "& p": { m: 0, mb: 0.5 },
              "& code": { bgcolor: "#EDEFF2", px: 0.5, borderRadius: 0.5 },
              "& pre": { bgcolor: "#EDEFF2", p: 1.5, borderRadius: 1, overflow: "auto" },
              "& ul, & ol": { pl: 2.5, mb: 1 },
              "& li": { mb: 0.25 },
              "& strong": { fontWeight: 600 },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}
            >
              {part.content}
            </ReactMarkdown>
          </Box>
        )
      )}
    </Box>
  );
}

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

function ChatDialog({ agentId, agentName, commandEnabled, open, onClose }) {
  const USER_HISTORY_KEY = "chatUserHistory";
  const [userHistory, setUserHistory] = useState([]);
  const [user, setUser] = useState("");
  const [conversationId, setConversationId] = useState("等待生成");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [commands, setCommands] = useState([]);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [menuIndex, setMenuIndex] = useState(0);
  const [commandFetchUrl, setCommandFetchUrl] = useState("");
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const cmdAnchorRef = useRef(null);

  // Load user history and command URL on open
  useEffect(() => {
    if (open) {
      try {
        const hist = JSON.parse(localStorage.getItem(USER_HISTORY_KEY) || "[]");
        setUserHistory(hist);
        if (hist.length > 0) setUser(hist[0]);
      } catch {
        setUserHistory([]);
      }
      setConversationId("等待生成");
      api.getPublicSettings().then((d) => {
        if (d?.command_fetch_url) setCommandFetchUrl(d.command_fetch_url);
      }).catch(() => {});
    }
  }, [open]);

  // Fetch commands
  useEffect(() => {
    if (open && commandFetchUrl) {
      fetch(commandFetchUrl)
        .then((res) => res.json())
        .then((data) => setCommands(data?.value || []))
        .catch(() => {});
    }
  }, [open, commandFetchUrl]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const saveUser = (u) => {
    if (!u) return;
    const updated = [u, ...userHistory.filter((x) => x !== u)].slice(0, 10);
    setUserHistory(updated);
    localStorage.setItem(USER_HISTORY_KEY, JSON.stringify(updated));
  };

  const handleSend = () => {
    if (!input.trim() || !user.trim() || loading) return;
    saveUser(user.trim());
    const q = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    setStreamingContent("");
    setCommandMenuOpen(false);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = streamChat(
        agentId, q, user.trim(),
        (chunk) => { setStreamingContent((prev) => prev + chunk); },
        () => {
            setStreamingContent((prev) => {
                if (prev) setMessages((msgs) => [...msgs, { role: "agent", content: prev }]);
                return "";
            });
            setLoading(false);
            abortRef.current = null;
        },
        (e) => {
            setMessages((prev) => [...prev, { role: "agent", content: `Error: ${e.message}` }]);
            setLoading(false);
            abortRef.current = null;
        },
        (cid) => { if (cid && cid !== conversationId) setConversationId(cid); }
    );
  };

  const handleClose = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    onClose();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleKeyDown = (e) => {
    if (commandMenuOpen) return;
    handleInputKeyDown(e);
  };

  const handleCommandSelect = (cmd) => {
    setInput(cmd.command_name + " ");
    setCommandMenuOpen(false);
  };

  const handleCommandKeyDown = (e) => {
    if (!commandMenuOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenuIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenuIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[menuIndex]) handleCommandSelect(filteredCommands[menuIndex]);
    } else if (e.key === "Escape") {
      setCommandMenuOpen(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Chat: {agentName || "Agent"}
          </Typography>
          <IconButton size="small" onClick={handleClose}>
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", p: 2, gap: 1.5 }}>
        {/* User & Conversation ID */}
        <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
          <Autocomplete
            size="small"
            freeSolo
            fullWidth
            options={userHistory}
            value={user || ""}
            onChange={(_, v) => setUser(v || "")}
            onInputChange={(_, v) => setUser(v)}
            renderInput={(params) => (
              <TextField {...params} label="会话标识" />
            )}
          />
          <TextField
            size="small"
            fullWidth
            label="Conversation ID"
            value={conversationId}
            disabled
          />
        </Stack>

        {/* Messages */}
        <Box ref={scrollRef} sx={{ flex: 1, minHeight: 300, maxHeight: 400, overflow: "auto", bgcolor: "#FAFAFB", borderRadius: 1, p: 2, border: "1px solid", borderColor: "divider" }}>
          {messages.length === 0 && !streamingContent && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>输入消息开始对话</Typography>
          )}
          <Stack spacing={2}>
            {messages.map((m, i) => (
              <Box key={i}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: m.role === "user" ? "#0070F2" : "#188918", display: "block", mb: 0.5 }}>
                  {m.role === "user" ? `👤 ${user}` : "🤖 Agent"}
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: m.role === "user" ? "#F0F4FF" : "#F5F6F7", borderColor: m.role === "user" ? "rgba(0,112,242,0.15)" : "#D5DADD", borderRadius: 2 }}>
                  <MarkdownContent text={m.content} />
                </Paper>
                {conversationId && conversationId !== "等待生成" && (
                  <Typography variant="caption" sx={{ color: "#a1a1aa", fontSize: "0.6rem", fontFamily: "monospace", textAlign: "right", display: "block", mt: 0.25 }}>
                    {conversationId}
                  </Typography>
                )}
              </Box>
            ))}
            {streamingContent && (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: "#188918", display: "block", mb: 0.5 }}>🤖 Agent</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#F5F6F7", borderColor: "#D5DADD", borderRadius: 2 }}>
                  <MarkdownContent text={streamingContent} />
                </Paper>
                {conversationId && conversationId !== "等待生成" && (
                  <Typography variant="caption" sx={{ color: "#a1a1aa", fontSize: "0.6rem", fontFamily: "monospace", textAlign: "right", display: "block", mt: 0.25 }}>
                    {conversationId}
                  </Typography>
                )}
              </Box>
            )}
            {loading && !streamingContent && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}><CircularProgress size={18} /></Box>
            )}
          </Stack>
        </Box>
      </DialogContent>

      {/* Input bar */}
      <DialogActions sx={{ px: 2, pb: 2, position: "relative" }}>
        {commandEnabled && (
        <IconButton
          ref={cmdAnchorRef}
          size="small"
          onClick={() => {
            setFilteredCommands(commands);
            setCommandMenuOpen(true);
            setMenuIndex(0);
          }}
          sx={{ color: "#5B738B" }}
        >
          <Terminal sx={{ fontSize: 20 }} />
        </IconButton>
        )}
        <TextField
          fullWidth
          size="small"
          placeholder="输入消息... (Enter 发送, / 命令)"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <Popover
          open={commandMenuOpen}
          anchorEl={cmdAnchorRef.current}
          onClose={() => setCommandMenuOpen(false)}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { maxHeight: 300, minWidth: 360 } } }}
        >
          <List dense disablePadding>
            {filteredCommands.map((c, i) => (
              <ListItem
                key={c.command_name}
                onClick={() => handleCommandSelect(c)}
                sx={{
                  cursor: "pointer",
                  bgcolor: i === menuIndex ? "#F0F4FF" : "transparent",
                  "&:hover": { bgcolor: i === menuIndex ? "#E0E8FF" : "#F5F6F7" },
                }}
              >
                <ListItemText
                  primary={c.command_name}
                  secondary={c.command_desc}
                  primaryTypographyProps={{ variant: "body2", fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: "caption", fontSize: "0.65rem" }}
                />
              </ListItem>
            ))}
            {filteredCommands.length === 0 && (
              <ListItem>
                <ListItemText primary="No matching commands" primaryTypographyProps={{ variant: "body2", color: "text.secondary" }} />
              </ListItem>
            )}
          </List>
        </Popover>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={!input.trim() || !user.trim() || loading}
          sx={{ minWidth: 80, ml: 1 }}
          endIcon={<Send sx={{ fontSize: 16 }} />}
        >
          发送
        </Button>
      </DialogActions>
    </Dialog>
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
  const [chatAgent, setChatAgent] = useState(null);

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

                <Stack direction="column" alignItems="center" spacing={0}>
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
                </Stack>
                <Tooltip title="开始临时对话" arrow>
                  <IconButton
                    size="small"
                    onClick={() => setChatAgent({ id: a.id, name: a.name || a.base_url, commandEnabled: a.command_enabled })}
                    sx={{ color: "#5B738B", "&:hover": { color: "#0070F2" } }}
                  >
                    <Chat sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
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

      {/* Chat Dialog */}
      {chatAgent && (
        <ChatDialog
          agentId={chatAgent.id}
          agentName={chatAgent.name}
          commandEnabled={chatAgent.commandEnabled}
          open={!!chatAgent}
          onClose={() => setChatAgent(null)}
        />
      )}
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
