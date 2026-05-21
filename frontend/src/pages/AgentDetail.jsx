import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  FormControl,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowBack, MoreVert } from "@mui/icons-material";
import { api } from "../api";

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
          </Box>
        )
      )}
    </Box>
  );
}

function ConversationList({ agentId, difyUser, onSelect, selectedId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastId, setLastId] = useState(null);
  const observerRef = useRef(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuConv, setMenuConv] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null); // { id, name }
  const [newName, setNewName] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(null); // { id, name }

  const reload = useCallback(
    async (reset = true) => {
      setLoading(true);
      try {
        const lid = reset ? null : lastId;
        const data = await api.getConversations(agentId, difyUser, reset ? null : lastId);
        setItems((prev) => (reset ? data.data : [...prev, ...data.data]));
        setHasMore(data.has_more);
        if (data.data.length > 0) {
          setLastId(data.data[data.data.length - 1].id);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    },
    [agentId, difyUser, lastId]
  );

  const loadMore = useCallback(() => {
    if (!difyUser || loading || !hasMore) return;
    setLoading(true);
    api
      .getConversations(agentId, difyUser, lastId)
      .then((data) => {
        setItems((prev) => [...prev, ...data.data]);
        setHasMore(data.has_more);
        if (data.data.length > 0) {
          setLastId(data.data[data.data.length - 1].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId, difyUser, lastId, loading, hasMore]);

  useEffect(() => {
    setItems([]);
    setLastId(null);
    setHasMore(true);
    onSelect(null);
  }, [difyUser]);

  useEffect(() => {
    if (difyUser && items.length === 0 && hasMore) {
      reload(true);
    }
  }, [difyUser]);

  const sentinelRef = useCallback(
    (node) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasMore) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loading) {
            loadMore();
          }
        },
        { threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [hasMore, loading, loadMore]
  );

  const handleMenuOpen = (e, conv) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuConv(conv);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuConv(null);
  };

  const handleRenameOpen = () => {
    setRenameDialog({ id: menuConv.id, name: menuConv.name || "New chat" });
    setNewName(menuConv.name || "");
    handleMenuClose();
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    try {
      await api.renameConversation(agentId, renameDialog.id, newName.trim(), difyUser);
      setRenameDialog(null);
      reload(true);
    } catch {
      // silently fail
    }
  };

  const handleDeleteOpen = () => {
    setDeleteDialog({ id: menuConv.id, name: menuConv.name || "New chat" });
    handleMenuClose();
  };

  const handleDelete = async () => {
    try {
      await api.deleteConversation(agentId, deleteDialog.id, difyUser);
      if (deleteDialog.id === selectedId) {
        onSelect(null);
      }
      setDeleteDialog(null);
      reload(true);
    } catch {
      // silently fail
    }
  };

  return (
    <>
      <Box sx={{ maxHeight: "calc(100vh - 180px)", overflow: "auto" }}>
        <List dense disablePadding>
          {items.map((c) => (
            <ListItem
              key={c.id}
              onClick={() => onSelect(c.id)}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={(e) => handleMenuOpen(e, c)}
                  sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
                >
                  <MoreVert sx={{ fontSize: 16 }} />
                </IconButton>
              }
              sx={{
                borderRadius: 1,
                mb: 0.5,
                cursor: "pointer",
                bgcolor: selectedId === c.id ? "rgba(0,112,242,0.08)" : "transparent",
                "&:hover": {
                  bgcolor: selectedId === c.id ? "rgba(0,112,242,0.12)" : "#F5F6F7",
                },
              }}
            >
              <ListItemText
                primary={c.name || "New chat"}
                secondary={
                  <Stack component="span" spacing={0}>
                    <Typography component="span" variant="caption" sx={{ fontSize: "0.6rem", color: "#a1a1aa" }}>
                      {new Date(c.created_at * 1000).toLocaleString()}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ fontSize: "0.6rem", color: "#a1a1aa", fontFamily: "monospace" }}
                    >
                      {c.id}
                    </Typography>
                  </Stack>
                }
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: selectedId === c.id ? 600 : 400,
                  noWrap: true,
                  fontSize: "0.8rem",
                }}
                secondaryTypographyProps={{ component: "div" }}
              />
            </ListItem>
          ))}
          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          <Box ref={sentinelRef} sx={{ height: 1 }} />
        </List>
      </Box>

      {/* Menu */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={handleMenuClose}>
        <MenuItem onClick={handleRenameOpen} dense>
          Rename
        </MenuItem>
        <MenuItem onClick={handleDeleteOpen} dense sx={{ color: "#D9364B" }}>
          Delete
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Conversation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(null)} variant="outlined" size="small">
            Cancel
          </Button>
          <Button onClick={handleRename} variant="contained" size="small">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Conversation</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete &ldquo;{deleteDialog?.name}&rdquo;? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)} variant="outlined" size="small">
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" size="small">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function MessageList({ agentId, difyUser, conversationId, autoRefreshInterval }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!difyUser || !conversationId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await api.getMessages(agentId, difyUser, conversationId);
      setItems(data.data);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [agentId, difyUser, conversationId]);

  useEffect(() => {
    setItems([]);
  }, [conversationId]);

  useEffect(() => {
    if (difyUser && conversationId) {
      load();
    }
  }, [difyUser, conversationId, load]);

  useEffect(() => {
    if (autoRefreshInterval > 0 && conversationId) {
      timerRef.current = setInterval(load, autoRefreshInterval * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, load, conversationId]);

  return (
    <>
      <Box ref={scrollRef} sx={{ maxHeight: "calc(100vh - 210px)", overflow: "auto", px: 1 }}>
        <Stack spacing={2}>
          {items.map((m) => (
            <Box key={m.id}>
              {m.query && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: "#5B738B", mb: 0.5, display: "block" }}
                  >
                    User
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      bgcolor: "#F0F4FF",
                      borderColor: "rgba(0,112,242,0.15)",
                      borderRadius: 2,
                    }}
                  >
                    <MarkdownContent text={m.query} />
                  </Paper>
                </Box>
              )}
              {m.answer && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: "#5B738B", mb: 0.5, display: "block" }}
                  >
                    Agent
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      bgcolor: "#F5F6F7",
                      borderColor: "#D5DADD",
                      borderRadius: 2,
                    }}
                  >
                    <MarkdownContent text={m.answer} />
                  </Paper>
                </Box>
              )}
              <Typography
                variant="caption"
                sx={{ color: "#a1a1aa", mt: 0.5, display: "block" }}
              >
                {new Date(m.created_at * 1000).toLocaleString()}
              </Typography>
            </Box>
          ))}
          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
        </Stack>
      </Box>
    </>
  );
}

export default function AgentDetail({ agentId, agentName, onBack }) {
  const [users, setUsers] = useState([]);
  const [difyUser, setDifyUser] = useState("");
  const [selectedConv, setSelectedConv] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);

  useEffect(() => {
    setLoadingUsers(true);
    api
      .getAgentUsers(agentId)
      .then((data) => {
        setUsers(data.users || []);
        if (data.users?.length > 0) setDifyUser(data.users[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));

    api
      .getPublicSettings()
      .then((data) => {
        if (data?.auto_refresh_interval_seconds) {
          setRefreshInterval(data.auto_refresh_interval_seconds);
        }
      })
      .catch(() => {});
  }, [agentId]);

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <IconButton onClick={onBack} size="small" sx={{ color: "#5B738B" }}>
          <ArrowBack sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
          Dashboard
        </Typography>
      </Stack>

      {/* Main Content: Left Conversations + Right Messages */}
      <Stack direction="row" spacing={2} sx={{ height: "calc(100vh - 140px)" }}>
        {/* Left: Conversation List */}
        <Paper
          variant="outlined"
          sx={{
            width: "35%",
            minWidth: 220,
            p: 2,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Conversations
            </Typography>
            <FormControl size="small" sx={{ width: 140, flexShrink: 0 }}>
              <Select
                value={difyUser}
                onChange={(e) => {
                  setDifyUser(e.target.value);
                  setSelectedConv(null);
                }}
                disabled={loadingUsers}
                displayEmpty
                sx={{ fontSize: "0.75rem" }}
              >
                {users.map((u) => (
                  <MenuItem key={u} value={u} sx={{ fontSize: "0.75rem" }}>
                    {u}
                  </MenuItem>
                ))}
                {users.length === 0 && (
                  <MenuItem disabled value="" sx={{ fontSize: "0.75rem" }}>
                    No users
                  </MenuItem>
                )}
              </Select>
            </FormControl>
            {loadingUsers && <CircularProgress size={14} />}
          </Stack>
          {difyUser ? (
            <ConversationList
              agentId={agentId}
              difyUser={difyUser}
              onSelect={setSelectedConv}
              selectedId={selectedConv}
            />
          ) : (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Typography variant="body2" color="text.secondary">
                No users found
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Right: Message List */}
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            p: 2,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Messages
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  size="small"
                  disabled={!selectedConv}
                />
              }
              label={
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                  Auto {refreshInterval}s
                </Typography>
              }
              sx={{ m: 0 }}
            />
          </Stack>
          {selectedConv && difyUser ? (
            <MessageList
              agentId={agentId}
              difyUser={difyUser}
              conversationId={selectedConv}
              autoRefreshInterval={autoRefresh ? refreshInterval : 0}
            />
          ) : (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Select a conversation to view messages
              </Typography>
            </Box>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
