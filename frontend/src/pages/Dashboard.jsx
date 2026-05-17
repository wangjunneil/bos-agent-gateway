import { useState, useEffect, useRef } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Paper,
} from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../api";

const REFRESH_INTERVAL = 30000;

const STATUS_COLORS = {
  online: "#188918",
  offline: "#5B738B",
  error: "#D9364B",
  unknown: "#E78B07",
};

const KPI_ACCENTS = {
  agents: "#188918",
  users: "#0070F2",
  requests: "#0070F2",
  errors: "#D9364B",
  latency: "#E78B07",
};

function KpiCard({ title, value, subtitle, accent }) {
  return (
    <Card
      sx={{
        flex: 1,
        minWidth: 170,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: accent,
        },
      }}
    >
      <CardContent sx={{ py: 2, px: 2.5, "&:last-child": { pb: 2 } }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: "#1D2D3E" }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ mt: 0.5, display: "block", color: "#7D8D9E" }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function errorRateColor(rate) {
  if (rate < 5) return "#188918";
  if (rate < 15) return "#E78B07";
  return "#D9364B";
}

function StatusDot({ status }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: STATUS_COLORS[status] || STATUS_COLORS.unknown,
        display: "inline-block",
        mr: 1,
        flexShrink: 0,
      }}
    />
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: "#FFFFFF",
        border: "1px solid #D5DADD",
        borderRadius: 4,
        px: 1.5,
        py: 1,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{payload[0].value} requests</Typography>
    </Box>
  );
}

export default function DashboardPage({ notify, onAgentClick }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const load = () => {
    api
      .getStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e) => {
        notify(e.message, "error");
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress sx={{ color: "#0070F2" }} />
      </Box>
    );
  }

  if (!stats) return null;

  const chartData = stats.invocations_per_hour.map((d) => ({
    hour: d.hour.slice(11, 16),
    count: d.count,
  }));

  return (
    <Box>
      {/* KPI Cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <KpiCard
          title="Agents Online"
          value={`${stats.online_agents} / ${stats.total_agents}`}
          subtitle={`${stats.offline_agents} offline, ${stats.error_agents} error`}
          accent={KPI_ACCENTS.agents}
        />
        <KpiCard
          title="Active Users"
          value={stats.active_users}
          subtitle={`${stats.total_users} total`}
          accent={KPI_ACCENTS.users}
        />
        <KpiCard
          title="Requests (24h)"
          value={stats.total_invocations_24h.toLocaleString()}
          subtitle={`${stats.total_invocations_7d.toLocaleString()} in 7d`}
          accent={KPI_ACCENTS.requests}
        />
        <KpiCard
          title="Error Rate (24h)"
          value={`${stats.error_rate_24h}%`}
          accent={errorRateColor(stats.error_rate_24h)}
        />
        <KpiCard
          title="Avg Latency (24h)"
          value={stats.avg_duration_ms_24h != null ? `${stats.avg_duration_ms_24h} ms` : "N/A"}
          accent={KPI_ACCENTS.latency}
        />
      </Stack>

      {/* Invocations Chart */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          Requests per Hour (last 24h)
        </Typography>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barCategoryGap="20%">
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0070F2" stopOpacity={1} />
                  <stop offset="100%" stopColor="#0070F2" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#EDEFF2" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11, fill: "#7D8D9E" }}
                axisLine={{ stroke: "#D5DADD" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#7D8D9E" }}
                axisLine={false}
                tickLine={false}
              />
              <ReTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,112,242,0.06)" }} />
              <Bar
                dataKey="count"
                fill="url(#barGrad)"
                radius={[4, 4, 0, 0]}
                animationDuration={600}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No invocations in the last 24 hours.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Top Agents Table */}
      <Paper sx={{ overflow: "hidden", border: "1px solid #D5DADD" }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <Typography variant="subtitle2">Top Agents (7d)</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Invocations</TableCell>
                <TableCell align="right">Avg Latency</TableCell>
                <TableCell align="right">Error Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats.top_agents.map((a) => {
                const errRate =
                  a.total_invocations > 0
                    ? ((a.error_count / a.total_invocations) * 100).toFixed(1)
                    : "0.0";
                return (
                  <TableRow key={a.agent_id}>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{
                          color: "#0070F2",
                          cursor: "pointer",
                          "&:hover": { textDecoration: "underline" },
                        }}
                        onClick={() => onAgentClick?.(a.agent_id, a.agent_name || a.agent_id)}
                      >
                        {a.agent_name || a.agent_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <StatusDot status={a.status} />
                        <Typography
                          variant="body2"
                          sx={{ color: STATUS_COLORS[a.status] || "#5B738B", fontWeight: 500 }}
                        >
                          {a.status}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {a.total_invocations.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {a.avg_duration_ms != null ? `${a.avg_duration_ms} ms` : "N/A"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ color: errorRateColor(parseFloat(errRate)) }}
                      >
                        {errRate}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {stats.top_agents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No agents yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
